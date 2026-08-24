import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ChevronLeft, ChevronRight, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { IdeasBoard } from "./IdeasBoard";
import { Planner } from "./Planner";
import { QuickAssignPalette } from "./QuickAssignPalette";
import { Run } from "./Run";
import { TopicDetail } from "./TopicDetail";
import { useLabStore } from "./store";
import type { LabSurface } from "./types";

const SURFACES: { id: LabSurface; label: string }[] = [
  { id: "ideas", label: "Ideas" },
  { id: "planner", label: "Planner" },
  { id: "run", label: "Run" },
];

function pretty(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Self-contained meetings redesign prototype.
 * Fixture data only — does not touch the live Zustand store or Supabase.
 */
export function MeetingsLab() {
  const api = useLabStore();
  const { state } = api;
  const sweptFor = useRef<string | null>(null);

  /**
   * The clock is a control here, because carry-back is the one behaviour you
   * cannot judge from a static screen — you have to watch a day pass and see
   * what lands back in front of you.
   */
  useEffect(() => {
    const key = `${state.today}:${state.carryMode}`;
    if (sweptFor.current === key) return;
    sweptFor.current = key;
    if (state.carryMode === "inbox") api.runReturns();
  }, [api, state.today, state.carryMode]);

  // Global hotkeys for the lab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = Boolean(
        target?.closest("input, textarea, select, [contenteditable]")
      );

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        if (!inField) {
          e.preventDefault();
          api.undo();
        }
        return;
      }
      if (inField) return;

      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        api.setSurface("ideas");
        api.openCapture();
      }
      if (e.key === "1") {
        e.preventDefault();
        api.setSurface("ideas");
      }
      if (e.key === "2") {
        e.preventDefault();
        api.setSurface("planner");
      }
      if (e.key === "3" && state.activeSlotKey) {
        e.preventDefault();
        api.setSurface("run");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, state.activeSlotKey]);

  return (
    <div className="flex h-full flex-col bg-primary">
      <header className="pad-safe-top pad-safe-x flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-secondary py-3 [--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-bold tracking-tight">
              Meetings <span className="text-teal-600">lab</span>
            </h1>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-caption font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
              Prototype
            </span>
          </div>
          <p className="truncate text-caption text-quaternary">
            Fixture data ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">c</kbd> capture ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">←→</kbd> weeks ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">↑↓</kbd> order ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">x</kbd> check ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">a</kbd> move
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Prototype clock */}
          <div className="flex items-center gap-1 rounded-lg border border-secondary px-1.5 py-1">
            <ButtonUtility
              size="xs"
              color="tertiary"
              icon={ChevronLeft}
              tooltip="Back a day"
              onClick={() => api.advanceDays(-1)}
            />
            <span className="min-w-[5.5rem] text-center text-caption font-medium tabular-nums text-stone-700 dark:text-stone-200">
              {pretty(state.today)}
            </span>
            <ButtonUtility
              size="xs"
              color="tertiary"
              icon={ChevronRight}
              tooltip="Forward a day — watch unchecked topics come back"
              onClick={() => api.advanceDays(1)}
            />
          </div>

          {/* The one genuine design fork, switchable */}
          <div className="flex items-center rounded-lg border border-secondary p-0.5">
            {(["inbox", "forward"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => api.setCarryMode(mode)}
                title={
                  mode === "inbox"
                    ? "Unchecked topics come back to Ideas, annotated"
                    : "Unchecked topics ride forward to the next occurrence"
                }
                className={cx(
                  "rounded-md px-2 py-1 text-caption font-medium transition",
                  state.carryMode === mode
                    ? "bg-teal-600 text-white dark:bg-teal-700"
                    : "text-quaternary hover:text-stone-700 dark:hover:text-stone-200"
                )}
              >
                {mode === "inbox" ? "→ Ideas" : "→ Next week"}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            color="tertiary"
            isDisabled={!api.canUndo}
            onClick={() => api.undo()}
          >
            Undo
          </Button>
          <Link
            to="/tree"
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-quaternary transition hover:bg-tertiary hover:text-stone-700 dark:hover:text-stone-200"
          >
            ← Exit lab
          </Link>
        </div>
      </header>

      <nav className="pad-safe-x flex shrink-0 flex-wrap items-center gap-1 border-b border-secondary py-2 [--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => api.setSurface(s.id)}
            className={cx(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              state.surface === s.id
                ? "bg-teal-600 text-white dark:bg-teal-700"
                : "text-quaternary hover:bg-tertiary hover:text-stone-700 dark:hover:text-stone-200"
            )}
          >
            {s.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-stone-200 dark:bg-stone-700" />
        {state.meetings.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => api.selectMeeting(m.id)}
            className={cx(
              "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
              state.activeMeetingId === m.id && state.surface !== "ideas"
                ? "bg-tertiary text-stone-800 dark:text-stone-100"
                : "text-quaternary hover:bg-tertiary hover:text-stone-700 dark:hover:text-stone-200"
            )}
          >
            {m.name}
          </button>
        ))}
      </nav>

      {state.notice && (
        <div className="pad-safe-x py-2 [--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <span>{state.notice}</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                color="tertiary"
                onClick={() => {
                  api.setSurface("ideas");
                  api.dismissNotice();
                }}
              >
                Show me
              </Button>
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={X}
                tooltip="Dismiss"
                onClick={() => api.dismissNotice()}
              />
            </div>
          </div>
        </div>
      )}

      <main className="pad-safe-x min-h-0 flex-1 overflow-y-auto py-4 sm:py-5 [--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]">
        {state.surface === "ideas" && <IdeasBoard api={api} />}
        {state.surface === "planner" && <Planner api={api} />}
        {state.surface === "run" && <Run api={api} />}
      </main>

      {state.quickAssignTopicId && <QuickAssignPalette api={api} />}
      {state.openTopicId && <TopicDetail api={api} />}
    </div>
  );
}
