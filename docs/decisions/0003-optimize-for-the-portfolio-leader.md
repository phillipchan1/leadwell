# 0003 — Optimize for the Portfolio Leader (P1)

**Date:** 2026-07-25 · **Status:** accepted
**Deciders:** Phil
**Resolves:** Q2 in [`open-questions.md`](../product/open-questions.md)

---

## Context

[ADR 0002](0002-dogfood-first-productization.md) established that LeadWell is
both a personal tool and an intended product. That turned Q2 from an academic
question into one with real cost: the two candidate personas pull the roadmap,
the pricing, and the go-to-market in different directions, and there aren't
resources to serve both first.

**P1, the Portfolio Leader** — mid-to-senior at a day job *and* leading
something outside it, 15–60 people across 2–4 contexts, all four leadership
modes in play, pays for their own tools.

**P2, the Volunteer-Org Leader** — church or nonprofit leader, almost entirely
Modes 2 and 4, whose central problem is load concentration rather than span,
with near-zero budget but strong social clustering.

Both descriptions fit Phil, which is precisely why the question was easy to
leave open. Under the n=1 test from ADR 0002, "it fits me" is exactly the
signal that needs a deliberate check rather than an assumption.

## Options considered

### A — P1 Portfolio Leader *(chosen)*
- For: the product already *is* this — the multi-domain canvas, life-area
  tagging, and four-capacity model only pay off for someone carrying more than
  one context. Can pay, so AI COGS (Q31: ~$1–3/user/month) stays immaterial and
  the business question stays simple.
- Against: less acute pain than P2 in any single context; weaker word-of-mouth
  clustering; the segment is defined behaviorally, which makes it harder to
  target than "church leaders."

### B — P2 Volunteer-Org Leader
- For: most acute, least-served pain; clusters socially, so adoption
  compounds; matches the origin story and gives real authority.
- Against: requires building a mode we barely model (volunteer load, motivation,
  bench depth) before delivering value; near-zero budget makes a free tier
  mandatory, which is where Q31's per-user cost stops being a rounding error;
  and the multi-context canvas — our defensible position — loses much of its
  point for a single-context leader.

### C — Defer until after the Q19 interviews
- For: most disciplined. Every persona doc is DRAFT and reconstructed from the
  codebase rather than from leaders.
- Against: stalls roadmap direction on research that hasn't been scheduled. The
  cost of choosing wrong here is low and recoverable; the cost of no direction
  compounds.

## Decision

**P1, the Portfolio Leader, is the persona we optimize for.** P2 remains a
documented secondary persona whose needs inform the model, but does not set the
roadmap.

## Why

**The product is already built for P1.** The org-chart canvas spanning work,
church, and family, the life-area filter, and the four-capacity model are all
expressions of carrying multiple contexts. Choosing P2 would mean either
abandoning that thesis or maintaining it for a persona who doesn't need it.

**P1 can pay, and that keeps three other questions simple.** At a plausible
$10–15/month, the AI cost resolved in Q31 stays an ~80%-margin rounding error,
no free tier is forced, and pricing (Q5) has a real anchor. Choosing P2 would
have made the free tier mandatory and pulled cost back into the foreground.

**The network reaches P1 anyway.** The strongest argument for P2 was social
clustering through the church network — but most lay leaders in that network
*also have day jobs*, which makes them P1 by our own segmentation (context
count ≥ 2). Pure P2 — full-time ministry staff, single context, no budget — is
the narrower and poorer slice. We get the clustering benefit without taking on
the segment's economics.

**It preserves principle #4** (whole portfolio, one canvas), which is our most
defensible position: work-owned tools structurally cannot follow us across a
leader's church and family contexts.

## What we're giving up

- **The most acute pain.** P2 feels their problem more sharply than P1 does,
  and pain is what drives adoption. We're trading intensity for breadth and
  ability to pay.
- **The fastest word-of-mouth.** P2's clustering is a real growth mechanic and
  we're only partially capturing it.
- **The strongest authority story.** "Built by a ministry leader for ministry
  leaders" is a sharper claim than the one we're keeping.
- **Volunteer load, motivation, and bench** move off the near-term roadmap.
  They stay documented as a real Mode-2 gap — this is a deprioritization, not a
  judgment that the need isn't real.

## Consequences

- **Roadmap:** the Now tier (Drift view, cadence honesty, mobile prep brief) is
  confirmed — all three serve P1 directly. Roadmap item 5, *Volunteer load &
  bench*, moves from Next to Later.
- **Q3 (which wedge) gets easier and leans further toward leading up.** P1 has a
  boss at the day job by definition, so Mode 4 is universal in this persona —
  which strengthens the argument in [`positioning.md`](../product/positioning.md)
  that leading up is the wedge.
- **Q32 (free tier) drops in urgency.** It was mandatory under P2 and is now a
  choice.
- **Q5 (pricing) is unblocked** once Q30 (business shape) is answered.
- **Interview targets shift** (Q19): weight the first round toward
  leaders carrying two or more contexts. Still interview a pure-P2 leader — a
  strong disconfirming signal there is exactly what should reopen this.
- `personas.md` and `roadmap.md` updated in the same commit.

## Revisit if

- Interviews show P1s don't actually experience their contexts as one portfolio
  — that they compartmentalize deliberately and don't want them on one canvas.
  That would falsify principle #4 and most of the positioning, and would make
  P2's narrower framing the better bet.
- P2 adoption happens anyway, unprompted, through the network. Organic pull
  from a segment we didn't optimize for is the strongest possible signal.
- The volunteer-load problem turns out to be the thing people will actually pay
  to solve.
