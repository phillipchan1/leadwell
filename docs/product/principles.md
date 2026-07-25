# Product Principles

Principles are only useful if they **cut** — if they tell you which good thing
to give up. A principle both sides of an argument can claim is decoration.

Each of these is stated as a trade: *we choose X over Y*, where Y is genuinely
desirable.

---

## 1. Recall over record

**We choose making knowledge retrievable at the moment of need over capturing
knowledge completely.**

A perfect profile nobody reads before a 1:1 is worth less than three
sentences surfaced at 8:55am. When a feature adds capture burden, it must show
its retrieval payoff in the same breath.

*Cuts against:* comprehensive forms, more fields, richer taxonomies.

---

## 2. The specific over the general

**We choose an answer about this person over advice about people.**

Anything the user could have gotten from a book or a generic chatbot is a
failure of this product. Every AI response should be impossible to give without
their data.

*Cuts against:* templates, best-practice libraries, generic content.

---

## 3. Capacity-aware, always

**We choose modeling four distinct leadership modes over one clean universal
model.**

Advice for a direct report given to a peer is worse than no advice. Every
surface that gives guidance must know which mode it's in. See
[`leadership-modes.md`](leadership-modes.md).

*Cuts against:* simplicity, a unified UI, fewer concepts to learn.

---

## 4. The whole portfolio, one canvas

**We choose showing work, church, and family together over a clean
work-only product.**

The trade-off between contexts is invisible unless they're side by side, and
that trade-off is where the leader's integrity actually gets decided. This is
also our defensible position — work-only tools cannot follow us here.

*Cuts against:* enterprise sales, tidy scope, "just do work first."

---

## 5. Private by construction

**We choose single-player privacy over collaboration value.**

Candor is the raw material of this entire product. A leader will not write
"they get defensive when challenged in front of peers" into anything that
could be read by anyone else. The moment sharing exists, candor drops, and
everything downstream degrades. Any future sharing must be an explicit,
per-item, leader-initiated act — never a default, never a workspace setting.

*Cuts against:* team plans, virality, org-wide adoption, higher ACV.

---

## 6. Dignity over insight

**We choose language a person could hear about themselves over the sharpest
possible analysis.**

The standard: would the leader be comfortable reading this aloud to the person
it describes? Not because they will — because that line is the difference
between knowing someone and building a dossier. This binds the AI's output as
hard as it binds the UI copy.

*Cuts against:* blunt diagnostic power, clinical framing, "brutal honesty."

---

## 7. Grounded in the leader's own frameworks

**We choose CliftonStrengths, Enneagram, and MBTI over a proprietary model.**

Leaders already trust and have results from these. Borrowed authority beats
invented authority, and the switching cost of learning a new personality theory
is a real barrier. We are the *application* layer.

*Cuts against:* IP ownership, differentiation-by-model, a proprietary moat.

---

## 8. Capture at the speed of thought

**We choose accepting messy input over collecting clean data.**

Structure is our job, not the user's. A leader should be able to talk or paste
for thirty seconds and let the system sort it out. If the fastest path to
recording something is their phone's notes app, we have already lost. This is
what the brain-dump and transcript-structuring paths exist to protect.

*Cuts against:* data quality, validation, predictable schemas.

---

## 9. Nothing here is a performance record

**We choose being a leadership aid over being a system of evaluation.**

No ratings, no rankings, no scores on people, no exportable "case file." The
one number in the product (assessment coverage) measures *the leader's*
attention, not the person's worth. Any future rollup score must score the
leader's coverage, never the individual.

*Cuts against:* obvious enterprise features, quantified dashboards.

---

## 10. Earn the next field

**We choose one more question answered over one more field collected.**

Every field added is a tax on every future user, forever. New fields must be
justified by a specific question they let us answer — write that question in
the feature brief.

*Cuts against:* completeness, flexibility, "someone might want it."

---

## Tie-breaking order

When principles conflict, resolve in this order:

1. **Dignity (6)** and **Privacy (5)** — never traded away. These are the
   product's ethics, not its preferences.
2. **Recall (1)** and **Speed of capture (8)** — the usage loop. Break it and
   nothing else matters, because the data goes stale.
3. **Specific (2)** and **Capacity-aware (3)** — the quality of the output.
4. **Portfolio (4)** and **Borrowed frameworks (7)** — the strategic position.
5. **Earn the field (10)** — the discipline that keeps the rest possible.

---

## Using these

In a feature brief, name the principle the feature serves **and** the principle
it strains. Every real decision strains something. A brief that claims no
trade-off hasn't found the trade-off yet.
