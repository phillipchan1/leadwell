# Arcs and shared meetings: working through something together

*Design spec.* Mockup: [`arcs-and-sharing-mockup.html`](arcs-and-sharing-mockup.html).

## Status

**Built**, all three phases. Requires migration
`worker/schema/005_arcs_and_sharing.sql` before the Worker that knows the new
tables is deployed (an older database rejects the new tables and every sync
fails until it is applied).

| Piece | Where |
|---|---|
| Projection (position + pace → which step is on which meeting) | [`src/lib/arcs.ts`](../src/lib/arcs.ts), checked by `npm run test:arcs` |
| Agenda band, nudge, Read / Talk / Try | [`ArcBand`](../src/components/arcs/ArcBand.tsx) |
| Plan ahead ribbon | [`ArcRibbon`](../src/components/arcs/ArcRibbon.tsx) |
| Start / edit, AI draft | [`ArcSheet`](../src/components/arcs/ArcSheet.tsx), [`arcDraft.ts`](../src/lib/arcDraft.ts) |
| Done / Again next time, takeaways (Run) | [`ArcRun`](../src/components/arcs/ArcRun.tsx) |
| Closing page | [`ArcClosing`](../src/components/arcs/ArcClosing.tsx) |
| Today: next step on the coming-up rows, team cards, "Read Ch. 4 before you meet" | `TodayPage`, `YourTeams` |
| Share a meeting, review and lock | [`ShareSheet`](../src/components/sharing/ShareSheet.tsx) |
| Our notes (Run) | [`SharedNotes`](../src/components/sharing/SharedNotes.tsx) |
| The shared page (`/with/<token>`) | [`GuestPage`](../src/guest/GuestPage.tsx) |
| Owner and guest routes | [`worker/src/shares.ts`](../worker/src/shares.ts), checked by `shares.check.ts` |
| Shared with you (her own workspace) | sidebar `SharedWithMeList`, Today `SharedWithYou` |

**Changed from the draft below:** the link is a capability (a 32-byte token
in the URL) rather than a magic-link sign-in. A guest gets no account and no
row in `user`, so the sign-in allowlist is untouched; revoking rotates the
token so the old link dies at once. If she has her own Polarch account under
the invited email, the meeting shows under *Shared with you* in her sidebar
and on her Today, and opens the same shared page.

**Not built:** the "Thursday's agenda" email (open question below), live
updates beyond polling (the shared page refreshes every 20s and on focus; an
owner looking at a shared meeting refreshes every 15s), and counting a shared
meeting in the guest's own readiness.

## The moment this comes from

Meghan and I are working through *Crucial Conversations* in our 1:1s, a
chapter or so each time. Today that plan lives in my head. Polarch knows the
1:1's rhythm and its running order, but nothing in it can say "we're on
chapter 4" or "chapter 5 is next Thursday." Meghan can't see the plan at all,
and she can't add anything to the agenda.

That one moment holds three separate needs. They are worth separating,
because each one also shows up in meetings that have nothing to do with a book:

| Need | Said as | The general case |
|---|---|---|
| **A through-line** | "put that somewhere" | Anything worked through in order across meetings: a book, onboarding, a 6-week goal, a study through Philippians, a training curriculum |
| **Agenda that writes itself** | "this week we're doing this" | Step *n* lands on the next meeting automatically, and moves when the meeting moves |
| **A shared agenda** | "she can see it and add to it" | The best relationships have a shared agenda: both people bring things, and both can see where it's going |

The first two are **Arcs**. The third is **sharing a meeting**. Arcs are worth
shipping first and alone; sharing makes them twice as good.

---

## Part 1 — Arcs

> An **arc** is something you're working through together, one step per meeting.

An arc belongs to a meeting, the same way topics do. It has a title, an
optional source (a book, with author and cover), and an ordered list of
**steps** ("Ch. 4 — Start with Heart"). It may name the section of the
standing agenda it lives in (`Growth`, `Training`); otherwise it gets a band
of its own at the top of the running order.

### It follows the pace, not the calendar

This one rule is what makes an arc feel alive rather than like a spreadsheet:

**Step *n* is always on the next occurrence that hasn't happened yet.** Steps
are *projected* onto occurrences the way the rhythm projects dates. They're
not booked into them. So:

- **Skip a week** → the arc slides with it. Nothing to re-plan, no chapter lost.
- **Reschedule** → the step goes with the meeting.
- **Run out of time** → at the end of the meeting, the step asks *Done* or
  *Again next time*. "Again" holds it in place and marks it `½` on the ribbon,
  so slowing down is visible without being a failure. (Compare `Topic.carried`,
  the honest nag. Here the honest thing is the pace.)
- **Want to go faster** → *Also cover Ch. 5* pulls the next step in.

Because nothing is booked ahead, there's nothing to fix when life happens.
The arc carries no plan, only a **position** and a **pace**, and the plan
you see is drawn from those.

### Read → Talk → Try

A book step isn't really a topic. It has three parts, and the third is the one
that changes people:

1. **Read**: what to do before we meet (*Ch. 4, pp. 49–68*). Visible days ahead.
2. **Talk**: one or two prompts for the meeting itself (*"Where do you go
   to silence or violence first?"*), drafted by AI, edited by you.
3. **Try**: one thing to practise before next time (*"Before one hard
   conversation this week, ask: what do I really want?"*).

**Try becomes a follow-up**, owned by both of us, and opens the next meeting
in *Since last time*: "How did *what do I really want* go?" The loop of
reading, talking, practising and debriefing was always the point of reading a
book together. Polarch already has a place for each part of it
(`FollowUp`, the running order, the write-up). Arcs connect them.

Each step also keeps a **takeaway**: one line each of us writes at the end,
*"Mine:"* and *"Meghan's:"*. Those lines are what make the closing page.

### Starting an arc

From a meeting's Agenda or Plan ahead: **＋ Arc**, or in Capture, `~` (as in
`~Crucial Conversations @meghan`).

Type a title. If it looks like a book, AI drafts the steps (chapters, pages,
one prompt and one practice each) and you edit the draft before anything is
saved. The draft is a starting point, not a source of truth, and the sheet says
*check these against your edition*. Then choose:

- **Pace**: one step per meeting (the default) or one every *n*.
- **Section**: which band of the standing agenda it sits in.
- **Starts**: next meeting (the default) or a date.

Arcs aren't only for books. Templates cover the same shape without a source:
*30-60-90 onboarding*, *New leader's first 8 weeks*, *Study through a book of
the Bible*, *Blank*.

### Where an arc shows up

- **Agenda**: a slim header above the running order: the title, *Ch. 4 of 12*,
  a twelve-tick progress rail, and the step's Read / Talk / Try in its section.
- **Plan ahead**: a **ribbon** across the weeks, one step per sheet, with a
  `½` where a step was held and a gap that closes on its own where a week was
  skipped. It's the "this week we're doing this" view.
- **Today**: the 1:1 card's section line gains the step (`Growth · Ch. 4`).
  On a day when the reading is due, the next-move line can say *Read Ch. 4
  before Thursday*.
- **Person page**: under the 1:1, *Arcs*: current and finished. A person's
  history includes what you've learned together.

### The closing page

When the last step is done, the arc closes into a single page: the book, the
dates (*Oct 2 – Jan 22, 14 meetings for 12 chapters*), every takeaway in
order, and the practices we kept. It's the one thing in Polarch worth printing,
and it's the right thing to send Meghan.

---

## Part 2 — Sharing a meeting

### Do I "add her" to a team? No. Share the meeting.

Everything in Polarch today is *my read*: health, prayer, assessments,
watch-outs, how to lead, and the private ideas tray. A **team** in Polarch is
"people I lead," with my reads attached. Making Meghan a member of a team
would mean deciding, field by field, which of my private reads she can see.
That's the wrong question, and every answer to it leaks something.

The **meeting** is the right unit to share, and the model already leans this
way:

- Topics, follow-ups and occurrences already belong to a **meeting**, not to
  a person. (See the comment on `Topic`: "a topic belongs to the meeting where
  it gets raised.") The things that should be shared are exactly the things
  keyed by meeting.
- `TrackedMeeting.role` already distinguishes **convene** from **attend**.
  A shared meeting is the same meeting seen from both chairs: I convene it,
  Meghan attends it.
- A staff meeting shares the same way: share it with the team's roster and
  each member gets the meeting. They don't get the team, with its health and
  my notes on it.

So the control is on the meeting: **Share** → *Meghan Lee* (her email
pre-filled from her person record) → she gets a magic link. The meeting's
header shows her face beside mine from then on.

### Two layers: the room and your read

| **The room** (shared) | **Your read** (always private) |
|---|---|
| Next meeting's running order | Health, prayer, assessments, how to lead |
| Topics on shared weeks (either of us can add) | The Ideas tray: anything not yet placed |
| The arc: steps, Read / Talk / Try, both takeaways | Prep checks and readiness |
| Follow-ups, each with an owner | *My notes* in the write-up |
| *Our notes* in the write-up | Topics marked 🔒 |
| Plan ahead: the next weeks, the arc ribbon | Every other meeting and person |

The rule that makes this safe to use without thinking:

- **Placing is sharing.** An idea in my tray is private. Once I put it on a
  week of a shared meeting, it's on the agenda we both see. That's what an
  agenda is. One click on 🔒 keeps a specific topic mine (*"talk about her
  workload"* can be on my list without being on hers).
- **The write-up splits in two.** *Our notes* (shared, either of us can type)
  and *My notes* (private, where the honest assessment goes). Today's single
  `Session.notes` becomes *My notes* so that nothing already written is ever
  exposed.
- **Everything shared is labelled as shared.** A shared meeting's agenda has
  her avatar in the header and a "Visible to Meghan" hint on the page. Locked
  items show the lock. You should never have to wonder who can see what.

### What Meghan sees

A single page, `polarch.app/with/<token>`, built for a phone, because that's
where she'll open the link:

- **Thursday with Phil**: date, time, and a countdown.
- **The running order**, by section, with who raised each item.
- **This week in the arc**: Ch. 4, *Read pp. 49–68*, the prompt, and her
  Try from last week to check off.
- **＋ Add to Thursday**: one field; it lands in the section she picks (or
  *Anything else*) with her name on it. I see it immediately on my agenda, as
  *Meghan raised*.
- **Coming up**: the next three weeks, as arc steps and anything already
  placed.
- **Her follow-ups**: things *she* said she'd do. She can check them off.
- After the meeting: *Our notes* and a field for her takeaway.

She can't see anything in the private column of the table above, or any of
my other meetings and people. She doesn't need an account to start. The
magic link is enough.

### When she has her own Polarch

If Meghan uses Polarch herself, accepting the invite puts the meeting in
*her* workspace as an **attend** meeting with me as the subject. Her Today
shows *1:1 with Phil · Thu*, her readiness counts it, and her tray of ideas
for it stays private to her. The shared layer is the same rows seen from
both workspaces. Each private layer belongs to its own owner. This is
what "the best relationships have a shared agenda" means in practice: both
people prepare, and the meeting reflects both.

---

## Data model

```ts
/** Something worked through in order, one step per occurrence. */
type Arc = {
  id: string;
  meetingId: string;
  title: string;
  source?: { kind: "book"; title: string; author?: string; coverUrl?: string };
  /** The standing-agenda band it sits in. Unset = its own band, first. */
  slotId?: string;
  /** Steps per occurrence. 1 = default; 0.5 = every other meeting. */
  pace: number;
  /** First occurrence it can land on. */
  startsOn: string;
  status: "active" | "paused" | "done";
  order: number;
};

type ArcStep = {
  id: string;
  arcId: string;
  label: string;              // "Ch. 4 — Start with Heart"
  read?: string;              // "pp. 49–68"
  talk?: string[];            // prompts
  try?: string;               // becomes a FollowUp when the step is reached
  /** The occurrences it was covered in. Two entries = it took two meetings. */
  coveredIn: string[];        // Session ids
  status: "upcoming" | "done";
  takeaways?: { by: MemberRef; text: string }[];
  order: number;
};
```

Projection, in `src/lib/arcs.ts`, mirrors `readiness.ts`: given the arc, its
steps and the meeting's projected occurrences, return `stepId` per occurrence.
**Nothing is stored per future week.** The current step is the first
`upcoming` step. Holding a step (*Again next time*) appends to `coveredIn`
without marking it done. That's where the `½` comes from.

Sharing:

```ts
/** Who else sits at this meeting. The owner is implicit. */
type MeetingMember = {
  meetingId: string;
  email: string;
  personId?: string;          // my person record for them, if any
  userId?: string;            // set once they've signed in
  invitedOn: string;
  joinedOn?: string;
  revokedOn?: string;
};

type MemberRef = "owner" | { memberEmail: string };

// Additions to existing types
Topic.private?: boolean;      // 🔒 — never sent to members
Topic.raisedBy?: MemberRef;   // unset = owner
FollowUp.owner?: MemberRef | "both";
Session.sharedNotes?: string; // "Our notes"; existing `notes` becomes "My notes"
```

### Worker

- `/api/shared/:meetingId/*` is a **separate router** with its own allowlist
  of fields, not the user-scoped store with a filter in front of it.
  A guest's session carries `(meetingId, email)`, and every query is written
  against that pair. Private columns are never selected, so a bug in the client
  can't leak them.
- The guest credential is the token in the link. It reaches the shared router
  only, never `/api/data`, and never creates a sign-in. The workspace stays
  allowlisted.
- Revoking a member ends their sessions on that meeting immediately.
- Rate limits reuse `rateLimit.ts`. A guest who can add topics is a write path
  from outside the allowlist, so cap it (e.g. 30 topics / meeting / day).

---

## Phasing

**Phase 1 — Arcs, private (no new auth).** `Arc`, `ArcStep`, projection,
Agenda header, Plan ahead ribbon, Today line, Read / Talk / Try with Try →
`FollowUp`, *Done / Again next time* at the end of Run, AI draft from a
title, the closing page. Most of the value of "put that somewhere" and "this
week we're doing this" lands here.

**Phase 2 — Shared view + add.** `MeetingMember`, invite by magic link, the
guest page, *Add to Thursday*, `Topic.private` and `raisedBy`, the shared/
private split of the write-up. Meghan can see and add, but she can't edit
what I wrote.

**Phase 3 — Two chairs.** Shared meetings appear in the guest's own
workspace as **attend**, follow-ups get owners she can check off, both
takeaways, live updates while both of us have the agenda open, and team
sharing for staff meetings.

## Open questions

- **Notifications.** Does Meghan get a "Thursday's agenda" email the day
  before? It's probably right to send one, off by default, from the meeting's
  settings.
- **Who can move things?** In Phase 2 a guest can add but not reorder or
  drop. Should she be able to reorder her own items?
- **Two arcs at once** (a book and an onboarding plan) both get a step per
  meeting by default. Should a meeting cap at one active arc, or show both
  bands? Show both; it's rare and the user chose it.
- **Book metadata.** Use AI alone, or a lookup (Open Library) for the cover
  and chapter list? A cover matters more than it sounds: it's what makes the
  arc header and the closing page feel like *ours*.
