-- 1:1 rhythm per person. Drives readiness: the cadence projects the next 1:1
-- from the last one, so prep is measurable without every meeting being booked.
-- null = not set yet (person isn't measured); 'none' = deliberately no 1:1s.

alter table public.people
  add column if not exists cadence text;
