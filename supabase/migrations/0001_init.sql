-- LeadWell cloud schema.
--
-- One row-per-entity, normalized model. Every table is scoped to the owning
-- user via a `user_id` column and protected by row-level security so a signed-in
-- user can only ever read or write their own data.
--
-- IDs mirror the app's own short string ids (e.g. "team-frontier", "p-sarah",
-- or an 8-char nanoid), so the client keeps generating ids exactly as before.
-- Primary keys are (user_id, id) — ids are only unique within a user.
--
-- Reserved-word note: the app fields `order` and `column` map to `sort_order`
-- and `board_column` here to avoid quoting headaches. The repo layer maps back.

-- ---------------------------------------------------------------------------
-- profiles: the single "me" record per user (also our "does this user exist
-- yet?" sentinel — no profile row means a fresh user we need to seed).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  title      text,
  photo      text,
  updated_at timestamptz not null default now()
);

-- capacities (Manager / Leader / Influence / Report up) — seeded per user.
create table if not exists public.capacities (
  user_id uuid not null references auth.users (id) on delete cascade,
  id      text not null,
  label   text not null,
  color   text not null,
  primary key (user_id, id)
);

-- domains (life areas: Day job, Church, Family…).
create table if not exists public.domains (
  user_id uuid not null references auth.users (id) on delete cascade,
  id      text not null,
  name    text not null,
  color   text not null,
  primary key (user_id, id)
);

-- managers (people I report to, rendered above my node).
create table if not exists public.managers (
  user_id   uuid not null references auth.users (id) on delete cascade,
  id        text not null,
  name      text not null,
  role      text,
  domain_id text,
  photo     text,
  primary key (user_id, id)
);

-- teams.
create table if not exists public.teams (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  name        text not null,
  capacity_id text not null,
  domain_id   text,
  description text,
  purpose     text,
  cadence     text,
  last_met    text,
  sort_order  integer not null default 0,
  direction   text,
  parent_id   text,
  primary key (user_id, id)
);

-- people (assessments flattened into columns; strengths/watch-outs as jsonb arrays).
create table if not exists public.people (
  user_id           uuid not null references auth.users (id) on delete cascade,
  id                text not null,
  team_id           text not null,
  name              text not null,
  role              text,
  photo             text,
  relationship_type text,
  clifton_top5      jsonb not null default '[]'::jsonb,
  enneagram         text,
  mbti              text,
  strengths         jsonb not null default '[]'::jsonb,
  watch_outs        jsonb not null default '[]'::jsonb,
  how_to_lead       text,
  primary key (user_id, id)
);

-- per-person records ---------------------------------------------------------
create table if not exists public.actions (
  user_id      uuid not null references auth.users (id) on delete cascade,
  id           text not null,
  person_id    text not null,
  text         text not null,
  done         boolean not null default false,
  due_date     text,
  board_column text not null default 'backlog',
  primary key (user_id, id)
);

create table if not exists public.one_on_ones (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null,
  person_id  text not null,
  date       text not null,
  notes      text,
  next_date  text,
  transcript text,
  primary key (user_id, id)
);

create table if not exists public.goals (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  person_id   text not null,
  title       text not null,
  progress    integer not null default 0,
  target_date text,
  primary key (user_id, id)
);

create table if not exists public.notes (
  user_id   uuid not null references auth.users (id) on delete cascade,
  id        text not null,
  person_id text not null,
  date      text not null,
  body      text not null,
  primary key (user_id, id)
);

-- team-level records ---------------------------------------------------------
create table if not exists public.team_actions (
  user_id  uuid not null references auth.users (id) on delete cascade,
  id       text not null,
  team_id  text not null,
  text     text not null,
  done     boolean not null default false,
  due_date text,
  primary key (user_id, id)
);

create table if not exists public.team_goals (
  user_id     uuid not null references auth.users (id) on delete cascade,
  id          text not null,
  team_id     text not null,
  title       text not null,
  progress    integer not null default 0,
  target_date text,
  primary key (user_id, id)
);

create table if not exists public.team_notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id      text not null,
  team_id text not null,
  date    text not null,
  body    text not null,
  primary key (user_id, id)
);

-- chats: one row per conversation key ("<personId>", "team:<id>", or "org").
-- Messages kept as a jsonb array — the app always reads/writes the whole thread.
create table if not exists public.chats (
  user_id  uuid not null references auth.users (id) on delete cascade,
  chat_key text not null,
  messages jsonb not null default '[]'::jsonb,
  primary key (user_id, chat_key)
);

-- canvas node positions ("me", team ids, "mgr:<id>").
create table if not exists public.node_positions (
  user_id uuid not null references auth.users (id) on delete cascade,
  node_id text not null,
  x       double precision not null,
  y       double precision not null,
  primary key (user_id, node_id)
);

-- Helpful lookup indexes (child records fetched by their parent).
create index if not exists idx_people_user       on public.people (user_id);
create index if not exists idx_teams_user         on public.teams (user_id);
create index if not exists idx_actions_person     on public.actions (user_id, person_id);
create index if not exists idx_one_on_ones_person on public.one_on_ones (user_id, person_id);
create index if not exists idx_goals_person       on public.goals (user_id, person_id);
create index if not exists idx_notes_person       on public.notes (user_id, person_id);
create index if not exists idx_team_actions_team  on public.team_actions (user_id, team_id);
create index if not exists idx_team_goals_team    on public.team_goals (user_id, team_id);
create index if not exists idx_team_notes_team    on public.team_notes (user_id, team_id);

-- ---------------------------------------------------------------------------
-- Row-level security: every table is private to its owner. Enable RLS and add
-- one policy per table granting full access only when user_id = auth.uid().
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'profiles','capacities','domains','managers','teams','people',
    'actions','one_on_ones','goals','notes',
    'team_actions','team_goals','team_notes','chats','node_positions'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    -- Drop first so the migration is safely re-runnable.
    execute format('drop policy if exists %I on public.%I;', t || '_owner', t);
    execute format(
      'create policy %I on public.%I
         for all
         to authenticated
         using (user_id = auth.uid())
         with check (user_id = auth.uid());',
      t || '_owner', t
    );
  end loop;
end $$;
