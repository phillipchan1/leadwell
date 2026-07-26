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

## Navigation model

**The URL is the source of truth for what's selected.** Selection setters
navigate; [`applyRoute`](src/store/useStore.ts) writes the resulting location
back into the store. One direction only, so the back button needs no special
handling and every entity is a link you can send someone.

One entity renders on two surfaces:

- **Peek** — a fixed-width panel beside the canvas. Shows exactly *one* entity.
  Drilling into a member swaps the panel's contents and grows the breadcrumb
  rather than opening a second panel beside the first, which is what lets the
  model go as deep as the data does without running out of horizontal room.
- **Focus** — the full page for one entity, at `/team/:id`, `/person/:id/:section`,
  `/manager/:id`, `/me`. Replaces the canvas instead of covering it: promoting
  out of a peek is for room to work, so nothing competes for width or has to be
  dismissed before the app is usable again.

Promotion between them is just a route change (`⌘↵`, or the `⤢` / `⤡` buttons).
[`EntityChrome`](src/components/EntityChrome.tsx) owns the breadcrumb, the
sibling pager (`←` / `→`), close, and that promotion for every entity kind — the
profile components own content only, and render at both densities from one tree.

```
/tree                        canvas, nothing open
/tree?team=t1                team peek beside the canvas
/tree?person=p3&s=sessions   person peek, 1:1s section
/person/p3/sessions          same person, same section, full page
```

Because a peek is not tied to the canvas, clicking a row in the People table
opens it in place instead of throwing you back to the tree.

## Stack & structure

React + TypeScript + Vite · Tailwind CSS 4 (light/dark) · Zustand · React Router · React Flow (`@xyflow/react`) · Supabase (`@supabase/supabase-js`).

The org tree is an **infinite canvas** (React Flow): pan, zoom (scroll/pinch), a minimap, and freely draggable team cards whose positions persist. Teams live on one visual rank no matter how many there are — no wrapping into rows that would falsely read as another tier. Teams marked **"Above me — I report up"** render above your node with the connector flowing down into you; their people get full profiles and the AI coach frames them as *leading up*. Card layers toggle independently by keystroke — **P** people · **A** action · **M** mandate · **G** gift mix · **D** detail · **R** readiness — and compose with the domain filter (`1`–`9`). **Reset layout** snaps everything back to the automatic arrangement. Reassigning a person between teams is `movePerson(personId, teamId)` in the store (drag-reorg seam).

```
src/
  types.ts               # data model
  data/
    frameworks.ts        # THEME_DOMAIN (all 34), domain colors, Enneagram, MBTI
    seed.ts              # seed teams/people/goals/notes
  lib/
    routes.ts            # URL <-> selection model (peek vs focus surfaces)
    storage.ts           # persistence seam (localStorage now, API later)
    derive.ts            # coverage, domain counts, blind spots, derived "read"
    readiness.ts         # meeting prep: states, checks, roll-up, triage
    ai.ts                # Anthropic client, system prompts, streaming chat
  store/useStore.ts      # Zustand store; persists on every data change
  components/
    App shell: App.tsx (header, tabs, route sync, Ask AI)
    Surfaces: EntitySurface.tsx (peek), FocusView.tsx (page), EntityChrome.tsx
    Tree: OrgTree.tsx, StatsBar.tsx, StrengthsDonut.tsx, Avatar.tsx
    Profile: PersonProfile.tsx, AssessmentEditor.tsx, AICoach.tsx
    Readiness: PrepPanel.tsx, SessionTable.tsx, MeetingEditor.tsx, TriageModal.tsx
    Other tabs: Overview.tsx, PeopleTable.tsx
    forms.tsx, ui.tsx    # modals + small primitives
```

## Data model

```ts
type Capacity = { id: string; label: string; color: string };   // Manager (teal) / Leader (purple) / Influence (amber) / Report up (blue)
type Team     = { id: string; name: string; capacityId: string; description?: string; order: number;
                  direction?: "up" | "down";                    // "up" = I report to this team; renders above me
                  parentId?: string;                            // sub-team, nests under a broader team
                  leaderId?: string };                          // a direct report runs it — hangs under them, not me

type Domain = "Executing" | "Influencing" | "Relationship Building" | "Strategic Thinking";
type Assessments = { cliftonTop5?: string[]; enneagram?: string; mbti?: string };

type MeetingRhythm = "weekly" | "biweekly" | "monthly" | "quarterly" | "as_needed";

// A meeting I've opted into being ready for. Points at a person (1:1), a team
// (staff meeting, practice session) or a manager (check-in).
type TrackedMeeting = {
  id: string; subjectKind: "person" | "team" | "manager"; subjectId: string;
  name?: string;                        // "Practice meeting"; defaults to the subject's name
  rhythm: MeetingRhythm;
  floorDays?: number;                   // as_needed only — a tolerance, not a rhythm
  nextDate?: string;                    // an explicit booking always wins
  role?: "convene" | "attend";
};

type Person = {
  id: string; name: string; role?: string;
  teamId?: string;                      // undefined = a direct report: their own node under me, no team
  domainId?: string;                    // life area, only for a direct report (others inherit the team's)
  photo?: string;                       // base64 data URL (downscaled on upload)
  relationshipType?: string;
  noMeeting?: boolean;                  // "I deliberately don't sit down with them"
  assessments: Assessments;
  strengths: string[]; watchOuts: string[]; howToLead?: string;
};
type Action   = { id: string; personId: string; text: string; done: boolean; dueDate?: string };
type Session  = { id: string; meetingId: string; date: string; point?: string; notes?: string; nextDate?: string };  // one occurrence
type Goal     = { id: string; personId: string; title: string; progress: number; targetDate?: string };
type Note     = { id: string; personId: string; date: string; body: string };
type Me       = { name: string; title?: string; photo?: string };
```

## Readiness (meeting prep)

Separate from coverage, which answers *do I know them*. Readiness answers **am I
ready for the next time we sit down** — measured against the clock, not in the
abstract.

**The meeting is the unit.** A 1:1, a staff meeting, a practice session and a
check-in with the boss all prep identically, so they're all `TrackedMeeting`s
pointing at different subjects. The same team can have a standing meeting *and*
1:1s with its members; those are separate things to be ready for.

**Rhythm, not a calendar.** A meeting's rhythm projects its next occurrence from
the last one (`~Thu · 3d`, the `~` marking a projection), so nothing has to be
scheduled for the signal to work. An explicit `nextDate` always wins.
`as_needed` promises nothing and projects nothing — give it a `floorDays`
*tolerance* instead ("if it's been 6 weeks, something's wrong") and it sits
**Dormant** until either something is booked or the floor is crossed. Metronome
for what's regular, tripwire for what isn't.

Six states, worst-first: **Drifting** (past the rhythm or floor, nothing next) →
**Loose end** (an occurrence was never written up) → **Prep due** (window open,
checklist incomplete) → **Ready** → **Resting** (met recently — nothing owed,
and that's a good state) → **Dormant**. Relationship debt deliberately outranks
paperwork debt. Prep only starts mattering inside a window of
`max(2 days, 25% of the rhythm)`. Cards roll up **worst-of, never average**.

**Nothing is measured until you opt in.** Three states per subject: tracked, a
deliberate `noMeeting` decision, or *undecided* — and only undecided is counted
at you, in a number that empties as you triage it
([`TriageModal.tsx`](src/components/TriageModal.tsx), bulk by design). That
closes the one hole opt-in creates: you can't go green by ignoring people, only
by deciding about them.

The engine lives in [`src/lib/readiness.ts`](src/lib/readiness.ts); layer **`R`**
on the canvas shows the rail, countdown chip and distribution bar, and
[`PrepPanel.tsx`](src/components/PrepPanel.tsx) — on people, teams and managers
alike — links each failing check straight to where it gets fixed, including into
the meeting that was never written up. Full design rationale, including what's
deliberately *not* built, in [docs/readiness.md](docs/readiness.md).

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
