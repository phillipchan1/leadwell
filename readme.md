# LeadWell

A web app that shows the teams and people you lead as a visual org-chart tree,
with an assessment-based profile (CliftonStrengths, Enneagram, MBTI) and an AI
coach for each person. **Cloud-backed** by Supabase with **Google sign-in**, so
your data syncs across every device.

**Product docs** — who this is for, what we believe, and what we've decided —
live in [`docs/`](docs/README.md). Start with
[the product overview](docs/product/overview.md). This README covers the
technical side only.

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

The org tree is an **infinite canvas** (React Flow): pan, zoom (scroll/pinch), a minimap, and freely draggable team cards whose positions persist. Teams live on one visual rank no matter how many there are — no wrapping into rows that would falsely read as another tier. Teams marked **"Above me — I report up"** render above your node with the connector flowing down into you; their people get full profiles and the AI coach frames them as *leading up*. **Reset layout** snaps everything back to the automatic arrangement. Reassigning a person between teams is `movePerson(personId, teamId)` in the store (drag-reorg seam).

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

type Person = {
  id: string; teamId: string; name: string; role?: string;
  photo?: string;                       // base64 data URL (downscaled on upload)
  relationshipType?: string;
  assessments: Assessments;
  strengths: string[]; watchOuts: string[]; howToLead?: string;
};
type Action   = { id: string; personId: string; text: string; done: boolean; dueDate?: string };
type OneOnOne = { id: string; personId: string; date: string; notes?: string; nextDate?: string };
type Goal     = { id: string; personId: string; title: string; progress: number; targetDate?: string };
type Note     = { id: string; personId: string; date: string; body: string };
type Me       = { name: string; title?: string; photo?: string };
```

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
