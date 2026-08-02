import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  PanOnScrollMode,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  useStore,
  useActiveTeamId,
  type NodePosition,
  type TreeLayer,
} from "../store/useStore";
import type { Manager, Person, Team } from "../types";
import { domainCounts, hasLeadershipRead, topDomain } from "../lib/derive";
import {
  HEALTH_COLOR,
  HEALTH_FILTER_VALUES,
  HEALTH_LABEL,
  filterColor,
  filterLabel,
  matchesHealth,
  rollUpHealth,
  teamHealth,
  type HealthFilterValue,
} from "../lib/health";
import { HealthBar, HealthChip, HealthDot } from "./Health";
import {
  distribution,
  formatCountdown,
  isBehind,
  meetingFor,
  readinessFor,
  rollUp,
  STATE_COLOR,
  STATE_LABEL,
  STATE_ORDER,
  triageState,
  type Readiness,
  type ReadinessData,
} from "../lib/readiness";
import { DOMAINS, DOMAIN_COLOR, THEME_DOMAIN } from "../data/frameworks";
import {
  delegatedTeamIds,
  directReports,
  effectiveParentId,
  teamsLedBy,
} from "../lib/teams";
import { Avatar } from "./Avatar";
import { ReadinessChip } from "./ReadinessChip";
import { TintBadge, Card } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";

import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Edit01, Plus } from "@untitledui/icons";
import { TeamModal, PersonModal, ManagerModal, DomainsModal } from "./forms";
import { TriageModal } from "./TriageModal";
import { TableView } from "./TableView";

const LAYER_KEYS: Record<string, TreeLayer> = {
  p: "people",
  a: "action",
  m: "mandate",
  g: "giftMix",
  d: "detail",
  r: "readiness",
  h: "health",
};

const NODE_W = 320; // matches w-80 on team cards
const SPACING_X = NODE_W + 48;
const CHILD_GAP_X = 48;
const CHILD_DY = 240; // vertical gap parent → sub-team
const RANK_Y = 180; // first down-team rank below me
const ME_W = 256; // w-64
const MGR_W = 208; // manager card width
const MGR_SPACING_X = MGR_W + 32;
const REPORT_W = 256; // direct-report card width (w-64) — wider than a manager
// card because this one parents teams, and a truncated name reads as a stub.

/** Canvas node id for a direct report — teams use their bare id. */
const reportNodeId = (personId: string) => `person:${personId}`;

/**
 * What a team hangs off in the current visible set: its parent team, else the
 * direct report who leads it, else nothing (it hangs off me).
 */
function canvasParentId(
  team: Team,
  visibleTeamIds: Set<string>,
  reportIds: Set<string>
): string | undefined {
  const parent = effectiveParentId(team, visibleTeamIds);
  if (parent) return parent;
  if (team.leaderId && reportIds.has(team.leaderId)) {
    return reportNodeId(team.leaderId);
  }
  return undefined;
}

/** One node and everything hanging under it, for width-aware placement. */
type Unit = { id: string; width: number; kids: Unit[] };

/**
 * Default auto-layout: managers just above me, up-teams in a rank higher still,
 * root down-teams and direct reports below me, and — under each of those — the
 * sub-teams or delegated teams they carry.
 */
function defaultLayout(
  teams: Team[],
  managers: Manager[],
  reports: Person[]
): Record<string, NodePosition> {
  const byOrder = (a: Team, b: Team) => a.order - b.order;
  const visibleIds = new Set(teams.map((t) => t.id));
  const reportIds = new Set(reports.map((p) => p.id));
  const down = teams.filter((t) => t.direction !== "up");
  const up = teams.filter((t) => t.direction === "up").sort(byOrder);

  const childrenOf = (id: string) =>
    down
      .filter((t) => canvasParentId(t, visibleIds, reportIds) === id)
      .sort(byOrder);

  const teamUnit = (t: Team): Unit => ({
    id: t.id,
    width: NODE_W,
    kids: childrenOf(t.id).map(teamUnit),
  });

  const roots: Unit[] = [
    ...down
      .filter((t) => !canvasParentId(t, visibleIds, reportIds))
      .sort(byOrder)
      .map(teamUnit),
    ...reports.map((p) => ({
      id: reportNodeId(p.id),
      width: REPORT_W,
      kids: childrenOf(reportNodeId(p.id)).map(teamUnit),
    })),
  ];

  const subtreeWidth = (u: Unit): number => {
    if (u.kids.length === 0) return u.width;
    const inner =
      u.kids.reduce((sum, k) => sum + subtreeWidth(k), 0) +
      (u.kids.length - 1) * CHILD_GAP_X;
    return Math.max(u.width, inner);
  };

  const pos: Record<string, NodePosition> = {
    me: { x: -ME_W / 2, y: 0 },
  };

  const place = (u: Unit, centerX: number, y: number) => {
    pos[u.id] = { x: centerX - u.width / 2, y };
    if (u.kids.length === 0) return;
    const widths = u.kids.map(subtreeWidth);
    const total =
      widths.reduce((a, b) => a + b, 0) + (u.kids.length - 1) * CHILD_GAP_X;
    let x = centerX - total / 2;
    u.kids.forEach((k, i) => {
      place(k, x + widths[i] / 2, y + CHILD_DY);
      x += widths[i] + CHILD_GAP_X;
    });
  };

  const rootWidths = roots.map(subtreeWidth);
  const rootsTotal =
    rootWidths.reduce((a, b) => a + b, 0) +
    Math.max(0, roots.length - 1) * CHILD_GAP_X;
  let rx = -rootsTotal / 2;
  roots.forEach((u, i) => {
    place(u, rx + rootWidths[i] / 2, RANK_Y);
    rx += rootWidths[i] + CHILD_GAP_X;
  });

  managers.forEach((m, i) => {
    pos[`mgr:${m.id}`] = {
      x: (i - (managers.length - 1) / 2) * MGR_SPACING_X - MGR_W / 2,
      y: -190,
    };
  });
  up.forEach((t, i) => {
    pos[t.id] = {
      x: (i - (up.length - 1) / 2) * SPACING_X - NODE_W / 2,
      y: -560,
    };
  });
  return pos;
}

const nodeTypes = {
  me: MeNode,
  team: TeamNode,
  manager: ManagerNode,
  report: DirectReportNode,
};

export function OrgTree() {
  const {
    teams,
    people,
    managers,
    nodePositions,
    setNodePosition,
    resetLayout,
    dark,
    capacities,
    domains,
    treeDomainId,
    setTreeDomainId,
    toggleTreeLayer,
    modal,
    openModal,
    closeModal,
    askAIOpen,
    settingsOpen,
  } = useStore();

  // 1–9 = domains; P/A/M/G/D = card layers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (modal || askAIOpen || settingsOpen) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      const layer = LAYER_KEYS[e.key.toLowerCase()];
      if (layer) {
        e.preventDefault();
        toggleTreeLayer(layer);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const options: (string | null)[] = [null, ...domains.map((d) => d.id)];
      const id = options[n - 1];
      if (id === undefined) return;
      e.preventDefault();
      setTreeDomainId(id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [domains, modal, askAIOpen, settingsOpen, setTreeDomainId, toggleTreeLayer]);

  const visibleTeams = useMemo(
    () =>
      treeDomainId
        ? teams.filter((t) => t.domainId === treeDomainId)
        : teams,
    [teams, treeDomainId]
  );
  const visibleManagers = useMemo(
    () =>
      treeDomainId
        ? managers.filter((m) => m.domainId === treeDomainId)
        : managers,
    [managers, treeDomainId]
  );
  // Direct reports get their own node — they're the ones with no team card to
  // live inside. Their domain is their own tag, not a team's.
  const visibleReports = useMemo(() => {
    const reports = directReports(people);
    return treeDomainId
      ? reports.filter((p) => p.domainId === treeDomainId)
      : reports;
  }, [people, treeDomainId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    const defaults = defaultLayout(
      visibleTeams,
      visibleManagers,
      visibleReports
    );
    const visibleIds = new Set(visibleTeams.map((t) => t.id));
    const reportIds = new Set(visibleReports.map((p) => p.id));
    // Filtered views reflow tightly; All keeps any manually dragged positions.
    // New nodes (no saved position) are placed relative to where "me" currently
    // sits — or, for sub-teams, relative to their parent's current position.
    const mePos = treeDomainId
      ? defaults.me
      : (nodePositions.me ?? defaults.me);
    const origin = defaults.me;
    const dx = mePos.x - origin.x;
    const dy = mePos.y - origin.y;

    const resolvePos = (id: string): NodePosition => {
      if (treeDomainId) return defaults[id] ?? { x: 0, y: 0 };
      if (id === "me") return mePos;
      if (nodePositions[id]) return nodePositions[id];

      const team = visibleTeams.find((t) => t.id === id);
      const parentId = team
        ? canvasParentId(team, visibleIds, reportIds)
        : undefined;
      if (parentId && defaults[id] && defaults[parentId]) {
        const parentPos = resolvePos(parentId);
        return {
          x: parentPos.x + (defaults[id].x - defaults[parentId].x),
          y: parentPos.y + (defaults[id].y - defaults[parentId].y),
        };
      }
      const d = defaults[id] ?? { x: 0, y: 0 };
      return { x: d.x + dx, y: d.y + dy };
    };

    setNodes([
      {
        id: "me",
        type: "me",
        position: resolvePos("me"),
        data: {},
      },
      ...visibleManagers.map((m) => ({
        id: `mgr:${m.id}`,
        type: "manager",
        position: resolvePos(`mgr:${m.id}`),
        data: { managerId: m.id },
      })),
      ...visibleReports.map((p) => ({
        id: reportNodeId(p.id),
        type: "report",
        position: resolvePos(reportNodeId(p.id)),
        data: { personId: p.id },
      })),
      ...visibleTeams.map((t) => ({
        id: t.id,
        type: "team",
        position: resolvePos(t.id),
        data: { teamId: t.id },
      })),
    ]);
  }, [
    visibleTeams,
    visibleManagers,
    visibleReports,
    nodePositions,
    treeDomainId,
    setNodes,
  ]);

  const edges: Edge[] = useMemo(() => {
    const visibleIds = new Set(visibleTeams.map((t) => t.id));
    const reportIds = new Set(visibleReports.map((p) => p.id));
    const teamEdges: Edge[] = visibleTeams.map((t) => {
      const capacity = capacities.find((c) => c.id === t.capacityId);
      const base = {
        id: `e-${t.id}`,
        type: "smoothstep" as const,
        style: {
          stroke: capacity?.color ?? "#a8a29e",
          strokeWidth: 1.5,
          opacity: 0.55,
        },
      };
      const parentId = canvasParentId(t, visibleIds, reportIds);
      if (parentId) {
        return { ...base, source: parentId, target: t.id };
      }
      return t.direction === "up"
        ? { ...base, source: t.id, target: "me" }
        : { ...base, source: "me", target: t.id };
    });
    // Direct reports link to me the same way teams do — the relationship is
    // no less real for having no team attached to it.
    const reportEdges: Edge[] = visibleReports.map((p) => {
      const domain = domains.find((d) => d.id === p.domainId);
      return {
        id: `e-${reportNodeId(p.id)}`,
        source: "me",
        target: reportNodeId(p.id),
        type: "smoothstep" as const,
        style: {
          stroke: domain?.color ?? "#a8a29e",
          strokeWidth: 1.5,
          opacity: 0.55,
        },
      };
    });
    // Same solid link style as teams — managers are people I report to, not
    // a secondary/adjunct relationship.
    const managerEdges: Edge[] = visibleManagers.map((m) => {
      const domain = domains.find((d) => d.id === m.domainId);
      return {
        id: `e-mgr-${m.id}`,
        source: `mgr:${m.id}`,
        target: "me",
        type: "smoothstep" as const,
        style: {
          stroke: domain?.color ?? "#3B82F6",
          strokeWidth: 1.5,
          opacity: 0.55,
        },
      };
    });
    return [...teamEdges, ...reportEdges, ...managerEdges];
  }, [visibleTeams, visibleManagers, visibleReports, capacities, domains]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* A fitted canvas renders 320px team cards at 1–3px of text on a phone,
          and one-finger pan swallows both page scroll and the iOS edge-back
          gesture. Below lg the same org is the outline instead — same records,
          same health calls, readable without pinching. */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <TableView />
      </div>

      <div className="hidden min-h-0 flex-1 flex-col gap-2 lg:flex">
      {/* Domain filter: All = full tree; pick a domain for a focused view */}
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Filter tree by domain"
      >
        <DomainTab
          active={treeDomainId === null}
          onClick={() => setTreeDomainId(null)}
          shortcut="1"
        >
          All
        </DomainTab>
        {domains.map((d, i) => (
          <DomainTab
            key={d.id}
            active={treeDomainId === d.id}
            color={d.color}
            onClick={() => setTreeDomainId(d.id)}
            shortcut={i < 8 ? String(i + 2) : undefined}
          >
            {d.name}
          </DomainTab>
        ))}
        <Button
          size="sm"
          color="tertiary"
          onClick={() => openModal({ kind: "domains" })}
        >
          Manage domains
        </Button>
        <ReadinessSummary teams={visibleTeams} reports={visibleReports} />
      </div>

      <HealthScan teams={visibleTeams} reports={visibleReports} />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        {/* React Flow captures one-finger drag to pan, which swallows the iOS
            interactive back-swipe. This gutter absorbs touches in the edge
            zone without panning, so Safari still gets the gesture. Only on
            coarse pointers — a mouse near the edge should still pan. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 z-10 hidden w-5 touch:block"
        />
        <ReactFlow
          key={treeDomainId ?? "all"}
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => {
            // Only persist positions in the All view so filtered layouts stay tidy.
            if (!treeDomainId) setNodePosition(node.id, node.position);
          }}
          nodeTypes={nodeTypes}
          colorMode={dark ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={1.75}
          nodesConnectable={false}
          deleteKeyCode={null}
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          zoomOnScroll={false}
          zoomOnPinch
          className="!bg-transparent"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={32}
            size={1}
            style={{ opacity: 0.35 }}
          />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            pannable
            zoomable
            position="top-right"
            className="!h-24 !w-36"
          />
          <Panel position="top-left" className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Add">
              <Button size="sm" onClick={() => openModal({ kind: "team" })}>
                + Add team
              </Button>
              <Button
                size="sm"
                color="secondary"
                onClick={() => openModal({ kind: "person", teamId: null })}
              >
                + Direct report
              </Button>
              <Button
                size="sm"
                color="secondary"
                onClick={() => openModal({ kind: "manager" })}
              >
                + Manager
              </Button>
            </div>
            <span
              className="hidden h-5 w-px bg-stone-200 sm:block dark:bg-stone-700"
              aria-hidden
            />
            <ViewLayers />
            <span
              className="hidden h-5 w-px bg-stone-200 sm:block dark:bg-stone-700"
              aria-hidden
            />
            <Button size="sm" color="link-gray" onClick={resetLayout}>
              Reset layout
            </Button>
          </Panel>
          {/* Legend: domains (in All) + capacities */}
          <Panel
            position="bottom-left"
            className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1.5 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90"
          >
            {!treeDomainId && domains.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">Domains</span>
                {domains.map((d) => (
                  <span
                    key={d.id}
                    className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400"
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.name}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">Capacity</span>
              {capacities.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.label}
                </span>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>
      </div>

      {modal?.kind === "team" && (
        <TeamModal
          team={modal.team}
          defaultParentId={modal.parentId}
          defaultLeaderId={modal.leaderId}
          onClose={closeModal}
        />
      )}
      {modal?.kind === "manager" && (
        <ManagerModal manager={modal.manager} onClose={closeModal} />
      )}
      {modal?.kind === "person" && (
        <PersonModal
          person={modal.person}
          defaultTeamId={modal.teamId}
          onClose={closeModal}
        />
      )}
      {modal?.kind === "domains" && <DomainsModal onClose={closeModal} />}
      {modal?.kind === "triage" && <TriageModal onClose={closeModal} />}
    </div>
  );
}

function DomainTab({
  active,
  color,
  onClick,
  shortcut,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  shortcut?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={shortcut ? `Filter (${shortcut})` : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-transparent font-medium text-white"
          : "border-stone-300 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-500"
      }`}
      style={
        active
          ? { backgroundColor: color ?? "#0D9488" }
          : undefined
      }
    >
      {color && !active && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
      {shortcut && (
        <kbd
          className={`ml-0.5 hidden rounded px-1 font-mono text-[10px] sm:inline ${
            active ? "bg-white/20 text-white/90" : "bg-stone-100 text-stone-500 dark:text-stone-400 dark:bg-stone-800"
          }`}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

/**
 * The one-line answer to "am I behind", always visible above the canvas and
 * scoped to whatever the domain filter is showing.
 *
 * The undecided count is the honest denominator: opting in cures alarm fatigue
 * but lets you go green by looking away, so anything you haven't *decided*
 * about is counted — and only until you decide. It empties, and then it's gone.
 */
function ReadinessSummary({
  teams,
  reports,
}: {
  teams: Team[];
  reports: Person[];
}) {
  const {
    people,
    managers,
    meetings,
    sessions,
    actions,
    teamActions,
    treeLayers,
    selectPerson,
    selectTeam,
    openModal,
  } = useStore();
  if (!treeLayers.readiness) return null;

  const rdata: ReadinessData = { meetings, sessions, actions, teamActions };
  const teamIds = new Set(teams.map((t) => t.id));
  const members = [
    ...people.filter((p) => p.teamId && teamIds.has(p.teamId)),
    ...reports,
  ];
  // Teams someone else leads aren't mine to convene, so neither they nor their
  // rosters belong in the undecided count — I've already decided by handing
  // them over. Tracking one explicitly still works; it just isn't asked of me.
  const delegated = delegatedTeamIds(teams);
  const mine = (p: Person) => !p.teamId || !delegated.has(p.teamId);

  type Entry = {
    kind: "person" | "team";
    id: string;
    name: string;
    readiness: Readiness;
  };
  const entries: Entry[] = [
    ...teams.flatMap((t) => {
      const r = readinessFor("team", t.id, rdata);
      return r ? [{ kind: "team" as const, id: t.id, name: t.name, readiness: r }] : [];
    }),
    ...members.flatMap((p) => {
      const r = readinessFor("person", p.id, rdata);
      return r ? [{ kind: "person" as const, id: p.id, name: p.name, readiness: r }] : [];
    }),
  ];

  const undecided =
    members.filter(
      (p) => mine(p) && triageState(p, meetings, "person") === "undecided"
    ).length +
    teams.filter(
      (t) =>
        !delegated.has(t.id) &&
        triageState(t, meetings, "team") === "undecided"
    ).length +
    managers.filter((m) => triageState(m, meetings, "manager") === "undecided")
      .length;

  if (entries.length === 0 && undecided === 0) return null;

  const roll = rollUp(entries.map((e) => e.readiness));
  const worst = entries
    .filter((e) => isBehind(e.readiness.state))
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.readiness.state) -
          STATE_ORDER.indexOf(b.readiness.state) ||
        (a.readiness.daysUntil ?? 0) - (b.readiness.daysUntil ?? 0)
    )[0];

  return (
    <div className="ml-auto flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
      {entries.length > 0 && (
        <span>
          <strong className="font-semibold text-stone-700 tabular-nums dark:text-stone-200">
            {roll.ready}
          </strong>{" "}
          of{" "}
          <strong className="font-semibold text-stone-700 tabular-nums dark:text-stone-200">
            {roll.tracked}
          </strong>{" "}
          ready
        </span>
      )}
      {worst && (
        <>
          <span className="text-stone-400 dark:text-stone-700">·</span>
          <button
            type="button"
            onClick={() =>
              worst.kind === "person"
                ? selectPerson(worst.id)
                : selectTeam(worst.id)
            }
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-stone-100 dark:hover:bg-stone-800"
            title={worst.readiness.headline}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: STATE_COLOR[worst.readiness.state] }}
            />
            {roll.behind} need prep — start with{" "}
            <span className="font-medium text-stone-700 dark:text-stone-200">
              {worst.name.split(" ")[0]}
            </span>
          </button>
        </>
      )}
      {undecided > 0 && (
        <>
          <span className="text-stone-400 dark:text-stone-700">·</span>
          <button
            type="button"
            onClick={() => openModal({ kind: "triage" })}
            className="rounded-md px-1.5 py-0.5 text-stone-500 dark:text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-400"
            title="Not a backlog — decide once and they leave this count for good"
          >
            <span className="tabular-nums">{undecided}</span> undecided
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The health scan: counts per level across everything currently on the canvas,
 * and — clicking one — the filter that dims everything else out of the way.
 *
 * Dimming rather than hiding is the whole point. Filtering to "Strained" and
 * watching two cards stay lit inside the shape of the org tells you *where* the
 * strain is; a canvas with two cards on it doesn't. A team stays lit if its own
 * rating matches or any of its people do, so scanning finds the person even
 * when the team around them reads fine.
 */
function HealthScan({
  teams,
  reports,
}: {
  teams: Team[];
  reports: Person[];
}) {
  const people = useStore((s) => s.people);
  const treeLayers = useStore((s) => s.treeLayers);
  const filter = useStore((s) => s.healthScan);
  const toggle = useStore((s) => s.toggleHealthScan);
  const setFilter = useStore((s) => s.setHealthScan);

  if (!treeLayers.health) return null;

  const teamIds = new Set(teams.map((t) => t.id));
  const members = people.filter((p) => p.teamId && teamIds.has(p.teamId));
  const subjects = [...teams, ...members, ...reports];
  if (subjects.length === 0) return null;

  const roll = rollUpHealth(subjects.map((s) => s.health));
  const unrated = subjects.length - roll.rated;

  const countFor = (value: HealthFilterValue) =>
    value === "unrated" ? unrated : roll.counts[value];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium tracking-wide text-stone-500 dark:text-stone-400 uppercase">
        Health
      </span>
      {HEALTH_FILTER_VALUES.map((value) => {
        const count = countFor(value);
        const active = filter.includes(value);
        const color = filterColor(value);
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={count === 0 && !active}
            onClick={() => toggle(value)}
            title={
              count === 0
                ? `Nothing rated ${filterLabel(value).toLowerCase()} in view`
                : `Scan for ${filterLabel(value).toLowerCase()} (${count})`
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
              active
                ? "border-transparent font-medium text-white"
                : "border-stone-300 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-500"
            }`}
            style={active ? { backgroundColor: color } : undefined}
          >
            {!active && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
            {filterLabel(value)}
            <span
              className={`tabular-nums ${active ? "text-white/80" : "text-stone-500 dark:text-stone-400"}`}
            >
              {count}
            </span>
          </button>
        );
      })}
      {filter.length > 0 && (
        <Button size="sm" color="link-gray" onClick={() => setFilter([])}>
          Clear
        </Button>
      )}
      <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">
        {roll.rated === 0 ? (
          "Nothing rated yet — set a health on any card"
        ) : (
          <>
            <strong className="font-semibold text-stone-700 tabular-nums dark:text-stone-200">
              {roll.rated}
            </strong>{" "}
            of {subjects.length} rated
            {roll.worst && (
              <>
                {" · worst "}
                <span
                  className="font-medium"
                  style={{ color: HEALTH_COLOR[roll.worst] }}
                >
                  {HEALTH_LABEL[roll.worst].toLowerCase()}
                </span>
              </>
            )}
          </>
        )}
      </span>
    </div>
  );
}

/**
 * Is this card part of the current scan's answer? A team counts itself *and*
 * its roster, so filtering for strain doesn't hide the card you need to click
 * through to reach the strained person.
 */
function useScanDimmed(kind: "team" | "person" | "manager", id: string): boolean {
  const filter = useStore((s) => s.healthScan);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);

  if (filter.length === 0) return false;
  if (kind === "manager") return !filter.includes("unrated");
  if (kind === "person") {
    const person = people.find((p) => p.id === id);
    return !matchesHealth(person?.health, filter);
  }
  const team = teams.find((t) => t.id === id);
  const members = people.filter((p) => p.teamId === id);
  return !(
    matchesHealth(team?.health, filter) ||
    members.some((m) => matchesHealth(m.health, filter))
  );
}

/** Cards fade back rather than disappear — see HealthScan. */
const dimStyle = (dim: boolean): CSSProperties => ({
  opacity: dim ? 0.22 : 1,
  transition: "opacity 150ms ease-out",
});

const VIEW_LAYERS: {
  id: TreeLayer;
  label: string;
  shortcut: string;
  title: string;
}[] = [
  { id: "people", label: "People", shortcut: "P", title: "Member list on cards" },
  { id: "action", label: "Action", shortcut: "A", title: "Next step on cards" },
  { id: "mandate", label: "Mandate", shortcut: "M", title: "Team mandate text" },
  { id: "giftMix", label: "Gift", shortcut: "G", title: "Clifton domain mix bar" },
  { id: "detail", label: "Detail", shortcut: "D", title: "Per-person strength dots" },
  {
    id: "readiness",
    label: "Ready",
    shortcut: "R",
    title: "1:1 readiness — am I prepared for the next one",
  },
  {
    id: "health",
    label: "Health",
    shortcut: "H",
    title: "My read on how each team and person is doing — and the scan bar",
  },
];

function ViewLayers() {
  const treeLayers = useStore((s) => s.treeLayers);
  const toggleTreeLayer = useStore((s) => s.toggleTreeLayer);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Card layers">
      {VIEW_LAYERS.map((layer) => {
        const on = treeLayers[layer.id];
        return (
          <button
            key={layer.id}
            type="button"
            onClick={() => toggleTreeLayer(layer.id)}
            aria-pressed={on}
            title={`${layer.title} (${layer.shortcut})`}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm ${
              on
                ? "border-teal-500 bg-teal-50 font-medium text-teal-700 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                : "border-stone-300 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
            }`}
          >
            {layer.label}
            <kbd
              className={`rounded px-1 font-mono text-[10px] ${
                on
                  ? "bg-teal-100 text-teal-600 dark:bg-teal-900/60 dark:text-teal-300"
                  : "bg-stone-100 text-stone-500 dark:text-stone-400 dark:bg-stone-800"
              }`}
            >
              {layer.shortcut}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}

/** Proportional Clifton domain bar — color only, labels in the title. */
function GiftMixBar({ people }: { people: Person[] }) {
  const counts = domainCounts(people);
  const total = DOMAINS.reduce((sum, d) => sum + counts[d], 0);
  const title =
    total === 0
      ? "No Clifton Top 5 on this team yet"
      : DOMAINS.map((d) => `${d}: ${counts[d]}`).join(" · ");

  return (
    <div
      className="flex h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
      title={title}
      role="img"
      aria-label={title}
    >
      {total === 0
        ? null
        : DOMAINS.map((d) =>
            counts[d] > 0 ? (
              <span
                key={d}
                className="h-full"
                style={{
                  width: `${(counts[d] / total) * 100}%`,
                  backgroundColor: DOMAIN_COLOR[d],
                }}
              />
            ) : null
          )}
    </div>
  );
}

/** Readiness state as a small colored chip — the glanceable "am I ready". */
/** Proportional bar of member readiness states, worst-first. */
function ReadinessBar({ readings }: { readings: Readiness[] }) {
  const roll = rollUp(readings);
  const segments = distribution(roll);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const title = segments
    .map((s) => `${STATE_LABEL[s.state]}: ${s.count}`)
    .join(" · ");

  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
      title={title}
      role="img"
      aria-label={title}
    >
      {segments.map((s) => (
        <span
          key={s.state}
          className="h-full"
          style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}

/** Tiny visual read: Top-5 domain dots + optional Enneagram type. */
function PersonGiftDots({ person }: { person: Person }) {
  const themes = person.assessments.cliftonTop5 ?? [];
  const enn = person.assessments.enneagram?.replace(/w\d+$/i, "") ?? null;
  if (themes.length === 0 && !enn) return null;

  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      {themes.length > 0 && (
        <span className="flex items-center gap-0.5" aria-hidden>
          {themes.map((theme, i) => {
            const d = THEME_DOMAIN[theme];
            return (
              <span
                key={`${theme}-${i}`}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: d ? DOMAIN_COLOR[d] : "#a8a29e" }}
                title={theme}
              />
            );
          })}
        </span>
      )}
      {enn && (
        <span
          className="rounded bg-stone-100 px-1 font-mono text-[9px] leading-4 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
          title={`Enneagram ${person.assessments.enneagram}`}
        >
          {enn}
        </span>
      )}
    </div>
  );
}

function MeNode() {
  const { me, teams, people, selectMe, selectedMe } = useStore();
  const assessed = people.filter(hasLeadershipRead).length;
  const selfRead = hasLeadershipRead(me);
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card
        className={`flex w-64 cursor-pointer items-center gap-3 px-5 py-3 shadow-sm hover:border-teal-400 ${
          selectedMe ? "border-teal-500 ring-1 ring-teal-500/30" : ""
        }`}
        onClick={() => selectMe(true)}
      >
        <Avatar name={me.name} photo={me.photo} size={44} dimmed={!selfRead} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{me.name}</div>
          <div className="text-xs text-stone-500">
            {me.title ?? "Leader"} · {teams.length} teams · {assessed}/
            {people.length} with a read
          </div>
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

function ManagerNode({ data }: NodeProps) {
  const managerId = (data as { managerId: string }).managerId;
  const {
    managers,
    domains,
    meetings,
    sessions,
    actions,
    teamActions,
    treeLayers,
    openModal,
    selectManager,
    selectedManagerId,
  } = useStore();
  const dim = useScanDimmed("manager", managerId);
  const manager = managers.find((m) => m.id === managerId);
  if (!manager) return null;
  const readiness = treeLayers.readiness
    ? readinessFor("manager", manager.id, {
        meetings,
        sessions,
        actions,
        teamActions,
      })
    : null;
  const domain = domains.find((d) => d.id === manager.domainId);
  const selected = selectedManagerId === manager.id;
  // How much of the operating manual is filled — the reason to open this node.
  const filled = Object.values(manager.leadUp ?? {}).filter(
    (v) => typeof v === "string" && v.trim()
  ).length;

  return (
    <>
      <Card
        className={`group flex w-52 cursor-pointer items-center gap-2.5 px-3 py-2 shadow-sm hover:border-blue-400 ${
          selected ? "border-blue-500 ring-1 ring-blue-500/30" : ""
        }`}
        style={dimStyle(dim)}
        onClick={() => selectManager(manager.id)}
      >
        <Avatar name={manager.name} photo={manager.photo} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{manager.name}</div>
          <div className="truncate text-[10px] text-stone-500 dark:text-stone-400">
            {[manager.role, domain?.name].filter(Boolean).join(" · ") ||
              "I report to"}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-stone-500 dark:text-stone-400">
            {filled > 0 ? (
              <span className="text-blue-500 dark:text-blue-400">
                manual {filled}/6
              </span>
            ) : (
              "no manual yet"
            )}
            {readiness && (
              <ReadinessChip
                state={readiness.state}
                text={formatCountdown(readiness)}
                title={`${STATE_LABEL[readiness.state]} — ${readiness.headline}`}
              />
            )}
          </div>
        </div>
        {domain && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: domain.color }}
            title={domain.name}
          />
        )}
        <div
          className="nodrag flex opacity-0 touch:opacity-100 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={Edit01}
            tooltip="Edit manager"
            onClick={() => openModal({ kind: "manager", manager })}
          />
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

/**
 * Someone I manage who isn't part of a team I lead — a node in their own right.
 * The teams they lead hang under them, and are theirs to run: this card counts
 * them, but the readiness chip is about my 1:1 with the person, not their
 * meetings.
 */
function DirectReportNode({ data }: NodeProps) {
  const personId = (data as { personId: string }).personId;
  const {
    people,
    teams,
    domains,
    meetings,
    sessions,
    actions,
    teamActions,
    treeLayers,
    openModal,
    selectPerson,
    selectedPersonId,
  } = useStore();
  const dim = useScanDimmed("person", personId);
  const person = people.find((p) => p.id === personId);
  if (!person) return null;
  const readiness = treeLayers.readiness
    ? readinessFor("person", person.id, {
        meetings,
        sessions,
        actions,
        teamActions,
      })
    : null;
  const domain = domains.find((d) => d.id === person.domainId);
  const led = teamsLedBy(teams, person.id);
  const selected = selectedPersonId === person.id;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card
        className={`group flex w-64 cursor-pointer items-center gap-2.5 px-3 py-2 shadow-sm hover:border-teal-400 ${
          selected ? "border-teal-500 ring-1 ring-teal-500/30" : ""
        }`}
        style={dimStyle(dim)}
        onClick={() => selectPerson(person.id)}
      >
        <Avatar
          name={person.name}
          photo={person.photo}
          size={34}
          dimmed={!hasLeadershipRead(person)}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{person.name}</div>
          <div className="truncate text-[10px] text-stone-500 dark:text-stone-400">
            {[person.role, domain?.name].filter(Boolean).join(" · ") ||
              "Direct report"}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-stone-500 dark:text-stone-400">
            <span className="truncate">
              {led.length > 0
                ? `${led.length} team${led.length === 1 ? "" : "s"}`
                : "no teams"}
            </span>
            {treeLayers.health && person.health && (
              <span className="shrink-0">
                <HealthChip health={person.health} size="sm" />
              </span>
            )}
            {readiness && (
              <span className="shrink-0">
                <ReadinessChip
                  state={readiness.state}
                  text={formatCountdown(readiness)}
                  title={`${STATE_LABEL[readiness.state]} — ${readiness.headline}`}
                />
              </span>
            )}
          </div>
        </div>
        {domain && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: domain.color }}
            title={domain.name}
          />
        )}
        <div
          className="nodrag flex opacity-0 touch:opacity-100 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={Plus}
            tooltip={`Add a team ${person.name} leads`}
            onClick={() => openModal({ kind: "team", leaderId: person.id })}
          />
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={Edit01}
            tooltip="Edit person"
            onClick={() => openModal({ kind: "person", person })}
          />
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

function TeamNode({ data }: NodeProps) {
  const teamId = (data as { teamId: string }).teamId;
  const {
    teams,
    people,
    capacities,
    domains,
    meetings,
    sessions,
    actions,
    teamActions,
    addTeamAction,
    updateTeamAction,
    toggleTeamAction,
    deleteTeamAction,
    selectedPersonId,
    selectPerson,
    selectTeam,
    treeLayers,
    openModal,
  } = useStore();
  // Highlight the card while one of its members is open, not just the team.
  const activeTeamId = useActiveTeamId();
  const healthFilter = useStore((s) => s.healthScan);
  const dim = useScanDimmed("team", teamId);

  const team = teams.find((t) => t.id === teamId);
  if (!team) return null;
  const capacity = capacities.find((c) => c.id === team.capacityId);
  const domain = domains.find((d) => d.id === team.domainId);
  const parent = teams.find((t) => t.id === team.parentId);
  const leader = people.find((p) => p.id === team.leaderId);
  const members = people.filter((p) => p.teamId === team.id);
  const subTeams = teams.filter((t) => t.parentId === team.id);
  const nextAction = teamActions.find((a) => a.teamId === team.id && !a.done);
  const selected = activeTeamId === team.id;
  const accent = domain?.color ?? capacity?.color ?? "#0D9488";
  const {
    people: showPeople,
    mandate,
    action,
    giftMix,
    detail,
    readiness: showReadiness,
    health: showHealth,
  } = treeLayers;

  // My call on the team, or — when I've never made one — the average of the
  // calls I've made on its people, marked as derived so it never poses as mine.
  const health = teamHealth(team, members);
  const memberHealth = rollUpHealth(members.map((m) => m.health));

  // A card can carry two different things to be ready for: the team's own
  // standing meeting, and a 1:1 with each member. Both are tracked meetings.
  const rdata: ReadinessData = { meetings, sessions, actions, teamActions };
  const teamMeeting = meetingFor(meetings, "team", team.id);
  const teamReading = readinessFor("team", team.id, rdata);
  const readings = new Map(
    members.flatMap((p) => {
      const r = readinessFor("person", p.id, rdata);
      return r ? [[p.id, r] as const] : [];
    })
  );
  const allReadings = [
    ...(teamReading ? [teamReading] : []),
    ...readings.values(),
  ];
  const roll = rollUp(allReadings);

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card
        className={`team-card group relative w-80 overflow-hidden p-0 shadow-sm ${
          selected
            ? "is-selected ring-2 ring-offset-1 dark:ring-offset-stone-900"
            : ""
        }`}
        style={
          {
            ["--team-accent"]: accent,
            ...dimStyle(dim),
            ...(selected
              ? { ["--tw-ring-color"]: accent }
              : undefined),
          } as CSSProperties
        }
      >
        {/* Domain accent stripe */}
        <div
          className="team-card__stripe h-1 w-full"
          style={{ backgroundColor: accent }}
        />
        {/* Readiness rail — worst member state, readable from across the canvas */}
        {showReadiness && roll.state && (
          <div
            className="absolute top-1 bottom-0 left-0 w-[3px]"
            style={{ backgroundColor: STATE_COLOR[roll.state] }}
            title={`${STATE_LABEL[roll.state]} — ${roll.behind} of ${roll.tracked} tracked need prep`}
            aria-hidden
          />
        )}
        <div
          className="cursor-pointer p-4 pb-2"
          onClick={() => selectTeam(team.id)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{team.name}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {parent && (
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">
                    under {parent.name}
                  </span>
                )}
                {leader && (
                  <span className="text-[10px] text-stone-500 dark:text-stone-400">
                    led by {leader.name}
                  </span>
                )}
                {showHealth && health && (
                  <HealthChip health={health.health} derived={health.derived} />
                )}
                {domain && <TintBadge color={domain.color}>{domain.name}</TintBadge>}
                {capacity && (
                  <TintBadge color={capacity.color}>{capacity.label}</TintBadge>
                )}
                {showReadiness && teamReading && teamMeeting && (
                  <ReadinessChip
                    state={teamReading.state}
                    text={formatCountdown(teamReading)}
                    title={`${teamMeeting.name ?? "Team meeting"} · ${STATE_LABEL[teamReading.state]} — ${teamReading.headline}`}
                  />
                )}
              </div>
            </div>
            <div
              className="nodrag flex opacity-0 touch:opacity-100 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Plus}
                tooltip="Add person"
                onClick={() => openModal({ kind: "person", teamId: team.id })}
              />
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={Edit01}
                tooltip="Edit team"
                onClick={() => openModal({ kind: "team", team })}
              />
            </div>
          </div>

          {mandate && (
            <p
              className={`mt-3 line-clamp-2 text-xs leading-relaxed ${
                team.purpose
                  ? "text-stone-600 dark:text-stone-400"
                  : "italic text-stone-500 dark:text-stone-400"
              }`}
            >
              {team.purpose ?? "No mandate set — click to add"}
            </p>
          )}

          {giftMix && members.length > 0 && (
            <div className="mt-3">
              <GiftMixBar people={members} />
            </div>
          )}

          {showHealth && (team.health?.note || memberHealth.rated > 0) && (
            <div className="mt-3 flex flex-col gap-1">
              {team.health?.note && (
                <p className="line-clamp-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                  {team.health.note}
                </p>
              )}
              {memberHealth.rated > 0 && (
                <>
                  <HealthBar roll={memberHealth} />
                  <div className="text-[10px] text-stone-500 dark:text-stone-400">
                    {memberHealth.counts.strained + memberHealth.counts.critical >
                    0
                      ? `${
                          memberHealth.counts.strained +
                          memberHealth.counts.critical
                        } of ${memberHealth.rated} rated need attention`
                      : `${memberHealth.rated} of ${members.length} rated, none strained`}
                  </div>
                </>
              )}
            </div>
          )}

          {showReadiness && roll.tracked > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              <ReadinessBar readings={allReadings} />
              <div className="text-[10px] text-stone-500 dark:text-stone-400">
                {teamMeeting?.name ? `${teamMeeting.name} · ` : ""}
                {roll.behind === 0
                  ? `${roll.tracked} tracked, all on track`
                  : `${roll.behind} of ${roll.tracked} need prep`}
              </div>
            </div>
          )}
        </div>

        {action && (
          <div
            className="nodrag px-4 pb-3"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CardNextStep
              action={nextAction}
              onAdd={(text) => addTeamAction(team.id, text)}
              onUpdate={(id, text) => {
                if (!text) deleteTeamAction(id);
                else updateTeamAction(id, { text });
              }}
              onToggle={(id) => toggleTeamAction(id)}
            />
          </div>
        )}

        {/* People footer */}
        <div
          className="cursor-pointer border-t border-stone-100 px-4 py-2.5 dark:border-stone-800"
          onClick={() => selectTeam(team.id)}
        >
          <div className="flex items-center justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>
              {members.length} {members.length === 1 ? "person" : "people"}
              {subTeams.length > 0
                ? ` · ${subTeams.length} sub-team${subTeams.length === 1 ? "" : "s"}`
                : ""}
              {team.lastMet ? ` · met ${team.lastMet}` : ""}
            </span>
            {!showPeople && members.length > 0 && (
              <span className="flex -space-x-1.5">
                {members.slice(0, 4).map((p) => (
                  <Avatar
                    key={p.id}
                    name={p.name}
                    photo={p.photo}
                    size={20}
                    dimmed={!hasLeadershipRead(p)}
                  />
                ))}
                {members.length > 4 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-200 text-[9px] dark:bg-stone-700">
                    +{members.length - 4}
                  </span>
                )}
              </span>
            )}
          </div>

          {showPeople && (
            <div
              className="nodrag mt-2 flex flex-col gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {members.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  selected={p.id === selectedPersonId}
                  capacityColor={capacity?.color ?? "#0D9488"}
                  showDetail={detail}
                  showHealth={showHealth}
                  // A scan dims the people it isn't asking about, so an open
                  // team card answers "who on this team" without a second look.
                  dimmed={!matchesHealth(p.health, healthFilter)}
                  readiness={showReadiness ? readings.get(p.id) : undefined}
                  onSelect={() => selectPerson(p.id)}
                  onEdit={() => openModal({ kind: "person", person: p })}
                />
              ))}
              {members.length === 0 && (
                <button
                  className="rounded-lg border border-dashed border-stone-300 py-2 text-xs text-stone-500 dark:text-stone-400 hover:border-stone-400 hover:text-stone-500 dark:border-stone-700"
                  onClick={() => openModal({ kind: "person", teamId: team.id })}
                >
                  + Add first person
                </button>
              )}
            </div>
          )}
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

/** Inline next-step field for sweeping through teams on the canvas. */
function CardNextStep({
  action,
  onAdd,
  onUpdate,
  onToggle,
}: {
  action?: { id: string; text: string; dueDate?: string };
  onAdd: (text: string) => void;
  onUpdate: (id: string, text: string) => void;
  onToggle: (id: string) => void;
}) {
  const [value, setValue] = useState(action?.text ?? "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setValue(action?.text ?? "");
  }, [action?.id, action?.text, focused]);

  const commit = () => {
    const text = value.trim();
    if (action) {
      if (text !== action.text) onUpdate(action.id, text);
    } else if (text) {
      onAdd(text);
    }
    setFocused(false);
  };

  return (
    <div
      className={`rounded-lg px-2 py-1.5 transition-colors ${
        focused
          ? "bg-teal-50 ring-1 ring-teal-400 dark:bg-teal-950/50 dark:ring-teal-600"
          : action
            ? "bg-teal-50/80 dark:bg-teal-950/30"
            : "bg-stone-50 dark:bg-stone-950/60"
      }`}
    >
      <div className="text-[10px] font-medium tracking-wide text-teal-700/70 uppercase dark:text-teal-300/70">
        Next step
      </div>
      <div className="mt-0.5 flex items-start gap-1.5">
        {action && (
          <Checkbox
            size="sm"
            isSelected={false}
            onChange={() => onToggle(action.id)}
            className="mt-1 shrink-0"
            aria-label="Mark next step done"
          />
        )}
        <textarea
          rows={2}
          className="w-full resize-none bg-transparent text-xs font-medium leading-relaxed text-teal-900 outline-none placeholder:font-normal placeholder:text-stone-500 dark:text-stone-400 dark:text-teal-100"
          placeholder="What's the next move for this team?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
            if (e.key === "Escape") {
              setValue(action?.text ?? "");
              setFocused(false);
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
      </div>
      {action?.dueDate && !focused && (
        <div className="mt-0.5 pl-5 text-[10px] text-teal-700/60 dark:text-teal-300/60">
          due {action.dueDate}
        </div>
      )}
    </div>
  );
}

function PersonRow({
  person,
  selected,
  capacityColor,
  showDetail,
  showHealth,
  dimmed = false,
  readiness,
  onSelect,
  onEdit,
}: {
  person: Person;
  selected: boolean;
  capacityColor: string;
  showDetail: boolean;
  /** Health layer on — show their level beside the name. */
  showHealth?: boolean;
  /** A health scan is running and they're not part of the answer. */
  dimmed?: boolean;
  /** Present only when the readiness layer is on. */
  readiness?: Readiness;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const assessed = hasLeadershipRead(person);
  const dominant = topDomain(person);
  // Readiness owns the accent bar when its layer is on — it's the more
  // time-sensitive signal, and capacity is already carried by the card.
  const barColor = readiness
    ? STATE_COLOR[readiness.state]
    : showDetail && dominant
      ? DOMAIN_COLOR[dominant]
      : capacityColor;
  return (
    <div
      className={`person-row group/person relative flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 ${
        selected ? "is-selected" : ""
      }`}
      style={
        {
          ["--person-accent"]: capacityColor,
          ...dimStyle(dimmed),
        } as CSSProperties
      }
      onClick={onSelect}
    >
      <span
        className="person-row__bar absolute top-1/2 left-0 h-7 w-[3px] origin-center -translate-y-1/2 rounded-full"
        style={{ backgroundColor: barColor }}
        aria-hidden
      />
      <div className="person-row__avatar">
        <Avatar
          name={person.name}
          photo={person.photo}
          size={34}
          dimmed={!assessed}
          ring={selected ? capacityColor : undefined}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 truncate text-sm transition-colors ${
            selected
              ? "font-medium"
              : assessed
                ? ""
                : "text-stone-400 dark:text-stone-500"
          }`}
        >
          <span className="truncate">{person.name}</span>
          {showHealth && <HealthDot health={person.health} />}
        </div>
        {showDetail ? (
          <PersonGiftDots person={person} />
        ) : null}
        {(!showDetail || !(person.assessments.cliftonTop5?.length || person.assessments.enneagram)) &&
          person.role && (
            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
              {person.role}
            </div>
          )}
      </div>
      {readiness ? (
        <ReadinessChip
          state={readiness.state}
          text={formatCountdown(readiness)}
          title={`${STATE_LABEL[readiness.state]} — ${readiness.headline}`}
        />
      ) : (
        !assessed && (
          <span className="text-[10px] text-stone-400 dark:text-stone-600">
            unassessed
          </span>
        )
      )}
      <ButtonUtility
        size="xs"
        color="tertiary"
        icon={Edit01}
        tooltip="Edit"
        className="opacity-0 touch:opacity-100 transition-opacity group-hover/person:opacity-100"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          e.stopPropagation();
          onEdit();
        }}
      />
    </div>
  );
}
