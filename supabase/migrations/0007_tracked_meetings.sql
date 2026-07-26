-- Tracked meetings.
--
-- Readiness used to hang off each subject in its own way (Person.cadence, and
-- nothing at all for teams or managers). This collapses it: a *meeting* is the
-- unit you opt into tracking, and it points at whatever it's about — a person
-- (1:1), a team (staff meeting, practice session), or a manager (check-in).
--
-- `one_on_ones` keeps its name and its rows; it is now the sessions table —
-- one row per occurrence of a tracked meeting.
--
-- Three states per subject, and the middle one is the point: a subject with a
-- meeting is tracked, one with no_meeting = true is a decision, and one with
-- neither is undecided (the only thing worth counting).

create table if not exists public.meetings (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null,
  -- 'person' | 'team' | 'manager'
  subject_kind text not null,
  subject_id   text not null,
  -- Optional label; falls back to the subject's own name.
  name         text,
  -- 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'as_needed'
  rhythm       text not null default 'as_needed',
  -- as_needed only: nudge once it's been this long ("tolerance", not rhythm").
  floor_days   int,
  -- An explicit booking always beats the projected date.
  next_date    text,
  -- 'convene' | 'attend' — drives which extra checks apply.
  role         text,
  primary key (user_id, id)
);

create index if not exists idx_meetings_subject
  on public.meetings (user_id, subject_kind, subject_id);

-- Sessions belong to a meeting, and carry why we met *this* time.
alter table public.one_on_ones
  add column if not exists meeting_id text,
  add column if not exists point text;

create index if not exists idx_one_on_ones_meeting
  on public.one_on_ones (user_id, meeting_id);

-- The explicit "I don't sit down with them" decision, per subject.
alter table public.people   add column if not exists no_meeting boolean;
alter table public.teams    add column if not exists no_meeting boolean;
alter table public.managers add column if not exists no_meeting boolean;

-- ---------------------------------------------------------------------------
-- Backfill. Deterministic ids ('m-' || subject id) keep this re-runnable.
-- ---------------------------------------------------------------------------

-- Anyone with a 1:1 rhythm, or any 1:1 history, gets a tracked meeting.
-- A person with history but no rhythm lands on 'as_needed' with no floor:
-- tracked, so the notes stay reachable, but not measured until you say so.
insert into public.meetings (user_id, id, subject_kind, subject_id, rhythm)
select p.user_id,
       'm-' || p.id,
       'person',
       p.id,
       case
         when p.cadence in ('weekly', 'biweekly', 'monthly', 'quarterly')
           then p.cadence
         else 'as_needed'
       end
from public.people p
where (p.cadence is not null and p.cadence <> 'none')
   or exists (
     select 1 from public.one_on_ones o
     where o.user_id = p.user_id and o.person_id = p.id
   )
on conflict (user_id, id) do nothing;

update public.one_on_ones o
   set meeting_id = 'm-' || o.person_id
 where o.meeting_id is null
   and o.person_id is not null;

-- cadence = 'none' was already the "deliberately no 1:1s" decision.
update public.people set no_meeting = true where cadence = 'none';

-- `people.cadence` is retained but no longer read by the app — the rhythm now
-- lives on the meeting. Left in place so nothing is lost if this needs undoing.

-- ---------------------------------------------------------------------------
-- Row-level security for the new table, matching every other table.
-- ---------------------------------------------------------------------------
alter table public.meetings enable row level security;
drop policy if exists meetings_owner on public.meetings;
create policy meetings_owner on public.meetings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
