# Personas

> **Status:** DRAFT — built from the product's implied user and the seed data.
> Every line here is a hypothesis until validated. Use
> [`../templates/persona-interview.md`](../templates/persona-interview.md).

A note on method: these are **behavioral** personas, not demographic ones. Age
and job title predict nothing. What predicts everything is *how many
relationship contexts they carry* and *how much of their leadership runs
without formal authority.*

---

## P1 — The Portfolio Leader (primary)

**The one-line read:** leads meaningful numbers of people in two or more
unrelated life contexts, in different capacities, and reports up in most of
them.

### Snapshot

| | |
|---|---|
| Typical shape | 30s–50s. Mid-to-senior at a day job. Also leads something outside work — church, nonprofit, community, a side venture. |
| People carried | 15–60 across all contexts. Only a fraction are formal reports. |
| Contexts | 2–4 (Day job, Church, Family, Community) |
| Modes in play | All four. Often all four in one day. |
| Current stack | Calendar, phone notes, a Google Doc per team, an old assessment PDF, memory |
| Pays for | Personal productivity tools out of pocket. Would expense at ~$15/mo, would pay personally at ~$10. *(Hypothesis — untested.)* |

### What a bad week looks like

Monday standup runs long, so the 1:1 with the quiet senior engineer moves to
Thursday, then to next week. Wednesday, a volunteer leader texts "hey, can we
talk?" and the leader realizes they haven't had a real conversation with them
since April. Thursday, their own boss asks for a status they'd have been proud
of two weeks ago but can't reconstruct now. Sunday, they lead the setup team on
four hours of sleep and give it their leftovers. Nothing broke. Nothing was
led, either.

### Goals

- Be genuinely known by the people they lead, and genuinely know them back
- Never be blindsided by someone's departure, burnout, or resignation
- Convert years of experience into something that compounds
- Be trusted upward without playing politics
- Keep the non-work leadership from becoming a guilt tax

### Frustrations

- Knowledge about people is scattered and evaporates
- Every tool assumes one org, one team, formal authority, and an HR admin
- Assessment results are filed and forgotten instead of used
- Generic leadership advice ("give more feedback") is useless at 8:55am
- Switching contexts costs real cognitive load and nothing helps

### Trigger moments (when they'd go looking)

- Someone good quits and it was a surprise
- Their span suddenly widens — promotion, a merged team, a new ministry
- The whole team takes CliftonStrengths and the results land with nowhere to go
- A performance review where they couldn't articulate their own value
- A conflict they handled badly and want to never repeat

### Quote (to be replaced with a real one)

> *"I know these people. I just can't get at what I know when I actually need
> it."*

### What would make them abandon LeadWell

- It becomes data entry with no payoff within the first session
- The AI gives generic advice they could have gotten anywhere
- They start worrying about who could read it
- It only fits the day job, so it becomes another work tool

---

## P2 — The Volunteer-Org Leader (strong secondary)

Church, nonprofit, or community leader. Often *only* Modes 2 and 4 — nearly all
influence, nearly no authority. May have a small paid staff and a large
volunteer body.

**What's different from P1**

- Cannot compel anything. Every ask is a request; every retention is voluntary.
- Load concentration is the central problem: 20% of the volunteers do 80% of
  the work and are the ones most at risk.
- Succession and bench depth are constant background anxiety.
- Motivation is unpaid and therefore fragile — knowing *why* someone serves is
  operationally critical, not soft.
- Budget is close to zero. Pricing and free tier matter enormously here.

**Why they matter to us:** they feel the pain most acutely, and they cluster —
one ministry leader who adopts this tells five others. Also: LeadWell was built
by someone inside this world, which is a real authority asset.

**Product gap:** everything about load, motivation, and bench is unmodeled
today.

---

## P3 — The First-Time Manager (adjacent, watch)

Newly promoted, one team, one context, mostly Mode 1 with an anxious Mode 4.

- **Fit:** high pain, high willingness to buy tools, high volume as a segment.
- **Misfit:** they don't have a portfolio, so our central differentiator
  (multi-domain, multi-capacity) is invisible to them. They'll compare us to
  simpler 1:1 tools and find us heavy.
- **Call:** do not design *for* them. Do not design them *out*. If they show up,
  the single-domain experience should be clean — but never trade P1's needs to
  win them.

---

## P4 — The Led Person (non-user beneficiary)

Not a user. Has no account and never sees any of this. But their experience is
our actual outcome, and their interests must be represented in the room.

**What they'd say if they knew this existed:**

- *"Is this a file on me?"* — the thing that determines whether this product is
  loved or hated if it ever becomes visible.
- *"Does this make my leader better at seeing me, or better at categorizing
  me?"*

**Their charter (non-negotiable):**

Every entry in this product should be something the leader would be
comfortable — or at least not ashamed — reading aloud to the person it's about.
Not because they ever will, but because that's the standard that separates
*knowing someone* from *building a dossier*. This is the origin of the AI's
prohibition on diagnostic and evaluative language. See
[`ai-doctrine.md`](ai-doctrine.md).

**Design test:** if a feature would be creepy when described to P4 in plain
language, it is creepy. Ship something else.

---

## Anti-personas — who we are not building for

| Not for | Why |
|---|---|
| **HR / People Ops** | They want org-wide compliance and reporting. That makes us an HRIS and destroys the privacy position that makes P1 trust us. |
| **The executive who wants a dashboard of their managers' notes** | This inverts the product into surveillance. Hard no. |
| **Recruiters / talent pipelines** | Different job entirely; would bend the data model toward candidates. |
| **The leader who wants ammunition** | Someone building a paper trail to fire a person. We will not optimize a single flow for this. |

---

## Segmentation that actually matters

Forget titles. Segment on:

1. **Context count** — 1 vs. 2+. This is the single strongest predictor of fit.
2. **Authority ratio** — what fraction of the people you lead you could
   actually compel. Below ~50% and our influence/leading-up features become the
   main event.
3. **Assessment literacy** — already has CliftonStrengths/Enneagram results in
   hand. High literacy = instant value; low literacy = we must deliver value
   before any assessment data exists (today, the brain-dump path).
