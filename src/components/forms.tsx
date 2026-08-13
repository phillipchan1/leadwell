import { useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type {
  Health,
  HealthLevel,
  Manager,
  Person,
  Team,
} from "../types";
import { todayISO } from "../lib/health";
import { directReports, eligibleParents } from "../lib/teams";
import { HealthField } from "./Health";
import { Modal } from "./ui";
import { Label } from "@/components/base/input/label";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { PhotoPicker } from "./PhotoPicker";
import { confirmAction } from "./ConfirmDialog";
import { autoFocusUnlessTouch } from "../lib/pointer";
import { useRovingFocus } from "@/hooks/use-roving-focus";

/**
 * The health value to save from a modal. Re-stamps the date only when the call
 * actually changed, so re-opening a modal to edit a name doesn't quietly
 * refresh a rating I made two months ago.
 */
function nextHealth(
  level: HealthLevel | undefined,
  current: Health | undefined
): Health | undefined {
  if (!level) return undefined;
  if (current?.level === level) return current;
  return { level, note: current?.note, ratedOn: todayISO() };
}

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
  const domains = useStore((s) => s.domains);
  const addDomain = useStore((s) => s.addDomain);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const addButtonRef = useRef<HTMLButtonElement>(null);
  // A single-choice set, so: a radiogroup with roving arrows, rather than a
  // row of unrelated buttons each taking its own tab stop.
  const { groupProps, itemProps } = useRovingFocus();

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
      <div
        {...groupProps}
        role="radiogroup"
        aria-label="Domain"
        className="flex flex-wrap gap-1.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!domainId}
          {...itemProps(!domainId)}
          onClick={() => onChange(undefined)}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            !domainId
              ? "border-stone-400 bg-tertiary font-medium text-stone-700 dark:border-stone-500 dark:text-stone-200"
              : "border-primary text-quaternary"
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
              role="radio"
              aria-checked={active}
              {...itemProps(active)}
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
            ref={addButtonRef}
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-primary px-2.5 py-1 text-xs text-quaternary hover:border-teal-500 hover:text-teal-600"
          >
            + New
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <Input
            size="md"
            value={newName}
            onChange={setNewName}
            placeholder="New domain, e.g. Family"
            aria-label="New domain name"
            autoFocus={autoFocusUnlessTouch()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createDomain();
                return;
              }
              // Escape backs out of the sub-form rather than closing the whole
              // modal underneath it — the caret is in a field this control
              // opened, so it's the field's Escape to answer first.
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setNewName("");
                setAdding(false);
                addButtonRef.current?.focus();
              }
            }}
          />
          <Button size="sm" onClick={createDomain} isDisabled={!newName.trim()}>
            Add
          </Button>
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
  const [healthLevel, setHealthLevel] = useState<HealthLevel | undefined>(
    team?.health?.level
  );
  const [healthNote, setHealthNote] = useState(team?.health?.note ?? "");
  const capacityRoving = useRovingFocus();
  const directionRoving = useRovingFocus();

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
    const health = nextHealth(healthLevel, team?.health);
    const patch = {
      name: name.trim(),
      capacityId,
      domainId,
      health: health && { ...health, note: healthNote.trim() || undefined },
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
      {/* A real <form>, so ↵ in any field saves. Three of the four entity
          modals were plain <div>s and only answered a click on Save — the odd
          one out being the person modal, which meant ↵ worked or didn't
          depending on which thing you happened to be adding. */}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input
          label="Name"
          size="md"
          value={name}
          onChange={setName}
          placeholder="e.g. Setup & Breakdown"
          hint={name.trim() ? undefined : "A name is required to save."}
          autoFocus={autoFocusUnlessTouch()}
        />
        {!delegated && parents.length > 0 && (
          <NativeSelect
            label="Parent team (optional)"
            size="md"
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
            options={[
              { label: "None — hangs off me", value: "" },
              ...parents.map((p) => ({ label: p.name, value: p.id })),
            ]}
            hint="Nest under a broader team you oversee (e.g. Setup under Frontier Ministries)."
          />
        )}
        {!nested && candidateLeaders.length > 0 && (
          <NativeSelect
            label="Who leads it"
            size="md"
            value={leaderId ?? ""}
            onChange={(e) => setLeaderId(e.target.value || undefined)}
            options={[
              { label: "Me", value: "" },
              ...candidateLeaders.map((p) => ({ label: p.name, value: p.id })),
            ]}
            hint={
              delegated
                ? "Hangs under them, not you — and its meetings stay out of your readiness unless you track one."
                : "Hand it to a direct report and the team moves under them."
            }
          />
        )}
        <div className="block">
          <Label>Domain (life area)</Label>
          <DomainPicker domainId={domainId} onChange={setDomainId} />
        </div>
        <HealthField
          health={
            healthLevel
              ? {
                  level: healthLevel,
                  note: healthNote,
                  ratedOn:
                    healthLevel === team?.health?.level
                      ? team.health.ratedOn
                      : undefined,
                }
              : undefined
          }
          onLevel={(level) => setHealthLevel(level ?? undefined)}
          onNote={setHealthNote}
          label="Health — my read"
          hint="Your own call on how this team is doing. Filter and sort by it in the tree and the table."
        />
        {/* Was a `<label>` wrapping a row of buttons — a label with no single
            control to name. These pick one of a set, so they say so, and get
            the arrow keys that go with it. */}
        <div className="block">
          <Label>My capacity</Label>
          <div
            {...capacityRoving.groupProps}
            role="radiogroup"
            aria-label="My capacity"
            className="flex gap-2"
          >
            {capacities.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={capacityId === c.id}
                {...capacityRoving.itemProps(capacityId === c.id)}
                onClick={() => setCapacityId(c.id)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors ${
                  capacityId === c.id
                    ? "border-transparent text-white"
                    : "border-primary text-tertiary"
                }`}
                style={
                  capacityId === c.id ? { backgroundColor: c.color } : undefined
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {!nested && !delegated && (
          <div className="block">
            <Label>Position in the tree</Label>
            <div
              {...directionRoving.groupProps}
              role="radiogroup"
              aria-label="Position in the tree"
              className="flex gap-2"
            >
              {(
                [
                  { value: "down", label: "Below me — I lead them" },
                  { value: "up", label: "Above me — I report up" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={direction === opt.value}
                  {...directionRoving.itemProps(direction === opt.value)}
                  onClick={() => setDirection(opt.value)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                    direction === opt.value
                      ? "border-teal-600 bg-teal-50 font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300"
                      : "border-primary text-quaternary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Input
          label="Description (optional)"
          size="md"
          value={description}
          onChange={setDescription}
        />
        <div className="flex items-center justify-between pt-2">
          {team ? (
            <Button
              type="button"
              size="sm"
              color="link-destructive"
              onClick={async () => {
                const extra =
                  childCount > 0
                    ? ` Its ${childCount} sub-team(s) will become top-level.`
                    : "";
                if (
                  await confirmAction({
                    title: `Delete "${team.name}"?`,
                    body: `This removes the team and its ${memberCount} member(s).${extra}`,
                    confirmLabel: "Delete team",
                  })
                ) {
                  deleteTeam(team.id);
                  onClose();
                }
              }}
            >
              Delete team
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" size="md" color="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="md"
              isDisabled={!name.trim()}
              iconTrailing={<EnterHint />}
            >
              {team ? "Save" : nested ? "Add sub-team" : "Add team"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** The ↵ on a modal's primary action, so the shortcut is on the button. */
function EnterHint() {
  return (
    <kbd className="rounded bg-white/20 px-1 font-mono text-caption font-normal text-white/90">
      ↵
    </kbd>
  );
}

export function ManagerModal({
  manager,
  onClose,
}: {
  manager?: Manager; // present = edit
  onClose: () => void;
}) {
  const addManager = useStore((s) => s.addManager);
  const updateManager = useStore((s) => s.updateManager);
  const deleteManager = useStore((s) => s.deleteManager);
  const treeDomainId = useStore((s) => s.treeDomainId);
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
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="text-xs text-stone-500">
          Someone you report to. They'll appear directly above you in the tree.
        </p>
        <PhotoPicker name={name} photo={photo} onChange={setPhoto} />
        <Input
          label="Name"
          size="md"
          value={name}
          onChange={setName}
          placeholder="e.g. Dana Foster"
          hint={name.trim() ? undefined : "A name is required to save."}
          autoFocus={autoFocusUnlessTouch()}
        />
        <Input
          label="Role (optional)"
          size="md"
          name="organization-title"
          autoComplete="organization-title"
          value={role}
          onChange={setRole}
          placeholder="e.g. VP of Product, Lead Pastor"
        />
        <div className="block">
          <Label>Domain (life area)</Label>
          <DomainPicker domainId={domainId} onChange={setDomainId} />
        </div>
        <div className="flex items-center justify-between pt-2">
          {manager ? (
            <Button
              type="button"
              size="sm"
              color="link-destructive"
              onClick={async () => {
                if (
                  await confirmAction({
                    title: `Remove ${manager.name}?`,
                    body: "Their profile, notes and check-in history are removed.",
                    confirmLabel: "Remove",
                  })
                ) {
                  deleteManager(manager.id);
                  onClose();
                }
              }}
            >
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" size="md" color="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="md"
              isDisabled={!name.trim()}
              iconTrailing={<EnterHint />}
            >
              {manager ? "Save" : "Add manager"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Edit the signed-in leader's identity (name, title, photo). */
export function MeModal({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me);
  const updateMe = useStore((s) => s.updateMe);
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
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <PhotoPicker name={name} photo={photo} onChange={setPhoto} />
        <Input
          label="Name"
          size="md"
          name="name"
          autoComplete="name"
          value={name}
          onChange={setName}
          hint={name.trim() ? undefined : "A name is required to save."}
          autoFocus={autoFocusUnlessTouch()}
        />
        <Input
          label="Title (optional)"
          size="md"
          name="organization-title"
          autoComplete="organization-title"
          value={title}
          onChange={setTitle}
          placeholder="e.g. Leader, Pastor, Engineering Manager"
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" size="md" color="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            isDisabled={!name.trim()}
            iconTrailing={<EnterHint />}
          >
            Save
          </Button>
        </div>
      </form>
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
  const [healthLevel, setHealthLevel] = useState<HealthLevel | undefined>(
    person?.health?.level
  );
  const [healthNote, setHealthNote] = useState(person?.health?.note ?? "");
  const direct = !teamId;

  const save = () => {
    if (!name.trim()) return;
    const health = nextHealth(healthLevel, person?.health);
    const fields = {
      name: name.trim(),
      role,
      health: health && { ...health, note: healthNote.trim() || undefined },
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
        <Input
          label="Name"
          size="md"
          name="name"
          autoComplete="name"
          value={name}
          onChange={setName}
          hint={name.trim() ? undefined : "A name is required to save."}
          autoFocus={autoFocusUnlessTouch()}
        />
        <Input
          label="Role (optional)"
          size="md"
          name="organization-title"
          autoComplete="organization-title"
          value={role}
          onChange={setRole}
          placeholder="e.g. Worship Director"
        />
        <NativeSelect
          label="Team"
          size="md"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          options={[
            { label: "None — reports directly to me", value: "" },
            ...teams.map((t) => ({ label: t.name, value: t.id })),
          ]}
          hint={
            direct
              ? "They'll get their own node under you. Teams they lead can hang under them."
              : undefined
          }
        />
        {direct && (
          <div className="block">
            <Label>Domain (life area)</Label>
            <DomainPicker domainId={domainId} onChange={setDomainId} />
          </div>
        )}
        <HealthField
          health={
            healthLevel
              ? {
                  level: healthLevel,
                  note: healthNote,
                  ratedOn:
                    healthLevel === person?.health?.level
                      ? person.health.ratedOn
                      : undefined,
                }
              : undefined
          }
          onLevel={(level) => setHealthLevel(level ?? undefined)}
          onNote={setHealthNote}
          label="Health — my read"
          hint="Your own call on how they're doing. Filter and sort by it in the tree and the table."
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" size="md" color="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            size="md"
            isDisabled={!name.trim()}
            iconTrailing={
              <kbd className="rounded bg-white/20 px-1 font-mono text-caption font-normal text-white/90">
                ↵
              </kbd>
            }
          >
            {person ? "Save" : "Add person"}
          </Button>
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
              className="flex items-center gap-2 rounded-xl border border-secondary px-2.5 py-2"
            >
              <input
                type="color"
                value={d.color}
                onChange={(e) => updateDomain(d.id, { color: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                title="Color"
                aria-label={`Color for ${d.name}`}
              />
              <Input
                size="sm"
                className="flex-1"
                /* Borderless in a dense row — expressed through the
                   primitive's own seam rather than a parallel class. */
                wrapperClassName="border-0 bg-transparent shadow-none ring-0"
                value={d.name}
                onChange={(value) => updateDomain(d.id, { name: value })}
                aria-label="Domain name"
              />
              <span className="shrink-0 text-caption text-quaternary">
                {n === 0 ? "unused" : `${n} tagged`}
              </span>
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={X}
                tooltip="Delete domain"
                className="shrink-0"
                onClick={async () => {
                  if (
                    await confirmAction({
                      title: `Delete "${d.name}"?`,
                      body:
                        n > 0
                          ? `It will be removed from ${n} team/manager tag(s).`
                          : "This life area has no tags yet.",
                    })
                  )
                    deleteDomain(d.id);
                }}
              />
            </li>
          );
        })}
        {domains.length === 0 && (
          <li className="py-4 text-center text-sm text-quaternary">
            No domains yet — add your first life area below.
          </li>
        )}
      </ul>

      <div className="mt-4 rounded-xl border border-dashed border-primary p-3">
        <div className="mb-2 text-caption font-medium tracking-wide text-quaternary uppercase">
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
          <Input
            size="md"
            value={newName}
            onChange={setNewName}
            placeholder="e.g. SCE, Frontier, Family…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
          <Button size="md" onClick={create} isDisabled={!newName.trim()}>
            Add
          </Button>
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
        <Button size="md" color="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
