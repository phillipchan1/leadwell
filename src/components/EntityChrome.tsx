import { useEffect, useMemo } from "react";
import { useStore, useActiveTeamId } from "../store/useStore";

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
  const {
    people,
    teams,
    managers,
    me,
    selectedPersonId,
    selectedManagerId,
    selectedMe,
    selectPerson,
    selectTeam,
    selectManager,
    clearSelection,
    openFocus,
    closeFocus,
    modal,
    askAIOpen,
    settingsOpen,
  } = useStore();

  const activeTeamId = useActiveTeamId();
  const person = people.find((p) => p.id === selectedPersonId);
  const team = teams.find((t) => t.id === activeTeamId);
  const manager = managers.find((m) => m.id === selectedManagerId);

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
    selectedMe,
    me.name,
    people,
    teams,
    managers,
    selectPerson,
    selectTeam,
    selectManager,
  ]);

  const index = trail
    ? trail.siblings.findIndex((s) => s.id === trail.currentId)
    : -1;
  const prev = index > 0 ? trail!.siblings[index - 1] : null;
  const next =
    trail && index >= 0 && index < trail.siblings.length - 1
      ? trail.siblings[index + 1]
      : null;

  // ✕ dismisses the whole panel; the breadcrumb is what steps up a level.
  const close = clearSelection;

  // ←/→ page through siblings, ⌘↵ promotes to focus and back.
  const busy = modal || askAIOpen || settingsOpen;
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
    <div className="flex shrink-0 items-center gap-1 border-b border-stone-200 bg-stone-50 px-2 py-1.5 dark:border-stone-800 dark:bg-stone-950/60">
      {mode === "focus" && (
        <button
          type="button"
          onClick={closeFocus}
          title="Back to the org tree"
          className="rounded-md px-1.5 py-1 text-sm text-stone-400 hover:bg-white hover:text-stone-700 dark:hover:bg-stone-800"
          aria-label="Back to the org tree"
        >
          ←
        </button>
      )}

      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-1 text-xs"
      >
        {trail.parent && (
          <>
            <button
              type="button"
              onClick={trail.parent.go}
              className="max-w-[45%] truncate rounded-md px-1.5 py-1 text-stone-500 hover:bg-white hover:text-teal-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-teal-300"
            >
              {trail.parent.label}
            </button>
            <span className="shrink-0 text-stone-300 dark:text-stone-600">
              ›
            </span>
          </>
        )}
        <span className="truncate px-1 py-1 font-medium text-stone-700 dark:text-stone-200">
          {trail.label}
        </span>
      </nav>

      {/* Sibling pager */}
      {trail.siblings.length > 1 && (
        <div className="flex shrink-0 items-center gap-0.5">
          <PagerButton
            label={prev ? `Previous — ${prev.name}` : "Previous"}
            disabled={!prev}
            onClick={() => prev && trail.select(prev.id)}
          >
            ‹
          </PagerButton>
          <span className="text-[10px] tabular-nums text-stone-400">
            {index + 1}/{trail.siblings.length}
          </span>
          <PagerButton
            label={next ? `Next — ${next.name}` : "Next"}
            disabled={!next}
            onClick={() => next && trail.select(next.id)}
          >
            ›
          </PagerButton>
        </div>
      )}

      <div className="ml-1 flex shrink-0 items-center gap-0.5">
        {mode === "peek" ? (
          <button
            type="button"
            onClick={openFocus}
            title="Open full (⌘↵)"
            aria-label="Open full"
            className="rounded-md px-1.5 py-1 text-sm text-stone-400 hover:bg-white hover:text-teal-700 dark:hover:bg-stone-800 dark:hover:text-teal-300"
          >
            ⤢
          </button>
        ) : (
          <button
            type="button"
            onClick={closeFocus}
            title="Back to the canvas (⌘↵)"
            aria-label="Back to the canvas"
            className="rounded-md px-1.5 py-1 text-sm text-stone-400 hover:bg-white hover:text-teal-700 dark:hover:bg-stone-800 dark:hover:text-teal-300"
          >
            ⤡
          </button>
        )}
        <button
          type="button"
          onClick={close}
          title="Close"
          aria-label="Close"
          className="rounded-md px-1.5 py-1 text-sm text-stone-400 hover:bg-white hover:text-stone-700 dark:hover:bg-stone-800"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-md px-1.5 py-1 text-sm text-stone-400 enabled:hover:bg-white enabled:hover:text-stone-700 disabled:opacity-30 dark:enabled:hover:bg-stone-800"
    >
      {children}
    </button>
  );
}
