# Research

Raw evidence. **Observations, not conclusions.** Conclusions belong in
`product/` and should cite files here.

## What goes in

- Interview notes — one file per conversation:
  `YYYY-MM-DD-<initials>.md`, from
  [`../templates/persona-interview.md`](../templates/persona-interview.md)
- Verbatim quotes worth reusing as copy
- Observations of real usage (yours counts, and is honest evidence)
- Competitive teardowns — one file per product, hands-on only

## What does not go in

- Opinions dressed as findings
- Anything you'd be uncomfortable with the interviewee reading. Use initials,
  strip identifying details from workplace stories.

## Standing question

**Every foundation doc in `product/` is marked DRAFT** because it was
reconstructed from the codebase rather than from leaders. This is the single
highest-value gap in the whole documentation set (Q19 in
[`../product/open-questions.md`](../product/open-questions.md)).

Six interviews would either confirm the persona and mode work or rewrite it —
and that is worth more than any feature currently on the roadmap.

**Targets for the first round** — weighted toward P1 since
[ADR 0003](../decisions/0003-optimize-for-the-portfolio-leader.md) chose it,
with one pure-P2 leader kept in deliberately as the disconfirming case:

| # | Who | Why |
|---|---|---|
| 1–3 | P1 Portfolio Leaders — day job + something outside it | The persona we optimize for, entirely unvalidated |
| 4 | A pure P2 — full-time ministry/nonprofit staff, single context | The disconfirming case. Strong pull here is a condition for reopening ADR 0003 |
| 5 | Someone who leads mainly by peer influence (Mode 3) | The mode we serve worst and understand least — and the next thing on the roadmap |
| 6 | Someone who has been surprised by a resignation | Direct test of the drift villain |

**What would falsify our current thinking:**

- Leaders don't experience their contexts as one portfolio — they genuinely
  compartmentalize and don't want them on one canvas → kills principle #4, most
  of the positioning, **and the reasoning behind ADR 0003**
- Nobody thinks about their boss in "currency" terms → weakens the leading-up
  wedge (Q3)
- Assessment results aren't sitting unused; leaders either don't have them or
  already use them fine → weakens J2
- Writing things down about people feels invasive enough to block adoption →
  the anxiety force wins, and the product needs a different framing entirely

Log each interview here even if it's short. Negative results are results.
