-- Curriculum: a meeting's standing skeleton, and which slot a topic fills.
--
-- A staff meeting is a repeating shape (Prayer, Training, Discussion), not a
-- pile of undated cards. `meetings.curriculum` is that shape — an ordered list
-- of named slots the planner renders every week, empty or filled. `topics.slot_id`
-- points a card at one of them.
--
-- Empty / null curriculum means the board stays an ungrouped list. Existing
-- meetings are not backfilled; defaults apply when a meeting is created.

alter table public.meetings
  add column if not exists curriculum jsonb;

alter table public.topics
  add column if not exists slot_id text;
