import { Suspense, lazy, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore, setNavigate, type Tab } from "./store/useStore";
import { parseRoute, routePath } from "./lib/routes";
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
const PeopleTable = lazy(() =>
  import("./components/PeopleTable").then((m) => ({ default: m.PeopleTable }))
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

export default function App() {
  useRouteSync();
  useDropStaleSelection();
  // Above every phase gate: the sign-in screen has a field too.
  useKeyboardInset();
  // Likewise above the gates — a failed write has to be announced on the
  // session-editor route, which renders its own chrome and no header.
  useSyncToasts();

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
  const selected = useSelectedEntity();

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
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header — pads past the status bar / Dynamic Island in standalone.
          `pad-safe-x` owns the horizontal padding outright: it and `px-*` set
          the same property with the same specificity, so pairing them means
          whichever Tailwind emits last silently wins. */}
      <header className="pad-safe-top pad-safe-x chrome-compact flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 bg-white py-3 dark:border-stone-800 dark:bg-stone-900 [--pad-safe-x:1rem] sm:[--pad-safe-x:1.5rem]">
        <div className="flex min-w-0 items-baseline gap-4">
          <h1 className="text-lg font-bold tracking-tight">
            Lead<span className="text-teal-600">Well</span>
          </h1>
          <span className="hidden truncate text-xs text-stone-500 lg:inline dark:text-stone-400">
            {assessed} of {people.length} with a read · {teams.length} teams
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SyncIndicator />
          <CreateMenu />
          <Button size="sm" onClick={() => setAskAIOpen(true)}>
            ✦ Ask AI
          </Button>
          <HeaderOverflow />
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
              "chrome-compact-hide shrink-0 border-b border-stone-200 bg-white px-6 dark:border-stone-800 dark:bg-stone-900",
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
                {tab === "people" && <PeopleTable />}
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
    </div>
  );
}
