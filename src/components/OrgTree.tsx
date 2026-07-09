import { useEffect, useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore, type NodePosition } from "../store/useStore";
import type { Person, Team } from "../types";
import { isAssessed, teamCoverage } from "../lib/derive";
import { Avatar } from "./Avatar";
import { Badge, Card, IconButton, ProgressBar } from "./ui";
import { TeamModal, PersonModal } from "./forms";
import { StatsBar } from "./StatsBar";

const NODE_W = 320; // matches w-80 on team cards
const SPACING_X = NODE_W + 48;
const ME_W = 256; // w-64

/** Default auto-layout: up-teams in a rank above me, down-teams in a rank below. */
function defaultLayout(teams: Team[]): Record<string, NodePosition> {
  const byOrder = (a: Team, b: Team) => a.order - b.order;
  const down = teams.filter((t) => t.direction !== "up").sort(byOrder);
  const up = teams.filter((t) => t.direction === "up").sort(byOrder);
  const pos: Record<string, NodePosition> = {
    me: { x: -ME_W / 2, y: 0 },
  };
  down.forEach((t, i) => {
    pos[t.id] = {
      x: (i - (down.length - 1) / 2) * SPACING_X - NODE_W / 2,
      y: 180,
    };
  });
  up.forEach((t, i) => {
    pos[t.id] = {
      x: (i - (up.length - 1) / 2) * SPACING_X - NODE_W / 2,
      y: -420,
    };
  });
  return pos;
}

const nodeTypes = { me: MeNode, team: TeamNode };

export function OrgTree() {
  const {
    teams,
    nodePositions,
    setNodePosition,
    resetLayout,
    dark,
    capacities,
    modal,
    openModal,
    closeModal,
  } = useStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  useEffect(() => {
    const defaults = defaultLayout(teams);
    setNodes([
      {
        id: "me",
        type: "me",
        position: nodePositions["me"] ?? defaults["me"],
        data: {},
      },
      ...teams.map((t) => ({
        id: t.id,
        type: "team",
        position: nodePositions[t.id] ?? defaults[t.id],
        data: { teamId: t.id },
      })),
    ]);
  }, [teams, nodePositions, setNodes]);

  const edges: Edge[] = useMemo(
    () =>
      teams.map((t) => {
        const capacity = capacities.find((c) => c.id === t.capacityId);
        const base = {
          id: `e-${t.id}`,
          type: "smoothstep" as const,
          style: { stroke: capacity?.color ?? "#a8a29e", strokeWidth: 1.5, opacity: 0.55 },
        };
        return t.direction === "up"
          ? { ...base, source: t.id, target: "me" }
          : { ...base, source: "me", target: t.id };
      }),
    [teams, capacities]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, node) => setNodePosition(node.id, node.position)}
          nodeTypes={nodeTypes}
          colorMode={dark ? "dark" : "light"}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.1}
          maxZoom={1.75}
          nodesConnectable={false}
          deleteKeyCode={null}
          className="!bg-transparent"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
          <Controls showInteractive={false} position="bottom-right" />
          <MiniMap
            pannable
            zoomable
            position="top-right"
            className="!h-24 !w-36"
          />
          <Panel position="top-left" className="flex gap-2">
            <button
              onClick={() => openModal({ kind: "team" })}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-600 shadow-sm hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            >
              + Add team
            </button>
            <button
              onClick={resetLayout}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-500 shadow-sm hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800"
              title="Snap all nodes back to the automatic layout"
            >
              Reset layout
            </button>
          </Panel>
          {/* Capacity legend */}
          <Panel
            position="bottom-left"
            className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-stone-200 bg-white/90 px-2.5 py-1.5 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90"
          >
            {capacities.map((c) => (
              <span key={c.id} className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.label}
              </span>
            ))}
          </Panel>
        </ReactFlow>
      </div>

      <StatsBar />

      {modal?.kind === "team" && (
        <TeamModal team={modal.team} onClose={closeModal} />
      )}
      {modal?.kind === "person" && (
        <PersonModal
          person={modal.person}
          defaultTeamId={modal.teamId}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function MeNode() {
  const { me, teams, people } = useStore();
  const assessed = people.filter(isAssessed).length;
  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card className="flex w-64 items-center gap-3 px-5 py-3 shadow-sm">
        <Avatar name={me.name} photo={me.photo} size={44} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{me.name}</div>
          <div className="text-xs text-stone-500">
            {me.title ?? "Leader"} · {teams.length} teams · {assessed}/
            {people.length} assessed
          </div>
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
    selectedPersonId,
    selectPerson,
    collapsedTeams,
    toggleTeamCollapsed,
    deleteTeam,
    openModal,
  } = useStore();

  const team = teams.find((t) => t.id === teamId);
  if (!team) return null;
  const capacity = capacities.find((c) => c.id === team.capacityId);
  const members = people.filter((p) => p.teamId === team.id);
  const { assessed, total } = teamCoverage(members);
  const collapsed = collapsedTeams.includes(team.id);

  return (
    <>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Card className="group w-80 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleTeamCollapsed(team.id)}
                className="nodrag text-xs text-stone-400 hover:text-stone-600"
                aria-label={collapsed ? "Expand team" : "Collapse team"}
              >
                {collapsed ? "▸" : "▾"}
              </button>
              <h3 className="text-sm font-semibold">{team.name}</h3>
            </div>
            {capacity && (
              <div className="mt-1 ml-5">
                <Badge color={capacity.color}>{capacity.label}</Badge>
              </div>
            )}
          </div>
          <div className="nodrag flex opacity-0 transition-opacity group-hover:opacity-100">
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
            <IconButton
              label="Delete team"
              danger
              onClick={() => {
                if (
                  confirm(
                    `Delete "${team.name}" and its ${members.length} member(s)?`
                  )
                )
                  deleteTeam(team.id);
              }}
            >
              🗑
            </IconButton>
          </div>
        </div>

        {/* Coverage — the pluggable node metric (swap for readiness score later) */}
        <div className="mt-3 ml-5">
          <div className="mb-1 flex items-center justify-between text-xs text-stone-500">
            <span>Assessed</span>
            <span className="font-medium text-stone-700 dark:text-stone-300">
              {assessed}/{total}
            </span>
          </div>
          <ProgressBar
            value={total ? (assessed / total) * 100 : 0}
            color={capacity?.color ?? "#0D9488"}
          />
        </div>

        {!collapsed && (
          <div className="nodrag mt-4 ml-5 flex flex-col gap-1">
            {members.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                selected={p.id === selectedPersonId}
                capacityColor={capacity?.color ?? "#0D9488"}
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
        {collapsed && members.length > 0 && (
          <div className="mt-3 ml-5 flex -space-x-2">
            {members.map((p) => (
              <Avatar
                key={p.id}
                name={p.name}
                photo={p.photo}
                size={28}
                dimmed={!isAssessed(p)}
              />
            ))}
          </div>
        )}
      </Card>
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </>
  );
}

function PersonRow({
  person,
  selected,
  capacityColor,
  onSelect,
  onEdit,
}: {
  person: Person;
  selected: boolean;
  capacityColor: string;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const assessed = isAssessed(person);
  return (
    <div
      className={`group/person flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors ${
        selected
          ? "bg-stone-100 dark:bg-stone-800"
          : "hover:bg-stone-50 dark:hover:bg-stone-800/50"
      }`}
      onClick={onSelect}
    >
      <Avatar
        name={person.name}
        photo={person.photo}
        size={34}
        dimmed={!assessed}
        ring={selected ? capacityColor : undefined}
      />
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-sm ${
            assessed ? "" : "text-stone-400 dark:text-stone-500"
          }`}
        >
          {person.name}
        </div>
        {person.role && (
          <div className="truncate text-[11px] text-stone-400">
            {person.role}
          </div>
        )}
      </div>
      {!assessed && (
        <span className="text-[10px] text-stone-300 dark:text-stone-600">
          unassessed
        </span>
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
