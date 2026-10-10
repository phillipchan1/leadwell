/**
 * Circles — the people you lead, laid out as rings around you.
 *
 * The tree answers "who sits under whom" and draws it top-down, which makes
 * the org look like a ladder with you near the top. Circles draws the same
 * structure from the inside out: you at the center, the teams you run and the
 * people who report to you on the first ring, the people on those teams on the
 * second, anything nested deeper on the third, and the leaders you answer to
 * in a band above. Nobody falls off the edge — everyone has a place on it.
 *
 * Pure geometry: positions in a fixed coordinate space that the view scales.
 */
import type { Manager, Person, Team } from "../types";

export type CircleKind = "me" | "team" | "person" | "manager";

export type CircleNode = {
  key: string;
  kind: CircleKind;
  id: string;
  name: string;
  ring: 0 | 1 | 2 | 3 | "above";
  x: number;
  y: number;
  parentKey: string | null;
  /** The life area a node belongs to, for its identity square. */
  domainId?: string;
};

export type CircleLayout = {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Only the rings that hold someone. */
  radii: number[];
  nodes: CircleNode[];
  /** Where the band of leaders above you meets the line down to you. */
  aboveY: number | null;
};

type Doc = { people: Person[]; teams: Team[]; managers: Manager[] };

const TAU = Math.PI * 2;
/** Room left at twelve o'clock for the line up to the leaders above you. */
const TOP_GAP = (40 / 360) * TAU;

function domainOfPerson(p: Person, teams: Team[]): string | undefined {
  if (!p.teamId) return p.domainId;
  return teams.find((t) => t.id === p.teamId)?.domainId;
}

export function layoutCircles(doc: Doc, scopeId: string | null): CircleLayout {
  const inScope = (domainId?: string) => !scopeId || domainId === scopeId;
  const upTeams = new Set(doc.teams.filter((t) => t.direction === "up").map((t) => t.id));
  const teamDomain = (t: Team): string | undefined =>
    t.domainId ?? (t.parentId ? doc.teams.find((x) => x.id === t.parentId)?.domainId : undefined);

  // ── Who goes where ──────────────────────────────────────────────────────
  type Branch = { node: Omit<CircleNode, "x" | "y">; children: Branch[] };

  const personNode = (p: Person, ring: 1 | 2 | 3, parentKey: string | null) => ({
    key: `person:${p.id}`,
    kind: "person" as const,
    id: p.id,
    name: p.name,
    ring,
    parentKey,
    domainId: domainOfPerson(p, doc.teams),
  });
  const teamNode = (t: Team, ring: 1 | 2 | 3, parentKey: string | null) => ({
    key: `team:${t.id}`,
    kind: "team" as const,
    id: t.id,
    name: t.name,
    ring,
    parentKey,
    domainId: teamDomain(t),
  });

  /** A team's people, then its sub-teams — one level, one ring further out. */
  const teamChildren = (t: Team, ring: 2 | 3): Branch[] => {
    const parentKey = `team:${t.id}`;
    const members = doc.people
      .filter((p) => p.teamId === t.id)
      .map((p) => ({ node: personNode(p, ring, parentKey), children: [] as Branch[] }));
    const subs = doc.teams
      .filter((s) => s.parentId === t.id && !upTeams.has(s.id))
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        node: teamNode(s, ring, parentKey),
        children:
          ring === 2
            ? doc.people
                .filter((p) => p.teamId === s.id)
                .map((p) => ({ node: personNode(p, 3, `team:${s.id}`), children: [] as Branch[] }))
            : [],
      }));
    return [...members, ...subs];
  };

  const firstRing: Branch[] = [
    // Teams I run directly: not up-teams, not nested, not handed to a report.
    ...doc.teams
      .filter((t) => !upTeams.has(t.id) && !t.parentId && !t.leaderId)
      .sort((a, b) => a.order - b.order)
      .map((t) => ({ node: teamNode(t, 1, "me"), children: teamChildren(t, 2) })),
    // Direct reports, carrying whatever they lead.
    ...doc.people
      .filter((p) => !p.teamId)
      .map((p) => ({
        node: personNode(p, 1, "me"),
        children: doc.teams
          .filter((t) => t.leaderId === p.id && !t.parentId)
          .sort((a, b) => a.order - b.order)
          .map((t) => ({
            node: teamNode(t, 2, `person:${p.id}`),
            children: doc.people
              .filter((m) => m.teamId === t.id)
              .map((m) => ({ node: personNode(m, 3, `team:${t.id}`), children: [] as Branch[] })),
          })),
      })),
  ].filter((b) => inScope(b.node.domainId));

  const above = [
    ...doc.managers
      .filter((m) => inScope(m.domainId))
      .map((m) => ({ key: `manager:${m.id}`, kind: "manager" as const, id: m.id, name: m.name, domainId: m.domainId })),
    ...doc.people
      .filter((p) => p.teamId && upTeams.has(p.teamId))
      .filter((p) => inScope(domainOfPerson(p, doc.teams)))
      .map((p) => ({ key: `person:${p.id}`, kind: "person" as const, id: p.id, name: p.name, domainId: domainOfPerson(p, doc.teams) })),
  ];

  // ── Ring sizes grow with what has to fit on them ────────────────────────
  const n1 = firstRing.length;
  const n2 = firstRing.reduce((a, b) => a + b.children.length, 0);
  const n3 = firstRing.reduce((a, b) => a + b.children.reduce((c, d) => c + d.children.length, 0), 0);
  // A first-ring pill is ~180px wide, so the first ring needs the room to
  // seat its neighbours side by side even at six o'clock, where they sit flat.
  const r1 = Math.max(200, (n1 * 240) / TAU);
  const r2 = Math.max(r1 + 140, (n2 * 135) / TAU);
  const r3 = Math.max(r2 + 105, (n3 * 120) / TAU);
  const outer = n3 ? r3 : n2 ? r2 : r1;

  const margin = 90;
  const aboveBand = above.length ? 120 : 0;
  const width = Math.max(2 * (outer + margin), above.length * 180 + 80);
  const cx = width / 2;
  const cy = aboveBand + outer + margin;
  const height = cy + outer + margin;

  // ── Angles: each first-ring branch gets a slice sized to what it holds ──
  // Never less than a pill's worth of arc, however little a branch holds.
  const weight = (b: Branch) =>
    Math.max(1.6, b.children.length, b.children.reduce((c, d) => c + d.children.length, 0) * 0.85);
  const total = firstRing.reduce((a, b) => a + weight(b), 0) || 1;
  const span = TAU - (above.length ? TOP_GAP : 0);
  let cursor = -Math.PI / 2 + (above.length ? TOP_GAP / 2 : 0);

  const at = (r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const nodes: CircleNode[] = [{ key: "me", kind: "me", id: "", name: "You", ring: 0, parentKey: null, ...at(0, 0) }];

  for (const b of firstRing) {
    const slice = (weight(b) / total) * span;
    const mid = cursor + slice / 2;
    nodes.push({ ...b.node, ...at(r1, mid) });
    const kids = b.children;
    kids.forEach((k, i) => {
      // Children spread across their parent's slice, never wider than it.
      const a = cursor + ((i + 0.5) / kids.length) * slice;
      nodes.push({ ...k.node, ...at(r2, a) });
      const grand = k.children;
      const sub = slice / kids.length;
      grand.forEach((g, j) => {
        const ga = cursor + i * sub + ((j + 0.5) / grand.length) * sub;
        nodes.push({ ...g.node, ...at(r3, ga) });
      });
    });
    cursor += slice;
  }

  // ── The band above ──────────────────────────────────────────────────────
  const aboveY = above.length ? 56 : null;
  if (above.length) {
    const step = Math.min(190, (width - 120) / above.length);
    const start = cx - (step * (above.length - 1)) / 2;
    above.forEach((a, i) =>
      nodes.push({ ...a, ring: "above", parentKey: "me", x: start + i * step, y: aboveY! })
    );
  }

  const radii = n3 ? [r1, r2, r3] : n2 ? [r1, r2] : [r1];
  return { width, height, cx, cy, radii, nodes, aboveY };
}
