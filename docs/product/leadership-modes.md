# Leadership Modes — the four capacities

> **Status:** DRAFT — the question sets are the highest-leverage thing in these
> docs to validate with real leaders. Treat as a strong hypothesis.

The single most differentiating idea in LeadWell: **leadership is not one
posture.** The same leader operating in four different capacities has four
different fears, four different failure modes, and four genuinely different sets
of questions on their mind.

The app already encodes this — `Capacity` in
[`src/types.ts`](../../src/types.ts) and `capacity.label` branching in the AI
system prompts. This document is the product truth behind that code.

**How to use this:** any feature proposal must state which mode(s) it serves.
A feature that only ever helps Mode 1 is a feature for a fraction of the user's
actual life. A feature that serves Mode 3 or 4 is rarer and more defensible,
because almost nothing else in the market does.

---

## Mode 1 — Manager (formal authority)

*I have positional power. I can assign, decide, and evaluate.*
Seed examples: Frontier Staff, Setup & Breakdown, a direct-report team at work.

**Questions on their mind**

- Who on this team is struggling right now that I haven't noticed?
- Is this person in the right seat, or am I asking a Relator to do
  Command work?
- Am I giving feedback in a form this specific person can receive?
- Who's ready for more, and who is quietly over their limit?
- Do I have a real 1:1 rhythm, or is the calendar lying to me?
- Am I developing them, or just extracting work?
- If this person resigned tomorrow, would I be surprised? Should I be?

**What they fear**
Being the last to know. Discovering the resignation, the burnout, or the
conflict long after the moment when it could have been addressed.

**Failure mode**
Attention gets allocated by volume — the loud, the crisis, the person in the
next chair. Steady contributors go months without a real conversation.

**What the product owes this mode**
Coverage visibility (who's gone quiet), 1:1 continuity, per-person leadership
guidance grounded in wiring, team-level balance and blind spots.

**Today:** best-served mode. Person profile, coach, 1:1s, topic kanban, goals,
team profile, strengths donut, blind-spot detection.

---

## Mode 2 — Leader (leads without formal authority)

*I'm responsible for the outcome. I can't compel anyone. Most of them are
volunteers or matrixed to someone else.*
Seed examples: Frontier Ministries, Men's Core Team.

**Questions on their mind**

- Why would this person keep showing up? What are they actually getting?
- Am I asking too much of the two people who never say no?
- Who's the successor here — am I building a bench or a dependency on me?
- How do I hold a standard when I can't hold consequences?
- Is this team clear on why it exists, or are we running on inertia?
- Do the people carrying the most feel seen, or just used?
- Am I giving this team my leftovers because the day job is louder?

**What they fear**
Burning out the faithful. The people who most reliably say yes are the ones you
quietly destroy — and they'll never tell you they're done until they are.

**Failure mode**
Recruiting instead of developing. Load concentrates on the few. The leader
substitutes their own effort for the team's capacity, and the team never grows.

**What the product owes this mode**
Load and reliance visibility (who is carrying disproportionately), motivation
capture (why *this* person serves), succession/bench thinking, and honest
attention accounting *across* domains — the church team's neglect is only
visible next to the day job.

**Today:** partly served. Team purpose, cadence, last-met, team goals/actions,
team coach. **Gap:** nothing models volunteer motivation, load, or bench depth.
This is a real product opportunity — see [`roadmap.md`](roadmap.md).

---

## Mode 3 — Influence (leads peers)

*No authority, no responsibility line — but I need this group to move and I'm
the one who cares most.*
Seed example: Product Squad at work.

**Questions on their mind**

- Who actually decides here, versus who has the title?
- Who do I need on side *before* the meeting, not during it?
- How do I get credit for the outcome without looking like I'm claiming it?
- What does each of these people need in order to say yes?
- Where does this stall — and is it a person, or a process?
- Am I spending political capital faster than I'm earning it?
- How do I disagree here without it costing me the relationship?

**What they fear**
Being the person who cares most and has the least leverage. Doing the work,
being ignored, watching it die in someone else's queue.

**Failure mode**
Broadcasting to the group instead of moving individuals. Real influence is
sequential and private; peer leaders default to the all-hands email.

**What the product owes this mode**
Stakeholder mapping (who decides, who blocks, who's persuadable), per-person
"what they need to say yes", pre-meeting sequencing, and a way to track
commitments that have no formal accountability behind them.

**Today:** thinnest mode. It borrows the Manager surfaces, which assume
authority. **Gap:** no stakeholder/decision-power model at all.

---

## Mode 4 — Report up (leading up)

*I answer to this person. Their read of me governs my scope, my resources, and
my future.*
Seed examples: My Leaders, Work Leadership, and the `Manager` records.

**Questions on their mind**

- What does my boss actually reward — as opposed to what they say they value?
- What is *their* boss measuring them on? (Making that number look good is the
  real job.)
- Am I bringing them problems when they wanted solutions, or solutions when
  they wanted to be consulted?
- What's my currency with them — throughput, polish, loyalty, data,
  decisiveness?
- When did I last deliver something they'd remember at review time? Can I name
  three?
- Am I over- or under-communicating for their tolerance?
- Is this a "raise it now" thing or a "handle it and report later" thing?
- Are they anxious about something I'm inadvertently feeding?

**What they fear**
Being quietly re-rated without knowing why. Doing excellent work in a currency
their boss doesn't spend.

**Failure mode**
Treating the relationship as weather — something that happens to you.
Improvising every interaction, and arriving at review season with no evidence
and no narrative.

**What the product owes this mode**
The operating manual (archetype, what good looks like, anxieties, currency,
comms preferences, their scorecard) and the wins ledger — banked value phrased
in *their* currency, timestamped, recallable before a review or an ask.

**Today:** distinctively well served, and this is the sharpest wedge LeadWell
has. `LeadUpProfile`, `Win`, direction-aware AI framing, `LeadUpManual` UI.
Almost nothing else on the market does this at all.

---

## Cross-mode truths

**The switch is the hard part.** The same leader is Mode 1 at 9am, Mode 4 at
11am, and Mode 2 at 7pm. Nothing helps them make that transition, and posture
carry-over is a real failure — the directness that works with a direct report
sinks you with a peer.

**Attention is one pool.** These modes compete for a single finite budget of
care. The day job wins by default because it's loud and it pays. Only a system
that sees all four at once can make that trade-off visible. This is the
strongest argument for the multi-domain org tree, and it should be defended.

**Modes are per-relationship, not per-person.** A person can be a peer at work
and someone you lead at church. The model must never assume one capacity per
human. *(Today `Person` belongs to exactly one `Team` — a known limitation.
See [`open-questions.md`](open-questions.md).)*

---

## Ideation prompts from this doc

Good questions to open a brainstorm with:

- Pick a question above the product cannot answer today. What would it take?
- Which mode's failure mode is most expensive if it happens? Are we investing
  proportionally?
- What would a feature look like if it were designed *only* for Mode 3?
- What does a mode *switch* need — a briefing? a posture reminder? a filter?
