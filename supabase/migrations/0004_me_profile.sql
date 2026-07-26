-- Self-assessment fields on the signed-in leader's profile.

alter table public.profiles
  add column if not exists clifton_top5 jsonb not null default '[]'::jsonb,
  add column if not exists enneagram text,
  add column if not exists mbti text,
  add column if not exists strengths jsonb not null default '[]'::jsonb,
  add column if not exists watch_outs jsonb not null default '[]'::jsonb,
  add column if not exists how_to_lead text,
  add column if not exists custom_modalities jsonb not null default '[]'::jsonb;
