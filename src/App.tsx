import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore, setNavigate, type Tab } from "./store/useStore";
import { parseRoute, routePath } from "./lib/routes";
import { hasLeadershipRead } from "./lib/derive";
import { OrgTree } from "./components/OrgTree";
import { PeopleTable } from "./components/PeopleTable";
import { TableView } from "./components/TableView";
import { Overview } from "./components/Overview";
import { AICoach } from "./components/AICoach";
import { SettingsModal } from "./components/SettingsModal";
import { Login } from "./components/Login";
import { Modal } from "./components/ui";
import { Button } from "@/components/base/buttons/button";
import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";
import { FocusView } from "./components/FocusView";
import { SessionEditorView } from "./components/SessionEditorView";
import { PeekPanel, useSelectedEntity } from "./components/EntitySurface";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tree", label: "Org tree" },
  // The canvas's correlated view: same org, sortable and filterable.
  { id: "table", label: "Table" },
  { id: "people", label: "People table" },
];

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
      Boolean(s.selectedPersonId || s.selectedTeamId || s.selectedManagerId) ||
      s.selectedMe
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

  const {
    phase,
    tab,
    setTab,
    people,
    teams,
    dark,
    toggleDark,
    focused,
    sessionId,
    askAIOpen,
    setAskAIOpen,
    settingsOpen,
    setSettingsOpen,
  } = useStore();
  const selected = useSelectedEntity();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // Auth/loading gate: only the "ready" phase renders the full app.
  if (phase === "loading") {
    return (
      <div className="flex h-full items-center justify-center bg-stone-50 text-sm text-stone-400 dark:bg-stone-950">
        Loading your org…
      </div>
    );
  }
  if (phase === "anon") return <Login />;

  const assessed = people.filter(hasLeadershipRead).length;
  const inSessionEditor = Boolean(sessionId);
  const inFocus = focused && Boolean(selected) && !inSessionEditor;

  if (inSessionEditor) {
    return (
      <div className="flex h-full flex-col">
        <SessionEditorView />
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-baseline gap-4">
          <h1 className="text-lg font-bold tracking-tight">
            Lead<span className="text-teal-600">Well</span>
          </h1>
          <span className="hidden text-xs text-stone-400 sm:inline">
            {assessed} of {people.length} with a read · {teams.length} teams
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAskAIOpen(true)}>
            ✦ Ask AI
          </Button>
          <Button
            size="sm"
            color="secondary"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </Button>
          <Button
            size="sm"
            color="secondary"
            onClick={toggleDark}
            aria-label="Toggle dark mode"
          >
            {dark ? "☀️" : "🌙"}
          </Button>
        </div>
      </header>

      {inFocus ? (
        <FocusView />
      ) : (
        <>
          {/* Tabs — navigation only; content is routed, so no panels */}
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as Tab)}
            className="border-b border-stone-200 bg-white px-6 dark:border-stone-800 dark:bg-stone-900"
          >
            <TabList type="underline" size="sm" items={TABS}>
              {(t) => <TabItem id={t.id} label={t.label} />}
            </TabList>
          </Tabs>

          {/* Main + peek — canvas ~45%, panel ~55% when open */}
          <div className="flex min-h-0 flex-1">
            <main
              className={`min-w-[16rem] flex-[2] p-6 lg:min-w-[22.5rem] ${
                tab === "tree"
                  ? "flex flex-col overflow-hidden"
                  : "overflow-y-auto"
              }`}
            >
              {tab === "overview" && <Overview />}
              {tab === "tree" && <OrgTree />}
              {tab === "table" && <TableView />}
              {tab === "people" && <PeopleTable />}
            </main>

            {selected && <PeekPanel />}
          </div>
        </>
      )}

      {/* Global Ask AI */}
      {askAIOpen && (
        <Modal title="Ask AI about your org" onClose={() => setAskAIOpen(false)}>
          <AICoach />
        </Modal>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
