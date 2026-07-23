import { useEffect } from "react";
import { useStore, type Tab } from "./store/useStore";
import { isAssessed } from "./lib/derive";
import { OrgTree } from "./components/OrgTree";
import { PeopleTable } from "./components/PeopleTable";
import { Overview } from "./components/Overview";
import { PersonProfile } from "./components/PersonProfile";
import { TeamProfile } from "./components/TeamProfile";
import { AICoach } from "./components/AICoach";
import { SettingsModal } from "./components/SettingsModal";
import {
  IconGear,
  IconMoon,
  IconSparkle,
  IconSun,
  Modal,
} from "./components/ui";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tree", label: "Org tree" },
  { id: "people", label: "People" },
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
    selectedTeamId,
    askAIOpen,
    setAskAIOpen,
    settingsOpen,
    setSettingsOpen,
  } = useStore();

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const selectedPerson = people.find((p) => p.id === selectedPersonId);
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const assessed = people.filter(isAssessed).length;
  const showTeam = tab === "tree" && selectedTeam;
  const showPerson = tab === "tree" && selectedPerson;
  // Person drilled in from a team — keep both panels nested.
  const nested = Boolean(
    showTeam && showPerson && selectedPerson.teamId === selectedTeam.id
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header — wordmark · tabs · actions in one bar */}
      <header className="relative z-10 flex shrink-0 items-center gap-4 border-b border-line bg-surface px-5 py-2.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="font-display text-[1.35rem] leading-none font-semibold tracking-tight">
            Lead<span className="text-accent-ink italic">Well</span>
          </h1>
          <span className="hidden text-xs whitespace-nowrap text-ink-3 lg:inline">
            {assessed} of {people.length} assessed · {teams.length} teams
          </span>
        </div>

        <nav
          className="mx-auto flex items-center gap-0.5 rounded-full border border-line bg-paper p-0.5"
          aria-label="Main"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 ${
                tab === t.id
                  ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(35_32_28/0.08)] ring-1 ring-line"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => setAskAIOpen(true)} className="btn-primary">
            <IconSparkle size={14} />
            <span className="hidden sm:inline">Ask AI</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="btn-icon"
          >
            <IconGear />
          </button>
          <button
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            className="btn-icon"
          >
            {dark ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

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

        {/* Detail column ≥50%. Alone = full team; nested = ~10% team rail + ~90% person. */}
        {showTeam && (
          <div className="anim-slide-in flex w-1/2 min-w-[50%] shrink-0">
            <div
              className={
                nested
                  ? "w-[10%] max-w-[6rem] min-w-[4.5rem] shrink-0"
                  : "min-w-0 flex-1"
              }
            >
              <TeamProfile team={selectedTeam} nested={nested} />
            </div>
            {nested && showPerson && (
              <div className="min-w-0 flex-1 border-l border-line shadow-[-12px_0_32px_-16px_rgb(35_32_28/0.18)] dark:shadow-[-12px_0_32px_-16px_rgb(0_0_0/0.55)]">
                <PersonProfile person={selectedPerson} nested />
              </div>
            )}
          </div>
        )}
        {showPerson && !nested && (
          <div className="anim-slide-in w-full max-w-xl shrink-0">
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
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
