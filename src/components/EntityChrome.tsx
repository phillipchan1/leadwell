import { useEffect, useMemo } from "react";
import { useStore, useActiveTeamId } from "../store/useStore";
import { meetingSubjectName, meetingTitle } from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Expand01,
  Minimize01,
  X,
} from "@untitledui/icons";

/**
 * The breadcrumb and sibling list for whatever the route points at. Shared so
 * the chrome's pager and the surface's swipe gesture page through exactly the
 * same sequence.
 */
export function useEntityTrail() {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const me = useStore((s) => s.me);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectedManagerId = useStore((s) => s.selectedManagerId);
  const selectedMeetingId = useStore((s) => s.selectedMeetingId);
  const selectedMe = useStore((s) => s.selectedMe);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);
  const selectMeeting = useStore((s) => s.selectMeeting);
  const clearSelection = useStore((s) => s.clearSelection);
  const openFocus = useStore((s) => s.openFocus);
  const closeFocus = useStore((s) => s.closeFocus);
  const modal = useStore((s) => s.modal);
  const askAIOpen = useStore((s) => s.askAIOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);

  const activeTeamId = useActiveTeamId();
  const person = people.find((p) => p.id === selectedPersonId);
  const team = teams.find((t) => t.id === activeTeamId);
  const manager = managers.find((m) => m.id === selectedManagerId);
  const meeting = meetings.find((m) => m.id === selectedMeetingId);

  /** The subject a meeting is about, whichever kind of thing it is. */
  const meetingSubject = useMemo(() => {
    if (!meeting) return null;
    if (meeting.subjectKind === "person")
      return people.find((p) => p.id === meeting.subjectId) ?? null;
    if (meeting.subjectKind === "team")
      return teams.find((t) => t.id === meeting.subjectId) ?? null;
    return managers.find((m) => m.id === meeting.subjectId) ?? null;
  }, [meeting, people, teams, managers]);

  /**
   * Crumb up, label here, and the sibling list to page through — one shape for
   * every entity kind so the bar reads the same wherever you are.
   */
  const trail = useMemo(() => {
    if (person) {
      const siblings = people.filter((p) => p.teamId === person.teamId);
      return {
        parent: team ? { label: team.name, go: () => selectTeam(team.id) } : null,
        label: person.name,
        siblings: siblings.map((p) => ({ id: p.id, name: p.name })),
        currentId: person.id,
        select: selectPerson,
      };
    }
    if (team) {
      const parent = teams.find((t) => t.id === team.parentId);
      const siblings = teams
        .filter((t) => t.parentId === team.parentId)
        .sort((a, b) => a.order - b.order);
      return {
        parent: parent
          ? { label: parent.name, go: () => selectTeam(parent.id) }
          : null,
        label: team.name,
        siblings: siblings.map((t) => ({ id: t.id, name: t.name })),
        currentId: team.id,
        select: selectTeam,
      };
    }
    if (manager) {
      return {
        parent: null,
        label: manager.name,
        siblings: managers.map((m) => ({ id: m.id, name: m.name })),
        currentId: manager.id,
        select: selectManager,
      };
    }
    if (meeting) {
      const subjectName = meetingSubject?.name;
      // Crumb up to whoever the meeting is *with* — that's where you came from
      // if you didn't arrive from the Meetings tab, and it's the more useful
      // place to land either way.
      const parent = meetingSubject
        ? {
            label: subjectName ?? "Subject",
            go: () =>
              meeting.subjectKind === "person"
                ? selectPerson(meeting.subjectId)
                : meeting.subjectKind === "team"
                  ? selectTeam(meeting.subjectId)
                  : selectManager(meeting.subjectId),
          }
        : null;
      return {
        parent,
        label: meetingTitle(meeting, subjectName),
        siblings: meetings.map((m) => ({
          id: m.id,
          name: meetingTitle(m, meetingSubjectName(m, { people, teams, managers })),
        })),
        currentId: meeting.id,
        select: selectMeeting,
      };
    }
    if (selectedMe) {
      return {
        parent: null,
        label: me.name,
        siblings: [],
        currentId: "",
        select: () => {},
      };
    }
    return null;
  }, [
    person,
    team,
    manager,
    meeting,
    meetingSubject,
    meetings,
    selectedMe,
    me.name,
    people,
    teams,
    managers,
    selectPerson,
    selectTeam,
    selectManager,
    selectMeeting,
  ]);

  const index = trail
    ? trail.siblings.findIndex((s) => s.id === trail.currentId)
    : -1;
  const prev = index > 0 ? trail!.siblings[index - 1] : null;
  const next =
    trail && index >= 0 && index < trail.siblings.length - 1
      ? trail.siblings[index + 1]
      : null;

  const busy = modal || askAIOpen || settingsOpen;

  return {
    trail,
    index,
    prev,
    next,
    busy,
    close: clearSelection,
    openFocus,
    closeFocus,
  };
}

/**
 * The navigation bar every entity surface shares: breadcrumb up, pager
 * sideways, promotion between peek and focus.
 *
 * This replaces panel-stacking. A peek shows exactly one entity — drilling
 * into a member swaps the panel's contents and grows the breadcrumb instead of
 * opening a second panel beside the first, which is what lets the model go as
 * deep as the data does without running out of horizontal room.
 */
export function EntityChrome({ mode }: { mode: "peek" | "focus" }) {
  const { trail, index, prev, next, busy, close, openFocus, closeFocus } =
    useEntityTrail();

  // ←/→ page through siblings, ⌘↵ promotes to focus and back.
  useEffect(() => {
    if (!trail) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (busy) return;
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (mode === "peek") openFocus();
        else closeFocus();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        trail.select(prev.id);
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        trail.select(next.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [trail, prev, next, busy, mode, openFocus, closeFocus]);

  if (!trail) return null;

  return (
    <div className="chrome-compact flex shrink-0 items-center gap-2 border-b border-secondary bg-stone-50 px-3 py-2 sm:px-4 dark:bg-stone-950/60">
      {/* In iOS standalone there is no browser back and no edge gesture out of
          a full-page surface, so this is the only exit — it gets a label. */}
      {mode === "focus" ? (
        <Button
          size="sm"
          color="link-gray"
          iconLeading={ArrowLeft}
          onClick={closeFocus}
          className="shrink-0"
        >
          <span className="max-sm:sr-only">Back</span>
        </Button>
      ) : (
        /* The peek has no back; on a phone it fills the screen, so closing it
           is the way out and needs the same prominence. */
        <Button
          size="sm"
          color="link-gray"
          iconLeading={ArrowLeft}
          onClick={close}
          className="shrink-0 lg:hidden"
        >
          <span className="sr-only">Back</span>
        </Button>
      )}

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1 text-sm"
      >
        {trail.parent && (
          <>
            <Button
              size="sm"
              color="link-gray"
              className="max-w-[45%] truncate"
              onClick={trail.parent.go}
            >
              {trail.parent.label}
            </Button>
            <ChevronRight
              className="size-3.5 shrink-0 text-stone-400 dark:text-stone-600"
              aria-hidden="true"
            />
          </>
        )}
        <span className="truncate px-1 py-1 font-medium text-stone-700 dark:text-stone-200">
          {trail.label}
        </span>
      </nav>

      {/* Sibling pager — 2px between two 28px targets was a mis-tap waiting
          to happen; the gap and the targets both grow on touch. */}
      {trail.siblings.length > 1 && (
        <div className="flex shrink-0 items-center gap-2">
          <PagerButton
            label={prev ? `Previous — ${prev.name} (←)` : "Previous (←)"}
            disabled={!prev}
            onClick={() => prev && trail.select(prev.id)}
            icon={ChevronLeft}
          />
          <span className="text-caption tabular-nums text-quaternary">
            {index + 1}/{trail.siblings.length}
          </span>
          <PagerButton
            label={next ? `Next — ${next.name} (→)` : "Next (→)"}
            disabled={!next}
            onClick={() => next && trail.select(next.id)}
            icon={ChevronRight}
          />
        </div>
      )}

      <div className="ml-1 flex shrink-0 items-center gap-2">
        {/* Peek↔focus promotion is a split-pane idea; below lg there is only
            ever one surface, so the control has nothing to mean. */}
        {mode === "peek" ? (
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={Expand01}
            tooltip="Expand to full page (⌘↵)"
            onClick={openFocus}
            className="max-lg:hidden"
          />
        ) : (
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={Minimize01}
            tooltip="Back to split view (⌘↵)"
            onClick={closeFocus}
            className="max-lg:hidden"
          />
        )}
        <ButtonUtility
          size="xs"
          color="tertiary"
          icon={X}
          tooltip="Close"
          onClick={close}
        />
      </div>
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: typeof ChevronLeft;
}) {
  return (
    <ButtonUtility
      size="xs"
      color="tertiary"
      icon={icon}
      tooltip={label}
      isDisabled={disabled}
      onClick={onClick}
    />
  );
}
