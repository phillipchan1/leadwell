# Meetings redesign — concept

*Design spec for the three-surface planner. The clickable prototype lives at
[`/lab/meetings`](../src/lab/MeetingsLab.tsx). Nothing here mutates the live
planner or the database until we like the feel.*

## Status

**Prototype.** Self-contained under `src/lab/` with fixture data and a local
reducer. Heuristic tag/meeting suggestions ship now; a real model can drop in
behind the same `suggestTags` / `suggestMeeting` seam later.

**Not built (live app):** meeting templates, `topics.section_id`, ordered drops,
optional `meetingId`, workspace tags, coverage targets, `followUps`, carry-back
ledger, topic notes/points, the merged Ideas board.

## The problem, stated precisely

The current Meetings tab on a subject stacks every meeting fully expanded —
name, rhythm, Board/Calendar, Ideas, PARKED, a horizontally scrolling week
strip, HISTORY — inside a half-width peek. Two meetings means two of everything.
Capture is fragmented because every topic is born owned by a meeting
(`addTopic(meeting.id, …)`). Tags are not tags: a tag *is* a `CurriculumSlot`,
and every slot becomes a permanent row in every week column, which is what
fills the board with empty cells.

What we want to keep:

1. **A backlog of topics** you dump without knowing when they'll land.
2. **Drag into any occurrence** of a recurring meeting — into a specific band,
   at a specific position.
3. **A running order** that is a property of the meeting, not re-decided weekly.
4. **Capture in place** — a topic can be born inside the week it belongs to.
5. **Coverage over time** — am I training this team often enough? (This is the
   piece other apps don't have.)
6. **Check off what we covered**, and **deal honestly with what we didn't**.
7. **Open an occurrence** for notes and transcript.
8. **Persistent follow-ups** that survive across occurrences.

## Three surfaces instead of one

```
        Capture  (global hotkey, or + Add anywhere)
                        │
                        ▼
             ┌─────────────────────┐
             │        IDEAS        │   by meeting → a queue
             │  everything not yet │   by tag     → an organiser
             │       on a week     │
             └──────────┬──────────┘
                        │  drag · up-next rail · move palette
                        ▼
                 ┌──────────┐   Run    ┌─────┐
                 │ PLANNER  │ ───────► │ RUN │
                 └──────────┘          └──┬──┘
                        ▲                 │
                        │                 │ still unchecked
                        │                 │ when the day passes
                        └── IDEAS ◄───────┘   + follow-ups
```

### 1. Ideas — the backlog, the inbox, and the organiser

This was two surfaces and should not have been. The Inbox was a queue worked top
to bottom; Ideas was a board for the monthly sit-down where you make sense of the
whole pile. Both held exactly the same set — every topic not yet on a week — so
"which of these two does this live in" was a question about our filing, not about
anyone's work. Two places for one pile is how a backlog quietly becomes two
backlogs.

They collapse on one observation: **the untriaged inbox is just the "Not
assigned" column.** One surface, two lenses:

- **By meeting** — first column is everything with no home yet (the queue), then
  a column per meeting. Dragging between columns assigns.
- **By tag** — the same pile as an organising board. Dragging between columns
  **retags**, with move semantics: the source tag comes off as the destination
  goes on. Adding a second tag is a deliberate bulk action, never a side effect
  of a drag.

Everything else is shared rather than duplicated:

- One capture field with the `#tag @meeting !` grammar, reachable by hotkey.
- Refinements — All / Untriaged / Came back / Aging — plus text and tag search.
- Multi-select (`shift`-click for a range) driving a bulk bar: add/remove any
  tag, assign a meeting, park, delete. Retagging thirty ideas one at a time is
  why nobody ever retags anything.
- Tags managed where they are used: rename in the column header, click the
  swatch to recolor, delete the column to delete the tag. Deleting unwires any
  template band and coverage target pointing at it rather than leaving them
  pointed at nothing.
- An **up next** rail: drop an idea onto a meeting's nearest occurrence without
  going through the Planner at all.
- Ghost suggestion chips. The line *is* the control — click to accept. Nothing
  is ever applied silently.

Scoped to unscheduled topics on purpose. Anything already sitting in a week
belongs to the Planner; showing it in both would make two surfaces argue about
the same card.

### 2. Planner — one meeting, decluttered

- Weeks stay columns; cells stop being a matrix. A column is a flat card list.
- Tags render as a colored dot + label on the card.
- Coverage moves into a slim bar: "Training 1 of 8 · Prayer 6 of 8", amber when
  thin. Same insight as today's curriculum grid, without the empty cells.
- Curriculum becomes an opt-in **coverage target**: "Training at least 1 in 4."
  Tags exist independently of it.
- Left rail: ideas scoped to this meeting + untagged + suggested.
- Column header: date, "in N days", covered count, **Run** button.
- Settings (name, rhythm, anchor day) sit behind a settings affordance.

### 3. Run — the live occurrence

- Agenda = topics in this occurrence as a checklist.
- Notes + transcript (prototype uses plain textareas; live app already has
  TipTap + Web Speech in `MeetingEditor`).
- **Action items / follow-ups** are their own entity. They belong to the
  subject, survive occurrences, and open the next Run as a "Since last time"
  band.
- Close-out: "3 of 4 covered. The 4th carries to Aug 27." One tap to change
  destination.

## Templates: the running order is a property of the meeting

A meeting has a `template: LabSection[]` — an ordered list of bands
(`Lowdown`, `Training`, `Prayer`), each optionally carrying a tag and a rough
minute count. Every occurrence renders those bands in that order, so *"where
does this go"* has an answer before the week has any content in it.

```ts
type LabSection = {
  id: string;
  label: string;
  tagId?: string;    // stamped onto anything dropped here
  minutes?: number;  // advisory
};
```

- **Reorder once, everywhere.** Moving a band in the editor moves it in all
  eight columns and in the Run agenda. That is the whole point — the old board
  made you re-decide the shape of the meeting every week.
- **The band tags for you.** Dropping into `Training` adds the Training tag.
  This is what makes the coverage bar trustworthy without anyone tagging by
  hand.
- **Presets** (`state.presets`) let one shape be shared across meetings —
  "Staff meeting", "1:1", "Service planning". Re-applying a preset matches
  existing bands by label, so filed topics stay put.
- **Deleting a band never deletes topics.** They fall into the column's
  `Unsorted` catch-all. A meeting with an empty template is one flat list —
  exactly today's behaviour, which is the honest default for a new meeting.

Order inside a band matters, so `topics.order` is dense and *local to a bucket*
(`session + section`), renumbered on every drop. A global counter was fine when
a column was an unordered pile; it isn't once a column is a running order.

## Carry-back: unfinished work comes back to you

When an occurrence's date passes, still-open topics **return to Ideas** — not to
next week.

- The card is annotated: *"Not covered Aug 20 · came back Aug 21"*, with a
  `pushed N×` counter.
- The occurrence keeps a ledger (`sessions.uncovered: string[]`), so the week it
  missed still reads truthfully in its write-up.
- Ideas sorts returned items to the top and offers a **Came back** filter.
- At three pushes the card turns amber and offers: park, drop, or promote to an
  action item.

**Why back to Ideas and not forward a week.** The forward-push was tidy but
dishonest: a topic could ride four occurrences without anyone ever deciding it
should. Coming back forces the same small decision the capture flow already asks
for — this week, later, park it, or it was never really a topic. The cost is a
fuller board; that is the accurate picture, not a regression.

The old behaviour survives behind a header toggle (`state.carryMode`), so the
two can be compared directly rather than argued about.

## An idea has depth, a card does not

A card has to survive being one of forty on a board, so it stays a one-liner.
But most things worth raising have more behind them than a title, and with
nowhere to put that it either goes into a separate doc nobody reopens or it never
gets thought through. So a topic gains two fields and a panel:

```ts
type LabPoint = { id: string; text: string; done: boolean };
// on LabTopic:
notes?: string;
points?: LabPoint[];
```

Clicking any card — on any surface — opens it. Sub-points are checkable and
reorderable, notes are free text, tags toggle, and placement (meeting → week →
band) can be set without going back to the board. The card advertises the depth
with a single muted `2/4 points · notes`, and nothing more.

The click is distinguished from a drag by distance, not by a separate handle: a
press that never travelled more than 4px is a click. This is what lets the whole
card be both the drag surface and the open target.

## Visual hierarchy: one hero per card, one accent per column

The first build of this prototype was legible in isolation and unreadable in
bulk — eight columns × four bands × N cards, each card carrying a title, filled
tag pills, a meeting name, an amber push badge, a suggestion block with two
buttons, and a hover toolbar. Every element was individually defensible and the
board was noise. The rules that fixed it:

- **The title is the only thing at full contrast.** Tags, meeting, push count and
  carry-back reason collapse into one muted line beneath it.
- **A tag is metadata, not a subject.** On a card it renders as a coloured dot
  plus muted text. The filled chip survives only where the tag *is* the thing
  being acted on — filter pills, tag column headers, the bulk-action bar.
- **Never repeat what the container already says.** A card in the Training band
  does not show a Training tag; a card in the Training column of the Ideas board
  doesn't either (`hideTagIds`).
- **Chrome appears when it is relevant.** Drop outlines only while dragging.
  `+ Add` only on column hover. Aging actions only once something has actually
  been pushed three times.
- **Make the content the control, not a button beside it.** A suggestion is a
  dim line you click to accept — no accept/dismiss pair riding on the card. It
  clears itself once the topic gets a real tag or meeting, so dismissing was
  never needed.
- **One primary action per screen.** Only the *next* occurrence gets a solid Run
  button; the other seven reveal a quiet one on hover. Eight identical primary
  buttons made the loudest thing on the board an action taken once a week.

## Tags vs coverage targets

| | **Tag** | **Coverage target** |
|---|---|---|
| What | A label on a topic (`Training`, `Prayer`) | "I want Training at least 1 in every 4 occurrences" |
| Scope | Workspace-wide | Per meeting |
| UI | Dot + chip on the card; filter pills | Slim bar above the week strip |
| Model | `tags[]` + `Topic.tagIds` | `meetings.coverageTargets: { tagId, everyNOccurrences }` |

Today's `CurriculumSlot` conflates both. The redesign splits them.

## Capture grammar

```
Claude Cowork #training @frontier !
```

| Token | Meaning |
|---|---|
| `#word` | Tag (fuzzy match against workspace tags; creates? no — suggests or requires existing) |
| `@word` | Meeting (fuzzy match against meeting names / subject names) |
| `!` | Urgent flag |
| bare text | Topic title |

Multi-line paste: each non-empty line is one topic; grammar applies per line.

## Action items (follow-ups)

```ts
type FollowUp = {
  id: string;
  subjectKind: "person" | "team" | "manager";
  subjectId: string;
  meetingId?: string;
  text: string;
  status: "open" | "done";
  openedOn: string;
  closedOn?: string;
  sourceSessionId?: string;
};
```

Not a topic. Topics are *things to talk about*. Follow-ups are *commitments
that outlive the conversation*. A topic pushed three times is often a
follow-up in disguise — hence the promote affordance.

## Suggestion seam (heuristic now, AI later)

```ts
suggestTags(text: string, ctx: SuggestContext): Suggestion[]
suggestMeeting(text: string, ctx: SuggestContext): Suggestion | null
```

- Tags: term-frequency lexicon from already-tagged topics in the workspace.
- Meeting: fuzzy match on names + recency prior toward meetings you've been
  filling.
- Same signature a Supabase Edge Function would expose. Swap the body; UI
  stays.

## Migration sketch (after the prototype lands)

1. `meetings.template jsonb` + `topics.section_id text`. Backfill: one band per
   former `curriculum` slot, in slot order; `section_id` from `slot_id`.
2. New `tags` table (`user_id`, `id`, `label`, `color`). Backfill from the
   union of all `meetings.curriculum[].label`.
3. `topics.meeting_id` → nullable. Existing rows keep their meeting.
4. `topics.tag_ids text[]` (or join table). Map `slot_id` → tag id via label
   match within that meeting's curriculum.
5. `meetings.curriculum` → `coverage_targets jsonb` `{ tagId, everyN }`.
   Default: one target per former slot with `everyN = 4`.
6. New `follow_ups` table. No backfill.
7. `topics.carried_from text[]`, `returned_on date`, `returned_from_date date`
   alongside `carried`; `sessions.uncovered text[]`. Empty for existing rows.
   A nightly job — or a sweep on first open, as the lab does — runs
   `applyReturns`.
8. UI cutover: template bands in `TopicBoard` first (biggest structural win,
   and `useBoardDnD` replaces `useCardDrag` with it), then the Ideas route,
   then Run wraps `OccurrenceNotesPanel` + follow-ups.

The live optimistic store + `repo.syncData` path stays. Lab types are a preview
of the shape, not the migration itself.

## Prototype route

`/lab/meetings` — early escape hatch in `App.tsx`, **above the auth gate**: the
lab runs on fixture data in its own reducer and never reads or writes the live
store, so requiring a Google sign-in only made the prototype unreachable for the
people meant to review it.

Seeded with Frontier Staff (four bands), Sunday Service Planning (three), and
two 1:1s — one templated, one deliberately empty — so cross-meeting placement
and the no-template case are both demonstrable. The header carries a prototype
clock; advancing it is the only way to actually watch carry-back happen.
