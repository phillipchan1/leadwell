-- Topics: what I need to talk about, on the board of one meeting.
--
-- This replaces `actions` as the topic board. The old table keyed topics by
-- `person_id`, which was really a subject id — managers rode on it too. That
-- left a staff meeting's topics with nowhere to live and teams with no board
-- at all, and it made "this_1on1" the only plan you could express: a single
-- queue meaning "the next one", never "budget on the 17th, hiring on the 24th".
--
-- Keying by meeting fixes both. `session_id` is the scaffold — a topic pointed
-- at a specific occurrence — and falls back to `lane` (the running list) when
-- it isn't slotted yet.
--
-- Nothing here records "loose". A topic is loose when it's still open and the
-- occurrence it sits in has already happened, which the client derives from
-- the session date. Storing it would just be a second copy that goes stale
-- overnight, every night.

create table if not exists public.topics (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  meeting_id text not null,
  text       text not null,
  detail     text,
  status     text not null default 'open'
             check (status in ('open', 'covered', 'dropped')),
  lane       text not null default 'backlog'
             check (lane in ('backlog', 'parked')),
  session_id text,
  -- Times it's been pushed to a later meeting. Kept as a count and not a log:
  -- the number is the signal, and "pushed 3x" is the whole message.
  carried    int not null default 0,
  due_date   text,
  created_on text,
  closed_on  text,
  sort_order int not null default 0,
  primary key (user_id, id)
);

create index if not exists idx_topics_meeting
  on public.topics (user_id, meeting_id);

alter table public.topics enable row level security;
drop policy if exists topics_owner on public.topics;
create policy topics_owner on public.topics
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── Backfill ──────────────────────────────────────────────────────────────
-- Every existing action becomes a topic on the meeting for its subject.
--
-- A subject can now have several meetings, so the join has to pick one or it
-- would multiply rows: oldest-id-wins, which is the first meeting that was
-- tracked and therefore the one these topics were raised against.

-- Subjects that have topics but no meeting would leave those topics orphaned
-- with no board to render them on. Give them one, as-needed — keeping a list
-- of things to raise with someone is already a decision that there's
-- something to raise, and `as_needed` promises no rhythm and so nags nobody.
insert into public.topics (
  user_id, id, meeting_id, text, status, lane,
  carried, due_date, created_on, closed_on, sort_order
)
select
  a.user_id,
  a.id,
  m.id,
  a.text,
  case when a.board_column = 'done' or a.done then 'covered' else 'open' end,
  case when a.board_column = 'parking' then 'parked' else 'backlog' end,
  0,
  a.due_date,
  null,
  null,
  0
from public.actions a
join lateral (
  select mm.id
  from public.meetings mm
  where mm.user_id = a.user_id
    and mm.subject_id = a.person_id
    and mm.subject_kind in ('person', 'manager')
  order by mm.id
  limit 1
) m on true
on conflict (user_id, id) do nothing;

-- Now the orphans: an as-needed meeting per subject that had actions and no
-- meeting, then their topics onto it. The meeting id is derived from the
-- subject id so re-running this is idempotent.
insert into public.meetings (user_id, id, subject_kind, subject_id, rhythm)
select distinct
  a.user_id,
  'mt-' || a.person_id,
  case when p.id is not null then 'person' else 'manager' end,
  a.person_id,
  'as_needed'
from public.actions a
left join public.people   p on p.user_id = a.user_id and p.id = a.person_id
left join public.managers g on g.user_id = a.user_id and g.id = a.person_id
where (p.id is not null or g.id is not null)
  and not exists (
    select 1 from public.meetings mm
    where mm.user_id = a.user_id
      and mm.subject_id = a.person_id
      and mm.subject_kind in ('person', 'manager')
  )
on conflict (user_id, id) do nothing;

insert into public.topics (
  user_id, id, meeting_id, text, status, lane,
  carried, due_date, created_on, closed_on, sort_order
)
select
  a.user_id,
  a.id,
  'mt-' || a.person_id,
  a.text,
  case when a.board_column = 'done' or a.done then 'covered' else 'open' end,
  case when a.board_column = 'parking' then 'parked' else 'backlog' end,
  0,
  a.due_date,
  null,
  null,
  0
from public.actions a
where exists (
    select 1 from public.meetings mm
    where mm.user_id = a.user_id
      and mm.id = 'mt-' || a.person_id
  )
  -- Skip anything the first pass already placed on a real meeting.
  and not exists (
    select 1 from public.topics t
    where t.user_id = a.user_id and t.id = a.id
  )
on conflict (user_id, id) do nothing;

-- `this_1on1` items land in the backlog. The migration deliberately doesn't
-- invent sessions to slot them into — a made-up date is worse than an empty
-- column, and the planner offers to place them the first time it's opened.
--
-- `public.actions` is intentionally left in place. Nothing reads it after this
-- migration; it stays one release as a rollback net and is dropped later.
