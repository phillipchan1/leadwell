import { Suspense, lazy, useCallback, useRef, type CSSProperties } from "react";
import { PANEL_PCT_DEFAULT, useStore } from "../store/useStore";
import type { Manager, Person, Team, TrackedMeeting } from "../types";
import { EntityChrome, useEntityTrail } from "./EntityChrome";
import { useSwipePager } from "@/hooks/use-sheet";
import { Skeleton } from "./Skeleton";

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
        <Skeleton shape="circle" className="size-13" />
        <div className="flex-1 space-y-2">
          <Skeleton shape="line" className="h-4 w-40" />
          <Skeleton shape="line" className="w-56" fade={0.7} />
        </div>
      </div>
      <Skeleton shape="block" className="h-24" fade={0.6} />
      <Skeleton shape="block" className="h-40" index={1} fade={0.4} />
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
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectedTeamId = useStore((s) => s.selectedTeamId);
  const selectedManagerId = useStore((s) => s.selectedManagerId);
  const selectedMeetingId = useStore((s) => s.selectedMeetingId);
  const selectedMe = useStore((s) => s.selectedMe);

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
 * The peek: the workspace column beside the canvas, showing exactly one
 * entity. Anything that needs the full viewport gets promoted to focus.
 *
 * It is the larger half by default. The canvas answers "who is there"; this
 * answers "what do I do about them", and that's where the time goes — five
 * modes of content do not fit in a strip. The divider drags, and where you
 * leave it is remembered.
 */
export function PeekPanel() {
  const { trail, prev, next } = useEntityTrail();
  const panelPct = useStore((s) => s.panelPct);
  const setPanelPct = useStore((s) => s.setPanelPct);
  const ref = useRef<HTMLDivElement>(null);

  const swipe = useSwipePager({
    onPrev: prev && trail ? () => trail.select(prev.id) : undefined,
    onNext: next && trail ? () => trail.select(next.id) : undefined,
  });

  /**
   * Drag from the panel's own edge. Measured against the split's box rather
   * than the window, so the header, the safe-area padding and the bottom bar
   * can't skew it.
   */
  const onHandleDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const split = ref.current?.parentElement;
      if (!split) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const box = split.getBoundingClientRect();
        if (box.width <= 0) return;
        setPanelPct(((box.right - ev.clientX) / box.width) * 100);
      };
      const up = () => {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    },
    [setPanelPct]
  );

  return (
    /* Below lg this is the only surface on screen, so it takes the full width,
       ignores the stored percentage and drops the divider entirely. */
    <div
      ref={ref}
      style={{ "--peek-w": `${panelPct}%` } as CSSProperties}
      className="relative flex min-w-0 flex-1 shrink-0 flex-col bg-white lg:w-[var(--peek-w)] lg:min-w-[32rem] lg:flex-none lg:border-l lg:border-stone-200 lg:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.08)] dark:bg-stone-900 dark:lg:border-stone-800 dark:lg:shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.35)]"
    >
      {/* The divider. Keyboard-resizable too, because a drag handle that only
          answers to a mouse is a control half the people here can't reach. */}
      <div
        role="separator"
        aria-label="Resize panel"
        aria-orientation="vertical"
        aria-valuenow={Math.round(panelPct)}
        aria-valuemin={35}
        aria-valuemax={80}
        tabIndex={0}
        onPointerDown={onHandleDown}
        onDoubleClick={() => setPanelPct(PANEL_PCT_DEFAULT)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            setPanelPct(panelPct + 3);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            setPanelPct(panelPct - 3);
          } else if (e.key === "Home") {
            e.preventDefault();
            setPanelPct(PANEL_PCT_DEFAULT);
          }
        }}
        title="Drag to resize · double-click to reset"
        /* A 3px-wide grip is a mouse target. Above lg with a coarse pointer —
           a tablet in landscape — it widens to a thumb's worth and the grip
           stops hiding, because there is no hover to reveal it with. */
        className="group absolute top-0 -left-1.5 z-20 hidden h-full w-3 cursor-col-resize touch-none outline-none touch:-left-3 touch:w-6 lg:block"
      >
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stone-300 opacity-0 transition-opacity touch:opacity-100 group-hover:opacity-100 group-focus-visible:bg-teal-500 group-focus-visible:opacity-100 dark:bg-stone-600"
        />
      </div>

      <EntityChrome mode="peek" />
      {/* Swiping sideways pages to the next teammate — the touch equivalent of
          ←/→, which a phone has no way to press. */}
      <div className="flex min-h-0 flex-1 flex-col" {...swipe}>
        <EntityBody density="peek" />
      </div>
    </div>
  );
}
