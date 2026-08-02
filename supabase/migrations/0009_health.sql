-- Health: my own read on how a team or a person is doing.
--
-- One jsonb blob per row rather than three columns, matching how `lead_up` is
-- stored: it's a single small value object the client always reads and writes
-- whole ({ level, note, ratedOn }), and adding a level or a field to it should
-- never need another migration.
--
-- Null = not rated yet, which is a meaningful state: it's the gap the canvas
-- scan and the table's "Not rated" filter are for.

alter table public.teams  add column if not exists health jsonb;
alter table public.people add column if not exists health jsonb;
