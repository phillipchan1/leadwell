import { Suspense, lazy } from "react";
import { useStore } from "../store/useStore";
import type { Manager, Person, Team, TrackedMeeting } from "../types";
import { EntityChrome, useEntityTrail } from "./EntityChrome";
import { useSwipePager } from "@/hooks/use-sheet";

/**
 * The profiles pull in the whole markdown stack, the assessment editors and
 * the AI coach — none of which the Overview tab needs. Loading them with the
 * first selection instead of with the shell keeps the initial download on
 * mobile data to what actually paints.
 */
const PersonProfile = lazy(() =>
  import("./PersonProfile").then((m) => ({ default: m.PersonProfile }))
);
const TeamProfile = lazy(() =>
  import("./TeamProfile").then((m) => ({ default: m.TeamProfile }))
);
const ManagerProfile = lazy(() =>
  import("./ManagerProfile").then((m) => ({ default: m.ManagerProfile }))
);
const MeProfile = lazy(() =>
  import("./MeProfile").then((m) => ({ default: m.MeProfile }))
);
const MeetingProfile = lazy(() =>
  import("./MeetingProfile").then((m) => ({ default: m.MeetingProfile }))
);

/** Holds the panel's shape while the profile chunk arrives. */
function ProfileFallback() {
  return (
    <div className="space-y-4 p-6" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div className="size-13 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-3 w-56 animate-pulse rounded bg-stone-200/70 dark:bg-stone-800/70" />
        </div>
      </div>
      <div className="h-24 animate-pulse rounded-xl bg-stone-200/60 dark:bg-stone-800/60" />
      <div className="h-40 animate-pulse rounded-xl bg-stone-200/40 [animation-delay:150ms] dark:bg-stone-800/40" />
    </div>
  );
}

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
  | { kind: "meeting"; meeting: TrackedMeeting }
  | { kind: "me" }
  | null;

/** The single entity the route points at. A person outranks their team. */
export function useSelectedEntity(): Selected {
  const {
    people,
    teams,
    managers,
    meetings,
    selectedPersonId,
    selectedTeamId,
    selectedManagerId,
    selectedMeetingId,
    selectedMe,
  } = useStore();

  const person = people.find((p) => p.id === selectedPersonId);
  if (person) return { kind: "person", person };
  const team = teams.find((t) => t.id === selectedTeamId);
  if (team) return { kind: "team", team };
  const manager = managers.find((m) => m.id === selectedManagerId);
  if (manager) return { kind: "manager", manager };
  const meeting = meetings.find((m) => m.id === selectedMeetingId);
  if (meeting) return { kind: "meeting", meeting };
  if (selectedMe) return { kind: "me" };
  return null;
}

export function EntityBody({ density }: { density: Density }) {
  const selected = useSelectedEntity();
  if (!selected) return null;

  const body = () => {
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
      case "meeting":
        return (
          <MeetingProfile
            key={selected.meeting.id}
            meeting={selected.meeting}
            density={density}
          />
        );
      case "me":
        return <MeProfile density={density} />;
    }
  };

  return <Suspense fallback={<ProfileFallback />}>{body()}</Suspense>;
}

/**
 * The peek: a ~55% workspace column beside the canvas showing exactly one
 * entity. Anything that needs the full viewport gets promoted to focus.
 */
export function PeekPanel() {
  const { trail, prev, next } = useEntityTrail();
  const swipe = useSwipePager({
    onPrev: prev && trail ? () => trail.select(prev.id) : undefined,
    onNext: next && trail ? () => trail.select(next.id) : undefined,
  });

  return (
    /* Below lg this is the only surface on screen, so it takes the full width
       and drops the divider it would otherwise share with the canvas. */
    <div className="flex min-w-0 flex-1 shrink-0 flex-col bg-white lg:min-w-[30rem] lg:flex-[2.44] lg:border-l lg:border-stone-200 lg:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.08)] dark:bg-stone-900 dark:lg:border-stone-800 dark:lg:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.35)]">
      <EntityChrome mode="peek" />
      {/* Swiping sideways pages to the next teammate — the touch equivalent of
          ←/→, which a phone has no way to press. */}
      <div className="flex min-h-0 flex-1 flex-col" {...swipe}>
        <EntityBody density="peek" />
      </div>
    </div>
  );
}
