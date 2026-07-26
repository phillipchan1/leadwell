# Readiness — knowing whether I'm behind, before I walk in the room

*Design spec.*

## Status

**Built — Phase 1, 1:1 signal only.** `Person.cadence`, the readiness engine
([`src/lib/readiness.ts`](../src/lib/readiness.ts)), canvas layer `R`, and the
per-person prep panel. Cadence *projects* the next 1:1 from the last one, so
nothing has to be booked for the signal to work.

**Not built:** team-meeting and lead-up readiness, ✦ Prep me, the Prep Sweep,
Depth staleness. The engine's shape (states → checks → roll-up) is what those
plug into.

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

### Team — meeting prep

1. Cadence set
2. Next meeting dated, or `lastMet` inside cadence
3. ≥1 open next step
4. Mandate set
5. Every member has a read
6. Notes captured from the last team meeting

### Manager — leading-up prep

1. Operating manual ≥ 4 of 6 fields
2. Next check-in dated
3. ≥1 win banked in the last 30 days *(Wins ledger already exists)*
4. ≥1 topic queued for the next up-meeting

That third one is the genuinely novel piece. Nobody tracks *am I ready to lead
up*. Walking into a review with an empty Wins ledger is the same failure as an
empty 1:1 agenda, one level up, and it costs more.

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
| `Team.nextMeeting?: string` | `lastMet` and `cadence` exist; there's no forward date. | later |
| `Team.cadenceDays?: number` | Team `cadence` is free text ("Weekly"). Parse it on save, keep the text for display. | later |
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

**Phase 2 — the fix.** **✦ Prep me**; team-meeting and lead-up readiness on the
same engine.

**Phase 3 — the rhythm.** Prep Sweep view, depth staleness and re-read prompts,
manager check-in dates and Wins-ledger recency.

Phase 1 is worth building alone. Phase 2 is what makes it stick.
