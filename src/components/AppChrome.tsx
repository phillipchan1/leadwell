import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BarChartSquare02,
  CalendarCheck01,
  Dataflow03,
  DotsVertical,
  Moon01,
  RefreshCw01,
  Rows03,
  Settings01,
  Sun,
  Table,
  Users01,
} from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useStore, type Tab } from "../store/useStore";
import { cx } from "@/utils/cx";

export const TABS: {
  id: Tab;
  label: string;
  /** Shorter form for the bottom bar, where four labels share the width. */
  short: string;
  icon: typeof Rows03;
}[] = [
  { id: "overview", label: "Overview", short: "Overview", icon: BarChartSquare02 },
  { id: "tree", label: "Org tree", short: "Tree", icon: Dataflow03 },
  { id: "meetings", label: "Meetings", short: "Meetings", icon: CalendarCheck01 },
  { id: "table", label: "Table", short: "Table", icon: Table },
  { id: "people", label: "People table", short: "People", icon: Users01 },
];

/**
 * Primary navigation for phones. A top tab bar is the least thumb-reachable
 * zone on a handset, so below `lg` the same four destinations live here.
 */
export function BottomNav() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);

  return (
    <nav
      aria-label="Primary"
      className="pad-safe-bottom chrome-compact z-30 flex shrink-0 items-stretch justify-around border-t border-stone-200 bg-white lg:hidden dark:border-stone-800 dark:bg-stone-900"
    >
      {TABS.map((t) => {
        const active = tab === t.id;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5 text-[11px] font-medium transition-colors active:bg-stone-100 dark:active:bg-stone-800",
              active
                ? "text-teal-700 dark:text-teal-400"
                : "text-stone-500 dark:text-stone-400"
            )}
          >
            <Icon className={cx("size-5 shrink-0", active && "stroke-[2.25px]")} />
            <span className="chrome-compact-hide">{t.short}</span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Settings and the theme switch, collapsed behind one control below `sm`
 * where the header has no room for a three-button cluster beside the wordmark.
 */
export function HeaderOverflow() {
  const { dark, toggleDark, setSettingsOpen } = useStore();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* Roomy viewports keep both actions inline. */}
      <div className="hidden items-center gap-2 sm:flex">
        <Button size="sm" color="secondary" onClick={() => setSettingsOpen(true)}>
          Settings
        </Button>
        <Button
          size="sm"
          color="secondary"
          onClick={toggleDark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          iconLeading={dark ? Sun : Moon01}
        />
      </div>

      <div ref={wrapRef} className="relative sm:hidden">
        <Button
          size="sm"
          color="secondary"
          aria-label="More"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          iconLeading={DotsVertical}
        />
        {open && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-stone-700 active:bg-stone-100 dark:text-stone-200 dark:active:bg-stone-800"
            >
              <Settings01 className="size-4.5 shrink-0 text-stone-500 dark:text-stone-400" />
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                toggleDark();
              }}
              className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-stone-700 active:bg-stone-100 dark:text-stone-200 dark:active:bg-stone-800"
            >
              {dark ? (
                <Sun className="size-4.5 shrink-0 text-stone-500 dark:text-stone-400" />
              ) : (
                <Moon01 className="size-4.5 shrink-0 text-stone-500 dark:text-stone-400" />
              )}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * A failed write used to be a `console.error` behind a normal-looking UI, so
 * edits could be silently dropped. Shown as a floating toast so it never
 * steals vertical space from the layout while retries continue in the background.
 */
export function SyncIndicator() {
  const syncStatus = useStore((s) => s.syncStatus);
  if (syncStatus !== "error") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 max-lg:bottom-[calc(3.5rem+max(0.75rem,env(safe-area-inset-bottom)))] lg:bottom-6"
    >
      <div className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/95 px-4 py-2 text-xs font-medium text-amber-900 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100 dark:ring-white/10">
        <RefreshCw01 className="size-3.5 shrink-0 animate-spin [animation-duration:2s]" />
        Not saved — retrying
      </div>
    </div>
  );
}

/** Branded first paint, so a cold mobile connection is not a blank screen. */
export function LoadingSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-stone-50 px-6 dark:bg-stone-950">
      <img
        src="/icon-192.png"
        alt=""
        width={56}
        height={56}
        className="rounded-[14px] shadow-sm"
      />
      <div className="w-full max-w-xs space-y-2.5" aria-hidden="true">
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="h-3 w-full animate-pulse rounded-full bg-stone-200 [animation-delay:120ms] dark:bg-stone-800" />
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-stone-200 [animation-delay:240ms] dark:bg-stone-800" />
      </div>
      <p className="text-sm text-stone-500 dark:text-stone-400">
        Loading your org…
      </p>
    </div>
  );
}

/**
 * The load failed for a reason that isn't "signed out" — almost always the
 * network. Retrying is already happening on a backoff; this is the manual
 * escape hatch and the explanation.
 */
export function LoadErrorScreen() {
  const loadError = useStore((s) => s.loadError);
  const retryBootstrap = useStore((s) => s.retryBootstrap);
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-stone-50 px-6 text-center dark:bg-stone-950">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
        <AlertCircle className="size-6 text-amber-600 dark:text-amber-400" />
      </span>
      <div className="space-y-1">
        <h1 className="text-base font-semibold">We couldn't load your org</h1>
        <p className="max-w-xs text-sm text-stone-500 dark:text-stone-400">
          {loadError ?? "Check your connection and try again."} You're still
          signed in — nothing was lost.
        </p>
      </div>
      <Button
        size="md"
        isLoading={retrying}
        onClick={async () => {
          setRetrying(true);
          try {
            await retryBootstrap();
          } finally {
            setRetrying(false);
          }
        }}
      >
        Try again
      </Button>
    </div>
  );
}
