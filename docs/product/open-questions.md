# Open Questions

Live tensions we haven't resolved. **Read this before proposing anything
significant** — half the good ideas that get proposed are already sitting here
waiting on a decision.

When one is resolved: write a [decision record](../decisions/), then move the
row to Resolved with a link. Never delete.

Status: 🔴 blocking · 🟡 needs a call soon · 🟢 parked deliberately

---

## Product & strategy

| # | Question | Status | Notes |
|---|---|---|---|
| Q1 | **Is this a product or a personal tool?** Everything downstream — pricing, multiplayer, onboarding polish, whether the proof gap matters — hangs on this. | 🔴 | The docs are written as if it's a product. If it's a personal tool, most of `positioning.md` and `metrics.md` are theater. |
| Q2 | **Which persona do we optimize for — P1 Portfolio Leader or P2 Volunteer-Org Leader?** | 🟡 | P1 has money, P2 has acute pain and clusters socially. Current build leans P1; the origin story leans P2. |
| Q3 | **Is leading up the wedge, or leading down?** | 🟡 | `positioning.md` argues leading up: most differentiated, zero buy-in needed. Not agreed. |
| Q4 | **Does sharing ever exist?** | 🟢 | Parked. Principle #5 says no by default. If it ever happens it must be per-item and leader-initiated. Needs a decision record before any work. |
| Q5 | **Pricing and willingness to pay** | 🟢 | Blocked on Q1. Note P2 has near-zero budget. |

## Model & structure

| # | Question | Status | Notes |
|---|---|---|---|
| Q6 | **A person can only be on one team.** Real people appear in multiple contexts — a peer at work who's also on your church team. | 🟡 | Structural. Every derived metric assumes one team per person. Cost grows the longer we wait. |
| Q7 | **Direction lives on `Team`, not on the relationship.** | 🟡 | Same root cause as Q6. Fine today; wrong in principle. |
| Q8 | **`Domain` collides with `StrengthDomain`.** Rename life-area `Domain` → `LifeArea`? | 🟡 | Confuses code, docs, and AI prompts. Cheap now, expensive later. See [`lexicon.md`](lexicon.md). |
| Q9 | **`Action` vs. "Topic".** The UI says topic; the type says action. | 🟡 | Pick one. Recommend Topic. |
| Q10 | **`Capacity` "Manager" vs. the `Manager` entity** mean opposite directions. | 🟡 | Rename candidate: "Direct authority". |
| Q11 | **Should there be a leadership-readiness score?** The code comments anticipate one. | 🟢 | Only if it scores *the leader's coverage*, never the person. Principle #9. |

## AI

| # | Question | Status | Notes |
|---|---|---|---|
| Q12 | **No refusal behavior for hostile use.** Nothing stops "help me build a case to fire X". | 🟡 | Should decline and redirect to a fair conversation. See [`ai-doctrine.md`](ai-doctrine.md). |
| Q13 | **Mode 3 (peer influence) gets Mode-1 framing.** | 🟡 | The mode where authority-flavored advice is most damaging. |
| Q14 | **Stale context is weighted equally.** A note from 2024 sits alongside last week's. | 🟢 | Recency weighting or explicit dating in prompts. |
| Q15 | **How do we verify the dignity constraint holds?** It's authoring-time discipline only. | 🟡 | Candidate: an eval set of prompts scored against the read-aloud test. |

## Measurement & trust

| # | Question | Status | Notes |
|---|---|---|---|
| Q16 | **Can we instrument at all without breaking the privacy promise?** | 🟡 | Blocks all of [`metrics.md`](metrics.md). Event names and counts only, never content. Needs a decision record before any SDK. |
| Q17 | **What's the data-export / ownership story?** The StoryBrand agreement plan promises "your data is yours"; nothing implements it. | 🟡 | We are currently making a promise we don't keep. |
| Q18 | **Nudges vs. guilt.** Rhythm reminders are the obvious feature and the fastest way to make a leadership tool feel like an accusation. | 🟢 | Voice rule: no guilt in empty states. Same applies to nudges. |

## Validation

| # | Question | Status | Notes |
|---|---|---|---|
| Q19 | **Every foundation doc is DRAFT.** Personas, jobs, and StoryBrand are reconstructed from the code, not from leaders. | 🔴 | Six interviews would confirm or rewrite the whole folder. Highest-value open item in this file. |
| Q20 | **Are the competitive claims in `positioning.md` true?** | 🟡 | Written from category knowledge, not hands-on evaluation. Don't use externally until checked. |

---

## Resolved

*(none yet — first entries go here with links to their decision records)*
