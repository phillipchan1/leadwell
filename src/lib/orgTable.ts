/**
 * The row model behind the table view.
 *
 * The canvas answers "what does my world look like"; the table answers "where
 * is X" — and the two have to agree, so both read the same store and mean the
 * same thing by a parent, a domain and a health call. That's what keeps the
 * table a second lens rather than a second source of truth.
 *
 * Teams and people share one row type on purpose. A table with two row shapes
 * can't sort a person above a team, and "show me everything strained, whatever
 * it is" is the question the health scan exists to answer.
 */
import type {
  Capacity,
  Domain,
  Health,
  Person,
  Team,
  TeamAction,
  Action,
  Session,
  TrackedMeeting,
} from "../types";
import { isAssessed, hasLeadershipRead } from "./derive";
import { HEALTH_LABEL, HEALTH_SCORE, teamHealth } from "./health";
import {
  STATE_ORDER,
  readinessFor,
  type Readiness,
  type ReadinessData,
} from "./readiness";
import { personDomainId, teamsLedBy } from "./teams";

export type RowKind = "team" | "person";

export type OrgRecord = {
  /** Row key: "team:t1" / "person:p3" — unique across both kinds. */
  id: string;
  kind: RowKind;
  team?: Team;
  person?: Person;
  name: string;
  role?: string;
  /** Team / Sub-team / Person / Direct report / Above me. */
  typeLabel: string;
  /** The team it sits on or under; the leader, for a delegated team. */
  underName: string;
  domain?: Domain;
  capacity?: Capacity;
  /**
   * My own call, and only that. Filtering, grouping and sorting all read this,
   * so "Not rated" means *I* haven't rated it — a team can't be quietly counted
   * as healthy because its people happen to be.
   */
  health?: Health;
  /** Display only: a team's level averaged from its people, when I've made no call. */
  derived?: Health;
  note?: string;
  readiness: Readiness | null;
  nextDate: string | null;
  /** People: frameworks recorded, 0–3. Teams: members with a read. */
  coverage: number;
  coverageLabel: string;
  /** "4 people · 1 sub-team", or a person's team count. */
  sizeLabel: string;
};

export type OrgSource = {
  teams: Team[];
  people: Person[];
  domains: Domain[];
  capacities: Capacity[];
  meetings: TrackedMeeting[];
  sessions: Session[];
  actions: Action[];
  teamActions: TeamAction[];
};

export const rowId = (kind: RowKind, id: string) => `${kind}:${id}`;

function teamTypeLabel(team: Team): string {
  if (team.direction === "up") return "Above me";
  if (team.parentId) return "Sub-team";
  return "Team";
}

function personTypeLabel(person: Person, team?: Team): string {
  if (!person.teamId) return "Direct report";
  if (team?.direction === "up") return "Leads me";
  return "Person";
}

/** Every team and person as a row, keyed by row id. */
export function buildRecords(src: OrgSource): Map<string, OrgRecord> {
  const rdata: ReadinessData = {
    meetings: src.meetings,
    sessions: src.sessions,
    actions: src.actions,
    teamActions: src.teamActions,
  };
  const domainOf = (id?: string) => src.domains.find((d) => d.id === id);
  const out = new Map<string, OrgRecord>();

  for (const team of src.teams) {
    const members = src.people.filter((p) => p.teamId === team.id);
    const subTeams = src.teams.filter((t) => t.parentId === team.id);
    const parent = src.teams.find((t) => t.id === team.parentId);
    const leader = src.people.find((p) => p.id === team.leaderId);
    const health = teamHealth(team, members);
    const readiness = readinessFor("team", team.id, rdata);
    const withRead = members.filter(hasLeadershipRead).length;

    out.set(rowId("team", team.id), {
      id: rowId("team", team.id),
      kind: "team",
      team,
      name: team.name,
      role: team.purpose,
      typeLabel: teamTypeLabel(team),
      underName: parent?.name ?? (leader ? `Led by ${leader.name}` : "Me"),
      domain: domainOf(team.domainId),
      capacity: src.capacities.find((c) => c.id === team.capacityId),
      health: team.health,
      derived: health?.derived ? health.health : undefined,
      note: team.health?.note,
      readiness,
      nextDate: readiness?.nextDate ?? null,
      coverage: members.length ? withRead / members.length : 0,
      coverageLabel: members.length ? `${withRead}/${members.length}` : "—",
      sizeLabel: [
        `${members.length} ${members.length === 1 ? "person" : "people"}`,
        subTeams.length
          ? `${subTeams.length} sub-team${subTeams.length === 1 ? "" : "s"}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  for (const person of src.people) {
    const team = src.teams.find((t) => t.id === person.teamId);
    const readiness = readinessFor("person", person.id, rdata);
    const a = person.assessments;
    const coverage =
      Number(Boolean(a.cliftonTop5?.length)) +
      Number(Boolean(a.enneagram)) +
      Number(Boolean(a.mbti));
    const led = teamsLedBy(src.teams, person.id);

    out.set(rowId("person", person.id), {
      id: rowId("person", person.id),
      kind: "person",
      person,
      name: person.name,
      role: person.role,
      typeLabel: personTypeLabel(person, team),
      underName: team?.name ?? "Me",
      domain: domainOf(personDomainId(person, src.teams)),
      capacity: src.capacities.find((c) => c.id === team?.capacityId),
      health: person.health,
      note: person.health?.note,
      readiness,
      nextDate: readiness?.nextDate ?? null,
      coverage: coverage / 3,
      coverageLabel: `${coverage}/3`,
      sizeLabel: led.length
        ? `leads ${led.length} team${led.length === 1 ? "" : "s"}`
        : isAssessed(person)
          ? "assessed"
          : "",
    });
  }

  return out;
}

// --- outline ----------------------------------------------------------------

export type OutlineNode = {
  record: OrgRecord;
  children: OutlineNode[];
};

/**
 * The org as an outline: a team, then its people, then the teams nested under
 * it — and direct reports carrying whatever they lead. Same nesting the canvas
 * draws, which is the point: the table is that tree, flattened and sortable.
 */
export function buildOutline(
  src: OrgSource,
  records: Map<string, OrgRecord>
): OutlineNode[] {
  const byOrder = (a: Team, b: Team) => a.order - b.order;
  const node = (id: string, children: OutlineNode[] = []): OutlineNode | null => {
    const record = records.get(id);
    return record ? { record, children } : null;
  };

  const teamNode = (team: Team): OutlineNode | null => {
    const members = src.people
      .filter((p) => p.teamId === team.id)
      .map((p) => node(rowId("person", p.id)))
      .filter((n): n is OutlineNode => n !== null);
    const subTeams = src.teams
      .filter((t) => t.parentId === team.id)
      .sort(byOrder)
      .map(teamNode)
      .filter((n): n is OutlineNode => n !== null);
    return node(rowId("team", team.id), [...members, ...subTeams]);
  };

  const roots: OutlineNode[] = [];

  // Teams I lead, top-level first.
  for (const team of src.teams
    .filter((t) => t.direction !== "up" && !t.parentId && !t.leaderId)
    .sort(byOrder)) {
    const n = teamNode(team);
    if (n) roots.push(n);
  }

  // Direct reports, carrying the teams that are theirs to run.
  for (const person of src.people.filter((p) => !p.teamId)) {
    const led = teamsLedBy(src.teams, person.id)
      .map(teamNode)
      .filter((n): n is OutlineNode => n !== null);
    const n = node(rowId("person", person.id), led);
    if (n) roots.push(n);
  }

  // Anything above me last — it's context, not the day job.
  for (const team of src.teams.filter((t) => t.direction === "up").sort(byOrder)) {
    const n = teamNode(team);
    if (n) roots.push(n);
  }

  // A team whose leader isn't a row (deleted, filtered out) would vanish
  // otherwise; hang it at the root rather than lose it.
  const placed = new Set<string>();
  const walk = (nodes: OutlineNode[]) =>
    nodes.forEach((n) => {
      placed.add(n.record.id);
      walk(n.children);
    });
  walk(roots);
  for (const team of src.teams) {
    if (placed.has(rowId("team", team.id))) continue;
    const n = teamNode(team);
    if (n) {
      roots.push(n);
      walk([n]);
    }
  }

  return roots;
}

// --- sorting ----------------------------------------------------------------

export type SortKey =
  | "name"
  | "type"
  | "under"
  | "domain"
  | "capacity"
  | "health"
  | "note"
  | "ready"
  | "next"
  | "read"
  | "size";

/** Weakest first when ascending — the direction you actually want on health. */
function healthRank(r: OrgRecord): number {
  return r.health ? HEALTH_SCORE[r.health.level] : 999;
}

function readyRank(r: OrgRecord): number {
  return r.readiness ? STATE_ORDER.indexOf(r.readiness.state) : 99;
}

const text = (v?: string) => (v ?? "").toLowerCase();

export function compareRecords(
  key: SortKey,
  asc: boolean
): (a: OrgRecord, b: OrgRecord) => number {
  const dir = asc ? 1 : -1;
  return (a, b) => {
    let d = 0;
    switch (key) {
      case "health":
        d = healthRank(a) - healthRank(b);
        break;
      case "ready":
        d = readyRank(a) - readyRank(b);
        break;
      case "next":
        d = (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999");
        break;
      case "read":
        d = a.coverage - b.coverage;
        break;
      case "type":
        d = text(a.typeLabel).localeCompare(text(b.typeLabel));
        break;
      case "under":
        d = text(a.underName).localeCompare(text(b.underName));
        break;
      case "domain":
        d = text(a.domain?.name).localeCompare(text(b.domain?.name));
        break;
      case "capacity":
        d = text(a.capacity?.label).localeCompare(text(b.capacity?.label));
        break;
      case "note":
        d = text(a.note).localeCompare(text(b.note));
        break;
      case "size":
        d = text(a.sizeLabel).localeCompare(text(b.sizeLabel));
        break;
      default:
        d = 0;
    }
    // Name is the tiebreaker everywhere, so equal cells never shuffle between
    // renders — a table that reorders under you is unusable.
    return (d !== 0 ? d * dir : 0) || a.name.localeCompare(b.name);
  };
}

// --- grouping ---------------------------------------------------------------

export type GroupBy = "team" | "domain" | "health" | "capacity" | "type" | "none";

export type GroupHeader = { key: string; label: string; color?: string };

/** Which bucket a row falls in — and how that bucket presents itself. */
export function groupOf(record: OrgRecord, by: GroupBy): GroupHeader {
  switch (by) {
    case "domain":
      return record.domain
        ? { key: record.domain.id, label: record.domain.name, color: record.domain.color }
        : { key: "~none", label: "No domain" };
    case "health":
      return record.health
        ? { key: record.health.level, label: HEALTH_LABEL[record.health.level] }
        : { key: "~none", label: "Not rated" };
    case "capacity":
      return record.capacity
        ? {
            key: record.capacity.id,
            label: record.capacity.label,
            color: record.capacity.color,
          }
        : { key: "~none", label: "No capacity" };
    case "type":
      return { key: record.typeLabel, label: record.typeLabel };
    default:
      return { key: "~all", label: "All" };
  }
}
