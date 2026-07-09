import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Person, Team } from "../types";
import { Modal, inputCls, buttonPrimaryCls, buttonGhostCls } from "./ui";
import { Avatar, fileToDataUrl } from "./Avatar";

export function TeamModal({
  team,
  onClose,
}: {
  team?: Team; // present = edit
  onClose: () => void;
}) {
  const { capacities, addTeam, updateTeam } = useStore();
  const [name, setName] = useState(team?.name ?? "");
  const [capacityId, setCapacityId] = useState(
    team?.capacityId ?? capacities[0]?.id
  );
  const [description, setDescription] = useState(team?.description ?? "");
  const [direction, setDirection] = useState<"up" | "down">(
    team?.direction ?? "down"
  );

  const save = () => {
    if (!name.trim()) return;
    if (team)
      updateTeam(team.id, { name: name.trim(), capacityId, description, direction });
    else addTeam({ name: name.trim(), capacityId, description, direction });
    onClose();
  };

  return (
    <Modal title={team ? "Edit team" : "Add team"} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Frontier Staff"
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">My capacity</span>
          <div className="flex gap-2">
            {capacities.map((c) => (
              <button
                key={c.id}
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
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">Position in the tree</span>
          <div className="flex gap-2">
            {(
              [
                { value: "down", label: "Below me — I lead them" },
                { value: "up", label: "Above me — I report up" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
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
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">Description (optional)</span>
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button className={buttonGhostCls} onClick={onClose}>
            Cancel
          </button>
          <button className={buttonPrimaryCls} onClick={save} disabled={!name.trim()}>
            {team ? "Save" : "Add team"}
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
            <label className="cursor-pointer text-sm text-teal-600 hover:underline">
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
                className="text-left text-xs text-stone-400 hover:underline"
                onClick={() => setPhoto(undefined)}
              >
                Remove photo
              </button>
            )}
          </div>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">Name</span>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">Role (optional)</span>
          <input
            className={inputCls}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Worship Director"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">Team</span>
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
