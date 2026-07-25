# 0002 — Build as a personal tool, productize from real use

**Date:** 2026-07-25 · **Status:** accepted
**Deciders:** Phil
**Resolves:** Q1 in [`open-questions.md`](../product/open-questions.md)

---

## Context

Q1 asked whether LeadWell is a personal tool or a product, because almost every
downstream decision — pricing, onboarding polish, whether the proof gap
matters, how much scope discipline is warranted — depends on the answer.

The answer is **both**: Phil uses it daily to lead real teams at Frontier and at
the day job, and intends to productize it.

This is the most useful answer and the most dangerous one, and the danger is
specific enough to name. Dogfooding is the strongest validation signal a solo
product person can get: real data, real stakes, daily use, instant feedback.
It is also the most reliable way to build a product that fits exactly one
person perfectly and nobody else adequately — because the builder tolerates
friction no stranger will, knows workarounds no stranger will discover, and
mistakes their own edge cases for the market's core.

## Options considered

### A — Personal tool only
- For: no proof gap, no legal surface, no support burden, total scope freedom
- Against: rejected by the stated intent

### B — Product first, personal use incidental
- For: forces onboarding, pricing, and first-run quality early
- Against: builds for an imagined user before the real one is understood. With
  no customers and no research yet, this is speculation with extra steps.

### C — Dogfood-first productization *(chosen)*
- For: the personal instance is the validation engine; every feature is proven
  against real leadership before it's offered to anyone
- Against: n=1. Requires an explicit discipline to avoid overfitting, or the
  advantage becomes the defect.

## Decision

**Phil is user zero, not a proxy for the market.** LeadWell is built and
maintained as a working personal tool. Productization proceeds from that use,
gated by an explicit test that separates a Phil-need from a market-need.

**The n=1 test.** A capability may be built for the personal instance freely.
It graduates to the product only if at least one of these holds:

1. It's a direct expression of a documented job in
   [`jobs-to-be-done.md`](../product/jobs-to-be-done.md), or
2. A leader who is not Phil has described the need unprompted — in an
   interview, unsolicited, in their own words, or
3. It's table stakes for anyone using software at all (auth, export, error
   states).

Anything else is a personal-instance feature and is recorded as such. This is
not a prohibition on building it — it's a prohibition on *counting* it as
product progress.

**Corollary — Phil is the canary.** If the personal instance goes unused for
two weeks without Phil deliberately noticing and caring, that is the loudest
possible signal about the product, and it goes in `docs/research/` as evidence
rather than being explained away.

## Why

Principle #2 (*the specific over the general*) applies to how we build, not
just what we ship. A product built from one leader's real, messy, multi-context
leadership will be more specific — and therefore better — than one built from
a persona document. The docs in `product/` are explicitly marked DRAFT for
exactly this reason.

But specificity to one person is only an asset if it's checked. The n=1 test is
that check, and it's cheap: it costs one sentence in a feature brief.

Second reason: dogfooding is the only credible answer to the authority gap in
[`storybrand.md`](../product/storybrand.md). "Built by someone who leads four
teams and uses this every week" is real authority. It's currently the only
authority we have.

## What we're giving up

- **Speed to market.** Gating on real use is slower than shipping on intuition.
- **Some good ideas, temporarily.** Features that would serve a market we
  haven't met yet get deferred until we've met it.
- **The simplicity of a single answer.** Two audiences means every roadmap item
  now needs a "for me, or for them?" answer, and sometimes the honest answer is
  "me" — which has to be sayable without shame.

## Consequences

**Immediately true:**

- Q2 (which persona) and Q3 (which wedge) stop being academic and become
  commercial decisions with real cost. They move up in priority.
- Q5 (pricing) is unblocked and now needs a business-shape answer first (Q29).
- Q17 (data export) moves from a broken promise to a probable legal obligation.
- A new class of question opens that a personal tool never faces: consent,
  liability, unit economics, support. Recorded as Q25–Q40 under
  "Productization". Q25 (what rights do the people in the workspace have?) is
  the one most likely to change the product itself rather than its paperwork.

**A known blocker surfaced by this decision:** `src/data/seed.ts` seeds every
new account with Phil's actual org structure — `seedMe` is "Phil Chan", and the
starter teams are Frontier Staff, Men's Core Team, and Setup & Breakdown. That's
correct behavior for a personal tool and unshippable for a product. First-run
for a stranger is currently undefined. See Q38.

**Practice changes:**

- Feature briefs gain one line: **"n=1 check: personal, product, or both?"**
- `docs/research/` logs Phil's own usage as evidence — clearly labeled as n=1,
  never counted as validation on its own
- Roadmap items get tagged with which audience they serve

## Revisit if

- Three or more non-Phil leaders are using it regularly. At that point the
  personal instance stops being the primary evidence source and this decision
  should be replaced by one grounded in real users.
- The n=1 test starts blocking things that obviously should ship — that would
  mean the test is miscalibrated, not that the discipline is wrong.
- Productization stalls for two quarters while personal use continues happily.
  That's a legitimate outcome, but it should be *chosen* rather than drifted
  into, with a decision record saying so.
