-- Leading-up operating manual (on people) + wins ledger.

alter table public.people
  add column if not exists lead_up jsonb;

create table if not exists public.wins (
  user_id   uuid not null references auth.users (id) on delete cascade,
  id        text not null,
  person_id text not null,
  date      text not null,
  text      text not null,
  impact    text,
  primary key (user_id, id)
);

create index if not exists idx_wins_person on public.wins (user_id, person_id);

alter table public.wins enable row level security;
drop policy if exists wins_owner on public.wins;
create policy wins_owner on public.wins
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
