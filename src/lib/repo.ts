/**
 * Normalized Supabase persistence for LeadWell.
 *
 * The zustand store keeps working entirely in memory with optimistic updates —
 * exactly as it did against localStorage. This module is the seam that turns
 * that in-memory `PersistedData` into rows across the normalized tables (and
 * back). It exposes three things the store needs:
 *
 *   loadAll(userId)      → read every table into a PersistedData (or null for a
 *                          brand-new user who has no profile row yet)
 *   writeAll(userId,d)   → insert a full PersistedData (seeding / first import)
 *   syncData(userId,d)   → persist only the collections that changed since the
 *                          last baseline (called, debounced, on every store
 *                          change)
 *
 * Each collection has a small mapper pair (row ⇄ app type). Sync is
 * upsert-current + delete-missing per changed table, which is idempotent and
 * needs no server-side diffing.
 */
import { supabase } from "./supabase";
import type {
  Action,
  Capacity,
  ChatMessage,
  CustomModality,
  Domain,
  Goal,
  Health,
  LeadUpProfile,
  Manager,
  Me,
  Note,
  Prayer,
  PrayerEntry,
  Session,
  Person,
  Team,
  Topic,
  TrackedMeeting,
  CurriculumSlot,
  TeamAction,
  TeamGoal,
  TeamNote,
  Win,
} from "../types";

export type NodePosition = { x: number; y: number };

/** The full org document the store owns and persists. */
export type PersistedData = {
  me: Me;
  capacities: Capacity[];
  domains: Domain[];
  managers: Manager[];
  teams: Team[];
  people: Person[];
  /** @deprecated Superseded by `topics`. Round-tripped, never read. */
  actions: Action[];
  meetings: TrackedMeeting[];
  /** What there is to talk about, keyed by meeting. */
  topics: Topic[];
  sessions: Session[];
  goals: Goal[];
  notes: Note[];
  wins: Win[];
  /** The prayer log — entries for people, teams and managers alike. */
  prayers: PrayerEntry[];
  teamActions: TeamAction[];
  teamGoals: TeamGoal[];
  teamNotes: TeamNote[];
  chats: Record<string, ChatMessage[]>;
  nodePositions: Record<string, NodePosition>;
};

// --- small helpers ----------------------------------------------------------
const nn = <T>(v: T | undefined | null): T | null => (v === undefined ? null : v);
const opt = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

function parseCurriculum(v: unknown): CurriculumSlot[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const slots: CurriculumSlot[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; label?: unknown };
    if (typeof row.id !== "string" || typeof row.label !== "string") continue;
    const label = row.label.trim();
    if (!label) continue;
    slots.push({ id: row.id, label });
  }
  return slots.length ? slots : undefined;
}

type Row = Record<string, unknown>;

/** Map a profiles row (or partial legacy me) into a full Me. */
export function meFromRow(r: {
  name?: string | null;
  title?: string | null;
  photo?: string | null;
  clifton_top5?: string[] | null;
  enneagram?: string | null;
  mbti?: string | null;
  strengths?: string[] | null;
  watch_outs?: string[] | null;
  how_to_lead?: string | null;
  custom_modalities?: CustomModality[] | null;
}): Me {
  const top5 = r.clifton_top5 ?? [];
  const enneagram = opt(r.enneagram);
  const mbti = opt(r.mbti);
  const customModalities = r.custom_modalities ?? [];
  return {
    name: r.name ?? "",
    title: opt(r.title),
    photo: opt(r.photo),
    assessments: {
      ...(top5.length ? { cliftonTop5: top5 } : {}),
      ...(enneagram ? { enneagram } : {}),
      ...(mbti ? { mbti } : {}),
    },
    strengths: r.strengths ?? [],
    watchOuts: r.watch_outs ?? [],
    howToLead: opt(r.how_to_lead),
    ...(customModalities.length ? { customModalities } : {}),
  };
}

function meToRow(userId: string, me: Me): Row {
  return {
    user_id: userId,
    name: me.name,
    title: nn(me.title),
    photo: nn(me.photo),
    clifton_top5: me.assessments.cliftonTop5 ?? [],
    enneagram: nn(me.assessments.enneagram),
    mbti: nn(me.assessments.mbti),
    strengths: me.strengths ?? [],
    watch_outs: me.watchOuts ?? [],
    how_to_lead: nn(me.howToLead),
    custom_modalities: me.customModalities ?? [],
    updated_at: new Date().toISOString(),
  };
}

/** Empty Me used for blank/seed defaults before assessment fields are filled. */
export function emptyMe(partial: Partial<Me> & { name: string }): Me {
  return {
    name: partial.name,
    title: partial.title,
    photo: partial.photo,
    assessments: partial.assessments ?? {},
    strengths: partial.strengths ?? [],
    watchOuts: partial.watchOuts ?? [],
    howToLead: partial.howToLead,
    customModalities: partial.customModalities,
  };
}

/**
 * Persist an id-keyed collection: upsert every current row, then delete rows
 * for this user whose key is no longer present. Empty collection ⇒ delete all.
 */
async function pushRows(
  table: string,
  keyField: string,
  userId: string,
  rows: Row[]
): Promise<void> {
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows);
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }

  // Delete rows that are no longer in the client collection. Prefer an
  // explicit id list over `.not(...).in(...)` string filters (those have been
  // flaky with some PostgREST versions and can silently leave orphans).
  const { data: existing, error: readErr } = await supabase
    .from(table)
    .select(keyField)
    .eq("user_id", userId);
  if (readErr) throw new Error(`${table} list: ${readErr.message}`);

  const keep = new Set(rows.map((r) => r[keyField] as string));
  const toDelete = ((existing ?? []) as unknown as Row[])
    .map((r) => r[keyField] as string)
    .filter((k) => Boolean(k) && !keep.has(k));
  if (!toDelete.length) return;

  const { error: delErr } = await supabase
    .from(table)
    .delete()
    .eq("user_id", userId)
    .in(keyField, toDelete);
  if (delErr) throw new Error(`${table} delete-missing: ${delErr.message}`);
}

// --- mappers: app type ⇄ db row ---------------------------------------------
const map = {
  capacities: {
    table: "capacities",
    toRow: (u: string, c: Capacity): Row => ({
      user_id: u,
      id: c.id,
      label: c.label,
      color: c.color,
    }),
    fromRow: (r: Row): Capacity => ({
      id: r.id as string,
      label: r.label as string,
      color: r.color as string,
    }),
  },
  domains: {
    table: "domains",
    toRow: (u: string, d: Domain): Row => ({
      user_id: u,
      id: d.id,
      name: d.name,
      color: d.color,
    }),
    fromRow: (r: Row): Domain => ({
      id: r.id as string,
      name: r.name as string,
      color: r.color as string,
    }),
  },
  managers: {
    table: "managers",
    toRow: (u: string, m: Manager): Row => ({
      user_id: u,
      id: m.id,
      name: m.name,
      role: nn(m.role),
      domain_id: nn(m.domainId),
      photo: nn(m.photo),
      no_meeting: nn(m.noMeeting),
      prayer: nn(m.prayer ?? null),
      lead_up: nn(m.leadUp ?? null),
    }),
    fromRow: (r: Row): Manager => ({
      id: r.id as string,
      name: r.name as string,
      role: opt(r.role as string | null),
      domainId: opt(r.domain_id as string | null),
      photo: opt(r.photo as string | null),
      noMeeting: opt(r.no_meeting as boolean | null),
      prayer: opt(r.prayer as Prayer | null),
      leadUp: opt(r.lead_up as LeadUpProfile | null),
    }),
  },
  teams: {
    table: "teams",
    toRow: (u: string, t: Team): Row => ({
      user_id: u,
      id: t.id,
      name: t.name,
      capacity_id: t.capacityId,
      domain_id: nn(t.domainId),
      health: nn(t.health ?? null),
      prayer: nn(t.prayer ?? null),
      description: nn(t.description),
      purpose: nn(t.purpose),
      cadence: nn(t.cadence),
      last_met: nn(t.lastMet),
      no_meeting: nn(t.noMeeting),
      sort_order: t.order,
      direction: nn(t.direction),
      parent_id: nn(t.parentId),
      leader_id: nn(t.leaderId),
    }),
    fromRow: (r: Row): Team => ({
      id: r.id as string,
      name: r.name as string,
      capacityId: r.capacity_id as string,
      domainId: opt(r.domain_id as string | null),
      health: opt(r.health as Health | null),
      prayer: opt(r.prayer as Prayer | null),
      description: opt(r.description as string | null),
      purpose: opt(r.purpose as string | null),
      cadence: opt(r.cadence as string | null),
      lastMet: opt(r.last_met as string | null),
      noMeeting: opt(r.no_meeting as boolean | null),
      order: (r.sort_order as number) ?? 0,
      direction: opt(r.direction as "up" | "down" | null),
      parentId: opt(r.parent_id as string | null),
      leaderId: opt(r.leader_id as string | null),
    }),
  },
  people: {
    table: "people",
    toRow: (u: string, p: Person): Row => ({
      user_id: u,
      id: p.id,
      // Null = a direct report with no team.
      team_id: nn(p.teamId),
      domain_id: nn(p.domainId),
      name: p.name,
      role: nn(p.role),
      photo: nn(p.photo),
      health: nn(p.health ?? null),
      prayer: nn(p.prayer ?? null),
      relationship_type: nn(p.relationshipType),
      no_meeting: nn(p.noMeeting),
      clifton_top5: p.assessments.cliftonTop5 ?? [],
      enneagram: nn(p.assessments.enneagram),
      mbti: nn(p.assessments.mbti),
      strengths: p.strengths ?? [],
      watch_outs: p.watchOuts ?? [],
      how_to_lead: nn(p.howToLead),
      custom_modalities: p.customModalities ?? [],
      lead_up: nn(p.leadUp ?? null),
    }),
    fromRow: (r: Row): Person => {
      const top5 = (r.clifton_top5 as string[]) ?? [];
      const enneagram = opt(r.enneagram as string | null);
      const mbti = opt(r.mbti as string | null);
      const leadUp = opt(r.lead_up as LeadUpProfile | null);
      const customModalities = (r.custom_modalities as CustomModality[] | null) ?? [];
      return {
        id: r.id as string,
        teamId: opt(r.team_id as string | null),
        domainId: opt(r.domain_id as string | null),
        name: r.name as string,
        role: opt(r.role as string | null),
        photo: opt(r.photo as string | null),
        health: opt(r.health as Health | null),
        prayer: opt(r.prayer as Prayer | null),
        relationshipType: opt(r.relationship_type as string | null),
        noMeeting: opt(r.no_meeting as boolean | null),
        assessments: {
          ...(top5.length ? { cliftonTop5: top5 } : {}),
          ...(enneagram ? { enneagram } : {}),
          ...(mbti ? { mbti } : {}),
        },
        strengths: (r.strengths as string[]) ?? [],
        watchOuts: (r.watch_outs as string[]) ?? [],
        howToLead: opt(r.how_to_lead as string | null),
        ...(customModalities.length ? { customModalities } : {}),
        ...(leadUp ? { leadUp } : {}),
      };
    },
  },
  actions: {
    table: "actions",
    toRow: (u: string, a: Action): Row => ({
      user_id: u,
      id: a.id,
      person_id: a.personId,
      text: a.text,
      done: a.done,
      due_date: nn(a.dueDate),
      board_column: a.column ?? (a.done ? "done" : "backlog"),
    }),
    fromRow: (r: Row): Action => ({
      id: r.id as string,
      personId: r.person_id as string,
      text: r.text as string,
      done: Boolean(r.done),
      dueDate: opt(r.due_date as string | null),
      column: (r.board_column as Action["column"]) ?? "backlog",
    }),
  },
  meetings: {
    table: "meetings",
    toRow: (u: string, m: TrackedMeeting): Row => ({
      user_id: u,
      id: m.id,
      subject_kind: m.subjectKind,
      subject_id: m.subjectId,
      name: nn(m.name),
      rhythm: m.rhythm,
      floor_days: nn(m.floorDays),
      next_date: nn(m.nextDate),
      anchor_weekday: nn(m.anchorWeekday),
      role: nn(m.role),
      tracker_url: nn(m.trackerUrl),
      tracker_name: nn(m.trackerName),
      curriculum: m.curriculum?.length ? m.curriculum : null,
    }),
    fromRow: (r: Row): TrackedMeeting => ({
      id: r.id as string,
      subjectKind: r.subject_kind as TrackedMeeting["subjectKind"],
      subjectId: r.subject_id as string,
      name: opt(r.name as string | null),
      rhythm: (r.rhythm as TrackedMeeting["rhythm"]) ?? "as_needed",
      floorDays: opt(r.floor_days as number | null),
      nextDate: opt(r.next_date as string | null),
      anchorWeekday: opt(r.anchor_weekday as number | null),
      role: opt(r.role as TrackedMeeting["role"] | null),
      trackerUrl: opt(r.tracker_url as string | null),
      trackerName: opt(r.tracker_name as string | null),
      curriculum: parseCurriculum(r.curriculum),
    }),
  },
  topics: {
    table: "topics",
    toRow: (u: string, t: Topic): Row => ({
      user_id: u,
      id: t.id,
      meeting_id: t.meetingId,
      text: t.text,
      detail: nn(t.detail),
      status: t.status,
      lane: t.lane,
      session_id: nn(t.sessionId),
      carried: t.carried,
      due_date: nn(t.dueDate),
      created_on: t.createdOn,
      closed_on: nn(t.closedOn),
      sort_order: t.order,
      slot_id: nn(t.slotId),
    }),
    fromRow: (r: Row): Topic => ({
      id: r.id as string,
      meetingId: r.meeting_id as string,
      text: r.text as string,
      detail: opt(r.detail as string | null),
      status: (r.status as Topic["status"]) ?? "open",
      lane: (r.lane as Topic["lane"]) ?? "backlog",
      sessionId: opt(r.session_id as string | null),
      slotId: opt(r.slot_id as string | null),
      carried: (r.carried as number) ?? 0,
      dueDate: opt(r.due_date as string | null),
      // Backfilled rows have no creation date — the old table never kept one.
      createdOn: (r.created_on as string | null) ?? "",
      closedOn: opt(r.closed_on as string | null),
      order: (r.sort_order as number) ?? 0,
    }),
  },
  sessions: {
    // Still the one_on_ones table — it was always a meeting occurrence, it just
    // used to hardcode its subject. Migration 0007 backfills meeting_id.
    table: "one_on_ones",
    toRow: (u: string, o: Session): Row => ({
      user_id: u,
      id: o.id,
      meeting_id: o.meetingId,
      date: o.date,
      point: nn(o.point),
      notes: nn(o.notes),
      next_date: nn(o.nextDate),
      transcript: nn(o.transcript),
    }),
    fromRow: (r: Row): Session => ({
      id: r.id as string,
      meetingId: (r.meeting_id as string | null) ?? "",
      date: r.date as string,
      point: opt(r.point as string | null),
      notes: opt(r.notes as string | null),
      nextDate: opt(r.next_date as string | null),
      transcript: opt(r.transcript as string | null),
    }),
  },
  goals: {
    table: "goals",
    toRow: (u: string, g: Goal): Row => ({
      user_id: u,
      id: g.id,
      person_id: g.personId,
      title: g.title,
      progress: g.progress,
      target_date: nn(g.targetDate),
    }),
    fromRow: (r: Row): Goal => ({
      id: r.id as string,
      personId: r.person_id as string,
      title: r.title as string,
      progress: (r.progress as number) ?? 0,
      targetDate: opt(r.target_date as string | null),
    }),
  },
  notes: {
    table: "notes",
    toRow: (u: string, n: Note): Row => ({
      user_id: u,
      id: n.id,
      person_id: n.personId,
      date: n.date,
      body: n.body,
    }),
    fromRow: (r: Row): Note => ({
      id: r.id as string,
      personId: r.person_id as string,
      date: r.date as string,
      body: r.body as string,
    }),
  },
  wins: {
    table: "wins",
    toRow: (u: string, w: Win): Row => ({
      user_id: u,
      id: w.id,
      person_id: w.personId,
      date: w.date,
      text: w.text,
      impact: nn(w.impact),
    }),
    fromRow: (r: Row): Win => ({
      id: r.id as string,
      personId: r.person_id as string,
      date: r.date as string,
      text: r.text as string,
      impact: opt(r.impact as string | null),
    }),
  },
  prayers: {
    table: "prayers",
    toRow: (u: string, e: PrayerEntry): Row => ({
      user_id: u,
      id: e.id,
      subject_kind: e.subjectKind,
      subject_id: e.subjectId,
      date: e.date,
      kind: e.kind,
      text: e.text,
      answered_on: nn(e.answeredOn),
      answer_note: nn(e.answerNote),
    }),
    fromRow: (r: Row): PrayerEntry => ({
      id: r.id as string,
      subjectKind: r.subject_kind as PrayerEntry["subjectKind"],
      subjectId: r.subject_id as string,
      date: r.date as string,
      kind: r.kind as PrayerEntry["kind"],
      text: r.text as string,
      answeredOn: opt(r.answered_on as string | null),
      answerNote: opt(r.answer_note as string | null),
    }),
  },
  teamActions: {
    table: "team_actions",
    toRow: (u: string, a: TeamAction): Row => ({
      user_id: u,
      id: a.id,
      team_id: a.teamId,
      text: a.text,
      done: a.done,
      due_date: nn(a.dueDate),
    }),
    fromRow: (r: Row): TeamAction => ({
      id: r.id as string,
      teamId: r.team_id as string,
      text: r.text as string,
      done: Boolean(r.done),
      dueDate: opt(r.due_date as string | null),
    }),
  },
  teamGoals: {
    table: "team_goals",
    toRow: (u: string, g: TeamGoal): Row => ({
      user_id: u,
      id: g.id,
      team_id: g.teamId,
      title: g.title,
      progress: g.progress,
      target_date: nn(g.targetDate),
    }),
    fromRow: (r: Row): TeamGoal => ({
      id: r.id as string,
      teamId: r.team_id as string,
      title: r.title as string,
      progress: (r.progress as number) ?? 0,
      targetDate: opt(r.target_date as string | null),
    }),
  },
  teamNotes: {
    table: "team_notes",
    toRow: (u: string, n: TeamNote): Row => ({
      user_id: u,
      id: n.id,
      team_id: n.teamId,
      date: n.date,
      body: n.body,
    }),
    fromRow: (r: Row): TeamNote => ({
      id: r.id as string,
      teamId: r.team_id as string,
      date: r.date as string,
      body: r.body as string,
    }),
  },
} as const;

/** Collections that map 1:1 to an id-keyed table. */
type CollKey = keyof typeof map;
const COLLECTIONS = Object.keys(map) as CollKey[];

// --- chats & node positions (key-value shaped) ------------------------------
function chatRows(userId: string, chats: PersistedData["chats"]): Row[] {
  return Object.entries(chats).map(([chat_key, messages]) => ({
    user_id: userId,
    chat_key,
    messages,
  }));
}
function posRows(userId: string, pos: PersistedData["nodePositions"]): Row[] {
  return Object.entries(pos).map(([node_id, p]) => ({
    user_id: userId,
    node_id,
    x: p.x,
    y: p.y,
  }));
}

// --- baseline tracking for incremental sync ---------------------------------
let baseline: PersistedData | null = null;

/** Record the current data as the "already persisted" reference. */
export function setBaseline(data: PersistedData): void {
  baseline = data;
}

/** Forget the baseline (on sign-out) so nothing syncs until the next load. */
export function clearBaseline(): void {
  baseline = null;
}

/** True once a baseline exists (i.e. we've loaded or seeded). */
export function hasBaseline(): boolean {
  return baseline !== null;
}

// --- public API -------------------------------------------------------------

/**
 * Read the whole org for a user. Returns null when the user has no profile row
 * yet (a brand-new account that still needs seeding).
 */
export async function loadAll(userId: string): Promise<PersistedData | null> {
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profErr) throw new Error(`profiles load: ${profErr.message}`);
  if (!prof) return null; // fresh user

  const grab = async (table: string): Promise<Row[]> => {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId);
    if (error) throw new Error(`${table} load: ${error.message}`);
    return (data ?? []) as Row[];
  };

  const [
    capacities,
    domains,
    managers,
    teams,
    people,
    actions,
    meetings,
    topics,
    sessions,
    goals,
    notes,
    wins,
    prayers,
    teamActions,
    teamGoals,
    teamNotes,
    chats,
    positions,
  ] = await Promise.all([
    grab("capacities"),
    grab("domains"),
    grab("managers"),
    grab("teams"),
    grab("people"),
    grab("actions"),
    grab("meetings"),
    grab("topics"),
    grab("one_on_ones"),
    grab("goals"),
    grab("notes"),
    grab("wins"),
    grab("prayers"),
    grab("team_actions"),
    grab("team_goals"),
    grab("team_notes"),
    grab("chats"),
    grab("node_positions"),
  ]);

  const data: PersistedData = {
    me: meFromRow(prof as Parameters<typeof meFromRow>[0]),
    capacities: capacities.map(map.capacities.fromRow),
    domains: domains.map(map.domains.fromRow),
    managers: managers.map(map.managers.fromRow),
    teams: teams.map(map.teams.fromRow).sort((a, b) => a.order - b.order),
    people: people.map(map.people.fromRow),
    actions: actions.map(map.actions.fromRow),
    meetings: meetings.map(map.meetings.fromRow),
    topics: topics.map(map.topics.fromRow).sort((a, b) => a.order - b.order),
    sessions: sessions.map(map.sessions.fromRow),
    goals: goals.map(map.goals.fromRow),
    notes: notes.map(map.notes.fromRow),
    wins: wins.map(map.wins.fromRow),
    prayers: prayers.map(map.prayers.fromRow),
    teamActions: teamActions.map(map.teamActions.fromRow),
    teamGoals: teamGoals.map(map.teamGoals.fromRow),
    teamNotes: teamNotes.map(map.teamNotes.fromRow),
    chats: Object.fromEntries(
      chats.map((r) => [r.chat_key as string, (r.messages as ChatMessage[]) ?? []])
    ),
    nodePositions: Object.fromEntries(
      positions.map((r) => [
        r.node_id as string,
        { x: r.x as number, y: r.y as number },
      ])
    ),
  };
  return data;
}

/** Insert a full document for a user (first-time seed or import). */
export async function writeAll(userId: string, d: PersistedData): Promise<void> {
  const { error } = await supabase.from("profiles").upsert(meToRow(userId, d.me));
  if (error) throw new Error(`profiles upsert: ${error.message}`);

  await Promise.all([
    ...COLLECTIONS.map((k) => {
      const m = map[k];
      const rows = (d[k] as unknown[]).map((item) =>
        (m.toRow as (u: string, item: unknown) => Row)(userId, item)
      );
      return pushRows(m.table, "id", userId, rows);
    }),
    pushRows("chats", "chat_key", userId, chatRows(userId, d.chats)),
    pushRows("node_positions", "node_id", userId, posRows(userId, d.nodePositions)),
  ]);

  setBaseline(d);
}

/**
 * Persist only what changed since the last baseline. Compares each collection
 * by reference (zustand hands us fresh arrays only for the slices that changed)
 * and re-syncs just those tables.
 */
export async function syncData(userId: string, d: PersistedData): Promise<void> {
  const base = baseline;
  const jobs: Promise<void>[] = [];

  if (!base || base.me !== d.me) {
    jobs.push(
      (async () => {
        const { error } = await supabase
          .from("profiles")
          .upsert(meToRow(userId, d.me));
        if (error) throw new Error(`profiles upsert: ${error.message}`);
      })()
    );
  }

  for (const k of COLLECTIONS) {
    if (base && base[k] === d[k]) continue;
    const m = map[k];
    const rows = (d[k] as unknown[]).map((item) =>
      (m.toRow as (u: string, item: unknown) => Row)(userId, item)
    );
    jobs.push(pushRows(m.table, "id", userId, rows));
  }

  if (!base || base.chats !== d.chats) {
    jobs.push(pushRows("chats", "chat_key", userId, chatRows(userId, d.chats)));
  }
  if (!base || base.nodePositions !== d.nodePositions) {
    jobs.push(
      pushRows("node_positions", "node_id", userId, posRows(userId, d.nodePositions))
    );
  }

  await Promise.all(jobs);
  setBaseline(d);
}

/** Delete every row this user owns (used by the cloud "reset to seed"). */
export async function wipeUser(userId: string): Promise<void> {
  const tables = [
    ...COLLECTIONS.map((k) => map[k].table),
    "chats",
    "node_positions",
    "profiles",
  ];
  await Promise.all(
    tables.map(async (t) => {
      const { error } = await supabase.from(t).delete().eq("user_id", userId);
      if (error) throw new Error(`${t} wipe: ${error.message}`);
    })
  );
  baseline = null;
}
