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
  Session,
  Person,
  Team,
  TeamAction,
  TrackedMeeting,
  MeetingRhythm,
  MeetingSubjectKind,
  TeamGoal,
  LeadUpProfile,
  Win,
} from "../types";
import { storage } from "../lib/storage";
import { todayISO, type HealthFilterValue } from "../lib/health";
import { isDescendant, personDomainId } from "../lib/teams";
import { supabase } from "../lib/supabase";
import * as repo from "../lib/repo";
import type { NodePosition, PersistedData } from "../lib/repo";
import { emptyMe } from "../lib/repo";
import {
  capUp,
  seedActions,
  seedCapacities,
  seedMeetings,
  seedDomains,
  seedGoals,
  seedManagers,
  seedMe,
  seedNotes,
  seedSessions,
  seedPeople,
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

/** Independent show/hide layers on org-tree team cards. */
export type TreeLayer =
  | "people"
  | "mandate"
  | "action"
  | "giftMix"
  | "detail"
  | "readiness"
  | "health";
export type TreeLayers = Record<TreeLayer, boolean>;

export type { NodePosition, PersistedData } from "../lib/repo";

/** Auth/loading lifecycle for the whole app. */
export type Phase = "loading" | "anon" | "ready";

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
  /** Canvas card layers — toggle what each team card surfaces. */
  treeLayers: TreeLayers;
  selectedPersonId: string | null;
  selectedTeamId: string | null;
  /** Side panel open for a manager I report to (leading-up profile). */
  selectedManagerId: string | null;
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
  askAIOpen: boolean;
  modal: ModalState;
  settingsOpen: boolean;
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
    toggleTreeLayer: (layer: TreeLayer) => void;
    selectPerson: (id: string | null) => void;
    selectTeam: (id: string | null) => void;
    selectManager: (id: string | null) => void;
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
    setAskAIOpen: (open: boolean) => void;
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
    // teams
    addTeam: (team: Omit<Team, "id" | "order">) => void;
    updateTeam: (id: string, patch: Partial<Team>) => void;
    deleteTeam: (id: string) => void;
    // team-level records
    addTeamAction: (teamId: string, text: string, dueDate?: string) => void;
    updateTeamAction: (id: string, patch: Partial<Pick<TeamAction, "text" | "dueDate" | "done">>) => void;
    toggleTeamAction: (id: string) => void;
    deleteTeamAction: (id: string) => void;
    addTeamGoal: (teamId: string, title: string) => void;
    updateTeamGoal: (id: string, patch: Partial<TeamGoal>) => void;
    deleteTeamGoal: (id: string) => void;
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
    // tracked meetings — the unit readiness is measured against
    /** Opt in to being ready for a meeting with this subject. Returns its id. */
    trackMeeting: (
      subjectKind: MeetingSubjectKind,
      subjectId: string,
      rhythm: MeetingRhythm,
      patch?: Partial<Omit<TrackedMeeting, "id" | "subjectKind" | "subjectId">>
    ) => string;
    updateMeeting: (id: string, patch: Partial<Omit<TrackedMeeting, "id">>) => void;
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
    hydrate: (data: PersistedData, userId: string, email: string | null) => void;
    signOut: () => Promise<void>;
    // data management
    resetToSeed: () => Promise<void>;
  };

const DATA_KEY = "data";
const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Tracking a meeting answers the opt-in question outright, so any lingering
 * "no meeting" decision on that subject is stale.
 */
function clearNoMeeting(
  s: Store,
  kind: MeetingSubjectKind,
  subjectId: string
): Partial<Store> {
  if (kind === "person") {
    return {
      people: s.people.map((p) =>
        p.id === subjectId && p.noMeeting ? { ...p, noMeeting: undefined } : p
      ),
    };
  }
  if (kind === "team") {
    return {
      teams: s.teams.map((t) =>
        t.id === subjectId && t.noMeeting ? { ...t, noMeeting: undefined } : t
      ),
    };
  }
  return {
    managers: s.managers.map((m) =>
      m.id === subjectId && m.noMeeting ? { ...m, noMeeting: undefined } : m
    ),
  };
}

/** Meetings for a set of subjects, plus every session under them. */
function withoutMeetingsFor(
  s: Store,
  kind: MeetingSubjectKind,
  subjectIds: Set<string>
): Pick<Store, "meetings" | "sessions"> {
  const doomed = new Set(
    s.meetings
      .filter((m) => m.subjectKind === kind && subjectIds.has(m.subjectId))
      .map((m) => m.id)
  );
  return {
    meetings: s.meetings.filter((m) => !doomed.has(m.id)),
    sessions: s.sessions.filter((o) => !doomed.has(o.meetingId)),
  };
}

function migrateActions(actions: Action[]): Action[] {
  return actions.map((a) => ({
    ...a,
    column: a.column ?? (a.done ? "done" : "backlog"),
  }));
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
    sessions: seedSessions,
    goals: seedGoals,
    notes: seedNotes,
    wins: seedWins,
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
    sessions: [],
    goals: [],
    notes: [],
    wins: [],
    teamActions: [],
    teamGoals: [],
    teamNotes: [],
    chats: {},
    nodePositions: {},
  };
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
  userId: null,
  userEmail: null,
  tab: "tree",
  treeDomainId: null,
  healthScan: [],
  treeLayers: {
    people: false,
    mandate: true,
    action: true,
    giftMix: false,
    detail: false,
    readiness: true,
    health: true,
  },
  selectedPersonId: null,
  selectedTeamId: null,
  selectedManagerId: null,
  selectedMe: false,
  focused: false,
  section: null,
  sessionId: null,
  collapsedTeams: [],
  dark: initialDark(),
  askAIOpen: false,
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
  toggleTreeLayer: (layer) =>
    set((s) => ({
      treeLayers: { ...s.treeLayers, [layer]: !s.treeLayers[layer] },
      // Scanning for a level with the layer hidden shows a filtered canvas
      // that can't say why anything dimmed — turning the layer off drops the
      // scan with it.
      ...(layer === "health" && s.treeLayers.health
        ? { healthScan: [] }
        : null),
    })),
  /**
   * Closing a person steps up to their team rather than dismissing outright —
   * the breadcrumb parent is where you came from, so that's where back goes.
   */
  selectPerson: (id) => {
    const s = get();
    if (!id) {
      const teamId = s.people.find((p) => p.id === s.selectedPersonId)?.teamId;
      goTo(s, teamId ? { kind: "team", id: teamId } : null);
      return;
    }
    goTo(s, { kind: "person", id });
  },
  selectTeam: (id) => goTo(get(), id ? { kind: "team", id } : null),
  // A manager stands above me on the canvas — always reached from the tree.
  selectManager: (id) => {
    const s = get();
    if (!id) {
      goTo(s, null);
      return;
    }
    const sel: Selection = { kind: "manager", id };
    if (s.focused) go(routePath({ view: "focus", target: sel }));
    else goTab(s, sel, "tree");
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
        selectedMe: false,
      };
      if (!sel) return next;
      // A person's team is derived at read time (useActiveTeamId), not stored:
      // a deep link applies its route before the cloud data has loaded, so any
      // lookup done here would resolve against an empty store.
      if (sel.kind === "person") next.selectedPersonId = sel.id;
      else if (sel.kind === "team") next.selectedTeamId = sel.id;
      else if (sel.kind === "manager") next.selectedManagerId = sel.id;
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
  setAskAIOpen: (open) => set({ askAIOpen: open }),
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

  trackMeeting: (subjectKind, subjectId, rhythm, patch) => {
    const existing = get().meetings.find(
      (m) => m.subjectKind === subjectKind && m.subjectId === subjectId
    );
    if (existing) {
      get().updateMeeting(existing.id, { rhythm, ...patch });
      return existing.id;
    }
    const id = uid();
    set((s) => ({
      meetings: [
        ...s.meetings,
        { id, subjectKind, subjectId, rhythm, ...patch },
      ],
      // Tracking answers the opt-in question, so the decision flag is moot.
      ...clearNoMeeting(s, subjectKind, subjectId),
    }));
    return id;
  },
  updateMeeting: (id, patch) =>
    set((s) => ({
      meetings: s.meetings.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  untrackMeeting: (id) =>
    set((s) => ({
      meetings: s.meetings.filter((m) => m.id !== id),
      sessions: s.sessions.filter((o) => o.meetingId !== id),
    })),
  setNoMeeting: (subjectKind, subjectId, value) =>
    set((s) => {
      const flag = value ? true : undefined;
      if (subjectKind === "person") {
        return {
          people: s.people.map((p) =>
            p.id === subjectId ? { ...p, noMeeting: flag } : p
          ),
        };
      }
      if (subjectKind === "team") {
        return {
          teams: s.teams.map((t) =>
            t.id === subjectId ? { ...t, noMeeting: flag } : t
          ),
        };
      }
      return {
        managers: s.managers.map((m) =>
          m.id === subjectId ? { ...m, noMeeting: flag } : m
        ),
      };
    }),

  addSession: (o) => {
    const id = uid();
    set((s) => ({ sessions: [...s.sessions, { ...o, id }] }));
    return id;
  },
  updateSession: (id, patch) =>
    set((s) => ({
      sessions: s.sessions.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  deleteSession: (id) =>
    set((s) => ({ sessions: s.sessions.filter((o) => o.id !== id) })),

  addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid() }] })),
  updateGoal: (id, patch) =>
    set((s) => ({
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
  deleteGoal: (id) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

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
      // Surface as anon so the user can retry sign-in rather than a blank app.
      set({ phase: "anon", userId: null, userEmail: null });
    }
  },

  hydrate: (doc, userId, email) => {
    // Record the loaded doc as the persistence baseline BEFORE it lands in the
    // store, so the resulting change event is a no-op (same array references).
    repo.setBaseline(doc);
    set({
      ...doc,
      userId,
      userEmail: email,
      phase: "ready",
      // Selection is not cleared: the URL survives sign-in, so a deep link
      // opens the entity it named. App drops the selection if the id is stale.
    });
  },

  signOut: async () => {
    // Flush any pending debounced write first — otherwise a delete/edit in the
    // last ~600ms is lost when we clear the session.
    await flushPendingSync();
    await supabase.auth.signOut();
    repo.clearBaseline();
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
// tables that actually changed.
const PERSISTED_KEYS: (keyof PersistedData)[] = [
  "me",
  "capacities",
  "domains",
  "managers",
  "teams",
  "people",
  "actions",
  "meetings",
  "sessions",
  "goals",
  "notes",
  "wins",
  "teamActions",
  "teamGoals",
  "teamNotes",
  "chats",
  "nodePositions",
];

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<void> | null = null;
/** More edits arrived while a sync was writing — coalesce another pass. */
let syncQueued = false;

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
      if (
        latest.phase !== "ready" ||
        latest.userId !== userId ||
        !repo.hasBaseline()
      ) {
        return;
      }
      try {
        await repo.syncData(userId, extractData(latest));
      } catch (e) {
        console.error("LeadWell: cloud sync failed", e);
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
  if (latest.phase !== "ready" || !latest.userId || !repo.hasBaseline()) {
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
  if (!repo.hasBaseline()) return;
  if (!PERSISTED_KEYS.some((k) => state[k] !== prev[k])) return;
  scheduleSync(state.userId);
});

// Flush pending cloud writes when the tab is backgrounded or closed so a
// quick refresh / OAuth redirect doesn't drop the last edit.
if (typeof window !== "undefined") {
  const flush = () => {
    void flushPendingSync();
  };
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

// Re-run bootstrap on sign-in / sign-out / token refresh from Supabase.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
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
