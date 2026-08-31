-- Sessions are keyed by meeting_id. person_id was the pre-0007 subject pointer
-- and the app stopped writing it once meetings owned the subject. Leaving the
-- column NOT NULL makes every session upsert fail with:
--
--   null value in column "person_id" of relation "one_on_ones"
--     violates not-null constraint
--
-- …which aborts the whole cloud sync. Drop the constraint. The client still
-- denormalizes meeting.subject_id into person_id for databases that have not
-- run this yet; once it has run, that write is harmless.

alter table public.one_on_ones
  alter column person_id drop not null;

-- Anything that somehow missed the 0007 backfill still gets a meeting_id.
update public.one_on_ones
   set meeting_id = 'm-' || person_id
 where meeting_id is null
   and person_id is not null;
