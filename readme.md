# LeadWell

A personal, single-user web app that shows the teams and people you lead as a visual org-chart tree, with an assessment-based profile (CliftonStrengths, Enneagram, MBTI) and an AI coach for each person.

## Run it

```sh
npm install
npm run dev
```

Opens at http://localhost:5173 with seed data (3 teams, 8 people — a mix of assessed and unassessed), so everything works immediately. All data persists to localStorage.

## Anthropic API key (AI coach)

Create a `.env.local` file in the project root:

```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Restart the dev server. This enables the per-person AI coach, the header **Ask AI** chat, and the AI executive brief on the Overview tab (model: `claude-sonnet-5`, streaming). Without a key, those spots show a friendly "add your API key" state and the rest of the app works fully.

> The key is used directly from the browser (`dangerouslyAllowBrowser`) — fine for this single-user local tool, but don't deploy it publicly with your key baked in.

## Deploy to Vercel

This is a static single-page app (Vite build → `dist/`), so it deploys to Vercel with no server. [`vercel.json`](vercel.json) already sets the framework, build command, output directory, and SPA rewrite — Vercel needs no extra configuration.

1. Import the repo at [vercel.com/new](https://vercel.com/new) (or run `vercel` from the CLI).
2. Deploy. That's it — the app runs with seed data and the in-app **Settings → Anthropic API key** field enabled.

**About the API key:** the AI features call Anthropic directly from the browser, so any key that reaches the browser is visible to whoever loads the page. For a public deployment, **do not** set `VITE_ANTHROPIC_API_KEY` in Vercel — it would be baked into the public JS bundle and exposed. Instead, leave it unset and have each user paste their own key into **Settings** (stored only in their browser's localStorage). Only set `VITE_ANTHROPIC_API_KEY` for a private/local build where you control who can reach it.

## Stack & structure

React + TypeScript + Vite · Tailwind CSS 4 (light/dark) · Zustand · React Flow (`@xyflow/react`) · `@anthropic-ai/sdk`.

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

- **Reset to seed data**: run `useStore.getState().resetToSeed()` in the browser console (the store is exposed on `window` in dev), or clear localStorage keys starting with `leadwell:v1:`.
- **Swap the backend later**: implement the `Storage` interface in [src/lib/storage.ts](src/lib/storage.ts) and point `storage` at it — nothing else touches localStorage.
