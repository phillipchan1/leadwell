-- External trackers on a tracked meeting.
--
-- Some relationships arrive with a system already: a Notion page for one
-- report, a Word doc in OneDrive for another. Breaking a tracker both people
-- trust is a bad trade, so the meeting can point at where the notes actually
-- live and LeadWell keeps the parts a doc can't do — the rhythm, the topic
-- board, the readiness clock.
--
-- It rides on the meeting rather than the person because the meeting is the
-- unit everywhere else: a team's staff meeting and a manager check-in can each
-- have their own home for notes, and the 1:1s with a team's members are a
-- different thing again.
--
-- Not necessarily a URL. "It's in Word" often means a path or a filename,
-- which is still worth recording; the app linkifies only known-safe schemes
-- (src/lib/tracker.ts) and renders the rest as plain text.

alter table public.meetings
  add column if not exists tracker_url  text,
  -- Optional override for the service name derived from the link.
  add column if not exists tracker_name text;
