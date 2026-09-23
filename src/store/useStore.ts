import { create } from "zustand";
import type {
  Action,
  ActionColumn,
  ChatMessage,
  Domain,
  Goal,
  HealthLevel,
  Manager,
  Me,
  Note,
  PrayerEntry,
  PrayerEntryKind,
  PrayerSubjectKind,
  Session,
  Person,
  Team,
  TeamAction,
  Tag,
  Topic,
  TopicLane,
  TrackedMeeting,
  MeetingRhythm,
  MeetingSubjectKind,
  TeamGoal,
  LeadUpProfile,
  Win,
} from "../types";
import { storage } from "../lib/storage";
import { todayISO, type HealthFilterValue } from "../lib/health";
import type { ColumnTarget } from "../lib/topics";
import type { PrayerFilterValue } from "../lib/prayer";
import type { TreeMode } from "../lib/treeMode";
import { isDescendant, personDomainId } from "../lib/teams";
import { supabase } from "../lib/supabase";
import * as repo from "../lib/repo";
import type { NodePosition, PersistedData } from "../lib/repo";
import { clearDoc, loadDoc, saveDoc } from "../lib/docCache";
import { clearIndex } from "../lib/search";
import { clearRecents } from "../lib/recents";
import { clearUndo } from "../lib/undo";
import { toast } from "../lib/toasts";
import { emptyMe } from "../lib/repo";
import * as ops from "../lib/ops";
import {
  patchPrayer,
  slotTagIds,
  uid,
  withoutMeetingsFor,
} from "../lib/ops";
import {
  capUp,
  seedActions,
  seedCapacities,
  seedFollowUps,
  seedMeetings,
  seedDomains,
  seedGoals,
  seedManagers,
  seedMe,
  seedNotes,
  seedPrayers,
  seedSessions,
  seedPeople,
  seedTags,
  seedTopics,
  seedTeamActions,
  seedTeamGoals,
  seedTeamNotes,
  seedTeams,
  seedWins,
} from "../data/seed";

import {
  DEFAULT_TAB,
  routePath,
  type Route,
  type Selection,
  type Tab,
} from "../lib/routes";

export type { Tab, Selection } from "../lib/routes";

/**
 * Selection lives in the URL, not in this store — the setters below navigate,
 * and `applyRoute` writes the result back. The router installs this at mount.
 */
type Navigate = (path: string, opts?: { replace?: boolean }) => void;
let navigate: Navigate | null = null;

export function setNavigate(fn: Navigate | null) {
  navigate = fn;
}

function go(path: string, opts?: { replace?: boolean }) {
  // Before the router mounts (or in tests) fall back to a plain URL write so a
  // selection is never silently dropped.
  if (navigate) navigate(path, opts);
  else if (typeof window !== "undefined")
    window.history.replaceState({}, "", path);
}

export type { NodePosition, PersistedData } from "../lib/repo";

/** Auth/loading lifecycle for the whole app. */
/**
 * "anon" means *not signed in*. A failed load is "error" — conflating the two
 * signed people out whenever they went through a tunnel.
 */
export type Phase = "loading" | "anon" | "ready" | "error";

/** Whether the last write to the cloud landed. Surfaced in the app chrome. */
export type SyncStatus = "idle" | "saving" | "error";

export type ModalState =
  | { kind: "team"; team?: Team; parentId?: string; leaderId?: string }
  /** `teamId: null` = add them as a direct report, with no team at all. */
  | { kind: "person"; person?: Person; teamId?: string | null }
  | { kind: "manager"; manager?: Manager }
  | { kind: "domains" }
  | { kind: "triage" }
  | null;

type UIState = {
  /** Auth/loading phase. UI renders the app only when "ready". */
  phase: Phase;
  /** Why the load failed, shown on the error screen. */
  loadError: string | null;
  /** Whether pending edits have reached the cloud. */
  syncStatus: SyncStatus;
  /** Signed-in user id (Supabase auth uid) — the RLS scope for all data. */
  userId: string | null;
  /** Signed-in user's email, for the account menu. */
  userEmail: string | null;
  tab: Tab;
  /** null = show every domain on one canvas; otherwise filter the tree. */
  treeDomainId: string | null;
  /**
   * Health levels being scanned for, shared by the canvas and the table —
   * that's what makes them two views of one question rather than two filters
   * to keep in sync. Empty = everything. The canvas dims what doesn't match
   * (the shape of the org is the point there); the table drops the rows.
   */
  healthScan: HealthFilterValue[];
  /**
   * The prayer scan, shared by the canvas and the table for the same reason
   * the health scan is. Empty = everything; otherwise the surfaces answer
   * "who am I carrying" the same way in both places.
   */
  prayerScan: PrayerFilterValue[];
  /**
   * What I came to the chart to do. The only card control there is — the layer
   * set, the scan bar and what dims all follow from it (see lib/treeMode.ts).
   */
  treeMode: TreeMode;
  selectedPersonId: string | null;
  selectedTeamId: string | null;
  /** Side panel open for a manager I report to (leading-up profile). */
  selectedManagerId: string | null;
  /** Open on one recurring meeting — its planner, notes or settings. */
  selectedMeetingId: string | null;
  /** Side panel open for the signed-in leader's own profile. */
  selectedMe: boolean;
  /** True when the selected entity is on its full-page focus route. */
  focused: boolean;
  /** Sub-page of the selected entity — a person's tab, a team's section. */
  section: string | null;
  /** Full-screen session editor — when set, SessionEditorView takes over. */
  sessionId: string | null;
  collapsedTeams: string[];
  dark: boolean;
  /** Entity panel width beside the canvas, as a percentage of the split. */
  panelPct: number;
  modal: ModalState;
  settingsOpen: boolean;
  /** ⌘K. Lives in the store so any surface can open it, and the palette itself
      can be reached from the ? panel and vice versa. */
  paletteOpen: boolean;
  /** The ? shortcuts sheet. */
  helpOpen: boolean;
};

type Store = PersistedData &
  UIState & {
    // ui
    setTab: (tab: Tab) => void;
    setTreeDomainId: (id: string | null) => void;
    /** Add/remove one health level from the canvas scan. */
    toggleHealthScan: (value: HealthFilterValue) => void;
    /** Scan for a specific set of levels (or clear it with []). */
    setHealthScan: (values: HealthFilterValue[]) => void;
    /** Add/remove one prayer state from the canvas scan. */
    togglePrayerScan: (value: PrayerFilterValue) => void;
    /** Scan for a specific set of prayer states (or clear it with []). */
    setPrayerScan: (values: PrayerFilterValue[]) => void;
    setTreeMode: (mode: TreeMode) => void;
    /**
     * Open someone. The optional section lands you on one of their tabs — the
     * canvas uses it to send a prayer mark straight to the prayer tab rather
     * than to the top of a profile you then have to navigate.
     */
    selectPerson: (id: string | null, section?: string) => void;
    selectTeam: (id: string | null, section?: string) => void;
    selectManager: (id: string | null, section?: string) => void;
    /** Open one recurring meeting — the planner unless told otherwise. */
    selectMeeting: (id: string | null, section?: string) => void;
    selectMe: (open: boolean) => void;
    /** Close whatever is open, without stepping up the breadcrumb. */
    clearSelection: () => void;
    /** Switch the selected entity's sub-page (person tab, team section). */
    setSection: (section: string | null) => void;
    /** Open the full-screen session editor (promotes to focus). */
    openSession: (sessionId: string) => void;
    /** Close the session editor, return to the entity's session list. */
    closeSession: () => void;
    /** Promote the current peek to its full-page focus route. */
    openFocus: () => void;
    /** Demote the focused entity back to a peek beside the canvas. */
    closeFocus: () => void;
    /** Write a parsed URL into selection state. Called only by the router. */
    applyRoute: (route: Route) => void;
    toggleTeamCollapsed: (teamId: string) => void;
    toggleDark: () => void;
    /** Resize the entity panel. Clamped and remembered across sessions. */
    setPanelPct: (pct: number) => void;
    setPaletteOpen: (open: boolean) => void;
    setHelpOpen: (open: boolean) => void;
    openModal: (modal: NonNullable<ModalState>) => void;
    closeModal: () => void;
    // canvas
    setNodePosition: (id: string, pos: NodePosition) => void;
    resetLayout: () => void;
    // me
    updateMe: (patch: Partial<Me>) => void;
    // domains (life areas)
    addDomain: (domain: Omit<Domain, "id">) => string;
    updateDomain: (id: string, patch: Partial<Domain>) => void;
    deleteDomain: (id: string) => void;
    // managers (people I report to, above me)
    addManager: (manager: Omit<Manager, "id">) => void;
    updateManager: (id: string, patch: Partial<Manager>) => void;
    /** Merge a patch into a manager's leading-up operating manual. */
    updateManagerLeadUp: (id: string, patch: Partial<LeadUpProfile>) => void;
    deleteManager: (id: string) => void;
    // health — my own read on a team or a person
    /** Set (or clear, with null) the health level. Stamps today's date. */
    setHealth: (
      kind: "team" | "person",
      id: string,
      level: HealthLevel | null
    ) => void;
    /** Edit the one-line evidence behind an existing health call. */
    setHealthNote: (kind: "team" | "person", id: string, note: string) => void;
    // prayer — who I'm carrying, and the log of what for
    /**
     * Take someone up in prayer, or lay them down. Taking up stamps the date
     * it started; laying down clears the mark but never the log — what you
     * prayed and what was answered outlives the season you prayed it in.
     */
    setPrayer: (
      kind: PrayerSubjectKind,
      id: string,
      carrying: boolean
    ) => void;
    /** The one line of what I'm holding for them. */
    setPrayerFocus: (
      kind: PrayerSubjectKind,
      id: string,
      focus: string
    ) => void;
    /** Mark that I prayed. Counts once a day — twice is still once. */
    markPrayed: (kind: PrayerSubjectKind, id: string) => void;
    /**
     * Write something down. Starts carrying the subject if they weren't
     * already: writing a burden for someone is the decision.
     */
    addPrayerEntry: (
      kind: PrayerSubjectKind,
      subjectId: string,
      text: string,
      entryKind?: PrayerEntryKind
    ) => string;
    updatePrayerEntry: (
      id: string,
      patch: Partial<Pick<PrayerEntry, "text" | "kind" | "date">>
    ) => void;
    /** Answered — a transition with a date, not a deletion. */
    answerPrayerEntry: (id: string, note?: string) => void;
    /** Reopen: it wasn't answered after all, or it's back. */
    reopenPrayerEntry: (id: string) => void;
    deletePrayerEntry: (id: string) => void;
    // teams
    addTeam: (team: Omit<Team, "id" | "order">) => void;
    updateTeam: (id: string, patch: Partial<Team>) => void;
    deleteTeam: (id: string) => void;
    // team-level records
    addTeamAction: (teamId: string, text: string, dueDate?: string) => void;
    updateTeamAction: (id: string, patch: Partial<Pick<TeamAction, "text" | "dueDate" | "done">>) => void;
    toggleTeamAction: (id: string) => void;
    deleteTeamAction: (id: string) => void;
    /**
     * Put a deleted record back exactly as it was, id and all — the other half
     * of an Undo toast (see `deleteWithUndo`).
     *
     * Deliberately not `add*`: those mint a new id and a fresh `order`, which
     * would break every reference to the record and move it in its list. Undo
     * has to mean "that didn't happen", not "here's a similar one".
     */
    restoreTeamAction: (action: TeamAction) => void;
    addTeamGoal: (teamId: string, title: string) => void;
    updateTeamGoal: (id: string, patch: Partial<TeamGoal>) => void;
    deleteTeamGoal: (id: string) => void;
    /** See `restoreTeamAction`. */
    restoreTeamGoal: (goal: TeamGoal) => void;
    addTeamNote: (teamId: string, body: string) => void;
    deleteTeamNote: (id: string) => void;
    // people
    addPerson: (person: Omit<Person, "id" | "assessments" | "strengths" | "watchOuts"> & Partial<Person>) => string;
    updatePerson: (id: string, patch: Partial<Person>) => void;
    /** Merge a patch into a person's leading-up operating manual. */
    updateLeadUp: (personId: string, patch: Partial<LeadUpProfile>) => void;
    deletePerson: (id: string) => void;
    /**
     * Reorg seam: move a person to another team (future drag-and-drop calls
     * this). Undefined pulls them out of every team — a direct report of mine.
     */
    movePerson: (personId: string, teamId?: string) => void;
    // per-person records
    addAction: (
      personId: string,
      text: string,
      dueDate?: string,
      column?: ActionColumn
    ) => void;
    updateAction: (
      id: string,
      patch: Partial<Pick<Action, "text" | "dueDate" | "done" | "column">>
    ) => void;
    setActionColumn: (id: string, column: ActionColumn) => void;
    toggleAction: (id: string) => void;
    deleteAction: (id: string) => void;
    // topic boards — what there is to talk about, keyed by meeting
    addTopic: (
      meetingId: string,
      text: string,
      opts?: {
        lane?: TopicLane;
        sessionId?: string;
        dueDate?: string;
        slotId?: string;
        tagIds?: string[];
      }
    ) => string;
    updateTopic: (
      id: string,
      patch: Partial<
        Pick<
          Topic,
          | "text"
          | "detail"
          | "dueDate"
          | "slotId"
          | "points"
          | "urgent"
          | "tagIds"
          | "meetingId"
        >
      >
    ) => void;
    /**
     * Place a topic at a position inside a drop target, renumbering that
     * bucket. `placeTopic` answers "which column"; this answers "and where in
     * it", which is what a running order needs.
     */
    placeTopicAt: (
      id: string,
      target: ColumnTarget & { meetingId?: string },
      index?: number
    ) => void;
    /**
     * Capture with the `#tag @meeting !` grammar. Unknown `#tags` are created
     * on the spot — being sent to a settings screen mid-thought is how a
     * capture box stops getting used. Returns the ids created.
     */
    captureTopics: (
      raw: string,
      target?: (ColumnTarget & { meetingId?: string }) | null,
      index?: number
    ) => string[];
    /** Hand one topic back to the backlog, noted against its occurrence. */
    returnTopic: (id: string) => void;
    /**
     * Sweep every occurrence whose date has passed. Returns how many came back
     * so the caller can say so. Idempotent — a topic only returns once.
     */
    sweepReturns: () => number;
    // the workspace vocabulary
    addTag: (label: string) => string;
    updateTag: (id: string, patch: Partial<Pick<Tag, "label" | "color">>) => void;
    /** Topics keep their text; slots and coverage targets are unwired. */
    deleteTag: (id: string) => void;
    // bulk operations — the reason a board beats a list
    tagTopics: (ids: string[], tagId: string, on: boolean) => void;
    assignTopics: (ids: string[], meetingId: string | null) => void;
    parkTopics: (ids: string[], parked: boolean) => void;
    deleteTopics: (ids: string[]) => void;
    // follow-ups — commitments that outlive one occurrence
    addFollowUp: (
      subjectKind: MeetingSubjectKind,
      subjectId: string,
      text: string,
      opts?: { meetingId?: string; sourceSessionId?: string }
    ) => string;
    toggleFollowUp: (id: string) => void;
    deleteFollowUp: (id: string) => void;
    /** A topic pushed three times is usually a commitment in disguise. */
    promoteToFollowUp: (topicId: string) => void;
    /** Move a topic into a lane or onto one occurrence. Reopens it if closed. */
    placeTopic: (
      id: string,
      target:
        | { lane: TopicLane; slotId?: string }
        | { sessionId: string; slotId?: string }
    ) => void;
    /** "We talked about it." Passing false puts it back on the board. */
    coverTopic: (id: string, covered?: boolean) => void;
    /**
     * Push a topic into a later occurrence and count it. Omit the session to
     * drop it back to the backlog — still a push, still counted.
     */
    rollTopic: (id: string, sessionId?: string) => void;
    deleteTopic: (id: string) => void;
    /** See `restoreTeamAction`. */
    restoreTopic: (topic: Topic) => void;
    /**
     * Move a topic one place up or down among the topics it is shown beside —
     * the same column on the board, the same agenda. Returns where it landed so
     * the caller can announce it, or `null` when it was already at the end.
     */
    moveTopic: (
      id: string,
      direction: -1 | 1
    ) => { index: number; total: number } | null;
    // tracked meetings — the unit readiness is measured against
    /**
     * Opt in to being ready for a meeting with this subject. Idempotent — it
     * answers the "is this tracked at all" question, so it adopts an existing
     * meeting rather than stacking a second one on it. Returns its id.
     */
    trackMeeting: (
      subjectKind: MeetingSubjectKind,
      subjectId: string,
      rhythm: MeetingRhythm,
      patch?: Partial<Omit<TrackedMeeting, "id" | "subjectKind" | "subjectId">>
    ) => string;
    /**
     * Add a meeting, always a new one. A 1:1 and a career check-in with the
     * same person are two different things to be ready for.
     */
    createMeeting: (
      subjectKind: MeetingSubjectKind,
      subjectId: string,
      patch?: Partial<Omit<TrackedMeeting, "id" | "subjectKind" | "subjectId">>
    ) => string;
    updateMeeting: (id: string, patch: Partial<Omit<TrackedMeeting, "id">>) => void;
    /**
     * Replace a meeting's standing skeleton. Topics pointing at a removed
     * slot become untagged rather than disappearing.
     */
    setCurriculum: (
      meetingId: string,
      curriculum: TrackedMeeting["curriculum"]
    ) => void;
    /**
     * "Every Monday." Sets the day and moves this meeting's future, unwritten
     * occurrences onto it, so a board already booked on the wrong day follows.
     */
    setMeetingWeekday: (meetingId: string, weekday: number | undefined) => void;
    /**
     * Add a row to the planner, backed by a workspace tag (found by name or
     * created). Topics already carrying that tag move into the row.
     */
    addMeetingRow: (meetingId: string, label: string) => string | undefined;
    /**
     * Move one occurrence, calendar-style. `from` is where it sits now (a
     * session, or a projected date). Returns the session id it ends up as.
     * "series" re-anchors the rhythm on the new weekday from now on.
     */
    moveOccurrence: (
      meetingId: string,
      from: { sessionId: string | null; date: string },
      to: string,
      scope: "one" | "series"
    ) => string;
    /** This week isn't happening. Its topics go back to Ideas. */
    skipOccurrence: (
      meetingId: string,
      from: { sessionId: string | null; date: string }
    ) => void;
    /** Undo a skip, or move a moved occurrence back onto its series date. */
    restoreOccurrence: (sessionId: string) => void;
    /** A one-off meeting outside the rhythm. Reuses a session already on that date. */
    addExtraOccurrence: (meetingId: string, date: string) => string;
    /** Only offered when the meeting has no sessions — history is never dropped. */
    untrackMeeting: (id: string) => void;
    /** Record (or clear) the explicit "I don't sit down with them" decision. */
    setNoMeeting: (
      subjectKind: MeetingSubjectKind,
      subjectId: string,
      value: boolean
    ) => void;
    addSession: (o: Omit<Session, "id">) => string;
    updateSession: (id: string, patch: Partial<Omit<Session, "id">>) => void;
    deleteSession: (id: string) => void;
    addGoal: (g: Omit<Goal, "id">) => void;
    updateGoal: (id: string, patch: Partial<Goal>) => void;
    deleteGoal: (id: string) => void;
    /** See `restoreTeamAction`. */
    restoreGoal: (goal: Goal) => void;
    addNote: (personId: string, body: string) => string;
    updateNote: (id: string, patch: Partial<Pick<Note, "body" | "date">>) => void;
    deleteNote: (id: string) => void;
    // wins (leading up: value banked with a person I report to)
    addWin: (win: Omit<Win, "id" | "date"> & Partial<Pick<Win, "date">>) => void;
    updateWin: (id: string, patch: Partial<Pick<Win, "text" | "impact" | "date">>) => void;
    deleteWin: (id: string) => void;
    setSettingsOpen: (open: boolean) => void;
    // chat
    appendChat: (key: string, msg: ChatMessage) => void;
    clearChat: (key: string) => void;
    // auth / lifecycle
    bootstrap: () => Promise<void>;
    /** Re-run bootstrap after a load failure, resetting backoff. */
    retryBootstrap: () => Promise<void>;
    hydrate: (
      data: PersistedData,
      userId: string,
      email: string | null,
      opts?: {
        /** Skips re-writing the local cache when the doc came out of it. */
        fromCache?: boolean;
        /**
         * What the server is believed to hold, when that differs from `data` —
         * a refresh merged with local edits that still have to be written.
         * Must already be migrated, and share row objects with `data` for
         * every row that is the same.
         */
        baseline?: PersistedData;
        /** `data` has already been through migrateDoc/rescueOrphanTopics. */
        premigrated?: boolean;
      }
    ) => void;
    signOut: () => Promise<void>;
    // data management
    resetToSeed: () => Promise<void>;
  };

const DATA_KEY = "data";
/**
 * The last topic removed, held outside state so it survives the re-render that
 * removed it without becoming a persisted field. One deep on purpose: this is
 * the undo for a mis-pressed Delete, not a history stack.
 */

function migrateActions(actions: Action[]): Action[] {
  return actions.map((a) => ({
    ...a,
    column: a.column ?? (a.done ? "done" : "backlog"),
  }));
}

/**
 * A document from the local cache was written by whatever version of the app
 * last ran in this browser, which may predate fields the current one assumes.
 *
 * Filling the gaps beats the alternatives: throwing the cache away makes every
 * upgrade a cold blank open, and trusting it crashes on the first `[...t.
 * carriedFrom]`. The server copy that arrives moments later has the real
 * values — this only has to survive the paint in between.
 */
function migrateDoc(doc: PersistedData): PersistedData {
  const topics = doc.topics ?? [];
  const needsFill = topics.some((t) => !t.tagIds || !t.carriedFrom);
  return {
    ...doc,
    // Collections added after this cache may have been written.
    tags: doc.tags ?? [],
    followUps: doc.followUps ?? [],
    meetings: doc.meetings ?? [],
    sessions: doc.sessions ?? [],
    topics: needsFill
      ? topics.map((t) => ({
          ...t,
          tagIds: t.tagIds ?? [],
          carriedFrom: t.carriedFrom ?? [],
        }))
      : topics,
    people: doc.people ?? [],
    teams: doc.teams ?? [],
    managers: doc.managers ?? [],
    domains: doc.domains ?? [],
    capacities: doc.capacities ?? [],
    actions: doc.actions ?? [],
    goals: doc.goals ?? [],
    notes: doc.notes ?? [],
    wins: doc.wins ?? [],
    prayers: doc.prayers ?? [],
    teamActions: doc.teamActions ?? [],
    teamGoals: doc.teamGoals ?? [],
    teamNotes: doc.teamNotes ?? [],
    chats: doc.chats ?? {},
    nodePositions: doc.nodePositions ?? {},
  };
}

/**
 * Un-strand topics that point at an occurrence which isn't there.
 *
 * Every surface splits topics in two: `!sessionId` is the idea bucket, and a
 * `sessionId` matching a real session is a week column or a calendar day. A
 * topic naming a session that doesn't exist falls through both — it is in the
 * database, it syncs, it comes back on every load, and no screen in the app
 * will draw it. From the desk it is simply gone.
 *
 * That state is reachable whenever the session write and the topic write don't
 * land together: sessions and topics are separate upserts inside one
 * `Promise.all`, so one table can commit while the other 400s. Rather than
 * trusting those to never diverge, heal it on the way in — the topic goes back
 * to the backlog it came from, where it is visible and can be re-planned. Being
 * asked to schedule something twice is a nuisance; losing it is not.
 */
function rescueOrphanTopics(doc: PersistedData): PersistedData {
  const sessions = doc.sessions ?? [];
  const topics = doc.topics ?? [];
  const known = new Set(sessions.map((o) => o.id));
  const stranded = topics.filter((t) => t.sessionId && !known.has(t.sessionId));
  if (!stranded.length) return doc;

  console.warn(
    `LeadWell: ${stranded.length} topic(s) pointed at a missing occurrence — returned to the backlog`,
    stranded.map((t) => t.text)
  );
  const lost = new Set(stranded.map((t) => t.id));
  return {
    ...doc,
    topics: topics.map((t) =>
      lost.has(t.id) ? { ...t, sessionId: undefined, lane: "backlog" as const } : t
    ),
  };
}

function migrateSessions(sessions: Session[]): Session[] {
  return sessions.map((o) => ({
    ...o,
    // Legacy schedule stubs used notes: "Scheduled"
    notes: o.notes === "Scheduled" ? undefined : o.notes,
  }));
}

/** Fresh seed document for a brand-new account. */
function seedData(): PersistedData {
  return {
    me: seedMe,
    capacities: seedCapacities,
    domains: seedDomains,
    managers: seedManagers,
    teams: seedTeams,
    people: seedPeople,
    actions: seedActions,
    meetings: seedMeetings,
    tags: seedTags,
    topics: seedTopics,
    followUps: seedFollowUps,
    sessions: seedSessions,
    goals: seedGoals,
    notes: seedNotes,
    wins: seedWins,
    prayers: seedPrayers,
    teamActions: seedTeamActions,
    teamGoals: seedTeamGoals,
    teamNotes: seedTeamNotes,
    chats: {},
    nodePositions: {},
  };
}

/** Empty placeholder used before the first cloud load resolves (never shown). */
function blankData(): PersistedData {
  return {
    me: { name: "", assessments: {}, strengths: [], watchOuts: [] },
    capacities: [],
    domains: [],
    managers: [],
    teams: [],
    people: [],
    actions: [],
    meetings: [],
    tags: [],
    topics: [],
    followUps: [],
    sessions: [],
    goals: [],
    notes: [],
    wins: [],
    prayers: [],
    teamActions: [],
    teamGoals: [],
    teamNotes: [],
    chats: {},
    nodePositions: {},
  };
}

/**
 * Every field the cloud write path must extract from the store. Kept next to
 * the document shape helpers so bootstrap can tell a complete cache from one
 * written by a buggy extract that omitted newer collections.
 */
const PERSISTED_KEYS: (keyof PersistedData)[] = [
  "me",
  "capacities",
  "domains",
  "managers",
  "teams",
  "people",
  "actions",
  "meetings",
  "tags",
  "topics",
  "followUps",
  "sessions",
  "goals",
  "notes",
  "wins",
  "prayers",
  "teamActions",
  "teamGoals",
  "teamNotes",
  "chats",
  "nodePositions",
];

/** True when a cached doc was serialized without one of the persisted slices. */
function isIncompletePersistedDoc(doc: Partial<PersistedData>): boolean {
  return PERSISTED_KEYS.some((k) => doc[k] === undefined);
}

/** The persisted slices that are arrays of `{ id }` — everything but these three. */
const ID_COLLECTIONS = PERSISTED_KEYS.filter(
  (k) => k !== "me" && k !== "chats" && k !== "nodePositions"
);

type Row = { id: string };

/** Rows the refresh found on this device, untouched here, that the server no longer has. */
export type MissingRows = Partial<Record<keyof PersistedData, Row[]>>;

/**
 * Three-way merge of a server read into the document on screen.
 *
 * `base` is what this device last believed the server held. Per row:
 *  - changed or created here (not identical to base) → keep the local version;
 *  - untouched here → take the server's version, which carries edits made on
 *    other devices; if the server no longer has it, it was deleted elsewhere;
 *  - deleted here (in base, not local) → stays deleted;
 *  - only on the server → comes across.
 *
 * The caller installs `server` as the new baseline, so the next sync writes
 * exactly the local changes and nothing else. With no base every local row
 * counts as changed: local wins, and nothing the server has is lost.
 */
function mergeServer(
  local: PersistedData,
  base: PersistedData | null,
  server: PersistedData
): { doc: PersistedData; missing: MissingRows; missingCount: number } {
  const doc: PersistedData = { ...server };
  const missing: MissingRows = {};
  let missingCount = 0;

  doc.me = base && local.me === base.me ? server.me : local.me;

  for (const k of ID_COLLECTIONS) {
    const mine = local[k] as Row[] | undefined;
    const theirs = server[k] as Row[] | undefined;
    if (!Array.isArray(mine)) continue;
    if (!Array.isArray(theirs)) {
      (doc as Record<string, unknown>)[k] = mine;
      continue;
    }
    const before = new Map(
      ((base?.[k] as Row[] | undefined) ?? []).map((x) => [x.id, x] as const)
    );
    const onServer = new Map(theirs.map((x) => [x.id, x] as const));
    const here = new Set(mine.map((x) => x.id));
    const out: Row[] = [];
    for (const row of mine) {
      if (before.get(row.id) === row) {
        const fresh = onServer.get(row.id);
        if (fresh) out.push(fresh);
        else {
          (missing[k] ??= []).push(row);
          missingCount += 1;
        }
      } else {
        out.push(row);
      }
    }
    for (const row of theirs) {
      if (!here.has(row.id) && !before.has(row.id)) out.push(row);
    }
    (doc as Record<string, unknown>)[k] = out;
  }

  for (const k of ["chats", "nodePositions"] as const) {
    const mine = (local[k] ?? {}) as Record<string, unknown>;
    const theirs = (server[k] ?? {}) as Record<string, unknown>;
    const before = (base?.[k] ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(mine)) {
      if (key in before && before[key] === v) {
        if (key in theirs) out[key] = theirs[key];
      } else {
        out[key] = v;
      }
    }
    for (const [key, v] of Object.entries(theirs)) {
      if (!(key in mine) && !(key in before)) out[key] = v;
    }
    (doc as Record<string, unknown>)[k] = out;
  }

  return { doc, missing, missingCount };
}

/**
 * Give `doc` the same row objects as `base` wherever the two are equal.
 *
 * Sync diffs by object identity, and identity does not survive a round trip
 * through the local cache — a document and its baseline read back from JSON
 * share nothing. Without this every row would look edited.
 */
function relink(doc: PersistedData, base: PersistedData): PersistedData {
  const out: PersistedData = { ...doc };
  const same = (a: unknown, b: unknown) =>
    a === b || JSON.stringify(a) === JSON.stringify(b);
  if (same(doc.me, base.me)) out.me = base.me;
  for (const k of ID_COLLECTIONS) {
    const rows = doc[k] as Row[] | undefined;
    const prev = base[k] as Row[] | undefined;
    if (!Array.isArray(rows) || !Array.isArray(prev)) continue;
    const byId = new Map(prev.map((x) => [x.id, x] as const));
    (out as Record<string, unknown>)[k] = rows.map((r) => {
      const b = byId.get(r.id);
      return b && same(r, b) ? b : r;
    });
  }
  for (const k of ["chats", "nodePositions"] as const) {
    const rows = { ...(doc[k] ?? {}) } as Record<string, unknown>;
    const prev = (base[k] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(rows)) {
      if (key in prev && same(rows[key], prev[key])) rows[key] = prev[key];
    }
    (out as Record<string, unknown>)[k] = rows;
  }
  return out;
}

const RECOVERY_KEY = (userId: string) => `recovery:${userId}`;

type RecoveryStash = { savedAt: string; rows: MissingRows };

/**
 * Keep rows a refresh is about to drop, and offer them back.
 *
 * After the sync bugs of August/September the local copy on some device may be
 * the only place a week of meeting prep still exists. A row that is on this
 * device, untouched here, and gone from the server is *usually* a delete made
 * elsewhere — but it is exactly what lost work looks like too, and asking once
 * costs nothing next to guessing wrong.
 */
function offerRecovery(userId: string, missing: MissingRows, count: number) {
  const prev = storage.load<RecoveryStash>(RECOVERY_KEY(userId));
  const rows: MissingRows = { ...(prev?.rows ?? {}) };
  for (const [k, list] of Object.entries(missing) as [keyof PersistedData, Row[]][]) {
    const have = new Set((rows[k] ?? []).map((r) => r.id));
    rows[k] = [...(rows[k] ?? []), ...list.filter((r) => !have.has(r.id))];
  }
  storage.save<RecoveryStash>(RECOVERY_KEY(userId), {
    savedAt: new Date().toISOString(),
    rows,
  });
  const topicCount = missing.topics?.length ?? 0;
  const what =
    topicCount === count
      ? `${count} topic${count === 1 ? "" : "s"}`
      : `${count} item${count === 1 ? "" : "s"}`;
  toast({
    tone: "error",
    message: `This device had ${what} the cloud doesn't — deleted elsewhere, or lost in an old sync.`,
    action: { label: "Restore", onAction: () => restoreRecovery(userId) },
  });
}

/** Put stashed rows back. They sync as new rows on the next write. */
export function restoreRecovery(userId: string): number {
  const stash = storage.load<RecoveryStash>(RECOVERY_KEY(userId));
  const state = useStore.getState();
  if (!stash || state.userId !== userId) return 0;
  const patch: Record<string, unknown> = {};
  let restored = 0;
  for (const [k, list] of Object.entries(stash.rows) as [keyof PersistedData, Row[]][]) {
    const current = state[k] as unknown as Row[];
    if (!Array.isArray(current) || !list?.length) continue;
    const have = new Set(current.map((r) => r.id));
    const back = list.filter((r) => !have.has(r.id));
    if (!back.length) continue;
    patch[k] = [...current, ...back];
    restored += back.length;
  }
  if (restored) {
    useStore.setState(patch as Partial<Store>);
    toast({ message: `Restored ${restored} item${restored === 1 ? "" : "s"}.` });
  }
  storage.remove(RECOVERY_KEY(userId));
  return restored;
}

/**
 * A failed sync used to cache `extractData` without `tags` / `followUps`.
 * Reloading that snapshot as a pending full push would migrate the holes to
 * `[]` and delete the server's rows. Overlay the cache's present keys onto
 * the server copy so edits survive and missing tables stay intact.
 */
async function recoverIncompletePendingWrite(
  userId: string,
  email: string | null,
  cachedRaw: PersistedData,
  hydrate: Store["hydrate"]
): Promise<void> {
  try {
    const server = await repo.loadAll(userId);
    if (!server) {
      // Nothing on the server to protect — push what we have.
      repo.clearBaseline();
      fullSyncPending = true;
      void runSync(userId);
      return;
    }
    const merged: PersistedData = { ...server };
    for (const k of PERSISTED_KEYS) {
      if (cachedRaw[k] !== undefined) {
        (merged as Record<string, unknown>)[k] = cachedRaw[k];
      }
    }
    hydrate(merged, userId, email);
    repo.clearBaseline();
    fullSyncPending = true;
    void runSync(userId);
  } catch (e) {
    console.error("LeadWell: could not repair incomplete pending cache", e);
    // Do not full-push the incomplete doc — that is how the wipe happens.
    // Keep the local paint and retry when connectivity returns via revalidate.
    void revalidate(userId, email);
  }
}

/**
 * One-time migration: if this browser still holds data from the old
 * localStorage-only version, adopt it as the new user's starting document so
 * nothing is lost. Returns null when there's nothing to import.
 */
function importLegacyLocalData(): PersistedData | null {
  const saved = storage.load<PersistedData>(DATA_KEY);
  if (!saved || !saved.capacities) return null;
  return {
    ...saved,
    me: emptyMe({
      name: saved.me?.name ?? "",
      title: saved.me?.title,
      photo: saved.me?.photo,
      assessments: saved.me?.assessments,
      strengths: saved.me?.strengths,
      watchOuts: saved.me?.watchOuts,
      howToLead: saved.me?.howToLead,
      customModalities: saved.me?.customModalities,
    }),
    chats: saved.chats ?? {},
    nodePositions: saved.nodePositions ?? {},
    domains: saved.domains ?? seedDomains,
    managers: saved.managers ?? [],
    wins: saved.wins ?? [],
    prayers: saved.prayers ?? [],
    teamActions: saved.teamActions ?? [],
    teamGoals: saved.teamGoals ?? [],
    teamNotes: saved.teamNotes ?? [],
    actions: migrateActions(saved.actions ?? []),
    meetings: saved.meetings ?? [],
    sessions: migrateSessions(saved.sessions ?? []),
    capacities: saved.capacities.some((c) => c.id === capUp.id)
      ? saved.capacities
      : [...saved.capacities, capUp],
  };
}

function initialDark(): boolean {
  const saved = storage.load<boolean>("dark");
  if (saved !== null) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * How wide the entity panel sits beside the canvas, as a percentage of the
 * split. The panel is the working surface — the canvas is the index — so the
 * default gives it the larger share, and dragging the divider is remembered.
 */
export const PANEL_PCT_DEFAULT = 62;
export const PANEL_PCT_MIN = 35;
export const PANEL_PCT_MAX = 80;

export function clampPanelPct(pct: number): number {
  return Math.min(PANEL_PCT_MAX, Math.max(PANEL_PCT_MIN, Math.round(pct)));
}

function initialPanelPct(): number {
  const saved = storage.load<number>("panelPct");
  return typeof saved === "number" ? clampPanelPct(saved) : PANEL_PCT_DEFAULT;
}

/**
 * The team in context: the one selected outright, or the team of the person
 * who is. Derived rather than stored so it stays right no matter what order
 * the route and the cloud data arrive in.
 */
export function useActiveTeamId(): string | null {
  return useStore((s) =>
    s.selectedPersonId
      ? (s.people.find((p) => p.id === s.selectedPersonId)?.teamId ?? null)
      : s.selectedTeamId
  );
}

/** The one entity the current route points at. A person outranks their team. */
function currentSelection(s: UIState): Selection | null {
  const sessionId = s.sessionId ?? undefined;
  if (s.selectedPersonId)
    return {
      kind: "person",
      id: s.selectedPersonId,
      section: s.section ?? undefined,
      sessionId,
    };
  if (s.selectedTeamId)
    return {
      kind: "team",
      id: s.selectedTeamId,
      section: s.section ?? undefined,
      sessionId,
    };
  if (s.selectedManagerId)
    return {
      kind: "manager",
      id: s.selectedManagerId,
      section: s.section ?? undefined,
      sessionId,
    };
  if (s.selectedMeetingId)
    return {
      kind: "meeting",
      id: s.selectedMeetingId,
      section: s.section ?? undefined,
      sessionId,
    };
  if (s.selectedMe)
    return { kind: "me", id: "", section: s.section ?? undefined, sessionId };
  return null;
}

/** Navigate to a tab surface, optionally switching tabs on the way. */
function goTab(
  s: UIState,
  sel: Selection | null,
  tab?: Tab,
  opts?: { replace?: boolean }
) {
  go(
    routePath({
      view: "tab",
      tab: tab ?? (s.focused ? DEFAULT_TAB : s.tab),
      peek: sel,
    }),
    opts
  );
}

/**
 * Navigate keeping whichever surface we're already on — a peek stays a peek,
 * focus stays focus. Clearing the selection always lands back on a tab.
 */
function goTo(s: UIState, sel: Selection | null, opts?: { replace?: boolean }) {
  if (s.focused && sel) {
    go(routePath({ view: "focus", target: sel }), opts);
    return;
  }
  goTab(s, sel, undefined, opts);
}

export const useStore = create<Store>((set, get) => ({
  ...blankData(),
  phase: "loading",
  loadError: null,
  syncStatus: "idle",
  userId: null,
  userEmail: null,
  tab: "tree",
  treeDomainId: null,
  healthScan: [],
  prayerScan: [],
  treeMode: "plan",
  selectedPersonId: null,
  selectedTeamId: null,
  selectedManagerId: null,
  selectedMeetingId: null,
  selectedMe: false,
  focused: false,
  section: null,
  sessionId: null,
  collapsedTeams: [],
  dark: initialDark(),
  panelPct: initialPanelPct(),
  paletteOpen: false,
  helpOpen: false,
  modal: null,
  settingsOpen: false,

  setTab: (tab) => {
    const s = get();
    goTab(s, currentSelection(s), tab);
  },
  // Filtering the canvas drops any selection that just left the view.
  setTreeDomainId: (id) => {
    const s = get();
    set({ treeDomainId: id });
    if (!id) return;
    const sel = currentSelection(s);
    if (!sel) return;
    const teamInDomain = (teamId: string | null | undefined) =>
      Boolean(teamId) &&
      s.teams.find((t) => t.id === teamId)?.domainId === id;

    const survives =
      sel.kind === "team"
        ? teamInDomain(sel.id)
        : sel.kind === "person"
          ? (() => {
              const person = s.people.find((p) => p.id === sel.id);
              // A direct report carries their own domain tag — there's no team
              // to inherit one from.
              return person ? personDomainId(person, s.teams) === id : false;
            })()
          : sel.kind === "manager"
            ? s.managers.find((m) => m.id === sel.id)?.domainId === id
            : true;
    if (!survives) goTo(s, null, { replace: true });
  },
  toggleHealthScan: (value) =>
    set((s) => ({
      healthScan: s.healthScan.includes(value)
        ? s.healthScan.filter((v) => v !== value)
        : [...s.healthScan, value],
    })),
  setHealthScan: (values) => set({ healthScan: values }),
  togglePrayerScan: (value) =>
    set((s) => ({
      prayerScan: s.prayerScan.includes(value)
        ? s.prayerScan.filter((v) => v !== value)
        : [...s.prayerScan, value],
    })),
  setPrayerScan: (values) => set({ prayerScan: values }),
  // Switching mode deliberately leaves the scans alone. They're shared with
  // the table so a scan follows you between the two surfaces, and dropping one
  // every time you changed mode would break that. The canvas just stops
  // *applying* a scan its mode doesn't own — see MODE_SCAN.
  setTreeMode: (mode) => set({ treeMode: mode }),
  /**
   * Closing a person steps up to their team rather than dismissing outright —
   * the breadcrumb parent is where you came from, so that's where back goes.
   */
  selectPerson: (id, section) => {
    const s = get();
    if (!id) {
      const teamId = s.people.find((p) => p.id === s.selectedPersonId)?.teamId;
      goTo(s, teamId ? { kind: "team", id: teamId } : null);
      return;
    }
    goTo(s, { kind: "person", id, section });
  },
  selectTeam: (id, section) =>
    goTo(get(), id ? { kind: "team", id, section } : null),
  // A manager stands above me on the canvas — always reached from the tree.
  selectManager: (id, section) => {
    const s = get();
    if (!id) {
      goTo(s, null);
      return;
    }
    const sel: Selection = { kind: "manager", id, section };
    if (s.focused) go(routePath({ view: "focus", target: sel }));
    else goTab(s, sel, "tree");
  },
  // A meeting is reached from the Meetings tab or from its subject's profile,
  // and there's no canvas node for it — so it always opens in focus, where the
  // planner has the width the board actually needs.
  selectMeeting: (id, section) => {
    const s = get();
    if (!id) {
      goTo(s, null);
      return;
    }
    go(
      routePath({
        view: "focus",
        target: { kind: "meeting", id, section: section ?? "plan" },
      })
    );
  },
  selectMe: (open) => {
    const s = get();
    if (!open) {
      goTo(s, null);
      return;
    }
    const sel: Selection = { kind: "me", id: "" };
    if (s.focused) go(routePath({ view: "focus", target: sel }));
    else goTab(s, sel, "tree");
  },
  clearSelection: () => goTo(get(), null),
  // Sub-page moves replace history: back should leave the entity, not walk tabs.
  setSection: (section) => {
    const s = get();
    const sel = currentSelection(s);
    if (!sel) return;
    goTo(s, { ...sel, section: section ?? undefined, sessionId: undefined }, {
      replace: true,
    });
  },
  openSession: (sessionId) => {
    const s = get();
    const session = s.sessions.find((o) => o.id === sessionId);
    if (!session) return;
    const meeting = s.meetings.find((m) => m.id === session.meetingId);
    if (!meeting) return;

    // Land back where you opened it from. Coming off the planner, closing the
    // write-up should return to the board, not jump sideways to a profile you
    // were never on.
    if (s.selectedMeetingId === meeting.id) {
      go(
        routePath({
          view: "focus",
          target: {
            kind: "meeting",
            id: meeting.id,
            section: "notes",
            sessionId,
          },
        })
      );
      return;
    }

    let sel: Selection;
    if (meeting.subjectKind === "person") {
      sel = {
        kind: "person",
        id: meeting.subjectId,
        section: "sessions",
        sessionId,
      };
    } else if (meeting.subjectKind === "manager") {
      sel = {
        kind: "manager",
        id: meeting.subjectId,
        section: "sessions",
        sessionId,
      };
    } else {
      sel = {
        kind: "team",
        id: meeting.subjectId,
        section: "sessions",
        sessionId,
      };
    }
    go(routePath({ view: "focus", target: sel }));
  },
  closeSession: () => {
    const s = get();
    const sel = currentSelection(s);
    if (!sel?.sessionId) return;
    const { sessionId: _removed, ...rest } = sel;
    // Teams embed meetings on the main profile — no sessions sub-page to land on.
    const target =
      rest.kind === "team"
        ? { kind: rest.kind, id: rest.id }
        : rest.kind === "meeting"
          ? { ...rest, section: rest.section ?? "notes" }
          : { ...rest, section: rest.section ?? "sessions" };
    go(routePath({ view: "focus", target }));
  },
  openFocus: () => {
    const sel = currentSelection(get());
    if (sel) go(routePath({ view: "focus", target: sel }));
  },
  closeFocus: () => {
    const s = get();
    goTab(s, currentSelection(s), s.tab);
  },
  applyRoute: (route) =>
    set((s) => {
      const sel = route.view === "focus" ? route.target : route.peek;
      const next = {
        // Focus routes don't name a tab — keep the one we'll return to.
        tab: route.view === "focus" ? s.tab : route.tab,
        focused: route.view === "focus",
        section: sel?.section ?? null,
        sessionId: sel?.sessionId ?? null,
        selectedPersonId: null as string | null,
        selectedTeamId: null as string | null,
        selectedManagerId: null as string | null,
        selectedMeetingId: null as string | null,
        selectedMe: false,
      };
      if (!sel) return next;
      // A person's team is derived at read time (useActiveTeamId), not stored:
      // a deep link applies its route before the cloud data has loaded, so any
      // lookup done here would resolve against an empty store.
      if (sel.kind === "person") next.selectedPersonId = sel.id;
      else if (sel.kind === "team") next.selectedTeamId = sel.id;
      else if (sel.kind === "manager") next.selectedManagerId = sel.id;
      else if (sel.kind === "meeting") next.selectedMeetingId = sel.id;
      else next.selectedMe = true;
      return next;
    }),
  toggleTeamCollapsed: (teamId) =>
    set((s) => ({
      collapsedTeams: s.collapsedTeams.includes(teamId)
        ? s.collapsedTeams.filter((t) => t !== teamId)
        : [...s.collapsedTeams, teamId],
    })),
  toggleDark: () => {
    const dark = !get().dark;
    storage.save("dark", dark);
    set({ dark });
  },
  setPanelPct: (pct) => {
    const next = clampPanelPct(pct);
    if (next === get().panelPct) return;
    storage.save("panelPct", next);
    set({ panelPct: next });
  },
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setHelpOpen: (open) => set({ helpOpen: open }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setNodePosition: (id, pos) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, [id]: pos } })),
  resetLayout: () => set({ nodePositions: {} }),

  updateMe: (patch) =>
    set((s) => ({
      me: {
        ...s.me,
        ...patch,
        assessments:
          patch.assessments !== undefined
            ? patch.assessments
            : s.me.assessments,
      },
    })),

  addDomain: (domain) => {
    const id = uid();
    set((s) => ({ domains: [...s.domains, { ...domain, id }] }));
    return id;
  },
  updateDomain: (id, patch) =>
    set((s) => ({
      domains: s.domains.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  deleteDomain: (id) =>
    set((s) => ({
      domains: s.domains.filter((d) => d.id !== id),
      // Untag anything that pointed at this domain.
      teams: s.teams.map((t) =>
        t.domainId === id ? { ...t, domainId: undefined } : t
      ),
      people: s.people.map((p) =>
        p.domainId === id ? { ...p, domainId: undefined } : p
      ),
      managers: s.managers.map((m) =>
        m.domainId === id ? { ...m, domainId: undefined } : m
      ),
      treeDomainId: s.treeDomainId === id ? null : s.treeDomainId,
    })),

  addManager: (manager) =>
    set((s) => ({ managers: [...s.managers, { ...manager, id: uid() }] })),
  updateManager: (id, patch) =>
    set((s) => ({
      managers: s.managers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  updateManagerLeadUp: (id, patch) =>
    set((s) => ({
      managers: s.managers.map((m) =>
        m.id === id ? { ...m, leadUp: { ...m.leadUp, ...patch } } : m
      ),
    })),
  deleteManager: (id) => {
    const before = get();
    set((s) => {
      const { [`mgr:${id}`]: _pos, ...nodePositions } = s.nodePositions;
      return {
        managers: s.managers.filter((m) => m.id !== id),
        ...withoutMeetingsFor(s, "manager", new Set([id])),
        // Topics, notes and wins are all keyed by subject id, managers
        // included — leading up shares the person tables.
        actions: s.actions.filter((a) => a.personId !== id),
        notes: s.notes.filter((n) => n.personId !== id),
        wins: s.wins.filter((w) => w.personId !== id),
        prayers: s.prayers.filter(
          (e) => !(e.subjectKind === "manager" && e.subjectId === id)
        ),
        nodePositions,
      };
    });
    if (before.selectedManagerId === id) goTo(before, null, { replace: true });
  },

  /**
   * One writer for both subject kinds. Every change re-stamps `ratedOn`: the
   * date is what separates a current read from a memory, and it would go stale
   * silently if editing the level left it alone.
   */
  setHealth: (kind, id, level) =>
    set((s) => {
      const apply = <T extends { id: string; health?: Team["health"] }>(x: T): T =>
        x.id !== id
          ? x
          : {
              ...x,
              health: level
                ? { level, note: x.health?.note, ratedOn: todayISO() }
                : undefined,
            };
      return kind === "team"
        ? { teams: s.teams.map(apply) }
        : { people: s.people.map(apply) };
    }),
  setHealthNote: (kind, id, note) =>
    set((s) => {
      const text = note.trim();
      const apply = <T extends { id: string; health?: Team["health"] }>(x: T): T =>
        x.id !== id || !x.health
          ? x
          : { ...x, health: { ...x.health, note: text || undefined } };
      return kind === "team"
        ? { teams: s.teams.map(apply) }
        : { people: s.people.map(apply) };
    }),

  setPrayer: (kind, id, carrying) =>
    set((s) =>
      patchPrayer(s, kind, id, (prayer) =>
        // Already carrying? Taking them up again must not reset the clock —
        // how long you've held someone is the whole point of the date.
        carrying ? (prayer ?? { since: todayISO() }) : undefined
      )
    ),
  setPrayerFocus: (kind, id, focus) =>
    set((s) =>
      patchPrayer(s, kind, id, (prayer) => {
        const text = focus.trim();
        // Writing the focus for someone you weren't carrying takes them up —
        // the sentence is the decision.
        return { ...(prayer ?? { since: todayISO() }), focus: text || undefined };
      })
    ),
  markPrayed: (kind, id) =>
    set((s) =>
      patchPrayer(s, kind, id, (prayer) => {
        const today = todayISO();
        const base = prayer ?? { since: today };
        // Twice in a day is still one day. The count is a record of days held,
        // not a tally to run up.
        if (base.lastPrayedOn === today) return base;
        return { ...base, lastPrayedOn: today, times: (base.times ?? 0) + 1 };
      })
    ),
  addPrayerEntry: (kind, subjectId, text, entryKind = "burden") => {
    const id = uid();
    set((s) => ({
      prayers: [
        ...s.prayers,
        {
          id,
          subjectKind: kind,
          subjectId,
          date: todayISO(),
          kind: entryKind,
          text: text.trim(),
        },
      ],
      // Writing something down for someone starts carrying them. Refusing
      // until a switch had been flipped first would be pure ceremony.
      ...patchPrayer(s, kind, subjectId, (prayer) => prayer ?? { since: todayISO() }),
    }));
    return id;
  },
  updatePrayerEntry: (id, patch) =>
    set((s) => ({
      prayers: s.prayers.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  answerPrayerEntry: (id, note) =>
    set((s) => ({
      prayers: s.prayers.map((e) =>
        e.id === id
          ? {
              ...e,
              answeredOn: e.answeredOn ?? todayISO(),
              answerNote: note?.trim() || e.answerNote,
            }
          : e
      ),
    })),
  reopenPrayerEntry: (id) =>
    set((s) => ({
      prayers: s.prayers.map((e) =>
        e.id === id ? { ...e, answeredOn: undefined, answerNote: undefined } : e
      ),
    })),
  deletePrayerEntry: (id) =>
    set((s) => ({ prayers: s.prayers.filter((e) => e.id !== id) })),

  addTeam: (team) =>
    set((s) => ({
      teams: [
        ...s.teams,
        {
          ...team,
          id: uid(),
          order: s.teams.length,
          ...(team.parentId || team.leaderId
            ? { direction: "down" as const }
            : null),
        },
      ],
    })),
  updateTeam: (id, patch) =>
    set((s) => {
      let next: Partial<Team> = { ...patch };
      // No self-parent or cycles; nested teams always sit below me.
      if (next.parentId === id) next = { ...next, parentId: undefined };
      if (next.parentId && isDescendant(s.teams, id, next.parentId)) {
        next = { ...next, parentId: undefined };
      }
      if (next.parentId) next = { ...next, direction: "down" };
      if (next.direction === "up") next = { ...next, parentId: undefined };
      // A team hangs off exactly one thing: a parent team, a direct report, or
      // me. Handing it to someone lifts it out of any parent team, and it can
      // never be a team I report up to.
      if (next.leaderId) {
        next = { ...next, parentId: undefined, direction: "down" };
      }
      if (next.parentId || next.direction === "up") {
        next = { ...next, leaderId: undefined };
      }
      return {
        teams: s.teams.map((t) => (t.id === id ? { ...t, ...next } : t)),
      };
    }),
  deleteTeam: (id) => {
    const before = get();
    set((s) => {
      const peopleIds = new Set(
        s.people.filter((p) => p.teamId === id).map((p) => p.id)
      );
      const { [`team:${id}`]: _chat, ...chats } = s.chats;
      const { [id]: _pos, ...nodePositions } = s.nodePositions;
      return {
        // Orphan sub-teams rather than cascade-delete them. Teams led by
        // someone on this roster come back to me rather than vanishing with
        // their leader.
        teams: s.teams
          .filter((t) => t.id !== id)
          .map((t) => {
            const orphaned = t.parentId === id;
            const lost = t.leaderId ? peopleIds.has(t.leaderId) : false;
            if (!orphaned && !lost) return t;
            return {
              ...t,
              ...(orphaned ? { parentId: undefined } : null),
              ...(lost ? { leaderId: undefined } : null),
            };
          }),
        people: s.people.filter((p) => p.teamId !== id),
        actions: s.actions.filter((a) => !peopleIds.has(a.personId)),
        ...(() => {
          const viaPeople = withoutMeetingsFor(s, "person", peopleIds);
          const doomed = new Set(
            s.meetings
              .filter((m) => m.subjectKind === "team" && m.subjectId === id)
              .map((m) => m.id)
          );
          return {
            meetings: viaPeople.meetings.filter((m) => !doomed.has(m.id)),
            sessions: viaPeople.sessions.filter((o) => !doomed.has(o.meetingId)),
          };
        })(),
        goals: s.goals.filter((g) => !peopleIds.has(g.personId)),
        notes: s.notes.filter((n) => !peopleIds.has(n.personId)),
        wins: s.wins.filter((w) => !peopleIds.has(w.personId)),
        prayers: s.prayers.filter((e) =>
          e.subjectKind === "team"
            ? e.subjectId !== id
            : !(e.subjectKind === "person" && peopleIds.has(e.subjectId))
        ),
        teamActions: s.teamActions.filter((a) => a.teamId !== id),
        teamGoals: s.teamGoals.filter((g) => g.teamId !== id),
        teamNotes: s.teamNotes.filter((n) => n.teamId !== id),
        chats,
        nodePositions,
        collapsedTeams: s.collapsedTeams.filter((t) => t !== id),
      };
    });
    const hitPerson = before.people.some(
      (p) => p.teamId === id && p.id === before.selectedPersonId
    );
    if (before.selectedTeamId === id || hitPerson)
      goTo(before, null, { replace: true });
  },

  addTeamAction: (teamId, text, dueDate) =>
    set((s) => ({
      teamActions: [
        ...s.teamActions,
        { id: uid(), teamId, text, done: false, dueDate },
      ],
    })),
  updateTeamAction: (id, patch) =>
    set((s) => ({
      teamActions: s.teamActions.map((a) =>
        a.id === id ? { ...a, ...patch } : a
      ),
    })),
  toggleTeamAction: (id) =>
    set((s) => ({
      teamActions: s.teamActions.map((a) =>
        a.id === id ? { ...a, done: !a.done } : a
      ),
    })),
  deleteTeamAction: (id) =>
    set((s) => ({ teamActions: s.teamActions.filter((a) => a.id !== id) })),
  restoreTeamAction: (action) =>
    set((s) => ({ teamActions: [...s.teamActions, action] })),

  addTeamGoal: (teamId, title) =>
    set((s) => ({
      teamGoals: [...s.teamGoals, { id: uid(), teamId, title, progress: 0 }],
    })),
  updateTeamGoal: (id, patch) =>
    set((s) => ({
      teamGoals: s.teamGoals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
  deleteTeamGoal: (id) =>
    set((s) => ({ teamGoals: s.teamGoals.filter((g) => g.id !== id) })),
  restoreTeamGoal: (goal) =>
    set((s) => ({ teamGoals: [...s.teamGoals, goal] })),

  addTeamNote: (teamId, body) =>
    set((s) => ({
      teamNotes: [
        ...s.teamNotes,
        { id: uid(), teamId, body, date: new Date().toISOString().slice(0, 10) },
      ],
    })),
  deleteTeamNote: (id) =>
    set((s) => ({ teamNotes: s.teamNotes.filter((n) => n.id !== id) })),

  addPerson: (person) => {
    const id = uid();
    set((s) => ({
      people: [
        ...s.people,
        {
          assessments: {},
          strengths: [],
          watchOuts: [],
          customModalities: [],
          ...person,
          id,
        },
      ],
    }));
    return id;
  },
  updatePerson: (id, patch) =>
    set((s) => ({
      people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),
  updateLeadUp: (personId, patch) =>
    set((s) => ({
      people: s.people.map((p) =>
        p.id === personId ? { ...p, leadUp: { ...p.leadUp, ...patch } } : p
      ),
    })),
  deletePerson: (id) => {
    const before = get();
    set((s) => {
      const { [`person:${id}`]: _pos, ...nodePositions } = s.nodePositions;
      return {
        people: s.people.filter((p) => p.id !== id),
        // Teams they led come back to me — losing the leader must not lose
        // the team.
        teams: s.teams.map((t) =>
          t.leaderId === id ? { ...t, leaderId: undefined } : t
        ),
        actions: s.actions.filter((a) => a.personId !== id),
        ...withoutMeetingsFor(s, "person", new Set([id])),
        goals: s.goals.filter((g) => g.personId !== id),
        notes: s.notes.filter((n) => n.personId !== id),
        wins: s.wins.filter((w) => w.personId !== id),
        prayers: s.prayers.filter(
          (e) => !(e.subjectKind === "person" && e.subjectId === id)
        ),
        nodePositions,
      };
    });
    // Step up to the team they were on, same as closing their panel.
    if (before.selectedPersonId === id) {
      const teamId = before.people.find((p) => p.id === id)?.teamId;
      goTo(before, teamId ? { kind: "team", id: teamId } : null, {
        replace: true,
      });
    }
  },
  movePerson: (personId, teamId) =>
    set((s) => ({
      people: s.people.map((p) => (p.id === personId ? { ...p, teamId } : p)),
    })),

  addAction: (personId, text, dueDate, column = "backlog") =>
    set((s) => ({
      actions: [
        ...s.actions,
        {
          id: uid(),
          personId,
          text,
          done: column === "done",
          dueDate,
          column,
        },
      ],
    })),
  updateAction: (id, patch) =>
    set((s) => ({
      actions: s.actions.map((a) => {
        if (a.id !== id) return a;
        const next = { ...a, ...patch };
        if (patch.column !== undefined) {
          next.done = patch.column === "done";
        } else if (patch.done !== undefined) {
          next.column = patch.done ? "done" : a.column === "done" ? "backlog" : a.column;
        }
        return next;
      }),
    })),
  setActionColumn: (id, column) =>
    set((s) => ({
      actions: s.actions.map((a) =>
        a.id === id ? { ...a, column, done: column === "done" } : a
      ),
    })),
  toggleAction: (id) =>
    set((s) => ({
      actions: s.actions.map((a) => {
        if (a.id !== id) return a;
        const done = !a.done;
        return {
          ...a,
          done,
          column: done ? "done" : a.column === "done" ? "backlog" : a.column,
        };
      }),
    })),
  deleteAction: (id) =>
    set((s) => ({ actions: s.actions.filter((a) => a.id !== id) })),

  addTopic: (meetingId, text, opts = {}) => {
    const id = uid();
    set((s) => ops.addTopic(s, id, meetingId, text, opts));
    return id;
  },
  updateTopic: (id, patch) => set((s) => ops.updateTopic(s, id, patch)),
  placeTopic: (id, target) =>
    set((s) => ({
      topics: s.topics.map((t) => {
        if (t.id !== id) return t;
        // Dragging a covered card back onto the board reopens it — the board
        // only ever shows what's still live, so being there means it is.
        const reopened = { ...t, status: "open" as const, closedOn: undefined };
        const tagIds = slotTagIds(
          s.meetings,
          t.meetingId,
          t.tagIds,
          target.slotId,
          t.slotId ?? ""
        );
        if ("sessionId" in target) {
          return {
            ...reopened,
            sessionId: target.sessionId,
            slotId: target.slotId,
            tagIds,
          };
        }
        // Parked is defer-not-now; the tag stays so it returns to the same
        // skeleton cell when it comes back.
        if (target.lane === "parked") {
          return { ...reopened, lane: "parked", sessionId: undefined };
        }
        return {
          ...reopened,
          lane: target.lane,
          sessionId: undefined,
          slotId: target.slotId,
          tagIds,
        };
      }),
    })),
  placeTopicAt: (id, target, index) =>
    set((s) => ops.placeTopicAt(s, id, target, index)),

  captureTopics: (raw, target, index) => {
    let created: string[] = [];
    set((s) => {
      const result = ops.captureTopics(s, raw, target ?? undefined, index);
      created = result.created;
      return result.patch;
    });
    return created;
  },

  returnTopic: (id) => set((s) => ops.returnTopic(s, id)),

  // Loose topics roll onto the next occurrence — see `ops.sweepReturns`.
  sweepReturns: () => {
    let count = 0;
    set((s) => {
      const result = ops.sweepReturns(s);
      count = result.count;
      return result.patch;
    });
    return count;
  },

  addTag: (label) => {
    if (!label.trim()) return "";
    const id = uid();
    set((s) => ops.addTag(s, id, label));
    return id;
  },
  updateTag: (id, patch) => set((s) => ops.updateTag(s, id, patch)),
  deleteTag: (id) => set((s) => ops.deleteTag(s, id)),

  tagTopics: (ids, tagId, on) => set((s) => ops.tagTopics(s, ids, tagId, on)),
  assignTopics: (ids, meetingId) => set((s) => ops.assignTopics(s, ids, meetingId)),
  parkTopics: (ids, parked) => set((s) => ops.parkTopics(s, ids, parked)),
  deleteTopics: (ids) => set((s) => ops.deleteTopics(s, ids)),

  addFollowUp: (subjectKind, subjectId, text, opts = {}) => {
    if (!text.trim()) return "";
    const id = uid();
    set((s) => ops.addFollowUp(s, id, subjectKind, subjectId, text, opts));
    return id;
  },
  toggleFollowUp: (id) => set((s) => ops.toggleFollowUp(s, id)),
  deleteFollowUp: (id) => set((s) => ops.deleteFollowUp(s, id)),
  promoteToFollowUp: (topicId) => set((s) => ops.promoteToFollowUp(s, topicId)),

  coverTopic: (id, covered = true) => set((s) => ops.coverTopic(s, id, covered)),
  rollTopic: (id, sessionId) => set((s) => ops.rollTopic(s, id, sessionId)),
  deleteTopic: (id) =>
    set((s) => ({ topics: s.topics.filter((t) => t.id !== id) })),
  // The board sorts by `order`, so the card comes back in its own place
  // rather than at the end of the lane.
  restoreTopic: (topic) => set((s) => ({ topics: [...s.topics, topic] })),
  moveTopic: (id, direction) => {
    const result = ops.moveTopic(get(), id, direction);
    if (!result) return null;
    set(result.patch);
    return { index: result.index, total: result.total };
  },

  trackMeeting: (subjectKind, subjectId, rhythm, patch) => {
    const existing = get().meetings.find(
      (m) => m.subjectKind === subjectKind && m.subjectId === subjectId
    );
    if (existing) {
      get().updateMeeting(existing.id, { rhythm, ...patch });
      return existing.id;
    }
    return get().createMeeting(subjectKind, subjectId, { rhythm, ...patch });
  },
  createMeeting: (subjectKind, subjectId, patch) => {
    const id = uid();
    set((s) => ops.createMeeting(s, id, subjectKind, subjectId, patch));
    return id;
  },
  updateMeeting: (id, patch) => set((s) => ops.updateMeeting(s, id, patch)),
  setCurriculum: (meetingId, curriculum) =>
    set((s) => ops.setCurriculum(s, meetingId, curriculum)),
  moveOccurrence: (meetingId, from, to, scope) => {
    let result = "";
    set((s) => {
      const moved = ops.moveOccurrence(s, meetingId, from, to, scope);
      result = moved.sessionId;
      return moved.patch;
    });
    return result;
  },
  skipOccurrence: (meetingId, from) =>
    set((s) => ops.skipOccurrence(s, meetingId, from)),
  restoreOccurrence: (sessionId) => set((s) => ops.restoreOccurrence(s, sessionId)),
  addExtraOccurrence: (meetingId, date) => {
    let result = "";
    set((s) => {
      const added = ops.addExtraOccurrence(s, meetingId, date);
      result = added.sessionId;
      return added.patch;
    });
    return result;
  },
  setMeetingWeekday: (meetingId, weekday) =>
    set((s) => ops.setMeetingWeekday(s, meetingId, weekday)),
  addMeetingRow: (meetingId, label) => {
    let slotId: string | undefined;
    set((s) => {
      const added = ops.addMeetingRow(s, meetingId, label);
      slotId = added?.slotId;
      return added?.patch ?? {};
    });
    return slotId;
  },
  untrackMeeting: (id) => set((s) => ops.untrackMeeting(s, id)),
  setNoMeeting: (subjectKind, subjectId, value) =>
    set((s) => ops.setNoMeeting(s, subjectKind, subjectId, value)),

  addSession: (o) => {
    const id = uid();
    set((s) => ops.addSession(s, id, o));
    return id;
  },
  updateSession: (id, patch) => set((s) => ops.updateSession(s, id, patch)),
  deleteSession: (id) => set((s) => ops.deleteSession(s, id)),

  addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid() }] })),
  updateGoal: (id, patch) =>
    set((s) => ({
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
  deleteGoal: (id) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
  restoreGoal: (goal) => set((s) => ({ goals: [...s.goals, goal] })),

  addNote: (personId, body) => {
    const id = uid();
    set((s) => ({
      notes: [
        ...s.notes,
        {
          id,
          personId,
          body,
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    }));
    return id;
  },
  updateNote: (id, patch) =>
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),
  deleteNote: (id) =>
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

  addWin: (win) =>
    set((s) => ({
      wins: [
        ...s.wins,
        {
          ...win,
          id: uid(),
          date: win.date ?? new Date().toISOString().slice(0, 10),
        },
      ],
    })),
  updateWin: (id, patch) =>
    set((s) => ({
      wins: s.wins.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    })),
  deleteWin: (id) =>
    set((s) => ({ wins: s.wins.filter((w) => w.id !== id) })),

  appendChat: (key, msg) =>
    set((s) => ({
      chats: { ...s.chats, [key]: [...(s.chats[key] ?? []), msg] },
    })),
  clearChat: (key) =>
    set((s) => ({ chats: { ...s.chats, [key]: [] } })),

  // --- auth / lifecycle -----------------------------------------------------
  /**
   * Resolve the current session and load (or seed) the user's cloud data.
   * Called once at startup and again whenever auth state changes.
   */
  bootstrap: async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) {
      repo.clearBaseline(); // clear any prior baseline
      set({ phase: "anon", userId: null, userEmail: null, ...blankData() });
      return;
    }
    const userId = session.user.id;
    const email = session.user.email ?? null;
    // Avoid redundant reloads if we're already ready for this user.
    if (get().phase === "ready" && get().userId === userId) return;

    // Paint the local copy first when there is one. The full-screen skeleton
    // is then reserved for the case where there is genuinely nothing to show,
    // instead of being the cost of every return visit.
    const cached = loadDoc(userId);
    // Only a document painted from this device's copy can hold rows the
    // server has lost; a fresh network load has nothing to compare.
    firstRefresh = Boolean(cached);
    if (cached) {
      const base =
        cached.pendingWrite &&
        cached.base &&
        !isIncompletePersistedDoc(cached.doc) &&
        !isIncompletePersistedDoc(cached.base)
          ? rescueOrphanTopics(migrateDoc(cached.base))
          : null;
      let painted = rescueOrphanTopics(migrateDoc(cached.doc));
      if (base) painted = relink(painted, base);
      get().hydrate(painted, userId, email, {
        fromCache: true,
        premigrated: true,
        baseline: base ?? undefined,
      });
      if (cached.pendingWrite && base) {
        // Offline edits with a record of what the server had: push exactly
        // those rows, then fold in whatever happened elsewhere meanwhile.
        void runSync(userId).then(() => revalidate(userId, email));
      } else if (cached.pendingWrite) {
        // These edits were made without a connection. The server has never
        // seen this document, so there is nothing to refresh *from* — drop the
        // baseline and push the whole thing up instead.
        //
        // Exception: a buggy extract once cached docs that omitted newer
        // collections (`tags`, `followUps`). Migrating those holes to `[]` and
        // full-pushing would wipe the server tables. Repair against the
        // server first.
        if (isIncompletePersistedDoc(cached.doc)) {
          void recoverIncompletePendingWrite(
            userId,
            email,
            cached.doc,
            get().hydrate
          );
        } else {
          repo.clearBaseline();
          fullSyncPending = true;
          // Push first so the offline edits are safe, then read the server so
          // this device stops being the only one that knows what it holds.
          // Without the refresh it would never reconcile, and so would spend
          // the whole session unable to propagate a deletion.
          void runSync(userId).then(() => revalidate(userId, email));
        }
      } else {
        void revalidate(userId, email);
      }
      return;
    }

    set({ phase: "loading" });
    try {
      let doc = await repo.loadAll(userId);
      if (!doc) {
        // Brand-new account: adopt legacy local data if present, else seed.
        doc = importLegacyLocalData() ?? seedData();
        await repo.writeAll(userId, doc);
      }
      get().hydrate(doc, userId, email);
    } catch (e) {
      console.error("LeadWell: failed to load cloud data", e);
      // A dropped connection is not a failed sign-in. Keep the session and
      // offer a retry — dropping to the login screen mid-commute was
      // indistinguishable from being signed out.
      set({
        phase: "error",
        loadError:
          e instanceof Error && e.message
            ? e.message
            : "We couldn't reach your data.",
      });
      scheduleBootstrapRetry();
    }
  },

  retryBootstrap: async () => {
    clearBootstrapRetry();
    bootstrapAttempts = 0;
    set({ phase: "loading", loadError: null });
    await get().bootstrap();
  },

  hydrate: (rawDoc, userId, email, opts) => {
    clearBootstrapRetry();
    bootstrapAttempts = 0;
    // Every load path lands here — cache, network, import, refresh — so this is
    // the one place a stale shape has to be made safe.
    const migrated = opts?.premigrated ? rawDoc : migrateDoc(rawDoc);
    const doc = opts?.premigrated ? rawDoc : rescueOrphanTopics(migrated);
    // Record the baseline BEFORE the doc lands in the store, so the resulting
    // change event syncs exactly the difference. The baseline is the doc
    // *before* orphan rescue, so rescued topics are written back — otherwise
    // they stay stranded on the server and get rescued again on every load.
    repo.setBaseline(opts?.baseline ?? migrated);
    // Keep the local copy level with whatever we just adopted, so the next
    // cold open has something to paint. Skipped when this *is* that copy —
    // re-serializing it would put the cost back on the boot path.
    if (!opts?.fromCache) saveDoc(userId, doc, { pendingWrite: false });
    set({
      ...doc,
      userId,
      userEmail: email,
      phase: "ready",
      loadError: null,
      // Selection is not cleared: the URL survives sign-in, so a deep link
      // opens the entity it named. App drops the selection if the id is stale.
    });

    /*
     * Hand back anything an occurrence passed without covering.
     *
     * Done on load rather than on a schedule because there is no server-side
     * job to run it, and "when you next open the app" is exactly when the
     * answer matters. It is idempotent — a topic leaves its session the first
     * time and has nothing to return from afterwards — so a second hydrate
     * from the cache-then-network path is a no-op.
     */
    get().sweepReturns();
  },

  signOut: async () => {
    // Flush any pending debounced write first — otherwise a delete/edit in the
    // last ~600ms is lost when we clear the session.
    await flushPendingSync();
    const userId = get().userId;
    await supabase.auth.signOut();
    // The local copy outlives the session unless we say otherwise, and the
    // next person to open this browser is not necessarily the same person.
    // The search index and what it was recently asked for are that same copy,
    // held in another shape.
    if (userId) {
      clearDoc(userId);
      clearRecents(userId);
    }
    clearIndex();
    clearUndo();
    repo.clearBaseline();
    fullSyncPending = false;
    set({ phase: "anon", userId: null, userEmail: null, ...blankData() });
  },

  resetToSeed: async () => {
    const userId = get().userId;
    if (!userId) return;
    const doc = seedData();
    await repo.wipeUser(userId);
    await repo.writeAll(userId, doc);
    get().hydrate(doc, userId, get().userEmail);
  },
}));

// Persist data changes to Supabase, debounced. UI state stays session-only
// (dark mode persists to localStorage in toggleDark). repo.syncData compares
// each collection by reference against the last baseline and writes only the
// tables that actually changed. PERSISTED_KEYS is declared with the document
// helpers above so bootstrap and extractData share one list.


/** The next refresh is the first since boot — the one that may find lost rows. */
let firstRefresh = true;
let refreshing: Promise<void> | null = null;
let lastRefreshAt = 0;

/**
 * Fold the server's current document into the one on screen.
 *
 * Runs after a cache paint, when the tab comes back into view, and on a slow
 * timer while it stays open — a tab left open for a week must see what was
 * captured on the phone before it is allowed to edit next to it. Quiet by
 * design: the app is already usable, so nothing here may take it away.
 */
function revalidate(userId: string, email: string | null): Promise<void> {
  if (refreshing) return refreshing;
  const job = (async () => {
    lastRefreshAt = Date.now();
    try {
      // A write in flight when the read starts may or may not be in the
      // response. Let it land, so `base` describes what the server holds.
      if (syncInFlight) await syncInFlight;
      const base = repo.getBaseline();
      const server = await repo.loadAll(userId);
      // Nothing on the server for this user — an account wiped elsewhere, or a
      // cache that outlived its data. Leave what's on screen alone.
      if (!server) return;
      if (syncInFlight) await syncInFlight;
      const state = useStore.getState();
      if (state.userId !== userId || state.phase !== "ready") return;
      const serverDoc = migrateDoc(server);
      const fresh = rescueOrphanTopics(serverDoc);
      const { doc, missing, missingCount } = mergeServer(
        extractData(state),
        base,
        fresh
      );
      const offer = firstRefresh && missingCount > 0;
      firstRefresh = false;
      // Baseline is the server as stored (pre-rescue), so repairs get written.
      state.hydrate(doc, userId, email, { baseline: serverDoc, premigrated: true });
      if (offer) offerRecovery(userId, missing, missingCount);
    } catch (e) {
      // There is a document on screen and the app works. A failed refresh is
      // not an error screen — the write path surfaces connectivity on its own.
      console.error("LeadWell: background refresh failed", e);
    }
  })().finally(() => {
    if (refreshing === job) refreshing = null;
  });
  refreshing = job;
  return job;
}

/** Refresh if the last one is old enough to be worth a round trip. */
function refreshIfStale(minAgeMs: number) {
  const state = useStore.getState();
  if (state.phase !== "ready" || !state.userId) return;
  if (Date.now() - lastRefreshAt < minAgeMs) return;
  void revalidate(state.userId, state.userEmail);
}

/** Exponential backoff for a failed initial load, capped so it keeps trying. */
let bootstrapAttempts = 0;
let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;

function clearBootstrapRetry() {
  if (bootstrapRetryTimer) {
    clearTimeout(bootstrapRetryTimer);
    bootstrapRetryTimer = null;
  }
}

function scheduleBootstrapRetry() {
  clearBootstrapRetry();
  bootstrapAttempts += 1;
  const delay = Math.min(30_000, 1_000 * 2 ** (bootstrapAttempts - 1));
  bootstrapRetryTimer = setTimeout(() => {
    bootstrapRetryTimer = null;
    if (useStore.getState().phase === "error") {
      void useStore.getState().bootstrap();
    }
  }, delay);
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;
/**
 * A cache holding unsynced edits was adopted at boot. There is no baseline
 * that reflects what the server has, so the next sync must write every table
 * rather than diff against one. `syncData` already does exactly that when the
 * baseline is null — this flag is what keeps the usual "nothing loaded yet, so
 * don't write" guard from swallowing it.
 */
let fullSyncPending = false;

/** Whether a write is allowed: we've loaded, or we're pushing a cached doc. */
function canSync(): boolean {
  return repo.hasBaseline() || fullSyncPending;
}

/** Edits exist that the server hasn't confirmed — pending, retrying, or in flight. */
function hasUnsyncedEdits(): boolean {
  return Boolean(syncTimer || syncRetryTimer || syncInFlight || fullSyncPending);
}
/** More edits arrived while a sync was writing — coalesce another pass. */
let syncQueued = false;
/** Consecutive failed writes, driving the retry backoff. */
let syncFailures = 0;
let syncRetryTimer: ReturnType<typeof setTimeout> | null = null;

function clearSyncRetry() {
  if (syncRetryTimer) {
    clearTimeout(syncRetryTimer);
    syncRetryTimer = null;
  }
}

function scheduleSyncRetry(userId: string) {
  clearSyncRetry();
  syncFailures += 1;
  const delay = Math.min(30_000, 1_000 * 2 ** (syncFailures - 1));
  syncRetryTimer = setTimeout(() => {
    syncRetryTimer = null;
    void runSync(userId);
  }, delay);
}

function extractData(state: Store): PersistedData {
  return Object.fromEntries(
    PERSISTED_KEYS.map((k) => [k, state[k]])
  ) as PersistedData;
}

/**
 * Persist the latest store to Supabase. Overlapping syncs are serialized and
 * coalesced so a slow earlier write cannot upsert a stale people list after a
 * delete/move (which was resurrecting removed pod members on reload).
 */
function runSync(userId: string): Promise<void> {
  if (syncInFlight) {
    syncQueued = true;
    return syncInFlight;
  }

  const job = (async () => {
    do {
      syncQueued = false;
      const latest = useStore.getState();
      if (latest.phase !== "ready" || latest.userId !== userId || !canSync()) {
        return;
      }
      try {
        useStore.setState({ syncStatus: "saving" });
        const written = extractData(latest);
        await repo.syncData(userId, written);
        syncFailures = 0;
        fullSyncPending = false;
        clearSyncRetry();
        // Cache exactly what the server now holds. Marking it clean is what
        // lets the next cold open refresh from the server instead of pushing
        // this document back up.
        saveDoc(userId, written, { pendingWrite: false });
        useStore.setState({ syncStatus: "idle" });
      } catch (e) {
        console.error("LeadWell: cloud sync failed", e);
        scheduleSyncRetry(userId);
        // The edits are real and the server doesn't have them. Keep them where
        // a hard quit can't take them, and mark them as still owed.
        saveDoc(userId, extractData(useStore.getState()), {
          pendingWrite: true,
          base: repo.getBaseline(),
        });
        // Not "idle" — a retry is pending and the edit is not on the server
        // yet. Reporting that as saved is the one lie the UI cannot afford.
        useStore.setState({ syncStatus: "error" });
        return;
      }
    } while (syncQueued);
  })().finally(() => {
    if (syncInFlight === job) syncInFlight = null;
  });

  syncInFlight = job;
  return job;
}

/** Write the current store to Supabase immediately (cancels a pending debounce). */
async function flushPendingSync(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  const latest = useStore.getState();
  if (latest.phase !== "ready" || !latest.userId || !canSync()) {
    if (syncInFlight) await syncInFlight;
    return;
  }
  // Mark dirty so an in-flight sync loops with the latest snapshot instead of
  // racing a second parallel upsert.
  await runSync(latest.userId);
}

function scheduleSync(userId: string): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void runSync(userId);
  }, 600);
}

useStore.subscribe((state, prev) => {
  if (state.phase !== "ready" || !state.userId) return;
  if (!PERSISTED_KEYS.some((k) => state[k] !== prev[k])) return;
  if (!canSync()) return;
  scheduleSync(state.userId);
});

// Flush pending cloud writes when the tab is backgrounded or closed so a
// quick refresh / OAuth redirect doesn't drop the last edit.
if (typeof window !== "undefined") {
  const flush = () => {
    // Local copy first, and synchronously. The cloud write below is an async
    // `fetch` that a backgrounded tab is entirely free to abandon — iOS
    // reclaiming the tab is the normal case, not the edge case — but by the
    // time this line returns, the last 600ms of edits are on disk. The cloud
    // write then gets its chance, and the retry machinery covers the rest.
    const state = useStore.getState();
    if (state.phase === "ready" && state.userId && hasUnsyncedEdits()) {
      saveDoc(state.userId, extractData(state), {
        pendingWrite: true,
        base: repo.getBaseline(),
      });
    }
    void flushPendingSync();
  };
  window.addEventListener("pagehide", flush);

  /**
   * Connectivity came back, or the user returned to a backgrounded tab. Retry
   * whatever stalled — a failed load and a failed write are both recoverable
   * without a reload, which is the normal case on a phone.
   */
  const recover = () => {
    const state = useStore.getState();
    if (state.phase === "error") {
      void state.retryBootstrap();
      return;
    }
    if (state.userId && (syncRetryTimer || syncTimer)) {
      clearSyncRetry();
      syncFailures = 0;
      void runSync(state.userId);
    }
    // Whatever happened on other devices while this tab sat in the background.
    refreshIfStale(15_000);
  };

  window.addEventListener("online", recover);
  window.addEventListener("focus", () => refreshIfStale(15_000));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
    else recover();
  });
  // An open, visible tab still drifts: poll gently.
  setInterval(() => {
    if (document.visibilityState === "visible") refreshIfStale(90_000);
  }, 30_000);
}

// Re-run bootstrap on sign-in / sign-out / token refresh from Supabase.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    // Covers the sign-outs the store didn't initiate — an expired refresh
    // token, a sign-out in another tab. The local copy must not outlive the
    // session that was allowed to read it.
    const { userId } = useStore.getState();
    if (userId) {
      clearDoc(userId);
      clearRecents(userId);
    }
    clearIndex();
    clearUndo();
    repo.clearBaseline();
    fullSyncPending = false;
    useStore.setState({
      phase: "anon",
      userId: null,
      userEmail: null,
      ...blankData(),
    });
    return;
  }
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    // Defer: calling Supabase inside the auth callback can deadlock the lock
    // it holds, so hop out of the callback before loading data.
    setTimeout(() => void useStore.getState().bootstrap(), 0);
  }
});
