import { useEffect } from "react";
import { useStore, type Tab } from "./store/useStore";
import { hasLeadershipRead } from "./lib/derive";
import { OrgTree } from "./components/OrgTree";
import { PeopleTable } from "./components/PeopleTable";
import { Overview } from "./components/Overview";
import { PersonProfile } from "./components/PersonProfile";
import { MeProfile } from "./components/MeProfile";
import { ManagerProfile } from "./components/ManagerProfile";
import { TeamProfile } from "./components/TeamProfile";
import { AICoach } from "./components/AICoach";
import { SettingsModal } from "./components/SettingsModal";
import { Login } from "./components/Login";
import { Modal } from "./components/ui";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tree", label: "Org tree" },
  { id: "people", label: "People table" },
];

export default function App() {
  const {
    phase,
    tab,
    setTab,
    people,
    teams,
    managers,
    dark,
    toggleDark,
    userEmail,
    selectedPersonId,
    selectedTeamId,
    selectedManagerId,
    selectedMe,
    askAIOpen,
    setAskAIOpen,
    settingsOpen,
    setSettingsOpen,
  } = useStore();

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

  const selectedPerson = people.find((p) => p.id === selectedPersonId);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const selectedManager = managers.find((m) => m.id === selectedManagerId);
  const assessed = people.filter(hasLeadershipRead).length;
  const showTeam = tab === "tree" && selectedTeam;
  const showPerson = tab === "tree" && selectedPerson;
  const showManager = tab === "tree" && selectedManager;
  const showMe = tab === "tree" && selectedMe;
  // Person drilled in from a team — keep both panels nested.
  const nested = Boolean(
    showTeam && showPerson && selectedPerson.teamId === selectedTeam.id
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-baseline gap-4">
          <h1 className="text-lg font-bold tracking-tight">
            Lead<span className="text-teal-600">Well</span>
          </h1>
          <span className="hidden text-xs text-stone-400 sm:inline">
            {assessed} of {people.length} with a read · {teams.length} teams
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAskAIOpen(true)}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            ✦ Ask AI
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            title={userEmail ?? "Settings"}
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            Settings
          </button>
          <button
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            {dark ? "☀️" : "🌙"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-stone-200 bg-white px-5 dark:border-stone-800 dark:bg-stone-900">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2.5 text-sm transition-colors ${
              tab === t.id
                ? "border-teal-600 font-medium text-teal-700 dark:text-teal-400"
                : "border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Main */}
      <div className="flex min-h-0 flex-1">
        <main
          className={`min-w-0 flex-1 p-5 ${
            tab === "tree" ? "flex flex-col overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {tab === "overview" && <Overview />}
          {tab === "tree" && <OrgTree />}
          {tab === "people" && <PeopleTable />}
        </main>

        {/* Detail column ~60%. Alone = full team; nested = ~10% team rail + ~90% person. */}
        {showTeam && (
          <div className="flex w-[60%] min-w-[55%] shrink-0">
            <div
              className={
                nested
                  ? "w-[10%] min-w-[4.5rem] max-w-[6rem] shrink-0"
                  : "min-w-0 flex-1"
              }
            >
              <TeamProfile team={selectedTeam} nested={nested} />
            </div>
            {nested && showPerson && (
              <div className="min-w-0 flex-1 border-l border-stone-200 shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.12)] dark:border-stone-800 dark:shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.45)]">
                <PersonProfile person={selectedPerson} nested />
              </div>
            )}
          </div>
        )}
        {showPerson && !nested && (
          <div className="w-full max-w-xl shrink-0">
            <PersonProfile person={selectedPerson} />
          </div>
        )}
        {showManager && (
          <div className="w-full max-w-xl shrink-0">
            <ManagerProfile manager={selectedManager} />
          </div>
        )}
        {showMe && (
          <div className="w-full max-w-xl shrink-0">
            <MeProfile />
          </div>
        )}
      </div>

      {/* Global Ask AI */}
      {askAIOpen && (
        <Modal title="Ask AI about your org" onClose={() => setAskAIOpen(false)}>
          <AICoach />
        </Modal>
      )}
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
