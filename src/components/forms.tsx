import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Manager, Person, Team } from "../types";
import { eligibleParents } from "../lib/teams";
import { Modal, inputCls, buttonPrimaryCls, buttonGhostCls } from "./ui";
import { Avatar, fileToDataUrl } from "./Avatar";

// A palette for auto-coloring newly created domains.
const DOMAIN_PALETTE = [
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F59E0B",
  "#0D9488",
  "#EF4444",
  "#6366F1",
];

/** Pick or create a life-area domain. Shared by the team and manager modals. */
function DomainPicker({
  domainId,
  onChange,
}: {
  domainId?: string;
  onChange: (id: string | undefined) => void;
}) {
  const { domains, addDomain } = useStore();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const createDomain = () => {
    const name = newName.trim();
    if (!name) return;
    const color = DOMAIN_PALETTE[domains.length % DOMAIN_PALETTE.length];
    const id = addDomain({ name, color });
    onChange(id);
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            !domainId
              ? "border-line-strong bg-surface-2 font-medium text-ink"
              : "border-line text-ink-2 hover:border-line-strong"
          }`}
        >
          None
        </button>
        {domains.map((d) => {
          const active = domainId === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onChange(d.id)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors"
              style={
                active
                  ? {
                      backgroundColor: d.color + "1f",
                      borderColor: d.color,
                      color: d.color,
                      fontWeight: 600,
                    }
                  : { borderColor: "transparent" }
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              {d.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="dashed-cta rounded-full px-2.5 py-1 text-xs"
          >
            + New
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New domain, e.g. Family"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createDomain();
              }
            }}
          />
          <button
            type="button"
            className="btn-primary text-xs"
            onClick={createDomain}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function TeamModal({
  team,
  defaultParentId,
  onClose,
}: {
  team?: Team; // present = edit
  /** Pre-select a parent when adding a sub-team from a team card. */
  defaultParentId?: string;
  onClose: () => void;
}) {
  const { capacities, teams, addTeam, updateTeam, deleteTeam, people } =
    useStore();
  const [name, setName] = useState(team?.name ?? "");
  const [capacityId, setCapacityId] = useState(
    team?.capacityId ?? capacities[0]?.id
  );
  const treeDomainId = useStore((s) => s.treeDomainId);
  const parentTeam = teams.find(
    (t) => t.id === (team?.parentId ?? defaultParentId)
  );
  const [domainId, setDomainId] = useState<string | undefined>(
    team?.domainId ?? parentTeam?.domainId ?? treeDomainId ?? undefined
  );
  const [description, setDescription] = useState(team?.description ?? "");
  const [direction, setDirection] = useState<"up" | "down">(
    team?.direction ?? "down"
  );
  const [parentId, setParentId] = useState<string | undefined>(
    team?.parentId ?? defaultParentId
  );

  const parents = eligibleParents(teams, team?.id);
  const nested = Boolean(parentId);
  const memberCount = team
    ? people.filter((p) => p.teamId === team.id).length
    : 0;
  const childCount = team
    ? teams.filter((t) => t.parentId === team.id).length
    : 0;

  const save = () => {
    if (!name.trim()) return;
    const patch = {
      name: name.trim(),
      capacityId,
      domainId,
      description,
      direction: nested ? ("down" as const) : direction,
      parentId: parentId || undefined,
    };
    if (team) updateTeam(team.id, patch);
    else addTeam(patch);
    onClose();
  };

  return (
    <Modal
      title={
        team
          ? "Edit team"
          : nested
            ? "Add sub-team"
            : "Add team"
      }
      onClose={onClose}
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Setup & Breakdown"
            autoFocus
          />
        </label>
        {parents.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block text-ink-2">
              Parent team (optional)
            </span>
            <select
              className={inputCls}
              value={parentId ?? ""}
              onChange={(e) => {
                const next = e.target.value || undefined;
                setParentId(next);
                if (next) {
                  setDirection("down");
                  const p = teams.find((t) => t.id === next);
                  if (p?.domainId && !team) setDomainId(p.domainId);
                }
              }}
            >
              <option value="">None — hangs off me</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-ink-3">
              Nest under a broader team you oversee (e.g. Setup under Frontier
              Ministries).
            </span>
          </label>
        )}
        <div className="block text-sm">
          <span className="mb-1 block text-ink-2">Domain (life area)</span>
          <DomainPicker domainId={domainId} onChange={setDomainId} />
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">My capacity</span>
          <div className="flex gap-2">
            {capacities.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCapacityId(c.id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                  capacityId === c.id
                    ? "border-transparent text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15)]"
                    : "border-line-strong text-ink-2 hover:border-ink-3"
                }`}
                style={
                  capacityId === c.id ? { backgroundColor: c.color } : undefined
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </label>
        {!nested && (
          <label className="block text-sm">
            <span className="mb-1 block text-ink-2">
              Position in the tree
            </span>
            <div className="flex gap-2">
              {(
                [
                  { value: "down", label: "Below me — I lead them" },
                  { value: "up", label: "Above me — I report up" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDirection(opt.value)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                    direction === opt.value
                      ? "border-accent/60 bg-accent/10 font-medium text-accent-ink"
                      : "border-line-strong text-ink-2 hover:border-ink-3"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">
            Description (optional)
          </span>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="flex items-center justify-between pt-2">
          {team ? (
            <button
              type="button"
              className="text-xs text-ink-3 hover:text-red-500"
              onClick={() => {
                const extra =
                  childCount > 0
                    ? ` Its ${childCount} sub-team(s) will become top-level.`
                    : "";
                if (
                  confirm(
                    `Delete "${team.name}" and its ${memberCount} member(s)?${extra}`
                  )
                ) {
                  deleteTeam(team.id);
                  onClose();
                }
              }}
            >
              Delete team
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className={buttonGhostCls} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={buttonPrimaryCls}
              onClick={save}
              disabled={!name.trim()}
            >
              {team ? "Save" : nested ? "Add sub-team" : "Add team"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ManagerModal({
  manager,
  onClose,
}: {
  manager?: Manager; // present = edit
  onClose: () => void;
}) {
  const { addManager, updateManager, deleteManager, treeDomainId } = useStore();
  const [name, setName] = useState(manager?.name ?? "");
  const [role, setRole] = useState(manager?.role ?? "");
  const [domainId, setDomainId] = useState<string | undefined>(
    manager?.domainId ?? treeDomainId ?? undefined
  );
  const [photo, setPhoto] = useState<string | undefined>(manager?.photo);

  const save = () => {
    if (!name.trim()) return;
    const patch = { name: name.trim(), role, domainId, photo };
    if (manager) updateManager(manager.id, patch);
    else addManager(patch);
    onClose();
  };

  return (
    <Modal title={manager ? "Edit manager" : "Add manager"} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-ink-2">
          Someone you report to. They'll appear directly above you in the tree.
        </p>
        <div className="flex items-center gap-3">
          <Avatar name={name || "?"} photo={photo} size={56} />
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer text-sm text-accent-ink hover:underline">
              Upload photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await fileToDataUrl(f));
                }}
              />
            </label>
            {photo && (
              <button
                className="text-left text-xs text-ink-3 hover:underline"
                onClick={() => setPhoto(undefined)}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dana Foster"
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Role (optional)</span>
          <input
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. VP of Product, Lead Pastor"
          />
        </label>
        <div className="block text-sm">
          <span className="mb-1 block text-ink-2">Domain (life area)</span>
          <DomainPicker domainId={domainId} onChange={setDomainId} />
        </div>
        <div className="flex items-center justify-between pt-2">
          {manager ? (
            <button
              className="text-xs text-ink-3 hover:text-red-500"
              onClick={() => {
                if (confirm(`Remove ${manager.name}?`)) {
                  deleteManager(manager.id);
                  onClose();
                }
              }}
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className={buttonGhostCls} onClick={onClose}>
              Cancel
            </button>
            <button
              className={buttonPrimaryCls}
              onClick={save}
              disabled={!name.trim()}
            >
              {manager ? "Save" : "Add manager"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function PersonModal({
  person,
  defaultTeamId,
  onClose,
}: {
  person?: Person; // present = edit
  defaultTeamId?: string;
  onClose: () => void;
}) {
  const { teams, addPerson, updatePerson, selectPerson } = useStore();
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [teamId, setTeamId] = useState(
    person?.teamId ?? defaultTeamId ?? teams[0]?.id
  );
  const [photo, setPhoto] = useState<string | undefined>(person?.photo);

  const save = () => {
    if (!name.trim() || !teamId) return;
    if (person) {
      updatePerson(person.id, { name: name.trim(), role, teamId, photo });
    } else {
      const id = addPerson({ name: name.trim(), role, teamId, photo });
      selectPerson(id);
    }
    onClose();
  };

  return (
    <Modal title={person ? "Edit person" : "Add person"} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Avatar name={name || "?"} photo={photo} size={56} />
          <div className="flex flex-col gap-1">
            <label className="cursor-pointer text-sm text-accent-ink hover:underline">
              Upload photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await fileToDataUrl(f));
                }}
              />
            </label>
            {photo && (
              <button
                className="text-left text-xs text-ink-3 hover:underline"
                onClick={() => setPhoto(undefined)}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Role (optional)</span>
          <input
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Worship Director"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Team</span>
          <select
            className={inputCls}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className={buttonGhostCls} onClick={onClose}>
            Cancel
          </button>
          <button
            className={buttonPrimaryCls}
            onClick={save}
            disabled={!name.trim() || !teamId}
          >
            {person ? "Save" : "Add person"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Manage life-area domains: rename, recolor, add, delete. */
export function DomainsModal({ onClose }: { onClose: () => void }) {
  const { domains, teams, managers, addDomain, updateDomain, deleteDomain } =
    useStore();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(
    DOMAIN_PALETTE[domains.length % DOMAIN_PALETTE.length]
  );

  const usage = (id: string) => {
    const teamCount = teams.filter((t) => t.domainId === id).length;
    const mgrCount = managers.filter((m) => m.domainId === id).length;
    return teamCount + mgrCount;
  };

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    addDomain({ name, color: newColor });
    setNewName("");
    setNewColor(DOMAIN_PALETTE[(domains.length + 1) % DOMAIN_PALETTE.length]);
  };

  return (
    <Modal title="Domains" onClose={onClose}>
      <p className="mb-4 text-xs leading-relaxed text-ink-2">
        Life areas that filter your org tree — e.g. Day job, Church, Family.
        Teams and managers can be tagged with a domain.
      </p>

      <ul className="space-y-2">
        {domains.map((d) => {
          const n = usage(d.id);
          return (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2"
            >
              <input
                type="color"
                value={d.color}
                onChange={(e) => updateDomain(d.id, { color: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Color"
                aria-label={`Color for ${d.name}`}
              />
              <input
                className={`${inputCls} flex-1 border-transparent bg-transparent px-1.5 shadow-none`}
                value={d.name}
                onChange={(e) => updateDomain(d.id, { name: e.target.value })}
                aria-label="Domain name"
              />
              <span className="shrink-0 text-[10px] text-ink-3">
                {n === 0 ? "unused" : `${n} tagged`}
              </span>
              <button
                className="shrink-0 rounded-md px-1.5 py-1 text-xs text-ink-3 hover:bg-red-500/10 hover:text-red-500"
                title="Delete domain"
                onClick={() => {
                  const msg =
                    n > 0
                      ? `Delete "${d.name}"? It will be removed from ${n} team/manager tag(s).`
                      : `Delete "${d.name}"?`;
                  if (confirm(msg)) deleteDomain(d.id);
                }}
              >
                ✕
              </button>
            </li>
          );
        })}
        {domains.length === 0 && (
          <li className="py-4 text-center text-sm text-ink-3">
            No domains yet — add your first life area below.
          </li>
        )}
      </ul>

      <div className="mt-4 rounded-xl border border-dashed border-line-strong p-3">
        <div className="label-caps mb-2">
          Add domain
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
            title="Color"
            aria-label="New domain color"
          />
          <input
            className={inputCls}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. SCE, Frontier, Family…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
          <button
            className={buttonPrimaryCls}
            onClick={create}
            disabled={!newName.trim()}
          >
            Add
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {DOMAIN_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              className={`h-5 w-5 rounded-full ${
                newColor === c ? "ring-2 ring-ink-3 ring-offset-1 ring-offset-surface" : ""
              }`}
              style={{ backgroundColor: c }}
              aria-label={`Pick color ${c}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button className={buttonGhostCls} onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
