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
| Q1 | ~~Is this a product or a personal tool?~~ | ✅ | **Both.** Dogfood-first productization — see [ADR 0002](../decisions/0002-dogfood-first-productization.md). Opened Q21–Q38. |
| Q2 | **Which persona do we optimize for — P1 Portfolio Leader or P2 Volunteer-Org Leader?** | 🔴 | Escalated by Q1. P1 has money, P2 has acute pain and clusters socially. Current build leans P1; the origin story leans P2. Now a commercial decision with real cost. |
| Q3 | **Is leading up the wedge, or leading down?** | 🟡 | `positioning.md` argues leading up: most differentiated, zero buy-in needed. Not agreed. |
| Q4 | **Does sharing ever exist?** | 🟢 | Parked. Principle #5 says no by default. If it ever happens it must be per-item and leader-initiated. Needs a decision record before any work. |
| Q5 | **Pricing and willingness to pay** | 🟡 | Unblocked by Q1, now blocked on Q30 (business shape) and Q31 (unit economics). Note P2 has near-zero budget. |

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

# Productization

Opened by [ADR 0002](../decisions/0002-dogfood-first-productization.md). These
did not exist while LeadWell was a personal tool. Several are genuinely
foundational — Q25 in particular could reshape the product.

## Consent & liability — *the sharpest new area*

LeadWell stores detailed personal information about people who have no account,
never consented, and will never see it. As a personal tool this is very likely
covered by the personal/household exemption in most privacy law. **Sold as a
product — especially one used at work — that exemption goes away.**

> **Deferred as a group (2026-07-25, Phil).** While LeadWell is a personal tool
> — one leader documenting the people they lead, in order to lead them better —
> this sits comfortably inside the personal/household use exemption, and the
> dignity principle (#6) already does the substantive work. Revisit rather than
> resolve now.
>
> **Tripwire — the deferral ends the moment a second person's workspace lands on
> our servers.** That is the event that converts this from a personal-use
> question into a controller-with-obligations question, and it happens on the
> *first external signup*, not at some later scale. Whoever ships that signup
> should reopen Q25–Q27 first. This is recorded so the deferral is a decision
> with an end condition, not a thing we forgot.

| # | Question | Status | Notes |
|---|---|---|---|
| Q25 | **What rights do the people in the workspace have?** Under GDPR/UK GDPR they'd be data subjects with rights of access and erasure, and they don't know the data exists. | ⏸️ | Deferred — see above. Personal-use exemption plausibly covers today's single-player tool. The honest answer may constrain the product's shape, not just its paperwork, so it needs real legal advice before external users, not a template privacy policy. |
| Q26 | **Who is the controller — us or the user?** Determines whether we're a processor with a DPA or a controller with direct obligations. | ⏸️ | Deferred. Moot while Phil is the only user; decisive the day he isn't. |
| Q27 | **Are these notes discoverable?** In an employment dispute, a leader's private notes about a report can be subpoenaed. | ⏸️ | Deferred as a product question, but note it's *already* true of the personal instance. Principle #6 (the read-aloud test) is the correct mitigation and is another argument for enforcing it harder rather than softening it. |
| Q28 | **Does the employer have a claim** to notes a leader keeps about their reports on personal software? | ⏸️ | Deferred. Affects the "your data is yours" promise in the StoryBrand agreement plan. |
| Q29 | **Hosting jurisdiction and data residency** | 🟢 | Supabase region choice. Cheap now, expensive after users exist. |

## Business shape

| # | Question | Status | Notes |
|---|---|---|---|
| Q30 | **Indie/lifestyle or venture-scale?** | 🔴 | Determines pricing, scope, support burden, whether the volunteer-leader segment (near-zero budget) is viable, and how much the proof gap matters. Blocks Q5. |
| Q31 | ~~Unit economics — what does an active user cost in AI?~~ | ✅ | **We swallow the cost (Phil, 2026-07-25).** Modeled below: roughly **$1–3 per heavy active leader per month** on `claude-sonnet-5`. Inconsequential against any plausible paid price. See the model and its two tripwires below. |
| Q32 | **Free tier shape**, given P2 has almost no budget and is the segment that clusters socially | 🟡 | Blocked on Q30 — and this is where Q31's cost actually bites, since a free tier means paying $1–3/month per user with no offsetting revenue. |
| Q33 | **Does the personal instance stay ahead of the product, or converge?** One codebase with flags, or a fork? | 🟡 | Converge is the right default; recording it because forks happen by accident. |

### The AI cost model (Q31, resolved)

`claude-sonnet-5` at **$3.00 / $15.00 per million input/output tokens**
(introductory $2.00 / $10.00 through 2026-08-31 — costs rise ~50% when that
ends, which is still immaterial at this scale).

Per-interaction estimates, using the prompt shapes actually built in
[`src/lib/ai.ts`](../../src/lib/ai.ts):

| Interaction | Rough cost |
|---|---|
| Coach conversation (~5 turns, full person context) | ~$0.09 |
| Meeting-note structuring (transcript in, structure out) | ~$0.02 |
| Brain-dump profile fill | ~$0.02 |
| Overview brief | ~$0.03 |

A heavy month — 20 coach conversations, 20 briefs, 10 meetings structured,
5 brain-dumps — lands around **$2.75**. Gross margin at a $10–15/mo price is
roughly 80%, which is unremarkable-to-good for a software business. **Costs are
not a constraint on this product.**

**Two tripwires that would reopen this:**

1. **A free tier** (Q32). $1–3/month per user is trivial against revenue and
   material against zero. This is the real cost question, and it's the one that
   makes the P2 volunteer-leader segment expensive to serve.
2. **Pricing below ~$5/mo**, at which point AI COGS stops being a rounding
   error and starts being a line item worth managing.

Note the shape of the cost: it scales with *engaged* users, since the coach is
both the main value and the main expense. That's the healthy direction — but it
means a free tier's cost concentrates in exactly the users who like the product
most.

## Go-to-market

| # | Question | Status | Notes |
|---|---|---|---|
| Q34 | **Where do the first 10 non-Phil users come from?** | 🟡 | Church/ministry leader network is the obvious cluster and matches P2. Also the fastest route to Q19's interviews. |
| Q35 | **What's the transitional CTA?** [`storybrand.md`](storybrand.md) flags this as missing. Candidates: "The Leading-Up Manual", "The Drift Audit". | 🟡 | Both are useful standalone and teach our worldview. Cheap. |
| Q36 | **Build in public?** It's the strongest available fix for the empty authority slot in the StoryBrand guide role. | 🟡 | Real tension: building a privacy-first product in public is coherent, but only if the demos never use real people. Needs a rule. |
| Q37 | **Name, domain, trademark** — is "LeadWell" clear? | 🟡 | Check before any public use. Cheap now; a rename after launch is not. |

## Product readiness

| # | Question | Status | Notes |
|---|---|---|---|
| Q38 | **First-run for a stranger is undefined.** `seed.ts` seeds every new account with Phil's actual org — `seedMe` is "Phil Chan", teams are Frontier Staff, Men's Core Team, Setup & Breakdown. | 🔴 | Correct for a personal tool, unshippable for a product. Concrete blocker, cheap to fix, and it forces the real question: what does an empty workspace do to reach activation (see [`metrics.md`](metrics.md)) in one session? |
| Q39 | **What's the minimum to let a stranger use this without embarrassment?** Error states, empty states, billing, ToS, support channel, a way to recover from mistakes. | 🟡 | Write the list before productizing, not during. |
| Q40 | **What's the n=1 test in practice?** ADR 0002 defines it; it hasn't been used yet. | 🟡 | Apply it to the current roadmap as the first exercise — some items may fail it. |

---

## Resolved

| # | Question | Decision |
|---|---|---|
| Q1 | Product or personal tool? | **Both — dogfood-first productization.** [ADR 0002](../decisions/0002-dogfood-first-productization.md) |
| Q31 | What does an active user cost in AI? | **~$1–3/month per heavy leader. We swallow it.** Model and tripwires above. |
