import { useStore } from "../store/useStore";
import type { Manager, Person, Team } from "../types";
import { PersonProfile } from "./PersonProfile";
import { TeamProfile } from "./TeamProfile";
import { ManagerProfile } from "./ManagerProfile";
import { MeProfile } from "./MeProfile";
import { EntityChrome } from "./EntityChrome";

/**
 * How much room the panel has. The same component tree renders at both — a
 * peek hides its heavier sections rather than forking into a second component,
 * so there's only ever one place to change an entity's content.
 */
export type Density = "peek" | "focus";

type Selected =
  | { kind: "person"; person: Person }
  | { kind: "team"; team: Team }
  | { kind: "manager"; manager: Manager }
  | { kind: "me" }
  | null;

/** The single entity the route points at. A person outranks their team. */
export function useSelectedEntity(): Selected {
  const {
    people,
    teams,
    managers,
    selectedPersonId,
    selectedTeamId,
    selectedManagerId,
    selectedMe,
  } = useStore();

  const person = people.find((p) => p.id === selectedPersonId);
  if (person) return { kind: "person", person };
  const team = teams.find((t) => t.id === selectedTeamId);
  if (team) return { kind: "team", team };
  const manager = managers.find((m) => m.id === selectedManagerId);
  if (manager) return { kind: "manager", manager };
  if (selectedMe) return { kind: "me" };
  return null;
}

export function EntityBody({ density }: { density: Density }) {
  const selected = useSelectedEntity();
  if (!selected) return null;

  switch (selected.kind) {
    case "person":
      return (
        <PersonProfile
          key={selected.person.id}
          person={selected.person}
          density={density}
        />
      );
    case "team":
      return (
        <TeamProfile
          key={selected.team.id}
          team={selected.team}
          density={density}
        />
      );
    case "manager":
      return (
        <ManagerProfile
          key={selected.manager.id}
          manager={selected.manager}
          density={density}
        />
      );
    case "me":
      return <MeProfile density={density} />;
  }
}

/**
 * The peek: a fixed-width column beside the canvas showing exactly one entity.
 * Anything that needs more room than this gets promoted to focus.
 */
export function PeekPanel() {
  return (
    <div className="flex w-[36rem] min-w-[22rem] shrink-0 flex-col border-l border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <EntityChrome mode="peek" />
      <div className="flex min-h-0 flex-1 flex-col">
        <EntityBody density="peek" />
      </div>
    </div>
  );
}
