# Lexicon — the ubiquitous language

One word, one meaning, everywhere: the UI, the code, the AI prompts, and these
docs. When a concept drifts between layers, bugs and bad AI output follow.

**Rule:** renaming or adding a concept updates this file in the same PR as the
code. Source of truth for shape: [`src/types.ts`](../../src/types.ts).

---

## Core nouns

| Term | Means | Code | Never call it |
|---|---|---|---|
| **Me** | The leader using the app. The only user of a workspace. | `Me` | "the admin", "the account" |
| **Domain** | A life area — Day job, Church, Family, Community. Color-coded; filters the tree. | `Domain` | "category", "workspace", "tenant" |
| **Team** | A group I lead or report into, inside one domain. Can nest under a parent team. | `Team` | "group", "org", "department" |
| **Capacity** | The kind of authority I hold with a team: Manager, Leader, Influence, Report up. | `Capacity` | "role" (that's the person's job title) |
| **Person** | Someone on a team. Never a user; has no account. | `Person` | "contact", "employee", "user", "report" |
| **Manager** | A specific person I report to. Renders directly above my node. | `Manager` | "boss" in UI copy (fine in docs) |
| **Assessments** | Recorded results from CliftonStrengths, Enneagram, MBTI. | `Assessments` | "test scores", "profile" |
| **Operating manual** | How to succeed with a person I report to — their reward, anxieties, currency, scorecard. Not their personality. | `LeadUpProfile` | "boss profile", "playbook" |
| **Win** | A delivered piece of value banked against a person I report to, phrased in their currency. | `Win` | "achievement", "accomplishment" |
| **Topic** | A thing to talk about in a 1:1, on a kanban board. | `Action` + `ActionColumn` | "task", "ticket" |
| **1:1** | A recorded one-to-one conversation, with optional transcript. | `OneOnOne` | "meeting", "check-in" |
| **Note** | Dated free text about a person or team. | `Note` / `TeamNote` | "comment", "log" |
| **Goal** | A 0–100% tracked objective for a person or team. | `Goal` / `TeamGoal` | "OKR", "KPI" |

### Terminology hazards

- **Capacity vs. Role.** *Capacity* is my authority over them. *Role* is their
  job title. These are constantly confused — keep them apart in UI copy.
- **Domain (life area) vs. Strength domain (Gallup).** Genuine collision in
  the codebase: `Domain` is a life area, `StrengthDomain` is one of Executing /
  Influencing / Relationship Building / Strategic Thinking. In prose always
  qualify: "life area" or "strengths domain". *A rename would be worth
  considering — see [`open-questions.md`](open-questions.md).*
- **Manager (capacity) vs. Manager (entity).** `Capacity` "Manager" means *I
  have formal authority*. `Manager` the entity means *someone I report to*.
  These are opposite directions. Documented hazard; rename candidate.
- **Action vs. Topic.** The type is `Action`, the UI board calls them topics.
  Pick one. Recommend: **Topic** in the UI, since that's what it is.

---

## Direction and hierarchy

- **Down** (`direction: "down"`, default) — teams and people I lead. Render
  below my node.
- **Up** (`direction: "up"`) — teams and people I report into. Render above my
  node. Triggers leading-up framing everywhere: profile fields, coach prompts,
  wins ledger.
- **Sub-team** (`parentId`) — a team nested under a broader purview I also
  hold. Not a reporting line between people.

**Direction is a property of the relationship, not the person.** Today it lives
on `Team`, which means a person's direction is inherited from their team, and a
person can only be on one team. Known limitation.

---

## Derived concepts (computed, never stored)

Defined in [`src/lib/derive.ts`](../../src/lib/derive.ts):

| Term | Means |
|---|---|
| **Assessed** | A person with any framework result recorded. The unit of coverage. |
| **Coverage** | Assessed ÷ total, per team. *A measure of the leader's attention, never of the person.* |
| **Derived read** | Strengths and watch-outs inferred from Top-5 themes plus anything the leader added. |
| **Blind spot** | A strengths domain barely represented across a team — a group-level gap, not an individual flaw. |
| **Top domain** | The strengths domain a person's Top 5 leans into most. |

---

## Voice rules

Falls out of [`storybrand.md`](storybrand.md) and the dignity principle:

1. **"Lead", never "manage."** People are led. Tasks are managed.
2. **Second person, active.** "Know what to say before you walk in" — not "the
   system provides pre-meeting insights."
3. **The leader is the hero.** The AI never takes the subject position in copy.
4. **Describe behavior, not character.** "Processes before speaking", not
   "quiet".
5. **No corporate abstraction.** Never "stakeholders", "resources",
   "headcount", "human capital", "engagement". These are people.
6. **Assessments hedge.** "May", "tends to", "often" — never "is".
7. **No guilt in empty states.** An empty profile says "Nothing here yet — a
   brain-dump takes thirty seconds", never "You haven't recorded anything."

---

## Naming candidates for review

Do not change unilaterally — these are live proposals in
[`open-questions.md`](open-questions.md):

| Current | Proposed | Why |
|---|---|---|
| `Domain` (life area) | `LifeArea` | Frees `Domain` for the Gallup meaning and matches how people talk |
| `Action` | `Topic` | The UI already says topic; `Action` implies a task manager |
| `Capacity` "Manager" | "Direct authority" | Collides with the `Manager` entity |
