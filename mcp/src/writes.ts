import type {
  FollowUp,
  MeetingSubjectKind,
  Note,
  Session,
  Tag,
  TeamNote,
  Topic,
  TopicLane,
  TopicStatus,
  TrackedMeeting,
  Win,
} from "../../src/types";
import type { PersistedData } from "../../src/lib/persist";
import {
  findMeeting,
  findTag,
  parseCapture,
  reorderInto,
  splitCaptureLines,
} from "../../src/lib/ideas";
import { meetingSubjectName, todayISO } from "../../src/lib/readiness";
import { uid } from "./ids";

export function meetingLabel(
  meeting: TrackedMeeting,
  data: Pick<PersistedData, "people" | "teams" | "managers">
): string {
  return meeting.name?.trim() || meetingSubjectName(meeting, data) || meeting.id;
}

function labelOf(data: PersistedData) {
  return (m: TrackedMeeting) => meetingLabel(m, data);
}

function requireMeeting(data: PersistedData, meetingId: string): TrackedMeeting {
  const meeting = data.meetings.find((m) => m.id === meetingId);
  if (!meeting) throw new Error(`Unknown meeting: ${meetingId}`);
  return meeting;
}

function requireTopic(data: PersistedData, topicId: string): Topic {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) throw new Error(`Unknown topic: ${topicId}`);
  return topic;
}

function resolveTags(data: PersistedData, labels: string[]): {
  tagIds: string[];
  tags: Tag[];
} {
  let tags = data.tags;
  const tagIds: string[] = [];
  for (const label of labels) {
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
  return { tagIds, tags };
}

export type CaptureTarget = {
  meetingId?: string;
  sessionId?: string;
  lane?: TopicLane;
  slotId?: string;
};

export type CaptureResult = {
  data: PersistedData;
  created: Topic[];
  unresolvedMeetings: string[];
};

/** Same grammar as the Ideas capture bar: `#tag` `@meeting` `!` urgent. */
export function applyCapture(
  data: PersistedData,
  raw: string,
  target: CaptureTarget = {}
): CaptureResult {
  const lines = splitCaptureLines(raw);
  const created: Topic[] = [];
  const unresolvedMeetings: string[] = [];
  if (!lines.length) return { data, created, unresolvedMeetings };

  let tags = data.tags;
  let topics = data.topics;

  for (const line of lines) {
    const parsed = parseCapture(line);
    if (!parsed.text) continue;

    const resolved = resolveTags({ ...data, tags }, parsed.tagLabels);
    tags = resolved.tags;

    let meetingId = target.meetingId;
    if (parsed.meetingQuery) {
      const found =
        findMeeting(parsed.meetingQuery, data.meetings, labelOf(data)) ??
        data.meetings.find((m) => {
          const subject = meetingSubjectName(m, data)?.toLowerCase();
          return Boolean(subject && subject.includes(parsed.meetingQuery!));
        });
      if (found) meetingId = found.id;
      else unresolvedMeetings.push(parsed.meetingQuery);
    }

    const topic: Topic = {
      id: uid(),
      meetingId,
      text: parsed.text,
      status: "open",
      lane: target.lane ?? "backlog",
      sessionId: target.sessionId,
      slotId: target.slotId,
      tagIds: resolved.tagIds,
      urgent: parsed.urgent || undefined,
      carried: 0,
      carriedFrom: [],
      createdOn: todayISO(),
      order: 0,
    };
    topics = reorderInto([...topics, topic], topic);
    created.push(topic);
  }

  return {
    data: { ...data, tags, topics },
    created,
    unresolvedMeetings,
  };
}

export function applyUpdateTopic(
  data: PersistedData,
  topicId: string,
  patch: {
    text?: string;
    detail?: string | null;
    urgent?: boolean;
    status?: TopicStatus;
    lane?: TopicLane;
    dueDate?: string | null;
    tagLabels?: string[];
  }
): PersistedData {
  const topic = requireTopic(data, topicId);
  let tags = data.tags;
  let tagIds = topic.tagIds;
  if (patch.tagLabels) {
    const resolved = resolveTags(data, patch.tagLabels);
    tags = resolved.tags;
    tagIds = resolved.tagIds;
  }

  const next: Topic = {
    ...topic,
    text: patch.text?.trim() || topic.text,
    detail: patch.detail === null ? undefined : patch.detail ?? topic.detail,
    urgent: patch.urgent ?? topic.urgent,
    status: patch.status ?? topic.status,
    lane: patch.lane ?? topic.lane,
    dueDate: patch.dueDate === null ? undefined : patch.dueDate ?? topic.dueDate,
    tagIds,
    closedOn:
      patch.status === "open"
        ? undefined
        : patch.status
          ? todayISO()
          : topic.closedOn,
  };

  return {
    ...data,
    tags,
    topics: data.topics.map((t) => (t.id === topicId ? next : t)),
  };
}

export function applyPlaceTopic(
  data: PersistedData,
  topicId: string,
  target: {
    meetingId?: string;
    sessionId?: string;
    date?: string;
    lane?: TopicLane;
    slotId?: string;
  }
): PersistedData {
  const topic = requireTopic(data, topicId);
  let sessions = data.sessions;
  let sessionId: string | undefined;
  let slotId = target.slotId;
  let lane = topic.lane;
  let meetingId = target.meetingId ?? topic.meetingId;

  if (target.sessionId) {
    const session = data.sessions.find((s) => s.id === target.sessionId);
    if (!session) throw new Error(`Unknown session: ${target.sessionId}`);
    sessionId = session.id;
    meetingId = session.meetingId;
  } else if (target.date) {
    if (meetingId) requireMeeting(data, meetingId);
    const existing = sessions.find(
      (o) => o.meetingId === meetingId && o.date === target.date
    );
    if (existing) {
      sessionId = existing.id;
    } else if (meetingId) {
      sessionId = uid();
      sessions = [...sessions, { id: sessionId, meetingId, date: target.date }];
    }
  } else if (target.lane) {
    lane = target.lane;
  }

  if (sessionId) {
    const owner = sessions.find((o) => o.id === sessionId);
    if (owner) meetingId = owner.meetingId;
    lane = "backlog";
  }

  if (meetingId) requireMeeting(data, meetingId);

  const slot = data.meetings
    .find((m) => m.id === meetingId)
    ?.curriculum?.find((c) => c.id === slotId);
  const tagIds =
    slot?.tagId && !topic.tagIds.includes(slot.tagId)
      ? [...topic.tagIds, slot.tagId]
      : topic.tagIds;

  const moved: Topic = {
    ...topic,
    status: "open",
    closedOn: undefined,
    meetingId,
    sessionId,
    slotId,
    lane,
    tagIds,
    returnedOn: undefined,
    returnedFromDate: undefined,
  };

  return {
    ...data,
    sessions,
    topics: reorderInto(data.topics, moved),
  };
}

export function applyCoverTopic(
  data: PersistedData,
  topicId: string,
  covered = true
): PersistedData {
  requireTopic(data, topicId);
  return {
    ...data,
    topics: data.topics.map((t) =>
      t.id === topicId
        ? covered
          ? { ...t, status: "covered" as const, closedOn: todayISO() }
          : { ...t, status: "open" as const, closedOn: undefined }
        : t
    ),
  };
}

export function applyParkTopics(
  data: PersistedData,
  ids: string[],
  parked: boolean
): PersistedData {
  const set = new Set(ids);
  for (const id of ids) requireTopic(data, id);
  return {
    ...data,
    topics: data.topics.map((t) =>
      set.has(t.id) ? { ...t, lane: parked ? "parked" : "backlog" } : t
    ),
  };
}

export function applyAssignTopics(
  data: PersistedData,
  ids: string[],
  meetingId: string | null
): PersistedData {
  if (meetingId) requireMeeting(data, meetingId);
  const set = new Set(ids);
  for (const id of ids) requireTopic(data, id);
  return {
    ...data,
    topics: data.topics.map((t) =>
      set.has(t.id)
        ? { ...t, meetingId: meetingId ?? undefined, slotId: undefined }
        : t
    ),
  };
}

export function applyAddFollowUp(
  data: PersistedData,
  input: {
    text: string;
    meetingId?: string;
    subjectKind?: MeetingSubjectKind;
    subjectId?: string;
    sourceSessionId?: string;
  }
): { data: PersistedData; followUp: FollowUp } {
  const text = input.text.trim();
  if (!text) throw new Error("Follow-up text is empty.");

  let subjectKind = input.subjectKind;
  let subjectId = input.subjectId;
  let meetingId = input.meetingId;

  if (meetingId) {
    const meeting = requireMeeting(data, meetingId);
    subjectKind = meeting.subjectKind;
    subjectId = meeting.subjectId;
  }
  if (!subjectKind || !subjectId) {
    throw new Error("Provide meetingId, or both subjectKind and subjectId.");
  }

  const followUp: FollowUp = {
    id: uid(),
    subjectKind,
    subjectId,
    meetingId,
    text,
    status: "open",
    openedOn: todayISO(),
    sourceSessionId: input.sourceSessionId,
    order: data.followUps.length,
  };

  return {
    data: { ...data, followUps: [...data.followUps, followUp] },
    followUp,
  };
}

export function applyCompleteFollowUp(
  data: PersistedData,
  id: string,
  done = true
): PersistedData {
  const followUp = data.followUps.find((f) => f.id === id);
  if (!followUp) throw new Error(`Unknown follow-up: ${id}`);
  return {
    ...data,
    followUps: data.followUps.map((f) =>
      f.id === id
        ? {
            ...f,
            status: done ? "done" : "open",
            closedOn: done ? todayISO() : undefined,
          }
        : f
    ),
  };
}

export function applyPromoteTopic(
  data: PersistedData,
  topicId: string
): { data: PersistedData; followUp: FollowUp } {
  const topic = requireTopic(data, topicId);
  const meeting = topic.meetingId
    ? data.meetings.find((m) => m.id === topic.meetingId)
    : undefined;
  if (!meeting) {
    throw new Error("Topic has no meeting — assign it before promoting.");
  }
  const followUp: FollowUp = {
    id: uid(),
    subjectKind: meeting.subjectKind,
    subjectId: meeting.subjectId,
    meetingId: meeting.id,
    text: topic.text,
    status: "open",
    openedOn: todayISO(),
    sourceSessionId: topic.sessionId,
    order: data.followUps.length,
  };
  return {
    data: {
      ...data,
      followUps: [...data.followUps, followUp],
      topics: data.topics.map((t) =>
        t.id === topicId
          ? { ...t, status: "dropped" as const, closedOn: todayISO() }
          : t
      ),
    },
    followUp,
  };
}

export function applyLogSession(
  data: PersistedData,
  input: {
    meetingId: string;
    date: string;
    point?: string;
    notes?: string;
    transcript?: string;
    nextDate?: string;
    uncovered?: string[];
  }
): { data: PersistedData; session: Session; created: boolean } {
  requireMeeting(data, input.meetingId);
  const existing = data.sessions.find(
    (s) => s.meetingId === input.meetingId && s.date === input.date
  );
  if (existing) {
    const session: Session = {
      ...existing,
      point: input.point ?? existing.point,
      notes: input.notes
        ? [existing.notes, input.notes].filter(Boolean).join("\n\n")
        : existing.notes,
      transcript: input.transcript ?? existing.transcript,
      nextDate: input.nextDate ?? existing.nextDate,
      uncovered: input.uncovered ?? existing.uncovered,
    };
    return {
      data: {
        ...data,
        sessions: data.sessions.map((s) => (s.id === existing.id ? session : s)),
      },
      session,
      created: false,
    };
  }
  const session: Session = {
    id: uid(),
    meetingId: input.meetingId,
    date: input.date,
    point: input.point,
    notes: input.notes,
    transcript: input.transcript,
    nextDate: input.nextDate,
    uncovered: input.uncovered,
  };
  return {
    data: { ...data, sessions: [...data.sessions, session] },
    session,
    created: true,
  };
}

export function applyUpdateSession(
  data: PersistedData,
  sessionId: string,
  patch: Partial<Pick<Session, "point" | "notes" | "transcript" | "nextDate" | "uncovered" | "date">>
): PersistedData {
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);
  return {
    ...data,
    sessions: data.sessions.map((s) =>
      s.id === sessionId ? { ...s, ...patch } : s
    ),
  };
}

export function applyAddNote(
  data: PersistedData,
  personId: string,
  body: string
): { data: PersistedData; note: Note } {
  if (!data.people.some((p) => p.id === personId) && !data.managers.some((m) => m.id === personId)) {
    throw new Error(`Unknown person or manager: ${personId}`);
  }
  const note: Note = {
    id: uid(),
    personId,
    body: body.trim(),
    date: todayISO(),
  };
  if (!note.body) throw new Error("Note body is empty.");
  return { data: { ...data, notes: [...data.notes, note] }, note };
}

export function applyAddTeamNote(
  data: PersistedData,
  teamId: string,
  body: string
): { data: PersistedData; note: TeamNote } {
  if (!data.teams.some((t) => t.id === teamId)) {
    throw new Error(`Unknown team: ${teamId}`);
  }
  const note: TeamNote = {
    id: uid(),
    teamId,
    body: body.trim(),
    date: todayISO(),
  };
  if (!note.body) throw new Error("Note body is empty.");
  return { data: { ...data, teamNotes: [...data.teamNotes, note] }, note };
}

export function applyAddWin(
  data: PersistedData,
  personId: string,
  text: string,
  impact?: string
): { data: PersistedData; win: Win } {
  const person =
    data.people.find((p) => p.id === personId) ||
    data.managers.find((m) => m.id === personId);
  if (!person) throw new Error(`Unknown person or manager: ${personId}`);
  const win: Win = {
    id: uid(),
    personId,
    date: todayISO(),
    text: text.trim(),
    impact,
  };
  if (!win.text) throw new Error("Win text is empty.");
  return { data: { ...data, wins: [...data.wins, win] }, win };
}
