import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  AlertCircle,
  BarChartSquare02,
  CalendarCheck01,
  Dataflow03,
  DotsVertical,
  Keyboard01,
  Moon01,
  Rows03,
  Settings01,
  Sun,
  Table,
  Users01,
} from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useStore, type Tab } from "../store/useStore";
import { SkeletonLines } from "./Skeleton";
import { useDismiss } from "@/hooks/use-dismiss";
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
export function HeaderOverflow({
  onShortcuts,
}: {
  /** Opens the shortcut list, which App owns. */
  onShortcuts: () => void;
}) {
  const dark = useStore((s) => s.dark);
  const toggleDark = useStore((s) => s.toggleDark);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  /* The design-system Button renders a React Aria button and doesn't forward a
     ref, so the trigger is found through the wrapper it already has. */
  const trigger = () =>
    wrapRef.current?.querySelector("button") as HTMLButtonElement | null;

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    // Focus has to come back to the trigger or a keyboard user is dropped at
    // the top of the document with no idea where they were.
    if (returnFocus) trigger()?.focus();
  }, []);

  // Escape goes through the shared stack so this can never close a panel
  // behind it instead of itself.
  useDismiss(() => close(), open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close]);

  // Opening a menu puts you on its first item — otherwise Tab walks you into
  // whatever follows in the DOM and the menu is unreachable by keyboard.
  useEffect(() => {
    if (open) itemsRef.current[0]?.focus();
  }, [open]);

  /** Roving focus. A `role="menu"` is expected to answer arrow keys. */
  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      items[(at + delta + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      // A menu is a trap while it's open; Tab dismisses rather than escaping
      // into the page behind it.
      close();
    }
  };

  const ITEM_CLASS =
    "outline-focus-ring flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-stone-700 focus-visible:outline-2 focus-visible:-outline-offset-2 active:bg-stone-100 dark:text-stone-200 dark:active:bg-stone-800";

  const items = [
    {
      label: "Settings",
      icon: Settings01,
      run: () => setSettingsOpen(true),
    },
    {
      label: dark ? "Light mode" : "Dark mode",
      icon: dark ? Sun : Moon01,
      run: toggleDark,
    },
    {
      label: "Keyboard shortcuts",
      icon: Keyboard01,
      run: onShortcuts,
    },
  ];

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
            aria-label="More"
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 z-50 mt-1.5 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
          >
            {items.map(({ label, icon: Icon, run }, i) => (
              <button
                key={label}
                ref={(el) => {
                  itemsRef.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  run();
                }}
                className={ITEM_CLASS}
              >
                <Icon
                  className="size-4.5 shrink-0 text-stone-500 dark:text-stone-400"
                  aria-hidden="true"
                />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Persistent read-out of whether the last edit reached the server.
 *
 * Quiet by design: at rest it is an empty reserved box, so the header does not
 * shift when a write starts. Only the two states worth interrupting for get
 * ink — a pulse while writing, an amber dot while a retry is outstanding. The
 * announcement is the toast's job (`useSyncToasts`); this is the thing you can
 * look at afterwards to check, which is why it carries a label but is not a
 * live region — it would otherwise say everything twice.
 */
export function SyncIndicator() {
  const syncStatus = useStore((s) => s.syncStatus);

  if (syncStatus === "idle") {
    return <span className="size-2.5 shrink-0" aria-hidden="true" />;
  }

  const failing = syncStatus === "error";
  const label = failing ? "Not saved — retrying" : "Saving…";

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cx(
        "size-2.5 shrink-0 rounded-full",
        failing
          ? "bg-amber-500 dark:bg-amber-400"
          : "animate-pulse bg-stone-300 dark:bg-stone-600"
      )}
    />
  );
}

/**
 * Branded first paint, so a cold mobile connection is not a blank screen.
 */
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
      <SkeletonLines count={3} className="w-full max-w-xs" />
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
