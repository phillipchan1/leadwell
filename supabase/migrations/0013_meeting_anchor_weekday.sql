-- Anchor weekday for rhythm projection (0 = Sunday … 6 = Saturday).
alter table public.meetings
  add column if not exists anchor_weekday int;
