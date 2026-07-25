# Jobs To Be Done

> **Status:** DRAFT — job statements are hypotheses; the forces analysis needs
> real switch interviews.

People don't buy products, they hire them for a job. Written as: *When
[situation], I want to [motivation], so I can [expected outcome].*

The value of this doc in ideation: **a feature that doesn't serve a listed job
is either serving an unlisted job we should write down, or it's serving no
job.** Both are worth knowing before you build it.

---

## Primary jobs

### J1 — Walk in prepared
> **When** I have a 1:1 in ten minutes with someone I haven't thought about
> since our last one, **I want to** be reminded of who they are, what we
> discussed, and what's open, **so I can** be present instead of improvising.

- Frequency: several times a week — the highest-frequency job in the product
- Served today by: person profile, 1:1 history, topic kanban, "Prep me for our
  next 1:1" coach preset
- Success signal: time-to-prepared under 60 seconds
- Weakness: prep happens on a phone, walking to a room. We're desktop-only.

### J2 — Convert an assessment into a decision
> **When** I know someone's CliftonStrengths / Enneagram / MBTI, **I want to**
> turn that into what to actually say and do with them, **so I can** stop
> letting the results sit in a PDF.

- Frequency: bursty — after a team takes assessments, then on demand
- Served today by: `derivedRead()`, strength chips, how-to-lead, AI coach
- This is the job that makes the assessment frameworks *authority* rather than
  decoration

### J3 — Notice who's drifting
> **When** I'm running at capacity across several teams, **I want to** see who
> I've gone quiet on, **so I can** catch a problem before it's a resignation.

- Frequency: weekly-ish, or triggered by a scare
- Served today by: partly — assessment coverage, `lastMet` on teams, 1:1 dates
- **Underserved.** There's no single "who has drifted" view, and drift is the
  named villain in [`storybrand.md`](storybrand.md). Highest-leverage gap in
  the product.

### J4 — Manage up on purpose
> **When** I need something from my boss, or a review is coming, **I want to**
> know what they reward and recall what I've delivered in their language, **so
> I can** stop improvising the most consequential relationship I have.

- Frequency: low but extremely high-stakes
- Served today by: operating manual, wins ledger, direction-aware AI coaching
- Most differentiated job we serve

### J5 — Capture what I know before I lose it
> **When** I've just finished a conversation and I'm still holding everything
> from it, **I want to** dump it somewhere in thirty seconds without
> structuring it, **so I can** still have it in six weeks.

- Frequency: after every meaningful conversation
- Served today by: notes, 1:1 transcript capture, AI meeting structuring,
  brain-dump profile fill
- Capture friction is the make-or-break of this entire product. If capture is
  slower than the value is obvious, the data goes stale and everything
  downstream dies with it.

### J6 — Make an honest attention trade-off
> **When** my day job is consuming everything, **I want to** see what my other
> contexts are actually getting from me, **so I can** decide deliberately
> instead of by default.

- Frequency: weekly / seasonal
- Served today by: barely — the domain-tagged multi-context tree is the
  substrate, but nothing computes or surfaces the trade-off
- The most *emotionally* resonant job and the one most unique to our shape

---

## Secondary jobs

| | Job | Status |
|---|---|---|
| J7 | **See a team, not just its people** — spot balance, blind spots, who complements whom | Served: strengths donut, `blindSpots()`, team coach |
| J8 | **Get a specific answer to a hard leadership situation** — "how do I tell X that Y" | Served: AI coach with full context |
| J9 | **Onboard my brain into the system without a data-entry slog** | Partly: brain-dump fill. First-run experience is the risk. |
| J10 | **Hold myself to a rhythm** — cadence per team/person, honored or not | Partly: `cadence`, `lastMet`, `nextDate`. No nudge, no accountability loop. |

---

## Jobs we deliberately decline

| Job | Why we say no |
|---|---|
| "Give me evidence to document a performance problem" | Inverts the product against P4. See [`personas.md`](personas.md). |
| "Let my whole org share people notes" | Kills the privacy position that makes candid capture possible. |
| "Run my whole task list" | Actions live here only when attached to a person or team. |
| "Administer the assessments themselves" | Not our layer. We make existing results useful. |

---

## Forces of progress (switch analysis)

> **Status:** hypothesis — needs real switch interviews to confirm.

**Push** (what makes the status quo painful)
- A surprise resignation, a bad conflict, a review that went badly
- Span of responsibility suddenly widening
- The felt guilt of neglecting the non-work team

**Pull** (what attracts them here)
- One canvas showing *everything* they carry — the relief of seeing it whole
- An AI that answers about *this person*, not leadership in general
- Leading up treated as a real discipline

**Anxiety** (what holds them back)
- "Is writing this down about a person weird?" ← **the biggest one**
- "Will I actually keep it current?"
- "Where does this data live, and who can subpoena or read it?"

**Habit** (what they're loyal to)
- Notes app + calendar. Free, instant, zero friction, already there.
- Their own memory, and the belief that it's sufficient.

**The implication:** our two hardest fights are *anxiety about the ethics of
writing people down* and *habit-strength of the notes app*. Both are answered
by the same things — a fast capture path and a loud, credible privacy stance.
Marketing and the first-run experience should attack these directly, not
feature depth.
