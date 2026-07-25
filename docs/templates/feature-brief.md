# Feature Brief — [name]

> Copy this file. If you can't fill sections 1–4 without hand-waving, the idea
> isn't ready — that's the point of the form, not an obstacle to route around.
>
> Read first: [`personas.md`](../product/personas.md) ·
> [`leadership-modes.md`](../product/leadership-modes.md) ·
> [`principles.md`](../product/principles.md) ·
> [`open-questions.md`](../product/open-questions.md)

**Status:** proposed / accepted / building / shipped / dropped
**Date:**
**Author:**

---

## 1. The anchor

*Fill these from the docs. Links, not paraphrase.*

| | |
|---|---|
| **Persona** | P1 / P2 / other — and why them specifically |
| **Leadership mode(s)** | 1 Manager · 2 Leader · 3 Influence · 4 Report up |
| **Job to be done** | J# — or a new job statement, which then gets added to `jobs-to-be-done.md` |
| **Principle it serves** | # and how |
| **Principle it strains** | # and how — **every real feature strains something.** If you can't name one, look harder |
| **Related open question** | Q# if it touches one, or "none" |

## 2. The moment

*One paragraph. A specific person, at a specific moment, with a specific
problem. No abstractions, no "users want."*

> On Wednesday at 8:55am, Phil is walking to a 1:1 with…

## 3. What they do today instead

*The competitive alternative at this moment — usually memory or the notes app.
Why is that worse? If it isn't clearly worse, stop here.*

## 4. What changes

*What the leader can do after this ships that they cannot do now. One or two
sentences. Not a feature list — a capability.*

---

## 5. The shape

*Roughly what it is. Sketch, flow, or bullets. Enough to argue with, not a
spec.*

## 6. What we're NOT building

*The version of this that's twice as big. Naming it kills scope creep before it
starts.*

## 7. Data model impact

- New fields/types?
- If it adds a field: **what question does that field let us answer?**
  (principle #10)
- Lexicon changes? → update [`lexicon.md`](../product/lexicon.md) in the same PR
- Migration needed?

## 8. AI impact

*Skip if none.*

- New prompt surface? → register it in
  [`ai-doctrine.md`](../product/ai-doctrine.md)
- Which modes must it branch on?
- Does the output pass the read-aloud test? (principle #6)
- Does it propose, or does it commit? (default: propose)

## 9. Dignity check

> Would the leader be comfortable with the person this concerns seeing this
> feature described in plain language?

*If it's creepy when described to P4, it's creepy. Answer honestly.*

---

## 10. The bet

**We believe** [X] **and if we're right** [Y will be observable].

**We're wrong if:** *(the falsifier — a specific, observable outcome, not "it
doesn't work")*

**How we'd know:** *(signal from [`metrics.md`](../product/metrics.md), or a
new one)*

## 11. Cost & sequencing

- Rough effort:
- Blocks / is blocked by:
- Why now rather than later:

---

## Rejection reasons (check before proposing)

An idea usually dies for one of these. Check yourself first:

- [ ] Serves no job in `jobs-to-be-done.md` and doesn't warrant a new one
- [ ] Only serves Mode 1 in a product whose thesis is four modes
- [ ] Adds capture burden without retrieval payoff (principle #1)
- [ ] Advice it produces could have come from a book (principle #2)
- [ ] Would be creepy if the person it concerns saw it (principle #6)
- [ ] Requires sharing to be valuable (principle #5)
- [ ] Adds a field with no question attached (principle #10)
- [ ] Already sitting in `open-questions.md` awaiting a prior decision
