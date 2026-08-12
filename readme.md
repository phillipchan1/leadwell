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

## Modes

Nobody opens the org tree wanting "mandate and health and readiness." They open
it **in a mode** — and the chart used to make you assemble that mode yourself
out of eight independent layer toggles, every one of them offered at once
regardless of the question being asked.

So mode is now the only card control there is. Four of them, one per question:

| Mode | Question | Cards carry | Bar under the chips |
|---|---|---|---|
| **Plan** `1` | What is each team for, and what's next? | mandate, next step, stacked avatars | — |
| **Prep** `2` | Am I ready for the next 1:1? | readiness rail, countdown chips, roster, next step | *4 of 6 ready · 2 need prep · N undecided* |
| **Assess** `3` | Is this going well? | health chip, why-line, member health bar, roster | the **health scan** |
| **Pray** `4` | Who am I carrying? | the hand, focus line, *carrying 3 of 8 · 1 gone quiet*, roster | the **prayer scan** |

Plan is the only one that leaves the roster off: mandate and next step are
team-level answers, and a list of names under them buries the two lines that
matter. The other three are per-person signals, so they need the names.

**Mode is what you're doing; the domain filter is where.** They're orthogonal
and compose — Assess × Church answers a question neither does alone. Mode takes
the bare digits `1`–`4`; domains moved up a shift to `⇧1`–`⇧9`.

**Only the scan a mode owns applies.** The scans themselves persist across a
mode switch — they're shared with the table and have to follow you there — but
Plan and Prep put no scan bar on screen, so nothing dims in them. A mode that
can't say *why* a card faded has no business fading it. Composing health *and*
prayer at once is still the table's job, where both are columns.

The mode bar renders above the domain chips on **both** surfaces, which is how
the phone finally gets the control the canvas used to hoard. Below `lg` it
picks the outline's columns instead of the card's layers — same question, the
shape the screen can carry.

Modes live in [`src/lib/treeMode.ts`](src/lib/treeMode.ts): the four ids, the
layer set each one stamps, the scan it owns, and the columns it shows.

## Stack & structure

React + TypeScript + Vite · Tailwind CSS 4 (light/dark) · Zustand · React Router · React Flow (`@xyflow/react`) · Supabase (`@supabase/supabase-js`).

The org tree is an **infinite canvas** (React Flow): pan, zoom (scroll/pinch), a minimap, and freely draggable team cards whose positions persist. Teams live on one visual rank no matter how many there are — no wrapping into rows that would falsely read as another tier. Teams marked **"Above me — I report up"** render above your node with the connector flowing down into you; their people get full profiles and the AI coach frames them as *leading up*. The cards themselves are driven by **mode** (see below), not by a row of toggles, and mode composes with the domain filter. **Reset layout** snaps everything back to the automatic arrangement. Reassigning a person between teams is `movePerson(personId, teamId)` in the store (drag-reorg seam).

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
    health.ts            # my own read: levels, the scan filter, roll-ups
    prayer.ts            # who I'm carrying: states, silence, the scan filter
    orgTable.ts          # rows, outline, sorting + grouping for the table view
    treeMode.ts          # the four chart modes: layers, scan and columns each owns
    ai.ts                # Anthropic client, system prompts, streaming chat
  store/useStore.ts      # Zustand store; persists on every data change
  components/
    App shell: App.tsx (header, tabs, route sync, Ask AI)
    Surfaces: EntitySurface.tsx (peek), FocusView.tsx (page), EntityChrome.tsx
    Tree: OrgTree.tsx, StatsBar.tsx, StrengthsDonut.tsx, Avatar.tsx
    Profile: PersonProfile.tsx, AssessmentEditor.tsx, AICoach.tsx
    Shared records: TopicKanban.tsx, NotesPanel.tsx    # keyed by subject id — people and managers alike
    Leading up: ManagerProfile.tsx, LeadUpManual.tsx, WinsLedger.tsx
    Readiness: PrepPanel.tsx, SessionTable.tsx, MeetingEditor.tsx, TriageModal.tsx
    Health: Health.tsx   # the property control, at every density
    Prayer: Prayer.tsx   # the mark, the log, the mode — people, teams and managers alike
    Table: TableView.tsx # the canvas's correlated view
    Other tabs: Overview.tsx, PeopleTable.tsx
    forms.tsx, ui.tsx    # modals + small primitives
```

## Data model

```ts
type Capacity = { id: string; label: string; color: string };   // Manager (teal) / Leader (purple) / Influence (amber) / Report up (blue)
type HealthLevel = "thriving" | "solid" | "watch" | "strained" | "critical";
type Health   = { level: HealthLevel; note?: string; ratedOn?: string };  // my own read

type Team     = { id: string; name: string; capacityId: string; description?: string; order: number;
                  health?: Health;                              // my call on how the team is doing
                  prayer?: Prayer;                              // set when I'm carrying this team
                  direction?: "up" | "down";                    // "up" = I report to this team; renders above me
                  parentId?: string;                            // sub-team, nests under a broader team
                  leaderId?: string };                          // a direct report runs it — hangs under them, not me

// Who I'm carrying. Presence = actively praying; there is no level and no score.
type Prayer      = { since: string; focus?: string; lastPrayedOn?: string; times?: number };
type PrayerEntry = { id: string; subjectKind: "person" | "team" | "manager"; subjectId: string;
                     date: string; kind: "burden" | "scripture"; text: string;
                     answeredOn?: string; answerNote?: string };   // answered, never "done"

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
  trackerUrl?: string;                  // notes live outside LeadWell (Notion, a Word doc…)
  trackerName?: string;                 // what to call it; derived from the link otherwise
};

type Person = {
  id: string; name: string; role?: string;
  teamId?: string;                      // undefined = a direct report: their own node under me, no team
  domainId?: string;                    // life area, only for a direct report (others inherit the team's)
  photo?: string;                       // base64 data URL (downscaled on upload)
  relationshipType?: string;
  health?: Health;                      // my call on how they're doing
  prayer?: Prayer;                      // set when I'm carrying them
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

**Notes that already live somewhere else stay there.** A meeting can carry a
`trackerUrl` — the Notion page, the Word doc in OneDrive, the shared Google Doc
you and that report have used for years — and it's an *and*, not an *or*: the
rhythm, the topic board and the health read stay in LeadWell, and sessions can
still be logged here alongside it. Only the write-up moves. Readiness stops
claiming to know whether the last one was written up (it can't see the page)
and says where it went instead, rather than parking that person in permanent
**Loose end**. Linking a tracker starts tracking the meeting as-needed, because
"they're in Notion" is a decision. Not every link is a URL — a path or a
`.docx` filename is kept as a pointer, and only allowlisted schemes ever become
a clickable anchor ([`src/lib/tracker.ts`](src/lib/tracker.ts)).

The engine lives in [`src/lib/readiness.ts`](src/lib/readiness.ts); layer **`R`**
on the canvas shows the rail, countdown chip and distribution bar, and
[`PrepPanel.tsx`](src/components/PrepPanel.tsx) — on people, teams and managers
alike — links each failing check straight to where it gets fixed, including into
the meeting that was never written up. Full design rationale, including what's
deliberately *not* built, in [docs/readiness.md](docs/readiness.md).

## Health (my own read)

Coverage answers *do I know them*. Readiness answers *am I ready for the next
time we sit down*. Neither answers the question you actually carry around:
**is this going well?** Nothing in the data can answer it — so health is one
property you set yourself, on any team or person:

```ts
type HealthLevel = "thriving" | "solid" | "watch" | "strained" | "critical";
type Health = { level: HealthLevel; note?: string; ratedOn?: string };
```

Five levels, strongest first, deliberately lopsided toward the weak end: "solid"
covers everything that needs nothing from you, and the three below it are the
ones worth telling apart when you're deciding where next week goes. The optional
`note` is the one line of evidence behind the call ("no weekend off since
March"), and `ratedOn` is re-stamped on every change — a read from eight months
ago is a memory, and after 90 days the chip says **stale** rather than pretending
otherwise.

Set it anywhere it's visible: the add/edit modals, the team and person profiles,
or straight from a table row. It's never derived. A team with no call of its own
shows its people's average as a hollow `~solid` chip that says so — and still
counts as *not rated* everywhere it matters, so a team can't go green because
the people on it happen to be.

**The scan** is the payoff. Layer **`H`** puts the levels on the canvas, and the
scan bar above it counts every rated subject in view. Click a level and the
canvas *dims* everything else rather than hiding it — filtering to Strained and
watching two cards stay lit inside the shape of the org tells you where the
strain is; a canvas with two cards on it doesn't. A team card stays lit when its
own rating matches **or any of its people do**, so a scan finds the person even
when the team around them reads fine. The scan is shared with the table view, so
it follows you between the two surfaces. Overview carries the boiled-down
version: the mix bar, and everything strained or critical, worst first.

## Prayer (who I'm carrying)

The fourth dimension, and the only one that isn't about them. Coverage asks *do
I know them*; readiness asks *am I ready to sit down with them*; health asks *is
this going well*. This one asks the question a lot of leaders actually carry
around: **am I praying for this person, and this team, right now.**

```ts
type Prayer = { since: string; focus?: string; lastPrayedOn?: string; times?: number };
```

**There is no scale, and there is no score.** Presence of the mark is the whole
answer — taking someone up is a deliberate act and laying them down is another,
which is why the model has a `since` date and no level. Nothing is derived
either: a team is not "prayed for" because four people on it are.

What *is* measured is the only honest signal available — **how long it's been.**
Four states, and only one of them asks for anything: **Prayed this week** →
**Carrying** → **Gone quiet** (nothing marked in 21 days) → **Not carrying**.
"Not carrying" is never counted as a gap. Praying for four people out of forty
is a true answer, and an app that nagged about the other thirty-six would be
teaching the wrong thing. "Gone quiet" is the one that surfaces: a name you took
up in January and haven't prayed for since June is exactly what goes unnoticed
without a list.

**The mode.** Pray (`4`) puts the hand on every card — the mark shows how long
since you last prayed, a team card shows its focus line and `carrying 3 of 8 ·
1 gone quiet` — and brings up the **prayer scan**: one chip per state, with
counts, dimming rather than hiding the way health's does. *Gone quiet* is the
chip that earns the bar. A count can tell you a name has gone six months
unprayed-for; only the scan puts you in front of it. The scan is shared with
the table, so it follows you between surfaces, and the marks are doors —
clicking one opens that subject's prayer tab, so a pass down the list is scan →
click → pray → mark → next. It's a mode you enter on purpose, never a column
everyone gets — which is the whole reason the canvas has modes at all.

**The log** is a tab on every person and manager (`?s=prayer`) and a section on
every team, and it deliberately does not look like a to-do list. No checkboxes,
no "+ Add" row, no hover-delete in the margin — entries are *written down*, in
serif, against a margin rule, and the controls live behind a click on the line
itself so the resting state of the panel is just the words. Two kinds of entry,
a **burden** and a **scripture**, because a third would just be the Notes tab
wearing a hat. Nothing is ever "completed": an entry is **answered**, which
keeps the words and adds a date and a line about what happened — the part worth
re-reading a year later. Laying someone down keeps the log, including every
answer.

The engine is [`src/lib/prayer.ts`](src/lib/prayer.ts) and the whole UI —
canvas mark, panel and log — is [`Prayer.tsx`](src/components/Prayer.tsx).
Overview carries the boiled-down version: who's on the list, longest silence
first, and what's been answered lately.

## Table view

The canvas's correlated view — same store, same records, same health calls, a
different question. The canvas is for shape and place ("who sits under what");
the table is for comparison ("everything strained, sorted by how long since I
met"). Clicking a row opens the same peek panel a card does, so drilling in
never means starting over on the other surface.

Teams and people share one row type on purpose: a table with two row shapes
can't sort a person above a team, and *show me everything strained, whatever it
is* is the whole point.

- **Team outline** (the default) is the tree flattened: a team, its people, then
  its sub-teams, indented — and direct reports carrying whatever they lead. Rows
  collapse; sorting reorders siblings *within* each parent rather than destroying
  the hierarchy.
- **Group by** health, domain, capacity or type flattens it into buckets with a
  count and a health mix bar per group. Unrated always sorts last.
- **Filter** by search, domain, kind (teams / people), and the shared health
  scan — plus a **Weak spots** preset for watch-or-worse. When a filter matches
  something nested, its ancestors stay as dimmed context so a person never
  floats with no team above them.
- **Edit in place**: the health dropdown and its *why* line are live in every
  row, which is what makes rating a whole org a two-minute pass rather than
  twenty panel visits.
- **Columns** toggle on and off (type, under, health, why, domain, ready, next,
  capacity, read, size).

Rows, outline, sorting and grouping live in
[`src/lib/orgTable.ts`](src/lib/orgTable.ts); the view is
[`TableView.tsx`](src/components/TableView.tsx).

## Leading up

Two shapes of "above me": people on a team marked `direction: "up"` (a board, an
elders group), and **`Manager`** nodes — one leader you answer to in a given
domain, attached straight to you.

Managing the relationship works the same either way, and the same way as leading
down: a tracked check-in, its session history, a topic board and dated notes.
Those share the person tables — `actions`, `notes` and `wins` are all keyed by
*subject* id with no foreign key, so a manager's records slot in without a
migration. What's different upward is what leads: the **operating manual**
(`LeadUpManual` — what they reward, their anxieties, their currency, what their
own boss measures them on) and the **wins ledger** (`WinsLedger` — value you've
delivered, phrased in their currency, recallable at reviews and before an ask).
Leading down you track someone else's growth; leading up you track your own
value.

The topic board is the same component pointed the other way
(`TopicKanban direction="up"`): a topic for your boss is an ask, an escalation
or a decision you need, not something you're raising *about* them — so the
queued column reads **This check-in** and the coach frames it accordingly. The
stored value is unchanged, which is what keeps the readiness engine ignorant of
direction.

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
