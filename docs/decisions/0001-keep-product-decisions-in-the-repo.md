# 0001 — Keep product truth in the repository

**Date:** 2026-07-25 · **Status:** accepted
**Deciders:** Phil
**Resolves:** none (establishes the practice)

---

## Context

LeadWell was built quickly and the product thinking behind it lives in one
person's head plus a codebase. That's workable while the head and the codebase
are in the same room, but it fails in three specific ways:

1. **Ideation restarts from zero.** Every brainstorm re-derives who the user is
   and what we believe, slightly differently each time, and quietly contradicts
   earlier decisions.
2. **AI collaboration is uneven.** Claude, working in this repo, can read the
   code but not the intent. It infers a plausible product from the
   implementation — which means it optimizes for what exists rather than what's
   supposed to exist.
3. **The app can't be audited.** With no written intent, "has this drifted?" is
   unanswerable. There's nothing to compare against.

## Options considered

### A — Notion / external doc tool
- For: better editing, comments, easy sharing, non-technical access
- Against: separate from the code, so it drifts the moment code changes; not
  in the AI's working context; no version history tied to the commits that
  changed the product; requires a second place to look

### B — Markdown in the repo
- For: versioned with the code; reviewable in the same PR that changes
  behavior; readable by both humans and Claude at working time; diffable, so
  changes to product truth are visible as changes
- Against: worse writing experience; no comments; invisible to non-technical
  collaborators

### C — Both, with Notion as the source of truth and a repo mirror
- For: best of each in theory
- Against: two sources of truth is zero sources of truth. Guaranteed
  divergence.

## Decision

**Product truth lives in `docs/` as markdown in this repository**, structured
in three tiers (foundation / working truth / flow), with a root `CLAUDE.md`
that points Claude at it and defines when to read and update it.

## Why

Decisive factor: **the docs need to be in the AI's working context.** The
stated goal is that ideation is anchored to truth and that the app can be
audited against intent. Both require the docs to be present at the moment work
happens. A Notion page nobody opens during a session provides neither.

Second factor: **working-truth docs must be able to change in the same PR as
the code.** Any tool that makes that a separate step guarantees drift, and
drift in the docs is worse than no docs — it produces confident wrong answers.

Principle-adjacent: this is the same logic as principle #1 (*recall over
record*) applied to ourselves. A perfect doc nobody reads at the moment of need
is worth less than a rough one that's open.

## What we're giving up

- A pleasant writing and commenting experience
- Easy access for non-technical collaborators — anyone who joins to do product
  work will need to touch the repo
- Rich embeds, diagrams, and threaded discussion

Accepted because there's currently one product person and they're already in
the repo daily. **Revisit if that changes.**

## Consequences

- `docs/README.md` defines the tiering and the update rules
- Root `CLAUDE.md` instructs Claude on which docs to read for which kind of
  work, and which to update alongside code
- PRs that change a concept name or add a surface must update `lexicon.md` /
  `surface-map.md` in the same commit
- Foundation changes require a decision record in this folder
- Every current foundation doc is marked DRAFT until validated against real
  leader interviews (see Q19)

## Revisit if

- A non-technical product collaborator joins and the repo becomes a real
  barrier
- The docs go three months without an update while the code keeps moving —
  that would mean the practice failed and the cause needs diagnosing, not just
  a tool change
