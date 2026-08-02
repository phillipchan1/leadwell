# LeadWell — Mobile UX / Accessibility Audit

**Scope:** every screen and flow reachable in the app, audited against touch &
gesture interaction, visual hierarchy, legibility, platform quirks (iOS Safari /
Android Chrome / installed PWA), navigation, forms, and perceived performance.

**Surfaces treated as primary:** mobile Chrome on Android, mobile Safari on iOS,
and iOS "Add to Home Screen" standalone mode. A native iOS wrapper is planned
but not built, so iOS Safari + standalone is the iOS story today.

**Date:** 2026-08-02 · **Commit audited:** `beb5f0d`

---

## Headline

LeadWell is not currently a mobile-first PWA. It is a **desktop split-pane
application** with a handful of `sm:`/`lg:` escape hatches. Three findings
dominate everything else:

1. **There is no PWA.** No `manifest.webmanifest`, no service worker, no app
   icon, no `apple-touch-icon`, no `theme-color`, no `viewport-fit=cover`, no
   `public/` directory at all. `index.html` is a bare Vite template. Android
   Chrome will never offer an install prompt; iOS "Add to Home Screen" produces
   a screenshot icon and a browser-chromed window.
2. **The core layout cannot fit a phone.** Selecting any entity puts a
   `min-w-[16rem]` main pane beside a `min-w-[20rem] shrink-0` peek panel — 576
   px of hard minimum on a 375 px viewport. There is no mobile branch of this
   layout anywhere.
3. **Primary actions are hover-only.** 13 controls across 9 components are
   `opacity-0 group-hover:opacity-100`. On touch there is no hover, so *delete
   goal, delete note, delete topic, delete session, edit manager, edit team, add
   person to team, add team to a report* are all invisible and unreachable on a
   phone. The Topics kanban additionally uses HTML5 drag-and-drop only, which
   never fires from touch — the board is decorative on mobile while its own copy
   instructs the user to "Drag cards between columns."

Two further issues are data-integrity, not cosmetics: a failed initial load
**signs the user out** (`useStore.ts:1210`), and a failed background sync is
**swallowed to `console.error`** (`useStore.ts:1309`). Both are edge cases on a
desk and the normal case on a train.

---

## Screen & flow inventory

| # | Screen / flow | Entry point |
|---|---|---|
| 1 | PWA shell / document head | `index.html` |
| 2 | Loading gate ("Loading your org…") | `App.tsx:126` |
| 3 | Sign-in gate | `Login.tsx` |
| 4 | App shell + header (Ask AI / Settings / dark toggle) | `App.tsx:151` |
| 5 | Primary tab bar (Overview · Org tree · Table · People table) | `App.tsx:187` |
| 6 | Overview tab (exec brief, health scan, needs attention, coverage gaps, domain totals) | `Overview.tsx` |
| 7 | Org tree canvas (React Flow) | `OrgTree.tsx:464` |
| 7a | ↳ domain filter tabs + health scan bar | `OrgTree.tsx:428` |
| 7b | ↳ canvas toolbar (add team / report / manager, view layers, reset) | `OrgTree.tsx:501` |
| 7c | ↳ minimap, zoom controls, legend | `OrgTree.tsx:497` |
| 7d | ↳ node cards: me, manager, direct report, team | `OrgTree.tsx:1094–1613` |
| 8 | Table view (org outline / grouped) | `TableView.tsx` |
| 9 | People table | `PeopleTable.tsx` |
| 10 | Peek panel (split-pane entity view) | `EntitySurface.tsx:83` |
| 11 | Focus view (full-page entity view) | `FocusView.tsx` |
| 12 | Entity chrome (breadcrumb, sibling pager, expand, close) | `EntityChrome.tsx` |
| 13 | Person profile → Profile tab | `PersonProfile.tsx:310` |
| 14 | Person profile → 1:1s tab | `PersonProfile.tsx:557` |
| 15 | Person profile → Topics tab (kanban) | `TopicKanban.tsx` |
| 16 | Person profile → Notes tab | `NotesPanel.tsx` |
| 17 | Leading-up variant (manual, wins ledger) | `LeadUpManual.tsx`, `WinsLedger.tsx` |
| 18 | Team profile | `TeamProfile.tsx` |
| 19 | Manager profile | `ManagerProfile.tsx` |
| 20 | My profile (`/me`) | `MeProfile.tsx` |
| 21 | Readiness / prep panel | `PrepPanel.tsx` |
| 22 | Session list table | `SessionTable.tsx` |
| 23 | Full-screen session editor | `SessionEditorView.tsx` → `MeetingEditor.tsx` |
| 23a | ↳ rich-text block editor + slash menu | `NotionBlockEditor.tsx`, `SlashMenu.tsx` |
| 23b | ↳ markdown mode | `FullScreenMarkdown.tsx` |
| 23c | ↳ transcript capture / live listen / AI structure | `MeetingEditor.tsx:389` |
| 24 | Journal writing pad (notes, wins, manual) | `WritingPad.tsx` |
| 25 | AI coach chat (in-profile + global "Ask AI" modal) | `AICoach.tsx` |
| 26 | Settings modal | `SettingsModal.tsx` |
| 27 | Triage modal ("Who do you actually meet with?") | `TriageModal.tsx` |
| 28 | Add/edit Team · Person · Manager · Domains modals | `forms.tsx` |
| 29 | Assessment editor modal | `AssessmentEditor.tsx` |
| 30 | AI profile fill modal + build canvas | `ProfileFillModal.tsx`, `ProfileBuildCanvas.tsx` |
| 31 | Photo picker | `PhotoPicker.tsx` |
| 32 | Health control (select / chip / dot / bar / field) | `Health.tsx` |

---

## Findings

| Screen/Component | Category | Issue | Severity | Platform | Recommended Fix |
|---|---|---|---|---|---|
| `index.html` | PWA | No `manifest.webmanifest` at all. Android Chrome's install criteria are never met, so `beforeinstallprompt` never fires and the app can never be installed. | Critical | Android | Add `public/manifest.webmanifest` with `name`, `short_name`, `start_url: "/"`, `display: "standalone"`, `background_color`, `theme_color: "#0d9488"`, and 192/512 px `any` + `maskable` icons. Link it from `<head>`. |
| `index.html` | PWA | No `apple-touch-icon`, no `apple-mobile-web-app-capable`, no `apple-mobile-web-app-status-bar-style`. iOS "Add to Home Screen" yields a screenshot icon and opens with full Safari chrome instead of standalone. | Critical | iOS | Add `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`, `<meta name="apple-mobile-web-app-title" content="LeadWell">`. |
| `index.html` | Platform / iOS | `<meta name="viewport">` lacks `viewport-fit=cover`, so `env(safe-area-inset-*)` always resolves to `0px`. Combined with the next row, nothing can ever respect the notch or home indicator. | Critical | iOS | `content="width=device-width, initial-scale=1, viewport-fit=cover"`. |
| Global CSS (`index.css`) | Platform / iOS | Zero `env(safe-area-inset-*)` usage anywhere in the codebase. In standalone mode the header sits under the status bar / Dynamic Island and the bottom of every pane sits under the home indicator. | Critical | iOS (standalone) | Add safe-area padding to the app header (`padding-top: env(safe-area-inset-top)`), to bottom-anchored surfaces (`padding-bottom: env(safe-area-inset-bottom)`), and to left/right in landscape. |
| `App.tsx:198–213` | Layout | `<main className="min-w-[16rem]">` beside `<PeekPanel className="min-w-[20rem] shrink-0">` = 576 px hard minimum. On a 375 px viewport the peek panel pushes the canvas off-screen and the document scrolls horizontally. | Critical | Both | Below `lg`, render one surface at a time: when an entity is selected show only the entity (full-bleed), or present the peek as a bottom sheet. Split-pane only at `lg:` and up. |
| `App.tsx:151` | Layout | Header is `px-6 py-3` with a 3-button cluster and no wrapping/collapse rule. At 375 px "✦ Ask AI", "Settings" and the theme toggle consume the full width, colliding with the wordmark. | High | Both | Collapse Settings + theme toggle into an overflow menu below `sm:`, or move them into a bottom nav / drawer. |
| `App.tsx:187–195` | Navigation | Tab list is a plain `flex` with `whitespace-nowrap` and `gap-3` inside a `px-6` container. Four labels ("Overview", "Org tree", "Table", "People table") overflow at ≤375 px with no horizontal scroll container. | High | Both | Add `overflow-x-auto scrollbar-hide` + `scroll-snap-type: x proximity` on the tab strip, or shorten labels below `sm:`. |
| `App.tsx:187` | Navigation | Primary navigation is a top tab bar. On a phone this is the least thumb-reachable zone; the whole app has no bottom navigation. | High | Both | Below `lg:`, promote the four tabs to a bottom tab bar with `padding-bottom: env(safe-area-inset-bottom)`. |
| `tabs.tsx:60` | Touch target | Underline tabs are `px-0.5 pb-2.5 pt-0` → ~30 px tall, 2 px horizontal padding. Below the 44 pt / 48 dp minimum, and adjacent targets nearly touch. | High | Both | Give underline tabs a `min-height: 44px` and `px-3` on coarse pointers (`@media (pointer: coarse)`). |
| Global CSS | Platform / iOS | `html, body, #root { height: 100% }` with all scrolling in inner `overflow-y-auto` panes. Because the document body never scrolls, Safari's address bar never collapses — the app permanently loses ~110 px, and layout is sized to the *large* viewport so the bottom is clipped. | Critical | iOS Safari (browser) | Use `height: 100dvh` (with a `100vh` fallback) on the shell, or `min-height: -webkit-fill-available`. Verify the bottom row of every pane is reachable with the toolbar shown. |
| Global CSS | Platform / Android | Same fixed-height shell: Android Chrome's address bar show/hide changes the viewport, and because nothing scrolls at the document level the toolbar stays pinned and reflows the whole flex tree on each keyboard open. | High | Android Chrome | Adopt `dvh` units and add `interactive-widget=resizes-content` to the viewport meta so the keyboard resizes rather than overlays. |
| Global CSS | Platform / PWA | In installed/standalone mode there is no browser chrome, so the `height:100%` shell finally fits — but with no safe-area insets the header is under the status bar. Different root cause from the two rows above; fixing `dvh` alone does not fix this. | Critical | Installed PWA (both) | Combine `dvh` sizing with `env(safe-area-inset-*)` padding; test all three modes separately. |
| Global CSS | Scroll | No `overscroll-behavior` anywhere. Every nested `overflow-y-auto` (peek panel, profile body, AI chat, modal body, triage list) chains its scroll to the page, and pull-to-refresh fires when scrolling up inside a panel that is already at the top. | High | Both | `overscroll-behavior: contain` on all scroll containers; `overscroll-behavior-y: none` on the app shell to kill pull-to-refresh reload. |
| Global CSS | Touch | No `touch-action` declaration anywhere in the codebase. | Medium | Both | Set `touch-action: manipulation` on the app root to remove the 300 ms double-tap-to-zoom delay on buttons and links. |
| Global CSS | Touch feedback | No `:active` styles on any design-system button; `button.tsx` defines only `hover:` and `focus-visible:` variants. Taps give no visual acknowledgement on touch. | High | Both | Add `active:` states (background/scale) to `button.tsx`, `button-utility.tsx`, and tabs. `.team-card:active` and `.person-row:active` already do this well — extend the pattern. |
| Global CSS (`index.css:706, 760`) | Touch | `.team-card:hover` and `.person-row:hover` apply `transform` + shadow. On touch, `:hover` sticks after tap and stays applied until another element is tapped, leaving cards visibly "lifted" at random. | Medium | Both | Wrap all decorative hover rules in `@media (hover: hover) and (pointer: fine)`. |
| Global CSS (`index.css:479`) | Perceived UX | `.field-input:focus { transform: translateY(-1px) }` animates the field on focus. On iOS this fires simultaneously with the keyboard-open scroll adjustment, producing a visible double-jump. | Medium | iOS | Drop the transform on coarse pointers. |
| `index.css:437` | Forms / iOS | `.field-input` is `font-size: 0.975rem` (15.6 px) — under 16 px, so **iOS zooms the viewport on focus** and does not zoom back out. | Critical | iOS | Set `font-size: 16px` for `.field-input` on coarse pointers (or globally — 16 px is a better default anyway). |
| `index.css:551` | Forms / iOS | `.field-input--sm` is `0.8125rem` (13 px) — used for the date cells in the session table. Guaranteed zoom-on-focus. | Critical | iOS | Same: minimum 16 px on touch. |
| `input.tsx:75` | Forms / iOS | `Input size="sm"` renders `text-sm` = 14 px. Used by People-table search, Table-view search, kanban quick-add, health note, `PrepPanel` nudge-days, meeting date fields. Every one of them zooms the page on focus. | Critical | iOS | Force `text-md` (16 px) for `size="sm"` under `@media (pointer: coarse)`, or bump every call site to `size="md"`. |
| `textarea.tsx:37` | Forms / iOS | `TextArea size="sm"` is `text-sm` = 14 px; `.meeting-editor-transcript` is `text-xs` = 12 px. Both zoom on focus. | Critical | iOS | Minimum 16 px on touch. |
| `select-native.tsx:20` | Forms / iOS | `NativeSelect size="sm"` is `text-sm` = 14 px. iOS zooms on `<select>` focus below 16 px too. Used in `PrepPanel` (rhythm), `TriageModal`, `TableView`, `PeopleTable`. | High | iOS | Minimum 16 px on touch. |
| `index.css:1200` | Forms / iOS | `.notion-markdown-source` (markdown editing mode) is `text-sm` = 14 px — the main writing surface in markdown mode. | High | iOS | Minimum 16 px on touch. |
| `TopicKanban.tsx:144–150` | Touch / Gesture | The kanban moves cards **only** via HTML5 drag-and-drop (`draggable`, `dataTransfer`). Touch never fires `dragstart`, so on any phone it is impossible to move a topic between Backlog / This 1:1 / Parking / Done. The feature is inert. | Critical | Both | Replace with a Pointer-Events drag (or `dnd-kit`), **and** add a non-drag fallback — a "Move to…" menu or a column `<select>` on each card. |
| `PersonProfile.tsx:586` | Visibility | Copy reads "Drag cards between columns" — instructing a gesture that cannot be performed on the target platform. | High | Both | Rewrite the copy once a touch-capable move exists; describe the tap path on coarse pointers. |
| `TopicKanban.tsx:166` | Touch | Card delete is `opacity-0 group-hover:opacity-100` — invisible and unreachable on touch. | Critical | Both | Always-visible on coarse pointers, or move to a long-press / swipe action or overflow menu. |
| `TopicKanban.tsx:153` | Forms / iOS | Card textarea is `text-xs` (12 px) with `rows={2}` and `resize-none` — zooms on focus and clips text beyond two lines. | High | iOS | 16 px on touch; auto-grow instead of fixed rows. |
| `TopicKanban.tsx:64,71` | Scroll | Four `w-[11.5rem]` columns in an `overflow-x-auto` strip nested inside the profile's vertical scroller. No scroll-snap; only ~2 columns visible at 375 px, and the horizontal gesture competes with the parent's vertical pan. | Medium | Both | Add `scroll-snap-type: x mandatory` + `scroll-snap-align: start`, `overscroll-behavior-x: contain`, and widen columns to ~80 vw on mobile. |
| `PersonProfile.tsx:503` | Touch | Goal delete button is `opacity-0 group-hover:opacity-100` — unreachable on touch. | Critical | Both | Always visible on coarse pointers. |
| `TeamProfile.tsx:584, 621` | Touch | Team goal / member delete buttons are hover-only — unreachable on touch. | Critical | Both | Always visible on coarse pointers. |
| `TeamProfile.tsx:753` | Touch | Member-remove control is hover-only **and** `text-stone-300` (1.6:1 contrast) even when revealed. | Critical | Both | Always visible on coarse pointers; raise to at least `text-stone-500`. |
| `NotesPanel.tsx:99` | Touch | Note delete is hover-only — unreachable on touch. | Critical | Both | Always visible on coarse pointers. |
| `WinsLedger.tsx:79` | Touch | Win delete is hover-only — unreachable on touch. | Critical | Both | Always visible on coarse pointers. |
| `SessionTable.tsx:136` | Touch | Session delete is hover-only — unreachable on touch. | Critical | Both | Always visible on coarse pointers, or a swipe-to-delete row action. |
| `OrgTree.tsx:1188` | Touch | "Edit manager" on a manager node is hover-only — the only way to edit a manager from the canvas is unreachable on touch. | Critical | Both | Always visible on coarse pointers. |
| `OrgTree.tsx:1293` | Touch | "Add a team this person leads" on a report node is hover-only. | Critical | Both | Always visible on coarse pointers. |
| `OrgTree.tsx:1454` | Touch | "Add person" / "Edit team" on a team card are hover-only. | Critical | Both | Always visible on coarse pointers. |
| `PhotoPicker.tsx:72, 184` | Touch | Photo overlay affordances ("Change", theme label) are hover-only; on touch the picker looks static. | Medium | Both | Always visible on coarse pointers. |
| `PersonProfile.tsx:507`, `TeamProfile.tsx:626` | Touch target | Goal progress is `<input type="range">` with `style={{ height: 4 }}` — a 4 px-tall slider. Effectively impossible to grab with a finger. | Critical | Both | Give the range a ≥44 px hit area (`height: 44px` with a styled 4 px track via `::-webkit-slider-runnable-track`), or replace with ± steppers on touch. |
| `EntityChrome.tsx:162–241` | Touch target | Back, prev, next, expand and close are all `ButtonUtility size="xs"` = `p-1.5` + 16 px icon → **28 × 28 px**, in a row with `gap-0.5` (2 px). Five sub-minimum targets, two of them adjacent, one of which discards the panel. | Critical | Both | ≥44 × 44 px and ≥8 px spacing on coarse pointers. |
| `button-utility.tsx:95` | Touch target | Every `ButtonUtility` is `p-1.5` → 28 px (`xs`) / 32 px (`sm`). This is the delete/close/edit control across the entire app. | Critical | Both | Add `min-h-11 min-w-11` under `@media (pointer: coarse)` while keeping the visual icon size. |
| `button.tsx` (`link-*` colors) | Touch target | `link-gray`, `link-color` and `link-destructive` force `p-0!`, so the tap target is only the text box (~20 px tall). Used for the readiness "Log it / Write up / Add topic" fixes, "Stop tracking", "Edit"/"Remove" profile links, "Clear conversation", "Open in table", "Reset layout". | Critical | Both | Give link buttons a `min-height: 44px` and vertical padding on coarse pointers. |
| `ui.tsx:97–104` | Touch target | `ProfileAdminLinks` puts "Edit" and destructive "Remove" side by side as bare text links with `gap-x-3` (12 px). Two ~20 px targets, one destructive, 12 px apart. | Critical | Both | Enlarge both, separate them, and move "Remove" behind a confirm sheet rather than sitting next to "Edit". |
| `TeamProfile.tsx:262–293` | Touch target | Header row places "Mark met today", "Settings" and destructive "Delete" as adjacent bare link buttons. Mis-tapping "Settings" hits "Delete", which destroys the team and all its members. | Critical | Both | Enlarge targets; move "Delete" out of the header into the settings modal or an overflow menu. |
| `checkbox.tsx:20` | Touch target | Checkbox is `size-4` (16 px) with no padding on the label wrapper. Used for column toggles in `TableView`, layer toggles in `OrgTree`, and the "add commitments as topics" confirm in the meeting editor. | High | Both | ≥44 px hit area via padding on the label; keep the 16 px visual box. |
| `AICoach.tsx:108` | Touch target | Preset prompt chips are `px-2.5 py-1 text-xs` (~26 px tall) wrapped with `gap-1.5` (6 px). | High | Both | ≥44 px tall, ≥8 px gaps on coarse pointers. |
| `OrgTree.tsx:619` | Touch target | Domain filter tabs are `px-3 py-1.5 text-sm` → ~34 px tall with `gap-1.5`. | Medium | Both | ≥44 px on coarse pointers. |
| `OrgTree.tsx:967` | Touch target | `ViewLayers` toggles are `px-2.5 py-1.5 text-sm` → ~34 px, wrapped tightly. | Medium | Both | ≥44 px on coarse pointers. |
| `MeetingEditor.tsx:304–323` | Touch target | Topbar "Tools" (`px-2.5 py-1 text-xs`) sits 12 px from destructive "Delete" (`px-2.5 py-1 text-xs`). Both ~26 px tall; a mis-tap deletes the entry. | Critical | Both | Enlarge both; move "Delete" into an overflow menu. |
| `OrgTree.tsx:465–486` | Gesture conflict | React Flow captures one-finger drag to pan. On iOS Safari the interactive back-swipe starts from the left edge, and the canvas swallows it — the user cannot go back by gesture while on the Org tree tab. | High | iOS Safari | Reserve a ~20 px non-interactive left gutter, or disable `panOnDrag` on coarse pointers in favour of two-finger pan, keeping tap-to-select. |
| `OrgTree.tsx:465–486` | Gesture conflict | Same canvas swallows vertical drags, so once a finger lands on the tree the page cannot be scrolled — and because the tab strip and filter chips sit above it, the user can get stuck with no scrollable region. | High | Android Chrome | Same fix; additionally allow the canvas to release vertical pans at its scroll boundaries. |
| `OrgTree.tsx:485` | Gesture | `zoomOnPinch` is on, but `minZoom={0.1}` with 320 px-wide team cards and 9–11 px node text means a fitted tree renders text at 1–3 px. The canvas is effectively unreadable on a phone regardless of pinch. | High | Both | Ship a list/outline fallback for the Org tree below `lg:` (the Table view is already this — route mobile there by default), or a mobile-specific compact node. |
| `OrgTree.tsx:497–571` | Layout | Four absolutely-positioned overlays (Controls bottom-right, MiniMap top-right `h-24 w-36`, toolbar top-left, legend bottom-left) over a ~400 px-tall canvas. They overlap each other and cover most of the tree on a phone. | High | Both | Hide MiniMap and legend below `lg:`; collapse the toolbar into a single FAB with a sheet. |
| `OrgTree.tsx:1058–1080` | Legibility | Node text at `text-[9px]`, `text-[10px]`, `text-[11px]`, before canvas zoom scaling is applied. | High | Both | Minimum 12 px in node cards; rely on the mobile fallback view for density. |
| `useStore.ts:1210–1212` | Offline / PWA | If `repo.loadAll()` throws — which is what a dropped connection looks like — the app sets `phase: "anon"` and drops the user to the sign-in screen. On mobile this means a tunnel or a lift signs you out. | Critical | Both | Distinguish auth failure from network failure. On network error keep the session, render an offline/retry state, and retry with backoff. |
| `useStore.ts:1307–1310` | Offline / State visibility | A failed background sync is caught and logged to `console.error` only. The user sees a normal, saved-looking UI while edits are silently not persisted. | Critical | Both | Surface a persistent "Not saved — retrying" indicator, retry with backoff, and flush on `online` / `visibilitychange`. |
| App-wide | Offline / PWA | No service worker and no offline cache. Loading the installed app with no connection yields a blank browser error page, not the app. | High | Both | Add a service worker (e.g. `vite-plugin-pwa`) precaching the shell, plus an offline route. |
| `App.tsx:126–132` | State visibility | The loading gate is a bare centred line of text ("Loading your org…") in `text-stone-400` — no skeleton, no logo, no progress. On a cold mobile connection this is several seconds of near-blank screen. | Medium | Both | Replace with a branded splash + skeletons matching the destination tab. |
| `App.tsx:126` | State visibility | There is no error phase at all — `phase` is only `loading \| anon \| ready`. Any load failure renders the sign-in screen with no explanation. | High | Both | Add an `error` phase with a message and a Retry button. |
| `modal.tsx:15,33` + `ui.tsx:140,156` | Scroll | Three nested scroll containers per modal: `Modal` (`max-sm:overflow-y-auto`), `Dialog` (`overflow-y-auto`), and the app's body wrapper (`overflow-y-auto`). Touch scrolling picks an unpredictable one and momentum stops at inner boundaries. | High | Both | Keep exactly one scrolling element (the body wrapper); remove `overflow-y-auto` from the outer two. Add `overscroll-behavior: contain`. |
| `modal.tsx:15` | Navigation | Modals present as bottom sheets on mobile (`items-end`) but have no swipe-down dismissal — the affordance implies a gesture that does not exist. Dismissal is close-button or tap-outside only. | High | Both | Add a drag handle and swipe-down-to-dismiss for the sheet presentation, or drop the sheet styling. |
| `modal.tsx` / all modals | Navigation | No modal pushes a history entry, so the Android hardware/gesture Back closes the whole app (or navigates the SPA) instead of closing the open modal. | High | Android | Push a history state when a modal/sheet opens and close it on `popstate`. |
| `EntityChrome.tsx:125–155` | Navigation | Sibling paging and peek↔focus promotion are bound to `←`/`→` and `⌘↵` only. On touch the only equivalents are the 28 px pager buttons; there is no horizontal swipe between siblings. | Medium | Both | Add horizontal swipe-to-page on the entity surface (with a threshold that does not fight the iOS edge-back gesture). |
| `EntityChrome.tsx:163, 220, 230, 236` | Visibility | Back / expand / minimise / close are icon-only with the label supplied via `tooltip`, which becomes `aria-label` — accessible to screen readers but with no visible label and no hover on touch, so the icons are unexplained. | Medium | Both | Add visible labels below `sm:` or use unambiguous icons with text. |
| App-wide | Visibility | 40+ `title=` attributes carry meaning (health hints, readiness explanations, projected-vs-booked, stale markers, domain names). `title` never appears on touch. | High | Both | Replace load-bearing `title` with tap-to-open popovers, or duplicate the content inline. |
| App-wide (light mode) | Contrast | `text-stone-400` on white measures **2.52:1** — fails WCAG AA (4.5:1). It is the app's default secondary-text colour: readiness headlines, dates, counts, hints, empty states, "No profile read yet", table placeholders. | High | Both | Move secondary text to `text-stone-500` (4.80:1) and reserve `stone-400` for non-informational glyphs. |
| App-wide (dark mode) | Contrast | `text-stone-500` on `bg-stone-900` measures **3.64:1** — fails AA. Used for the same secondary text throughout dark mode. | High | Both | Lighten to `stone-400` in dark mode (already the pattern in some files — apply consistently). |
| `index.css:166, 1066, 1189` | Contrast | `.journal-hint`, `.session-editor-mode-hint`, `.notion-markdown-hint` use `dark:text-stone-600` on `stone-950` = **2.59:1**. These carry the only instructions for the editor's modes. | High | Both | Raise to `stone-400` in dark mode. |
| `PeopleTable.tsx:192`, `TeamProfile.tsx:753` | Contrast | `text-stone-300` on white = **1.6:1**. Used for em-dash placeholders and the member-remove control. | Medium | Both | `stone-400` minimum for decorative, `stone-500` for anything meaningful. |
| `PeopleTable.tsx:115–216` | Layout | Nine-column table with `className="w-full"` and no `min-w`, inside `overflow-x-auto`. Columns collapse to unreadable widths rather than scrolling cleanly, and the header does not stick. | High | Both | Below `lg:`, render as stacked cards (avatar, name, role, health, next 1:1). Keep the table for `lg:` and up with an explicit `min-w`. |
| `TableView.tsx:447–450` | Layout | `min-w-[52rem]` (832 px) table in a horizontal scroller — every row requires horizontal panning on a phone, and `thead` is `sticky top-0` relative to a container that is not the vertical scroller, so it never sticks. | High | Both | Stacked-card layout below `lg:`; fix the sticky header by making the Card the scroll container. |
| `PeopleTable.tsx:139–181` | Touch | The whole `<tr>` is clickable and contains an interactive `HealthSelect`. Propagation is stopped on click (`Health.tsx:56`) but not on touch-initiated `change`, and the row has no `:active` feedback, so a tap that lands on the select reads as unresponsive. | Medium | Both | Give rows an `active:` state; make the row's tap target an explicit link/button rather than a `tr` handler. |
| `SessionTable.tsx:44–51` | Layout | `table-fixed` with three `w-[22%]` columns. At 375 px the Date column is ~75 px, which cannot fit a rendered `<input type="date">` value — dates are clipped. | High | Both | Stacked list layout below `sm:`; the date/next/status/summary quartet reads better as two lines than four columns. |
| `SessionTable.tsx:99–114` | Forms | `<input type="date">` at 13 px opens the iOS wheel picker over the bottom half of the screen, covering the row being edited, with no scroll-into-view. | High | iOS | 16 px font; scroll the focused row into view on `focus`; consider a tap-to-open sheet instead of inline date inputs in a table. |
| `MeetingEditor.tsx:483` | Forms | `autoFocus={!notes.trim()}` focuses the rich-text editor on mount. Opening any empty session immediately raises the keyboard and scrolls the title out of view before the user has oriented. | High | Both | Do not autofocus on coarse pointers. |
| `MeetingEditor.tsx:336`, `forms.tsx:122, 229, 420, 485, 576`, `NotesPanel.tsx:60, 108`, `ProfileFillModal.tsx:415, 476` | Forms | Ten `autoFocus` call sites. Every modal raises the keyboard on open, which on iOS shrinks the visual viewport and pushes the modal's own action bar off-screen. | High | Both | Suppress `autoFocus` under `@media (pointer: coarse)`; focus the dialog container instead. |
| `SlashMenu.tsx:44–47` | Layout / Forms | The slash menu is `position: fixed` at the raw caret coordinates with `min-w-[220px]`, no viewport clamping and no flip logic. With the keyboard up it renders underneath the keyboard, and near the right edge it overflows horizontally. | High | Both | Clamp to the visual viewport (`window.visualViewport`), flip above the caret when there is no room below, and constrain width to `calc(100vw - 32px)`. |
| `MeetingEditor.tsx:190–235` | Platform | `webkitSpeechRecognition` ("Listen") is unavailable or permission-blocked in iOS standalone mode; the failure path only sets an error string after the user has already tapped. | Medium | iOS (standalone) | Feature-detect on mount and hide/disable "Listen" with an explanatory note rather than failing on tap. |
| `AICoach.tsx:49–51` | Perceived UX | `bottomRef.scrollIntoView({ behavior: "smooth" })` on every token of a streaming response. It scrolls the nearest scrollable ancestor chain, so the profile panel and page jump continuously while the AI writes. | High | Both | Scroll the chat container only (`container.scrollTop = container.scrollHeight`), and only when the user is already pinned to the bottom. |
| `AICoach.tsx:118` | Scroll | Chat log is `max-h-80 overflow-y-auto` nested inside the profile's scroller, with no `overscroll-behavior`. Reaching the top of the chat scrolls the profile behind it. | Medium | Both | `overscroll-behavior: contain`. |
| `AICoach.tsx:146` | Forms | Chat input has no `enterKeyHint`, no `autocomplete`, no `inputMode`. The mobile keyboard shows a newline key rather than "Send". | Low | Both | `enterKeyHint="send"`. |
| `PrepPanel.tsx:246` | Forms | Nudge-days field is `type="number"` with no `inputMode="numeric"` and a `w-16` (64 px) box at 14 px. | Medium | Both | `inputMode="numeric"`, `pattern="[0-9]*"`, 16 px font. |
| App-wide | Forms | No `autocomplete` attributes anywhere; no `name` attributes on the person/manager name and role fields. Autofill cannot assist. | Medium | Both | Add `autocomplete="name"` / `"organization-title"` and `name` attributes to the identity fields. |
| App-wide | Forms | No inline validation anywhere. Empty-name submits are silently ignored (`forms.tsx` guards on `.trim()` with no message), so the mobile user taps "Save" and nothing happens. | High | Both | Add inline validation messages under fields and disable the submit with an explanatory hint. |
| `PersonProfile.tsx:522–541` | Forms | The "Add a goal" form contains only an `Input` and no submit button — it relies on implicit form submission via the keyboard's return key, which is undiscoverable on touch. | Medium | Both | Add a visible "Add" button; set `enterKeyHint="done"`. |
| `WritingPad.tsx:99–110` | Semantics / Touch | The markdown preview is a `<button>` wrapping `MarkdownBody`, which renders links, checkboxes and headings. Interactive content nested inside a button: on touch, tapping a link both follows it and enters edit mode. Invalid HTML. | High | Both | Use a non-button container with an explicit "Edit" affordance, or a click handler on a `div` with `role="textbox"`. |
| `WritingPad.tsx:108, 149` | Visibility | Hints read "Click to edit" and "Esc to preview". Neither maps to touch — there is no Esc key, and the only way out of edit mode is to blur. | Medium | Both | Copy that adapts to pointer type; add a visible "Done" button on coarse pointers. |
| `NotesPanel.tsx:113–124` | Semantics / Touch | Same pattern: each saved note is a `<button>` wrapping rendered markdown. | High | Both | As above. |
| `NotesPanel.tsx:107` | Forms | Editing a note exits on `onBlur`. On mobile, tapping any control (including "Save") blurs the textarea first, so the editor can collapse before the tap resolves. | High | Both | Commit on an explicit Done/Save action rather than blur, or delay the blur handler past the click. |
| `WritingPad.tsx:57–63` | Perceived UX | Auto-grow sets `height = max(scrollHeight, 200px)` with no ceiling. A long note grows past the viewport while the keyboard is up and the caret scrolls out of view with no `scrollIntoView`. | Medium | Both | Cap the height and let the textarea scroll internally, or keep the caret in view on input. |
| `TriageModal.tsx:130–163` | Layout | Each row is avatar + name + "Track" + "No meeting" on one line. Inside a `max-w-md` modal at 375 px the name column collapses to ~80 px and every name truncates to a couple of characters. | High | Both | Stack the actions under the name below `sm:`, or use a segmented control. |
| `TriageModal.tsx:128` | Scroll | `max-h-80 overflow-y-auto` list nested in the modal's own scroller, with no `overscroll-behavior`. | Medium | Both | `overscroll-behavior: contain`. |
| `forms.tsx:356, 439, 711`, `PersonProfile.tsx:304, 551`, `TeamProfile.tsx:286`, `ManagerProfile.tsx:210`, `SessionTable.tsx:61`, `MeetingEditor.tsx:316` | Navigation | Nine destructive actions use `window.confirm()`. In iOS standalone mode this renders a system alert titled with the origin, breaking the installed-app illusion; on Android it is a non-themed dialog. | Medium | Both (worse in standalone) | Replace with the in-app `Modal` and a clearly-labelled destructive confirm button. |
| `Overview.tsx:125` | Layout | `grid-cols-1 lg:grid-cols-3` means the mobile order is: exec brief → health scan → needs attention → coverage gaps → domain totals. The AI brief card, the least actionable item, occupies the entire first screen. | Medium | Both | Reorder for mobile so "Needs attention" leads; collapse the brief behind a disclosure. |
| `Overview.tsx:243, 292, 326` | Touch target | List rows are `px-2 py-1.5` around a 30 px avatar → ~42 px tall, marginally under the minimum, with no `:active` state. | Low | Both | `py-2.5` and an active state. |
| `Overview.tsx:131` | Visibility | "✦ Generate with AI" and "Open in table" compete as primary actions in adjacent cards, both rendered as filled/coloured buttons with no clear hierarchy. | Low | Both | One primary per screen; demote "Open in table" to a link. |
| `PersonProfile.tsx:250–270` | Layout | Four sub-tabs ("Profile", "1:1s", "Topics", "Notes") in a `px-3` strip with no horizontal scroll. Combined with the entity chrome above and the app tabs above that, a phone shows three stacked navigation bars before any content. | High | Both | Collapse the app tab bar when an entity is open on mobile; make the sub-tab strip scrollable. |
| `tabs.tsx:205` | Visibility | Tab badges are `hidden md:flex`, so the session/note counts never appear on mobile — a signal that exists only on desktop. | Low | Both | Show badges at all widths. |
| `ProfileFillModal.tsx:399` + `index.css:939` | Layout | `.profile-fill-split` becomes two columns at 720 px and has `min-height: 22rem`. Below that it stacks — correct — but the modal is `size="lg"` (`max-w-3xl`), so on a phone it is a full-height sheet with a 14 rem textarea and the action bar pushed below the fold once the keyboard opens. | High | Both | Pin the action bar to the bottom of the sheet with `position: sticky` and safe-area padding. |
| `ProfileBuildCanvas.tsx` / `index.css:853–931` | Perceived UX | Continuous `profile-build-breathe` and `profile-pulse-dot` animations with no `prefers-reduced-motion` guard (the guard at `index.css:686` covers only `.field-input`). | Medium | Both | Extend the `prefers-reduced-motion` block to all keyframe animations. |
| `PhotoPicker.tsx:43–63` | Touch | The photo well is built around drag-and-drop (`onDragEnter`/`onDrop`) with "drop an image" copy. Drop events never fire from touch; the click fallback works but the affordance is wrong. | Low | Both | Pointer-aware copy ("Tap to choose a photo") and a visible camera option. |
| `PhotoPicker.tsx:119–120` | Forms | `<input type="file" accept="image/*">` with no `capture` hint. Usable, but there is no direct "take a photo" path. | Low | Both | Offer a second button with `capture="user"` on coarse pointers. |
| App-wide | Layout | No landscape handling anywhere. In landscape on a phone (~375 px tall) the header + tab strip + entity chrome + sub-tabs consume most of the height, leaving a sliver of content. | Medium | Both | Compact the chrome under `@media (orientation: landscape) and (max-height: 480px)`. |
| App-wide | Layout | 33 of 40 app components contain no responsive prefix at all (`AICoach`, `PersonProfile`, `TeamProfile`, `TableView`, `MeetingEditor`, `TopicKanban`, `forms`, `ui`, …). Mobile layout was never a design target. | High | Both | Treat this list as the work queue; a `sm:`/`lg:` pass is required per component, not a global fix. |
| App-wide | Performance | Bundle includes `@xyflow/react`, Tiptap + 6 extensions, `react-markdown` + `remark-gfm`, and `react-aria-components` with no code splitting — `App.tsx` imports every screen statically. Heavy first load on mobile data. | Medium | Both | `React.lazy` the Org tree canvas, the session editor and the markdown stack. |
| App-wide | Perceived UX | No skeleton states. Every async surface (exec brief, AI coach, profile fill, structure-notes) goes from empty to text with no placeholder, and streamed AI text reflows the container on every token. | Medium | Both | Add skeletons and reserve space for streaming output. |
| `index.html:7–13` | Performance | Google Fonts is loaded render-blocking from a third-party origin, while Inter is self-hosted via `@fontsource`. On mobile data this adds a DNS + TLS round-trip before first paint. | Medium | Both | Self-host Source Serif 4 via `@fontsource` for consistency and offline support (also required for the service worker to precache it). |
| `index.html:6` | Platform | No `theme-color` meta, so the Android Chrome address bar and the iOS standalone status bar do not match the app; there is also no `media="(prefers-color-scheme: dark)"` variant for dark mode. | Medium | Both | Add both light and dark `theme-color` metas. |
| `App.tsx:171–178` | Visibility | The dark-mode toggle is an emoji (`☀️`/`🌙`) inside a button. Emoji render inconsistently across Android OEM fonts and carry no semantic weight; the `aria-label` is correct but the visual is unreliable. | Low | Android | Use the icon set already in the project (`@untitledui/icons`). |
| App-wide | Wayfinding | No visible "back" affordance on the Focus view besides a 28 px icon; users on Android will use the system back, which works via the router — but on iOS standalone there is no back gesture and no browser chrome, so the icon is the only exit. | High | iOS (standalone) | Guarantee a large, labelled back control on every focus/editor surface in standalone mode. |

---

## Consolidated fix-it prompt

> Everything below is a single paste-ready brief for a coding agent with repo
> access. It requires no further editing.

---

**CONSOLIDATED FIX-IT PROMPT**

You have write access to the `leadwell` repository (React 19 + TypeScript + Vite
+ Tailwind v4 + React Aria Components, source in `src/`). Implement the
following mobile fixes. The app must work as mobile web on iOS Safari and
Android Chrome, and as an installed/standalone PWA. Work in the order given:
Critical → High → Medium → Low. Do not refactor beyond what each item requires.

Two conventions to use throughout:

- Add a Tailwind variant for coarse pointers in `src/index.css` and use it for
  every touch-only rule:
  `@custom-variant touch (@media (pointer: coarse));`
- Wrap every decorative `:hover` rule in
  `@media (hover: hover) and (pointer: fine)` so hover styles never stick after
  a tap.

---

### CRITICAL

**C1 — Ship the PWA (`index.html`, new `public/`)**
Create `public/manifest.webmanifest` with `name: "LeadWell"`,
`short_name: "LeadWell"`, `start_url: "/"`, `scope: "/"`,
`display: "standalone"`, `background_color: "#fafaf9"`,
`theme_color: "#0d9488"`, and icons at 192×192 and 512×512 in both `any` and
`maskable` purposes. Add `public/apple-touch-icon.png` (180×180) and
`public/favicon.ico`. In `index.html` add: the manifest link, the apple-touch
icon, `<meta name="apple-mobile-web-app-capable" content="yes">`,
`<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
`<meta name="apple-mobile-web-app-title" content="LeadWell">`, and light/dark
`theme-color` metas.
*Acceptance:* Chrome DevTools → Application → Manifest reports no errors and
shows an install prompt; iOS "Add to Home Screen" shows the LeadWell icon and
launches with no Safari chrome.

**C2 — Viewport + safe areas (`index.html`, `src/index.css`, `src/App.tsx`)**
Set the viewport to
`width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.
Size the app shell with `100dvh` (keep a `100vh` fallback declaration first).
Apply `padding-top: env(safe-area-inset-top)` to the app header,
`padding-bottom: env(safe-area-inset-bottom)` to every bottom-anchored surface
(new bottom nav, modal sheets, editor action bars), and left/right insets for
landscape.
*Acceptance:* In iOS standalone on a notched device, no content sits under the
status bar or home indicator in either orientation. In iOS Safari with the
toolbar visible, the bottom row of every pane is reachable. In Android Chrome,
opening the keyboard resizes rather than overlays the layout.

**C3 — Mobile layout for the split pane (`src/App.tsx`, `src/components/EntitySurface.tsx`)**
Below `lg:`, stop rendering `<main>` and `<PeekPanel>` side by side. When an
entity is selected on a small viewport, render only the entity surface
full-bleed (equivalent to today's focus view); the canvas returns when the
selection is cleared. Remove the `min-w-[16rem]` / `min-w-[20rem]` minimums from
the mobile path.
*Acceptance:* At 320 px, 375 px and 414 px wide, selecting a team or person
produces no horizontal document scroll and the entity content uses the full
width.

**C4 — Reveal every hover-only control**
These 13 controls are `opacity-0 group-hover:opacity-100` and are unreachable on
touch. Make each one always visible under the `touch:` variant (keep the
hover-reveal behaviour on fine pointers):
`OrgTree.tsx:1188` (edit manager), `OrgTree.tsx:1293` (add team to a report),
`OrgTree.tsx:1454` (add person / edit team), `PersonProfile.tsx:503` (delete
goal), `TeamProfile.tsx:584` (delete team goal), `TeamProfile.tsx:621` (delete
member), `TeamProfile.tsx:753` (remove member — also raise the colour from
`text-stone-300` to `text-stone-500`), `NotesPanel.tsx:99` (delete note),
`WinsLedger.tsx:79` (delete win), `SessionTable.tsx:136` (delete session),
`TopicKanban.tsx:166` (delete topic), `PhotoPicker.tsx:72` and
`PhotoPicker.tsx:184` (photo affordances).
*Acceptance:* On a touch device every one of these actions is visible and
tappable without any hover.

**C5 — Touch targets to 44 × 44 (`button-utility.tsx`, `button.tsx`, `checkbox.tsx`, `tabs.tsx`, `EntityChrome.tsx`, `ui.tsx`)**
Under the `touch:` variant: give `ButtonUtility` `min-height: 44px;
min-width: 44px` (keep the current icon size — grow the padding); give
`button.tsx`'s `link-color` / `link-gray` / `link-destructive` variants a
`min-height: 44px` and vertical padding, overriding the current `p-0!`; give the
checkbox label wrapper enough padding for a 44 px hit area around the 16 px box;
give underline tabs `min-height: 44px` and `px-3`. In `EntityChrome.tsx` raise
the pager/expand/close cluster gap from `gap-0.5` to at least `gap-2`.
*Acceptance:* Every interactive element measures ≥44 × 44 CSS px with ≥8 px
spacing from its neighbours when audited with Chrome DevTools' touch-target
check on a 375 px viewport.

**C6 — Separate destructive actions from their neighbours**
`ui.tsx:97` (`ProfileAdminLinks`: "Edit" beside "Remove"), `TeamProfile.tsx:262`
("Mark met today" / "Settings" / "Delete" in one row), and
`MeetingEditor.tsx:311` ("Tools" beside "Delete"). In each case move the
destructive action into an overflow menu or a separate row, and never place it
immediately adjacent to a benign control.
*Acceptance:* No destructive control sits within 24 px of a non-destructive one
on a 375 px viewport.

**C7 — 16 px minimum on every text input (iOS zoom)**
Under the `touch:` variant set `font-size: 16px` on: `.field-input` and
`.field-input--sm` (`index.css:437, 551`), `Input size="sm"` (`input.tsx:75`),
`TextArea size="sm"` (`textarea.tsx:37`), `.meeting-editor-transcript`
(`index.css:1043`), `NativeSelect size="sm"` (`select-native.tsx:20`), and
`.notion-markdown-source` (`index.css:1200`).
*Acceptance:* On iOS Safari, focusing any input, textarea or select in the app
does not change the page zoom level.

**C8 — Make the Topics kanban work on touch (`src/components/TopicKanban.tsx`, `src/components/PersonProfile.tsx:586`)**
Replace the HTML5 drag-and-drop implementation (`draggable`, `dataTransfer`,
`onDragStart`/`onDrop`) with a pointer-events-based drag that works on touch, and
**additionally** provide a non-drag path: a "Move to…" control on each card that
sets the column directly. Update the instructional copy so it does not tell
touch users to drag.
*Acceptance:* On a phone, a topic can be moved from Backlog to This 1:1 to Done
without a mouse, and the copy matches the available gesture.

**C9 — Goal sliders (`PersonProfile.tsx:507`, `TeamProfile.tsx:626`)**
The `<input type="range" style={{ height: 4 }}>` is unusable with a finger. Give
the input a ≥44 px tall hit area and style the visible 4 px track via
`::-webkit-slider-runnable-track` / `::-moz-range-track`, with a ≥24 px thumb.
*Acceptance:* Goal progress can be adjusted accurately with a thumb on a phone.

**C10 — Do not sign the user out on a network error (`src/store/useStore.ts:1200–1214`)**
`bootstrap()` currently catches any `loadAll` failure and sets `phase: "anon"`.
Distinguish an authentication failure (no session → `anon`) from a network or
server failure. On network failure, keep the session, add and render a new
`phase: "error"` with an explanatory message and a Retry button, and retry
automatically with exponential backoff and on the `online` event.
*Acceptance:* With the network disabled mid-load, the app shows a retry state,
not the sign-in screen, and recovers when connectivity returns.

**C11 — Surface sync failures (`src/store/useStore.ts:1300–1312`)**
`runSync()` swallows every failure into `console.error`. Track a sync status in
the store (`idle | saving | error`), render a persistent, non-blocking indicator
when a write has failed, retry with backoff, and flush on `online` and on
`visibilitychange → visible`.
*Acceptance:* With the network disabled, editing a note shows a visible
"Not saved — retrying" state; re-enabling the network clears it and the edit
persists.

---

### HIGH

**H1 — Bottom navigation and header collapse (`src/App.tsx`)**
Below `lg:`, move the four primary tabs (Overview, Org tree, Table, People
table) into a fixed bottom tab bar with safe-area bottom padding. Collapse the
header's "Settings" and dark-mode toggle into an overflow menu, keeping only the
wordmark and "Ask AI" inline. Make the tab strip horizontally scrollable
(`overflow-x-auto scrollbar-hide`) wherever it remains.
*Acceptance:* At 320 px the header does not wrap or clip, and all four
destinations are reachable within thumb range.

**H2 — Scroll containment (`src/index.css`, `modal.tsx`, `ui.tsx`)**
Add `overscroll-behavior: contain` to every scroll container: the peek/focus
body, profile bodies, `AICoach.tsx:118`, `TriageModal.tsx:128`, the modal body in
`ui.tsx:156`, and the kanban strip. Add `overscroll-behavior-y: none` to the app
shell to suppress pull-to-refresh. In the modal stack, keep exactly one
scrolling element: remove `max-sm:overflow-y-auto` from `modal.tsx:33` and
`overflow-y-auto` from `modal.tsx:46`, leaving only the body wrapper in
`ui.tsx:156`.
*Acceptance:* Scrolling to the end of a nested list does not scroll the surface
behind it; pull-to-refresh does not reload the app; modal scrolling is smooth
with a single momentum context.

**H3 — Touch feedback and non-sticky hover (`button.tsx`, `button-utility.tsx`, `tabs.tsx`, `index.css:706, 760`)**
Add `active:` states (background shift and/or `scale(0.98)`) to all button
variants and tabs. Wrap `.team-card:hover`, `.person-row:hover` and their
descendant hover rules in `@media (hover: hover) and (pointer: fine)`. Add
`touch-action: manipulation` to the app root. Remove
`.field-input:focus { transform }` under `touch:`.
*Acceptance:* Every tap produces immediate visual feedback; no element remains
in a hover state after a tap; there is no 300 ms delay on button taps.

**H4 — Org tree on mobile (`src/components/OrgTree.tsx`, `src/App.tsx`)**
Below `lg:`, do not render the React Flow canvas. Render the existing outline
from `TableView` instead (or a compact list of teams and reports), preserving the
domain filter and health scan. Where the canvas is rendered, hide the MiniMap
and the legend below `lg:`, collapse the top-left toolbar into a single
action button that opens a sheet, and reserve a ~20 px non-interactive left
gutter so the iOS edge-back gesture is not swallowed.
*Acceptance:* On a phone the Org tree tab is readable and navigable with no
pinch-zooming required, and the iOS back gesture works from that tab.

**H5 — Tables become cards on mobile (`PeopleTable.tsx`, `TableView.tsx`, `SessionTable.tsx`)**
Below `lg:` render each row as a stacked card rather than a table row.
`PeopleTable`: avatar, name, role, team, health, next 1:1. `TableView`: name,
type, health + note, readiness. `SessionTable`: date and next date on one line,
status and summary below. Keep the table markup for `lg:` and up, and fix
`TableView`'s `sticky top-0` header by making the Card the vertical scroll
container.
*Acceptance:* No horizontal scrolling is required to read any table on a 375 px
viewport; the sticky header actually sticks on desktop.

**H6 — Contrast to WCAG AA**
Replace `text-stone-400` with `text-stone-500` for all informational secondary
text in light mode (2.52:1 → 4.80:1). In dark mode, replace `text-stone-500`
with `text-stone-400` for the same text (3.64:1 → passing). Raise
`dark:text-stone-600` to `dark:text-stone-400` in `.journal-hint`
(`index.css:166`), `.session-editor-mode-hint` (`index.css:1066`) and
`.notion-markdown-hint` (`index.css:1189`) — currently 2.59:1. Replace
`text-stone-300` (1.6:1) in `PeopleTable.tsx:192` and `TeamProfile.tsx:753`.
*Acceptance:* An automated contrast audit (axe or Lighthouse) reports no
contrast failures in either light or dark mode.

**H7 — Replace load-bearing `title` attributes**
Roughly 40 `title=` attributes carry the only explanation for health levels,
readiness states, stale markers, projected-vs-booked countdowns and domain names
(`Health.tsx`, `OrgTree.tsx`, `ReadinessChip.tsx`, `PrepPanel.tsx:185`,
`TableView.tsx`). `title` never appears on touch. Convert each to a tap-to-open
popover, or render the text inline.
*Acceptance:* Every explanation available on desktop hover is reachable by tap
on a phone.

**H8 — Suppress autofocus on touch**
Remove or gate all ten `autoFocus` call sites under `touch:`:
`MeetingEditor.tsx:336, 483`, `forms.tsx:122, 229, 420, 485, 576`,
`NotesPanel.tsx:60, 108`, `ProfileFillModal.tsx:415, 476`. Focus the dialog
container for accessibility instead of the first field.
*Acceptance:* Opening any modal or session on a phone does not raise the
keyboard until the user taps a field.

**H9 — Slash menu positioning (`src/components/SlashMenu.tsx:44`)**
Clamp the fixed-position menu to `window.visualViewport` (which excludes the
keyboard), flip it above the caret when there is insufficient room below, and
cap its width at `calc(100vw - 32px)`.
*Acceptance:* Typing `/` at the bottom of the editor with the keyboard open
shows the full menu above the caret, fully on screen.

**H10 — Chat autoscroll (`src/components/AICoach.tsx:49`)**
Replace `bottomRef.scrollIntoView({ behavior: "smooth" })` with a direct
`container.scrollTop = container.scrollHeight` on the chat element only, applied
only when the user is already scrolled to the bottom.
*Acceptance:* A streaming AI response scrolls the chat log without moving the
profile panel or the page.

**H11 — Fix button-in-button markup (`WritingPad.tsx:99`, `NotesPanel.tsx:113`)**
Rendered markdown (containing links and checkboxes) is nested inside a
`<button>`. Replace with a non-button container plus an explicit "Edit"
affordance.
*Acceptance:* Tapping a link inside a note follows the link and does not enter
edit mode; the HTML validates.

**H12 — Note editing does not exit on blur (`NotesPanel.tsx:107`)**
Commit note edits on an explicit Done/Save control instead of `onBlur`, so
tapping a button does not collapse the editor before the tap resolves.
*Acceptance:* On a phone, tapping "Save note" while editing reliably saves.

**H13 — Android back closes modals (`modal.tsx`, `ui.tsx`)**
Push a history entry when any modal or sheet opens and close it on `popstate`.
*Acceptance:* On Android, the back gesture closes an open modal rather than
navigating away from or exiting the app.

**H14 — Sheet dismissal (`modal.tsx:15`)**
Modals present as bottom sheets on mobile with no swipe-down dismissal. Add a
drag handle and swipe-down-to-dismiss, or remove the `items-end` sheet styling
so the affordance matches the behaviour.
*Acceptance:* The sheet's appearance and its available gestures agree.

**H15 — Error and validation states**
Add inline validation messages to all forms in `forms.tsx` (currently an empty
name is silently ignored). Add the `phase: "error"` UI from C10. Give
`App.tsx:126` a branded splash with skeletons instead of a bare text line.
*Acceptance:* No form submit is a no-op without an explanation; no async
failure results in an unexplained screen.

**H16 — Triage rows stack (`TriageModal.tsx:130`)**
Below `sm:`, stack "Track" and "No meeting" under the name instead of beside it.
*Acceptance:* At 375 px, full names are readable and both actions are ≥44 px
tall.

**H17 — Session editor action bar and dates (`ProfileFillModal.tsx:399`, `SessionTable.tsx:99`, `MeetingEditor.tsx:330`)**
Pin the profile-fill modal's action bar with `position: sticky; bottom: 0` plus
safe-area padding so the keyboard cannot push it off screen. Scroll the focused
row into view when a date input receives focus.
*Acceptance:* With the keyboard open, the primary action of every modal remains
visible, and editing a date never hides the field being edited.

**H18 — Reduce navigation stacking (`PersonProfile.tsx:250`)**
On mobile an entity screen shows the app tab bar, the entity chrome and the
sub-tab strip stacked. With the bottom nav from H1 in place, drop the top tab
strip on entity screens and make the sub-tab strip horizontally scrollable.
*Acceptance:* At most two navigation bars are visible above content on a phone.

**H19 — Guarantee an exit from standalone surfaces**
In iOS standalone there is no browser back. Ensure every focus view and the
full-screen session editor has a large, labelled back control (`EntityChrome.tsx:163`,
`MeetingEditor.tsx:299`), not a 28 px icon.
*Acceptance:* Every full-screen surface can be exited by tap in iOS standalone.

**H20 — Offline shell**
Add a service worker (e.g. `vite-plugin-pwa` in `generateSW` mode) that
precaches the app shell and static assets, plus an offline fallback route.
*Acceptance:* Launching the installed app with the network disabled renders the
app shell and an offline message, not a browser error page.

---

### MEDIUM

**M1** — Gate all `title`-free icon-only buttons in `EntityChrome.tsx` with
visible labels below `sm:`.
*Acceptance:* No unlabelled icon-only control on mobile.

**M2** — Add horizontal swipe-to-page between sibling entities in
`EntityChrome.tsx`, with a threshold and a left-edge exclusion zone so it does
not fight the iOS back gesture.
*Acceptance:* Swiping left/right on an entity pages to the next sibling; the iOS
edge-back gesture still works.

**M3** — Replace the nine `window.confirm()` calls (`forms.tsx:356, 439, 711`,
`PersonProfile.tsx:304, 551`, `TeamProfile.tsx:286`, `ManagerProfile.tsx:210`,
`SessionTable.tsx:61`, `MeetingEditor.tsx:316`) with the in-app `Modal`.
*Acceptance:* No system dialog appears in standalone mode.

**M4** — Kanban strip: add `scroll-snap-type: x mandatory`,
`scroll-snap-align: start`, `overscroll-behavior-x: contain`, and widen columns
to ~80 vw below `sm:` (`TopicKanban.tsx:64, 71`).
*Acceptance:* Columns snap cleanly and one column fills most of the screen.

**M5** — Form input hints: `enterKeyHint="send"` on the AI chat input
(`AICoach.tsx:146`), `inputMode="numeric"` + `pattern="[0-9]*"` on the nudge-days
field (`PrepPanel.tsx:246`), `autocomplete`/`name` on the identity fields in
`forms.tsx`, and a visible "Add" button on the goal form
(`PersonProfile.tsx:522`).
*Acceptance:* The mobile keyboard matches each field's purpose and autofill is
offered for name fields.

**M6** — Extend the `prefers-reduced-motion` block (`index.css:686`) to cover
`profile-build-breathe`, `profile-pulse-dot`, `profile-chip-in`, and the modal
enter/exit animations.
*Acceptance:* With Reduce Motion enabled, no looping animation runs.

**M7** — Landscape: compact the header, tab strip and entity chrome under
`@media (orientation: landscape) and (max-height: 480px)`.
*Acceptance:* In landscape on a phone, content occupies at least 60% of the
viewport height.

**M8** — Code-split `@xyflow/react`, the Tiptap stack and `react-markdown` with
`React.lazy` + `Suspense` in `App.tsx`.
*Acceptance:* The initial JS bundle drops measurably and the Overview tab is
interactive without loading the canvas or editor code.

**M9** — Self-host Source Serif 4 via `@fontsource` and remove the Google Fonts
`<link>` from `index.html:7–13`.
*Acceptance:* No third-party font request at load; the serif face still renders
offline in the installed app.

**M10** — Add skeleton states for the executive brief, AI coach, profile fill and
structure-notes surfaces, and reserve height for streaming text so it does not
reflow on every token.
*Acceptance:* No async surface transitions from fully blank to content.

**M11** — Reorder the Overview grid for mobile so "Needs attention" leads and the
AI brief is behind a disclosure (`Overview.tsx:125`).
*Acceptance:* The first mobile screen of Overview shows actionable items.

**M12** — Feature-detect `webkitSpeechRecognition` on mount in
`MeetingEditor.tsx:190` and hide or disable "Listen" with an explanation where
unsupported, rather than failing after the tap.
*Acceptance:* In iOS standalone the Listen control is either functional or
visibly unavailable with a reason.

**M13** — Cap the `WritingPad` auto-grow height (`WritingPad.tsx:57`) and keep the
caret in view on input.
*Acceptance:* Typing a long note with the keyboard open never moves the caret
off screen.

**M14** — Give `PeopleTable` rows an `active:` state and make the row's target an
explicit control rather than a `tr` click handler (`PeopleTable.tsx:139`).
*Acceptance:* Row taps give feedback and the health select never triggers row
navigation.

---

### LOW

**L1** — Show tab badges at all widths (`tabs.tsx:205`, currently `hidden md:flex`).
*Acceptance:* Session and note counts are visible on mobile.

**L2** — Replace the emoji dark-mode toggle with `@untitledui/icons`
(`App.tsx:171`).
*Acceptance:* The toggle renders identically across Android OEM font stacks.

**L3** — Raise Overview list rows to `py-2.5` and add an `active:` state
(`Overview.tsx:243, 292, 326`).
*Acceptance:* Rows are ≥44 px tall with tap feedback.

**L4** — One primary action per screen: demote "Open in table"
(`Overview.tsx:200`) to a link so it does not compete with "Generate with AI".
*Acceptance:* Each screen has a single visually dominant action.

**L5** — Pointer-aware copy: "Click to edit" → "Tap to edit" and "Esc to preview"
→ a visible Done button on coarse pointers (`WritingPad.tsx:108, 149`); "drop an
image" → "Tap to choose a photo" (`PhotoPicker.tsx:43`).
*Acceptance:* No instruction references an input method the device lacks.

**L6** — Add a `capture="user"` camera option beside the file input
(`PhotoPicker.tsx:119`).
*Acceptance:* Taking a photo is one tap from the picker on a phone.

---

### Re-test matrix

After implementation, re-test **every** fix above on all four of the following
surfaces — several of these issues have different root causes per platform and a
fix verified on one will not transfer:

1. **iOS Safari (browser tab)** — notched device, both orientations. Confirm no
   input zoom, the address bar behaviour is sane, the bottom of every pane is
   reachable, and the edge-back gesture works on every tab including Org tree.
2. **iOS standalone (Add to Home Screen)** — confirm the icon and splash, the
   status bar treatment, safe-area insets top and bottom, that no system
   `confirm()` dialog appears, and that every full-screen surface has a working
   exit.
3. **Android Chrome (browser tab)** — confirm the install prompt appears, the
   keyboard resizes rather than overlays, the hardware/gesture back closes
   modals, and pull-to-refresh does not fire from inside scrolled panels.
4. **Android installed PWA** — confirm standalone display, `theme_color` on the
   status bar, offline shell, and back-gesture behaviour.

For each surface, exercise at minimum: sign-in → Overview → Org tree → select a
team → select a person → each of the four person tabs → move a topic between
kanban columns → open and write a session → open the AI coach → open Settings →
delete something. Test each once online and once with the network disabled
mid-session.
