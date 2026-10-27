-- Polarch application schema for Neon.
-- Matches the live Supabase public tables after migrations 0001–0017,
-- without FKs to auth.users (Better Auth owns identity).

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id            uuid PRIMARY KEY,
  name               text NOT NULL DEFAULT '',
  title              text,
  photo              text,
  clifton_top5       jsonb NOT NULL DEFAULT '[]'::jsonb,
  enneagram          text,
  mbti               text,
  strengths          jsonb NOT NULL DEFAULT '[]'::jsonb,
  watch_outs         jsonb NOT NULL DEFAULT '[]'::jsonb,
  how_to_lead        text,
  custom_modalities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.capacities (
  user_id uuid NOT NULL,
  id      text NOT NULL,
  label   text NOT NULL,
  color   text NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.domains (
  user_id uuid NOT NULL,
  id      text NOT NULL,
  name    text NOT NULL,
  color   text NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.managers (
  user_id    uuid NOT NULL,
  id         text NOT NULL,
  name       text NOT NULL,
  role       text,
  domain_id  text,
  photo      text,
  no_meeting boolean,
  prayer     jsonb,
  lead_up    jsonb,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.teams (
  user_id     uuid NOT NULL,
  id          text NOT NULL,
  name        text NOT NULL,
  capacity_id text NOT NULL,
  domain_id   text,
  health      jsonb,
  prayer      jsonb,
  description text,
  purpose     text,
  cadence     text,
  last_met    text,
  no_meeting  boolean,
  sort_order  integer NOT NULL DEFAULT 0,
  direction   text,
  parent_id   text,
  leader_id   text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.people (
  user_id            uuid NOT NULL,
  id                 text NOT NULL,
  team_id            text,
  domain_id          text,
  name               text NOT NULL,
  role               text,
  photo              text,
  health             jsonb,
  prayer             jsonb,
  relationship_type  text,
  no_meeting         boolean,
  clifton_top5       jsonb NOT NULL DEFAULT '[]'::jsonb,
  enneagram          text,
  mbti               text,
  strengths          jsonb NOT NULL DEFAULT '[]'::jsonb,
  watch_outs         jsonb NOT NULL DEFAULT '[]'::jsonb,
  how_to_lead        text,
  custom_modalities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  lead_up            jsonb,
  cadence            text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.actions (
  user_id      uuid NOT NULL,
  id           text NOT NULL,
  person_id    text NOT NULL,
  text         text NOT NULL,
  done         boolean NOT NULL DEFAULT false,
  due_date     text,
  board_column text NOT NULL DEFAULT 'backlog',
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.one_on_ones (
  user_id          uuid NOT NULL,
  id               text NOT NULL,
  person_id        text,
  meeting_id       text,
  date             text NOT NULL,
  uncovered        text[],
  point            text,
  notes            text,
  next_date        text,
  transcript       text,
  series_date      date,
  occurrence_kind  text,
  PRIMARY KEY (user_id, id),
  CONSTRAINT one_on_ones_occurrence_kind_check
    CHECK (occurrence_kind IS NULL OR occurrence_kind IN ('extra', 'skipped'))
);

CREATE TABLE IF NOT EXISTS public.goals (
  user_id     uuid NOT NULL,
  id          text NOT NULL,
  person_id   text NOT NULL,
  title       text NOT NULL,
  progress    integer NOT NULL DEFAULT 0,
  target_date text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.notes (
  user_id   uuid NOT NULL,
  id        text NOT NULL,
  person_id text NOT NULL,
  date      text NOT NULL,
  body      text NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.wins (
  user_id   uuid NOT NULL,
  id        text NOT NULL,
  person_id text NOT NULL,
  date      text NOT NULL,
  text      text NOT NULL,
  impact    text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.team_actions (
  user_id  uuid NOT NULL,
  id       text NOT NULL,
  team_id  text NOT NULL,
  text     text NOT NULL,
  done     boolean NOT NULL DEFAULT false,
  due_date text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.team_goals (
  user_id     uuid NOT NULL,
  id          text NOT NULL,
  team_id     text NOT NULL,
  title       text NOT NULL,
  progress    integer NOT NULL DEFAULT 0,
  target_date text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.team_notes (
  user_id uuid NOT NULL,
  id      text NOT NULL,
  team_id text NOT NULL,
  date    text NOT NULL,
  body    text NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.chats (
  user_id  uuid NOT NULL,
  chat_key text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (user_id, chat_key)
);

CREATE TABLE IF NOT EXISTS public.node_positions (
  user_id uuid NOT NULL,
  node_id text NOT NULL,
  x       double precision NOT NULL,
  y       double precision NOT NULL,
  PRIMARY KEY (user_id, node_id)
);

CREATE TABLE IF NOT EXISTS public.meetings (
  user_id           uuid NOT NULL,
  id                text NOT NULL,
  subject_kind      text NOT NULL,
  subject_id        text NOT NULL,
  name              text,
  rhythm            text NOT NULL DEFAULT 'as_needed',
  floor_days        integer,
  next_date         text,
  anchor_weekday    integer,
  role              text,
  tracker_url       text,
  tracker_name      text,
  curriculum        jsonb,
  coverage_targets  jsonb,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.prayers (
  user_id      uuid NOT NULL,
  id           text NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('person', 'team', 'manager')),
  subject_id   text NOT NULL,
  date         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('burden', 'scripture')),
  text         text NOT NULL,
  answered_on  text,
  answer_note  text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.topics (
  user_id             uuid NOT NULL,
  id                  text NOT NULL,
  meeting_id          text,
  text                text NOT NULL,
  detail              text,
  tag_ids             text[] NOT NULL DEFAULT '{}',
  urgent              boolean NOT NULL DEFAULT false,
  points              jsonb,
  returned_on         text,
  returned_from_date  text,
  carried_from        text[] NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'covered', 'dropped')),
  lane                text NOT NULL DEFAULT 'backlog'
                      CHECK (lane IN ('backlog', 'parked')),
  session_id          text,
  carried             integer NOT NULL DEFAULT 0,
  due_date            text,
  created_on          text,
  closed_on           text,
  sort_order          integer NOT NULL DEFAULT 0,
  slot_id             text,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.tags (
  user_id    uuid NOT NULL,
  id         text NOT NULL,
  label      text NOT NULL,
  color      integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS public.follow_ups (
  user_id           uuid NOT NULL,
  id                text NOT NULL,
  subject_kind      text NOT NULL
                    CHECK (subject_kind IN ('person', 'team', 'manager')),
  subject_id        text NOT NULL,
  meeting_id        text,
  text              text NOT NULL,
  status            text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'done')),
  opened_on         text,
  closed_on         text,
  source_session_id text,
  sort_order        integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_people_user ON public.people (user_id);
CREATE INDEX IF NOT EXISTS idx_teams_user ON public.teams (user_id);
CREATE INDEX IF NOT EXISTS idx_actions_person ON public.actions (user_id, person_id);
CREATE INDEX IF NOT EXISTS idx_one_on_ones_person ON public.one_on_ones (user_id, person_id);
CREATE INDEX IF NOT EXISTS idx_one_on_ones_meeting ON public.one_on_ones (user_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_goals_person ON public.goals (user_id, person_id);
CREATE INDEX IF NOT EXISTS idx_notes_person ON public.notes (user_id, person_id);
CREATE INDEX IF NOT EXISTS idx_wins_person ON public.wins (user_id, person_id);
CREATE INDEX IF NOT EXISTS idx_team_actions_team ON public.team_actions (user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_goals_team ON public.team_goals (user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_team_notes_team ON public.team_notes (user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_meetings_subject ON public.meetings (user_id, subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_prayers_subject ON public.prayers (user_id, subject_kind, subject_id);
CREATE INDEX IF NOT EXISTS idx_topics_meeting ON public.topics (user_id, meeting_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_subject ON public.follow_ups (user_id, subject_id);
