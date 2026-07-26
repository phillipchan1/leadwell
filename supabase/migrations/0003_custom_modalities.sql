-- Open / custom assessment modalities on people (Working Genius, DISC, etc.).

alter table public.people
  add column if not exists custom_modalities jsonb not null default '[]'::jsonb;
