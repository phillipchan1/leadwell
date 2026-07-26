import type { Person, Team } from "../types";

export function teamChildren(teams: Team[], parentId: string): Team[] {
  return teams
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.order - b.order);
}

/** True if `candidateId` is nested under `ancestorId`. */
export function isDescendant(
  teams: Team[],
  ancestorId: string,
  candidateId: string
): boolean {
  let cur = teams.find((t) => t.id === candidateId);
  const seen = new Set<string>();
  while (cur?.parentId) {
    if (cur.parentId === ancestorId) return true;
    if (seen.has(cur.parentId)) break;
    seen.add(cur.parentId);
    cur = teams.find((t) => t.id === cur!.parentId);
  }
  return false;
}

/**
 * Teams that can parent `forTeamId` — down-teams only, excluding self and
 * any of its descendants (no cycles).
 */
export function eligibleParents(teams: Team[], forTeamId?: string): Team[] {
  return teams
    .filter((t) => {
      if (t.direction === "up") return false;
      if (forTeamId && t.id === forTeamId) return false;
      if (forTeamId && isDescendant(teams, forTeamId, t.id)) return false;
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Parent to render against in the current visible set. If the parent isn't
 * visible (e.g. domain filter), the team acts as a root.
 */
export function effectiveParentId(
  team: Team,
  visibleIds: Set<string>
): string | undefined {
  if (!team.parentId || !visibleIds.has(team.parentId)) return undefined;
  return team.parentId;
}

// --- direct reports ---------------------------------------------------------

/**
 * People who hang straight off me rather than off a team. The case this exists
 * for: I manage someone who leads teams I don't lead — the person is the
 * relationship, the teams are hers.
 */
export function directReports(people: Person[]): Person[] {
  return people.filter((p) => !p.teamId);
}

/** Teams this person leads instead of me, top of their subtree first. */
export function teamsLedBy(teams: Team[], personId: string): Team[] {
  return teams
    .filter((t) => t.leaderId === personId && !t.parentId)
    .sort((a, b) => a.order - b.order);
}

/**
 * Teams whose meetings aren't mine to convene — someone else leads them, plus
 * everything nested underneath. Readiness never counts these at me unless I
 * explicitly opt in, because "undecided" should only ever mean *my* decision.
 */
export function delegatedTeamIds(teams: Team[]): Set<string> {
  const out = new Set(teams.filter((t) => t.leaderId).map((t) => t.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of teams) {
      if (!out.has(t.id) && t.parentId && out.has(t.parentId)) {
        out.add(t.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Life area for a person: their team's, or their own tag when they have no team. */
export function personDomainId(
  person: Person,
  teams: Team[]
): string | undefined {
  if (!person.teamId) return person.domainId;
  return teams.find((t) => t.id === person.teamId)?.domainId;
}

/**
 * Teams that can be handed to a direct report. Only down-teams, and never one
 * nested under another team — a sub-team follows its parent up the tree.
 */
export function delegableTeams(teams: Team[]): Team[] {
  return teams.filter((t) => t.direction !== "up" && !t.parentId);
}
