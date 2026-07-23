import type { Team } from "../types";

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
