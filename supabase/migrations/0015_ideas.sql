-- Ideas: tags, carry-back, and depth.
--
-- Three changes, one migration.
--
-- 1. **Tags become real.** `meetings.curriculum` conflated two things: the
--    standing shape of an occurrence ("Training goes here, every week") and the
--    label on a card ("this is a training topic"). One is per-meeting structure,
--    the other is a workspace-wide vocabulary you want to filter and organise by
--    across every meeting at once. Splitting them is what makes a backlog
--    organisable. The curriculum slot survives unchanged as the structure; a new
--    `tags` table carries the vocabulary, and a slot points at a tag so anything
--    dropped into it gets labelled without anyone tagging by hand.
--
-- 2. **Unfinished work comes back.** When an occurrence passes with topics still
--    unchecked, they return to the backlog annotated rather than silently riding
--    to next week. `returned_on` / `returned_from_date` are what the card shows,
--    and `one_on_ones.uncovered` is the ledger that keeps the passed week's
--    write-up honest.
--
-- 3. **A topic can hold more than its title.** `points` is the scaffolding under
--    an idea. `detail` already exists and becomes the notes field — no new column.
--
-- Additive throughout: new columns, new tables, one nullability relaxation.
-- Nothing is dropped and nothing is rewritten destructively.

-- ── Tags ──────────────────────────────────────────────────────────────────
-- Workspace-wide, not per-meeting. That is the whole point: "Training" means
-- the same thing on the staff meeting and in a 1:1, which is what lets one
-- board group every loose topic by what it is about.
create table if not exists public.tags (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  label      text not null,
  -- Index into the client's palette, not a hex value. The palette is a design
  -- decision that should be changeable without a data migration.
  color      int  not null default 0,
  sort_order int  not null default 0,
  primary key (user_id, id)
);

alter table public.tags enable row level security;
drop policy if exists tags_owner on public.tags;
create policy tags_owner on public.tags
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Topics ────────────────────────────────────────────────────────────────
alter table public.topics
  -- Several tags per topic. An array rather than a join table: the whole point
  -- is that the client holds every topic in memory and filters locally, and a
  -- join table would buy referential integrity we'd have to re-denormalise on
  -- every load anyway.
  add column if not exists tag_ids            text[] not null default '{}',
  add column if not exists urgent             boolean not null default false,
  -- [{ id, text, done }] — sub-points, ordered by position in the array.
  add column if not exists points             jsonb,
  -- Set when an occurrence passed with this still open.
  add column if not exists returned_on        text,
  add column if not exists returned_from_date text,
  -- The occurrences it has been pushed out of, in order. `carried` is still the
  -- count and still what the card shows; this is the trail behind it.
  add column if not exists carried_from       text[] not null default '{}';

-- A topic with no meeting is now legal: it is something you want to raise
-- before you have decided where. That state used to be unrepresentable, so
-- capture had to begin with a filing decision.
alter table public.topics
  alter column meeting_id drop not null;

create index if not exists idx_topics_unscheduled
  on public.topics (user_id, status)
  where session_id is null;

-- ── Sessions ──────────────────────────────────────────────────────────────
-- What was still open when the day passed. Kept as text, not ids: the topics
-- move on, and the point of the ledger is that this week's write-up still reads
-- truthfully a year later.
alter table public.one_on_ones
  add column if not exists uncovered text[];

-- ── Meetings ──────────────────────────────────────────────────────────────
-- [{ tagId, everyNOccurrences }] — "I want Training at least 1 in every 4".
-- Separate from the curriculum because coverage is an intention about the
-- future and the curriculum is the shape of the room.
alter table public.meetings
  add column if not exists coverage_targets jsonb;

-- ── Follow-ups ────────────────────────────────────────────────────────────
-- Not a topic. Topics are things to talk about; follow-ups are commitments that
-- outlive the conversation, so they belong to the subject rather than to any one
-- occurrence and open the next one as "Since last time".
create table if not exists public.follow_ups (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  subject_kind      text not null
                    check (subject_kind in ('person', 'team', 'manager')),
  subject_id        text not null,
  meeting_id        text,
  text              text not null,
  status            text not null default 'open'
                    check (status in ('open', 'done')),
  opened_on         text,
  closed_on         text,
  source_session_id text,
  sort_order        int not null default 0,
  primary key (user_id, id)
);

create index if not exists idx_follow_ups_subject
  on public.follow_ups (user_id, subject_id);

alter table public.follow_ups enable row level security;
drop policy if exists follow_ups_owner on public.follow_ups;
create policy follow_ups_owner on public.follow_ups
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Backfill ──────────────────────────────────────────────────────────────
-- The existing curriculum labels are already the user's vocabulary — they wrote
-- "Training" and "Prayer" themselves. Promote the distinct set to tags rather
-- than starting anyone from an empty palette.
--
-- Ids are derived from the label so every step below is idempotent and so two
-- meetings that both say "Prayer" converge on one tag.
insert into public.tags (user_id, id, label, color, sort_order)
select
  s.user_id,
  'tag-' || md5(lower(s.label)),
  s.label,
  ((row_number() over (partition by s.user_id order by lower(s.label))) - 1) % 6,
  row_number() over (partition by s.user_id order by lower(s.label))
from (
  select distinct m.user_id, trim(slot->>'label') as label
  from public.meetings m,
       lateral jsonb_array_elements(coalesce(m.curriculum, '[]'::jsonb)) slot
  where coalesce(trim(slot->>'label'), '') <> ''
) s
on conflict (user_id, id) do nothing;

-- A topic filling a curriculum slot was already saying "this is a training
-- topic". Carry that across so the new board is populated on first open rather
-- than presenting an untagged pile.
update public.topics t
set tag_ids = array['tag-' || md5(lower(slot.label))]
from (
  select
    m.user_id,
    m.id                     as meeting_id,
    e.s->>'id'               as slot_id,
    trim(e.s->>'label')      as label
  from public.meetings m,
       lateral jsonb_array_elements(coalesce(m.curriculum, '[]'::jsonb)) e(s)
) slot
where t.user_id     = slot.user_id
  and t.meeting_id  = slot.meeting_id
  and t.slot_id     = slot.slot_id
  and coalesce(slot.label, '') <> ''
  and t.tag_ids = '{}';

-- Point each slot at its tag, so anything dropped into it from now on is
-- labelled automatically. This is what keeps coverage trustworthy without
-- asking anyone to tag by hand.
update public.meetings m
set curriculum = sub.next
from (
  select
    mm.user_id,
    mm.id,
    jsonb_agg(
      case
        when coalesce(trim(e.s->>'label'), '') = '' then e.s
        else e.s || jsonb_build_object(
          'tagId', 'tag-' || md5(lower(trim(e.s->>'label')))
        )
      end
      order by e.ord
    ) as next
  from public.meetings mm,
       lateral jsonb_array_elements(mm.curriculum) with ordinality e(s, ord)
  where mm.curriculum is not null
    and jsonb_typeof(mm.curriculum) = 'array'
  group by mm.user_id, mm.id
) sub
where m.user_id = sub.user_id
  and m.id      = sub.id;

-- A default coverage target per slot: "at least once every 4 occurrences".
-- Deliberately loose — it should read as a gentle check, not a quota anyone has
-- to satisfy on week one. Only set where nothing has been chosen yet.
update public.meetings m
set coverage_targets = sub.targets
from (
  select
    mm.user_id,
    mm.id,
    jsonb_agg(distinct jsonb_build_object(
      'tagId', 'tag-' || md5(lower(trim(e.s->>'label'))),
      'everyNOccurrences', 4
    )) as targets
  from public.meetings mm,
       lateral jsonb_array_elements(mm.curriculum) e(s)
  where mm.curriculum is not null
    and jsonb_typeof(mm.curriculum) = 'array'
    and coalesce(trim(e.s->>'label'), '') <> ''
  group by mm.user_id, mm.id
) sub
where m.user_id = sub.user_id
  and m.id      = sub.id
  and m.coverage_targets is null;
