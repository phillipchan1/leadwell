-- A book arc can carry its real cover: an Open Library image URL picked when
-- the arc is started. Optional; an arc without one keeps its typographic cover.
BEGIN;

ALTER TABLE public.arcs ADD COLUMN IF NOT EXISTS cover_url text;

COMMIT;
