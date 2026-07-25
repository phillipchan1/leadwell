# Metrics

> **Status:** DRAFT — nothing is instrumented today. This is the measurement
> design, not a report.

The point of this doc is to decide **what would falsify our beliefs** before we
have the data, so we can't rationalize whatever numbers show up later.

---

## North star

> **Prepared conversations per week** — the number of times a leader opens a
> person's profile or coach within 24 hours of a conversation with them.

Why this one:

- It measures the moment of value, not the moment of data entry
- It's the direct expression of the north star in
  [`overview.md`](overview.md)
- It can't be gamed by adding people or filling fields
- If it goes up, the leader is genuinely leading from the system

**Proxy until we can detect conversations:** profile-or-coach opens per active
week.

---

## The loop

Value only compounds if all three stages hold. Measure each:

```
   CAPTURE  ──→  RETRIEVE  ──→  ACT
      ↑                          │
      └──────── it worked ───────┘
```

| Stage | Question | Signal |
|---|---|---|
| **Capture** | Is the record staying alive? | People touched in last 30d ÷ total people |
| **Retrieve** | Do they come back for it? | Profile/coach opens per active week |
| **Act** | Did it change what they did? | Coach → action/topic/note created within the session |

The failure mode to watch: **capture without retrieve.** That's a leader
dutifully doing data entry with no payoff. It always ends in churn, and it
looks healthy on a naive activity dashboard.

---

## Counter-metrics

Numbers we watch to make sure we're not winning the wrong game:

| Counter-metric | Guards against | Concern threshold |
|---|---|---|
| Fields filled per person | Bloat — collecting more than we use | Rising while retrieval is flat |
| Time from app-open to useful answer | Losing the 60-second promise | > 60s median |
| Ratio of write actions to read actions | Becoming a data-entry chore | Writes ≫ reads sustained |
| People with zero AI interactions | Profiles as filing, not leading | > 50% of people |
| Single-domain users | Losing the portfolio thesis | Majority never add a second life area |

---

## Health by job

Each job from [`jobs-to-be-done.md`](jobs-to-be-done.md) gets one signal:

| Job | Signal |
|---|---|
| J1 Walk in prepared | Profile opens within 24h before a logged 1:1 |
| J2 Assessment → decision | % of assessed people whose coach has been used |
| J3 Notice drift | (No surface yet) — once built: drift-view opens per week |
| J4 Manage up | Wins banked per month; operating-manual field completion |
| J5 Capture | Median seconds from capture-start to saved |
| J6 Attention trade-off | Distribution of activity across life areas over time |

---

## Activation

**Definition of activated:** within the first session, the leader has (a) at
least one team with two or more people, (b) at least one person with a profile
beyond a name, and (c) has used the AI once.

Rationale: (a) proves the map is real, (b) proves capture happened, (c) proves
they saw the payoff. Miss (c) and they never come back — the value is invisible
until the AI answers with their own data.

**Retention definition:** returns in week 2 *and* opens an existing person
(rather than only adding new ones). Adding is enthusiasm; returning to read is
the habit.

---

## What we deliberately do not measure

- **Anything that rates a person.** No scores on humans. Ever. See
  [`principles.md`](principles.md) #9.
- **Time-in-app.** More time here is not better. The 60-second promise means
  less time is often the win.
- **Note volume as a quality signal.** Long notes ≠ good leadership.

---

## Instrumentation status

Nothing is instrumented. Before adding analytics, note the tension with
principle #5 (private by construction): event tracking on a product whose whole
promise is privacy needs an explicit, documented decision about what leaves the
device — event names and counts only, never content, never names. That decision
should be a [decision record](../decisions/) before any SDK is added.
