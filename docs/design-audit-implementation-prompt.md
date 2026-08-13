# LeadWell — Design Remediation Brief

**Companion to:** [`docs/design-audit.md`](./design-audit.md) — read it first; every finding ID below (`IA-1`, `REL-4`, `MOB-3`…) refers to a section there.

**How to use this document.** It is one brief in seven phases. Phases 1–4 are safe, sequenced, and independently shippable — run them in order without further input. Phases 5–7 are structural and each opens with a **Decision gate**: stop, ask, get an answer, then build. Do not skip a gate by picking the option this brief recommends.

Paste the whole thing to start, or paste a single phase to resume. Each phase is self-contained.

---

## Mission

LeadWell is a personal leadership app for people who lead people — pastors, execs, founders, managers. Its users are mobile, time-poor, interruption-prone, and not power users. The app's routing model and product thinking are strong; its **design system adoption, trust signals, and mobile write paths** are not.

Fix that without breaking what works.

---

## Non-negotiables

These are load-bearing. If a task seems to require changing one, stop and ask.

1. **The routing model stays.** URL is the source of truth for selection (`src/lib/routes.ts`, `useRouteSync` in `App.tsx:69`). Selection setters navigate; `applyRoute` writes back. One direction only. Peek↔focus is a route change, not a mode flag. Every entity stays deep-linkable and back-button-safe.
2. **`EntityChrome` stays.** One breadcrumb + sibling pager + close + promote for every entity kind (`src/components/EntityChrome.tsx`). Do not fork it per entity.
3. **`src/lib/storage.ts` stays the only module that touches localStorage.** Everything persisted goes through that seam. (Phil's explicit architectural rule.)
4. **The five-mode contract in `src/lib/entityModes.ts` is extended, never abandoned.** If a mode set must change, change the contract and its doc comment — don't add a fourth vocabulary.
5. **`PrepPanel`'s "the checklist *is* the score."** No hidden weights, no composite number. Four named checks, each one click from fixed.
6. **`ConfirmDialog`'s API stays** (`await confirmAction({...})`, single `<ConfirmHost/>` at root). Use it more, don't replace it.
7. **The comment voice stays.** This codebase explains *why*, not *what*. When you move or rewrite code, carry its reasoning comment with it. When you delete a component, don't delete an argument that's still true — move it.
8. **No new runtime dependencies** without asking. Everything below is buildable with what's installed (`react-aria-components@1.20` ships `Toast`/`ToastRegion`/`ToastQueue`; `tailwind-merge`, `zustand`, `@untitledui/icons` are all present).
9. **Do not touch the Supabase schema, RLS, or the Edge Function.** This is a client-side design pass.

---

## Working agreement

- **Verify per phase, not per file.** Run `npm run build` (`tsc -b && vite build`) — it must pass clean before any commit.
- **Drive the real app to check behavior.** Start the dev server via the preview tooling (`.claude/launch.json` exists; port 5173 with fallback). Sign in with the dev-only **"Continue as test user (dev)"** button on the sign-in screen — it appears when `VITE_DEV_TEST_EMAIL` / `VITE_DEV_TEST_PASSWORD` are set in gitignored `.env.local`. If the button is missing, ask Phil to add them. **Never attempt Google sign-in.** `window.useStore` is exposed in dev for reading/driving store state from the console.
- **Check both themes and both viewports on every visual change.** Light + dark, 375×667 and 1440×900. Dark mode is where this codebase breaks most often.
- **One commit per phase**, message given at the end of each phase. Branch off `master` first — do not commit to `master` directly.
- **Report honestly.** If a task turns out to be wrong, or bigger than described, say so and stop rather than half-doing it.

---

# Phase 1 — Trust

> **Covers:** REL-5, REL-1, REL-2, SPD-1, REL-4, REL-6
> **Why first:** a leader who suspects the app lost their notes stops using it. Nothing else matters if this isn't fixed. Also, the toast primitive in 1.1 unblocks three other findings.

### 1.1 — Build a toast host

There is no transient feedback channel in the app at all (grep `toast|sonner` → nothing). Build one on React Aria Components' `ToastRegion` / `ToastQueue` — the same primitive family `ui.tsx`'s `Modal` already uses, so focus and announcement behavior come for free.

- New file `src/components/Toast.tsx`: a `<ToastHost/>` mounted once in `App.tsx` beside `<ConfirmHost/>`, plus a module-level imperative API mirroring `confirmAction`'s shape:
  ```ts
  toast({ message, tone?: "neutral" | "error", action?: { label, onAction } })
  ```
- Position above the bottom nav on mobile (`pad-safe-bottom`, clear of `BottomNav`), bottom-right on `lg`.
- Must be announced to screen readers (RAC handles this) and dismissible.
- Errors persist until dismissed; neutral toasts auto-dismiss ~4s.

### 1.2 — Surface sync status

`SyncStatus` is defined (`useStore.ts:99`), set around every write (`:1742–1750`), and rendered nowhere.

- **Fix the lie first:** `useStore.ts:1750` sets `syncStatus: "idle"` inside the `catch`. Change to `"error"`. A failed save currently reports as saved.
- Add a small status affordance in the header (`App.tsx:198`, beside `Ask AI`): idle → nothing or a quiet check; `saving` → subtle pulse; `error` → an amber dot with an accessible label and a tooltip naming the state ("Not saved — retrying").
- On transition into `error`, fire one error toast: *"Couldn't save — we'll keep retrying."* On recovery, fire a neutral toast: *"Saved."* Do not toast on every successful debounced write.
- The existing retry/backoff machinery (`scheduleSyncRetry`, the `online` / `visibilitychange` recovery at `useStore.ts:1800–1815`) is correct — surface it, don't rewrite it.

### 1.3 — Cache the document locally

The doc is read from localStorage exactly once, in the legacy migration (`useStore.ts:531`), and **never written**. Only `dark` and `panelPct` persist. Cold start therefore always waits on 19 network round-trips (`repo.loadAll`, `repo.ts:611–666`) behind `<LoadingSplash/>`.

- After every successful `repo.syncData` and after `hydrate`, write the `PersistedData` snapshot through `storage.save(DATA_KEY, …)`. **Through the seam only** (non-negotiable #3).
- Key the cache by `userId` so a second account can't read the first's data. Clear it on `SIGNED_OUT`.
- At boot, if a cache exists for the resolved session's user, hydrate from it synchronously into `phase: "ready"` and revalidate in the background. Only show `<LoadingSplash/>` when there is genuinely nothing to show.
- Handle `storage.save` quota failure (`storage.ts:28` currently `console.error`s) — the likely trigger is a large photo from `PhotoPicker`. On quota failure, drop the cache and toast once; do not fail the sync.
- Guard the revalidation: if the background load returns and the user has edited since, the in-memory state wins. Do not clobber unsaved edits with cached or server data.

### 1.4 — Make offline survivable

With 1.3 done, the app opens and reads offline. Close the write gap.

- The `pagehide` flush (`useStore.ts:1795`) fires an async `fetch` the browser may abandon. Ensure the localStorage write from 1.3 happens **synchronously** in the same handler, so a backgrounded tab never loses the last 600ms of edits even if the network write is dropped.
- When a sync fails and the retry is pending, the cached doc is the source of truth on next boot — verify by hand: edit offline, hard-quit, reopen offline, confirm the edit is there.
- Leave `LoadErrorScreen` (`AppChrome.tsx:192`) in place for the genuinely-nothing-cached case. Its copy is good.

### 1.5 — Confirm every destructive action

`confirmAction()` is used at 13 sites. These delete written content with **no confirmation and no undo**:

| Action | Site |
|---|---|
| `deleteNote` | `NotesPanel.tsx:99` |
| `deleteTeamNote` | `TeamProfile.tsx:674` |
| `deletePrayerEntry` | `Prayer.tsx:663` |
| `deleteWin` | `WinsLedger.tsx:80` |
| `deleteGoal` | `PersonProfile.tsx:272` |
| `deleteTeamGoal` | `TeamProfile.tsx:395` |
| `deleteTopic` | `TopicBoard.tsx:294` |
| `deleteTeamAction` | `TeamProfile.tsx:330, 333, 345, 349` |
| `deleteDomain` | `forms.tsx:758` |

- **Prose-bearing deletes** (`deleteNote`, `deleteTeamNote`, `deletePrayerEntry`, `deleteWin`) → `await confirmAction(...)` with a body naming what's lost.
- **Cheap-to-recreate deletes** (`deleteTopic`, `deleteTeamAction`, `deleteGoal`, `deleteTeamGoal`) → no dialog; delete immediately and toast with **Undo** (from 1.1). Interrupting a leader with a modal to delete a one-line topic is its own failure.
- Undo implementation: keep the removed record in a closure and re-add it on action. A full undo stack is Phase 6 (S5); this is the per-action version.
- Write the confirm bodies in the app's existing voice — specific about what goes, not generic ("This can't be undone").

### Acceptance criteria

- [ ] `npm run build` passes clean.
- [ ] Editing a note with the network throttled to offline shows a persistent "Couldn't save — retrying" state; restoring the network clears it and shows "Saved".
- [ ] Hard-quit while offline, reopen while offline: the app renders your data, not `LoadErrorScreen`.
- [ ] Second cold load on a warm cache paints real content with no full-screen skeleton.
- [ ] Every row in the 1.5 table either confirms or offers Undo.
- [ ] Toast is reachable and dismissible on a 375px viewport without covering the bottom nav.
- [ ] Signing out clears the cached document.

**Commit:** `Make saving, offline and deletion legible to the user`

---

# Phase 2 — Speed

> **Covers:** SPD-2, SPD-3, SPD-4, SPD-5, IA-3
> **Why now:** Phase 1 makes Overview the screen people trust; Phase 2 makes it the screen they land on, and makes it fast enough to deserve that.

### 2.1 — Stop subscribing to the whole store

46 call sites use `useStore()` with no selector. Zustand's default equality compares the whole state object, which is a fresh reference after every `set()` — so all 46 re-render on **every** keystroke anywhere in the app.

Convert to selector form. Priority order (hottest first):

1. The four `OrgTree.tsx` node components — `MeNode` (~:1180), `ManagerNode` (~:1204), `TeamNode` (~:1348), and the person row — plus `OrgTree`'s own top-level subscription.
2. `Overview.tsx:40`
3. `TableView.tsx`, `PeopleTable.tsx`, `MeetingsTable.tsx`
4. `PersonProfile.tsx:54`, `TeamProfile.tsx`, `PrepPanel.tsx`, `SubjectMeetings.tsx`

Prefer several narrow `useStore(s => s.x)` calls over one object-returning selector (which needs a shallow comparator and is easy to get wrong). Then wrap the four node components in `React.memo` — there is currently **no `React.memo` anywhere in the codebase**.

### 2.2 — Memoize readiness

`readinessFor` → `readinessOf` → `meetingReadiness` + `meetingAgenda`, and each of those calls `sessionsFor()`, which filters and sorts **every session in the org** (`readiness.ts:274–278`, `:551`). It runs once per canvas node, per render, unmemoized.

- Add a memo layer in `src/lib/readiness.ts`: derive a `Map<meetingId, Session[]>` once per `(sessions)` identity and have `sessionsFor` read from it. Keep the exported signatures unchanged so no call site moves.
- At the component layer, wrap per-node readiness in `useMemo` keyed on the inputs that actually change.
- `today` is currently computed via `todayISO()` as a default arg at every call — hoist it so a render pass shares one value.

### 2.3 — Memoize Overview

`Overview.tsx` has **zero `useMemo`** and recomputes `needAttention` (a `flatMap` over `readinessFor`), `weakest`, `carried`, `prayerRoll`, `healthRoll`, `blindSpots`, `domainCounts` and `allLooseTopics` on every render — while subscribed to the whole store.

Wrap each in `useMemo` with honest dependency arrays. Do this **before** 2.5.

### 2.4 — One skeleton primitive

Four bespoke loading treatments with hand-tuned `animation-delay` values: `LoadingSplash` (`AppChrome.tsx:165`), `PaneFallback` (`App.tsx:53`), `ProfileFallback` (`EntitySurface.tsx:30`), the AI brief skeleton (`Overview.tsx:215`).

Extract a `<Skeleton>` primitive (line / block / circle, shared pulse and stagger) and rebuild all four on it. Keep `ProfileFallback`'s avatar-shaped layout — it's the best of the four and the pattern to generalize.

### 2.5 — Land on Overview

Change `DEFAULT_TAB` from `"tree"` to `"overview"` (`src/lib/routes.ts:44`).

Rationale: none of the three personas opens the app to ask "who sits under what." Overview already answers their real first question, it's the lightest screen, and this takes the React Flow chunk off the critical path for every cold open — including mobile, where it's downloaded and then never rendered (the Tree tab's mobile branch delegates to `TableView`, `OrgTree.tsx:485`).

Also: only load the React Flow chunk when the tree tab is actually reachable — below `lg` it never renders.

### Acceptance criteria

- [ ] `npm run build` passes clean.
- [ ] With React DevTools Profiler recording, typing a character into a person's note re-renders the editor and its panel — **not** the canvas nodes, Overview, or any table.
- [ ] Cold open paints Overview content in under ~1s on a warm cache.
- [ ] All four loading states use the shared primitive and look like one family.
- [ ] Deep links to `/tree`, `/table`, `/people`, `/meetings` still work; only the bare `/` default changed.

**Commit:** `Cut re-render and recompute cost, and land on the screen leaders actually open`

---

# Phase 3 — Mobile

> **Covers:** IA-1, MOB-1, MOB-3, MOB-4, MOB-5, MOB-6, MOB-7 (partial), IA-7
> **Context:** mobile has had real, competent investment already — `touch:`/`hoverable:` variants, safe-area utilities, the iOS edge-back gutter, keyboard-inset handling, swipe sheets, the landscape compaction block, the 16px iOS-zoom floor. **Do not rip any of it out.** The problem is that it's a hand-maintained allowlist, plus one hard dead end.

### 3.1 — Make create possible on a phone *(the top mobile finding)*

All nine `openModal({kind: "person"|"team"|"manager"})` call sites live in `OrgTree.tsx`, and the three primary ones (`OrgTree.tsx:540–553`) are inside the React Flow `<Panel>`, which is inside the `hidden … lg:flex` branch (`:490`). The mobile branch renders `filterRow` + `TableView`; `filterRow` (`:433–471`) has no create affordances and `TableView.tsx` has **none of any kind**.

Result: on a phone you cannot add a person, a team, or a manager. A new user installing the PWA on their phone cannot create their first team.

- Add a single create affordance reachable from every mobile venue. Recommended: a `+` in the app header (`App.tsx:198`) opening a short action sheet — Add person / Add team / Add manager — wired to the **existing** `openModal` flows, which already work on mobile.
- Header placement, not a floating action button: the FAB would collide with the bottom nav and the swipe-dismiss sheets.
- Empty-state fallback: when there are no teams at all, `TableView` / the Tree tab should render a real empty state with a create button, not an empty list.
- Do not duplicate the modal forms. `forms.tsx` already handles all three kinds.

### 3.2 — Fix the confirmed sub-44px tap targets

| Target | Approx. height | Site |
|---|---|---|
| CliftonStrengths picker — 34 chips, `gap-1` (4px), inside `max-h-36` scroll | ~22px | `AssessmentEditor.tsx:177` |
| Selected Top-5 chips (tap removes — destructive) | ~22px | `AssessmentEditor.tsx:160` |
| Calendar topic chips | ~19px | `MeetingCalendar.tsx:337` |
| Calendar day dropdown items | ~26px | `MeetingCalendar.tsx:349` |
| "Leads &lt;team&gt;" chips in person header | ~21px | `PersonProfile.tsx:196` |

`AssessmentEditor` is the worst and it's on the primary onboarding path ("Or enter assessments manually"). A 34-target grid at 22px with 4px gutters is not thumb-operable.

- Apply the `touch:` variant to raise these to a 44px box (padding, not larger glyphs, so desktop visual weight is unchanged — the pattern already used at `OrgTree.tsx:652`).
- For `AssessmentEditor` specifically, reconsider the layout on touch: a 34-item chip cloud in a 144px scroll box is the wrong control for a phone regardless of target size. A searchable list is better. If that's more than a small change, raise it and do the target fix now.

### 3.3 — Landscape: compact, don't delete

`index.css:1487–1533` handles landscape phones. Two things go too far:

- `[role="tab"] { min-height: 2rem !important }` and chrome buttons at `1.75rem !important` — the trade (height is scarcer than pointer precision) is defensible; 28px is not. Hold a 36px floor.
- `.entity-header { display: none }` removes the avatar, role, team, and next/last meeting dates — exactly the context a leader is holding in their head mid-meeting. Collapse it to a single line (avatar + name + role) instead of hiding it.

### 3.4 — Unbury the mobile Tree tab

`filterRow` (`OrgTree.tsx:433`) stacks `ModeBar` + domain tab strip + "Manage domains" + `ReadinessSummary` + `HealthScan` + `PrayerScan` above the content. On 375×667 that's most of the viewport before a single name appears.

Keep `ModeBar` (it's the primary control and the readme argues correctly for it). Collapse the rest behind a single "Filters" disclosure on mobile, showing an active-filter count when any are set. The scans stay one tap away, not zero — but the org appears immediately.

### 3.5 — Reconcile permanently-visible destructive controls with confirmation

`opacity-0 touch:opacity-100 group-hover:opacity-100` (`PersonProfile.tsx:271`, `OrgTree.tsx:1278/1392/1578`, `TopicBoard.tsx:470`) is correct for discoverability but means dense mobile rows carry always-visible `X` buttons a few pixels from their content. Phase 1.5 gives all of these either a confirm or an undo — **verify on a phone** that every one of those `X`es is now safe, and that its target is 44px.

### 3.6 — Card layouts for the remaining tables

`PeopleTable.tsx:124` already renders a card list below `lg` — the right instinct. `TableView` and `MeetingsTable` still render wide tabular data on 375px. Give them the same treatment.

(If Phase 6's nav collapse removes `PeopleTable`, its mobile card layout is the thing to keep and generalize.)

### Acceptance criteria

- [ ] `npm run build` passes clean.
- [ ] On a 375×667 viewport, from a cold start with zero data, you can create a team, then a person, then a manager — without rotating or resizing.
- [ ] Every target in the 3.2 table measures ≥44×44 with a coarse pointer.
- [ ] Landscape phone: tabs ≥36px, entity header present as one line.
- [ ] Mobile Tree tab shows at least one person's name above the fold.
- [ ] `TableView` and `MeetingsTable` are readable at 375px without horizontal scrolling.

**Commit:** `Make the phone a place you can create, not just read`

---

# Phase 4 — Keyboard

> **Covers:** KBD-1, KBD-2, KBD-3, KBD-4, KBD-5, KBD-6, KBD-7 (partial)
> **Persona:** Dana — VP of Ops, laptop, keyboard-first for anything she does twice a day.

### 4.1 — Make canvas nodes operable

Every canvas node is a `<Card>` — a plain `<div>` (`ui.tsx:71`) — with `onClick` and `cursor-pointer`: `MeNode` (`OrgTree.tsx:1186`), `ManagerNode` (`:1239`), `TeamNode` (`:1348`). No `role`, no `tabIndex`, no `onKeyDown`. React Flow focuses the node wrapper, but Enter/Space there does not reach the inner div's handler. On the app's most complex screen, a keyboard user can move focus and select nothing.

- Give the clickable node surface `role="button"`, `tabIndex={0}`, and Enter/Space handling, or convert it to a real `<button>` wrapper. Preserve React Flow's own drag behavior — check the `nodrag` class usage at `:1278/:1392/:1578` still works.
- Add a visible `focus-visible` ring consistent with the design system's.

### 4.2 — One dismiss stack

Escape is implemented in 11 files. `PersonProfile.tsx:119`, `TeamProfile`, and `ManagerProfile` each duplicate the same ~25-line effect with the same hand-maintained guard list:

```ts
if (modal || askAIOpen || settingsOpen || editingAssessments ||
    editingPerson || fillingProfile) return;
```

Consequences: `MeProfile` and `MeetingProfile` have no Escape handler at all (Escape closes a person panel but not the Me panel); any new overlay must be added to three separate guard lists or Escape closes the surface *behind* it; there is no defined ordering.

- Build a small dismiss registry: overlays push a dismiss handler on mount, pop on unmount; one global Escape listener calls the top of the stack.
- Delete the 11 ad-hoc handlers and all three guard lists.
- `ui.tsx`'s `Modal` and `ConfirmDialog` get their Escape from React Aria — they should register with the stack for *ordering* but keep RAC's focus trap and restore. Don't reimplement those.
- Verify: with an assessment editor open inside a person peek, Escape closes the editor first and the peek second.

### 4.3 — Keyboard paths for create and delete

- **Create:** with 3.1 done, the header create control is a real button in the natural tab order from any venue. Give it a shortcut and show it in 4.5.
- **Delete:** no `Delete`/`Backspace` binding exists on any selection, and `deleteKeyCode={null}` is explicitly set on React Flow (`OrgTree.tsx:519`) so the canvas doesn't handle it either. Every delete requires finding a hover-revealed `X`. Add a keyboard path — at minimum, make every hover-revealed `X` reachable by Tab with a visible focus ring, and consider `Delete` on a focused node routing to the same confirm flow from Phase 1.5.

### 4.4 — An accessible path for every drag

`use-card-drag.ts` is a good pointer implementation and its doc comment is explicit: *"Callers still owe the accessible path."*

`TopicBoard` pays that debt properly — a labeled `<select>` "Move to" on every card (`TopicBoard.tsx:491–500`). **This is the pattern. Copy it, don't invent a second one.**

Owed elsewhere:
- Canvas node positions are drag-only (`onNodeDragStop`, `OrgTree.tsx:507`).
- Team `order` and topic `order` have no keyboard reorder.
- `movePerson(personId, teamId)` exists in the store (`useStore.ts:1300`) with **no UI at all** — a "Move to team" control on the person profile closes both the keyboard gap and a genuine product gap.

### 4.5 — Make the shortcuts that exist discoverable

Already implemented and mostly invisible: `←`/`→` sibling paging and `⌘↵` peek↔focus (`EntityChrome.tsx:190–220`), `1`–`4` tree modes and `⇧1`–`⇧9` domain filters (`OrgTree.tsx:253–263`), `⌘↵` to save a note (`NotesPanel.tsx:73`), `⌘⇧M` editor mode (`SessionEditor.tsx:96`), arrow-key panel resize on the separator (`EntitySurface.tsx:204`).

- Add a `?` overlay listing every shortcut, grouped by surface. Reachable from the header overflow and from Settings.
- Add key hints to the pager tooltips (`EntityChrome.tsx:284/291` currently say "Previous — Name" with no key).
- Keep the existing `<kbd>` chips on tree modes and domain tabs — that pattern already works.

### 4.6 — Fix the one hand-rolled overlay

`HeaderOverflow` (`AppChrome.tsx:112–157`) sets `role="menu"`/`role="menuitem"` and handles Escape and outside-pointerdown, but has no focus trap, no arrow-key navigation, and no focus return to the trigger. It's the only overlay on the mobile header.

Replace it with the React Aria menu the design system already ships, or add the three missing behaviors.

### 4.7 — Focus rings on raw buttons

84 raw `<button className="…">` across 29 files (vs. 134 design-system `<Button>`) mostly lack a `focus-visible` ring. Full migration is Phase 5.3; here, just ensure every raw button in a keyboard path has a visible ring. Densest: `MeetingEditor` (8), `Prayer` (7), `OrgTree` (7), `forms` (6), `TableView` (6).

### Acceptance criteria

- [ ] `npm run build` passes clean.
- [ ] From a cold load, using only the keyboard: reach a person on the canvas, open them, page to a teammate, switch modes, add a topic, and close — with focus visible at every step.
- [ ] Escape with nested overlays open dismisses innermost-first, every time.
- [ ] `MeProfile` and `MeetingProfile` respond to Escape like every other entity.
- [ ] Every drag interaction has a keyboard-and-screen-reader equivalent.
- [ ] `?` lists every working shortcut, and every shortcut it lists actually works.

**Commit:** `Give every pointer interaction a keyboard equivalent, and one place to find them`

---

# Phase 5 — Design system adoption

> **Covers:** VIS-1, VIS-2, VIS-3, VIS-4, VIS-5, VIS-6, VIS-7, MOB-2 (S1, S6)
> **This is the largest phase and the highest leverage.** Everything here stops the other findings from regenerating.

### Decision gate — ask before starting

1. **Semantic token names.** Propose ~8 aliases and get them approved before the codemod: `text-primary` / `text-secondary` / `text-muted` / `bg-surface` / `bg-subtle` / `border-default` / `border-subtle` / `accent`. Cheap to agree now, expensive to rename after 1,240 sites.
2. **Type scale.** `text-[10px]` and `text-[11px]` account for 147 uses — more than `text-sm`. Do they collapse into one `caption` step, or do we keep two? Recommend one; ask.
3. **Journal typography.** The `.journal-*` family (Source Serif 4) is deliberate and good. Confirm it stays as a distinct writing voice rather than being tokenized away.

### 5.1 — Connect the token layer that already exists

The work is not building a design system. `src/styles/theme.css` is a complete, correct 858-line Untitled UI token set — full semantic color, type ramp (`--text-xs` … `--text-display-2xl`), radius and shadow scales — and `src/components/base/**` already consumes it properly.

**Zero app-level components use any of it.** Grep for `text-primary|bg-secondary|border-primary|text-tertiary` across `src/components/*.tsx` returns no files. Instead: **1,240** raw `stone-*` occurrences, each manually paired with a `dark:stone-*` counterpart. `OrgTree.tsx` 128, `TableView.tsx` 91, `TeamProfile.tsx` 69, `Overview.tsx` 55, `PersonProfile.tsx` 44.

- Define the approved aliases in `theme.css`, mapped to the existing tokens.
- Codemod the `stone-*` / `dark:stone-*` pairs file by file, heaviest first. Most are mechanical: a light/dark pair collapses to one token.
- **Delete the `dark:` variant as you replace each pair** — that's roughly half the class string volume in the app, and it's the reason dark mode is decided independently at 1,240 sites.
- Runtime-colored things stay inline: domain and capacity colors are user data (`TintBadge` in `ui.tsx:17`, `HEALTH_COLOR`, `STATE_COLOR`, `DOMAIN_COLOR`). Do not tokenize those.
- Verify each converted file in both themes before moving on. Do not batch 20 files and check at the end.

### 5.2 — Enforce a type and spacing scale

- **Type:** map every `text-[Npx]` to a scale step. 147 uses of `text-[10px]`/`text-[11px]`, plus `text-[8px]`, `text-[9px]`, `text-[13px]`. Then add a semantic layer so `text-[11px] text-stone-500` retyped as caption, metadata, hint and badge label becomes one named thing.
- **Spacing:** twelve padding steps in use (`p-0` … `p-8`, including a non-standard `p-1.25`) and twelve gap steps. Pick a 4-point rhythm and normalize. Card padding alone is `p-6` in Overview, `p-4 sm:p-6` in profiles, `px-3 py-2.5` in `PrepPanel`, `px-2 py-1.5` in `TopicBoard`.
- **Radius:** `rounded-full` (76) / `xl` (67) / `lg` (61) / `md` (37) / `2xl` (7), plus `rounded-[7px]`, `[3px]`, `[10px]`, `[14px]`. One Overview card currently shows four radii: `Card` is `rounded-2xl` (`ui.tsx:74`), its list rows `rounded-lg` (`Overview.tsx:323`), the swatch `rounded-lg`, `TintBadge` `rounded-full`. Pick three steps (control / container / pill) and hold them.

### 5.3 — Migrate raw controls onto the primitives

- **84 raw `<button>`** across 29 files → `<Button>` / `<ButtonUtility>`. Each currently re-derives padding, radius, hover, active, focus, disabled and dark mode independently.
- **27 raw `<input>`/`<textarea>`/`<select>`** across 15 files → `<Input>` / `<TextArea>` / `<NativeSelect>`.
- Where a primitive genuinely can't express something, extend the primitive — don't leave the raw element. Note the real ones: `TopicBoard`'s auto-growing textarea, `PersonProfile`'s `goal-range` slider, the TipTap surfaces.

### 5.4 — Retire the fourth vocabulary

`index.css` is 1,636 lines defining ~150 bespoke classes: `.journal-*` (28), `.meeting-editor-*` (24), `.notion-*` (23), `.field-*` (12), `.prayer-*` (10), `.profile-build__*` (11), plus `.session-editor-*`, `.slash-menu-*`, `.person-row__*`, `.goal-range`.

- `.field-input` (`index.css:563`) is a complete **second input implementation** running alongside `components/base/input/input.tsx`, with its own `--field-accent`, hover, focus, disabled and placeholder states. Merge it into the primitive and delete it.
- Keep what's genuinely CSS-shaped: `.journal-*` prose typography, the TipTap/ProseMirror content styles, `.goal-range` (native range styling needs real CSS).
- Delete the rest as 5.1–5.3 land.
- The specificity war documented at `index.css:1533–1546` — a touch block that had to move to the bottom of the file *and* double every selector (`.field-input.field-input`) to beat the app's own classes — should disappear as a consequence. If it doesn't, something in 5.3 was left behind.

### 5.5 — Make touch correctness structural *(MOB-2 / S6)*

`index.css:1547–1636` is a hand-maintained allowlist of class names that get `font-size: 16px` (the iOS zoom floor) and `min-height: 44px`. Any new component that isn't added to the list silently ships a 13px field that zooms iOS Safari and never zooms back. Same shape in TSX: `min-h-11` appears 64 times as a manual per-element floor.

- Move both floors into the component primitives — a `size` prop that is correct on touch by construction.
- Then delete the allowlist and the doubled-selector hack, and remove the 64 manual `min-h-11`s that the primitives now cover.
- The landscape overrides (3.3) become a deliberate design decision instead of an `!important` fight.

### 5.6 — Settle iconography

`@untitledui/icons` in chrome, emoji load-bearing in content: `✦ Ask AI` (`App.tsx:200`), `✨ AI fill from a brain dump` (`PersonProfile.tsx:359`), `⚠` on watch-out badges (`:472`), `🎉`/`✓` in empty states (`Overview.tsx:447`, `:317`), `›` as breadcrumb separator (`EntityChrome.tsx:269`). Emoji render per-platform and don't inherit color or weight.

Replace structural/UI emoji with icons. **Keep tone-carrying emoji in empty-state copy** — that voice is an asset (see Phase 7).

### Acceptance criteria

- [ ] `npm run build` passes clean.
- [ ] Grep for `dark:` in `src/components/*.tsx` returns near-zero — dark mode comes from tokens.
- [ ] No `text-[Npx]` remains outside deliberate one-offs; no `p-1.25`.
- [ ] Raw `<button>` count in `src/components/*.tsx` is under 10, each with a written reason.
- [ ] `index.css` is meaningfully smaller and contains no specificity-doubling hack.
- [ ] A new component with no special CSS is touch-correct by default: ≥44px targets, ≥16px inputs.
- [ ] Full visual pass: light and dark, 375px and 1440px, across all five venues and all five entity kinds.

**Commit:** `Adopt the token system the app already ships` *(may reasonably be several commits — one per file group is fine)*

---

# Phase 6 — Information architecture

> **Covers:** IA-2, IA-4, IA-5, IA-6, IA-8, REL-3, KBD-2 (S2, S3, S4, S5, S7)
> **Every item here is a product decision.** Do not proceed on any of them without an answer.

### Decision gate — ask all four before building

1. **IA-2 / S3 — Nav collapse.** `TableView` renders every org record with 11 toggleable columns, search, group-by and health filter. `PeopleTable` is a strict subset — every column it has, `TableView` already has — and occupies 20% of the primary nav. On mobile it's worse: Tree also renders `TableView`, so three of five bottom-nav items land on the same component.
   **Recommend:** merge `people` into `table` as a saved filter (`/table?type=person`), keep `PeopleTable`'s mobile card layout and generalize it, and spend the freed slot on a **Today/Now** home. Overview is already 80% of that surface; it just isn't framed as home.
   **Ask:** merge, or keep both?

2. **IA-5 / S2 — Which editor survives?** There are nine ways to write text about a meeting or person: `InlineSessionEditor`, `SessionEditor` + `SessionEditorView` (full-page TipTap), `OccurrenceNotesPanel`, `OccurrenceNotesSheet`, `WritingPad` (serif journal), `FullScreenMarkdown` (source + split preview), `NotionBlockEditor`, `MeetingEditor` (576 lines + 24 bespoke CSS classes), `NotesPanel`. Which surface a leader gets depends on which route they arrived through — for the action they perform most.
   **Recommend:** two surfaces. One **fast in-place** editor (the `InlineSessionEditor` idea — tick the agenda, type two lines) and one **full** editor (TipTap, same document, promoted by a single consistent affordance). Retire `FullScreenMarkdown` and `WritingPad`; collapse `OccurrenceNotesPanel`/`OccurrenceNotesSheet` into the in-place one; fold or delete `MeetingEditor`.
   **Ask:** is the serif journal voice (`WritingPad` / `.journal-*`) something to preserve as a mode of the full editor, or to retire?

3. **IA-4 / S4 — Entity sub-navigation.** `entityModes.ts` documents five shared modes and argues well for them. `MeetingProfile.tsx:35` uses `Plan / Notes / Settings`; `MeProfile` has no tabs at all. Three vocabularies across five entity kinds. There's also a noun collision: "Notes" means *my running record about a person* on a person, and *the write-up for an occurrence* on a meeting.
   **Ask:** bring `meeting` and `me` onto the five-mode contract, or amend the contract to describe deliberate variation? Either is fine; three undocumented vocabularies is not. And: what do we call the two Notes?

4. **IA-6 — Meeting creation.** Four entry points collecting different field sets: `PrepPanel` (`:83` — creates with a hardcoded `"weekly"` rhythm and no name, which then has to be corrected elsewhere), `StartMeetingForm`, `NewMeetingRow`, `MeetingScheduleFields`. `NewMeetingRow`'s doc comment argues correctly that batch entry wants an inline row.
   **Ask:** one canonical creation form reused in all four places, or is the batch-vs-single distinction worth two?

### 6.1 — Execute the approved consolidations

Build only what came back approved. Preserve the reasoning comments from anything deleted — several of them (`NewMeetingRow`'s batch-entry argument, `InlineSessionEditor`'s fast-path argument, `SubjectMeetings`' one-column-per-meeting argument) are still true and should move into whatever replaces them.

### 6.2 — Undo stack and dismiss stack *(S5)*

Phase 1.5 gave individual actions per-action undo; Phase 4.2 gave one dismiss stack. Unify:

- One action log or soft-delete layer behind a global undo (`⌘Z`), surfaced through the Phase 1 toast.
- Grep confirms there is currently **no undo anywhere** — the only hits are the copy string "This can't be undone" and one unrelated `noMeeting` toggle (`PrepPanel.tsx:105`).
- Since writes sync in 600ms, undo must operate on store state, not on a network rollback.

### 6.3 — Global search / command palette *(S7)*

No way to reach a person by name from anywhere. Each table has its own local `query` state (`TableView`, `PeopleTable`, `MeetingsTable`).

- One entry point to reach any person, team, or meeting by name. `⌘K` for Dana; a persistent search field in the mobile header for Marcus.
- Replaces the three per-table search states.
- Every result navigates via the existing selection setters, so the URL stays the source of truth.

### Acceptance criteria

- [ ] `npm run build` passes clean.
- [ ] Every decision-gate question was asked and answered before the corresponding code was written.
- [ ] Writing up a 1:1 lands on the same surface regardless of entry route.
- [ ] Sub-navigation vocabulary is either uniform or documented in `entityModes.ts`.
- [ ] `⌘Z` undoes the last destructive action from anywhere.
- [ ] Any person, team, or meeting is reachable by name in one interaction from any screen.
- [ ] No reasoning comment was lost in a deletion.

**Commit:** one per approved consolidation, not one for the phase.

---

# Phase 7 — Regression pass

Run once, after Phase 6.

- **Full matrix:** light/dark × 375px/1440px × landscape phone, across all five venues and all five entity kinds, peek and focus.
- **Keyboard-only run** of the Phase 4 acceptance script.
- **Offline run:** load, edit, background, quit, reopen, reconnect. Confirm nothing was lost and every state change was legible.
- **Cold-start timing** on a throttled connection, warm cache and cold.
- **Voice check:** empty states and microcopy survived. Spot-check `Overview.tsx:385` (*"Nobody on the list yet. Open anyone — or a whole team — and take them up in prayer…"*), `PrepPanel.tsx:80` (*"Nothing is measured until you do."*), and the `ConfirmDialog` bodies added in Phase 1.5. If any of it now reads generic, that's a regression.
- **Comment check:** the codebase explains its own reasoning better than most design docs. Confirm that's still true.
- Update `docs/design-audit.md` with what shipped and what was deliberately declined.

---

## Out of scope

Do not do these as part of this brief:

- Supabase schema, RLS policy, or Edge Function changes.
- New product features. `movePerson` UI (4.4) is the one exception — it closes a keyboard gap and the store action already exists.
- Adopting a component library (shadcn/Radix/MUI). Phase 5 connects the token system already in the repo; it does not replace it.
- Rewriting `OrgTree.tsx` wholesale. It's 1,800 lines and it works. Touch it where a phase names a line.
- Test infrastructure. There is none today; adding it is worth doing, but it is its own decision.
