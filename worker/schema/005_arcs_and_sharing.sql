-- Arcs (something worked through across a meeting's occurrences) and shared
-- meetings (the other chair sees the agenda and can add to it).
BEGIN;

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS raised_by text;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
ALTER TABLE public.follow_ups ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE IF NOT EXISTS public.arcs (
  user_id     uuid NOT NULL,
  id          text NOT NULL,
  meeting_id  text NOT NULL,
  title       text NOT NULL,
  author      text,
  cover       integer,
  slot_id     text,
  pace_every  integer NOT NULL DEFAULT 1 CHECK (pace_every >= 1),
  starts_on   text NOT NULL,
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'paused', 'done')),
  steps       jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed_in   text[] NOT NULL DEFAULT '{}',
  created_on  text,
  closed_on   text,
  sort_order  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_arcs_meeting ON public.arcs (user_id, meeting_id);

CREATE TABLE IF NOT EXISTS public.arc_takeaways (
  user_id    uuid NOT NULL,
  id         text NOT NULL,
  arc_id     text NOT NULL,
  step_id    text NOT NULL,
  by_member  text NOT NULL,
  text       text NOT NULL,
  taken_on   text,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_arc_takeaways_arc ON public.arc_takeaways (user_id, arc_id);

CREATE TABLE IF NOT EXISTS public.shared_notes (
  user_id     uuid NOT NULL,
  id          text NOT NULL,
  meeting_id  text NOT NULL,
  session_id  text NOT NULL,
  by_member   text NOT NULL,
  body        text NOT NULL DEFAULT '',
  updated_on  text,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_shared_notes_meeting ON public.shared_notes (user_id, meeting_id);

-- Who else sits at a meeting. Never part of /api/data: the owner reads it
-- through /api/shares, and a guest is resolved from `token` alone.
CREATE TABLE IF NOT EXISTS public.meeting_members (
  id            text PRIMARY KEY,
  user_id       uuid NOT NULL,
  meeting_id    text NOT NULL,
  email         text NOT NULL,
  name          text,
  person_id     text,
  token         text NOT NULL UNIQUE,
  invited_on    timestamptz NOT NULL DEFAULT now(),
  joined_on     timestamptz,
  last_seen_on  timestamptz,
  revoked_on    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_meeting_members_owner ON public.meeting_members (user_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_members_email ON public.meeting_members (lower(email));

COMMIT;
