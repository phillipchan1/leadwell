-- A meeting occurrence can stand in for a different date in its series.
--
--   series_date      the rhythm date this occurrence replaces. Set when one
--                    meeting is moved ("just this one") or skipped, so the
--                    projection doesn't also draw the original date.
--   occurrence_kind  null = a normal occurrence; 'extra' = a one-off added
--                    outside the rhythm; 'skipped' = this week isn't happening.
alter table public.one_on_ones
  add column if not exists series_date date,
  add column if not exists occurrence_kind text
    check (occurrence_kind is null or occurrence_kind in ('extra', 'skipped'));
