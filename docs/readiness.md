# Readiness — knowing whether I'm behind, before I walk in the room

*Design spec.*

## Status

**Built — Phase 1, 1:1 signal only.** `Person.cadence`, the readiness engine
([`src/lib/readiness.ts`](../src/lib/readiness.ts)), canvas layer `R`, and the
per-person prep panel. Cadence *projects* the next 1:1 from the last one, so
nothing has to be booked for the signal to work.

**Not built:** everything else. Note that **The simplification: a tracked
meeting is the unit** (below) supersedes the per-entity approach described in
the earlier sections — read those for the reasoning, that one for the model.

## The problem, stated precisely

The dread isn't "I don't have enough data about my people." It's:

> I'm sitting down in four minutes and I don't know what this meeting is for.

LeadWell today answers **"who do I know?"** — assessment coverage, `X/Y with a
read`, blind spots, domain mix. That's a *library* metric. It's backward-looking
and it never changes between Tuesday and Wednesday.

What's missing is a **forward-looking** metric anchored on *the next event*.
Coverage tells you the shelf is stocked. It cannot tell you that tomorrow's 9am
with Marcus has no agenda and you never wrote up the last one.

Those are different failures with different fixes, and today the app conflates
them into one silence.

## The core distinction: Depth vs. Prep

The word borrowed from agile — *groomed* — is the right idea aimed at the wrong
half. A backlog is groomed when **the next sprint's items are ready to pull**,
not when the backlog is well documented. Grooming is about readiness for the
next pull, and it decays.

So split the concept in two. This split is the whole design.

| | **Depth** | **Prep** |
|---|---|---|
| Question | Do I *know* this person / team? | Am I *ready* for the next time we meet? |
| Moves | Slowly, over months | Fast, resets every meeting |
| Fails as | Strategic drift — leading a stranger | The 4-minutes-out panic |
| Source | Profile, how-to-lead, mandate, lead-up manual | Agenda, notes, open commitments, date |
| Fix | A 20-minute sit-down, once | Ten minutes before the meeting |

You can be 100% Depth and 0% Prep — you know Marcus cold and you'll still walk in
naked. You can be 100% Prep and 0% Depth — a tight agenda for someone you've
never actually read. Blending them into a single "groomed %" hides *which kind of
behind* you are, and they have opposite remedies.

**Keep them separate everywhere.** Depth is the ring. Prep is the fill.

## The insight that makes it work: prep is relative to time

An empty agenda 12 days out is *fine*. An empty agenda tomorrow is an emergency.
A readiness number that ignores the clock is either permanently red (and you'll
learn to ignore it) or meaningless.

So Prep is only evaluated inside a **prep window** that opens ahead of the next
meeting:

```
prepWindow = max(2 days, 25% of the cadence interval)
```

Weekly 1:1 → window opens ~2 days out. Monthly team → window opens ~7 days out.

That gives "am I behind" an actual definition, and it's the sentence the whole
feature exists to produce:

> **Behind = the prep window is open and the checklist isn't done.**

Not a score. A condition, with a deadline attached.

## The state ladder

Five states, one per person / team / manager. Named, not numeric — a percentage
on a canvas card is dashboard sludge; a state is a decision.

| State | Color | Means | The move |
|---|---|---|---|
| **Resting** | stone | Met recently, window not open | Nothing. This is a *good* state. |
| **Ready** | emerald | Window open, checklist done | Nothing. Show up. |
| **Prep due** | amber | Window open, checklist incomplete | 10 min of grooming |
| **Loose end** | red | Meeting happened, notes never captured / commitment overdue | Close the loop |
| **Drifting** | red, hollow | Past cadence with nothing scheduled | Get it on the calendar |

Plus two modifiers, not states:

- **Unread** — no leadership read at all. Already expressed by the existing
  avatar dimming. Depth, not prep. Keep it as dimming.
- **Paused** — someone you don't do 1:1s with (most of a volunteer team).
  Excluded from readiness entirely. **This one is load-bearing.**

**Precedence:** Drifting → Loose end → Prep due → Ready → Resting.

Drifting outranks Loose end deliberately: *not having seen a human* is worse than
*not having filed the notes*. The app should never nag you about a text field
louder than it nags you about a person. That ordering is the leadership opinion
baked into the code.

## Right after a meeting, zero prep is correct

The subtle part, and the thing most tools get wrong: the moment a 1:1 ends, prep
for the next one is 0%. That is **not** being behind — it's Resting. If the
system turns amber the instant a meeting ends, every card is amber forever and
the feature is dead within a week.

Prep only starts *mattering* when the window opens. The state machine:

```
  met ──▶ Resting ──(window opens)──▶ Prep due ──(checklist done)──▶ Ready
            │                            │                             │
            │                            └──────── meeting ────────────┘
            │                                          │
            └──(cadence passed, nothing booked)──▶ Drifting
                                                       │
                            (met, notes never written) ▼
                                                   Loose end
```

## The checklists

A score you can't act on is noise. Every item is (a) explicit, (b) visible, and
(c) one click from fixed. No hidden weights, no mystery number.

### Person — 1:1 prep

1. Next 1:1 has a date
2. ≥1 topic in the **This 1:1** column *(already exists — `ActionColumn`)*
3. Last 1:1 has notes captured
4. No commitment of mine past its due date
5. Has a leadership read *(Depth gate)*
6. ≥1 active goal, or goals reviewed in the last 90 days

### Gathering — recurring group meeting

Different unit, different checks. See **Beyond the 1:1: gatherings** below.

### Manager — leading-up prep

1. Operating manual ≥ 4 of 6 fields
2. Next check-in dated
3. ≥1 win banked in the last 30 days *(Wins ledger already exists)*
4. ≥1 topic queued for the next up-meeting

That third one is the genuinely novel piece. Nobody tracks *am I ready to lead
up*. Walking into a review with an empty Wins ledger is the same failure as an
empty 1:1 agenda, one level up, and it costs more.

## Beyond the 1:1: gatherings

### First, a correction to a tempting assumption

1:1 readiness is *not* a manager-only feature. Nothing in the engine reads the
org chart — what makes it apply is a **dyad plus a rhythm**. The man you mentor
monthly and the peer you trade notes with every other week are exactly as
measurable as a direct report. Set a cadence on anyone you sit down with
one-to-one.

What genuinely doesn't fit isn't *unmanaged people*. It's **meetings that aren't
1:1s at all**.

### The unit changes

A 1:1 preps a **relationship**. A staff meeting, a practice session, a core-team
night preps a **gathering** — and the thing you'd be embarrassed about is
different. Nobody walks out of a staff meeting thinking "he didn't know me."
They walk out thinking **"why did we meet?"**

So a gathering gets its own checks. Same five states, same window logic, same
worst-of roll-up — new checklist.

### Convener or participant, not manager

The axis that changes the checks is **who's driving**, and it has nothing to do
with who reports to whom:

- Product practice meeting — nobody there reports to you, and it's *entirely*
  your prep problem, because you convene it.
- A team meeting you merely attend — the agenda isn't yours. Your contribution
  is.

**Prep follows the convener, not the org chart.** That's the rule.

```ts
Team.meetingRole?: "convene" | "attend"   // default: convene for down-teams
```

### Convener checks

1. **This session has a point.** One line: what this meeting is *for*, this
   time. Not the team's mandate — the session's reason to exist.
2. **Agenda has items** — the same kanban pattern as 1:1 topics, at team level.
3. **Last session written up** — links straight into the notes.
4. **No group commitment past due** — team actions rot quietly in a way 1:1
   commitments don't; nobody in the room owns chasing them but you.
5. **Nothing needs pre-wiring** *(see below)*

Check 1 is the one that earns its place. The characteristic failure of a
standing meeting is not that it's unprepared — it's that it runs on autopilot
with no reason to have happened. A recurring meeting with no point for *this*
session is a meeting you should cancel, and the app should be willing to say so.

### Participant checks

1. **My contribution is ready** — whatever I'm bringing.
2. **My commitments from last time are closed.**
3. **Anything I need to raise is queued.**

Notably absent: agenda and purpose. Not your job, don't score yourself on it.

### The pre-wire check

The readiness marker nobody tracks, and the one most likely to save a meeting:

> Is there anything on this agenda that shouldn't be heard for the first time in
> the room?

Flag an agenda item as needing a heads-up conversation, name who with, and
readiness stays amber until that conversation has happened. Bringing a change to
a staff meeting cold is how good decisions die in public — and it's entirely
preventable by a checkbox that makes you go have the hallway conversation first.

### Irregular gatherings: cadence vs. floor

The men's core team is the honest hard case: real, led by you, and *not on a
rhythm*. Three ways to model it, and only one isn't a lie:

- **Force a cadence** — invents an expectation you never made. It'll sit red or
  drifting forever and you'll learn to ignore the layer.
- **Exclude it** — then it's invisible, which is the thing you were trying to
  fix.
- **As-needed, with a floor** — ✅

Split the two promises a rhythm currently conflates:

| | **Cadence** | **Floor** |
|---|---|---|
| Says | "We meet every other week" | "If it's been 6 weeks, something's wrong" |
| Is | An expectation | A tolerance |
| Projects a next date | Yes | No |
| Can go Drifting | Past cadence + grace | Past the floor |

```ts
Team.meetingCadence?: Cadence | "as_needed"
Team.meetingFloorDays?: number    // as_needed only — the tolerance
Team.nextMeeting?: string         // an explicit booking always wins
```

An as-needed gathering is **Dormant** — grey, no guilt — until either you book a
date (window opens, prep due) or you cross the floor (drifting: "9 weeks since
the last one"). No projected date, no phantom deadline. The app can't tell you
you're late for a meeting you never promised to hold; it *can* tell you there's
one on Thursday with no agenda, and that it's been two months.

That flip is the point: for irregular things the app stops being a metronome and
becomes a tripwire.

## The simplification: a tracked meeting is the unit

Everything above describes three parallel systems — person cadence, team
gathering, manager check-in — each with its own fields and its own checklist.
That's a mistake, and the fix collapses it:

> **Every one of these relationships has a meeting. Track the meeting.**

One entity, opted into per subject. Not a property of a person or a team — a
thing in its own right, that happens to point at one.

```ts
type TrackedMeeting = {
  id: string;
  subjectKind: "person" | "team" | "manager";
  subjectId: string;
  /** "Practice meeting", "Staff meeting" — defaults to the subject's name. */
  name?: string;
  rhythm: Cadence | "as_needed";
  floorDays?: number;          // as_needed only — the tolerance
  nextDate?: string;           // an explicit booking always wins
  role?: "convene" | "attend"; // drives the extra checks
};
```

### The four checks are already universal

Working through every case — 1:1, staff meeting, practice session, lead-up
check-in, core-team night — the same four questions apply to all of them:

1. **On the books** — a next occurrence exists (booked, projected, or inside the floor)
2. **Last one written up**
3. **Agenda has something queued**
4. **No overdue commitments**

That's exactly the checklist already shipped for 1:1s. It was never a 1:1
checklist; it was the meeting checklist wearing a 1:1 costume. Everything else
is a small, kind-specific *extra*:

| Extra | When |
|---|---|
| This session has a point | group meeting you convene |
| Nothing needs pre-wiring | group meeting you convene |
| A win banked recently | leading up |

Four universal checks plus three conditional extras replaces three separate
checklists. The engine barely changes — it stops taking a `Person` and starts
taking a `TrackedMeeting` plus its subject.

**The one constraint that makes this work:** checks must be able to read the
*subject*, not just the meeting. "A win banked in the last 30 days" is prep for
the check-in but the data lives on the manager. Pass both, and nothing is lost.

### What it buys beyond tidiness

- **Two meetings with the same people stop colliding.** Staff meeting and 1:1s
  with the same team are separate tracked meetings with separate prep. Under
  the old model, team readiness rolled up from members and had nowhere to put
  the meeting itself.
- **The `seriesId` problem disappears.** A team with two standing meetings is
  just two tracked meetings. No special case.
- **The Prep Sweep comes free.** Sorting one collection by next occurrence *is*
  the sweep. Under three parallel systems it was a union of three queries.
- **Opt-in becomes an explicit act** — "Track this meeting" — rather than an
  implicit side effect of setting a cadence.

### What it costs — the one real hazard

Opt-in cures alarm fatigue, and introduces its own failure:

> **You can be all-green because you opted out of the hard things.**

Track the staff meeting, skip the 1:1s, and the app cheerfully reports Ready
while you haven't spoken to anyone individually in two months. That's worse than
noise, because it's *reassuring* and wrong.

The fix is a visible denominator, never a nag: a quiet `3 of 9 tracked` next to
the ready count. Not a state, not red, not a prompt — just a number you can't
un-see. If it stays at 3 of 9, that's information about how you're leading, and
it's yours to act on or ignore.

Two smaller costs, both acceptable:

- **Depth stays on the Person**, outside meeting prep. Already the design — a
  leadership read isn't prep for a specific meeting.
- **"Deliberately no 1:1s" and "haven't decided" collapse into the same
  untracked state.** The denominator above covers the case that mattered.

### Migration

`OneOnOne` is already a meeting occurrence — it just hardcodes its subject. So:

```ts
type Session = {           // was OneOnOne
  id: string; meetingId: string; date: string;
  point?: string;          // why we're meeting THIS time
  notes?: string; transcript?: string; nextDate?: string;
};
```

Backfill is one pass: every person with 1:1 history (or a `cadence`) gets a
`TrackedMeeting`, and their `oneOnOnes` rows get its `meetingId`. Real data
moves, but it's a handful of rows and it is strictly cheaper now than after
gatherings pile on. Agenda items keep reusing `Action`/`TeamAction` with a
column, exactly as 1:1 topics do today.

## Roll-up: worst-of, never average

Team state = **the worst state among its members**, not the mean. An average
hides the one person you're about to fail — a team of nine Readys and one
Drifting is not "90% ready", it's a team where someone is being dropped.

The team card shows:

- **Ring** = worst member state (what needs you)
- **Segmented bar** = the distribution (how deep the problem is)
- **Its own** team-meeting state, separate from its members'

Org level is one sentence, not a gauge:

> *Ready for 4 of 7 meetings this week · 2 need prep today · Marcus hasn't been
> seen in 6 weeks.*

## Where it lives

### 1. Chart view — a new layer, `R`

The canvas already has toggleable layers with keyboard shortcuts
(`P` people · `A` action · `M` mandate · `G` gift · `D` detail). Readiness is
layer **`R`** — no new tab, no new mental model, and it composes with the domain
filter, so *"show me readiness across Church only"* is two keystrokes.

With `R` on:

- Team card gets a **readiness rail** (left edge) in the worst-member color
- A **countdown chip** in the header: `Tue · 2d`, colored by state
- Person rows recolor their existing accent bar by readiness instead of capacity
- Sub-teams inherit the rail so a whole branch reads at a glance

The countdown chip alone may be the single most valuable pixel in the app: *when
do I next see them, and am I ready.*

### 2. The one-line answer, in the header

Always visible, no click: `4 of 7 ready · 2 need prep today`. The dread is
answered before you've decided to look for it.

### 3. Prep drawer — where you actually get ready

Opens on a person or team. The checklist, each row one click from fixed, plus:

**✦ Prep me** — drafts the agenda from open actions, the last meeting's notes,
active goals, and their profile. The AI seam is already there (`streamChat`,
`orgSystemPrompt`). This is the 8:59am moment: hit it, read for 90 seconds, and
you're not naked.

### 4. The Prep Sweep — make it a ceremony

Grooming works in agile because it's a *scheduled ritual*, not an ambient guilt
meter. A sorted list of everything whose window opens this week, worst-first,
with inline agenda fields — 20 minutes on Monday and the whole canvas goes
green.

That ritual is the actual answer to "I don't know if I'm behind." The score tells
you; the sweep fixes you.

## What the data model is missing

Small additions — most of the signal is already sitting in the store.

| Field | Why | Status |
|---|---|---|
| `Person.cadence?: Cadence` | 1:1 rhythm varies per person; also carries `"none"` for people you deliberately don't 1:1 with, so one field covers both cadence and paused. | **shipped** (migration `0006`) |
| `TrackedMeeting` + `Session` (was `OneOnOne`) | One opted-into entity replaces person cadence, team gathering config and manager check-in. See **The simplification** above — supersedes the per-entity fields this table used to list. | next |
| `Manager.nextCheckIn?: string` | Leading-up has no dates at all today. | later |
| `Person.readUpdatedAt?: string` | See below. | later |

Note: Overview's "needs attention" still hardcodes 30 days for everyone. Once
readiness covers more surfaces that should read `Person.cadence` instead —
30 days is wrong for a weekly direct and wrong for a quarterly volunteer.

### Depth should go stale

A profile written two years ago about someone who has changed is worse than no
profile — it's confidently wrong. After ~12 months untouched, Depth drops from
*Deep read* to **Verify** and prompts a re-read.

And Depth should be **three coarse tiers — None / Working / Deep — not a
percentage of fields filled.** A percentage teaches you to fill boxes to turn
something green. Coarse and honest beats precise and gamed.

## Principles this is built on

1. **Only measure what you'd act on.** Everything else is guilt generation.
2. **Green must be reachable.** A dashboard that can never be clean gets ignored,
   and then the one real alarm gets ignored with it.
3. **Decay, don't punish.** Resting is a good state. Zero prep right after a
   meeting is correct.
4. **Relationship debt outranks paperwork debt.** Always.
5. **Every red comes with one next action.** A scoreboard that only scores is a
   scoreboard you'll close.

## Phasing

**Phase 1 — the read.** ✅ Derive 1:1 readiness from data that already exists,
plus per-person cadence. Layer `R`, rail, countdown chip, distribution bar,
summary line, and the prep checklist with one-click fixes into the meeting
write-up and topic board.

**Phase 2 — tracked meetings.** `TrackedMeeting` + `Session`, opt-in per
subject, as-needed + floor, convener extras. Layer `R` reads tracked meetings
instead of people. Then **✦ Prep me** and the pre-wire check.

**Phase 3 — the rhythm.** Prep Sweep view, depth staleness and re-read prompts,
manager check-in dates and Wins-ledger recency.

Phase 1 is worth building alone. Phase 2 is what makes it stick.
