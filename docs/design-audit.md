# LeadWell — Design Audit

**Date:** 2026-08-12 · **Scope:** full product (IA, visual system, speed, reliability, keyboard, mobile) · **Method:** codebase walk — routes, store, components, stylesheets. No code changed.

---

## 0. Headline

LeadWell is unusually thoughtful for a hand-built app. The navigation model (URL as source of truth, one entity rendering at two densities, a shared breadcrumb/pager for every entity kind) is genuinely better than most funded B2B SaaS. The comment density in the source shows someone reasoning about *why*, not just shipping.

The problems are almost all **systemic, not local**. They fall into three shapes:

1. **Two design systems coexist and the app-level one always wins.** A complete Untitled UI token layer sits in `src/styles/theme.css` (858 lines of semantic color, type, radius, shadow tokens). **Zero** app-level components use it. All 60 components in `src/components/*.tsx` hard-code `stone-*` + `dark:stone-*` pairs — 1,240 raw color-class occurrences. A third system, 1,636 lines of bespoke CSS in `index.css`, styles roughly 150 more classes.
2. **Correctness is maintained by hand, per component.** Touch targets, Escape handling, tap-target floors, and iOS zoom prevention are all opt-in allowlists that a new component silently fails to join. `index.css:1547–1636` is literally a hand-maintained list of class names that need a 44px floor.
3. **Trust signals are missing where a leader needs them most.** `syncStatus` is tracked in the store and rendered nowhere. Sync failures are `console.error` only. Data is never cached locally, so offline = the app does not work. There is no undo anywhere, and roughly half the delete paths skip confirmation.

The single highest-severity finding is **not** any of the flagged gaps: it's that **you cannot create a person, team, or manager on a phone at all** (§3.1). Every create affordance lives inside the desktop-only React Flow panel.

---

## 1. App inventory

### 1.1 Top-level venues

Five tabs, defined once in `src/components/AppChrome.tsx:19-31`, routed by `src/lib/routes.ts:23`. Default landing tab is `tree` (`routes.ts:44`).

| Tab | Route | Desktop | Mobile (<`lg`) | Component |
|---|---|---|---|---|
| Overview | `/overview` | top tab strip | bottom nav | `Overview.tsx` |
| Org tree | `/tree` *(default)* | React Flow canvas | **renders `TableView variant="tree"`** | `OrgTree.tsx` (1,800+ lines) |
| Meetings | `/meetings` | table | table | `MeetingsTable.tsx` |
| Table | `/table` | table | table | `TableView.tsx` |
| People table | `/people` | table | table | `PeopleTable.tsx` |

Navigation is duplicated by viewport, not shared: top `Tabs` at `App.tsx:213-224` (`max-lg:hidden`), bottom `<BottomNav>` at `AppChrome.tsx:37-68` (`lg:hidden`). Same five destinations, two implementations, two visual languages.

**On a phone, four of five tabs render a table.** The Tree tab's mobile branch (`OrgTree.tsx:485-488`) delegates to `TableView`. So the mobile venue set is really: one dashboard + four tables.

### 1.2 Entity surfaces

Five entity kinds (`routes.ts:24`), each rendering at two densities from one component tree:

- **Peek** — resizable side panel beside the canvas (`EntitySurface.tsx:142`), full-screen below `lg`
- **Focus** — full page (`FocusView.tsx`), `/person/p3/meetings`

Shared chrome (breadcrumb, sibling pager, close, promote) in `EntityChrome.tsx:185`. This part is well-designed and should not be touched.

### 1.3 Entity sub-navigation — three different vocabularies

`src/lib/entityModes.ts` declares a contract: *"The five modes every entity shares."* It is honored by three of five kinds.

| Entity | Sub-nav | Source |
|---|---|---|
| Person | 5 modes: Now / Meetings / Profile / Notes / Prayer | `PersonProfile.tsx:218` |
| Person (lead-up) | 5 modes, relabeled: Now / Check-ins / Leading up / Notes / Prayer | `entityModes.ts:73-79` |
| Team | 5 modes | `TeamProfile.tsx:265` |
| Manager | 5 modes, relabeled | `ManagerProfile.tsx:127` |
| **Meeting** | **3 different tabs: Plan / Notes / Settings** | `MeetingProfile.tsx:35-43` |
| **Me** | **no tabs — one 230-line scroll** | `MeProfile.tsx` |

### 1.4 Overlays, modals and sheets — 16 distinct dismissible surfaces

`ui.tsx` `Modal` (React Aria, well-built) · `ConfirmHost` · `SettingsModal` · Ask AI modal (`App.tsx:266`) · `TriageModal` · `PersonModal` / `TeamModal` / `ManagerModal` / `DomainsModal` (`forms.tsx`) · `AssessmentEditor` · `ProfileFillModal` · `PhotoPicker` · `OccurrenceNotesSheet` · `FullScreenMarkdown` · `MeetingEditor` (576 lines, full-screen) · `SlashMenu` · `HeaderOverflow` menu (`AppChrome.tsx:112`, hand-rolled, not React Aria).

### 1.5 Duplicated surface families

**Nine ways to write text about a meeting or person:**
`InlineSessionEditor` (in-panel textarea) · `SessionEditor` + `SessionEditorView` (full-viewport TipTap route) · `OccurrenceNotesPanel` · `OccurrenceNotesSheet` · `WritingPad` (serif journal) · `FullScreenMarkdown` (source + split preview) · `NotionBlockEditor` (TipTap) · `MeetingEditor` (576 lines) · `NotesPanel`.

**Five hand-rolled tables**, sharing only the `Th` sort header: `TableView` (11 columns, search, group-by, health filter) · `PeopleTable` · `MeetingsTable` · `SessionTable` · `SessionHistoryTable`. Each re-implements its own `useState` search + `NativeSelect` filter + sort direction.

**Four ways to create a recurring meeting:** `PrepPanel` "Set up a meeting" (`PrepPanel.tsx:83`) · `StartMeetingForm` (`SubjectMeetings.tsx`) · `NewMeetingRow` (`MeetingsTable`) · `MeetingScheduleFields` (Settings tab + inline profile block).

**Three plan/history shapes for the same meeting data:** `TopicBoard` (kanban) · `MeetingCalendar` (month grid) · `SessionHistoryTable` / `SessionTable`.

### 1.6 Depth to core action

From cold open (lands on `/tree`):

| Action | Desktop | Mobile |
|---|---|---|
| Log a 1:1 write-up | 3 taps (person card → Meetings → Log it) | 3 taps |
| Set a health read | 2 taps (person card → HealthField on Now) | 2 taps |
| See who needs prep | 1 tap (Overview, or ModeBar → Prep) | 1 tap |
| Add a topic for next 1:1 | 3 taps | 3 taps |
| Pray for someone | 1 tap from Overview | 1 tap |
| **Add a person** | **2 taps** (canvas "+ Direct report" → Save) | **5 taps, and only into an existing team** |
| **Add a team** | **2 taps** | **impossible** |
| **Add a manager** | **2 taps** | **impossible** |

The read paths are excellent. The write paths break on mobile.

---

## 2. Personas

Drawn from evidence in the app itself — its data model, its copy, its feature choices.

### Persona A — **Marcus, lead pastor** (the app's center of gravity)

Evidence: Prayer is a first-class entity mode with its own icon, filter scan, canvas layer, and "Answered lately" roll-up (`Prayer.tsx`, `lib/prayer.ts`, `Overview.tsx:363-440`). Copy: *"Open anyone — or a whole team — and take them up in prayer."* Scripture styling exists (`index.css` `.prayer-text.is-scripture`).

Leads 6 teams and ~20 people, half of them volunteers. Checks the app in a car between a hospital visit and a staff meeting, on an iPhone, one-handed, in bright sun. Wants two things in 90 seconds: *who's struggling* and *who I haven't prayed for*. Will never learn a keyboard shortcut. Will absolutely notice if something he typed didn't save.

**Test:** does this friction survive a 90-second one-handed check-in on cellular?

### Persona B — **Dana, VP of Ops** (the "leading up" user)

Evidence: the entire `Manager` entity kind, `LeadUpManual`, `WinsLedger` ("banked value rather than context"), `direction: "up"` on teams, relabeled tabs ("Check-ins", "Leading up").

Reports to a CEO, runs four managers who each run teams. Uses the app on a laptop with a second monitor, but preps for her own 1:1 with the CEO on her phone in the 4 minutes before it. Cares about the readiness checklist because being unprepared in front of her boss is expensive. Is a keyboard person for anything she does twice a day.

**Test:** can she prep, reorder, and close without lifting her hands off the keyboard?

### Persona C — **Sam, founder/exec** (the scanner)

Evidence: "Executive brief", "Ask AI about your org", `blindSpots()`, `domainCounts()`, CliftonStrengths/Enneagram/MBTI coverage tracking, `TriageModal` for "undecided" relationships.

Opens the app twice a week, always right before something — a board meeting, a comp review, a reorg conversation. Never edits much; scans, then drills into one person. Has 40 people in the system and will not tolerate a screen that takes 3 seconds to paint.

**Test:** is there meaningful content on screen within 1 second of opening a cold tab?

---

## 3. Findings

Severity: **High** = a persona hits it in normal use and it costs trust or a task. **Med** = friction. **Low** = polish.
Effort: **S** = under a day · **M** = a few days · **L** = a real design + build pass.

---

### 3.1 Information architecture

#### IA-1 · Every create action is desktop-only — **High / M**

All nine `openModal({kind: "person" | "team" | "manager"})` call sites are in `OrgTree.tsx`, and the three primary ones (`OrgTree.tsx:540-553`) live inside the React Flow `<Panel>`, which is inside the `hidden … lg:flex` branch (`OrgTree.tsx:490`). The mobile branch renders `filterRow` + `TableView` — and `filterRow` (`OrgTree.tsx:433-471`) contains no create affordances. `TableView.tsx` has zero create affordances of any kind.

The only mobile create paths are inside `TeamProfile.tsx:509` (+ person to this team) and `:581` (+ sub-team). Both require a team to already exist.

**Why it matters:** Marcus meets a new volunteer leader in a hallway and cannot add them. A brand-new user who installs the PWA on their phone cannot create their first team. This isn't friction, it's a dead end.

#### IA-2 · Two tabs are near-duplicates — **High / M**

`TableView` renders every org record — people, teams, managers — with 11 toggleable columns including health, readiness, next meeting, domain, capacity, and read coverage, plus search, group-by, and a health filter. `PeopleTable` renders people only, with a strict subset: search, team filter, and sort by name/team/coverage/next/health. Every column `PeopleTable` has, `TableView` already has.

`PeopleTable` is 1 of 5 top-level destinations — 20% of the primary navigation — for a filtered view of another destination.

**Why it matters:** Sam has five nav choices and two of them answer the same question. On mobile, where the Tree tab is *also* `TableView`, three of five bottom-nav items land on the same component.

**Recommendation:** collapse `people` into `table` as a saved filter (`/table?type=person`). Frees a nav slot — spend it on the Now/Today surface below.

#### IA-3 · The default landing tab is the wrong one for every persona — **High / S**

`DEFAULT_TAB = "tree"` (`routes.ts:44`). The org tree is a structural view — "who sits under what." None of the three personas opens the app to ask that. It's also the heaviest lazy chunk (React Flow), and on mobile it renders a table anyway plus four stacked filter rows.

`Overview` already answers Marcus's and Sam's actual first question, and is the lightest screen in the app.

#### IA-4 · The meeting entity breaks the five-mode contract — **Med / M**

`entityModes.ts` documents five shared modes and explains at length why they exist ("Same job, three layouts, nothing transferable"). `MeetingProfile.tsx:35` then defines `Plan / Notes / Settings`, and `MeProfile.tsx` has no tabs at all. So the app has three sub-navigation vocabularies across five entity kinds.

The specific confusion: "Notes" means *my running record about a person* on a person, and *the write-up for an occurrence* on a meeting. Same word, different noun.

#### IA-5 · Nine writing surfaces for one job — **High / L**

See §1.5. A leader writing up a 1:1 can land in `InlineSessionEditor` (plain textarea), the full-page `SessionEditorView` (TipTap rich text with slash menu), `OccurrenceNotesPanel`, `OccurrenceNotesSheet`, or `FullScreenMarkdown` (raw markdown + preview) — depending on which route they came in through. `InlineSessionEditor`'s own doc comment acknowledges the fork: *"Nothing is a different document — Expand opens the very same session in the full editor."* But the editing affordances, the toolbar, the keyboard behavior and the typography all differ.

**Why it matters:** Marcus types two lines after a 1:1. If the surface he gets depends on whether he arrived from Overview, the person's Now tab, the Meetings tab, or the meeting's Plan board, he never builds muscle memory — and that is the single action he performs most.

#### IA-6 · Four entry points for "set up a recurring meeting" — **Med / M**

`PrepPanel` (a button in the readiness card), `StartMeetingForm` (empty state), `NewMeetingRow` (inline row on the Meetings tab), `MeetingScheduleFields` (Settings tab). Each collects a slightly different field set. `NewMeetingRow`'s doc comment argues correctly that batch entry wants an inline row; `PrepPanel`'s button creates a meeting with a hardcoded `"weekly"` rhythm and no name (`PrepPanel.tsx:85`), which then has to be corrected somewhere else.

#### IA-7 · Mobile Tree stacks four filter rows above any content — **Med / S**

`filterRow` (`OrgTree.tsx:433`) renders `ModeBar` + domain tab strip + "Manage domains" button + `ReadinessSummary` + `HealthScan` + `PrayerScan`, then `TableView` below it. On a 375×667 screen that is most of the viewport before a single person's name appears.

#### IA-8 · No global search or command surface — **Med / M**

There is no way to jump to a person by name from anywhere. Each table has its own local `query` state (`TableView`, `PeopleTable`, `MeetingsTable`). Dana on a laptop has no `⌘K`; Marcus on a phone has to pick the right tab first, then search within it.

---

### 3.2 Visual consistency

#### VIS-1 · Three parallel styling systems; the token layer is dead — **High / L**

- `src/styles/theme.css` (858 lines) defines a complete semantic token set: `--color-text-primary`, `--color-bg-secondary`, `--color-border-primary`, a full type ramp, radius and shadow scales.
- `src/components/base/**` (the Untitled UI primitives) use those tokens correctly.
- `src/components/*.tsx` (all 60 app components) use **none of them**. Grep for `text-primary|bg-secondary|border-primary|text-tertiary` across app components returns **zero files**.

Instead: **1,240** occurrences of raw `stone-*` classes, each manually paired with a `dark:stone-*` counterpart. `OrgTree.tsx` alone has 128; `TableView.tsx` 91; `TeamProfile.tsx` 69.

**Consequence:** every dark-mode value is decided independently at 1,240 sites. Any theme change is a 1,240-site find-and-replace. This is the root cause of most findings below.

#### VIS-2 · No type scale — 4 sizes carry 90% of the UI, and 3 of them are arbitrary — **High / M**

Full histogram across `src/`:

```
171  text-xs        144  text-sm         79  text-[10px]     68  text-[11px]
 16  text-lg         12  text-xl          3  text-base        3  text-[9px]
  3  text-2xl         2  text-[8px]       2  text-3xl         1  text-[13px]
```

`text-[10px]` and `text-[11px]` — arbitrary one-off values, not scale steps — account for **147 uses**, more than `text-sm`. `text-[8px]` and `text-[9px]` appear five times. Meanwhile `theme.css` defines a complete `--text-xs` through `--text-display-2xl` ramp that nothing uses.

There is no semantic layer either: the same `text-[11px] text-stone-500` string is retyped as a caption, a metadata line, a hint, and a badge label.

**Why it matters:** Marcus in a car, in sun, at arm's length. 10px and 11px metadata lines are the app's most common way of saying anything that isn't a name. `Overview.tsx:299`, `PersonProfile.tsx:188/208`, `PrepPanel.tsx:209/254/295` — every "why this matters" line is 10-11px.

#### VIS-3 · No spacing scale — **Med / M**

Padding values in use: `p-0, p-0.5, p-1, p-1.25, p-1.5, p-2, p-2.5, p-3, p-4, p-5, p-6, p-8` — twelve steps including `p-1.25` (a non-standard fractional). Gaps: `gap-0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8` — twelve more. Card padding is `p-6` in `Overview`, `p-4 sm:p-6` in profiles, `px-3 py-2.5` in `PrepPanel`, `px-2 py-1.5` in `TopicBoard`.

No 4-point or 8-point rhythm is enforced; each surface was tuned by eye.

#### VIS-4 · Radius is inconsistent within a single view — **Med / S**

`rounded-full` (76) · `rounded-xl` (67) · `rounded-lg` (61) · `rounded-md` (37) · `rounded-2xl` (7) · plus `rounded-[7px]`, `rounded-[3px]`, `rounded-[10px]`, `rounded-[14px]`.

Concretely, on the Overview screen: `Card` is `rounded-2xl` (`ui.tsx:74`), the list-row buttons inside it are `rounded-lg` (`Overview.tsx:323`), the team swatch beside them is `rounded-lg` while the avatar is a circle, and `TintBadge` is `rounded-full`. Four radii in one card.

#### VIS-5 · 39% of buttons and 26% of inputs bypass the design system — **High / M**

- `<Button>` / `<ButtonUtility>`: **134** uses
- raw `<button className="…">`: **84** uses across 29 files

- `<Input>` / `<TextArea>` / `<NativeSelect>`: **77** uses
- raw `<input>` / `<textarea>` / `<select>`: **27** uses across 15 files

Each raw button re-derives its own padding, radius, hover, active, focus, disabled and dark-mode treatment. Notably: `MeetingEditor` (8), `Prayer` (7), `OrgTree` (7), `forms` (6), `TableView` (6), `NotionBlockEditor` (5).

**Why it matters:** focus rings. The design-system `Button` has a consistent `focus-visible` ring; the 84 raw buttons mostly do not. Dana tabbing through a screen loses the caret repeatedly.

#### VIS-6 · 1,636 lines of bespoke CSS as a fourth vocabulary — **Med / L**

`index.css` defines ~150 hand-written classes across families: `.journal-*` (28 rules), `.meeting-editor-*` (24), `.notion-*` (23), `.prayer-*` (10), `.field-*` (12), `.profile-build__*` (11), `.session-editor-*`, `.slash-menu-*`, `.person-row__*`, `.goal-range`.

`.field-input` (`index.css:563`) is a complete second input implementation running alongside `components/base/input/input.tsx`, with its own `--field-accent`, hover, focus, disabled and placeholder states.

The file also contains a documented specificity war (`index.css:1533-1546`): a touch block had to be moved to the bottom of the file *and* have every selector doubled (`.field-input.field-input`) to beat the app's own classes. That comment is an honest description of a system fighting itself.

#### VIS-7 · Iconography is mixed — **Low / S**

`@untitledui/icons` is used in chrome. But emoji are load-bearing in content: `✦ Ask AI` (`App.tsx:200`), `✨ AI fill from a brain dump` (`PersonProfile.tsx:359`), `⚠` prefixes on watch-out badges (`PersonProfile.tsx:472`), `🎉` and `✓` in empty states (`Overview.tsx:447`, `:317`), `›` as the breadcrumb separator (`EntityChrome.tsx:269`). Emoji render differently per platform and don't inherit color or weight.

---

### 3.3 Speed

#### SPD-1 · Cold start is gated on 19 network round-trips with no local cache — **High / M**

`bootstrap()` (`useStore.ts:1559`) sets `phase: "loading"` and calls `repo.loadAll()`, which does a sequential `profiles` query followed by `Promise.all` over **18 more table reads** (`repo.ts:611-666`). Nothing renders until all 19 resolve. `App.tsx:162` returns `<LoadingSplash />` for the entire duration.

`storage.load<PersistedData>(DATA_KEY)` is called exactly once — in `importLegacyLocalData()` (`useStore.ts:531`), a one-time migration. **The document is never written to localStorage.** The only things persisted locally are `dark` and `panelPct`.

**Why it matters:** Sam opens the app before a board meeting on hotel wifi and stares at a skeleton for the full round-trip. Marcus on 3G gets the splash every single time. There is a service worker (`public/sw.js`) that caches the shell well — so the app frame appears instantly and then shows a loading skeleton, which is arguably worse than a slow blank because it promises content that isn't coming.

**Fix shape:** write the hydrated doc to localStorage on every successful sync; hydrate from it synchronously at boot into `phase: "ready"`; revalidate in the background. This turns a 19-request wait into an instant paint for every return visit.

#### SPD-2 · 46 components subscribe to the entire store — **High / M**

46 call sites use `useStore()` with no selector. Zustand's default equality compares the whole state object, which is a new reference after every `set()`. So **every one of those 46 components re-renders on every state change anywhere in the app** — including every keystroke in a note, every health toggle, every slider drag.

Six of those are in `OrgTree.tsx`, including the per-node components (`ManagerNode`, `TeamNode`, `PersonNode`, `MeNode`). There is **no `React.memo` anywhere in the codebase**.

#### SPD-3 · Readiness is recomputed per node, per render, unmemoized — **High / M**

Each canvas node calls `readinessFor(...)` (`OrgTree.tsx:1216`), which calls `readinessOf` → `meetingReadiness` + `meetingAgenda`, each of which runs `sessionsFor()` — a full `filter` + `sort` over **every session in the org** (`readiness.ts:274-278`). Same in `meetingAgenda` (`readiness.ts:551`).

So one keystroke anywhere → 46 components re-render → every canvas node recomputes → O(nodes × sessions log sessions).

`Overview.tsx` compounds it: **zero `useMemo` in the entire file**. It recomputes `needAttention` (a `flatMap` calling `readinessFor` per person), `weakest`, `carried`, `prayerRoll`, `healthRoll` and `blindSpots` on every render — and it re-renders on every store change because it uses `useStore()` bare (`Overview.tsx:40`).

**Why it matters:** this is exactly the "is it frozen?" feeling. With Sam's 40 people and a year of sessions, typing in a note will drop frames.

#### SPD-4 · Optimistic UI is right, but the loading vocabulary is inconsistent — **Med / S**

Writes are correctly optimistic (store updates immediately, sync is debounced 600ms). Good.

But loading states use three different treatments with no rule: `LoadingSplash` (icon + 3 pulsing bars + "Loading your org…"), `PaneFallback` (`App.tsx:53` — bar + two blocks), `ProfileFallback` (`EntitySurface.tsx:30` — avatar-shaped, well done), and the AI brief skeleton (`Overview.tsx:215`). Nothing shares a skeleton primitive; each is bespoke markup with hand-tuned `animation-delay` values.

#### SPD-5 · The heaviest chunk is on the default route — **Med / S**

React Flow, the org table and the session editor are correctly code-split (`App.tsx:35-51`, with a good comment explaining why). But `DEFAULT_TAB = "tree"` means the React Flow chunk is on the critical path for every cold open — and on mobile it's downloaded and then never rendered, because the mobile branch uses `TableView`.

---

### 3.4 Reliability

#### REL-1 · Sync status is tracked and never shown — **High / S**

`SyncStatus` is defined (`useStore.ts:99`), initialized (`:669`), and set to `"saving"` / `"idle"` around every write (`:1742-1750`). Grep for `syncStatus` outside the store: **no results**. It is rendered nowhere.

Compounding it, the most recent commit is *"Drop the sync error toast and retry cloud saves silently."* Sync failures now do exactly this (`useStore.ts:1747-1751`):

```
console.error("LeadWell: cloud sync failed", e);
scheduleSyncRetry(userId);
useStore.setState({ syncStatus: "idle" });   // ← reports idle on failure
```

Note the state is set to `"idle"`, not `"error"` — so even if something rendered it, a failure would read as "saved."

**Why it matters:** this is the trust finding. Marcus writes four sentences about a hard conversation, in a parking garage, then closes the app. There is no signal — not a spinner, not a check, not a warning — telling him whether it landed. The retry backoff is good engineering. Silence about it is a UX failure. One perceived loss and he goes back to Notes.app permanently.

#### REL-2 · Offline is a dead end — **High / M**

The service worker caches the shell and hashed assets well (`public/sw.js`), and there's an `offline.html`. So the installed PWA *opens* offline. But `bootstrap()` immediately hits Supabase, fails, and lands on `LoadErrorScreen` — "We couldn't load your org."

There is no read cache (see SPD-1) and no write queue: edits made while offline live only in memory. The `pagehide` flush (`useStore.ts:1795`) fires an async `fetch` with no `keepalive` and no `sendBeacon`, which the browser is free to abandon.

**Combined failure:** Marcus writes notes in a basement office with no signal, backgrounds the app, iOS reclaims the tab. The notes are gone and nothing ever told him.

#### REL-3 · No undo, anywhere — **Med / M**

Grep for undo across the codebase returns three results: the copy string "This can't be undone" in `ConfirmDialog.tsx:77` and `MeetingProfile.tsx:211`, and one unrelated "Undo" button in `PrepPanel.tsx:105` (which reverses a `noMeeting` flag).

There is no undo stack, no toast-with-undo, no soft-delete. Every deletion is immediate and permanent — and since writes sync in 600ms, unrecoverable within a second.

#### REL-4 · Roughly half of destructive actions skip confirmation — **High / S**

`confirmAction()` is used at 13 sites across 8 files. Deletes with **no confirmation and no undo** include:

| Action | Site |
|---|---|
| `deleteGoal` | `PersonProfile.tsx:272` — an `X` that appears on hover, immediate |
| `deleteTopic` | `TopicBoard.tsx:294` |
| `deleteTeamAction` | `TeamProfile.tsx:330/333/345/349` |
| `deleteTeamGoal` | `TeamProfile.tsx:395` |
| `deleteTeamNote` | `TeamProfile.tsx:674` |
| `deleteWin` | `WinsLedger.tsx:80` |
| `deleteNote` | `NotesPanel.tsx:99` |
| `deletePrayerEntry` | `Prayer.tsx:663` |
| `deleteDomain` | `forms.tsx:758` |

`deleteNote` and `deleteTeamNote` remove written prose. `deletePrayerEntry` removes a prayer record — content that, for Persona A, may be the most personally significant data in the app.

The `X` buttons are also `opacity-0 … group-hover:opacity-100 touch:opacity-100` (`PersonProfile.tsx:271`) — meaning **on touch they are permanently visible**, sitting 4-8px from the content they destroy, with no confirmation.

#### REL-5 · No transient feedback channel exists — **High / M**

There is no toast/snackbar system in the codebase. Grep for `toast|Toast|sonner`: nothing. (`theme.css` even references Sonner's breakpoint in a comment — the dependency was considered and not taken.)

This is the structural reason REL-1, REL-3 and REL-4 are all unsolved: there is nowhere to put "Saved", "Couldn't save — retrying", or "Deleted · Undo".

#### REL-6 · Error handling is present at the boundaries, absent in the middle — **Med / S**

Well handled: `LoadErrorScreen` with retry + exponential backoff (`AppChrome.tsx:192`, `useStore.ts:1675`), the phase model correctly distinguishing "signed out" from "network failed" (with a good comment about tunnels), `online`/`visibilitychange` recovery (`useStore.ts:1800-1815`), `Login` error state.

Not handled: `storage.save` quota failure is `console.error` only (`storage.ts:28`) — the likely trigger is a large photo via `PhotoPicker`. Component-level `setError` exists in only 7 of 60 components.

#### REL-7 · Empty states are good and worth preserving — **Low**

Genuinely well written and specific to the persona: *"Nobody on the list yet. Open anyone — or a whole team — and take them up in prayer; they'll show up here and on the canvas."* (`Overview.tsx:385`). *"Nothing is measured until you do."* (`PrepPanel.tsx:80`). Keep this voice; it's an asset.

---

### 3.5 Keyboard readiness

#### KBD-1 · Canvas nodes are not keyboard-operable — **High / M**

Every node is a `<Card>` — a plain `<div>` (`ui.tsx:71`) — with `onClick` and `cursor-pointer`: `MeNode` (`OrgTree.tsx:1186`), `ManagerNode` (`:1239`), `TeamNode` (`:1348`). No `role="button"`, no `tabIndex`, no `onKeyDown`.

React Flow makes node wrappers focusable, but Enter/Space on the wrapper does not trigger the inner `div`'s `onClick`. So on the app's default screen, a keyboard user can move focus around the canvas and cannot select anything.

#### KBD-2 · Escape is implemented per-component, inconsistently — **High / M**

Escape handlers exist in 11 files. Three profiles (`PersonProfile.tsx:119`, `TeamProfile`, `ManagerProfile`) each duplicate the same ~25-line effect, including the same hand-maintained guard list:

```
if (modal || askAIOpen || settingsOpen || editingAssessments ||
    editingPerson || fillingProfile) return;
```

Consequences:
- `MeProfile` and `MeetingProfile` have **no** Escape handler — Escape closes the person/team/manager panel but not the Me or Meeting panel.
- The guard list is per-component. Any new overlay must be added to three separate lists or Escape will close the panel *behind* the open overlay.
- There is no dismiss stack. Ordering is emergent.

#### KBD-3 · Create and delete have no keyboard path — **High / M**

Create: the only entry points are the three canvas `<Panel>` buttons. They are real `<Button>`s and reachable by Tab — but only after tabbing through the React Flow canvas, minimap and controls, and only on desktop.

Delete: no `Delete`/`Backspace` binding on any selection. `deleteKeyCode={null}` is explicitly set on React Flow (`OrgTree.tsx:519`), so the canvas doesn't handle it either. Every delete requires locating a hover-revealed `X`.

#### KBD-4 · Reorder is pointer-only except in one place — **Med / M**

`use-card-drag.ts` is a good pointer-events implementation (mouse-on-move, touch-on-hold) and its doc comment is explicit: *"Callers still owe the accessible path."*

`TopicBoard` pays that debt properly — a `<select>` "Move to" on every card (`TopicBoard.tsx:491-500`), correctly labeled. **This is the pattern to copy.**

Nothing else does. Canvas node positions are drag-only (`onNodeDragStop`, `OrgTree.tsx:507`). Team `order` and topic `order` have no keyboard reorder. There is no "move person to another team" UI at all despite `movePerson` existing in the store (`useStore.ts:1300`).

#### KBD-5 · Shortcuts exist but discoverability is partial — **Med / S**

Implemented: `←`/`→` sibling paging and `⌘↵` peek↔focus (`EntityChrome.tsx:190-220`), `1`–`4` tree modes and `⇧1`–`⇧9` domain filters (`OrgTree.tsx:253-263`), `⌘↵` to save a note (`NotesPanel.tsx:73`), `⌘⇧M` editor mode (`SessionEditor.tsx:96`), panel resize via arrows on the separator (`EntitySurface.tsx:204`).

Discoverable: tree mode and domain shortcuts render `<kbd>` chips. `⌘↵` appears in two tooltips.

Not discoverable: `←`/`→` paging has no visible hint — the pager buttons' tooltips say "Previous — Name" with no key. Panel resize by keyboard is invisible. There is no shortcut reference anywhere — no `?` overlay, no Settings section, no help.

**Why it matters:** Dana would use all of these daily. She will discover none of them.

#### KBD-6 · Focus management gaps in the hand-rolled overlay — **Med / S**

`ui.tsx` `Modal` is built on React Aria's `ModalOverlay`/`Dialog`, so focus trap, scroll lock, Escape and restore are correct. `ConfirmDialog` inherits all of it. This is solid.

`HeaderOverflow` (`AppChrome.tsx:112-157`) is hand-rolled: `role="menu"` + `role="menuitem"` are set, and Escape and outside-pointerdown are handled — but there is no focus trap, no arrow-key navigation between items, and no focus return to the trigger on close. It's the only overlay on the mobile header.

#### KBD-7 · No visible focus ring on 84 raw buttons — **Med / M**

See VIS-5. Tab order is largely correct (semantic elements, no positive `tabIndex`), but the ring is inconsistent, which makes keyboard navigation feel broken even where it works.

---

### 3.6 Mobile readiness

**Fair framing first:** mobile has had serious, competent investment. `touch:`/`hoverable:` custom variants (`index.css:22-23`), safe-area utilities (`pad-safe-top/bottom/x`), an iOS edge-back gutter over the React Flow canvas (`OrgTree.tsx:499`), keyboard-inset handling (`use-keyboard-inset.ts`), swipe-to-dismiss sheets and swipe paging (`use-sheet.ts`), a landscape-phone chrome-compaction block (`index.css:1487-1533`), and a documented 16px iOS-zoom floor on every typing surface (`index.css:1547+`). The bottom nav exists because *"a top tab bar is the least thumb-reachable zone on a handset."*

The problem is not effort. It's that **none of it is systemic** — each protection is an allowlist a new component has to be manually added to.

#### MOB-1 · Cannot create anything on a phone — **High / M**

See IA-1. This is the top mobile finding.

#### MOB-2 · Touch correctness is a hand-maintained allowlist — **High / L**

`index.css:1547-1636` is literally a list of class names that get `font-size: 16px` and `min-height: 44px`:

```
.field-input.field-input, .field-input--sm.field-input--sm,
.meeting-editor-transcript…, .notion-markdown-source…,
.meeting-editor-point…, .prayer-text…, .prayer-card-field…
```

The selectors are doubled (`.x.x`) purely to win a specificity fight the file documents in a 10-line comment. Any new component that doesn't join the list silently ships a 13px field that zooms iOS Safari and never zooms back.

Same shape in TSX: `min-h-11` appears 64 times as a manual per-element floor rather than a size prop; `touch:` appears in 29 files but not the other 31.

#### MOB-3 · Confirmed tap targets below the 44px floor — **High / S**

| Target | Approx. height | Site |
|---|---|---|
| CliftonStrengths theme chips — 34 of them, `gap-1` (4px), in a `max-h-36` scroll box | ~22px | `AssessmentEditor.tsx:177` |
| Selected Top-5 chips (tap to remove — destructive) | ~22px | `AssessmentEditor.tsx:160` |
| Calendar topic chips | ~19px | `MeetingCalendar.tsx:337` |
| Calendar day dropdown items | ~26px | `MeetingCalendar.tsx:349` |
| "Leads <team>" chips in the person header | ~21px | `PersonProfile.tsx:196` |

`AssessmentEditor` is the worst: it's a 34-target grid at 22px with 4px gutters, and it sits on the primary onboarding path ("Or enter assessments manually"). It is effectively unusable with a thumb.

#### MOB-4 · Landscape compaction disables the touch floor by design — **Med / S**

`index.css:1509-1524` sets `[role="tab"] { min-height: 2rem !important }` and chrome buttons to `1.75rem !important` in landscape phones. The comment is honest about the trade: *"in landscape the pointer is still a finger, but height is the scarcer resource."*

The trade is defensible; 28px is not. It also hides the entity header entirely (`.entity-header { display: none }`), which removes the avatar, role, team, and next/last meeting dates — the context Marcus is holding in his head.

**Better shape:** make the entity header collapse to a single line rather than disappear, and hold tabs at 36px minimum.

#### MOB-5 · The mobile Tree tab buries content under four filter rows — **Med / S**

See IA-7.

#### MOB-6 · Hover-only affordances that "solve" touch by staying visible — **Med / S**

The pattern `opacity-0 touch:opacity-100 group-hover:opacity-100` appears throughout (`PersonProfile.tsx:271`, `OrgTree.tsx:1278/1392/1578`, `TopicBoard.tsx:470`). On desktop, controls hide until hover. On touch they're permanently visible — which is correct for discoverability but means dense rows on a phone carry permanently-visible destructive `X` buttons a few pixels from their content, with no confirmation (REL-4).

#### MOB-7 · Four of five mobile destinations are tables — **Med / M**

See IA-2 / §1.1. Wide tabular data on a 375px screen is the hardest layout to get right, and it's most of the mobile app. `PeopleTable` does render a card list on mobile (`PeopleTable.tsx:124`) — that's the right instinct; `TableView` and `MeetingsTable` should follow.

#### MOB-8 · Swipe paging competes with scroll and system gestures — **Low / S**

`useSwipePager` is bound to both `PeekPanel` (`EntitySurface.tsx:231`) and `FocusView` (`FocusView.tsx:25`), paging to the next teammate. Inside a mode with horizontally scrollable content — the `EntityModeTabs` strip is `overflow-x-auto` (`EntityModeTabs.tsx:35`), `TopicBoard` is a horizontal column strip — a horizontal swipe is ambiguous. Worth a hands-on check on device.

---

## 4. Prioritized quick wins

High impact, low effort, low risk. Safe to do before any design pass, and none of them depend on the structural work in §5.

| # | Fix | Category | Effort | Impact |
|---|---|---|---|---|
| **Q1** | **Add a sync indicator.** Render the `syncStatus` that already exists, and set it to `"error"` on failure instead of `"idle"` (`useStore.ts:1750`). A dot in the header: saving / saved / retrying. | REL-1 | S | Highest trust return in the audit |
| **Q2** | **Persist the doc to localStorage on every successful sync**, and hydrate from it at boot into `phase: "ready"` before revalidating. `lib/storage.ts` and the seam already exist. | SPD-1, REL-2 | S–M | Instant cold start; app works offline |
| **Q3** | **Add a toast primitive.** Unblocks Q4, undo, and every "couldn't save" message. Nothing exists today. | REL-5 | S | Unblocks 3 other findings |
| **Q4** | **Route the 9 unconfirmed deletes through `confirmAction()`** (REL-4 table), starting with `deleteNote`, `deleteTeamNote`, `deletePrayerEntry`. | REL-4 | S | Prevents silent loss of written content |
| **Q5** | **Change `DEFAULT_TAB` to `"overview"`** (`routes.ts:44`). One line. Lands every persona on the screen that answers their actual first question, and drops React Flow off the critical path. | IA-3, SPD-5 | S | Better first 5 seconds for all three personas |
| **Q6** | **Add create buttons to the mobile Tree/Table surfaces** — a floating or header "+" that opens the existing `openModal({kind})` flows. Modals already work on mobile. | IA-1, MOB-1 | S–M | Removes a hard dead end |
| **Q7** | **Fix the confirmed sub-44px tap targets** (MOB-3 table), starting with `AssessmentEditor`. | MOB-3 | S | Makes onboarding usable one-handed |
| **Q8** | **Add selectors to the 10 hottest `useStore()` calls** — `Overview`, `TableView`, `PeopleTable`, and the four `OrgTree` node components — and wrap the node components in `React.memo`. | SPD-2 | S | Kills the "is it frozen" feel |
| **Q9** | **Wrap `Overview`'s derived values in `useMemo`.** Zero exist today; the data is all there. | SPD-3 | S | Overview is the new default tab |
| **Q10** | **Make canvas nodes keyboard-operable** — `role="button"`, `tabIndex={0}`, `onKeyDown` for Enter/Space on the three node `<Card>`s. | KBD-1 | S | Unblocks keyboard use of the primary screen |
| **Q11** | **Add a `?` shortcut overlay** listing the shortcuts that already work, and add key hints to the pager tooltips. | KBD-5 | S | Dana finds features that already exist |
| **Q12** | **Add `role="menu"` focus trap + arrow keys to `HeaderOverflow`**, or replace it with the React Aria menu the design system already ships. | KBD-6 | S | Only overlay on the mobile header |

---

## 5. Structural work — needs a real design pass

These are not quick fixes. Each needs a decision, then a sequenced build. Ordered by leverage.

### S1 · Adopt the token layer that already exists — **L**

The work is not building a design system; it's *connecting the one that's already there*. `theme.css` is complete and correct; `components/base/**` already consumes it. The migration is app components → semantic tokens.

Sequence:
1. Define ~8 semantic aliases mapping to what the app actually uses (`text-primary`, `text-secondary`, `text-muted`, `bg-surface`, `bg-subtle`, `border-default`, `border-subtle`, `accent`).
2. Codemod the 1,240 `stone-*` + `dark:stone-*` pairs. Most are mechanical.
3. Delete the `dark:` variants as they're replaced — that's roughly half the class strings in the app.

**Payoff:** dark mode becomes correct by construction; theming becomes a token change; VIS-1/2/3/4 stop regenerating.

### S2 · Collapse the writing surfaces from nine to two — **L**

Decide the contract: **one fast in-place editor** (the `InlineSessionEditor` idea — tick the agenda, type two lines) and **one full editor** (TipTap, the same document, promoted by a single consistent affordance). Retire `FullScreenMarkdown`, `WritingPad`, and the duplication between `OccurrenceNotesPanel` / `OccurrenceNotesSheet`. `MeetingEditor` (576 lines + 24 bespoke CSS classes) should be folded into the full editor or deleted.

This is the highest-value IA change for Persona A, because writing up a meeting is the action they perform most.

### S3 · Collapse the nav from five destinations to four (or three) — **M**

- Merge `people` into `table` as a saved filter.
- Consider whether `tree` and `table` are two views of one destination with a view toggle, since on mobile they already are.
- Spend the freed slot on a **Today/Now** surface: what's next, who needs prep, who I haven't prayed for. Overview is 80% of this already; it just isn't framed as the home.

### S4 · Unify the entity sub-navigation — **M**

Bring `meeting` and `me` onto the five-mode contract, or amend `entityModes.ts` to describe the real, deliberate variation. Either is fine; three undocumented vocabularies is not. Resolve the "Notes" collision (person-notes vs. meeting write-up) with distinct nouns.

### S5 · Build a real dismiss/undo layer — **M**

One dismiss stack replacing 11 per-component Escape handlers and their hand-maintained guard lists. A single toast host with undo, backed by soft-delete or a short-lived action log. This fixes KBD-2 and REL-3 together and stops the guard lists from rotting.

### S6 · Make touch correctness structural rather than an allowlist — **L**

Move the 44px floor and the 16px type floor into the component primitives (a `size` prop that is correct on touch by construction), so a new component inherits them instead of being added to `index.css:1547`. Then delete the allowlist and the doubled-selector specificity hack. This also lets the landscape overrides be a deliberate design decision rather than an `!important` fight.

### S7 · Global search / command palette — **M**

One entry point to reach any person, team or meeting by name. `⌘K` for Dana, a persistent search field in the mobile header for Marcus. Replaces three per-table local search states.

---

## 6. What to protect

Findings tend to read as a list of what's wrong. These are load-bearing and should survive any refactor:

- **The routing model.** URL as source of truth, peek/focus as a route change, one-directional sync. It's better than most commercial apps and it's why every entity is deep-linkable and back-button-safe.
- **`EntityChrome`.** One breadcrumb + pager + promote for every entity kind. Correct abstraction.
- **The five-mode contract** in `entityModes.ts` — including the reasoning in its doc comment. Extend it; don't abandon it.
- **`ConfirmDialog`** — async, non-blocking, in-app, on React Aria. Right in every respect. Just use it more.
- **`PrepPanel`'s "the checklist *is* the score"** — no hidden weights, four named things, each one click from fixed. This is the app's best single idea.
- **The empty-state and microcopy voice.** Specific, warm, non-nagging.
- **`TopicBoard`'s "Move to" select** as the accessible counterpart to drag. This is the exact pattern the rest of the app needs.
- **The comments.** The codebase explains its own reasoning better than most design docs. That's why this audit could be written from the source alone.

---

## 7. Implementation log — 2026-08-13

Worked through [`design-audit-implementation-prompt.md`](./design-audit-implementation-prompt.md) on branch `design-remediation`. **Phases 1–4 shipped. Phases 5–7 did not start.**

### Shipped

| Phase | Commit | Findings closed |
|---|---|---|
| 1 — Trust | `f44f8d5` | REL-1, REL-2, REL-4, REL-5, REL-6, SPD-1 |
| 2 — Speed | `18affd6` | SPD-2, SPD-3, SPD-4, SPD-5, IA-3 |
| 3 — Mobile | `a2ef580` | IA-1, MOB-1, MOB-3, MOB-4, MOB-5, IA-7 |
| 4 — Keyboard | `dfac8dc` | KBD-1, KBD-2, KBD-3 (partial), KBD-4, KBD-5, KBD-6, KBD-7 |

Notable beyond the brief: the five entity modals were rendered *inside* `OrgTree`, so `openModal` only did anything while the tree tab was mounted. That was the real reason create was desktop-only, and it needed a `ModalHost` at the app root before any header control could work.

### Corrections to this audit

- **REL-4** listed nine unconfirmed deletes. Two already confirmed: `deletePrayerEntry` (`Prayer.tsx`) and `deleteDomain` (`forms.tsx`). Left alone.
- **MOB-7 / 3.6** says `TableView` and `MeetingsTable` render wide tables on mobile. Both already have card/list layouts below their breakpoints (`TableView.tsx` `MobileRecordCard`, `MeetingsTable.tsx` `sm:hidden` list). No change needed.

### Declined, with reasons

- **SPD-5, second half** — "only load the React Flow chunk when the tree tab is reachable". Avoiding the *import* requires extracting the canvas, the node components, the layout machinery and their helpers out of `OrgTree.tsx` — effectively all of it, which §"Out of scope" forbids. `DEFAULT_TAB = "overview"` already takes React Flow off the critical path for every cold open; what remains is a ~217KB download for a mobile user who taps Tree. Worth doing behind its own decision.
- **The two `if (!text) deleteTeamAction(id)` blur handlers** — deleting an action whose text you just erased is the intended outcome. An undo toast there is noise.

### Phase 5 — partially shipped

**The blocking question was answered: point the semantic tokens at `stone`.**

`theme.css` defined its tokens against `--color-neutral-*`, which this repo
never defined, so they fell through to Tailwind's default `neutral` — a pure
grey — while all 60 app components hard-coded warm `stone`. The ramp is now
aliased to stone once, at the top of `theme.css`, which makes the migration a
refactor rather than a redesign.

One consequence worth recording: Untitled UI's dark block makes `bg-primary`
the *darkest* surface, while this app raises surfaces in dark (a card is
`dark:bg-stone-900` on a `dark:bg-stone-950` page — the iOS/Material
convention). The two dark definitions are swapped so `components/base/**`
follows the app's elevation model rather than fighting it.

| Item | State |
|---|---|
| 5.1 Connect the token layer | **Done** — 339 exact pairs across 48 files; 1,154 raw `stone-*` → 508 |
| 5.2 Type scale | **Done** — one `--text-caption` step at 11px; all 152 `text-[Npx]` gone |
| 5.3 Migrate raw controls onto primitives | **Not started** — 84 buttons, 27 inputs |
| 5.4 Retire the fourth vocabulary | **Partly** — the touch allowlist and the doubled-selector hack are gone; `.field-input` and the other ~150 bespoke classes remain |
| 5.5 Structural touch correctness | **Done** — element-based floors replace the allowlist |
| 5.6 Iconography | **Done** — structural emoji are icons; tone-carrying ones kept |

Only exact light/dark matches were converted. An earlier pass mapped four
near-matches (`dark:text-stone-100` → `text-primary`, whose dark value is
stone-50) and was reverted: a near-match is a visual change, not a refactor.
That is also why `text-primary` and `text-secondary` show zero conversions —
the app never used those exact pairs.

**Verification.** All 18 token/theme combinations were measured in the running
app and resolve to exactly the stone value they replaced. A colour fingerprint
across 9 venues in both themes is identical in 17 of 18 (the 18th differs only
by which table rows were expanded). On a coarse pointer there are zero fields
under 16px and zero targets under 44px across six venues, and a brand-new
widget carrying a 13px class comes out 16px/44px with no CSS of its own.

**Deliberately not done:** the 43 manual `min-h-11`s stay. They apply at every
width; the structural floor is touch-only, so removing them would shrink
desktop controls.

### Phase 6 — mostly shipped

All four decision gates were answered in advance.

| Item | State |
|---|---|
| Nav collapse (IA-2) | **Done** — `/people` is a saved filter at `/table?type=person`; five tabs → four; Overview relabelled "Today" |
| Entity sub-navigation (IA-4) | **Done** — `meeting` and `me` on the five-mode contract; "Notes" collision resolved as person-Notes vs meeting-**Write-ups** |
| Meeting creation (IA-6) | **Done** — PrepPanel routes through `StartMeetingForm` instead of hardcoding `"weekly"` with no name |
| Undo stack (REL-3 / S5) | **Done** — six-deep, ⌘Z, shared with the per-action toast |
| Global search (IA-8 / S7) | **Done** — ⌘K, matches initials, routes through the selection setters |
| Editors (IA-5 / S2) | **Declined** — see below |

**The `me` kind carries one mode, not five.** The approved answer was to bring
both kinds fully onto the contract; a meeting genuinely takes three of the five,
but `me` has no meetings with itself, no record distinct from its own profile
and no sibling pager, so the contract gained an explicit `OMITS` list and the
reasoning for it rather than four empty tabs. `entityModeFor` clamps a mode a
kind doesn't have, so an old `?s=prayer` link on a meeting lands somewhere real.

**IA-5 (nine editors → two) was not attempted.** The audit's count includes
things that aren't surfaces. What actually exists is two editors —
`InlineSessionEditor` (fast, in place) and `SessionEditor` (full, Blocks ↔
Markdown) — plus two *engines* (`NotionBlockEditor`, `FullScreenMarkdown`), two
*placements* (`OccurrenceNotesPanel` and its sheet, which render `SessionEditor`
in a panel), one *page chrome* (`MeetingEditor`), and `WritingPad`/`NotesPanel`
for person notes, which is a different noun and stays.

So the contract is already close to the approved two. The one real
consolidation left is folding `MeetingEditor` — 576 lines of full-page chrome
carrying the agenda, topic board, transcript and AI structuring. Rebuilding
that is a design-and-build task on the action leaders perform most, with no
tests in the repo; it was left rather than half-done.

### Phase 7 — regression pass

- **Matrix:** 12 venues × light/dark = 24 combinations. All render, none
  overflow horizontally, no console errors.
- **Mobile matrix:** 6 venues × both themes at 375×812. No overflow, zero
  targets under 44px, zero fields under 16px, four nav tabs, toast clears the
  bottom nav.
- **Found and fixed one real regression.** Wiring the undo stack into
  `deleteWithUndo` created a `toasts ↔ undo` import cycle, which under Vite's
  module graph produced a second `toastQueue`: `<ToastHost />` stayed subscribed
  to one instance while every `toast()` landed in the other, so toasts silently
  stopped appearing. `deleteWithUndo` moved into `undo.ts` and the dependency
  now runs one way.
- **Voice check:** the empty states and the Phase 1 confirm bodies survive
  intact — "Nobody on the list yet…", "Nothing is measured until you do.",
  "Every tracked 1:1 is on track. 🎉", "What you wrote on {date} goes with it.",
  "It stops counting as evidence in your next review or ask."

### IA-5 revisited — the premise doesn't hold any more

The finding says nine writing surfaces, and that "the surface he gets depends on
whether he arrived from Overview, the person's Now tab, the Meetings tab, or the
meeting's Plan board". That was worth checking before rebuilding anything, and
it isn't what the code does.

There are **two** editors, and every placement of them renders the same parts:

| Surface | What it renders |
|---|---|
| `InlineSessionEditor` | `SessionAgenda` + plain fields — the fast in-place one |
| `OccurrenceNotesPanel` | `SessionAgenda` + `SessionEditor`, in a sheet |
| `MeetingEditor` | `SessionAgenda` + `SessionEditor`, full page, plus capture tools |

The other files the audit counted are not surfaces: `NotionBlockEditor` and
`FullScreenMarkdown` are the two *engines* behind `SessionEditor`'s Blocks and
Markdown modes, `OccurrenceNotesSheet` is the sheet chrome, and
`WritingPad`/`NotesPanel` are person notes — a different noun, kept.

So the approved contract — one fast in-place editor, one full editor promoted by
a consistent affordance — is what already ships. Arriving from any route gets
the same agenda and the same editor; only the chrome differs, and the full-page
placement additionally offers speech capture and AI structuring, which are
heavyweight and belong there rather than in a sheet.

**No code change made.** `MeetingEditor` is 561 lines because it mixes page
chrome with those capture tools, and extracting them into a
`SessionCaptureTools` component would be tidier — but that is refactoring for
tidiness, not for the problem the finding names, and it would touch the action
leaders perform most. Left deliberately, with the reasoning recorded here so the
question doesn't get re-opened from the audit's original premise.

### 5.4 — done

`.field-input` was 228 lines implementing an input from scratch alongside
`components/base/input/input.tsx`. Six call sites, all now on the primitive,
with `--ghost` expressed through its `wrapperClassName` seam. index.css is
1,719 → 1,478 lines and no longer mentions it anywhere.

### What is left
- **5.3** — 92 raw `<button>`s still bypass `Button`/`ButtonUtility`. This is now
  a consistency job rather than a correctness one: the zero-specificity
  `:focus-visible` floor in index.css already gives every one of them a ring,
  and the structural touch block already gives them a 44px box.

  **Most of them should not become `<Button>`.** The densest cluster — the
  health scan chips, the domain tabs, the prayer scans, the calendar filters —
  are `aria-pressed` toggle chips whose selected state is a *runtime* colour
  (`HEALTH_COLOR`, a domain's own colour). That is the case §5.1 explicitly
  exempts: runtime-coloured things stay inline, because a token can't carry
  user data. Pushing them through `Button` would either lose the colour or
  fight the primitive.

  What they actually want is a `ToggleChip` primitive of their own — pressed
  state, pill radius, touch sizing and an optional runtime accent, in one
  place instead of re-derived at each site. That is the shape of the remaining
  5.3 work, and it is a different job from "migrate onto Button".
- **The remaining bespoke CSS.** `.journal-*`, the TipTap/ProseMirror content
  styles and `.goal-range` are keepers. `.meeting-editor-*` (24 rules) goes if
  and when MeetingEditor's chrome is folded.
- **Still unverified from Phase 1** — cold start from cache, offline edit →
  reconnect, hard-quit-offline → reopen, and sign-out clearing the cache. These
  need `bootstrap()` against real Supabase, which needs `VITE_DEV_TEST_EMAIL`
  and `VITE_DEV_TEST_PASSWORD` in a gitignored `.env.local`.
