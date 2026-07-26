-- Direct reports: a person I manage who isn't part of any team I lead.
--
-- Until now the only thing that could hang under me was a team, so someone
-- like a director who runs three teams I don't run had nowhere to live. Two
-- columns fix that: a person may have no team, and a team may be led by one of
-- those people instead of by me (in which case it hangs under them, and its
-- meetings stay out of my readiness unless I opt in).

alter table public.people
  alter column team_id drop not null;

alter table public.people
  add column if not exists domain_id text;

alter table public.teams
  add column if not exists leader_id text;
