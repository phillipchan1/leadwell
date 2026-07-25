# Product Overview

> **Status:** DRAFT — reconstructed from the product as built. Phil to correct.

## One sentence

LeadWell is the system of record for the people you lead — across every part of
your life — so you can lead each of them like you actually know them.

## The problem

Most leadership tooling assumes you lead one team, inside one org, with formal
authority, and that HR owns the system. That describes almost nobody's real
life.

The real shape is this: a person leads a staff team at work, a volunteer
ministry at church, a peer squad where they have no authority at all, and they
*also* report up to two or three different people in different contexts. Same
brain, four modes, no shared system.

What breaks:

- **People fall through.** Not the loud ones — the quiet, competent ones you
  haven't had a real conversation with in five weeks and haven't noticed.
- **Knowledge is re-derived every time.** You learned how someone takes
  feedback eighteen months ago. That knowledge lives in your head, decays, and
  is unavailable when you need it at 8:55am before a 9:00 1:1.
- **Assessments die in a drawer.** People take CliftonStrengths, Enneagram,
  MBTI. The results are filed and never converted into a decision about how to
  actually talk to that person on a hard day.
- **Leading up is unmanaged.** Everyone has a manager. Almost nobody keeps a
  deliberate model of what that manager rewards, fears, and is measured on —
  or a record of the value they've delivered to them.
- **Context switching costs the most.** Moving from "Manager at work" to
  "influence-only peer" to "volunteer leader at church" requires a different
  posture, and nothing helps you make that switch.

## What LeadWell is

A private, single-player workspace with three moving parts:

1. **A map** — an infinite-canvas org tree of every team and person you lead or
   report to, tagged by life domain (Day job, Church, Family, Community) and by
   the *capacity* you hold with them.
2. **A profile** — per person: assessment results, derived strengths and
   watch-outs, how to lead them, goals, 1:1 history, open topics, notes. For
   people you report to, an *operating manual* instead: what they reward, what
   makes them anxious, their currency, their scorecard.
3. **A coach** — an AI that has read all of the above and answers in the
   specific. Not "how do I give feedback" but "how do I give *this* feedback to
   *this* person, who is a 1w2 with Deliberative in their top five, before
   Thursday."

## What LeadWell is not

Naming the non-goals is what keeps the product from becoming a CRM.

- **Not an HRIS.** No headcount, comp, performance ratings, or org
  administration. We are not a system the company runs on.
- **Not multiplayer (yet).** One leader's private view. The people in it don't
  have accounts, don't see what's written, and aren't invited. This is a
  deliberate trust position — see [`ai-doctrine.md`](ai-doctrine.md).
- **Not a task manager.** Actions and topics exist only where they attach to a
  person or a team. If it's a general to-do, it belongs in the user's actual
  task app.
- **Not an assessment vendor.** We don't administer CliftonStrengths or
  Enneagram tests. We're the layer that makes existing results *useful*.
- **Not a notes app.** Free text is captured, but always attached to a person,
  a team, or a meeting. Orphan notes are a smell.
- **Not a performance-management or surveillance tool.** Nothing here should
  ever be usable as evidence *against* a person. See the AI doctrine.

## North star

> A leader can walk into any conversation, in any of their contexts, having
> been reminded in under 60 seconds of everything that matters about the person
> in front of them.

Everything in the roadmap should measurably shorten that 60 seconds or
increase the quality of what's in it.

## Current state (as built)

| Area | Status |
|---|---|
| Org tree canvas, drag/persist positions, domain filter | Shipped |
| Teams: capacity, domain, purpose, cadence, last-met, sub-teams | Shipped |
| People: assessments (Clifton/Enneagram/MBTI), strengths, watch-outs, how-to-lead | Shipped |
| Leading up: managers, up-teams, operating manual, wins ledger | Shipped |
| 1:1s: history, transcript capture, AI structuring, topic kanban | Shipped |
| Goals, actions, notes — per person and per team | Shipped |
| AI: person coach, team coach, org-wide Ask AI, brain-dump profile fill | Shipped |
| Cloud sync, Google auth, per-user RLS isolation | Shipped |
| Multiplayer / sharing | Not built — see roadmap |
| Mobile / pre-meeting surface | Not built — see roadmap |

Detail lives in [`surface-map.md`](surface-map.md).

## Related

- Technical architecture: [`../../readme.md`](../../readme.md)
- Setup: [`../../SETUP.md`](../../SETUP.md)
