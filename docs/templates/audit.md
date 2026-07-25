# Audit — [date]

> Copy into `docs/audits/YYYY-MM-DD-<scope>.md`. An audit compares the app **as
> it actually is** against the docs. It produces findings, not fixes.
>
> Cadence suggestion: after any significant release, or quarterly.

**Scope:** *(whole app / one surface / AI output / copy)*
**Auditor:**
**Docs version:** *(commit SHA of `docs/` at time of audit)*

---

## 1. Jobs coverage

For each job in [`jobs-to-be-done.md`](../product/jobs-to-be-done.md):

| Job | Surface(s) | Served? | Evidence |
|---|---|---|---|
| J1 Walk in prepared | | strong / partial / weak / none | |
| J2 Assessment → decision | | | |
| J3 Notice drift | | | |
| J4 Manage up | | | |
| J5 Capture | | | |
| J6 Attention trade-off | | | |
| J7 See a team | | | |
| J8 Specific answer | | | |
| J9 Onboard my brain | | | |
| J10 Hold a rhythm | | | |

**Jobs with no surface:**
**Surfaces with no job:** *(candidates for deletion — orphan features are a
tax)*

## 2. Mode coverage

| Mode | Surfaces | Questions from `leadership-modes.md` it can answer | Gap |
|---|---|---|---|
| 1 Manager | | /7 | |
| 2 Leader | | /7 | |
| 3 Influence | | /7 | |
| 4 Report up | | /8 | |

*Counting answerable questions is the sharpest single measure in this audit.*

## 3. Principle adherence

| # | Principle | Adherence | Where it's strained |
|---|---|---|---|
| 1 | Recall over record | | |
| 2 | The specific over the general | | |
| 3 | Capacity-aware, always | | |
| 4 | Whole portfolio, one canvas | | |
| 5 | Private by construction | | |
| 6 | Dignity over insight | | |
| 7 | Grounded in the leader's frameworks | | |
| 8 | Capture at the speed of thought | | |
| 9 | Not a performance record | | |
| 10 | Earn the next field | | |

## 4. Language drift

Compare UI copy against [`lexicon.md`](../product/lexicon.md):

- Terms used inconsistently between UI, code, and prompts:
- Voice-rule violations (manage vs. lead, character vs. behavior, corporate
  abstraction, guilt in empty states):
- New concepts in the code that never made it into the lexicon:

## 5. AI spot-check

Run 5–8 real prompts across different people and modes. For each:

| Prompt | Mode | Specific to this person? | Passes read-aloud test? | Grounded in real data? | Notes |
|---|---|---|---|---|---|
| | | | | | |

**Red flags:** advice that could have come from a book · any evaluative or
diagnostic language · invented history · authority-flavored advice in Mode 3/4.

## 6. Story alignment

Against [`storybrand.md`](../product/storybrand.md):

- Is the villain (drift) visible anywhere in the product?
- Does the app ever position itself as the hero instead of the guide?
- Are the three plan steps discoverable in the actual flow?
- Are the agreement-plan promises (privacy, ownership, portability) *kept*?

## 7. The 60-second test

From cold open, time how long to be genuinely prepared for a conversation with
a specific person.

**Time:** __ s · **Target:** < 60s · **Where it goes:**

---

## Findings

Ranked by cost of leaving it alone.

| # | Finding | Severity | Doc it violates | Proposed response |
|---|---|---|---|---|
| 1 | | high/med/low | | |

## Doc corrections needed

*The audit runs both ways — sometimes the app is right and the doc is stale.*

| Doc | What's wrong | Fix |
|---|---|---|
| | | |
