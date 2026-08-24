import { useCallback, useMemo, useReducer, useRef } from "react";
import { parseCapture, splitCaptureLines } from "./capture";
import { seedLabState } from "./fixtures";
import {
  addDays,
  applyCarryOver,
  applyReturns,
  plannedSlots,
  slotKey,
} from "./slots";
import {
  resolveMeetingQuery,
  resolveTagLabel,
  suggestMeeting,
  suggestTags,
} from "./suggest";
import type {
  LabCarryMode,
  LabFollowUp,
  LabSection,
  LabSession,
  LabState,
  LabSurface,
  LabTag,
  LabTopic,
} from "./types";
import { UNSORTED } from "./types";

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * Where a card can land. Ideas / parked are per-meeting rails; a session target
 * may name an existing occurrence or a projected date that has to be booked on
 * the way in.
 */
export type DropTarget =
  | { kind: "ideas"; meetingId?: string }
  | { kind: "parked"; meetingId: string }
  | {
      kind: "session";
      meetingId: string;
      sessionId?: string;
      date?: string;
      sectionId?: string;
    };

type Action =
  | { type: "setSurface"; surface: LabSurface }
  | { type: "selectMeeting"; meetingId: string }
  | { type: "selectSlot"; slotKey: string | null }
  | { type: "setCaptureOpen"; open: boolean }
  | { type: "setQuickAssign"; topicId: string | null }
  | { type: "setOpenTopic"; topicId: string | null }
  | { type: "capture"; raw: string }
  | { type: "addTopic"; raw: string; target: DropTarget; index?: number }
  | { type: "updateTopic"; id: string; patch: Partial<LabTopic> }
  | { type: "moveTopic"; id: string; target: DropTarget; index?: number }
  | {
      type: "placeTopic";
      id: string;
      meetingId: string;
      sessionId?: string;
      lane?: "backlog" | "parked";
    }
  | {
      type: "carryTopic";
      id: string;
      meetingId: string;
      sessionId?: string;
      date?: string;
      fromSessionId?: string;
    }
  | { type: "coverTopic"; id: string; covered: boolean }
  | { type: "returnTopic"; id: string }
  | { type: "deleteTopic"; id: string }
  | { type: "acceptSuggestion"; id: string }
  | { type: "dismissSuggestion"; id: string }
  | { type: "ensureSession"; meetingId: string; date: string; sessionId: string }
  | { type: "updateSession"; id: string; patch: Partial<LabSession> }
  | { type: "addFollowUp"; followUp: Omit<LabFollowUp, "id"> }
  | { type: "toggleFollowUp"; id: string }
  | { type: "promoteToFollowUp"; topicId: string }
  | { type: "runCarryOver"; meetingId: string }
  | { type: "runReturns" }
  | { type: "setToday"; date: string }
  | { type: "setCarryMode"; mode: LabCarryMode }
  | { type: "setNotice"; notice: string | null }
  | { type: "addSection"; meetingId: string; label: string }
  | {
      type: "updateSection";
      meetingId: string;
      sectionId: string;
      patch: Partial<LabSection>;
    }
  | { type: "moveSection"; meetingId: string; sectionId: string; direction: -1 | 1 }
  | { type: "reorderSection"; meetingId: string; sectionId: string; index: number }
  | { type: "deleteSection"; meetingId: string; sectionId: string }
  | { type: "applyPreset"; meetingId: string; presetId: string }
  | { type: "savePreset"; meetingId: string; label: string }
  | { type: "createTag"; label: string; id: string }
  | { type: "updateTag"; id: string; patch: Partial<LabTag> }
  | { type: "deleteTag"; id: string }
  | { type: "tagTopics"; ids: string[]; tagId: string; on: boolean }
  | { type: "assignTopics"; ids: string[]; meetingId: string | null }
  | { type: "parkTopics"; ids: string[]; parked: boolean }
  | { type: "deleteTopics"; ids: string[] }
  | { type: "replace"; state: LabState };

const today0 = () => new Date().toISOString().slice(0, 10);

function ensureSessionInState(
  state: LabState,
  meetingId: string,
  date: string
): { state: LabState; sessionId: string } {
  const existing = state.sessions.find(
    (s) => s.meetingId === meetingId && s.date === date
  );
  if (existing) return { state, sessionId: existing.id };
  const sessionId = newId();
  return {
    state: {
      ...state,
      sessions: [...state.sessions, { id: sessionId, meetingId, date }],
    },
    sessionId,
  };
}

/** The bucket a topic sorts within — order is only ever compared inside one. */
function bucketOf(t: LabTopic): string {
  if (t.sessionId) return `s:${t.sessionId}/${t.sectionId ?? UNSORTED}`;
  if (t.lane === "parked") return `parked:${t.meetingId ?? "-"}`;
  return `ideas:${t.meetingId ?? "-"}`;
}

/**
 * Move one topic to a bucket at a given index and renumber that bucket.
 *
 * Order used to be a single global counter, which was fine when a column was an
 * unordered pile. A template turns each band into a running order, so the
 * numbers have to be dense and local; renumbering on every drop keeps them so
 * without a fractional-index scheme the prototype doesn't need yet.
 */
function reorderInto(
  topics: LabTopic[],
  moved: LabTopic,
  index: number | undefined
): LabTopic[] {
  const bucket = bucketOf(moved);
  const others = topics
    .filter((t) => t.id !== moved.id && bucketOf(t) === bucket)
    .sort((a, b) => a.order - b.order);
  const at = Math.max(0, Math.min(index ?? others.length, others.length));
  const ordered = [...others.slice(0, at), moved, ...others.slice(at)];
  const orderById = new Map(ordered.map((t, i) => [t.id, i]));
  return topics.map((t) => {
    if (t.id === moved.id) return { ...moved, order: orderById.get(t.id) ?? 0 };
    const next = orderById.get(t.id);
    return next === undefined ? t : { ...t, order: next };
  });
}

/** Apply a drop target to a topic, booking a session if the slot is projected. */
function applyTarget(
  state: LabState,
  topic: LabTopic,
  target: DropTarget,
  index: number | undefined
): LabState {
  let next = state;
  let patched: LabTopic;

  if (target.kind === "ideas" || target.kind === "parked") {
    patched = {
      ...topic,
      meetingId: target.meetingId ?? topic.meetingId,
      sessionId: undefined,
      lastSectionId: topic.sectionId ?? topic.lastSectionId,
      sectionId: undefined,
      lane: target.kind === "parked" ? "parked" : "backlog",
      // Placing it by hand is a decision — it stops reading as "came back".
      returnedOn: undefined,
      returnedFromDate: undefined,
    };
  } else {
    let sessionId = target.sessionId;
    if (!sessionId && target.date) {
      const r = ensureSessionInState(next, target.meetingId, target.date);
      next = r.state;
      sessionId = r.sessionId;
    }
    if (!sessionId) return state;
    const meeting = next.meetings.find((m) => m.id === target.meetingId);
    const section = meeting?.template.find((s) => s.id === target.sectionId);
    // A band with a tag stamps it on arrival — that is what makes coverage
    // trustworthy without anyone tagging by hand.
    const tagIds =
      section?.tagId && !topic.tagIds.includes(section.tagId)
        ? [...topic.tagIds, section.tagId]
        : topic.tagIds;
    patched = {
      ...topic,
      meetingId: target.meetingId,
      sessionId,
      sectionId:
        target.sectionId && target.sectionId !== UNSORTED
          ? target.sectionId
          : undefined,
      tagIds,
      lane: "backlog",
      returnedOn: undefined,
      returnedFromDate: undefined,
    };
  }

  return { ...next, topics: reorderInto(next.topics, patched, index) };
}

function parseIntoTopic(
  state: LabState,
  raw: string,
  base: Partial<LabTopic>
): { topic: LabTopic; tags: LabTag[] } | null {
  const parsed = parseCapture(raw);
  if (!parsed.text) return null;
  let tags = state.tags;
  const tagIds: string[] = [];
  for (const label of parsed.tagLabels) {
    const existing = resolveTagLabel(label, tags);
    if (existing) {
      tagIds.push(existing.id);
      continue;
    }
    // Tags are created on the fly — being made to open a settings screen
    // mid-thought is how a capture box stops getting used.
    const tag: LabTag = {
      id: newId(),
      label: label.charAt(0).toUpperCase() + label.slice(1),
      color: tags.length % 6,
    };
    tags = [...tags, tag];
    tagIds.push(tag.id);
  }
  let meetingId = base.meetingId;
  if (parsed.meetingQuery) {
    const m = resolveMeetingQuery(parsed.meetingQuery, state.meetings);
    if (m) meetingId = m.id;
  }
  const ctx = { tags, meetings: state.meetings, topics: state.topics };
  const sugTags =
    tagIds.length === 0 && !base.sectionId
      ? suggestTags(parsed.text, ctx).map((s) => s.id)
      : [];
  const sugMeeting = !meetingId ? suggestMeeting(parsed.text, ctx)?.id : undefined;

  return {
    tags,
    topic: {
      id: newId(),
      text: parsed.text,
      status: "open",
      lane: "backlog",
      tagIds,
      urgent: parsed.urgent || undefined,
      carried: 0,
      carriedFrom: [],
      suggestedMeetingId: sugMeeting,
      suggestedTagIds: sugTags,
      createdOn: state.today,
      order: 0,
      ...base,
      meetingId,
    },
  };
}

function reducer(state: LabState, action: Action): LabState {
  switch (action.type) {
    case "replace":
      return action.state;
    case "setSurface":
      return { ...state, surface: action.surface };
    case "selectMeeting":
      return {
        ...state,
        activeMeetingId: action.meetingId,
        surface: "planner",
        activeSlotKey: null,
      };
    case "selectSlot":
      return { ...state, activeSlotKey: action.slotKey };
    case "setCaptureOpen":
      return { ...state, captureOpen: action.open };
    case "setQuickAssign":
      return { ...state, quickAssignTopicId: action.topicId };
    case "setOpenTopic":
      return { ...state, openTopicId: action.topicId };
    case "setNotice":
      return { ...state, notice: action.notice };
    case "capture": {
      const lines = splitCaptureLines(action.raw);
      if (!lines.length) return state;
      let next = state;
      const maxOrder = next.topics.reduce((m, t) => Math.max(m, t.order), 0);
      let order = maxOrder + 1;
      const added: LabTopic[] = [];
      for (const line of lines) {
        const made = parseIntoTopic(next, line, { order: order++ });
        if (!made) continue;
        next = { ...next, tags: made.tags };
        added.push(made.topic);
      }
      if (!added.length) return state;
      return { ...next, topics: [...next.topics, ...added], captureOpen: false };
    }
    case "addTopic": {
      // Born in place: the section you typed into is the section it lands in.
      const target = action.target;
      const base: Partial<LabTopic> =
        target.kind === "session"
          ? {
              meetingId: target.meetingId,
              sectionId:
                target.sectionId && target.sectionId !== UNSORTED
                  ? target.sectionId
                  : undefined,
            }
          : { meetingId: target.meetingId, lane: target.kind === "parked" ? "parked" : "backlog" };
      const made = parseIntoTopic(state, action.raw, base);
      if (!made) return state;
      const seeded = { ...state, tags: made.tags, topics: [...state.topics, made.topic] };
      return applyTarget(seeded, made.topic, target, action.index);
    }
    case "updateTopic":
      return {
        ...state,
        topics: state.topics.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t
        ),
      };
    case "moveTopic": {
      const topic = state.topics.find((t) => t.id === action.id);
      if (!topic) return state;
      return {
        ...applyTarget(state, topic, action.target, action.index),
        quickAssignTopicId: null,
      };
    }
    case "placeTopic": {
      const topic = state.topics.find((t) => t.id === action.id);
      if (!topic) return state;
      const target: DropTarget = action.sessionId
        ? {
            kind: "session",
            meetingId: action.meetingId,
            sessionId: action.sessionId,
            sectionId: topic.lastSectionId,
          }
        : {
            kind: action.lane === "parked" ? "parked" : "ideas",
            meetingId: action.meetingId,
          };
      return {
        ...applyTarget(state, topic, target, undefined),
        quickAssignTopicId: null,
      };
    }
    case "carryTopic": {
      let sessions = state.sessions;
      let sessionId = action.sessionId;
      if (!sessionId) {
        const existing = sessions.find(
          (s) => s.meetingId === action.meetingId && s.date === action.date
        );
        if (existing) {
          sessionId = existing.id;
        } else {
          sessionId = newId();
          sessions = [
            ...sessions,
            { id: sessionId, meetingId: action.meetingId, date: action.date! },
          ];
        }
      }
      return {
        ...state,
        sessions,
        topics: state.topics.map((t) =>
          t.id === action.id
            ? {
                ...t,
                meetingId: action.meetingId,
                sessionId,
                carried: t.carried + 1,
                carriedFrom: action.fromSessionId
                  ? [...t.carriedFrom, action.fromSessionId]
                  : t.carriedFrom,
              }
            : t
        ),
      };
    }
    case "coverTopic":
      return {
        ...state,
        topics: state.topics.map((t) =>
          t.id === action.id
            ? {
                ...t,
                status: action.covered ? "covered" : "open",
                closedOn: action.covered ? state.today : undefined,
              }
            : t
        ),
      };
    case "returnTopic": {
      // Manual version of what the clock does automatically.
      const topic = state.topics.find((t) => t.id === action.id);
      if (!topic?.sessionId) return state;
      const session = state.sessions.find((s) => s.id === topic.sessionId);
      const patched: LabTopic = {
        ...topic,
        sessionId: undefined,
        lastSectionId: topic.sectionId,
        sectionId: undefined,
        lane: "backlog",
        carried: topic.carried + 1,
        carriedFrom: [...topic.carriedFrom, topic.sessionId],
        returnedOn: state.today,
        returnedFromDate: session?.date,
      };
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === session?.id
            ? { ...s, uncovered: [...new Set([...(s.uncovered ?? []), topic.text])] }
            : s
        ),
        topics: reorderInto(state.topics, patched, 0),
      };
    }
    case "deleteTopic":
      return { ...state, topics: state.topics.filter((t) => t.id !== action.id) };
    case "acceptSuggestion":
      return {
        ...state,
        topics: state.topics.map((t) => {
          if (t.id !== action.id) return t;
          return {
            ...t,
            meetingId: t.meetingId ?? t.suggestedMeetingId,
            tagIds: t.tagIds.length > 0 ? t.tagIds : (t.suggestedTagIds ?? []),
            suggestedMeetingId: undefined,
            suggestedTagIds: undefined,
          };
        }),
      };
    case "dismissSuggestion":
      return {
        ...state,
        topics: state.topics.map((t) =>
          t.id === action.id
            ? { ...t, suggestedMeetingId: undefined, suggestedTagIds: undefined }
            : t
        ),
      };
    case "ensureSession": {
      if (state.sessions.some((s) => s.id === action.sessionId)) return state;
      return {
        ...state,
        sessions: [
          ...state.sessions,
          { id: action.sessionId, meetingId: action.meetingId, date: action.date },
        ],
      };
    }
    case "updateSession":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s
        ),
      };
    case "addFollowUp":
      return {
        ...state,
        followUps: [...state.followUps, { ...action.followUp, id: newId() }],
      };
    case "toggleFollowUp":
      return {
        ...state,
        followUps: state.followUps.map((f) => {
          if (f.id !== action.id) return f;
          const done = f.status === "open";
          return {
            ...f,
            status: done ? "done" : "open",
            closedOn: done ? state.today : undefined,
          };
        }),
      };
    case "promoteToFollowUp": {
      const topic = state.topics.find((t) => t.id === action.topicId);
      if (!topic?.meetingId) return state;
      const meeting = state.meetings.find((m) => m.id === topic.meetingId);
      if (!meeting) return state;
      const followUp: LabFollowUp = {
        id: newId(),
        subjectKind: meeting.subjectKind,
        subjectId: meeting.subjectId,
        meetingId: meeting.id,
        text: topic.text,
        status: "open",
        openedOn: state.today,
        sourceSessionId: topic.sessionId,
      };
      return {
        ...state,
        followUps: [...state.followUps, followUp],
        topics: state.topics.map((t) =>
          t.id === action.topicId
            ? { ...t, status: "dropped", closedOn: state.today }
            : t
        ),
      };
    }
    case "runCarryOver": {
      const meeting = state.meetings.find((m) => m.id === action.meetingId);
      if (!meeting) return state;
      let sessions = state.sessions;
      const topics = applyCarryOver(
        meeting,
        sessions,
        state.topics,
        (date) => {
          const r = ensureSessionInState({ ...state, sessions }, meeting.id, date);
          sessions = r.state.sessions;
          return r.sessionId;
        },
        state.today
      );
      return { ...state, sessions, topics };
    }
    case "runReturns": {
      const r = applyReturns(state.sessions, state.topics, state.today);
      if (!r.returned.length) return state;
      const n = r.returned.length;
      return {
        ...state,
        sessions: r.sessions,
        topics: r.topics,
        notice: `${n} unchecked topic${n === 1 ? "" : "s"} came back to Ideas.`,
      };
    }
    case "setToday":
      return { ...state, today: action.date };
    case "setCarryMode":
      return { ...state, carryMode: action.mode };
    case "addSection": {
      const label = action.label.trim();
      if (!label) return state;
      return {
        ...state,
        meetings: state.meetings.map((m) =>
          m.id === action.meetingId
            ? { ...m, template: [...m.template, { id: newId(), label }] }
            : m
        ),
      };
    }
    case "updateSection":
      return {
        ...state,
        meetings: state.meetings.map((m) =>
          m.id === action.meetingId
            ? {
                ...m,
                template: m.template.map((s) =>
                  s.id === action.sectionId ? { ...s, ...action.patch } : s
                ),
              }
            : m
        ),
      };
    case "moveSection":
      return {
        ...state,
        meetings: state.meetings.map((m) => {
          if (m.id !== action.meetingId) return m;
          const i = m.template.findIndex((s) => s.id === action.sectionId);
          const j = i + action.direction;
          if (i < 0 || j < 0 || j >= m.template.length) return m;
          const template = [...m.template];
          [template[i], template[j]] = [template[j], template[i]];
          return { ...m, template };
        }),
      };
    case "reorderSection":
      return {
        ...state,
        meetings: state.meetings.map((m) => {
          if (m.id !== action.meetingId) return m;
          const i = m.template.findIndex((s) => s.id === action.sectionId);
          if (i < 0) return m;
          const rest = m.template.filter((s) => s.id !== action.sectionId);
          const at = Math.max(0, Math.min(action.index, rest.length));
          return {
            ...m,
            template: [...rest.slice(0, at), m.template[i], ...rest.slice(at)],
          };
        }),
      };
    case "deleteSection":
      return {
        ...state,
        meetings: state.meetings.map((m) =>
          m.id === action.meetingId
            ? { ...m, template: m.template.filter((s) => s.id !== action.sectionId) }
            : m
        ),
        // Topics survive their band — they fall into the column's catch-all.
        topics: state.topics.map((t) =>
          t.sectionId === action.sectionId
            ? { ...t, sectionId: undefined, lastSectionId: undefined }
            : t
        ),
      };
    case "applyPreset": {
      const preset = state.presets.find((p) => p.id === action.presetId);
      if (!preset) return state;
      const meeting = state.meetings.find((m) => m.id === action.meetingId);
      if (!meeting) return state;
      // Match by label so topics already filed under "Training" stay put when a
      // preset is re-applied.
      const byLabel = new Map(
        meeting.template.map((s) => [s.label.toLowerCase(), s])
      );
      const template: LabSection[] = preset.sections.map((s) => {
        const existing = byLabel.get(s.label.toLowerCase());
        return existing
          ? { ...existing, tagId: s.tagId, minutes: s.minutes }
          : { id: newId(), ...s };
      });
      const kept = new Set(template.map((s) => s.id));
      return {
        ...state,
        meetings: state.meetings.map((m) =>
          m.id === action.meetingId ? { ...m, template } : m
        ),
        topics: state.topics.map((t) =>
          t.sectionId && !kept.has(t.sectionId)
            ? { ...t, sectionId: undefined, lastSectionId: t.sectionId }
            : t
        ),
      };
    }
    case "savePreset": {
      const meeting = state.meetings.find((m) => m.id === action.meetingId);
      if (!meeting || !action.label.trim()) return state;
      return {
        ...state,
        presets: [
          ...state.presets,
          {
            id: newId(),
            label: action.label.trim(),
            sections: meeting.template.map((s) => ({
              label: s.label,
              tagId: s.tagId,
              minutes: s.minutes,
            })),
          },
        ],
      };
    }
    case "updateTag":
      return {
        ...state,
        tags: state.tags.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t
        ),
      };
    case "deleteTag":
      return {
        ...state,
        tags: state.tags.filter((t) => t.id !== action.id),
        topics: state.topics.map((t) =>
          t.tagIds.includes(action.id)
            ? { ...t, tagIds: t.tagIds.filter((id) => id !== action.id) }
            : t
        ),
        // A band pointing at a dead tag would silently stop stamping.
        meetings: state.meetings.map((m) => ({
          ...m,
          template: m.template.map((s) =>
            s.tagId === action.id ? { ...s, tagId: undefined } : s
          ),
          coverageTargets: m.coverageTargets.filter(
            (c) => c.tagId !== action.id
          ),
        })),
      };
    case "tagTopics": {
      const ids = new Set(action.ids);
      return {
        ...state,
        topics: state.topics.map((t) => {
          if (!ids.has(t.id)) return t;
          const has = t.tagIds.includes(action.tagId);
          if (action.on === has) return t;
          return {
            ...t,
            tagIds: action.on
              ? [...t.tagIds, action.tagId]
              : t.tagIds.filter((id) => id !== action.tagId),
          };
        }),
      };
    }
    case "assignTopics": {
      const ids = new Set(action.ids);
      return {
        ...state,
        topics: state.topics.map((t) =>
          ids.has(t.id)
            ? {
                ...t,
                meetingId: action.meetingId ?? undefined,
                suggestedMeetingId: undefined,
              }
            : t
        ),
      };
    }
    case "parkTopics": {
      const ids = new Set(action.ids);
      return {
        ...state,
        topics: state.topics.map((t) =>
          ids.has(t.id)
            ? { ...t, lane: action.parked ? "parked" : "backlog" }
            : t
        ),
      };
    }
    case "deleteTopics": {
      const ids = new Set(action.ids);
      return { ...state, topics: state.topics.filter((t) => !ids.has(t.id)) };
    }
    case "createTag":
      return {
        ...state,
        tags: [
          ...state.tags,
          {
            id: action.id,
            label: action.label,
            color: state.tags.length % 6,
          },
        ],
      };
    default:
      return state;
  }
}

export type LabApi = {
  state: LabState;
  undo: () => void;
  canUndo: boolean;
  setSurface: (s: LabSurface) => void;
  selectMeeting: (id: string) => void;
  selectSlot: (key: string | null) => void;
  openCapture: () => void;
  closeCapture: () => void;
  capture: (raw: string) => void;
  addTopic: (raw: string, target: DropTarget, index?: number) => void;
  updateTopic: (id: string, patch: Partial<LabTopic>) => void;
  moveTopic: (id: string, target: DropTarget, index?: number) => void;
  placeTopic: (
    id: string,
    opts: { meetingId: string; sessionId?: string; lane?: "backlog" | "parked" }
  ) => void;
  carryTopic: (
    id: string,
    opts: {
      meetingId: string;
      sessionId?: string;
      date?: string;
      fromSessionId?: string;
    }
  ) => void;
  coverTopic: (id: string, covered: boolean) => void;
  returnTopic: (id: string) => void;
  deleteTopic: (id: string) => void;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
  openQuickAssign: (topicId: string) => void;
  closeQuickAssign: () => void;
  openTopic: (topicId: string) => void;
  closeTopic: () => void;
  newPointId: () => string;
  ensureAndPlace: (topicId: string, meetingId: string, date: string) => void;
  openRun: (
    meetingId: string,
    slot: { sessionId: string | null; date: string }
  ) => void;
  updateSession: (id: string, patch: Partial<LabSession>) => void;
  addFollowUp: (text: string, meetingId: string, sessionId?: string) => void;
  toggleFollowUp: (id: string) => void;
  promoteToFollowUp: (topicId: string) => void;
  runCarryOver: (meetingId: string) => void;
  runReturns: () => void;
  setToday: (date: string) => void;
  advanceDays: (n: number) => void;
  setCarryMode: (mode: LabCarryMode) => void;
  dismissNotice: () => void;
  addSection: (meetingId: string, label: string) => void;
  updateSection: (
    meetingId: string,
    sectionId: string,
    patch: Partial<LabSection>
  ) => void;
  moveSection: (meetingId: string, sectionId: string, direction: -1 | 1) => void;
  reorderSection: (meetingId: string, sectionId: string, index: number) => void;
  deleteSection: (meetingId: string, sectionId: string) => void;
  applyPreset: (meetingId: string, presetId: string) => void;
  savePreset: (meetingId: string, label: string) => void;
  createTag: (label: string) => void;
  updateTag: (id: string, patch: Partial<LabTag>) => void;
  deleteTag: (id: string) => void;
  tagTopics: (ids: string[], tagId: string, on: boolean) => void;
  assignTopics: (ids: string[], meetingId: string | null) => void;
  parkTopics: (ids: string[], parked: boolean) => void;
  deleteTopics: (ids: string[]) => void;
  moveTopicToAdjacent: (
    topicId: string,
    direction: -1 | 1,
    meetingId: string
  ) => void;
  nudgeTopic: (topicId: string, direction: -1 | 1) => void;
};

export function useLabStore(): LabApi {
  const [state, dispatch] = useReducer(reducer, undefined, seedLabState);
  const history = useRef<LabState[]>([]);

  const push = useCallback(
    (action: Action) => {
      history.current = [...history.current.slice(-40), state];
      dispatch(action);
    },
    [state]
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (prev) dispatch({ type: "replace", state: prev });
  }, []);

  return useMemo<LabApi>(
    () => ({
      state,
      undo,
      canUndo: history.current.length > 0,
      setSurface: (surface) => push({ type: "setSurface", surface }),
      selectMeeting: (meetingId) => push({ type: "selectMeeting", meetingId }),
      selectSlot: (slotKey) => push({ type: "selectSlot", slotKey }),
      openCapture: () => push({ type: "setCaptureOpen", open: true }),
      closeCapture: () => push({ type: "setCaptureOpen", open: false }),
      capture: (raw) => push({ type: "capture", raw }),
      addTopic: (raw, target, index) =>
        push({ type: "addTopic", raw, target, index }),
      updateTopic: (id, patch) => push({ type: "updateTopic", id, patch }),
      moveTopic: (id, target, index) =>
        push({ type: "moveTopic", id, target, index }),
      placeTopic: (id, opts) =>
        push({
          type: "placeTopic",
          id,
          meetingId: opts.meetingId,
          sessionId: opts.sessionId,
          lane: opts.lane,
        }),
      carryTopic: (id, opts) =>
        push({
          type: "carryTopic",
          id,
          meetingId: opts.meetingId,
          sessionId: opts.sessionId,
          date: opts.date,
          fromSessionId: opts.fromSessionId,
        }),
      coverTopic: (id, covered) => push({ type: "coverTopic", id, covered }),
      returnTopic: (id) => push({ type: "returnTopic", id }),
      deleteTopic: (id) => push({ type: "deleteTopic", id }),
      acceptSuggestion: (id) => push({ type: "acceptSuggestion", id }),
      dismissSuggestion: (id) => push({ type: "dismissSuggestion", id }),
      openQuickAssign: (topicId) => push({ type: "setQuickAssign", topicId }),
      closeQuickAssign: () => push({ type: "setQuickAssign", topicId: null }),
      openTopic: (topicId) => dispatch({ type: "setOpenTopic", topicId }),
      closeTopic: () => dispatch({ type: "setOpenTopic", topicId: null }),
      newPointId: () => newId(),
      ensureAndPlace: (topicId, meetingId, date) =>
        push({
          type: "moveTopic",
          id: topicId,
          target: { kind: "session", meetingId, date },
        }),
      openRun: (meetingId, slot) => {
        history.current = [...history.current.slice(-40), state];
        let sessionId = slot.sessionId;
        if (!sessionId) {
          sessionId = newId();
          dispatch({
            type: "ensureSession",
            meetingId,
            date: slot.date,
            sessionId,
          });
        }
        dispatch({ type: "selectMeeting", meetingId });
        dispatch({ type: "selectSlot", slotKey: `s:${sessionId}` });
        dispatch({ type: "setSurface", surface: "run" });
      },
      updateSession: (id, patch) => push({ type: "updateSession", id, patch }),
      addFollowUp: (text, meetingId, sessionId) => {
        const meeting = state.meetings.find((m) => m.id === meetingId);
        if (!meeting || !text.trim()) return;
        push({
          type: "addFollowUp",
          followUp: {
            subjectKind: meeting.subjectKind,
            subjectId: meeting.subjectId,
            meetingId,
            text: text.trim(),
            status: "open",
            openedOn: state.today,
            sourceSessionId: sessionId,
          },
        });
      },
      toggleFollowUp: (id) => push({ type: "toggleFollowUp", id }),
      promoteToFollowUp: (topicId) => push({ type: "promoteToFollowUp", topicId }),
      runCarryOver: (meetingId) => push({ type: "runCarryOver", meetingId }),
      runReturns: () => push({ type: "runReturns" }),
      setToday: (date) => push({ type: "setToday", date }),
      advanceDays: (n) => push({ type: "setToday", date: addDays(state.today, n) }),
      setCarryMode: (mode) => push({ type: "setCarryMode", mode }),
      dismissNotice: () => dispatch({ type: "setNotice", notice: null }),
      addSection: (meetingId, label) =>
        push({ type: "addSection", meetingId, label }),
      updateSection: (meetingId, sectionId, patch) =>
        push({ type: "updateSection", meetingId, sectionId, patch }),
      moveSection: (meetingId, sectionId, direction) =>
        push({ type: "moveSection", meetingId, sectionId, direction }),
      reorderSection: (meetingId, sectionId, index) =>
        push({ type: "reorderSection", meetingId, sectionId, index }),
      deleteSection: (meetingId, sectionId) =>
        push({ type: "deleteSection", meetingId, sectionId }),
      applyPreset: (meetingId, presetId) =>
        push({ type: "applyPreset", meetingId, presetId }),
      savePreset: (meetingId, label) =>
        push({ type: "savePreset", meetingId, label }),
      createTag: (label) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        push({ type: "createTag", label: trimmed, id: newId() });
      },
      updateTag: (id, patch) => push({ type: "updateTag", id, patch }),
      deleteTag: (id) => push({ type: "deleteTag", id }),
      tagTopics: (ids, tagId, on) =>
        push({ type: "tagTopics", ids, tagId, on }),
      assignTopics: (ids, meetingId) =>
        push({ type: "assignTopics", ids, meetingId }),
      parkTopics: (ids, parked) => push({ type: "parkTopics", ids, parked }),
      deleteTopics: (ids) => push({ type: "deleteTopics", ids }),
      /** ← / → across the week strip, keeping the band it sat in. */
      moveTopicToAdjacent: (topicId, direction, meetingId) => {
        const meeting = state.meetings.find((m) => m.id === meetingId);
        const topic = state.topics.find((t) => t.id === topicId);
        if (!meeting || !topic) return;
        const slots = plannedSlots(
          meeting,
          state.sessions,
          state.topics,
          state.today
        );
        const keys = ["ideas", ...slots.map((s) => slotKey(s)), "parked"];
        const current = topic.sessionId
          ? `s:${topic.sessionId}`
          : topic.lane === "parked"
            ? "parked"
            : "ideas";
        const idx = keys.indexOf(current);
        if (idx < 0) return;
        const nextIdx = idx + direction;
        if (nextIdx < 0 || nextIdx >= keys.length) return;
        const dest = keys[nextIdx];
        const sectionId = topic.sectionId ?? topic.lastSectionId;
        if (dest === "ideas") {
          push({ type: "moveTopic", id: topicId, target: { kind: "ideas", meetingId } });
        } else if (dest === "parked") {
          push({ type: "moveTopic", id: topicId, target: { kind: "parked", meetingId } });
        } else if (dest.startsWith("s:")) {
          push({
            type: "moveTopic",
            id: topicId,
            target: {
              kind: "session",
              meetingId,
              sessionId: dest.slice(2),
              sectionId,
            },
          });
        } else if (dest.startsWith("p:")) {
          push({
            type: "moveTopic",
            id: topicId,
            target: {
              kind: "session",
              meetingId,
              date: dest.slice(2),
              sectionId,
            },
          });
        }
      },
      /** ↑ / ↓ within the band — the keyboard path for running order. */
      nudgeTopic: (topicId, direction) => {
        const topic = state.topics.find((t) => t.id === topicId);
        if (!topic) return;
        const bucket = bucketOf(topic);
        const peers = state.topics
          .filter((t) => bucketOf(t) === bucket)
          .sort((a, b) => a.order - b.order);
        const i = peers.findIndex((t) => t.id === topicId);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= peers.length) return;
        const target: DropTarget = topic.sessionId
          ? {
              kind: "session",
              meetingId: topic.meetingId!,
              sessionId: topic.sessionId,
              sectionId: topic.sectionId,
            }
          : {
              kind: topic.lane === "parked" ? "parked" : "ideas",
              meetingId: topic.meetingId!,
            };
        push({ type: "moveTopic", id: topicId, target, index: j });
      },
    }),
    [state, push, undo]
  );
}

export { today0 };
