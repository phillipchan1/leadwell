# LeadWell Docs

This is the product's memory. It exists so that every ideation session, every
feature, and every AI prompt is anchored to the same truth — instead of being
re-invented from scratch (and slightly differently) each time.

## The three tiers

Docs rot when everything is treated as equally permanent. These are split by
how fast they're allowed to change:

| Tier | What it is | Change rate | If it's wrong |
|---|---|---|---|
| **Foundation** | Who we serve, what we believe, what we're selling | Quarterly at most. Changing one is a real decision. | Everything downstream is wrong |
| **Working truth** | The current shape of the product and its language | Changes with the product. Update in the same PR as the code. | Ideation drifts, AI prompts lie |
| **Flow** | Append-only records: decisions, research, audits | Constantly. Never edited, only added to. | We repeat old arguments |

### Foundation

| Doc | Answers |
|---|---|
| [`product/overview.md`](product/overview.md) | What is LeadWell, for whom, and what is it deliberately *not*? |
| [`product/storybrand.md`](product/storybrand.md) | The SB7 brandscript — how we talk about it in the customer's words |
| [`product/personas.md`](product/personas.md) | Who the leader is, what they fear, what a day looks like |
| [`product/leadership-modes.md`](product/leadership-modes.md) | The four capacities and the *questions on their mind* in each |
| [`product/jobs-to-be-done.md`](product/jobs-to-be-done.md) | What they hire LeadWell to do, and what they fire |
| [`product/principles.md`](product/principles.md) | The tie-breakers — how we decide when two good options conflict |
| [`product/positioning.md`](product/positioning.md) | What we're an alternative *to*, and why we win |

### Working truth

| Doc | Answers |
|---|---|
| [`product/lexicon.md`](product/lexicon.md) | The exact meaning of every noun — in the UI, the code, and the AI prompts |
| [`product/surface-map.md`](product/surface-map.md) | Every feature that exists today, and which job it serves |
| [`product/ai-doctrine.md`](product/ai-doctrine.md) | What the AI is allowed to be, and what it must never do |
| [`product/metrics.md`](product/metrics.md) | The one number that matters, plus the counter-metrics |
| [`product/roadmap.md`](product/roadmap.md) | Now / Next / Later, each stated as a falsifiable bet |
| [`product/open-questions.md`](product/open-questions.md) | Live tensions we haven't resolved. Read before proposing anything big. |

### Flow

| Folder | What goes in |
|---|---|
| [`decisions/`](decisions/) | One file per decision that closed an argument. Never delete. |
| [`research/`](research/) | Raw interview notes, quotes, observations. Evidence, not conclusions. |
| [`audits/`](audits/) | Point-in-time reviews of the app against these docs |
| [`templates/`](templates/) | The forms that keep the above consistent |

## How to actually use this

**Starting a brainstorm?** Read `personas.md` + `leadership-modes.md` +
`principles.md` first. Ten minutes of reading kills the 80% of ideas that were
never going to survive contact with the persona.

**Got an idea worth pursuing?** Fill out
[`templates/feature-brief.md`](templates/feature-brief.md). If you can't name
the persona, the job, and the principle it serves, the idea isn't ready —
that's the point of the form, not a bureaucratic hurdle.

**Wondering if the app has drifted?** Run
[`templates/audit.md`](templates/audit.md) and drop the result in `audits/`.

**Made a call you'll be asked about in three months?** Write a
[`decision record`](templates/decision-record.md).

## Rules that keep this from rotting

1. **One fact, one home.** If something is true, it lives in exactly one doc
   and everything else links to it. Duplicated truth becomes contradictory
   truth.
2. **Drafts are labeled.** Anything not yet confirmed with a real leader is
   marked `> **Status:** DRAFT — needs validation`. Unlabeled = we stand behind it.
3. **Working-truth docs ship with the code.** A PR that changes a concept name
   or adds a surface updates `lexicon.md` / `surface-map.md` in the same commit.
4. **Foundation changes get a decision record.** If personas or principles
   change, we write down why.
5. **No aspirational tense.** These docs describe what is true and what we've
   decided, not what would be nice.
