# LeadWell

A web app that shows the teams and people you lead as a visual org-chart tree,
with an assessment-based profile (CliftonStrengths, Enneagram, MBTI) and an AI
coach for each person. **Cloud-backed** by Supabase with **Google sign-in**, so
your data syncs across every device.

## Setup

This app needs a Supabase project (free tier is plenty) and Google OAuth. The
full walkthrough — create project, run the SQL migration, enable Google
sign-in, deploy the AI function — is in **[SETUP.md](SETUP.md)**. It's a
one-time ~15-minute setup.

Once configured:

```sh
npm install
npm run dev
```

Open http://localhost:5173 and **Continue with Google**. A brand-new account is
seeded with starter data (teams + people, a mix of assessed and unassessed).
If you used the old localStorage version in the same browser, that data is
imported automatically on first sign-in.

## Architecture

- **Auth**: Supabase Auth + Google OAuth. Each user gets a private, row-level-
  security-isolated workspace.
- **Data**: normalized Postgres tables (one per entity), all scoped to the
  signed-in user. The Zustand store still works optimistically in memory; a thin
  repository layer ([`src/lib/repo.ts`](src/lib/repo.ts)) syncs changed
  collections to Supabase (debounced) and hydrates on login.
- **AI**: a Supabase Edge Function ([`supabase/functions/anthropic`](supabase/functions/anthropic/index.ts))
  holds the Anthropic key server-side and streams Claude's replies — no key ever
  touches the browser. Powers the per-person AI coach, the header **Ask AI**
  chat, the Overview brief, and 1:1 note structuring (model: `claude-sonnet-5`).

## Stack & structure

React + TypeScript + Vite · Tailwind CSS 4 (light/dark) · Zustand · React Flow (`@xyflow/react`) · Supabase (`@supabase/supabase-js`).

The org tree is an **infinite canvas** (React Flow): pan, zoom (scroll/pinch), a minimap, and freely draggable team cards whose positions persist. Teams live on one visual rank no matter how many there are — no wrapping into rows that would falsely read as another tier. Teams marked **"Above me — I report up"** render above your node with the connector flowing down into you; their people get full profiles and the AI coach frames them as *leading up*. Card layers toggle independently by keystroke — **P** people · **A** action · **M** mandate · **G** gift mix · **D** detail · **R** readiness — and compose with the domain filter (`1`–`9`). **Reset layout** snaps everything back to the automatic arrangement. Reassigning a person between teams is `movePerson(personId, teamId)` in the store (drag-reorg seam).

```
src/
  types.ts               # data model
  data/
    frameworks.ts        # THEME_DOMAIN (all 34), domain colors, Enneagram, MBTI
    seed.ts              # seed teams/people/goals/notes
  lib/
    storage.ts           # persistence seam (localStorage now, API later)
    derive.ts            # coverage, domain counts, blind spots, derived "read"
    ai.ts                # Anthropic client, system prompts, streaming chat
  store/useStore.ts      # Zustand store; persists on every data change
  components/
    App shell: App.tsx (header, tabs, Ask AI)
    Tree: OrgTree.tsx, StatsBar.tsx, StrengthsDonut.tsx, Avatar.tsx
    Profile: PersonProfile.tsx, AssessmentEditor.tsx, AICoach.tsx
    Other tabs: Overview.tsx, PeopleTable.tsx
    forms.tsx, ui.tsx    # modals + small primitives
```

## Data model

```ts
type Capacity = { id: string; label: string; color: string };   // Manager (teal) / Leader (purple) / Influence (amber) / Report up (blue)
type Team     = { id: string; name: string; capacityId: string; description?: string; order: number;
                  direction?: "up" | "down" };                  // "up" = I report to this team; renders above me

type Domain = "Executing" | "Influencing" | "Relationship Building" | "Strategic Thinking";
type Assessments = { cliftonTop5?: string[]; enneagram?: string; mbti?: string };

type Cadence  = "weekly" | "biweekly" | "monthly" | "quarterly" | "none";

type Person = {
  id: string; teamId: string; name: string; role?: string;
  photo?: string;                       // base64 data URL (downscaled on upload)
  relationshipType?: string;
  cadence?: Cadence;                    // 1:1 rhythm — drives readiness ("none" = no 1:1s)
  assessments: Assessments;
  strengths: string[]; watchOuts: string[]; howToLead?: string;
};
type Action   = { id: string; personId: string; text: string; done: boolean; dueDate?: string };
type OneOnOne = { id: string; personId: string; date: string; notes?: string; nextDate?: string };
type Goal     = { id: string; personId: string; title: string; progress: number; targetDate?: string };
type Note     = { id: string; personId: string; date: string; body: string };
type Me       = { name: string; title?: string; photo?: string };
```

## Readiness (1:1 prep)

Separate from coverage, which answers *do I know them*. Readiness answers **am I
ready for the next time we sit down** — and it's measured against the clock, not
in the abstract. A person's `cadence` projects the next 1:1 from the last one
(`~Thu · 3d`), so nothing has to be scheduled for the signal to work; an
explicitly booked `nextDate` always wins.

Five states, worst-first: **Drifting** (past cadence, nothing next) → **Loose
end** (a 1:1 was never written up) → **Prep due** (window open, checklist
incomplete) → **Ready** → **Resting** (met recently — nothing is owed, and that's
a good state). Relationship debt deliberately outranks paperwork debt. People
with no cadence, or `"none"`, are left out entirely.

Prep only starts mattering inside a window of `max(2 days, 25% of cadence)`.
Team cards roll up **worst-of, never average**. The engine lives in
[`src/lib/readiness.ts`](src/lib/readiness.ts); layer **`R`** on the canvas shows
the rail, countdown chip and distribution bar, and the per-person prep panel
([`PrepPanel.tsx`](src/components/PrepPanel.tsx)) links each failing check
straight to where it gets fixed. Full design rationale — including what's
deliberately *not* built — in [docs/readiness.md](docs/readiness.md).

A person counts as **assessed** once any framework result is recorded. The team-node metric is assessment coverage (X/Y) — deliberately pluggable so a future 0–100 leadership-readiness score can roll up through teams without a rewrite.

## THEME_DOMAIN (all 34 CliftonStrengths themes)

| Domain | Color | Themes |
|---|---|---|
| Executing | `#1D9E75` | Achiever, Arranger, Belief, Consistency, Deliberative, Discipline, Focus, Responsibility, Restorative |
| Influencing | `#EF9F27` | Activator, Command, Communication, Competition, Maximizer, Self-Assurance, Significance, Woo |
| Relationship Building | `#D4537E` | Adaptability, Connectedness, Developer, Empathy, Harmony, Includer, Individualization, Positivity, Relator |
| Strategic Thinking | `#7F77DD` | Analytical, Context, Futuristic, Ideation, Input, Intellection, Learner, Strategic |

The map lives in [src/data/frameworks.ts](src/data/frameworks.ts) and drives strength-chip coloring, team domain balance, the org donut, and blind-spot detection.

## Notes

- **Reset to seed data**: run `useStore.getState().resetToSeed()` in the browser console (the store is exposed on `window` in dev). This wipes your cloud rows and re-seeds them.
- **Persistence seam**: all cloud reads/writes go through [`src/lib/repo.ts`](src/lib/repo.ts) (normalized Supabase tables). The store hydrates on login and syncs changed collections back, debounced. `dark` mode still lives in localStorage as a device-local UI preference.
