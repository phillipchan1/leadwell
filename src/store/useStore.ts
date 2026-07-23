import { create } from "zustand";
import type {
  Action,
  ActionColumn,
  Capacity,
  ChatMessage,
  Domain,
  Goal,
  Manager,
  Me,
  Note,
  OneOnOne,
  Person,
  Team,
  TeamAction,
  TeamGoal,
  TeamNote,
  LeadUpProfile,
  Win,
} from "../types";
import { storage } from "../lib/storage";
import { isDescendant } from "../lib/teams";
import {
  capUp,
  seedActions,
  seedCapacities,
  seedDomains,
  seedGoals,
  seedManagers,
  seedMe,
  seedNotes,
  seedOneOnOnes,
  seedPeople,
  seedTeamActions,
  seedTeamGoals,
  seedTeamNotes,
  seedTeams,
  seedWins,
} from "../data/seed";

export type Tab = "overview" | "tree" | "people";

export type NodePosition = { x: number; y: number };

export type ModalState =
  | { kind: "team"; team?: Team; parentId?: string }
  | { kind: "person"; person?: Person; teamId?: string }
  | { kind: "manager"; manager?: Manager }
  | { kind: "domains" }
  | null;

type PersistedData = {
  me: Me;
  capacities: Capacity[];
  domains: Domain[];
  managers: Manager[];
  teams: Team[];
  people: Person[];
  actions: Action[];
  oneOnOnes: OneOnOne[];
  goals: Goal[];
  notes: Note[];
  wins: Win[];
  teamActions: TeamAction[];
  teamGoals: TeamGoal[];
  teamNotes: TeamNote[];
  chats: Record<string, ChatMessage[]>; // keyed by personId, "team:<id>", or "org"
  nodePositions: Record<string, NodePosition>; // canvas positions; "me", team ids, "mgr:<id>"
};

type UIState = {
  tab: Tab;
  /** null = show every domain on one canvas; otherwise filter the tree. */
  treeDomainId: string | null;
  /** When false, team cards hide member lists — team mandate/next step first. */
  showPeopleOnTree: boolean;
  selectedPersonId: string | null;
  selectedTeamId: string | null;
  collapsedTeams: string[];
  dark: boolean;
  askAIOpen: boolean;
  modal: ModalState;
};

type Store = PersistedData &
  UIState & {
    // ui
    setTab: (tab: Tab) => void;
    setTreeDomainId: (id: string | null) => void;
    setShowPeopleOnTree: (show: boolean) => void;
    selectPerson: (id: string | null) => void;
    selectTeam: (id: string | null) => void;
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
    deleteManager: (id: string) => void;
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
    /** Reorg seam: move a person to another team (future drag-and-drop calls this). */
    movePerson: (personId: string, teamId: string) => void;
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
    addOneOnOne: (o: Omit<OneOnOne, "id">) => string;
    updateOneOnOne: (id: string, patch: Partial<Omit<OneOnOne, "id">>) => void;
    deleteOneOnOne: (id: string) => void;
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
    // settings (persisted separately from org data)
    anthropicApiKey: string | null;
    setAnthropicApiKey: (key: string | null) => void;
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
    // chat
    appendChat: (key: string, msg: ChatMessage) => void;
    clearChat: (key: string) => void;
    // data management
    resetToSeed: () => void;
  };

const DATA_KEY = "data";
const API_KEY_STORAGE = "anthropicApiKey";
const uid = () => Math.random().toString(36).slice(2, 10);

function migrateActions(actions: Action[]): Action[] {
  return actions.map((a) => ({
    ...a,
    column: a.column ?? (a.done ? "done" : "backlog"),
  }));
}

function migrateOneOnOnes(oneOnOnes: OneOnOne[]): OneOnOne[] {
  return oneOnOnes.map((o) => ({
    ...o,
    // Legacy schedule stubs used notes: "Scheduled"
    notes: o.notes === "Scheduled" ? undefined : o.notes,
  }));
}

function loadInitialData(): PersistedData {
  const saved = storage.load<PersistedData>(DATA_KEY);
  if (saved) {
    return {
      ...saved,
      chats: saved.chats ?? {},
      nodePositions: saved.nodePositions ?? {},
      // Migrations: fields added after earlier saves default in gracefully.
      domains: saved.domains ?? seedDomains,
      managers: saved.managers ?? [],
      wins: saved.wins ?? [],
      teamActions: saved.teamActions ?? [],
      teamGoals: saved.teamGoals ?? [],
      teamNotes: saved.teamNotes ?? [],
      actions: migrateActions(saved.actions ?? []),
      oneOnOnes: migrateOneOnOnes(saved.oneOnOnes ?? []),
      // Data saved before "report up" existed lacks this capacity.
      capacities: saved.capacities.some((c) => c.id === capUp.id)
        ? saved.capacities
        : [...saved.capacities, capUp],
    };
  }
  return {
    me: seedMe,
    capacities: seedCapacities,
    domains: seedDomains,
    managers: seedManagers,
    teams: seedTeams,
    people: seedPeople,
    actions: seedActions,
    oneOnOnes: seedOneOnOnes,
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

function loadAnthropicApiKey(): string | null {
  return storage.load<string>(API_KEY_STORAGE);
}

function initialDark(): boolean {
  const saved = storage.load<boolean>("dark");
  if (saved !== null) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useStore = create<Store>((set, get) => ({
  ...loadInitialData(),
  tab: "tree",
  treeDomainId: null,
  showPeopleOnTree: false,
  selectedPersonId: null,
  selectedTeamId: null,
  collapsedTeams: [],
  dark: initialDark(),
  askAIOpen: false,
  modal: null,
  anthropicApiKey: loadAnthropicApiKey(),
  settingsOpen: false,

  setTab: (tab) => set({ tab }),
  setTreeDomainId: (id) =>
    set((s) => {
      if (!id) return { treeDomainId: null };
      const teamInDomain = (teamId: string | null | undefined) => {
        if (!teamId) return false;
        return s.teams.find((t) => t.id === teamId)?.domainId === id;
      };
      let { selectedTeamId, selectedPersonId } = s;
      if (selectedTeamId && !teamInDomain(selectedTeamId)) selectedTeamId = null;
      if (selectedPersonId) {
        const person = s.people.find((p) => p.id === selectedPersonId);
        if (!teamInDomain(person?.teamId)) selectedPersonId = null;
      }
      return { treeDomainId: id, selectedTeamId, selectedPersonId };
    }),
  setShowPeopleOnTree: (show) => set({ showPeopleOnTree: show }),
  // Selecting a person keeps (or opens) their team so sidebars can nest.
  selectPerson: (id) =>
    set((s) => {
      if (!id) return { selectedPersonId: null };
      const person = s.people.find((p) => p.id === id);
      return {
        selectedPersonId: id,
        selectedTeamId: person?.teamId ?? s.selectedTeamId,
      };
    }),
  // Opening a team clears any drilled-in person.
  selectTeam: (id) => set({ selectedTeamId: id, selectedPersonId: null }),
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
  setAnthropicApiKey: (key) => {
    const trimmed = key?.trim() || null;
    if (trimmed) storage.save(API_KEY_STORAGE, trimmed);
    else storage.remove(API_KEY_STORAGE);
    set({ anthropicApiKey: trimmed });
  },
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setNodePosition: (id, pos) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, [id]: pos } })),
  resetLayout: () => set({ nodePositions: {} }),

  updateMe: (patch) => set((s) => ({ me: { ...s.me, ...patch } })),

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
  deleteManager: (id) =>
    set((s) => {
      const { [`mgr:${id}`]: _pos, ...nodePositions } = s.nodePositions;
      return {
        managers: s.managers.filter((m) => m.id !== id),
        nodePositions,
      };
    }),

  addTeam: (team) =>
    set((s) => ({
      teams: [
        ...s.teams,
        {
          ...team,
          id: uid(),
          order: s.teams.length,
          ...(team.parentId ? { direction: "down" as const } : null),
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
      return {
        teams: s.teams.map((t) => (t.id === id ? { ...t, ...next } : t)),
      };
    }),
  deleteTeam: (id) =>
    set((s) => {
      const peopleIds = new Set(
        s.people.filter((p) => p.teamId === id).map((p) => p.id)
      );
      const { [`team:${id}`]: _chat, ...chats } = s.chats;
      const { [id]: _pos, ...nodePositions } = s.nodePositions;
      return {
        // Orphan sub-teams rather than cascade-delete them.
        teams: s.teams
          .filter((t) => t.id !== id)
          .map((t) =>
            t.parentId === id ? { ...t, parentId: undefined } : t
          ),
        people: s.people.filter((p) => p.teamId !== id),
        actions: s.actions.filter((a) => !peopleIds.has(a.personId)),
        oneOnOnes: s.oneOnOnes.filter((o) => !peopleIds.has(o.personId)),
        goals: s.goals.filter((g) => !peopleIds.has(g.personId)),
        notes: s.notes.filter((n) => !peopleIds.has(n.personId)),
        wins: s.wins.filter((w) => !peopleIds.has(w.personId)),
        teamActions: s.teamActions.filter((a) => a.teamId !== id),
        teamGoals: s.teamGoals.filter((g) => g.teamId !== id),
        teamNotes: s.teamNotes.filter((n) => n.teamId !== id),
        chats,
        nodePositions,
        collapsedTeams: s.collapsedTeams.filter((t) => t !== id),
        selectedPersonId: peopleIds.has(s.selectedPersonId ?? "")
          ? null
          : s.selectedPersonId,
        selectedTeamId: s.selectedTeamId === id ? null : s.selectedTeamId,
      };
    }),

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
  deletePerson: (id) =>
    set((s) => ({
      people: s.people.filter((p) => p.id !== id),
      actions: s.actions.filter((a) => a.personId !== id),
      oneOnOnes: s.oneOnOnes.filter((o) => o.personId !== id),
      goals: s.goals.filter((g) => g.personId !== id),
      notes: s.notes.filter((n) => n.personId !== id),
      wins: s.wins.filter((w) => w.personId !== id),
      selectedPersonId: s.selectedPersonId === id ? null : s.selectedPersonId,
    })),
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

  addOneOnOne: (o) => {
    const id = uid();
    set((s) => ({ oneOnOnes: [...s.oneOnOnes, { ...o, id }] }));
    return id;
  },
  updateOneOnOne: (id, patch) =>
    set((s) => ({
      oneOnOnes: s.oneOnOnes.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),
  deleteOneOnOne: (id) =>
    set((s) => ({ oneOnOnes: s.oneOnOnes.filter((o) => o.id !== id) })),

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

  resetToSeed: () => {
    storage.remove(DATA_KEY);
    set({
      me: seedMe,
      capacities: seedCapacities,
      domains: seedDomains,
      managers: seedManagers,
      teams: seedTeams,
      people: seedPeople,
      actions: seedActions,
      oneOnOnes: seedOneOnOnes,
      goals: seedGoals,
      notes: seedNotes,
      wins: seedWins,
      teamActions: seedTeamActions,
      teamGoals: seedTeamGoals,
      teamNotes: seedTeamNotes,
      chats: {},
      nodePositions: {},
      selectedPersonId: null,
      selectedTeamId: null,
    });
  },
}));

// Persist every data change (UI state stays session-only, except dark mode).
const PERSISTED_KEYS: (keyof PersistedData)[] = [
  "me",
  "capacities",
  "domains",
  "managers",
  "teams",
  "people",
  "actions",
  "oneOnOnes",
  "goals",
  "notes",
  "wins",
  "teamActions",
  "teamGoals",
  "teamNotes",
  "chats",
  "nodePositions",
];

useStore.subscribe((state, prev) => {
  if (PERSISTED_KEYS.some((k) => state[k] !== prev[k])) {
    const data: PersistedData = Object.fromEntries(
      PERSISTED_KEYS.map((k) => [k, state[k]])
    ) as PersistedData;
    storage.save(DATA_KEY, data);
  }
});
