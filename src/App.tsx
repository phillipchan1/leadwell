import { Suspense, lazy, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore, setNavigate, type Tab } from "./store/useStore";
import {
  LEGACY_PEOPLE_PATH,
  PEOPLE_FILTER_PATH,
  parseRoute,
  routePath,
} from "./lib/routes";
import { hasLeadershipRead } from "./lib/derive";
import { Overview } from "./components/Overview";
import { AICoach } from "./components/AICoach";
import { SettingsModal } from "./components/SettingsModal";
import { Login } from "./components/Login";
import { Modal } from "./components/ui";
import { ConfirmHost } from "./components/ConfirmDialog";
import { ToastHost } from "./components/Toast";
import { ModalHost } from "./components/ModalHost";
import { CreateMenu } from "./components/CreateMenu";
import { Stars01 } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";
import { FocusView } from "./components/FocusView";
import { PeekPanel, useSelectedEntity } from "./components/EntitySurface";
import {
  BottomNav,
  HeaderOverflow,
  LoadErrorScreen,
  LoadingSplash,
  SyncIndicator,
  TABS,
} from "./components/AppChrome";
import { Skeleton } from "./components/Skeleton";
import { useKeyboardInset } from "./hooks/use-keyboard-inset";
import { useSyncToasts } from "./hooks/use-sync-toasts";
import { undoLast } from "./lib/undo";
import { SearchLg } from "@untitledui/icons";
import { MOD_LABEL } from "@/lib/keys";
import { ShortcutHost, type GoTarget } from "./components/ShortcutHost";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { useShortcut } from "@/hooks/use-shortcut";
import { cx } from "@/utils/cx";

/**
 * The canvas (React Flow), the org table and the session editor are the three
 * heaviest imports in the bundle and none of them is needed to paint Overview.
 * Splitting them keeps the first load on mobile data to the shell.
 */
const OrgTree = lazy(() =>
  import("./components/OrgTree").then((m) => ({ default: m.OrgTree }))
);
const TableView = lazy(() =>
  import("./components/TableView").then((m) => ({ default: m.TableView }))
);
const MeetingsTable = lazy(() =>
  import("./components/MeetingsTable").then((m) => ({ default: m.MeetingsTable }))
);
const SessionEditorView = lazy(() =>
  import("./components/SessionEditorView").then((m) => ({
    default: m.SessionEditorView,
  }))
);

function PaneFallback() {
  return (
    <div className="space-y-3 p-1" aria-hidden="true">
      <Skeleton shape="line" className="h-6 w-40" />
      <Skeleton shape="block" className="h-32" fade={0.7} />
      <Skeleton shape="block" className="h-32" index={1} fade={0.5} />
    </div>
  );
}

/**
 * The URL is the source of truth for what's selected: this pushes the router's
 * navigate into the store (where the selection setters call it) and mirrors
 * every location change back into state. One direction only, so the back
 * button needs no special handling.
 */
function useRouteSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const applyRoute = useStore((s) => s.applyRoute);

  // Registered in layout so a click in the first paint already navigates.
  useEffect(() => {
    setNavigate((path, opts) => navigate(path, { replace: opts?.replace }));
    return () => setNavigate(null);
  }, [navigate]);

  useEffect(() => {
    // `/people` is now a saved filter on the table. Old links, bookmarks and
    // anything already in someone's history keep working.
    if (location.pathname.replace(/\/$/, "") === LEGACY_PEOPLE_PATH) {
      navigate(PEOPLE_FILTER_PATH + location.hash, { replace: true });
      return;
    }
    const route = parseRoute(location.pathname, location.search);
    if (route.view === "tab" && route.peek?.sessionId) {
      navigate(routePath({ view: "focus", target: route.peek }), { replace: true });
      return;
    }
    applyRoute(route);
  }, [location.pathname, location.search, applyRoute, navigate]);
}

/**
 * A URL can name an entity that no longer exists — a stale bookmark, a link
 * from another account, something deleted in a second tab. Drop the selection
 * instead of rendering an empty panel.
 */
function useDropStaleSelection() {
  const navigate = useNavigate();
  const phase = useStore((s) => s.phase);
  const focused = useStore((s) => s.focused);
  const tab = useStore((s) => s.tab);
  const sessionId = useStore((s) => s.sessionId);
  const sessions = useStore((s) => s.sessions);
  const selectedMe = useStore((s) => s.selectedMe);
  const selected = useSelectedEntity();
  const hasSelectionInUrl = useStore(
    (s) =>
      Boolean(
        s.selectedPersonId ||
          s.selectedTeamId ||
          s.selectedManagerId ||
          s.selectedMeetingId
      ) || s.selectedMe
  );

  useEffect(() => {
    if (phase !== "ready") return;
    if (sessionId && !sessions.some((o) => o.id === sessionId)) {
      navigate("/tree", { replace: true });
      return;
    }
    if (selected || selectedMe || !hasSelectionInUrl) return;
    navigate(focused ? "/tree" : `/${tab}`, { replace: true });
  }, [
    phase,
    sessionId,
    sessions,
    selected,
    selectedMe,
    hasSelectionInUrl,
    focused,
    tab,
    navigate,
  ]);
}

/**
 * The bindings that belong to the app rather than to any one surface.
 *
 * They live in a hook rather than inline so they're registered once, from the
 * shell, in every phase of the app — including the full-screen session editor,
 * which returns early from `App` and used to be a shortcut dead zone.
 */
function useGlobalShortcuts() {
  const {
    paletteOpen,
    setPaletteOpen,
    helpOpen,
    setHelpOpen,
    setAskAIOpen,
    setSettingsOpen,
    openModal,
    tab,
  } = useStore();

  useShortcut(() => setPaletteOpen(!paletteOpen), {
    chord: "mod+k",
    label: "Open the command palette",
    group: "Global",
    overlay: true,
  });

  useShortcut(() => setHelpOpen(!helpOpen), {
    chord: "?",
    label: "Show keyboard shortcuts",
    group: "Global",
    overlay: true,
  });

  useShortcut(() => setAskAIOpen(true), {
    chord: "mod+shift+a",
    label: "Ask AI about your org",
    group: "Global",
  });

  useShortcut(() => setSettingsOpen(true), {
    chord: "mod+shift+,",
    label: "Open settings",
    group: "Global",
  });

  // `c` means "make a new one of whatever this tab is about". A single letter
  // for the single most frequent action, and it stands down inside any field.
  useShortcut(
    () => {
      if (tab === "meetings" || tab === "table")
        openModal({ kind: "person", teamId: null });
      else openModal({ kind: "team" });
    },
    {
      chord: "c",
      label: "Create — a team on the tree, a person on the people views",
      group: "Global",
    }
  );
}

export default function App() {
  useRouteSync();
  useDropStaleSelection();
  // Above every phase gate: the sign-in screen has a field too.
  useKeyboardInset();
  // Likewise above the gates — a failed write has to be announced on the
  // session-editor route, which renders its own chrome and no header.
  useSyncToasts();
  useGlobalShortcuts();
  /* Registered here rather than as a raw listener so it is documented by
     construction — the help panel and the palette are rendered from this
     registry, so a binding cannot exist without an entry. */
  useShortcut(() => undoLast(), {
    chord: "mod+z",
    label: "Undo the last delete",
    group: "Global",
  });

  const phase = useStore((s) => s.phase);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const focused = useStore((s) => s.focused);
  const sessionId = useStore((s) => s.sessionId);
  const askAIOpen = useStore((s) => s.askAIOpen);
  const setAskAIOpen = useStore((s) => s.setAskAIOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const selected = useSelectedEntity();

  // `g` then a letter. Jumping to a tab also drops whatever entity is open —
  // "go to People" that leaves a team panel covering half the screen has not
  // gone anywhere.
  const clearSelection = useStore((s) => s.clearSelection);
  const onGo = useCallback(
    (target: GoTarget) => {
      clearSelection();
      setTab(target);
    },
    [clearSelection, setTab]
  );

  /** Mounted in every phase, so no surface is a shortcut dead zone. */
  const overlays = (
    <>
      <ShortcutHost onGo={onGo} />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsPanel onClose={() => setHelpOpen(false)} />}
    </>
  );

  const dark = useStore((s) => s.dark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);


  // Auth/loading gate: only the "ready" phase renders the full app.
  if (phase === "loading") return <LoadingSplash />;
  // A network failure is not a sign-out — keep the session and offer a retry.
  if (phase === "error") return <LoadErrorScreen />;
  if (phase === "anon") return <Login />;

  const assessed = people.filter(hasLeadershipRead).length;
  const inSessionEditor = Boolean(sessionId);
  const inFocus = focused && Boolean(selected) && !inSessionEditor;

  if (inSessionEditor) {
    return (
      <div className="flex h-full flex-col">
        <Suspense fallback={<LoadingSplash />}>
          <SessionEditorView />
        </Suspense>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
        <ConfirmHost />
        <ToastHost />
        <ModalHost />
        {overlays}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — pads past the status bar / Dynamic Island in standalone.
          `pad-safe-x` owns the horizontal padding outright: it and `px-*` set
          the same property with the same specificity, so pairing them means
          whichever Tailwind emits last silently wins. */}
      <header className="pad-safe-top pad-safe-x chrome-compact flex shrink-0 items-center justify-between gap-3 border-b border-secondary bg-primary py-3 [--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]">
        <div className="flex min-w-0 items-baseline gap-4">
          <h1 className="text-lg font-bold tracking-tight">
            Lead<span className="text-teal-600">Well</span>
          </h1>
          <span className="hidden truncate text-xs text-quaternary lg:inline">
            {assessed} of {people.length} with a read · {teams.length} teams
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SyncIndicator />
          {/* The palette needs a visible door. A ⌘K that only exists as a
              keystroke is a feature for people who already know it's there —
              this is how they find out, and it shows the chord while doing it. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-primary px-2.5 py-1.5 text-xs text-quaternary transition-colors hover:border-stone-400 hover:text-stone-600 sm:flex dark:hover:border-stone-500"
          >
            <SearchLg className="size-3.5" aria-hidden />
            Search or jump to…
            <kbd className="rounded bg-tertiary px-1 font-mono text-caption">
              {MOD_LABEL}K
            </kbd>
          </button>
          <CreateMenu />
          <Button size="sm" iconLeading={Stars01} onClick={() => setAskAIOpen(true)}>
            Ask AI
          </Button>
          <HeaderOverflow onShortcuts={() => setHelpOpen(true)} />
        </div>
      </header>

      {inFocus ? (
        <FocusView />
      ) : (
        <>
          {/* Tabs — navigation only; content is routed, so no panels.
              Below lg the bottom bar owns navigation, and on an open entity
              this strip would be a third stacked nav bar. */}
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as Tab)}
            className={cx(
              "chrome-compact-hide shrink-0 border-b border-secondary bg-primary px-6",
              "max-lg:hidden"
            )}
          >
            <TabList type="underline" size="sm" items={TABS}>
              {(t) => <TabItem id={t.id} label={t.label} />}
            </TabList>
          </Tabs>

          {/* Main + peek. Above lg they sit side by side; below lg exactly one
              is on screen, because 16rem + 20rem cannot fit a 375px phone. */}
          <div className="flex min-h-0 flex-1">
            <main
              className={cx(
                // Horizontal padding is `pad-safe-x`'s alone — `p-4` sets the
                // same property and lost to it, which flattened every tab
                // against both screen edges below `sm`.
                // The panel owns the width it was given (see PeekPanel); the
                // canvas takes what's left, down to a floor that still reads.
                "pad-safe-x min-w-0 flex-1 py-4 sm:py-6 lg:min-w-[18rem]",
                "[--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]",
                // The tree pane clips only where it holds the canvas, which
                // does its own pan/zoom. Below lg it renders an outline — an
                // ordinary tall document that has to scroll like every other
                // tab, so the clip is scoped to lg and up.
                tab === "tree"
                  ? "scroll-contain overflow-y-auto lg:flex lg:flex-col lg:overflow-hidden"
                  : "scroll-contain overflow-y-auto",
                // The entity takes the whole viewport on a phone.
                selected && "max-lg:hidden"
              )}
            >
              <Suspense fallback={<PaneFallback />}>
                {tab === "overview" && <Overview />}
                {tab === "tree" && <OrgTree />}
                {tab === "meetings" && <MeetingsTable />}
                {tab === "table" && <TableView />}
              </Suspense>
            </main>

            {selected && <PeekPanel />}
          </div>
        </>
      )}

      <BottomNav />

      {/* Global Ask AI */}
      {askAIOpen && (
        <Modal title="Ask AI about your org" onClose={() => setAskAIOpen(false)}>
          <AICoach />
        </Modal>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <ConfirmHost />
      <ToastHost />
      <ModalHost />
      {overlays}
    </div>
  );
}
