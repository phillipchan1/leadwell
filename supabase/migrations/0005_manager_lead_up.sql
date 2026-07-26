-- Managers get the same leading-up operating manual as up-team people, so a
-- manager node opens a real profile instead of only a name/role edit form.

alter table public.managers
  add column if not exists lead_up jsonb;
