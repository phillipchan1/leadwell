/**
 * Document transitions for the meeting planner — pure functions of the
 * persisted document.
 *
 * The store calls these inside `set`, and the MCP server calls them on a
 * document it loaded from Supabase. One implementation is what keeps an agent
 * filing a topic, skipping a week or adding a row from doing it slightly
 * differently to the app, which would be a second set of rules to keep true.
 *
 * Each returns the slices it changed (a zustand-style patch), never the whole
 * document, and never mutates a row in place: sync diffs by object identity.
 *
 * Imports carry `.js` on purpose: the MCP runs this file as plain Node ESM on
 * Vercel, which needs the extension. Vite and tsc resolve it to the `.ts`.
 */
import type {
  CurriculumSlot,
  FollowUp,
  MeetingSubjectKind,
  PrayerSubjectKind,
  Prayer,
  Session,
  Tag,
  Topic,
  TopicLane,
  TrackedMeeting,
} from "../types";
import type { PersistedData } from "./persist";
import type { ColumnTarget } from "./topics";
import {
  defaultCurriculum,
  effectiveSlotId,
  nextSlotAfter,
  plannedSlots,
} from "./topics.js";
import {
  findMeeting,
  findTag,
  parseCapture,
  reorderInto,
  splitCaptureLines,
} from "./ideas.js";
import { meetingSubjectName, todayISO } from "./readiness.js";

export type Doc = PersistedData;
export type Patch = Partial<Doc>;

/** Same 8-char id the app has always minted. */
export const uid = () => Math.random().toString(36).slice(2, 10);

export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function addDaysISO(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Fold a patch into a document — for ops built out of other ops. */
function apply(d: Doc, patch: Patch): Doc {
  return { ...d, ...patch };
}

/** The keys of `after` that are no longer the same object as in `before`. */
function changed(before: Doc, after: Doc): Patch {
  const out: Patch = {};
  for (const k of Object.keys(after) as (keyof Doc)[]) {
    if (after[k] !== before[k]) Object.assign(out, { [k]: after[k] });
  }
  return out;
}

/**
 * A topic's tags after it lands in `slotId` of `meetingId`, having left
 * `fromSlotId`. The row a card sits in *is* its tag on the planner, so moving
 * from Prayer to Training swaps one for the other rather than accumulating.
 */
export function slotTagIds(
  meetings: TrackedMeeting[],
  meetingId: string | undefined,
  tagIds: string[],
  slotId: string | undefined,
  fromSlotId?: string
): string[] {
  const curriculum = meetings.find((m) => m.id === meetingId)?.curriculum ?? [];
  // The row it is leaving may be implied by a tag rather than stored.
  const fromRow =
    fromSlotId === undefined
      ? undefined
      : effectiveSlotId({ slotId: fromSlotId || undefined, tagIds } as Topic, curriculum);
  const from = curriculum.find((c) => c.id === fromRow)?.tagId;
  const to = curriculum.find((c) => c.id === slotId)?.tagId;
  let next = tagIds;
  if (from && from !== to) next = next.filter((x) => x !== from);
  if (to && !next.includes(to)) next = [...next, to];
  return next;
}

/** What `@frontier` matches: the meeting's own name, else its subject's. */
export function meetingLabelOf(d: Pick<Doc, "people" | "teams" | "managers">) {
  return (m: TrackedMeeting) => m.name ?? meetingSubjectName(m, d) ?? "";
}

/**
 * Tracking a meeting answers the opt-in question outright, so any lingering
 * "no meeting" decision on that subject is stale.
 */
export function clearNoMeeting(
  d: Pick<Doc, "people" | "teams" | "managers">,
  kind: MeetingSubjectKind,
  subjectId: string
): Patch {
  if (kind === "person") {
    return {
      people: d.people.map((p) =>
        p.id === subjectId && p.noMeeting ? { ...p, noMeeting: undefined } : p
      ),
    };
  }
  if (kind === "team") {
    return {
      teams: d.teams.map((t) =>
        t.id === subjectId && t.noMeeting ? { ...t, noMeeting: undefined } : t
      ),
    };
  }
  return {
    managers: d.managers.map((m) =>
      m.id === subjectId && m.noMeeting ? { ...m, noMeeting: undefined } : m
    ),
  };
}

/**
 * All three subject kinds carry the prayer mark on their own row, so every
 * prayer writer goes through this one patcher: praying for a team, for someone
 * on it and for the leader I answer to are the same act — only the row differs.
 */
export function patchPrayer(
  d: Pick<Doc, "people" | "teams" | "managers">,
  kind: PrayerSubjectKind,
  id: string,
  next: (prayer?: Prayer) => Prayer | undefined
): Patch {
  const applyTo = <T extends { id: string; prayer?: Prayer }>(x: T): T =>
    x.id === id ? { ...x, prayer: next(x.prayer) } : x;
  if (kind === "team") return { teams: d.teams.map(applyTo) };
  if (kind === "manager") return { managers: d.managers.map(applyTo) };
  return { people: d.people.map(applyTo) };
}

/** Meetings for a set of subjects, plus every session and topic under them. */
export function withoutMeetingsFor(
  d: Pick<Doc, "meetings" | "sessions" | "topics">,
  kind: MeetingSubjectKind,
  subjectIds: Set<string>
): Pick<Doc, "meetings" | "sessions" | "topics"> {
  const doomed = new Set(
    d.meetings
      .filter((m) => m.subjectKind === kind && subjectIds.has(m.subjectId))
      .map((m) => m.id)
  );
  return {
    meetings: d.meetings.filter((m) => !doomed.has(m.id)),
    sessions: d.sessions.filter((o) => !doomed.has(o.meetingId)),
    // An unassigned topic has no meeting to be doomed with — deleting a meeting
    // must not silently take the backlog with it.
    topics: d.topics.filter((t) => !(t.meetingId && doomed.has(t.meetingId))),
  };
}

// ── Topics ────────────────────────────────────────────────────────────────

export type AddTopicOpts = {
  lane?: TopicLane;
  sessionId?: string;
  slotId?: string;
  tagIds?: string[];
  dueDate?: string;
};

export function addTopic(
  d: Doc,
  id: string,
  meetingId: string | undefined,
  text: string,
  opts: AddTopicOpts = {}
): Patch {
  const last = d.topics
    .filter((t) => t.meetingId === meetingId)
    .reduce((max, t) => Math.max(max, t.order), -1);
  return {
    topics: [
      ...d.topics,
      {
        id,
        meetingId,
        text,
        status: "open",
        lane: opts.lane ?? "backlog",
        sessionId: opts.sessionId,
        slotId: opts.slotId,
        tagIds: slotTagIds(d.meetings, meetingId, opts.tagIds ?? [], opts.slotId),
        carried: 0,
        carriedFrom: [],
        dueDate: opts.dueDate,
        createdOn: todayISO(),
        order: last + 1,
      },
    ],
  };
}

export function updateTopic(d: Doc, id: string, patch: Partial<Topic>): Patch {
  return { topics: d.topics.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

/** Where a card can be dropped, with the meeting it belongs to. */
export type PlaceTarget = ColumnTarget & { meetingId?: string };

export function placeTopicAt(
  d: Doc,
  id: string,
  target: PlaceTarget,
  index?: number
): Patch {
  const topic = d.topics.find((t) => t.id === id);
  if (!topic) return {};

  let sessions = d.sessions;
  let sessionId: string | undefined;
  const slotId = target.slotId;
  let lane = topic.lane;
  let meetingId = target.meetingId ?? topic.meetingId;

  if (target.kind === "session") {
    sessionId = target.sessionId;
  } else if (target.kind === "projected") {
    // Dropping on a projected week books it on the way in — the plan is the
    // commitment, so it shouldn't need a separate "schedule this" step.
    const existing = sessions.find(
      (o) => o.meetingId === meetingId && o.date === target.date
    );
    if (existing) {
      sessionId = existing.id;
    } else if (meetingId) {
      sessionId = uid();
      sessions = [...sessions, { id: sessionId, meetingId, date: target.date }];
    }
  } else {
    lane = target.lane;
  }

  if (sessionId) {
    const owner = sessions.find((o) => o.id === sessionId);
    if (owner) meetingId = owner.meetingId;
    lane = "backlog";
  }

  // A slot with a tag stamps it on arrival. This is what makes coverage
  // trustworthy without asking anyone to tag by hand.
  const tagIds = slotTagIds(
    d.meetings,
    meetingId,
    topic.tagIds,
    slotId,
    topic.meetingId === meetingId ? (topic.slotId ?? "") : undefined
  );

  const moved: Topic = {
    ...topic,
    status: "open",
    closedOn: undefined,
    meetingId,
    sessionId,
    slotId,
    lane,
    tagIds,
    // Placing it by hand is a decision — it stops reading as "came back".
    returnedOn: undefined,
    returnedFromDate: undefined,
  };

  return { sessions, topics: reorderInto(d.topics, moved, index) };
}

export type CaptureTarget = PlaceTarget;

/**
 * Capture-bar grammar: one topic per line, `#tag` `@meeting` `!` urgent.
 * Unknown tags are created. Returns the ids of the topics it made.
 */
export function captureTopics(
  d: Doc,
  raw: string,
  target?: CaptureTarget,
  index?: number
): { patch: Patch; created: string[] } {
  const created: string[] = [];
  const lines = splitCaptureLines(raw);
  if (!lines.length) return { patch: {}, created };

  let tags = d.tags;
  let topics = d.topics;
  let sessions = d.sessions;

  /*
   * Where the capture box was: a real occurrence, or a projected one the
   * board is only drawing from the rhythm.
   *
   * Projected columns used to fall through to `undefined` here, so typing
   * into next Friday quietly filed the topic in the idea bucket instead —
   * the card simply wasn't where it had just been typed. Book the
   * occurrence on the way in, exactly as dropping a card there does.
   */
  let targetSession: string | undefined;
  if (target?.kind === "session") {
    targetSession = target.sessionId;
  } else if (target?.kind === "projected" && target.meetingId) {
    const existing = sessions.find(
      (o) => o.meetingId === target.meetingId && o.date === target.date
    );
    if (existing) {
      targetSession = existing.id;
    } else {
      targetSession = uid();
      sessions = [
        ...sessions,
        { id: targetSession, meetingId: target.meetingId, date: target.date },
      ];
    }
  }
  const sessionMeeting = targetSession
    ? sessions.find((o) => o.id === targetSession)?.meetingId
    : undefined;

  // `@frontier` should match what the user sees, which is the meeting's
  // own name when it has one and the subject's otherwise.
  const labelOf = meetingLabelOf(d);

  for (const line of lines) {
    const parsed = parseCapture(line);
    if (!parsed.text) continue;

    const tagIds: string[] = [];
    for (const label of parsed.tagLabels) {
      const found = findTag(label, tags);
      if (found) {
        tagIds.push(found.id);
        continue;
      }
      const tag: Tag = {
        id: uid(),
        label: label.charAt(0).toUpperCase() + label.slice(1),
        color: tags.length % 6,
        order: tags.length,
      };
      tags = [...tags, tag];
      tagIds.push(tag.id);
    }

    let meetingId = target?.meetingId;
    if (parsed.meetingQuery) {
      const m = findMeeting(parsed.meetingQuery, d.meetings, labelOf);
      if (m) meetingId = m.id;
    }

    const id = uid();
    created.push(id);
    // An explicit `@other-meeting` overrules the column it was typed into,
    // so it must not keep this meeting's occurrence.
    const sessionId =
      sessionMeeting && sessionMeeting === meetingId ? targetSession : undefined;
    const topic: Topic = {
      id,
      meetingId,
      text: parsed.text,
      status: "open",
      lane: target?.kind === "lane" ? target.lane : "backlog",
      sessionId,
      slotId: target?.slotId,
      tagIds: slotTagIds(d.meetings, meetingId, tagIds, target?.slotId),
      urgent: parsed.urgent || undefined,
      carried: 0,
      carriedFrom: [],
      createdOn: todayISO(),
      order: 0,
    };
    topics = reorderInto([...topics, topic], topic, index);
  }
  // Nothing captured ⇒ nothing booked. Returning `{}` drops the projected
  // occurrence we speculatively created above.
  return {
    patch: created.length ? { tags, topics, sessions } : {},
    created,
  };
}

export function returnTopic(d: Doc, id: string): Patch {
  const topic = d.topics.find((t) => t.id === id);
  if (!topic?.sessionId) return {};
  const session = d.sessions.find((o) => o.id === topic.sessionId);
  const moved: Topic = {
    ...topic,
    sessionId: undefined,
    lane: "backlog",
    carried: topic.carried + 1,
    carriedFrom: [...(topic.carriedFrom ?? []), topic.sessionId],
    returnedOn: todayISO(),
    returnedFromDate: session?.date,
  };
  return {
    sessions: d.sessions.map((o) =>
      o.id === session?.id
        ? {
            ...o,
            uncovered: [...new Set([...(o.uncovered ?? []), topic.text])],
          }
        : o
    ),
    topics: reorderInto(d.topics, moved, 0),
  };
}

export function rollTopic(d: Doc, id: string, sessionId: string | undefined): Patch {
  const topic = d.topics.find((t) => t.id === id);
  const from = topic?.sessionId
    ? d.sessions.find((o) => o.id === topic.sessionId)
    : undefined;
  return {
    // The session being left keeps an honest ledger of what it didn't
    // cover, independent of wherever the topic lands next.
    sessions: from
      ? d.sessions.map((o) =>
          o.id === from.id
            ? {
                ...o,
                uncovered: [...new Set([...(o.uncovered ?? []), topic!.text])],
              }
            : o
        )
      : d.sessions,
    topics: d.topics.map((t) =>
      t.id === id
        ? {
            ...t,
            status: "open",
            closedOn: undefined,
            sessionId,
            // The count is the honest signal: a topic pushed three times is
            // telling you something a due date never would.
            carried: t.carried + 1,
            carriedFrom: from ? [...(t.carriedFrom ?? []), from.id] : t.carriedFrom,
            returnedOn: from ? todayISO() : t.returnedOn,
            returnedFromDate: from ? from.date : t.returnedFromDate,
          }
        : t
    ),
  };
}

/*
 * Hand back anything an occurrence passed without covering — onto the next
 * occurrence of the same meeting, not into the backlog. A topic that keeps
 * sliding says so right on the card (`rollTopic` stamps the trail); landing
 * back on the board is what makes that visible without forcing a re-triage
 * decision every single week. Only a meeting with nowhere left to project
 * (paused, or no rhythm at all) falls back to the backlog, same as the
 * manual roll-forward already does.
 */
export function sweepReturns(
  d: Doc,
  today: string = todayISO()
): { patch: Patch; count: number } {
  const due = d.topics.filter((t) => {
    if (t.status !== "open" || !t.sessionId) return false;
    const session = d.sessions.find((o) => o.id === t.sessionId);
    return Boolean(session && session.date < today);
  });
  let doc = d;
  for (const topic of due) {
    const session = doc.sessions.find((o) => o.id === topic.sessionId);
    const meeting = session
      ? doc.meetings.find((m) => m.id === session.meetingId)
      : undefined;
    let nextSessionId: string | undefined;
    if (meeting) {
      const slots = plannedSlots(meeting, doc.sessions, doc.topics, today);
      const next = nextSlotAfter(slots, topic.sessionId);
      if (next) {
        nextSessionId = next.sessionId ?? uid();
        if (!next.sessionId) {
          doc = apply(doc, {
            sessions: [
              ...doc.sessions,
              { id: nextSessionId, meetingId: meeting.id, date: next.date },
            ],
          });
        }
      }
    }
    doc = apply(doc, rollTopic(doc, topic.id, nextSessionId));
  }
  return { patch: changed(d, doc), count: due.length };
}

export function coverTopic(d: Doc, id: string, covered = true): Patch {
  return {
    topics: d.topics.map((t) =>
      t.id === id
        ? covered
          ? { ...t, status: "covered", closedOn: todayISO() }
          : { ...t, status: "open", closedOn: undefined }
        : t
    ),
  };
}

export function tagTopics(d: Doc, ids: string[], tagId: string, on: boolean): Patch {
  const set_ = new Set(ids);
  return {
    topics: d.topics.map((t) => {
      if (!set_.has(t.id)) return t;
      const has = (t.tagIds ?? []).includes(tagId);
      if (has === on) return t;
      return {
        ...t,
        tagIds: on ? [...t.tagIds, tagId] : t.tagIds.filter((x) => x !== tagId),
      };
    }),
  };
}

export function assignTopics(d: Doc, ids: string[], meetingId: string | null): Patch {
  const set_ = new Set(ids);
  return {
    topics: d.topics.map((t) =>
      set_.has(t.id) ? { ...t, meetingId: meetingId ?? undefined, slotId: undefined } : t
    ),
  };
}

export function parkTopics(d: Doc, ids: string[], parked: boolean): Patch {
  const set_ = new Set(ids);
  return {
    topics: d.topics.map((t) =>
      set_.has(t.id) ? { ...t, lane: parked ? "parked" : "backlog" } : t
    ),
  };
}

export function deleteTopics(d: Doc, ids: string[]): Patch {
  const set_ = new Set(ids);
  return { topics: d.topics.filter((t) => !set_.has(t.id)) };
}

/**
 * Nudge a topic up or down among the cards beside it. Null when it's already
 * at the edge.
 */
export function moveTopic(
  d: Doc,
  id: string,
  direction: -1 | 1
): { patch: Patch; index: number; total: number } | null {
  const topic = d.topics.find((t) => t.id === id);
  if (!topic) return null;

  // "Beside it" is what the user can see: the same slot on the board, or the
  // same lane. Reordering against the whole meeting would move a card past
  // rows that aren't on screen.
  const siblings = d.topics
    .filter(
      (t) =>
        t.meetingId === topic.meetingId &&
        t.sessionId === topic.sessionId &&
        (t.sessionId ? true : t.lane === topic.lane) &&
        (topic.status === "open" ? t.status === "open" : t.status !== "open")
    )
    .sort((a, b) => a.order - b.order);

  const at = siblings.findIndex((t) => t.id === id);
  const to = at + direction;
  if (at === -1 || to < 0 || to >= siblings.length) return null;

  // Renumber the whole run rather than swapping two values. Seeded and
  // migrated topics can share an `order`, and swapping equal numbers moves
  // nothing — the row would visibly refuse to budge.
  const reordered = [...siblings];
  const [moved] = reordered.splice(at, 1);
  reordered.splice(to, 0, moved);
  const orderById = new Map(reordered.map((t, i) => [t.id, i]));

  return {
    patch: {
      topics: d.topics.map((t) =>
        orderById.has(t.id) ? { ...t, order: orderById.get(t.id)! } : t
      ),
    },
    index: to,
    total: siblings.length,
  };
}

// ── Tags ──────────────────────────────────────────────────────────────────

export function addTag(d: Doc, id: string, label: string): Patch {
  const trimmed = label.trim();
  if (!trimmed) return {};
  return {
    tags: [
      ...d.tags,
      { id, label: trimmed, color: d.tags.length % 6, order: d.tags.length },
    ],
  };
}

export function updateTag(d: Doc, id: string, patch: Partial<Tag>): Patch {
  return { tags: d.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function deleteTag(d: Doc, id: string): Patch {
  return {
    tags: d.tags.filter((t) => t.id !== id),
    topics: d.topics.map((t) =>
      t.tagIds.includes(id) ? { ...t, tagIds: t.tagIds.filter((x) => x !== id) } : t
    ),
    // A slot or a target pointing at a dead tag would silently stop working.
    meetings: d.meetings.map((m) => ({
      ...m,
      curriculum: m.curriculum?.map((c) =>
        c.tagId === id ? { ...c, tagId: undefined } : c
      ),
      coverageTargets: m.coverageTargets?.filter((c) => c.tagId !== id),
    })),
  };
}

// ── Follow-ups ────────────────────────────────────────────────────────────

export function addFollowUp(
  d: Doc,
  id: string,
  subjectKind: MeetingSubjectKind,
  subjectId: string,
  text: string,
  opts: { meetingId?: string; sourceSessionId?: string } = {}
): Patch {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return {
    followUps: [
      ...d.followUps,
      {
        id,
        subjectKind,
        subjectId,
        meetingId: opts.meetingId,
        text: trimmed,
        status: "open",
        openedOn: todayISO(),
        sourceSessionId: opts.sourceSessionId,
        order: d.followUps.length,
      },
    ],
  };
}

export function setFollowUpDone(d: Doc, id: string, done: boolean): Patch {
  return {
    followUps: d.followUps.map((f): FollowUp =>
      f.id === id
        ? { ...f, status: done ? "done" : "open", closedOn: done ? todayISO() : undefined }
        : f
    ),
  };
}

export function toggleFollowUp(d: Doc, id: string): Patch {
  const f = d.followUps.find((x) => x.id === id);
  return f ? setFollowUpDone(d, id, f.status === "open") : {};
}

export function deleteFollowUp(d: Doc, id: string): Patch {
  return { followUps: d.followUps.filter((f) => f.id !== id) };
}

export function promoteToFollowUp(d: Doc, topicId: string, id: string = uid()): Patch {
  const topic = d.topics.find((t) => t.id === topicId);
  const meeting = topic?.meetingId
    ? d.meetings.find((m) => m.id === topic.meetingId)
    : undefined;
  if (!topic || !meeting) return {};
  return {
    followUps: [
      ...d.followUps,
      {
        id,
        subjectKind: meeting.subjectKind,
        subjectId: meeting.subjectId,
        meetingId: meeting.id,
        text: topic.text,
        status: "open" as const,
        openedOn: todayISO(),
        sourceSessionId: topic.sessionId,
        order: d.followUps.length,
      },
    ],
    topics: d.topics.map((t) =>
      t.id === topicId ? { ...t, status: "dropped" as const, closedOn: todayISO() } : t
    ),
  };
}

// ── Meetings ──────────────────────────────────────────────────────────────

export function createMeeting(
  d: Doc,
  id: string,
  subjectKind: MeetingSubjectKind,
  subjectId: string,
  patch?: Partial<Omit<TrackedMeeting, "id" | "subjectKind" | "subjectId">>
): Patch {
  const curriculum = patch?.curriculum ?? defaultCurriculum(subjectKind);
  return {
    meetings: [
      ...d.meetings,
      {
        id,
        subjectKind,
        subjectId,
        rhythm: "weekly",
        ...patch,
        curriculum: curriculum.length ? curriculum : undefined,
      },
    ],
    // Tracking answers the opt-in question, so the decision flag is moot.
    ...clearNoMeeting(d, subjectKind, subjectId),
  };
}

export function updateMeeting(d: Doc, id: string, patch: Partial<TrackedMeeting>): Patch {
  return { meetings: d.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)) };
}

export function untrackMeeting(d: Doc, id: string): Patch {
  return {
    meetings: d.meetings.filter((m) => m.id !== id),
    sessions: d.sessions.filter((o) => o.meetingId !== id),
    topics: d.topics.filter((t) => t.meetingId !== id),
  };
}

export function setNoMeeting(
  d: Doc,
  subjectKind: MeetingSubjectKind,
  subjectId: string,
  value: boolean
): Patch {
  const flag = value ? true : undefined;
  if (subjectKind === "person") {
    return {
      people: d.people.map((p) => (p.id === subjectId ? { ...p, noMeeting: flag } : p)),
    };
  }
  if (subjectKind === "team") {
    return {
      teams: d.teams.map((t) => (t.id === subjectId ? { ...t, noMeeting: flag } : t)),
    };
  }
  return {
    managers: d.managers.map((m) => (m.id === subjectId ? { ...m, noMeeting: flag } : m)),
  };
}

/** Replace a meeting's rows. Topics in a row that's gone become untagged. */
export function setCurriculum(
  d: Doc,
  meetingId: string,
  curriculum: CurriculumSlot[] | undefined
): Patch {
  const slots = curriculum?.filter((s) => s.label.trim()) ?? [];
  const ids = new Set(slots.map((s) => s.id));
  return {
    meetings: d.meetings.map((m) =>
      m.id === meetingId ? { ...m, curriculum: slots.length ? slots : undefined } : m
    ),
    topics: d.topics.map((t) =>
      t.meetingId === meetingId && t.slotId && !ids.has(t.slotId)
        ? { ...t, slotId: undefined }
        : t
    ),
  };
}

/**
 * Add a row to a meeting's board, backed by the workspace tag of the same
 * name (made if it doesn't exist). Returns the row's id — the existing one
 * when a row by that name is already there.
 */
export function addMeetingRow(
  d: Doc,
  meetingId: string,
  label: string
): { patch: Patch; slotId: string } | undefined {
  const text = label.trim();
  if (!text) return undefined;
  const meeting = d.meetings.find((m) => m.id === meetingId);
  if (!meeting) return undefined;
  const curriculum = meeting.curriculum ?? [];
  const lower = text.toLowerCase();
  const existing = curriculum.find((c) => c.label.trim().toLowerCase() === lower);
  if (existing) return { patch: {}, slotId: existing.id };

  const slotId = uid();
  let tags = d.tags;
  let tag = tags.find((t) => t.label.trim().toLowerCase() === lower);
  if (!tag) {
    tag = { id: uid(), label: text, color: tags.length % 6, order: tags.length };
    tags = [...tags, tag];
  }
  const tagId = tag.id;
  const rowLabel = tag.label;
  return {
    slotId,
    patch: {
      tags,
      meetings: d.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              curriculum: [...(m.curriculum ?? []), { id: slotId, label: rowLabel, tagId }],
            }
          : m
      ),
      // Already tagged this? Then it already belongs in the row.
      topics: d.topics.map((t) =>
        t.meetingId === meetingId && !t.slotId && t.tagIds.includes(tagId)
          ? { ...t, slotId }
          : t
      ),
    },
  };
}

// ── Occurrences ───────────────────────────────────────────────────────────

export function addSession(d: Doc, id: string, o: Omit<Session, "id">): Patch {
  return { sessions: [...d.sessions, { ...o, id }] };
}

export function updateSession(d: Doc, id: string, patch: Partial<Session>): Patch {
  return { sessions: d.sessions.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
}

export function deleteSession(d: Doc, id: string): Patch {
  return {
    sessions: d.sessions.filter((o) => o.id !== id),
    // Anything planned for it goes back to the backlog rather than vanishing
    // into a slot that no longer exists.
    topics: d.topics.map((t) => (t.sessionId === id ? { ...t, sessionId: undefined } : t)),
  };
}

export function setMeetingWeekday(
  d: Doc,
  meetingId: string,
  weekday: number | undefined
): Patch {
  const meeting = d.meetings.find((m) => m.id === meetingId);
  if (!meeting) return {};
  const today = todayISO();
  // A one-off booking on the old day would keep overriding the new one.
  const nextDate =
    weekday !== undefined &&
    meeting.nextDate &&
    meeting.nextDate >= today &&
    weekdayOf(meeting.nextDate) !== weekday
      ? undefined
      : meeting.nextDate;
  const meetings = d.meetings.map((m) =>
    m.id === meetingId ? { ...m, anchorWeekday: weekday, nextDate } : m
  );
  if (weekday === undefined) return { meetings };

  // Only upcoming occurrences; a past meeting happened on the day it did.
  // Notes on a future one are prep (opening a week seeds an agenda), so
  // they travel with it.
  // Moved one-offs and extras are deliberate exceptions and stay put.
  const movable = d.sessions.filter(
    (o) =>
      o.meetingId === meetingId &&
      o.date >= today &&
      !o.kind &&
      !o.seriesDate &&
      weekdayOf(o.date) !== weekday
  );

  const shift = (iso: string) => {
    let next = addDaysISO(iso, weekday - weekdayOf(iso));
    if (next < today) next = addDaysISO(next, 7);
    return next;
  };
  // Exceptions name a series date; the series just moved, so follow it —
  // a skipped Monday becomes a skipped Tuesday, not a stray Tuesday meeting.
  let sessions = d.sessions.map((o) => {
    if (o.meetingId !== meetingId || !o.seriesDate || o.seriesDate < today) return o;
    const seriesDate = shift(o.seriesDate);
    if (seriesDate === o.seriesDate) return o;
    return o.kind === "skipped"
      ? { ...o, date: seriesDate, seriesDate }
      : { ...o, seriesDate: seriesDate === o.date ? undefined : seriesDate };
  });
  if (!movable.length) return { meetings, sessions };

  let topics = d.topics;
  for (const o of movable) {
    // Same week, new day; never into the past.
    let date = addDaysISO(o.date, weekday - weekdayOf(o.date));
    if (date < today) date = addDaysISO(date, 7);
    const clash = sessions.find(
      (x) => x.meetingId === meetingId && x.id !== o.id && x.date === date
    );
    if (clash) {
      // The target day is already booked: fold this one's topics into it.
      topics = topics.map((t) => (t.sessionId === o.id ? { ...t, sessionId: clash.id } : t));
      const extraNotes = o.notes?.trim();
      sessions = sessions
        .filter((x) => x.id !== o.id)
        .map((x) =>
          x.id === clash.id && extraNotes && extraNotes !== x.notes?.trim()
            ? { ...x, notes: [x.notes?.trim(), extraNotes].filter(Boolean).join("\n\n") }
            : x
        );
    } else {
      sessions = sessions.map((x) => (x.id === o.id ? { ...x, date } : x));
    }
  }
  return { meetings, sessions, topics };
}

/** An occurrence, named the way the planner knows it. */
export type OccurrenceRef = { sessionId: string | null; date: string };

/**
 * Move one occurrence — or, with `scope: "series"`, the weekday the whole
 * rhythm lands on. Returns the id of the occurrence now on `to`.
 */
export function moveOccurrence(
  d: Doc,
  meetingId: string,
  from: OccurrenceRef,
  to: string,
  scope: "one" | "series"
): { patch: Patch; sessionId: string } {
  let doc = d;
  if (scope === "series") {
    const weekday = weekdayOf(to);
    doc = apply(doc, setMeetingWeekday(doc, meetingId, weekday));
    // Re-anchoring carries booked weeks along within their week. When that
    // already put this occurrence on the requested day, we're done.
    const landed = doc.sessions.find(
      (o) => o.meetingId === meetingId && o.date === to && o.kind !== "skipped"
    );
    if (landed) return { patch: changed(d, doc), sessionId: landed.id };
    let sameWeek = addDaysISO(from.date, weekday - weekdayOf(from.date));
    if (sameWeek < todayISO()) sameWeek = addDaysISO(sameWeek, 7);
    if (!from.sessionId && sameWeek === to) {
      // The new rhythm draws this date itself; just make it real.
      const id = uid();
      doc = apply(doc, addSession(doc, id, { meetingId, date: to }));
      return { patch: changed(d, doc), sessionId: id };
    }
    // Otherwise it was asked to go to a different week as well: fall through
    // and move this one on top of the new rhythm.
    if (from.sessionId) {
      const moved = doc.sessions.find((o) => o.id === from.sessionId);
      if (moved) from = { sessionId: moved.id, date: moved.date };
    } else {
      from = { sessionId: null, date: sameWeek };
    }
  }

  let sessions = doc.sessions;
  let topics = doc.topics;
  let result: string;
  const current = from.sessionId
    ? sessions.find((o) => o.id === from.sessionId)
    : sessions.find(
        (o) => o.meetingId === meetingId && o.date === from.date && o.kind !== "skipped"
      );
  const seriesDate =
    current?.kind === "extra" ? undefined : (current?.seriesDate ?? current?.date ?? from.date);
  const clash = sessions.find(
    (o) =>
      o.meetingId === meetingId && o.date === to && o.kind !== "skipped" && o.id !== current?.id
  );
  if (clash) {
    // Something is already on that day: the two become one meeting.
    if (current) {
      topics = topics.map((t) => (t.sessionId === current.id ? { ...t, sessionId: clash.id } : t));
      // Keep any prep written on the one being folded in.
      const extraNotes = current.notes?.trim();
      sessions = sessions
        .filter((o) => o.id !== current.id)
        .map((o) =>
          o.id === clash.id && extraNotes && extraNotes !== o.notes?.trim()
            ? { ...o, notes: [o.notes?.trim(), extraNotes].filter(Boolean).join("\n\n") }
            : o
        );
    }
    result = clash.id;
  } else {
    const fields = {
      date: to,
      seriesDate: seriesDate && seriesDate !== to ? seriesDate : undefined,
    };
    if (current) {
      sessions = sessions.map((o) => (o.id === current.id ? { ...o, ...fields } : o));
      result = current.id;
    } else {
      result = uid();
      sessions = [...sessions, { id: result, meetingId, ...fields }];
    }
  }
  doc = apply(doc, { sessions, topics });
  return { patch: changed(d, doc), sessionId: result };
}

export function skipOccurrence(d: Doc, meetingId: string, from: OccurrenceRef): Patch {
  const current = from.sessionId
    ? d.sessions.find((o) => o.id === from.sessionId)
    : d.sessions.find((o) => o.meetingId === meetingId && o.date === from.date);
  // A past meeting that was written up happened. Nothing to skip.
  if (current?.notes?.trim() && current.date < todayISO()) return {};
  const topics = current
    ? d.topics.map((t) =>
        t.sessionId === current.id ? { ...t, sessionId: undefined, lane: "backlog" as const } : t
      )
    : d.topics;
  if (current?.kind === "extra") {
    // A one-off that isn't happening simply isn't there.
    return { topics, sessions: d.sessions.filter((o) => o.id !== current.id) };
  }
  const seriesDate = current?.seriesDate ?? current?.date ?? from.date;
  const skipped = { date: seriesDate, seriesDate, kind: "skipped" as const };
  return {
    topics,
    sessions: current
      ? d.sessions.map((o) => (o.id === current.id ? { ...o, ...skipped } : o))
      : [...d.sessions, { id: uid(), meetingId, ...skipped }],
  };
}

export function restoreOccurrence(d: Doc, sessionId: string): Patch {
  const o = d.sessions.find((x) => x.id === sessionId);
  if (!o) return {};
  if (o.kind === "skipped") {
    return { sessions: d.sessions.filter((x) => x.id !== sessionId) };
  }
  if (!o.seriesDate) return {};
  const clash = d.sessions.find(
    (x) => x.meetingId === o.meetingId && x.date === o.seriesDate && x.id !== o.id
  );
  if (clash) return {};
  return {
    sessions: d.sessions.map((x) =>
      x.id === sessionId ? { ...x, date: o.seriesDate!, seriesDate: undefined } : x
    ),
  };
}

/** A one-off outside the rhythm. Returns the existing occurrence if that day has one. */
export function addExtraOccurrence(
  d: Doc,
  meetingId: string,
  date: string
): { patch: Patch; sessionId: string } {
  const existing = d.sessions.find(
    (o) => o.meetingId === meetingId && o.date === date && o.kind !== "skipped"
  );
  if (existing) return { patch: {}, sessionId: existing.id };
  const id = uid();
  return {
    patch: { sessions: [...d.sessions, { id, meetingId, date, kind: "extra" }] },
    sessionId: id,
  };
}
