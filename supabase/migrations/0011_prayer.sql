-- Prayer: who I'm carrying, and the log of what I'm carrying for them.
--
-- The mark rides on the subject as one jsonb value, the same shape `health`
-- and `lead_up` already use: the client always reads and writes it whole
-- ({ since, focus, lastPrayedOn, times }), and adding a field to it should
-- never cost another migration.
--
-- Null = not carrying them, which is the default and not a gap — a leader
-- who is praying for four people out of forty is telling the truth, and the
-- canvas scan is built to show exactly that.
--
-- Managers get the column too. Praying for the person you report to is not a
-- different activity from praying for the person who reports to you.

alter table public.teams    add column if not exists prayer jsonb;
alter table public.people   add column if not exists prayer jsonb;
alter table public.managers add column if not exists prayer jsonb;

-- The log. Keyed by (subject_kind, subject_id) rather than a foreign key, the
-- same seam notes and wins ride on, so all three subject kinds share it.
--
-- `answered_on` is why this is a table and not a text column: an entry is
-- never deleted when it's done, it's answered — and the answer is the part
-- worth re-reading a year later.
create table if not exists public.prayers (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null,
  subject_kind text not null check (subject_kind in ('person', 'team', 'manager')),
  subject_id   text not null,
  date         text not null,
  kind         text not null check (kind in ('burden', 'scripture')),
  text         text not null,
  answered_on  text,
  answer_note  text,
  primary key (user_id, id)
);

create index if not exists idx_prayers_subject
  on public.prayers (user_id, subject_kind, subject_id);

alter table public.prayers enable row level security;
drop policy if exists prayers_owner on public.prayers;
create policy prayers_owner on public.prayers
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
