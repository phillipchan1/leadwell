-- Shared ideas: on a shared meeting, an idea that isn't on a week yet can be
-- shown on the other chair's page too. Placing a topic on a week already
-- shares it; this is for the ones still in the tray. A guest's own ideas are
-- shared by being theirs (raised_by), so this flag is the owner's choice.
BEGIN;

ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

COMMIT;
