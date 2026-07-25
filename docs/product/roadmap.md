# Roadmap

> **Status:** DRAFT — proposed, not agreed. Sequencing is Phil's call.

Every item is stated as a **bet**: what we believe, what we'd build, and what
would prove us wrong. An item without a falsifier is a wish, not a bet.

Derived from the gaps in [`surface-map.md`](surface-map.md) — not from a
feature wishlist.

---

## Now — close the loop the story already promises

### 1. The Drift view

**Bet:** drift is the villain in our story and the app can't see it. A single
view of "who have I gone quiet on, across every context" delivers the product's
core promise in one screen.

- Rank every person by time since last meaningful contact (1:1, note, topic
  touched), weighted by expected cadence
- Cross-domain by default — the church volunteer sits next to the direct report
- Frame as attention allocation, never as a scorecard on the person
- Jobs: J3, J6 · Modes: all · Principles: serves #1, strains #10

**Falsified if:** leaders open it once and never return, or say the ranking
tells them what they already knew.

### 2. Cadence honesty

**Bet:** `cadence` and `lastMet` already exist and are never compared. The
cheapest real insight in the product is "you said weekly; it's been five."

- Intended vs. actual, per team and per person
- Feeds the Drift view
- Jobs: J10, J3 · Modes: 1, 2 · Cost: low

**Falsified if:** leaders stop setting cadence to avoid the guilt. *(Watch
this — it's a real risk, and it would violate the no-guilt voice rule.)*

### 3. Pre-conversation brief (mobile-readable)

**Bet:** J1 is the highest-frequency job and it happens on a phone, three
minutes before the meeting, away from a desk. Desktop-only means the
highest-frequency job is unserved at the moment it occurs.

- Read-only, responsive, one URL per person
- The 60-second promise, literally: who they are, what's open, what we said last
- Jobs: J1 · Modes: all · Principle: #1 in its purest form

**Falsified if:** leaders say they already prep at their desk and don't want it
on a phone.

---

## Next — serve the thin modes

### 4. Influence / stakeholder model (Mode 3)

**Bet:** peer influence is the thinnest-served mode and the one where
authority-flavored advice does the most damage. Modeling decision power is what
unlocks it.

- Per-person, per-initiative: decides / blocks / persuadable / needs-to-say-yes
- "What do they need in order to say yes"
- Pre-meeting sequencing: who to talk to first
- Jobs: J8, new "move something without authority" job · Modes: 3

**Falsified if:** leaders find it too heavyweight for the transient nature of
peer initiatives.

### 5. Volunteer load & bench (Mode 2)

**Bet:** the thing that actually breaks volunteer teams is load concentration
and the absence of a bench, and we model neither.

- Who is carrying disproportionately; who has capacity
- Why this person serves (motivation capture — operationally critical when
  unpaid)
- Bench depth per role: who could step up
- Jobs: J7 + new · Modes: 2 · Persona: P2

**Falsified if:** volunteer leaders say load is obvious to them and the problem
is actually recruitment, not distribution.

### 6. Capture anywhere

**Bet:** principle #8 is under-delivered. Capture still requires opening a
desktop app and navigating to a person. If the notes app is faster, we lose.

- Voice or text capture that routes itself to the right person
- Explicitly competing with the phone's notes app on speed
- Jobs: J5 · Modes: all

**Falsified if:** structured capture in-app is already fast enough and the
routing misfires often enough to be annoying.

---

## Later — expansion bets

| Bet | Believe | Risk |
|---|---|---|
| **Person on multiple teams** | The model's biggest structural limitation. Real people appear in more than one context. | Data-model surgery; every derived metric changes |
| **Assessment import** | Removing typing from J2 raises activation | Vendor exports vary; may not be worth it |
| **Rhythm nudges** | The system should reach out, not wait to be opened | Guilt risk; a nagging leadership tool is a deleted leadership tool |
| **Leadership-readiness rollup** | Coverage is a weak metric; a real readiness score would be better | **Danger zone** — must score the leader's attention, never the person. See principle #9 |
| **Selective sharing** | A leader may want to share a development plan *with the person it's about* | Directly strains principle #5; needs a decision record before any work |
| **Calendar integration** | Would make "prepared conversations" automatic rather than manual | Privacy surface expands materially |

---

## Explicitly not doing

| Not doing | Why |
|---|---|
| Team/multiplayer accounts | Principle #5. Candor collapses. Revisit only with a decision record. |
| HR integrations (HRIS, ATS) | Makes us company-owned; destroys the positioning |
| Our own personality assessment | Principle #7 — we're the application layer |
| General task management | Actions attach to people and teams or they don't exist |
| Performance-review export | Principle #9, and it inverts the product against P4 |

---

## Sequencing logic

**Now** finishes the story we're already telling — drift is our villain and we
can't see it. Cheapest path to the product feeling *true*.

**Next** widens from the well-served Mode 1 into the modes that are actually
unserved, which is also where the competitive moat is (nobody else does peer
influence or volunteer load).

**Later** items are mostly structural or risky and should wait for real usage
evidence.

**The thing that isn't on this roadmap and probably should outrank all of it:**
real leader interviews. Every doc in this folder is marked DRAFT. Six
conversations would either confirm this sequencing or rewrite it — and that's
worth more than any single feature here. See
[`../research/README.md`](../research/README.md).
