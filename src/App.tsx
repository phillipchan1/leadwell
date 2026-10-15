import { Suspense, lazy, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStore, setNavigate } from "./store/useStore";
import {
  LEGACY_OVERVIEW_PATH,
  LEGACY_PEOPLE_PATH,
  PEOPLE_FILTER_PATH,
  parseRoute,
  routePath,
} from "./lib/routes";
import { meetingSubjectName, meetingTitle } from "./lib/readiness";
import { entityModeFor, modeTabs } from "./lib/entityModes";
import { SettingsModal } from "./components/SettingsModal";
import { Login } from "./components/Login";
import { ConfirmHost } from "./components/ConfirmDialog";
import { ToastHost } from "./components/Toast";
import { ModalHost } from "./components/ModalHost";
import { FocusView } from "./components/FocusView";
import { PeekPanel, useSelectedEntity } from "./components/EntitySurface";
import { LoadErrorScreen, LoadingSplash } from "./components/AppChrome";
import { Sidebar } from "./components/shell/Sidebar";
import { PhoneHeader, PhoneTabBar } from "./components/shell/PhoneChrome";
import { useScopeShortcuts } from "./components/shell/ScopeMenu";
import { usePlaceBadges } from "./components/shell/badges";
import { lastPeopleTab, placeOf, rememberPeopleTab } from "./components/shell/places";
import { PeopleHeader } from "./components/people/PeopleHeader";
import { Skeleton } from "./components/Skeleton";
import { useKeyboardInset } from "./hooks/use-keyboard-inset";
import { useSyncToasts } from "./hooks/use-sync-toasts";
import { undoLast } from "./lib/undo";
import { ShortcutHost, type GoTarget } from "./components/ShortcutHost";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { useShortcut } from "@/hooks/use-shortcut";
import { cx } from "@/utils/cx";

/**
 * The canvas (React Flow), the org table and the session editor are the three
 * heaviest imports in the bundle. Splitting them keeps the first load lean.
 */
const OrgTree = lazy(() =>
  import("./components/OrgTree").then((m) => ({ default: m.OrgTree }))
);
const TableView = lazy(() =>
  import("./components/TableView").then((m) => ({ default: m.TableView }))
);
const IdeasBoard = lazy(() =>
  import("./components/IdeasBoard").then((m) => ({ default: m.IdeasBoard }))
);
const MeetingsTable = lazy(() =>
  import("./components/MeetingsTable").then((m) => ({ default: m.MeetingsTable }))
);
const CirclesView = lazy(() =>
  import("./components/people/CirclesView").then((m) => ({ default: m.CirclesView }))
);
const TodayPage = lazy(() =>
  import("./components/today/TodayPage").then((m) => ({ default: m.TodayPage }))
);
const PrayerPage = lazy(() =>
  import("./components/prayer/PrayerPage").then((m) => ({ default: m.PrayerPage }))
);
const SessionEditorView = lazy(() =>
  import("./components/SessionEditorView").then((m) => ({
    default: m.SessionEditorView,
  }))
);

const MeetingsLab = lazy(() =>
  import("./lab/MeetingsLab").then((m) => ({ default: m.MeetingsLab }))
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
  const phase = useStore((s) => s.phase);

  // Registered in layout so a click in the first paint already navigates.
  useEffect(() => {
    setNavigate((path, opts) => navigate(path, { replace: opts?.replace }));
    return () => setNavigate(null);
  }, [navigate]);

  useEffect(() => {
    const path = location.pathname.replace(/\/$/, "");
    // `/people` is now a saved filter on the table. Old links, bookmarks and
    // anything already in someone's history keep working.
    if (path === LEGACY_PEOPLE_PATH) {
      navigate(PEOPLE_FILTER_PATH + location.hash, { replace: true });
      return;
    }
    // Overview was the old dashboard; Today is what replaced the idea of one.
    if (path === LEGACY_OVERVIEW_PATH) {
      navigate("/" + location.search + location.hash, { replace: true });
      return;
    }
    const route = parseRoute(location.pathname, location.search);
    if (route.view === "tab" && route.peek?.sessionId) {
      navigate(routePath({ view: "focus", target: route.peek }), { replace: true });
      return;
    }
    applyRoute(route);
    // A meeting reached by an old `/meeting/<id>` link, or by id under `/m/`,
    // settles on its readable address once the data can name it — so the
    // address bar shows the bookmark worth keeping.
    if (route.view === "focus" && route.target.kind === "meeting") {
      const id = useStore.getState().selectedMeetingId;
      if (id) {
        const canonical = routePath({
          view: "focus",
          target: { ...route.target, id },
        });
        if (canonical !== location.pathname) {
          navigate(canonical + location.search + location.hash, { replace: true });
        }
      }
    }
    // `phase` re-applies the route once the data lands, so a cold
    // `/m/staff-meeting` link resolves its slug to the meeting's id.
  }, [location.pathname, location.search, applyRoute, navigate, phase]);
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
      navigate("/", { replace: true });
      return;
    }
    if (selected || selectedMe || !hasSelectionInUrl) return;
    navigate(focused ? "/" : routePath({ view: "tab", tab, peek: null }), {
      replace: true,
    });
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
 * Every page names itself, so a bookmark reads "Staff meeting" instead of a
 * bookmarks bar full of "LeadWell". The meeting agenda is the page people save,
 * which is why a meeting's title leads with the meeting and only names the mode
 * when it isn't the agenda.
 */
function useDocumentTitle() {
  const selected = useSelectedEntity();
  const tab = useStore((s) => s.tab);
  const section = useStore((s) => s.section);
  const me = useStore((s) => s.me);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);

  let title: string | undefined;
  if (!selected) {
    title = placeOf(tab).label;
  } else if (selected.kind === "meeting") {
    const m = selected.meeting;
    title = meetingTitle(m, meetingSubjectName(m, { people, teams, managers }));
    const mode = entityModeFor("meeting", section);
    if (mode !== "now") {
      title += ` · ${modeTabs("meeting").find((t) => t.id === mode)?.label}`;
    }
  } else if (selected.kind === "person") {
    title = selected.person.name;
  } else if (selected.kind === "team") {
    title = selected.team.name;
  } else if (selected.kind === "manager") {
    title = selected.manager.name;
  } else {
    title = me.name.trim() || "My profile";
  }

  useEffect(() => {
    document.title = title ? `${title} — LeadWell` : "LeadWell";
  }, [title]);
}

/**
 * The bindings that belong to the app rather than to any one surface.
 *
 * They live in a hook rather than inline so they're registered once, from the
 * shell, in every phase of the app — including the full-screen session editor,
 * which returns early from `App` and used to be a shortcut dead zone.
 */
function useGlobalShortcuts() {
  const paletteOpen = useStore((s) => s.paletteOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const helpOpen = useStore((s) => s.helpOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const openModal = useStore((s) => s.openModal);

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

  useShortcut(() => setSettingsOpen(true), {
    chord: "mod+shift+,",
    label: "Open settings",
    group: "Global",
  });

  // `c` is Capture, from anywhere: a topic, or a person, team or leader. A
  // single letter for the single most frequent action, and it stands down
  // inside any field.
  useShortcut(() => openModal({ kind: "capture" }), {
    chord: "c",
    label: "Capture — a topic, or a person, team or leader",
    group: "Global",
  });

  // ⇧1–⇧9 scope every place to a life area.
  useScopeShortcuts();
}

export default function App() {
  useRouteSync();
  useDropStaleSelection();
  useDocumentTitle();
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

  const location = useLocation();
  const phase = useStore((s) => s.phase);
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const focused = useStore((s) => s.focused);
  const sessionId = useStore((s) => s.sessionId);
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
      setTab(target === "people" ? lastPeopleTab() : target);
    },
    [clearSelection, setTab]
  );

  // People remembers which of its views you were last in.
  useEffect(() => {
    rememberPeopleTab(tab);
  }, [tab]);

  const badges = usePlaceBadges();

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


  /*
   * Meetings redesign prototype — above the auth gate on purpose.
   *
   * The lab runs on fixture data in its own reducer and never reads or writes
   * the live store, so signing in proves nothing about it. Keeping it behind
   * Google OAuth just made the prototype unreachable for anyone reviewing the
   * design, which is the only thing it exists for.
   */
  if (location.pathname.replace(/\/$/, "") === "/lab/meetings") {
    return (
      <div className="flex h-full flex-col">
        <Suspense fallback={<LoadingSplash />}>
          <MeetingsLab />
        </Suspense>
      </div>
    );
  }

  // Auth/loading gate: only the "ready" phase renders the full app.
  if (phase === "loading") return <LoadingSplash />;
  // A network failure is not a sign-out — keep the session and offer a retry.
  if (phase === "error") return <LoadErrorScreen />;
  if (phase === "anon") return <Login />;

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
    <div className="flex h-full">
      {/* The leather frame: a sidebar on a desktop, a header and tab bar on a
          phone. Navigation used to take two stacked rows of every screen. */}
      <Sidebar badges={badges} />

      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneHeader />

        {inFocus ? (
          <FocusView />
        ) : (
          /* Main + peek. Above xl they sit side by side; below xl exactly one
             is on screen. Between lg and xl the sidebar leaves 792px, short of
             the 18rem + 32rem the split needs, and both halves came out
             clipped. */
          <div className="flex min-h-0 flex-1">
            <main
              className={cx(
                // Horizontal padding is `pad-safe-x`'s alone — `p-4` sets the
                // same property and lost to it, which flattened every tab
                // against both screen edges below `sm`.
                "pad-safe-x min-w-0 flex-1 xl:min-w-[18rem]",
                // Today and Prayer are reading pages and pad themselves; the
                // working surfaces keep the old gutter.
                tab === "today" || tab === "prayer"
                  ? "[--pad-safe-x:0px]"
                  : "py-4 [--pad-safe-x:1rem] sm:py-6 sm:[--pad-safe-x:1.5rem]",
                // The tree pane clips only where it holds the canvas, which
                // does its own pan/zoom. Below lg it renders an outline — an
                // ordinary tall document that has to scroll like every other
                // tab, so the clip is scoped to lg and up.
                tab === "tree"
                  ? "scroll-contain overflow-y-auto lg:flex lg:flex-col lg:overflow-hidden"
                  : "scroll-contain overflow-y-auto",
                // The entity takes the whole surface below xl. Important, so
                // the tree pane's `lg:flex` can't put the split back.
                selected && "max-xl:hidden!"
              )}
            >
              {(tab === "circles" || tab === "tree" || tab === "table") && <PeopleHeader />}
              <Suspense fallback={<PaneFallback />}>
                {tab === "today" && <TodayPage />}
                {tab === "circles" && <CirclesView />}
                {tab === "tree" && <OrgTree />}
                {tab === "ideas" && <IdeasBoard />}
                {tab === "meetings" && <MeetingsTable />}
                {tab === "table" && <TableView />}
                {tab === "prayer" && <PrayerPage />}
              </Suspense>
            </main>

            {selected && <PeekPanel />}
          </div>
        )}

        <PhoneTabBar />
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <ConfirmHost />
      <ToastHost />
      <ModalHost />
      {overlays}
    </div>
  );
}
