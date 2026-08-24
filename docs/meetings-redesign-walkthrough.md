# Meetings redesign — walkthrough

How to try the prototype, what changed vs today, and what to port first.

## Open it

With the app running (`npm run dev`), visit:

**[/lab/meetings](http://localhost:5173/lab/meetings)**

No sign-in needed — the lab renders above the auth gate because it runs on
fixture data in its own reducer and never touches Supabase or the live store.
**Exit lab** returns to `/tree`.

Three surfaces: **Ideas** (everything not yet on a week), **Planner** (one
meeting across its next eight occurrences), **Run** (the live occurrence).

### The five things to judge (8 minutes)

**1. Ideas is the backlog, the inbox, and the organiser — one surface.**
It used to be two. The Inbox was a queue you worked top to bottom; Ideas was a
board you organised on; both held the same pile, and "which of these two does
this live in" was a question about our filing, not your work. They merged on one
observation: **the untriaged inbox is just the "Not assigned" column.**

- **By meeting** — first column is the queue of things with no home yet, then a
  column per meeting. Drag between columns to assign.
- **By tag** — the same pile as an organising board. Dragging between columns
  **retags**, with move semantics: leaving Worship and landing in Prayer means
  it's a prayer item now, not both.
- **Refine** with All / Untriaged / Came back / Aging, or search text and tags.
- **Select several** (checkbox per card, `shift`-click for a range) and the bulk
  bar appears: add or remove any tag, assign a meeting, park, delete. A tag chip
  shows a ring when *every* selected card has it, so the same click removes it.
- Tags are managed in place: rename in the column header, click the swatch to
  recolor, bin the column to delete (topics keep their text, and any template
  band pointing at it is unwired rather than left dangling).
- **Up next** rail on the right: drop an idea straight onto a meeting's next
  occurrence without going via the Planner.

**2. Click an idea to scaffold it out.**
A card is a one-liner by design — it has to survive being one of forty on a
board. Click one and a panel opens where the idea can grow: **Break it down**
into checkable sub-points (reorder, tick, delete), free **Notes**, tag toggles,
and a real placement decision (meeting → week → band). The card then carries a
quiet `2/4 points · notes`. Escape leaves the field you're typing in; Escape
again closes.

Suggestions have no accept/dismiss buttons — the dim *suggests Frontier Staff ·
Team building* line **is** the control. Click it to take it, ignore it
otherwise; it clears itself once the topic gets a real tag or meeting.

**3. Weeks are real drop zones.**
On the Planner, grab a card **anywhere on its body** and drag it between bands,
between weeks, or up and down inside one band. A teal line shows exactly where
it lands, so a drop is an *order*, not just a container. Dragging near the edge
pans the strip. Dropping on a `~projected` week books that occurrence on the way
in. Drop targets stay invisible until you pick something up, then every band
outlines itself. Controls (checkbox, delete) opt out of dragging, so a tick is
still a tick. Keyboard: `←` `→` weeks, `↑` `↓` order, `a` for the Move palette
(meeting → week → band, plus **↩ Back to Ideas**).

**4. The running order is the template.**
Click **Running order**. Rename a band, set its tag and minutes, reorder it,
delete it, or **Apply preset** / **Save as preset** to share a shape across
meetings. One reorder here reorders every occurrence at once — that's the point.
A band's tag is what makes coverage trustworthy without anyone tagging by hand.

**5. Check off, and watch what doesn't get done come back.**
Tick topics in a week (or on Run). Then press **›** on the date control to
advance the clock a day. Everything still unchecked in the day that just passed
**returns to Ideas**, annotated *not covered Aug 20* with a push counter, and the
occurrence keeps a `Not covered: …` ledger. A banner offers **Show me**; the
**Came back** filter collects them and they sort to the top.

The header toggle **→ Ideas / → Next week** switches between coming back to you
and the older silent ride-forward, so the two can be felt side by side.

Shortcuts: `c` capture · `1`/`2`/`3` surfaces · `←→` weeks · `↑↓` order ·
`x` check · `a` move · `⌘Z` undo.

## Before / after

| | **Today (`SubjectMeetings`)** | **Lab** |
|---|---|---|
| Capture | Per-meeting Ideas box, repeated | One capture bar, plus an + Add in every band |
| The backlog | A flat list per meeting | One Ideas board, grouped by meeting or tag |
| Structure inside a week | None — one pile | Template bands, reorderable, applied to all weeks |
| Drop targets | Whole column | Band + insertion index, with a live drop line |
| Tags | = curriculum rows → empty grid cells | Dots on cards; stamped by the band; created on the fly |
| Carry-over | Manual "Roll forward" / "→ Next week" | Unchecked comes **back to Ideas**, annotated + ledgered |
| Depth | A topic is only ever its title | Click to open: sub-points, notes, placement |
| Card | Title, chips, badges and buttons competing | Title at full contrast; everything else one muted line |
| Action items | Topics pressed into service | First-class follow-ups ("Since last time") |

The genuine novel insight — **coverage over time** — survives as a slim line
(`coverageStats`), not a matrix of empty cells.

## What to port first (recommended order)

1. **Template bands + flat week columns** in live `TopicBoard`. Needs
   `meetings.template jsonb` and `topics.section_id`; biggest structural win.
2. **Drop index + `useBoardDnD`** — replaces `useCardDrag` on both boards. No
   schema change; `topics.order` just gets renumbered per bucket on drop.
3. **In-place composers** — `addTopic(raw, target)` with `#tag` creating tags.
4. **Carry-back to Ideas** — `topics.returned_on`, `returned_from_date`,
   `sessions.uncovered text[]`. A nightly job (or a first-open sweep) runs
   `applyReturns`.
5. **Workspace `tags` + coverage targets** — replaces `curriculum` jsonb. The
   Ideas board sits on top of this plus the bulk mutations (`tagTopics` /
   `assignTopics` / `parkTopics`), which need no further schema.
6. **`topics.notes` + `topics.points jsonb`** for the detail panel.
7. **`follow_ups` table** + Run "Since last time".
8. **Edge Function behind `suggestTags` / `suggestMeeting`** — UI already shaped
   for it.

See [meetings-redesign.md](./meetings-redesign.md) for the model and migration
sketch.

## File map

| Path | Role |
|---|---|
| `src/lab/MeetingsLab.tsx` | Shell, surfaces, prototype clock, carry-mode toggle |
| `src/lab/IdeasBoard.tsx` | The merged backlog — columns, retag, bulk, up-next |
| `src/lab/TopicDetail.tsx` | One idea in full — sub-points, notes, placement |
| `src/lab/Planner.tsx` | Week strip, template bands, rails |
| `src/lab/TemplateEditor.tsx` | Running order + presets |
| `src/lab/Run.tsx` | Banded agenda, notes, follow-ups, close-out |
| `src/lab/useBoardDnD.ts` | Drag with insertion index + edge panning |
| `src/lab/DropList.tsx` | One droppable stack, with the drop line |
| `src/lab/InlineComposer.tsx` | + Add, in every band |
| `src/lab/slots.ts` | Slot projection, `applyReturns`, coverage |
| `src/lab/store.ts` | Reducer, `DropTarget`, undo |
| `src/lab/fixtures.ts` | Frontier Staff–shaped seed data |

Escape hatch: early return in [`src/App.tsx`](../src/App.tsx), above the auth gate.
