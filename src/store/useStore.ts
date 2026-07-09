import { create } from "zustand";
import type {
  Action,
  Capacity,
  ChatMessage,
  Goal,
  Me,
  Note,
  OneOnOne,
  Person,
  Team,
} from "../types";
import { storage } from "../lib/storage";
import {
  capUp,
  seedActions,
  seedCapacities,
  seedGoals,
  seedMe,
  seedNotes,
  seedOneOnOnes,
  seedPeople,
  seedTeams,
} from "../data/seed";

export type Tab = "overview" | "tree" | "people";

export type NodePosition = { x: number; y: number };

export type ModalState =
  | { kind: "team"; team?: Team }
  | { kind: "person"; person?: Person; teamId?: string }
  | null;

type PersistedData = {
  me: Me;
  capacities: Capacity[];
  teams: Team[];
  people: Person[];
  actions: Action[];
  oneOnOnes: OneOnOne[];
  goals: Goal[];
  notes: Note[];
  chats: Record<string, ChatMessage[]>; // keyed by personId, or "org" for Ask AI
  nodePositions: Record<string, NodePosition>; // canvas positions; "me" + team ids
};

type UIState = {
  tab: Tab;
  selectedPersonId: string | null;
  collapsedTeams: string[];
  dark: boolean;
  askAIOpen: boolean;
  modal: ModalState;
};

type Store = PersistedData &
  UIState & {
    // ui
    setTab: (tab: Tab) => void;
    selectPerson: (id: string | null) => void;
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
    // teams
    addTeam: (team: Omit<Team, "id" | "order">) => void;
    updateTeam: (id: string, patch: Partial<Team>) => void;
    deleteTeam: (id: string) => void;
    // people
    addPerson: (person: Omit<Person, "id" | "assessments" | "strengths" | "watchOuts"> & Partial<Person>) => string;
    updatePerson: (id: string, patch: Partial<Person>) => void;
    deletePerson: (id: string) => void;
    /** Reorg seam: move a person to another team (future drag-and-drop calls this). */
    movePerson: (personId: string, teamId: string) => void;
    // per-person records
    addAction: (personId: string, text: string, dueDate?: string) => void;
    toggleAction: (id: string) => void;
    deleteAction: (id: string) => void;
    addOneOnOne: (o: Omit<OneOnOne, "id">) => void;
    deleteOneOnOne: (id: string) => void;
    addGoal: (g: Omit<Goal, "id">) => void;
    updateGoal: (id: string, patch: Partial<Goal>) => void;
    deleteGoal: (id: string) => void;
    addNote: (personId: string, body: string) => void;
    deleteNote: (id: string) => void;
    // chat
    appendChat: (key: string, msg: ChatMessage) => void;
    clearChat: (key: string) => void;
    // data management
    resetToSeed: () => void;
  };

const DATA_KEY = "data";
const uid = () => Math.random().toString(36).slice(2, 10);

function loadInitialData(): PersistedData {
  const saved = storage.load<PersistedData>(DATA_KEY);
  if (saved) {
    return {
      ...saved,
      chats: saved.chats ?? {},
      nodePositions: saved.nodePositions ?? {},
      // Migration: data saved before "report up" existed lacks this capacity.
      capacities: saved.capacities.some((c) => c.id === capUp.id)
        ? saved.capacities
        : [...saved.capacities, capUp],
    };
  }
  return {
    me: seedMe,
    capacities: seedCapacities,
    teams: seedTeams,
    people: seedPeople,
    actions: seedActions,
    oneOnOnes: seedOneOnOnes,
    goals: seedGoals,
    notes: seedNotes,
    chats: {},
    nodePositions: {},
  };
}

function initialDark(): boolean {
  const saved = storage.load<boolean>("dark");
  if (saved !== null) return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useStore = create<Store>((set, get) => ({
  ...loadInitialData(),
  tab: "tree",
  selectedPersonId: null,
  collapsedTeams: [],
  dark: initialDark(),
  askAIOpen: false,
  modal: null,

  setTab: (tab) => set({ tab }),
  selectPerson: (id) => set({ selectedPersonId: id }),
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

  setNodePosition: (id, pos) =>
    set((s) => ({ nodePositions: { ...s.nodePositions, [id]: pos } })),
  resetLayout: () => set({ nodePositions: {} }),

  updateMe: (patch) => set((s) => ({ me: { ...s.me, ...patch } })),

  addTeam: (team) =>
    set((s) => ({
      teams: [
        ...s.teams,
        { ...team, id: uid(), order: s.teams.length },
      ],
    })),
  updateTeam: (id, patch) =>
    set((s) => ({
      teams: s.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  deleteTeam: (id) =>
    set((s) => {
      const peopleIds = s.people.filter((p) => p.teamId === id).map((p) => p.id);
      return {
        teams: s.teams.filter((t) => t.id !== id),
        people: s.people.filter((p) => p.teamId !== id),
        actions: s.actions.filter((a) => !peopleIds.includes(a.personId)),
        oneOnOnes: s.oneOnOnes.filter((o) => !peopleIds.includes(o.personId)),
        goals: s.goals.filter((g) => !peopleIds.includes(g.personId)),
        notes: s.notes.filter((n) => !peopleIds.includes(n.personId)),
        selectedPersonId: peopleIds.includes(s.selectedPersonId ?? "")
          ? null
          : s.selectedPersonId,
      };
    }),

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
  deletePerson: (id) =>
    set((s) => ({
      people: s.people.filter((p) => p.id !== id),
      actions: s.actions.filter((a) => a.personId !== id),
      oneOnOnes: s.oneOnOnes.filter((o) => o.personId !== id),
      goals: s.goals.filter((g) => g.personId !== id),
      notes: s.notes.filter((n) => n.personId !== id),
      selectedPersonId: s.selectedPersonId === id ? null : s.selectedPersonId,
    })),
  movePerson: (personId, teamId) =>
    set((s) => ({
      people: s.people.map((p) => (p.id === personId ? { ...p, teamId } : p)),
    })),

  addAction: (personId, text, dueDate) =>
    set((s) => ({
      actions: [...s.actions, { id: uid(), personId, text, done: false, dueDate }],
    })),
  toggleAction: (id) =>
    set((s) => ({
      actions: s.actions.map((a) => (a.id === id ? { ...a, done: !a.done } : a)),
    })),
  deleteAction: (id) =>
    set((s) => ({ actions: s.actions.filter((a) => a.id !== id) })),

  addOneOnOne: (o) =>
    set((s) => ({ oneOnOnes: [...s.oneOnOnes, { ...o, id: uid() }] })),
  deleteOneOnOne: (id) =>
    set((s) => ({ oneOnOnes: s.oneOnOnes.filter((o) => o.id !== id) })),

  addGoal: (g) => set((s) => ({ goals: [...s.goals, { ...g, id: uid() }] })),
  updateGoal: (id, patch) =>
    set((s) => ({
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    })),
  deleteGoal: (id) =>
    set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

  addNote: (personId, body) =>
    set((s) => ({
      notes: [
        ...s.notes,
        { id: uid(), personId, body, date: new Date().toISOString().slice(0, 10) },
      ],
    })),
  deleteNote: (id) =>
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

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
      teams: seedTeams,
      people: seedPeople,
      actions: seedActions,
      oneOnOnes: seedOneOnOnes,
      goals: seedGoals,
      notes: seedNotes,
      chats: {},
      nodePositions: {},
      selectedPersonId: null,
    });
  },
}));

// Persist every data change (UI state stays session-only, except dark mode).
const PERSISTED_KEYS: (keyof PersistedData)[] = [
  "me",
  "capacities",
  "teams",
  "people",
  "actions",
  "oneOnOnes",
  "goals",
  "notes",
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
