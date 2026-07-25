# CLAUDE.md — working on LeadWell

## What this project is

LeadWell is a private leadership system of record: an org-chart canvas of every
team and person a leader leads or reports to — across work, church, family, and
community — with assessment-based profiles and an AI coach that has read
everything.

**Read [`docs/product/overview.md`](docs/product/overview.md) before doing
product work.** The full doc map is [`docs/README.md`](docs/README.md).

---

## Read this before you build

Product truth lives in `docs/`. It exists so ideation is anchored instead of
re-derived, and so the app can be audited against intent. Which docs to read
depends on the work:

| If the task is… | Read first |
|---|---|
| **Brainstorming / "what should we build"** | `personas.md`, `leadership-modes.md`, `principles.md`, `open-questions.md` |
| **Designing a specific feature** | `jobs-to-be-done.md`, `principles.md`, `surface-map.md`, then fill `templates/feature-brief.md` |
| **Touching AI prompts** | `ai-doctrine.md` — non-negotiable, plus `leadership-modes.md` |
| **Writing UI copy** | `storybrand.md` (voice), `lexicon.md` (voice rules, section "Voice rules") |
| **Naming anything** | `lexicon.md` |
| **Auditing the app** | `templates/audit.md` |
| **Changing something foundational** | `open-questions.md` first — it may already be a known tension — then write a decision record |

Don't read all of it for a small change. Do read the relevant ones — the whole
point is that the answer is usually already written down.

---

## Rules that keep the docs true

1. **Working-truth docs ship with the code.** A PR that adds or removes a
   user-visible surface updates `docs/product/surface-map.md`. A PR that
   renames or adds a concept updates `docs/product/lexicon.md`. Same commit,
   not a follow-up.
2. **New AI surfaces get registered** in `docs/product/ai-doctrine.md`.
3. **Foundation changes get a decision record** in `docs/decisions/` — personas,
   principles, positioning, privacy posture, model choice.
4. **Don't silently contradict a principle.** If a change strains one, say so
   explicitly and explain the trade. Every real decision strains something;
   pretending otherwise is the failure mode.
5. **Unresolved questions go in `open-questions.md`**, not in a code comment
   nobody will find.
6. **Docs marked DRAFT are hypotheses**, not facts. Say so when reasoning from
   them. Most foundation docs are DRAFT until validated against real leader
   interviews (Q19).

---

## The three hard constraints

These override convenience, cleverness, and my own suggestions. If a request
conflicts with one, say so before building.

**Dignity.** Would the leader be comfortable reading this aloud to the person
it's about? This governs AI output, UI copy, and every field we add. Describe
behavior and what to do about it — never character, never judgment. Nothing in
this product is a dossier.

**Privacy.** Single-player by construction. The people described here have no
accounts and never see it. Candor is the raw material; sharing destroys it. Any
sharing must be explicit, per-item, and leader-initiated — never a default.

**Not a performance record.** No scores on people, no rankings, no
exportable case files. The one metric in the product (coverage) measures the
*leader's* attention, never the person's worth.

Full reasoning: [`docs/product/principles.md`](docs/product/principles.md)
#5, #6, #9.

---

## The four leadership modes

The product's core model, and the thing most often forgotten. A leader operates
in four capacities, and advice that's right in one is damaging in another:

| Mode | Means | Served today |
|---|---|---|
| **1 Manager** | Formal authority | Well |
| **2 Leader** | Leads without authority (volunteers, matrixed) | Partly — no load/motivation/bench model |
| **3 Influence** | Peers, no authority, no responsibility line | Thinnest — borrows Mode-1 surfaces that assume authority |
| **4 Report up** | The people I answer to | Distinctively well — our sharpest differentiator |

Any guidance-producing surface must know which mode it's in.
[`docs/product/leadership-modes.md`](docs/product/leadership-modes.md) has the
questions on the leader's mind in each — the single best input for ideation.

---

## Codebase

React 18 + TypeScript + Vite · Tailwind 4 · Zustand · React Flow · Supabase.

```
src/
  types.ts              # data model — the schema behind docs/product/lexicon.md
  data/frameworks.ts    # all 34 CliftonStrengths themes → Gallup domains, Enneagram, MBTI
  data/seed.ts          # starter workspace for new accounts
  lib/
    ai.ts               # system prompts (person/team/org), streaming, meeting structuring, brain-dump
    derive.ts           # coverage, domain counts, blind spots, derived read
    repo.ts             # Supabase sync layer (debounced writes, hydrate on login)
    supabase.ts, auth.ts
  store/useStore.ts     # Zustand — single source of app state
  components/           # see docs/product/surface-map.md for what each serves
supabase/functions/anthropic  # edge function; holds the Anthropic key server-side
```

Architecture detail: [`readme.md`](readme.md) · Setup: [`SETUP.md`](SETUP.md)

**Conventions**
- No test suite and no linter configured. `npm run build` (`tsc -b && vite build`)
  is the check that must pass.
- Types in `src/types.ts` carry doc comments explaining *product* meaning, not
  just shape. Keep that — it's why the model stays coherent.
- The store is the single source of truth; components don't touch Supabase
  directly, only `repo.ts` does.
- AI prompt builders assemble from store state and branch on capacity and
  direction. Preserve that branching.
- Tailwind utility classes inline; dark mode via the `dark` class on `<html>`.

**Model:** the AI uses `claude-sonnet-5` via the edge function. Changing it is
a decision record.

---

## Working style here

- **When ideating, start from the docs and say which one you're drawing on.**
  "Per Mode 3's question list, we can't answer X" is useful. Generic product
  brainstorming is not — it's what the docs exist to replace.
- **Push back with a doc reference.** If an idea strains a principle or
  duplicates an open question, say so plainly and propose the version that
  doesn't. That's the job.
- **Prefer one question answered over one field collected** (principle #10).
- **Flag when you're reasoning from a DRAFT.** Most of the foundation is
  unvalidated. Confident-sounding advice built on an unvalidated persona is the
  main way this doc set could make things worse rather than better.
