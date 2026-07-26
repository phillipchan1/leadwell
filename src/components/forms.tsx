import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Manager, Person, Team } from "../types";
import { directReports, eligibleParents } from "../lib/teams";
import {
  Modal,
  inputCls,
  fieldLabelCls,
  buttonPrimaryCls,
  buttonGhostCls,
} from "./ui";
import { PhotoPicker } from "./PhotoPicker";

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
              ? "border-stone-400 bg-stone-100 font-medium text-stone-700 dark:border-stone-500 dark:bg-stone-800 dark:text-stone-200"
              : "border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400"
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
            className="rounded-full border border-dashed border-stone-300 px-2.5 py-1 text-xs text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
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
            className={`${buttonPrimaryCls} px-3 py-2 text-xs`}
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
  defaultLeaderId,
  onClose,
}: {
  team?: Team; // present = edit
  /** Pre-select a parent when adding a sub-team from a team card. */
  defaultParentId?: string;
  /** Pre-select the leader when adding a team from a direct report's node. */
  defaultLeaderId?: string;
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
  const [leaderId, setLeaderId] = useState<string | undefined>(
    team?.leaderId ?? defaultLeaderId
  );

  const parents = eligibleParents(teams, team?.id);
  const nested = Boolean(parentId);
  // Only teamless direct reports can hold a team — someone inside a team card
  // has no node of their own for it to hang from.
  const candidateLeaders = directReports(people);
  const delegated = Boolean(leaderId);
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
      direction: nested || delegated ? ("down" as const) : direction,
      parentId: parentId || undefined,
      leaderId: leaderId || undefined,
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
      <div className="space-y-4">
        <label className="block">
          <span className={fieldLabelCls}>Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Setup & Breakdown"
            autoFocus
          />
        </label>
        {!delegated && parents.length > 0 && (
          <label className="block">
            <span className={fieldLabelCls}>
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
            <span className="mt-1 block text-[11px] text-stone-400">
              Nest under a broader team you oversee (e.g. Setup under Frontier
              Ministries).
            </span>
          </label>
        )}
        {!nested && candidateLeaders.length > 0 && (
          <label className="block">
            <span className={fieldLabelCls}>Who leads it</span>
            <select
              className={inputCls}
              value={leaderId ?? ""}
              onChange={(e) => setLeaderId(e.target.value || undefined)}
            >
              <option value="">Me</option>
              {candidateLeaders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-stone-400">
              {delegated
                ? "Hangs under them, not you — and its meetings stay out of your readiness unless you track one."
                : "Hand it to a direct report and the team moves under them."}
            </span>
          </label>
        )}
        <div className="block">
          <span className={fieldLabelCls}>Domain (life area)</span>
          <DomainPicker domainId={domainId} onChange={setDomainId} />
        </div>
        <label className="block">
          <span className={fieldLabelCls}>My capacity</span>
          <div className="flex gap-2">
            {capacities.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCapacityId(c.id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                  capacityId === c.id
                    ? "border-transparent text-white"
                    : "border-stone-300 text-stone-600 dark:border-stone-700 dark:text-stone-300"
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
        {!nested && !delegated && (
          <label className="block">
            <span className={fieldLabelCls}>
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
                      ? "border-teal-600 bg-teal-50 font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                      : "border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>
        )}
        <label className="block">
          <span className={fieldLabelCls}>
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
              className="text-xs text-stone-400 hover:text-red-500"
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
      <div className="space-y-4">
        <p className="text-xs text-stone-500">
          Someone you report to. They'll appear directly above you in the tree.
        </p>
        <PhotoPicker name={name} photo={photo} onChange={setPhoto} />
        <label className="block">
          <span className={fieldLabelCls}>Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Dana Foster"
            autoFocus
          />
        </label>
        <label className="block">
          <span className={fieldLabelCls}>Role (optional)</span>
          <input
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. VP of Product, Lead Pastor"
          />
        </label>
        <div className="block">
          <span className={fieldLabelCls}>Domain (life area)</span>
          <DomainPicker domainId={domainId} onChange={setDomainId} />
        </div>
        <div className="flex items-center justify-between pt-2">
          {manager ? (
            <button
              className="text-xs text-stone-400 hover:text-red-500"
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

/** Edit the signed-in leader's identity (name, title, photo). */
export function MeModal({ onClose }: { onClose: () => void }) {
  const { me, updateMe } = useStore();
  const [name, setName] = useState(me.name);
  const [title, setTitle] = useState(me.title ?? "");
  const [photo, setPhoto] = useState<string | undefined>(me.photo);

  const save = () => {
    if (!name.trim()) return;
    updateMe({
      name: name.trim(),
      title: title.trim() || undefined,
      photo,
    });
    onClose();
  };

  return (
    <Modal title="Edit my profile" onClose={onClose}>
      <div className="space-y-4">
        <PhotoPicker name={name} photo={photo} onChange={setPhoto} />
        <label className="block">
          <span className={fieldLabelCls}>Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block">
          <span className={fieldLabelCls}>Title (optional)</span>
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Leader, Pastor, Engineering Manager"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className={buttonGhostCls} onClick={onClose}>
            Cancel
          </button>
          <button
            className={buttonPrimaryCls}
            onClick={save}
            disabled={!name.trim()}
          >
            Save
          </button>
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
  /** `null` = start them as a direct report with no team. */
  defaultTeamId?: string | null;
  onClose: () => void;
}) {
  const { teams, treeDomainId, addPerson, updatePerson, selectPerson } =
    useStore();
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  // "" = no team: they report straight to me.
  const [teamId, setTeamId] = useState<string>(
    person
      ? (person.teamId ?? "")
      : defaultTeamId === null
        ? ""
        : (defaultTeamId ?? teams[0]?.id ?? "")
  );
  const [domainId, setDomainId] = useState<string | undefined>(
    person?.domainId ?? treeDomainId ?? undefined
  );
  const [photo, setPhoto] = useState<string | undefined>(person?.photo);
  const direct = !teamId;

  const save = () => {
    if (!name.trim()) return;
    const fields = {
      name: name.trim(),
      role,
      teamId: teamId || undefined,
      // Only a teamless person carries their own life area; on a team, the
      // team's domain is the answer.
      domainId: direct ? domainId : undefined,
      photo,
    };
    if (person) {
      updatePerson(person.id, fields);
    } else {
      const id = addPerson(fields);
      selectPerson(id);
    }
    onClose();
  };

  return (
    <Modal title={person ? "Edit person" : "Add person"} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        <PhotoPicker name={name} photo={photo} onChange={setPhoto} />
        <label className="block">
          <span className={fieldLabelCls}>Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block">
          <span className={fieldLabelCls}>Role (optional)</span>
          <input
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Worship Director"
          />
        </label>
        <label className="block">
          <span className={fieldLabelCls}>Team</span>
          <select
            className={inputCls}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="">None — reports directly to me</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {direct && (
            <span className="mt-1 block text-[11px] text-stone-400">
              They'll get their own node under you. Teams they lead can hang
              under them.
            </span>
          )}
        </label>
        {direct && (
          <div className="block">
            <span className={fieldLabelCls}>Domain (life area)</span>
            <DomainPicker domainId={domainId} onChange={setDomainId} />
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={buttonGhostCls} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${buttonPrimaryCls} inline-flex items-center gap-1.5`}
            disabled={!name.trim()}
            title="Enter or ⌘Enter"
          >
            {person ? "Save" : "Add person"}
            <kbd className="rounded bg-white/20 px-1 font-mono text-[10px] font-normal text-white/90">
              ↵
            </kbd>
          </button>
        </div>
      </form>
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
      <p className="mb-4 text-xs leading-relaxed text-stone-500">
        Life areas that filter your org tree — e.g. Day job, Church, Family.
        Teams and managers can be tagged with a domain.
      </p>

      <ul className="space-y-2">
        {domains.map((d) => {
          const n = usage(d.id);
          return (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-xl border border-stone-200 px-2.5 py-2 dark:border-stone-800"
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
                className={`${inputCls} field-input--ghost flex-1`}
                value={d.name}
                onChange={(e) => updateDomain(d.id, { name: e.target.value })}
                aria-label="Domain name"
              />
              <span className="shrink-0 text-[10px] text-stone-400">
                {n === 0 ? "unused" : `${n} tagged`}
              </span>
              <button
                className="shrink-0 rounded-md px-1.5 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
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
          <li className="py-4 text-center text-sm text-stone-400">
            No domains yet — add your first life area below.
          </li>
        )}
      </ul>

      <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-3 dark:border-stone-700">
        <div className="mb-2 text-[11px] font-medium tracking-wide text-stone-400 uppercase">
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
                newColor === c ? "ring-2 ring-stone-400 ring-offset-1 dark:ring-offset-stone-900" : ""
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
