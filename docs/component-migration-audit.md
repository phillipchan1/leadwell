# Leadwell → Untitled UI React — Phase 1 Component Audit

_Audit date: 2026-08-02. No code has been changed; this document is the Phase 1 deliverable for review before setup begins._

## 1. App map (what the screens are)

| Surface | Route(s) | Files |
|---|---|---|
| Login gate | (unauthenticated) | `Login.tsx` |
| App shell: header + tab nav | all tab routes | `App.tsx` |
| Overview tab | `/overview` | `Overview.tsx` |
| Org tree canvas | `/tree` | `OrgTree.tsx` (1,830 lines) |
| Table tab | `/table` | `TableView.tsx` |
| People table tab | `/people` | `PeopleTable.tsx` |
| Peek panel (beside any tab) | `?team=` `?person=` `?manager=` `?me=1` | `EntitySurface.tsx`, `EntityChrome.tsx` |
| Focus routes (full-page entity) | `/team/:id`, `/person/:id[/section]`, `/manager/:id[/section]`, `/me` | `FocusView.tsx` + profiles |
| Entity profiles | rendered at both peek & focus density | `PersonProfile.tsx`, `TeamProfile.tsx`, `ManagerProfile.tsx`, `MeProfile.tsx` + embedded `StatsBar`, `PrepPanel`, `WinsLedger`, `TopicKanban`, `NotesPanel`, `SessionTable`, `LeadUpManual`, `AICoach` |
| Full-screen session editor | `/person/:id/sessions/:sessionId` | `SessionEditorView.tsx` → `MeetingEditor.tsx` → `SessionEditor.tsx` → `NotionBlockEditor.tsx` / `FullScreenMarkdown.tsx` + `SlashMenu.tsx` |
| Modals | opened from various screens | `SettingsModal`, `TriageModal`, `ProfileFillModal` (+`ProfileBuildCanvas`), `AssessmentEditor`, and `forms.tsx` (Team / Person / Manager / Me / Domains modals), Ask-AI modal in `App.tsx` |

Stack: Vite, React 18.3, **Tailwind CSS v4** (CSS-first config via `@tailwindcss/vite`, no `tailwind.config.js`), React Router 7, Zustand, TipTap, `@xyflow/react`. ~11,400 lines of components.

## 2. The four layers of hand-built UI

The migration surface is bigger than `ui.tsx`. There are four distinct layers:

**Layer 1 — declared primitives** (`src/components/ui.tsx`): `Badge`, `Chip`, `ProgressBar`, `Card`, `SectionTitle`, `ProfileAdminLinks`, `IconButton`, `Modal`, plus class-string constants `inputCls` / `inputSmCls` / `inputGhostCls` / `fieldLabelCls` / `buttonPrimaryCls` / `buttonGhostCls`.

**Layer 2 — undeclared shared primitives** (separate files, used app-wide): `Avatar` (+ `fileToDataUrl` image downscaler), the `Health.tsx` family (`HealthSelect`, `HealthChip`, `HealthDot`, `HealthBar`, `HealthField`), `StrengthsDonut`, `MarkdownBody`, `WritingPad`.

**Layer 3 — the hidden CSS design system** (`src/index.css`, ~1,150 lines): `.field-input` (+ `--sm`, `--ghost`) form system, `.field-label`, `.journal-paper`/`.journal-prose` (a full hand-authored prose theme, ~200 lines — the equivalent of `@tailwindcss/typography`), `.meeting-editor-*` (~25 classes), `.session-editor-*`, `.notion-*` (block-editor + markdown-mode), `.slash-menu-*`, `.profile-build__*`, `.team-card`/`.person-row` canvas hover choreography.

**Layer 4 — inline one-offs**: ~153 raw `<button>` elements across 29 files and ~74 raw form controls across 20 files, in roughly a dozen recurring but never-extracted variants (detailed in §3).

## 3. Component inventory by type (most-used first)

### 3.1 Buttons — the widest spread (~153 raw `<button>` sites)

| Variant found in the wild | Where | Untitled UI target |
|---|---|---|
| Primary (`buttonPrimaryCls`) | forms.tsx ×5, Settings, ProfileFill ×3, Assessment, MeetingEditor, Overview, AICoach | `Button color="primary"` |
| Ghost (`buttonGhostCls`) | same files, ~12 uses | `Button color="secondary"` |
| **Small primary — re-invented 3×** (TriageModal "Track", NotesPanel "Save note", PrepPanel "Track a 1:1", each with different hover/disabled behavior) | 3 files | `Button size="sm"` |
| Small ghost/outline | TriageModal, PrepPanel | `Button size="sm" color="secondary"` |
| Danger: ghost patched with red classes (Settings "Sign out"), bare red text links ("Delete team", "Remove" ×4) | Settings, forms ×2, TeamProfile, ProfileAdminLinks | `Button color="*-destructive"` |
| Text/link buttons (~15: "Clear conversation", "+ Add modality", "browse", "Reset view", "Mark met today", "Undo"…) | AICoach, Assessment, PhotoPicker ×3, TableView, TeamProfile ×5, PrepPanel | `Button color="link-color/link-gray"` |
| Icon buttons: `IconButton` ×5 (OrgTree nodes) + **~15 hand-rolled** (EntityChrome ×4, ProfileFill ✕, Assessment ✕, OrgTree ✎, 9 hover-reveal delete ✕ across 7 files) | 10 files | `ButtonUtility` / close-button |
| Dashed empty-state CTA ("+ Add first person", "✨ AI fill from a brain dump", "+ New note"…) — **8+ instances, all inline** | PersonProfile ×3, MeProfile ×2, ManagerProfile, NotesPanel, OrgTree | `Button` inside `EmptyState` |
| Filter pills with `aria-pressed` + count (health scan ×2 near-verbatim copies, "Weak spots") | OrgTree, TableView | `ButtonGroup` / `Toggle` |
| Toggle chips (`ViewLayers` ×7 with `<kbd>`, meeting-editor chips, preset chips in AICoach) | OrgTree, MeetingEditor, AICoach | `Toggle` / `Badge` interactive |
| Full-width list-row buttons (same class string ×3 in Overview; team/person rows in TeamProfile; TriageModal rows) | 3 files | list pattern w/ Untitled UI hover tokens |
| Choice/radio cards (ProfileFill entry mode ×2; capacity & direction pickers in forms.tsx) | 2 files | `RadioGroup` card variant |
| OAuth button (Google, with brand SVG) | Login | `SocialButton` |

### 3.2 Form controls (~74 raw controls)

- **Text inputs / textareas on `.field-input`**: forms.tsx ×16, Assessment ×10, ProfileFill ×8, Health, WinsLedger, TopicKanban quick-add, TriageModal, PrepPanel, TableView filters, PeopleTable search, MeetingEditor.
- **Controls that bypass the system entirely**: TeamProfile inline-title input (own focus shadow), TeamProfile todo composer, TableView `NoteCell`, OrgTree `CardNextStep` textarea, `.meeting-editor-point`, `.journal-textarea`, `.notion-markdown-source`. (`inputGhostCls` is exported but *imported nowhere* — SessionTable and LeadUpManual hardcode the literal string `"field-input field-input--ghost..."` instead.)
- **Selects** ×~10 (native, styled via CSS chevron hack): forms, TableView ×3, PeopleTable, Assessment ×4 (incl. a dependent Enneagram-wing select), TriageModal, PrepPanel, HealthSelect (2 sizes, value-tinted).
- **Checkboxes** ×~15, all `accent-teal-600` native: TableView columns ×10, ProfileFill ×2, MeetingEditor, OrgTree mark-done; plus TeamProfile's hand-drawn `role="checkbox"` SVG button and PrepPanel's read-only filled/hollow indicators.
- **Date inputs** ×4 (SessionTable ×2, MeetingEditor ×2), **number** ×1 (PrepPanel), **range sliders** ×4 (goals, PersonProfile + TeamProfile — duplicated block), **color** ×2 (DomainsModal), **file** ×1 (PhotoPicker hidden input + drag-drop zone).

→ Untitled UI targets: `Input`, `TextArea`, `Select`, `Checkbox`, `Slider`, `Label`+hint slots, `DatePicker`, file-upload dropzone.

### 3.3 Modals & overlays

- `Modal` (max-w-md, Esc + backdrop-click): Ask-AI, Settings, Triage, Assessment, 5 form modals.
- **`ProfileFillModal` re-implements the entire dialog** (max-w-3xl, sticky header + footer bar) and *lost Escape handling* in the process. `AssessmentEditor` bolts its footer outside `Modal`'s scroll area. → `Modal` needs sizes + header/footer slots: exactly what Untitled UI's React-Aria `Dialog` provides.
- `ColumnsMenu` (TableView): hand-rolled popover with outside-click listener + 10 checkboxes → `Popover`/`Dropdown` with checkbox items.
- `PeekPanel`: hand-rolled split-pane side panel (not an overlay — inline flex column). Keep behavior; restyle with tokens only.
- `SlashMenu`: caret-positioned command menu (mouse-only today — no keyboard nav). Keep custom; optional a11y upgrade later.

### 3.4 Badges / chips / status

`Badge` (dot + tinted pill, dynamic hex), `Chip` (3 tones) — plus five independent re-inventions: `HealthChip` (≈`Badge` + hollow-dot "derived" mode + stale suffix), `ReadinessChip` (OrgTree) duplicated inline in TableView, SessionTable's `STATUS_CLS` map (adds a 4th `sky` tone), top-5 CliftonStrengths pills (duplicated PersonProfile↔MeProfile), ProfileBuildCanvas signal chips (4th dynamic-color mode + confidence glyphs). → `Badge`/`BadgeGroup` with a mapping story for **arbitrary runtime hex colors** (domain/health colors are user data — see §6).

### 3.5 Tables

3 native tables: `TableView` (sortable, tree-indented, sticky header, expandable groups, inline-editable note cell), `PeopleTable` (9 cols), `SessionTable` (editable date cells, clickable rows). `Th` sortable-header is defined twice near-verbatim. → Untitled UI `Table`; tree-indent + group rows carry over as custom rows inside it.

### 3.6 Tabs & segmented controls

Underline tab bar hand-rolled 3× (App nav; PersonProfile ↔ ManagerProfile are verbatim copies with count badges). Segmented: `SessionEditor` Blocks/Markdown tablist, PhotoPicker theme switcher, DomainTab row (OrgTree, with kbd hints). → `Tabs` (underline), `ToggleGroup`.

### 3.7 Avatars

`Avatar` (photo/initials, size/dimmed/ring via inline styles) + hand-rolled overlap stack with `+N` chip (OrgTree) + **three different team-tile placeholders** (TableView 24px, Overview 30px, TriageModal `▤` glyph). → `Avatar`, `AvatarGroup`; add a team-entity tile variant.

### 3.8 Tooltips — biggest missing primitive

**Zero tooltip components; ~50 native `title=` sites** across OrgTree (~20), Health (5), EntityChrome (6), TableView, TriageModal, PrepPanel, PhotoPicker, Assessment… → Untitled UI `Tooltip` (React Aria) is a pure upgrade.

### 3.9 Feedback & status

- **Callouts**: amber warning (Login, ProfileFill, StatsBar), teal left-accent quote/"how to lead" (×4, duplicated), emerald success (StatsBar, WinsLedger cards), red error rows (ProfileFill ×3 verbatim). One file uses `rose` for errors where everywhere else is `red`. → `Alert`/callout component with tones.
- **Loading**: no spinner exists anywhere — all label swaps ("Thinking…", "Drafting…", "…"). → `Button isLoading` + spinner.
- **No toasts** (destructive ops use `confirm()`). Optional later: Untitled UI notifications (sonner).
- **Empty states**: ~15 ad-hoc (dashed boxes, italic `<p>`, centered hints). → `EmptyState`.
- **Progress**: `ProgressBar` + a CSS re-implementation (ProfileBuildCanvas) + 3 stacked *distribution* bars (`HealthBar`, `GiftMixBar`, `ReadinessBar` — keep as one custom component) + 2 hand-built SVG rings (`StrengthsDonut`, `MeterRing` — same circumference math written twice).

### 3.10 Switch

`SettingsModal` dark-mode toggle is `buttonPrimaryCls` abused with `role="switch"`. → `Switch`.

## 4. Duplication hotspots (what the migration collapses)

1. Sortable `Th` — 2 copies (TableView, PeopleTable).
2. Underline tab bar — 3 copies (App, PersonProfile, ManagerProfile).
3. Small primary button — 3 independent versions.
4. Health filter-pill row — 2 copies (OrgTree, TableView).
5. Assessment display block (~120 lines) — duplicated PersonProfile ↔ MeProfile.
6. Goal row (title + ✕ + slider + ProgressBar) — duplicated PersonProfile ↔ TeamProfile.
7. Hover-reveal delete ✕ — 9 instances, 7 files, all slightly different.
8. Readiness chip — OrgTree component + TableView inline copy.
9. `color + "1f"` hex-alpha tinting trick — Badge, HealthChip, ReadinessChip, DomainPicker, signal chips.
10. SVG ring math — StrengthsDonut ↔ MeterRing.
11. Auto-grow textarea logic — WritingPad ↔ FullScreenMarkdown.
12. Left-accent callout — 4 sites, teal + emerald variants.
13. Team-tile placeholder — 3 different builds.
14. `inputGhostCls`/`inputSmCls` forked as string literals — SessionTable, LeadUpManual.
15. Icon button — `IconButton` exists but is bypassed ~15×.

## 5. Genuinely custom — Untitled UI will NOT cover these (keep, restyle shell only)

Per your constraint ("tell me instead of forcing a workaround"):

- **Org tree canvas** (`OrgTree.tsx`): `@xyflow/react` flow with custom tidy-tree layout, drag-to-reposition persistence, pan/zoom, edge coloring, keyboard layer (1–9 domains, P/A/M/G/D/R/H layers), scan-dim interaction. The *cards inside nodes* get library styling; the canvas machinery stays.
- **TipTap editor stack**: `NotionBlockEditor` (markdown bridge, debounce, bubble menu) + `SlashMenu` (caret-coordinate positioning) + `FullScreenMarkdown` (Tab-to-indent, split preview) + `WritingPad` (dual-mode edit/preview, auto-grow, caret restore).
- **`journal-prose` typography theme** — hand-authored prose CSS; will be reconciled with Untitled UI's typography tokens, not replaced by a component.
- **Kanban drag-and-drop** (`TopicKanban`): HTML5 DnD with state fallback.
- **Charts**: `StrengthsDonut`, `MeterRing`, and the three stacked distribution bars.
- **Web Speech dictation** (`MeetingEditor`): live transcript merge, permission handling.
- **AI streaming UX**: AICoach chat (token streaming + autoscroll), Overview brief, mandate refine (streams into a textarea), ProfileBuildCanvas staggered-entrance signal choreography.
- **PhotoPicker** upload: drag-active dropzone + canvas image downscaling (Untitled UI's file-upload dropzone can style the shell; the resize pipeline stays).
- **PeekPanel** split-pane and the peek/focus `Density` pattern.
- **Value-tinted `HealthSelect`** (the control is colored by its current value) — will wrap Untitled UI's Select with custom trigger styling.

## 6. Setup & token findings (Phase 1.2/1.3 — verified, not yet applied)

**Compatible:**
- Untitled UI React is MIT, copy-paste-into-repo via `npx untitledui@latest`; components land in our tree and are ours to edit. Built on Tailwind v4 + `react-aria-components` — same Tailwind major and same `@tailwindcss/vite` plugin approach we already use. Config merge is additive (their `theme.css`/`typography.css` tokens + 3 plugins into `src/index.css`); our `--color-exec/infl/rel/strat` and `--font-journal` tokens are preserved as-is.
- Dark mode: both sides use a class-based `@custom-variant dark`. Theirs keys on `.dark-mode`, ours on `.dark` — a one-line alignment; the existing `toggleDark` store logic doesn't change.

**Flags needing your call (before Phase 1 setup):**
1. **React 18.3 vs 19.** Untitled UI is built/tested against React 19; its foundation `react-aria-components` officially supports React 18, so components should run — but we'd be off the tested path. Recommendation: bump to React 19 as the first setup commit (app is small, no deprecated patterns spotted). Alternative: stay on 18 and I verify each component as it's pulled in.
2. **Brand color mapping.** App brand is teal-600 `#0d9488` → set Untitled UI's `brand-*` scale to Tailwind teal. Semantic colors: emerald→`success`, amber→`warning`, red→`error` (and normalize the one `rose` outlier). **Runtime-hex colors (domain colors, health/capacity palettes) are user data and stay inline-styled** — they map to a small custom "dynamic tint" helper, not to static tokens.
3. **Neutral scale: `stone` vs `gray`.** The entire app is warm `stone`; Untitled UI defaults to cool `gray`. I'd remap their gray tokens onto stone values so the app keeps its warmth and components match existing screens. Alternative: adopt their gray everywhere (bigger visual shift).
4. **Font.** Untitled UI defaults to Inter; the app currently uses the system sans stack (+ Source Serif 4 for journal surfaces, which stays regardless). Adopt Inter, or keep system sans?
5. **Icons.** The app uses text glyphs (✕ ✎ ✦ ▾ ›). Untitled UI components expect `@untitledui/icons`. Swapping glyphs for real icons is part of the polish win but touches many call sites — I'd fold it into each component-type pass.

## 7. Proposed Phase 2 order (by blast radius, most-used first)

1. **Buttons** (~153 sites, 29 files) — collapses ~12 ad-hoc variants into `Button`/`ButtonUtility` with size/color/destructive/loading props.
2. **Inputs, Select, Textarea, Label** — retires the `.field-input` CSS system and the ghost/sm forks.
3. **Badges/Chips/Tags** — merges Badge/Chip/HealthChip/ReadinessChip/STATUS_CLS + dynamic-tint helper.
4. **Modal/Dialog** — sizes + header/footer slots; ProfileFillModal stops re-implementing dialogs (and gets Esc back).
5. **Tabs + segmented controls** — one `Tabs`, one `ToggleGroup`; deletes 3 copies.
6. **Tooltip** — replaces ~50 `title=` attributes; new capability.
7. **Checkbox / Switch / Slider / RadioGroup (choice cards)**.
8. **Tables** — shared sortable header, editable cells, tree rows.
9. **Avatar / AvatarGroup** — plus one team-tile variant.
10. **Dropdown/Popover** — ColumnsMenu.
11. **EmptyState + Alert/callouts + loading states**.
12. **Cards/containers** — folds into the Phase 3 layout/spacing pass.

Each step: pull component via CLI → replace all usages (props/behavior/data-wiring preserved) → delete the old primitive → before/after summary for review, committed separately.
