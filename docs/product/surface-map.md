# Surface Map — what exists today

Every user-visible surface, the job it serves, the leadership modes it
supports, and where it's thin. This is the **audit baseline**: to check whether
the app has drifted from its intent, compare this table to
[`jobs-to-be-done.md`](jobs-to-be-done.md) and look for jobs with no surface
and surfaces with no job.

**Rule:** adding or removing a surface updates this file in the same PR.

Modes: **1** Manager · **2** Leader (no authority) · **3** Influence (peers) ·
**4** Report up. See [`leadership-modes.md`](leadership-modes.md).

---

## Navigation & shell

| Surface | File | Job | Modes | Notes |
|---|---|---|---|---|
| Header (counts, Ask AI, settings, dark) | `App.tsx` | — | all | Coverage count is the only always-visible metric |
| Tabs: Overview / Org tree / People table | `App.tsx` | — | all | |
| Login (Google) | `Login.tsx` | — | — | Seeds a new account with starter data |
| Settings | `SettingsModal.tsx` | — | — | Identity, reset |

## The map

| Surface | File | Job | Modes | Notes |
|---|---|---|---|---|
| Org tree canvas — pan/zoom, minimap, draggable persisted positions | `OrgTree.tsx` | J6 | all | The product's signature surface |
| Life-area filter | `OrgTree.tsx` | J6 | all | Only place the portfolio trade-off is visible |
| Up-teams and managers above my node | `OrgTree.tsx` | J4 | 4 | Direction encoded visually — strong |
| Sub-team nesting | `OrgTree.tsx` | — | 1,2 | |
| Team cards with coverage | `OrgTree.tsx`, `StatsBar.tsx` | J3 | 1,2 | Coverage is a weak drift proxy |
| Reset layout | `OrgTree.tsx` | — | — | |

## Person

| Surface | File | Job | Modes | Notes |
|---|---|---|---|---|
| Person profile | `PersonProfile.tsx` | J1 | all | 671 lines — the densest surface |
| Assessment editor (Clifton Top 5, Enneagram, MBTI) | `AssessmentEditor.tsx` | J2 | all | |
| Derived strengths / watch-outs / how to lead | `derive.ts` | J2 | all | Converts assessment → decision |
| Goals, notes | `PersonProfile.tsx` | J5 | 1,2 | |
| Topic kanban (backlog / this 1:1 / parking / done) | `TopicKanban.tsx` | J1 | 1,2 | |
| 1:1 table + editor with transcript | `OneOnOneTable.tsx`, `MeetingEditor.tsx` | J1, J5 | 1,2 | |
| Writing pad | `WritingPad.tsx` | J5 | all | |
| AI profile fill from brain-dump | `ProfileFillModal.tsx` | J9 | all | Confidence-scored, propose-don't-commit ✅ |

## Leading up

| Surface | File | Job | Modes | Notes |
|---|---|---|---|---|
| Operating manual (archetype, wins-like, anxieties, currency, comms, their scorecard) | `LeadUpManual.tsx` | J4 | 4 | Most differentiated surface in the app |
| Wins ledger | `WinsLedger.tsx` | J4 | 4 | Evidence for reviews and asks |
| Direction-aware coaching | `ai.ts` | J4, J8 | 4 | |

## Team

| Surface | File | Job | Modes | Notes |
|---|---|---|---|---|
| Team profile — purpose, cadence, last met, members | `TeamProfile.tsx` | J7 | 1,2,3 | |
| Team goals / actions / notes | `TeamProfile.tsx` | J7 | 1,2 | |
| Strengths donut | `StrengthsDonut.tsx` | J7 | 1,2 | |
| Blind-spot detection | `derive.ts` | J7 | 1,2 | Group-level, correctly framed |
| Team AI coach + presets | `AICoach.tsx`, `ai.ts` | J7, J8 | 1,2 | |

## Cross-cutting

| Surface | File | Job | Modes | Notes |
|---|---|---|---|---|
| Overview brief | `Overview.tsx` | J3 | all | Closest thing to a drift view |
| People table | `PeopleTable.tsx` | J3 | all | Scan across everyone |
| Ask AI (org-wide) | `AICoach.tsx` | J8 | all | |
| AI meeting structuring | `ai.ts` | J5 | 1,2 | Transcript → structure |

---

## Gap analysis

### Jobs with weak or no surface

| Job | State | Read |
|---|---|---|
| **J3 — notice who's drifting** | Weak | Drift is the named villain in our story and there is no view that answers "who have I gone quiet on, across everything?" Coverage % is a poor proxy — it measures assessment data, not contact. **Highest-leverage gap.** |
| **J6 — honest attention trade-off** | Weak | The multi-domain tree is the substrate but nothing computes attention per life area over time. Our most emotionally resonant job. |
| **J10 — hold a rhythm** | Weak | `cadence` and `lastMet` are recorded but nothing compares intended cadence to actual. Cheap to add, high payoff. |
| **J1 — walk in prepared** | Desktop-only | The job happens on a phone, in a hallway, three minutes out. No mobile surface exists. |

### Modes with weak support

| Mode | State |
|---|---|
| **3 — Influence (peers)** | Thinnest. No stakeholder/decision-power model; borrows Mode-1 surfaces that assume authority. Every question in that mode's list is unanswerable today. |
| **2 — Leader (no authority)** | Partial. Team-level tools exist, but nothing models volunteer load, motivation, or bench depth — the three things that actually break these teams. |

### Surfaces with no clear job

None currently — the app is unusually free of orphan features. Worth
protecting.

### Principle strain in the current build

| Principle | Observation |
|---|---|
| #1 Recall over record | `PersonProfile.tsx` is 671 lines of mostly *record*. The retrieval side (Overview, prep) is far lighter. The ratio is inverted relative to the principle. |
| #8 Capture at the speed of thought | Brain-dump and transcript paths are good. But capture still requires opening the app on a desktop and navigating to a person. |
| #10 Earn the next field | `Team` has 11 fields, `Person` has 10 plus a 6-field sub-object. Approaching the limit of what a leader will maintain. |
