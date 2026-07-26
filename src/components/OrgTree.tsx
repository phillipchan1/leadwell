import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
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
import { useStore, type NodePosition, type TreeLayer } from "../store/useStore";
import type { Manager, Person, Team } from "../types";
import { domainCounts, hasLeadershipRead, topDomain } from "../lib/derive";
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
import { effectiveParentId } from "../lib/teams";
import { Avatar } from "./Avatar";
import { Badge, Card, IconButton } from "./ui";
import { TeamModal, PersonModal, ManagerModal, DomainsModal } from "./forms";
import { TriageModal } from "./TriageModal";

const LAYER_KEYS: Record<string, TreeLayer> = {
  p: "people",
  a: "action",
  m: "mandate",
  g: "giftMix",
  d: "detail",
  r: "readiness",
};

const NODE_W = 320; // matches w-80 on team cards
const SPACING_X = NODE_W + 48;
const CHILD_GAP_X = 48;
const CHILD_DY = 240; // vertical gap parent → sub-team
const RANK_Y = 180; // first down-team rank below me
const ME_W = 256; // w-64
const MGR_W = 208; // manager card width
const MGR_SPACING_X = MGR_W + 32;

/**
 * Default auto-layout: managers just above me, up-teams in a rank higher still,
 * root down-teams below me, sub-teams nested under their parents.
 */
function defaultLayout(
  teams: Team[],
  managers: Manager[]
): Record<string, NodePosition> {
  const byOrder = (a: Team, b: Team) => a.order - b.order;
  const visibleIds = new Set(teams.map((t) => t.id));
  const down = teams.filter((t) => t.direction !== "up");
  const up = teams.filter((t) => t.direction === "up").sort(byOrder);

  const childrenOf = (id: string) =>
    down.filter((t) => effectiveParentId(t, visibleIds) === id).sort(byOrder);

  const roots = down
    .filter((t) => !effectiveParentId(t, visibleIds))
    .sort(byOrder);

  const subtreeWidth = (t: Team): number => {
    const kids = childrenOf(t.id);
    if (kids.length === 0) return NODE_W;
    const inner =
      kids.reduce((sum, k) => sum + subtreeWidth(k), 0) +
      (kids.length - 1) * CHILD_GAP_X;
    return Math.max(NODE_W, inner);
  };

  const pos: Record<string, NodePosition> = {
    me: { x: -ME_W / 2, y: 0 },
  };

  const placeTeam = (t: Team, centerX: number, y: number) => {
    pos[t.id] = { x: centerX - NODE_W / 2, y };
    const kids = childrenOf(t.id);
    if (kids.length === 0) return;
    const widths = kids.map(subtreeWidth);
    const total =
      widths.reduce((a, b) => a + b, 0) + (kids.length - 1) * CHILD_GAP_X;
    let x = centerX - total / 2;
    kids.forEach((k, i) => {
      placeTeam(k, x + widths[i] / 2, y + CHILD_DY);
      x += widths[i] + CHILD_GAP_X;
    });
  };

  const rootWidths = roots.map(subtreeWidth);
  const rootsTotal =
    rootWidths.reduce((a, b) => a + b, 0) +
    Math.max(0, roots.length - 1) * CHILD_GAP_X;
  let rx = -rootsTotal / 2;
  roots.forEach((t, i) => {
    placeTeam(t, rx + rootWidths[i] / 2, RANK_Y);
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

const nodeTypes = { me: MeNode, team: TeamNode, manager: ManagerNode };

export function OrgTree() {
  const {
    teams,
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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    const defaults = defaultLayout(visibleTeams, visibleManagers);
    const visibleIds = new Set(visibleTeams.map((t) => t.id));
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
        ? effectiveParentId(team, visibleIds)
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
      ...visibleTeams.map((t) => ({
        id: t.id,
        type: "team",
        position: resolvePos(t.id),
        data: { teamId: t.id },
      })),
    ]);
  }, [visibleTeams, visibleManagers, nodePositions, treeDomainId, setNodes]);

  const edges: Edge[] = useMemo(() => {
    const visibleIds = new Set(visibleTeams.map((t) => t.id));
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
      const parentId = effectiveParentId(t, visibleIds);
      if (parentId) {
        return { ...base, source: parentId, target: t.id };
      }
      return t.direction === "up"
        ? { ...base, source: t.id, target: "me" }
        : { ...base, source: "me", target: t.id };
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
    return [...teamEdges, ...managerEdges];
  }, [visibleTeams, visibleManagers, capacities, domains]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
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
        <button
          type="button"
          onClick={() => openModal({ kind: "domains" })}
          className="rounded-lg border border-dashed border-stone-300 px-2.5 py-1.5 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:hover:border-teal-600"
          title="Add or edit domains"
        >
          Manage domains
        </button>
        <ReadinessSummary teams={visibleTeams} />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
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
              <button
                onClick={() => openModal({ kind: "team" })}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
              >
                + Add team
              </button>
              <button
                onClick={() => openModal({ kind: "manager" })}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm hover:border-blue-500 hover:text-blue-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-blue-500"
              >
                + Manager
              </button>
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
            <button
              onClick={resetLayout}
              className="rounded-lg px-2.5 py-1.5 text-sm text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              title="Snap all nodes back to the automatic layout"
            >
              Reset layout
            </button>
          </Panel>
          {/* Legend: domains (in All) + capacities */}
          <Panel
            position="bottom-left"
            className="flex flex-col gap-1 rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1.5 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90"
          >
            {!treeDomainId && domains.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-[10px] font-medium text-stone-400">Domains</span>
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
              <span className="text-[10px] font-medium text-stone-400">Capacity</span>
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

      {modal?.kind === "team" && (
        <TeamModal
          team={modal.team}
          defaultParentId={modal.parentId}
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
          : "border-stone-300 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-500"
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
            active ? "bg-white/20 text-white/90" : "bg-stone-100 text-stone-400 dark:bg-stone-800"
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
function ReadinessSummary({ teams }: { teams: Team[] }) {
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
  const members = people.filter((p) => teamIds.has(p.teamId));

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
    members.filter((p) => triageState(p, meetings, "person") === "undecided")
      .length +
    teams.filter((t) => triageState(t, meetings, "team") === "undecided").length +
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
          <span className="text-stone-300 dark:text-stone-700">·</span>
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
          <span className="text-stone-300 dark:text-stone-700">·</span>
          <button
            type="button"
            onClick={() => openModal({ kind: "triage" })}
            className="rounded-md px-1.5 py-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
            title="Not a backlog — decide once and they leave this count for good"
          >
            <span className="tabular-nums">{undecided}</span> undecided
          </button>
        </>
      )}
    </div>
  );
}

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
                : "border-stone-300 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            }`}
          >
            {layer.label}
            <kbd
              className={`rounded px-1 font-mono text-[10px] ${
                on
                  ? "bg-teal-100 text-teal-600 dark:bg-teal-900/60 dark:text-teal-300"
                  : "bg-stone-100 text-stone-400 dark:bg-stone-800"
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
function ReadinessChip({
  state,
  text,
  title,
}: {
  state: Readiness["state"];
  text: string;
  title?: string;
}) {
  const color = STATE_COLOR[state];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
      style={{ backgroundColor: color + "1f", color }}
      title={title ?? STATE_LABEL[state]}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: state === "drifting" ? "transparent" : color,
          boxShadow: state === "drifting" ? `inset 0 0 0 1.5px ${color}` : undefined,
        }}
      />
      {text}
    </span>
  );
}

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
        onClick={() => selectManager(manager.id)}
      >
        <Avatar name={manager.name} photo={manager.photo} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{manager.name}</div>
          <div className="truncate text-[10px] text-stone-400">
            {[manager.role, domain?.name].filter(Boolean).join(" · ") ||
              "I report to"}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
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
          className="nodrag flex opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton
            label="Edit manager"
            onClick={() => openModal({ kind: "manager", manager })}
          >
            ✎
          </IconButton>
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
    selectedTeamId,
    selectTeam,
    treeLayers,
    openModal,
  } = useStore();

  const team = teams.find((t) => t.id === teamId);
  if (!team) return null;
  const capacity = capacities.find((c) => c.id === team.capacityId);
  const domain = domains.find((d) => d.id === team.domainId);
  const parent = teams.find((t) => t.id === team.parentId);
  const members = people.filter((p) => p.teamId === team.id);
  const subTeams = teams.filter((t) => t.parentId === team.id);
  const nextAction = teamActions.find((a) => a.teamId === team.id && !a.done);
  const selected = selectedTeamId === team.id;
  const accent = domain?.color ?? capacity?.color ?? "#0D9488";
  const {
    people: showPeople,
    mandate,
    action,
    giftMix,
    detail,
    readiness: showReadiness,
  } = treeLayers;

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
                  <span className="text-[10px] text-stone-400">
                    under {parent.name}
                  </span>
                )}
                {domain && <Badge color={domain.color}>{domain.name}</Badge>}
                {capacity && (
                  <Badge color={capacity.color}>{capacity.label}</Badge>
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
              className="nodrag flex opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <IconButton
                label="Add person"
                onClick={() => openModal({ kind: "person", teamId: team.id })}
              >
                +
              </IconButton>
              <IconButton
                label="Edit team"
                onClick={() => openModal({ kind: "team", team })}
              >
                ✎
              </IconButton>
            </div>
          </div>

          {mandate && (
            <p
              className={`mt-3 line-clamp-2 text-xs leading-relaxed ${
                team.purpose
                  ? "text-stone-600 dark:text-stone-300"
                  : "italic text-stone-400"
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

          {showReadiness && roll.tracked > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              <ReadinessBar readings={allReadings} />
              <div className="text-[10px] text-stone-400">
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
          <div className="flex items-center justify-between text-[11px] text-stone-400">
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
                  readiness={showReadiness ? readings.get(p.id) : undefined}
                  onSelect={() => selectPerson(p.id)}
                  onEdit={() => openModal({ kind: "person", person: p })}
                />
              ))}
              {members.length === 0 && (
                <button
                  className="rounded-lg border border-dashed border-stone-300 py-2 text-xs text-stone-400 hover:border-stone-400 hover:text-stone-500 dark:border-stone-700"
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
          <input
            type="checkbox"
            checked={false}
            onChange={() => onToggle(action.id)}
            className="mt-1.5 shrink-0 accent-teal-600"
            title="Mark done"
            aria-label="Mark next step done"
          />
        )}
        <textarea
          rows={2}
          className="w-full resize-none bg-transparent text-xs font-medium leading-relaxed text-teal-900 outline-none placeholder:font-normal placeholder:text-stone-400 dark:text-teal-100"
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
  readiness,
  onSelect,
  onEdit,
}: {
  person: Person;
  selected: boolean;
  capacityColor: string;
  showDetail: boolean;
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
      style={{ ["--person-accent"]: capacityColor } as CSSProperties}
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
          className={`truncate text-sm transition-colors ${
            selected
              ? "font-medium"
              : assessed
                ? ""
                : "text-stone-400 dark:text-stone-500"
          }`}
        >
          {person.name}
        </div>
        {showDetail ? (
          <PersonGiftDots person={person} />
        ) : null}
        {(!showDetail || !(person.assessments.cliftonTop5?.length || person.assessments.enneagram)) &&
          person.role && (
            <div className="truncate text-[11px] text-stone-400">
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
          <span className="text-[10px] text-stone-300 dark:text-stone-600">
            unassessed
          </span>
        )
      )}
      <button
        className="rounded-md p-1 text-stone-300 opacity-0 transition-opacity group-hover/person:opacity-100 hover:text-stone-600"
        aria-label={`Edit ${person.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        ✎
      </button>
    </div>
  );
}
