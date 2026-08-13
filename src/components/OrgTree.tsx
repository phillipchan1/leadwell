import {
  memo,
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
} from "../store/useStore";
import type { Manager, Person, Prayer, Team } from "../types";
import { hasLeadershipRead } from "../lib/derive";
import { MODE_LAYERS, MODE_SCAN, TREE_MODES } from "../lib/treeMode";
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
import { PrayerIcon, CardPrayer, PrayerCarryToggle } from "./Prayer";
import {
  PRAYER_COLOR,
  PRAYER_FILTER_VALUES,
  PRAYER_HINT,
  PRAYER_LABEL,
  matchesPrayer,
  rollUpPrayer,
} from "../lib/prayer";
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
import { ChevronDown, ChevronUp, Edit01, Plus } from "@untitledui/icons";
import { TableView } from "./TableView";

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

export function OrgTree() {
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const managers = useStore((s) => s.managers);
  const nodePositions = useStore((s) => s.nodePositions);
  const setNodePosition = useStore((s) => s.setNodePosition);
  const resetLayout = useStore((s) => s.resetLayout);
  const dark = useStore((s) => s.dark);
  const capacities = useStore((s) => s.capacities);
  const domains = useStore((s) => s.domains);
  const treeDomainId = useStore((s) => s.treeDomainId);
  const healthScan = useStore((s) => s.healthScan);
  const prayerScan = useStore((s) => s.prayerScan);
  const setTreeDomainId = useStore((s) => s.setTreeDomainId);
  const setTreeMode = useStore((s) => s.setTreeMode);
  const modal = useStore((s) => s.modal);
  const openModal = useStore((s) => s.openModal);
  const askAIOpen = useStore((s) => s.askAIOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);

  // 1–4 = modes; ⇧1–⇧9 = domains. Mode is the headline control now, so it takes
  // the bare digits and the domain filter moves up a shift.
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
      // `e.code`, not `e.key` — Shift+1 reports "!" on a US layout, and every
      // other layout reports something different again.
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (!digit) return;
      const n = Number(digit[1]);

      if (e.shiftKey) {
        const options: (string | null)[] = [null, ...domains.map((d) => d.id)];
        const id = options[n - 1];
        if (id === undefined) return;
        e.preventDefault();
        setTreeDomainId(id);
        return;
      }
      const mode = TREE_MODES[n - 1];
      if (!mode) return;
      e.preventDefault();
      setTreeMode(mode.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [domains, modal, askAIOpen, settingsOpen, setTreeDomainId, setTreeMode]);

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

  const [filtersOpen, setFiltersOpen] = useState(false);
  /* What's actually narrowing the view right now. Shown on the collapsed
     control so a filter left on from yesterday isn't invisible today. */
  const activeFilterCount =
    (treeDomainId ? 1 : 0) +
    (healthScan.length ? 1 : 0) +
    (prayerScan.length ? 1 : 0);

  /* Mode over domain: what I'm doing, then where. Both are shared by the two
     surfaces — the outline is the same view of the same org, so it answers the
     same mode's question rather than growing controls of its own. */
  const filters = (
    <>
      <div
        className="flex flex-wrap items-center gap-1.5 touch:gap-2"
        role="tablist"
        aria-label="Filter tree by domain"
      >
        <DomainTab
          active={treeDomainId === null}
          onClick={() => setTreeDomainId(null)}
          shortcut="⇧1"
        >
          All
        </DomainTab>
        {domains.map((d, i) => (
          <DomainTab
            key={d.id}
            active={treeDomainId === d.id}
            color={d.color}
            onClick={() => setTreeDomainId(d.id)}
            shortcut={i < 8 ? `⇧${i + 2}` : undefined}
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

      <PrayerScan teams={visibleTeams} reports={visibleReports} />
    </>
  );

  const filterRow = (
    <>
      {/* The mode bar stays out in the open at every width: it's the primary
          control, and it's what the 1–4 shortcuts and the readme both treat as
          the headline question. */}
      <ModeBar />

      <div className="max-lg:hidden flex flex-col gap-2">{filters}</div>

      {/* Below lg the rest collapses behind one control. Stacked, these rows
          filled most of a 375×667 screen before a single person's name
          appeared — so the org never arrived, which is the one thing this tab
          exists to show. The scans are one tap away instead of zero; the names
          are zero taps away instead of a scroll. The count is there so a
          filter you left on is never invisible. */}
      <div className="lg:hidden">
        <Button
          size="sm"
          color="secondary"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          iconTrailing={filtersOpen ? ChevronUp : ChevronDown}
        >
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>
        {filtersOpen && <div className="mt-2 flex flex-col gap-2">{filters}</div>}
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-2 lg:h-full lg:min-h-0">
      {/* A fitted canvas renders 320px team cards at 1–3px of text on a phone,
          and one-finger pan swallows both page scroll and the iOS edge-back
          gesture. Below lg the same org is the hierarchy as an outline —
          readable without pinching, and still the tree's question ("who sits
          under what"), which is why it keeps the tree's own filters and
          readiness scan and drops the Table tab's pivot controls. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {filterRow}
        <TableView variant="tree" />
      </div>

      <div className="hidden min-h-0 flex-1 flex-col gap-2 lg:flex">
      {filterRow}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-secondary bg-primary">
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
            <Button size="sm" color="link-gray" onClick={resetLayout}>
              Reset layout
            </Button>
          </Panel>
          {/* Legend: domains (in All) + capacities */}
          <Panel
            position="bottom-left"
            className="flex flex-col gap-1 rounded-lg border border-secondary bg-white/90 px-2.5 py-1.5 backdrop-blur dark:bg-stone-900/90"
          >
            {!treeDomainId && domains.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-[10px] font-medium text-quaternary">Domains</span>
                {domains.map((d) => (
                  <span
                    key={d.id}
                    className="flex items-center gap-1 text-[10px] text-quaternary"
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
              <span className="text-[10px] font-medium text-quaternary">Capacity</span>
              {capacities.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1 text-[10px] text-quaternary"
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

      {/* The entity modals used to be rendered here. They're in `ModalHost` at
          the app root now, so `openModal` works from every surface — including
          the phone, where this component's create buttons never render. */}
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
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors touch:min-h-11 touch:min-w-11 ${
        active
          ? "border-transparent font-medium text-white"
          : "border-primary text-tertiary hover:border-stone-400 dark:hover:border-stone-500"
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
            active ? "bg-white/20 text-white/90" : "bg-tertiary text-quaternary"
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
  const people = useStore((s) => s.people);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const treeMode = useStore((s) => s.treeMode);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const openModal = useStore((s) => s.openModal);
  if (treeMode !== "prep") return null;

  const rdata: ReadinessData = { meetings, sessions, topics };
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-quaternary lg:ml-auto lg:flex-nowrap">
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
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left whitespace-nowrap touch:min-h-11 hover:bg-stone-100 dark:hover:bg-stone-800"
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
            className="rounded-md px-1.5 py-0.5 whitespace-nowrap text-quaternary touch:min-h-11 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-400"
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
  const treeMode = useStore((s) => s.treeMode);
  const filter = useStore((s) => s.healthScan);
  const toggle = useStore((s) => s.toggleHealthScan);
  const setFilter = useStore((s) => s.setHealthScan);

  if (treeMode !== "assess") return null;

  const teamIds = new Set(teams.map((t) => t.id));
  const members = people.filter((p) => p.teamId && teamIds.has(p.teamId));
  const subjects = [...teams, ...members, ...reports];
  if (subjects.length === 0) return null;

  const roll = rollUpHealth(subjects.map((s) => s.health));
  const unrated = subjects.length - roll.rated;

  const countFor = (value: HealthFilterValue) =>
    value === "unrated" ? unrated : roll.counts[value];

  return (
    <div className="flex flex-wrap items-center gap-1.5 touch:gap-2">
      <span className="text-[11px] font-medium tracking-wide text-quaternary uppercase">
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors touch:min-h-11 touch:px-3.5 disabled:opacity-40 ${
              active
                ? "border-transparent font-medium text-white"
                : "border-primary text-tertiary hover:border-stone-400 dark:hover:border-stone-500"
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
      <span className="ml-auto text-xs text-quaternary">
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
 * The prayer scan — the same shape as the health one, because it's the same
 * move: click a state, everything else dims out of the way, and the shape of
 * the org stays underneath so you can see *where* the quiet is.
 *
 * "Gone quiet" is the chip that earns this bar. A name taken up in January and
 * not prayed for since June is exactly what goes unnoticed without a list, and
 * a count alone can't put you in front of it.
 */
function PrayerScan({
  teams,
  reports,
}: {
  teams: Team[];
  reports: Person[];
}) {
  const people = useStore((s) => s.people);
  const managers = useStore((s) => s.managers);
  const treeMode = useStore((s) => s.treeMode);
  const filter = useStore((s) => s.prayerScan);
  const toggle = useStore((s) => s.togglePrayerScan);
  const setFilter = useStore((s) => s.setPrayerScan);

  if (treeMode !== "pray") return null;

  const teamIds = new Set(teams.map((t) => t.id));
  const members = people.filter((p) => p.teamId && teamIds.has(p.teamId));
  const subjects = [...teams, ...members, ...reports, ...managers];
  if (subjects.length === 0) return null;

  const roll = rollUpPrayer(subjects.map((s) => s.prayer));

  return (
    <div className="flex flex-wrap items-center gap-1.5 touch:gap-2">
      <span className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-violet-700 uppercase dark:text-violet-300">
        <PrayerIcon className="size-3.5" />
        Prayer
      </span>
      {PRAYER_FILTER_VALUES.map((value) => {
        const count = roll.counts[value];
        const active = filter.includes(value);
        const color = PRAYER_COLOR[value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={count === 0 && !active}
            onClick={() => toggle(value)}
            title={
              count === 0
                ? `Nobody in view: ${PRAYER_HINT[value].toLowerCase()}`
                : `${PRAYER_HINT[value]} (${count})`
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors touch:min-h-11 touch:px-3.5 disabled:opacity-40 ${
              active
                ? "border-transparent font-medium text-white"
                : "border-primary text-tertiary hover:border-stone-400 dark:hover:border-stone-500"
            }`}
            style={active ? { backgroundColor: color } : undefined}
          >
            {!active && (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            )}
            {PRAYER_LABEL[value]}
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
      <span className="ml-auto text-xs text-quaternary">
        {roll.carried === 0 ? (
          "Take someone up from any card below"
        ) : (
          <>
            carrying{" "}
            <strong className="font-semibold text-stone-700 tabular-nums dark:text-stone-200">
              {roll.carried}
            </strong>
            {roll.cold > 0 && (
              <>
                {" · "}
                <span className="font-medium text-stone-600 dark:text-stone-300">
                  {roll.cold} gone quiet
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
 *
 * Only the scan the current mode owns applies. The scans themselves persist —
 * they're shared with the table and follow you there — but a mode with no scan
 * bar on screen has no way to say why a card faded, so it doesn't fade any.
 */
function useScanDimmed(kind: "team" | "person" | "manager", id: string): boolean {
  const scan = MODE_SCAN[useStore((s) => s.treeMode)];
  const healthScan = useStore((s) => s.healthScan);
  const prayerScan = useStore((s) => s.prayerScan);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);

  if (scan === "prayer") {
    if (prayerScan.length === 0) return false;
    const matches = (p: { prayer?: Prayer } | undefined) =>
      matchesPrayer(p?.prayer, prayerScan);

    if (kind === "manager") return !matches(managers.find((m) => m.id === id));
    if (kind === "person") return !matches(people.find((p) => p.id === id));

    const team = teams.find((t) => t.id === id);
    const members = people.filter((p) => p.teamId === id);
    return !(matches(team) || members.some(matches));
  }

  if (scan !== "health" || healthScan.length === 0) return false;

  if (kind === "manager") {
    // Managers carry no health rating, so a health scan can only ever match
    // them as "not rated".
    return !healthScan.includes("unrated");
  }

  if (kind === "person") {
    const person = people.find((p) => p.id === id);
    return !matchesHealth(person?.health, healthScan);
  }

  const team = teams.find((t) => t.id === id);
  const members = people.filter((p) => p.teamId === id);
  const matches = (h: Team | Person | undefined) =>
    matchesHealth(h?.health, healthScan);
  return !(matches(team) || members.some(matches));
}

/** Cards fade back rather than disappear — see HealthScan. */
const dimStyle = (dim: boolean): CSSProperties => ({
  opacity: dim ? 0.22 : 1,
  transition: "opacity 150ms ease-out",
});

/**
 * Mode: the one card control. Exclusive, not additive — you're doing one of
 * these things at a time, and the card, the scan bar and what dims all follow.
 *
 * Rendered above the domain chips on *both* surfaces, so the phone finally gets
 * the control the canvas used to hoard. Pray keeps its violet: it's the one
 * question here that isn't about how they're performing.
 */
function ModeBar() {
  const treeMode = useStore((s) => s.treeMode);
  const setTreeMode = useStore((s) => s.setTreeMode);
  return (
    <div
      className="flex flex-wrap gap-1.5 touch:gap-2"
      role="tablist"
      aria-label="What I'm here to do"
    >
      {TREE_MODES.map((mode) => {
        const on = mode.id === treeMode;
        const pray = mode.id === "pray";
        return (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setTreeMode(mode.id)}
            title={`${mode.question} (${mode.key})`}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm shadow-sm transition-colors touch:min-h-11 ${
              on
                ? pray
                  ? "border-violet-500 bg-violet-50 font-medium text-violet-700 dark:border-violet-600 dark:bg-violet-950/40 dark:text-violet-300"
                  : "border-teal-500 bg-teal-50 font-medium text-teal-700 dark:border-teal-600 dark:bg-teal-950/40 dark:text-teal-300"
                : "border-primary bg-primary text-tertiary hover:border-stone-400 dark:hover:border-stone-500"
            }`}
          >
            {pray && <PrayerIcon className="size-3.5" />}
            {mode.label}
            <kbd
              className={`hidden rounded px-1 font-mono text-[10px] sm:inline ${
                on
                  ? pray
                    ? "bg-violet-100 text-violet-600 dark:bg-violet-900/60 dark:text-violet-300"
                    : "bg-teal-100 text-teal-600 dark:bg-teal-900/60 dark:text-teal-300"
                  : "bg-tertiary text-quaternary"
              }`}
            >
              {mode.key}
            </kbd>
          </button>
        );
      })}
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
      className="flex h-1.5 overflow-hidden rounded-full bg-tertiary"
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

/**
 * ── Why every node component is memo + narrow selectors ────────────────────
 *
 * These four used to call `useStore()` bare. Zustand's default equality
 * compares the whole state object, which is a fresh reference after every
 * `set()` — so a single keystroke in a note re-rendered every card on the
 * canvas, and each one recomputed its own readiness while it was there.
 *
 * Selecting primitives where possible (`selectedManagerId === id` rather than
 * `selectedManagerId`) is deliberate: it means selecting a *different* node
 * doesn't re-render this one. `memo` then covers the case where React Flow
 * re-renders the wrapper without any of this node's props changing.
 */
const MeNode = memo(function MeNode() {
  const me = useStore((s) => s.me);
  const teamCount = useStore((s) => s.teams.length);
  const peopleCount = useStore((s) => s.people.length);
  // A count, not a mark. Coverage is worth one line on my own card; dimming
  // every unassessed face across the canvas was a fifth question nobody asked.
  // Selected as a number so a change to someone's name doesn't redraw this.
  const assessed = useStore((s) => s.people.filter(hasLeadershipRead).length);
  const selectMe = useStore((s) => s.selectMe);
  const selectedMe = useStore((s) => s.selectedMe);
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card
        className={`flex w-64 cursor-pointer items-center gap-3 px-5 py-3 shadow-sm hover:border-teal-400 ${
          selectedMe ? "border-teal-500 ring-1 ring-teal-500/30" : ""
        }`}
        onClick={() => selectMe(true)}
        label={`Open ${me.name}`}
      >
        <Avatar name={me.name} photo={me.photo} size={44} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{me.name}</div>
          <div className="text-xs text-stone-500">
            {me.title ?? "Leader"} · {teamCount} teams · {assessed}/
            {peopleCount} with a read
          </div>
        </div>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
});

const ManagerNode = memo(function ManagerNode({ data }: NodeProps) {
  const managerId = (data as { managerId: string }).managerId;
  const manager = useStore((s) => s.managers.find((m) => m.id === managerId));
  const domain = useStore((s) =>
    s.domains.find((d) => d.id === manager?.domainId)
  );
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const treeMode = useStore((s) => s.treeMode);
  const openModal = useStore((s) => s.openModal);
  const selectManager = useStore((s) => s.selectManager);
  const selected = useStore((s) => s.selectedManagerId === managerId);
  const layers = MODE_LAYERS[treeMode];
  const dim = useScanDimmed("manager", managerId);
  // Keyed on the three collections readiness actually reads, so it recomputes
  // when a session lands — not when someone edits an unrelated person. This is
  // also what keeps `todayISO()` off the render path.
  const readiness = useMemo(
    () =>
      layers.readiness
        ? readinessFor("manager", managerId, { meetings, sessions, topics })
        : null,
    [layers.readiness, managerId, meetings, sessions, topics]
  );
  if (!manager) return null;
  // How much of the operating manual is filled — the reason to open this node.
  const filled = Object.values(manager.leadUp ?? {}).filter(
    (v) => typeof v === "string" && v.trim()
  ).length;

  return (
    <>
      <Card
        className={`group flex w-52 cursor-pointer flex-col gap-2 px-3 py-2 shadow-sm hover:border-blue-400 ${
          selected ? "border-blue-500 ring-1 ring-blue-500/30" : ""
        }`}
        style={dimStyle(dim)}
        onClick={() => selectManager(manager.id)}
        label={`Open ${manager.name}`}
      >
        <div className="flex items-center gap-2.5">
          <Avatar name={manager.name} photo={manager.photo} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{manager.name}</div>
            <div className="truncate text-[10px] text-quaternary">
              {[manager.role, domain?.name].filter(Boolean).join(" · ") ||
                "I report to"}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-quaternary">
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
        </div>
        {layers.prayer && (
          <div
            className="nodrag"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CardPrayer
              subjectKind="manager"
              subjectId={manager.id}
              subjectName={manager.name}
            />
          </div>
        )}
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
});

/**
 * Someone I manage who isn't part of a team I lead — a node in their own right.
 * The teams they lead hang under them, and are theirs to run: this card counts
 * them, but the readiness chip is about my 1:1 with the person, not their
 * meetings.
 */
const DirectReportNode = memo(function DirectReportNode({ data }: NodeProps) {
  const personId = (data as { personId: string }).personId;
  const person = useStore((s) => s.people.find((p) => p.id === personId));
  const teams = useStore((s) => s.teams);
  const domain = useStore((s) =>
    s.domains.find((d) => d.id === person?.domainId)
  );
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const treeMode = useStore((s) => s.treeMode);
  const openModal = useStore((s) => s.openModal);
  const selectPerson = useStore((s) => s.selectPerson);
  const selected = useStore((s) => s.selectedPersonId === personId);
  const layers = MODE_LAYERS[treeMode];
  const dim = useScanDimmed("person", personId);
  const readiness = useMemo(
    () =>
      layers.readiness
        ? readinessFor("person", personId, { meetings, sessions, topics })
        : null,
    [layers.readiness, personId, meetings, sessions, topics]
  );
  const led = useMemo(
    () => (person ? teamsLedBy(teams, person.id) : []),
    [teams, person]
  );
  if (!person) return null;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card
        className={`group flex w-64 cursor-pointer flex-col gap-2 px-3 py-2 shadow-sm hover:border-teal-400 ${
          selected ? "border-teal-500 ring-1 ring-teal-500/30" : ""
        }`}
        style={dimStyle(dim)}
        onClick={() => selectPerson(person.id)}
        label={`Open ${person.name}`}
      >
        <div className="flex items-center gap-2.5">
          <Avatar name={person.name} photo={person.photo} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{person.name}</div>
            <div className="truncate text-[10px] text-quaternary">
              {[person.role, domain?.name].filter(Boolean).join(" · ") ||
                "Direct report"}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-quaternary">
              <span className="truncate">
                {led.length > 0
                  ? `${led.length} team${led.length === 1 ? "" : "s"}`
                  : "no teams"}
              </span>
              {layers.health && person.health && (
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
        </div>
        {layers.prayer && (
          <div
            className="nodrag"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CardPrayer
              subjectKind="person"
              subjectId={person.id}
              subjectName={person.name}
            />
          </div>
        )}
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
});

const TeamNode = memo(function TeamNode({ data }: NodeProps) {
  const teamId = (data as { teamId: string }).teamId;
  const teams = useStore((s) => s.teams);
  const team = useStore((s) => s.teams.find((t) => t.id === teamId));
  const people = useStore((s) => s.people);
  const capacity = useStore((s) =>
    s.capacities.find((c) => c.id === team?.capacityId)
  );
  const domain = useStore((s) => s.domains.find((d) => d.id === team?.domainId));
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const teamActions = useStore((s) => s.teamActions);
  const addTeamAction = useStore((s) => s.addTeamAction);
  const updateTeamAction = useStore((s) => s.updateTeamAction);
  const toggleTeamAction = useStore((s) => s.toggleTeamAction);
  const deleteTeamAction = useStore((s) => s.deleteTeamAction);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const treeMode = useStore((s) => s.treeMode);
  const openModal = useStore((s) => s.openModal);
  // Highlight the card while one of its members is open, not just the team.
  const activeTeamId = useActiveTeamId();
  const healthScan = useStore((s) => s.healthScan);
  const prayerScan = useStore((s) => s.prayerScan);
  const dim = useScanDimmed("team", teamId);

  // A scan dims the people it isn't asking about, so an open team card answers
  // the scan bar's question without a second look. Whichever scan the mode owns
  // — and in the two modes that own none, nothing dims.
  const scan = MODE_SCAN[treeMode];
  const rowDimmed = (p: Person) =>
    scan === "health"
      ? !matchesHealth(p.health, healthScan)
      : scan === "prayer"
        ? !matchesPrayer(p.prayer, prayerScan)
        : false;

  const members = useMemo(
    () => people.filter((p) => p.teamId === teamId),
    [people, teamId]
  );

  // A card can carry two different things to be ready for: the team's own
  // standing meeting, and a 1:1 with each member. Both are tracked meetings.
  //
  // This is the single most expensive thing on the canvas — one reading for the
  // team plus one per member, on every card — so it is keyed on exactly the
  // collections readiness reads. Everything else about the card (a name, a
  // colour, a dimmed scan row) re-renders without touching it.
  const { teamReading, readings, allReadings, roll } = useMemo(() => {
    const rdata: ReadinessData = { meetings, sessions, topics };
    const forTeam = readinessFor("team", teamId, rdata);
    const byPerson = new Map(
      members.flatMap((p) => {
        const r = readinessFor("person", p.id, rdata);
        return r ? [[p.id, r] as const] : [];
      })
    );
    const all = [...(forTeam ? [forTeam] : []), ...byPerson.values()];
    return {
      teamReading: forTeam,
      readings: byPerson,
      allReadings: all,
      roll: rollUp(all),
    };
  }, [meetings, sessions, topics, teamId, members]);

  if (!team) return null;
  const parent = teams.find((t) => t.id === team.parentId);
  const leader = people.find((p) => p.id === team.leaderId);
  const subTeams = teams.filter((t) => t.parentId === team.id);
  const nextAction = teamActions.find((a) => a.teamId === team.id && !a.done);
  const selected = activeTeamId === team.id;
  const accent = domain?.color ?? capacity?.color ?? "#0D9488";
  const teamMeeting = meetingFor(meetings, "team", team.id);
  const {
    people: showPeople,
    mandate,
    action,
    readiness: showReadiness,
    health: showHealth,
    prayer: showPrayer,
  } = MODE_LAYERS[treeMode];

  // My call on the team, or — when I've never made one — the average of the
  // calls I've made on its people, marked as derived so it never poses as mine.
  const health = teamHealth(team, members);
  const memberHealth = rollUpHealth(members.map((m) => m.health));

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
                  <span className="text-[10px] text-quaternary">
                    under {parent.name}
                  </span>
                )}
                {leader && (
                  <span className="text-[10px] text-quaternary">
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
                  ? "text-tertiary"
                  : "italic text-quaternary"
              }`}
            >
              {team.purpose ?? "No mandate set — click to add"}
            </p>
          )}

          {showHealth && (team.health?.note || memberHealth.rated > 0) && (
            <div className="mt-3 flex flex-col gap-1">
              {team.health?.note && (
                <p className="line-clamp-2 text-[11px] leading-relaxed text-quaternary">
                  {team.health.note}
                </p>
              )}
              {memberHealth.rated > 0 && (
                <>
                  <HealthBar roll={memberHealth} />
                  <div className="text-[10px] text-quaternary">
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
              <div className="text-[10px] text-quaternary">
                {teamMeeting?.name ? `${teamMeeting.name} · ` : ""}
                {roll.behind === 0
                  ? `${roll.tracked} tracked, all on track`
                  : `${roll.behind} of ${roll.tracked} need prep`}
              </div>
            </div>
          )}
        </div>

        {showPrayer && (
          <div
            className="nodrag px-4 pb-3"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <CardPrayer
              subjectKind="team"
              subjectId={team.id}
              subjectName={team.name}
            />
          </div>
        )}

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
          <div className="flex items-center justify-between text-[11px] text-quaternary">
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
                  <Avatar key={p.id} name={p.name} photo={p.photo} size={20} />
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
                  showHealth={showHealth}
                  showPrayer={showPrayer}
                  dimmed={rowDimmed(p)}
                  readiness={showReadiness ? readings.get(p.id) : undefined}
                  onSelect={() => selectPerson(p.id)}
                  onOpenPrayer={() => selectPerson(p.id, "prayer")}
                  onEdit={() => openModal({ kind: "person", person: p })}
                />
              ))}
              {members.length === 0 && (
                <button
                  className="rounded-lg border border-dashed border-primary py-2 text-xs text-quaternary hover:border-stone-400 hover:text-stone-500"
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
});

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
          className="w-full resize-none bg-transparent text-xs font-medium leading-relaxed text-teal-900 outline-none touch:text-md placeholder:font-normal placeholder:text-stone-500 dark:text-stone-400 dark:text-teal-100"
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
  showHealth,
  showPrayer,
  dimmed = false,
  readiness,
  onSelect,
  onOpenPrayer,
  onEdit,
}: {
  person: Person;
  selected: boolean;
  capacityColor: string;
  /** Assess mode — show their health level beside the name. */
  showHealth?: boolean;
  /** Pray mode — show the hand, and open the prayer tab from it. */
  showPrayer?: boolean;
  /** A scan is running and they're not part of the answer. */
  dimmed?: boolean;
  /** Present only in Prep mode. */
  readiness?: Readiness;
  onSelect: () => void;
  onOpenPrayer: () => void;
  onEdit: () => void;
}) {
  // Readiness owns the accent bar in Prep — it's the more time-sensitive
  // signal, and capacity is already carried by the card around it.
  const barColor = readiness ? STATE_COLOR[readiness.state] : capacityColor;
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
          ring={selected ? capacityColor : undefined}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 truncate text-sm transition-colors ${
            selected ? "font-medium" : ""
          }`}
        >
          <span className="truncate">{person.name}</span>
          {showHealth && <HealthDot health={person.health} />}
          {showPrayer && (
            <PrayerCarryToggle
              subjectKind="person"
              subjectId={person.id}
              subjectName={person.name}
              prayer={person.prayer}
              onOpen={onOpenPrayer}
            />
          )}
        </div>
        {person.role && (
          <div className="truncate text-[11px] text-quaternary">
            {person.role}
          </div>
        )}
      </div>
      {readiness && (
        <ReadinessChip
          state={readiness.state}
          text={formatCountdown(readiness)}
          title={`${STATE_LABEL[readiness.state]} — ${readiness.headline}`}
        />
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

/**
 * Declared here rather than above `OrgTree`, because the four node components
 * are `memo(...)` consts now instead of hoisted function declarations. Module
 * evaluation still finishes long before the first render reads this, and a
 * module-level identity is what keeps React Flow from remounting every node.
 */
const nodeTypes = {
  me: MeNode,
  team: TeamNode,
  manager: ManagerNode,
  report: DirectReportNode,
};
