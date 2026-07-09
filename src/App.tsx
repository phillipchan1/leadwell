import { useEffect } from "react";
import { useStore, type Tab } from "./store/useStore";
import { isAssessed } from "./lib/derive";
import { OrgTree } from "./components/OrgTree";
import { PeopleTable } from "./components/PeopleTable";
import { Overview } from "./components/Overview";
import { PersonProfile } from "./components/PersonProfile";
import { AICoach } from "./components/AICoach";
import { Modal } from "./components/ui";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tree", label: "Org tree" },
  { id: "people", label: "People table" },
];

export default function App() {
  const {
    tab,
    setTab,
    people,
    teams,
    dark,
    toggleDark,
    selectedPersonId,
    askAIOpen,
    setAskAIOpen,
  } = useStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const selectedPerson = people.find((p) => p.id === selectedPersonId);
  const assessed = people.filter(isAssessed).length;
  const showProfile = tab === "tree" && selectedPerson;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3 dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-baseline gap-4">
          <h1 className="text-lg font-bold tracking-tight">
            Lead<span className="text-teal-600">Well</span>
          </h1>
          <span className="hidden text-xs text-stone-400 sm:inline">
            {assessed} of {people.length} assessed · {teams.length} teams
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
        {showProfile && (
          <div className="w-full max-w-md shrink-0">
            <PersonProfile person={selectedPerson} />
          </div>
        )}
      </div>

      {/* Global Ask AI */}
      {askAIOpen && (
        <Modal title="Ask AI about your org" onClose={() => setAskAIOpen(false)}>
          <AICoach />
        </Modal>
      )}
    </div>
  );
}
