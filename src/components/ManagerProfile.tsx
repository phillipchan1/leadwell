import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { Manager } from "../types";
import { Avatar } from "./Avatar";
import { Badge, SectionTitle } from "./ui";
import { ManagerModal } from "./forms";
import { AICoach } from "./AICoach";
import { LeadUpManual } from "./LeadUpManual";
import { PrepPanel } from "./PrepPanel";
import { SessionTable } from "./SessionTable";
import { MeetingEditor } from "./MeetingEditor";
import { NotesPanel } from "./NotesPanel";
import { TopicKanban } from "./TopicKanban";
import { meetingFor, type CheckFix } from "../lib/readiness";
import { WinsLedger } from "./WinsLedger";
import type { Density } from "./EntitySurface";

type ManagerTab = "manual" | "sessions" | "topics" | "notes";

const MANAGER_TABS: { id: ManagerTab; label: string }[] = [
  { id: "manual", label: "Leading up" },
  { id: "sessions", label: "Check-ins" },
  { id: "topics", label: "Topics" },
  { id: "notes", label: "Notes" },
];

function isManagerTab(value: string | null): value is ManagerTab {
  return MANAGER_TABS.some((t) => t.id === value);
}

/**
 * Side panel for a leader I report to. Managers carry no assessments or goals —
 * developing them isn't my job — but everything about *the relationship* works
 * the same as leading down: a tracked check-in, its history, a topic board and
 * notes. Those share the person tables, keyed by the manager's id.
 *
 * What's unique upward is the operating manual and the wins banked in their
 * currency, which is why those lead rather than a profile.
 */
export function ManagerProfile({
  manager,
  density = "peek",
}: {
  manager: Manager;
  density?: Density;
}) {
  const {
    domains,
    meetings,
    sessions,
    notes,
    addSession,
    trackMeeting,
    section,
    setSection,
    selectManager,
    updateManagerLeadUp,
    deleteManager,
    modal,
    askAIOpen,
    settingsOpen,
  } = useStore();

  const domain = domains.find((d) => d.id === manager.domainId);
  const [editing, setEditing] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const checkIn = meetingFor(meetings, "manager", manager.id);
  const mySessions = sessions.filter((s) => checkIn && s.meetingId === checkIn.id);
  const myNotes = notes.filter((n) => n.personId === manager.id);

  // The active tab is a URL sub-page, same as a person's — a check-in history
  // with your boss is a link you can come back to.
  const tab: ManagerTab = isManagerTab(section) ? section : "manual";
  const setTab = (next: ManagerTab) =>
    setSection(next === "manual" ? null : next);

  useEffect(() => {
    setEditing(false);
    setOpenSessionId(null);
  }, [manager.id]);

  /**
   * Logging a check-in for an untracked manager starts tracking it as-needed,
   * same bargain as a 1:1: you get the history without being measured, and
   * setting a rhythm stays the explicit opt-in.
   */
  const startNewSession = () => {
    setTab("sessions");
    const meetingId =
      checkIn?.id ?? trackMeeting("manager", manager.id, "as_needed");
    setOpenSessionId(
      addSession({
        meetingId,
        date: new Date().toISOString().slice(0, 10),
      })
    );
  };

  /** Send a failing readiness check to wherever it actually gets fixed. */
  const goFix = (fix: CheckFix, sessionId?: string) => {
    if (fix === "writeUp" && sessionId) {
      setTab("sessions");
      setOpenSessionId(sessionId);
      return;
    }
    if (fix === "book") {
      startNewSession();
      return;
    }
    setTab("topics");
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openSessionId) {
        e.preventDefault();
        setOpenSessionId(null);
        return;
      }
      if (modal || askAIOpen || settingsOpen || editing) return;
      e.preventDefault();
      selectManager(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, askAIOpen, settingsOpen, editing, openSessionId, selectManager]);

  const pad = density === "focus" ? "p-6" : "p-4";

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-stone-900"
      data-manager-tab={tab}
    >
      {/* Header */}
      <div
        className={`shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90 ${pad}`}
      >
        <div className="flex items-start gap-3">
          <Avatar name={manager.name} photo={manager.photo} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{manager.name}</h2>
            <div className="text-xs text-stone-500">
              {manager.role ?? "Leader I report to"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge color="#3B82F6">Leading up</Badge>
              {domain && <Badge color={domain.color}>{domain.name}</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <QuickAction onClick={startNewSession}>+ New check-in</QuickAction>
          <QuickAction onClick={() => setTab("topics")}>+ Add topic</QuickAction>
          <QuickAction onClick={() => setEditing(true)}>Edit</QuickAction>
          <QuickAction
            danger
            onClick={() => {
              if (confirm(`Remove ${manager.name}?`)) deleteManager(manager.id);
            }}
          >
            Remove
          </QuickAction>
        </div>
      </div>

      {/* Internal tabs */}
      <nav className="flex shrink-0 gap-0.5 border-b border-stone-200 px-3 dark:border-stone-800">
        {MANAGER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-2.5 py-2 text-xs transition-colors ${
              tab === t.id
                ? "border-teal-600 font-medium text-teal-700 dark:text-teal-400"
                : "border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
            }`}
          >
            {t.label}
            {t.id === "sessions" && mySessions.length > 0 && (
              <span className="ml-1 text-[10px] text-stone-400">
                {mySessions.length}
              </span>
            )}
            {t.id === "notes" && myNotes.length > 0 && (
              <span className="ml-1 text-[10px] text-stone-400">
                {myNotes.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === "manual" && (
          <div className={`flex flex-col gap-6 ${pad}`}>
            <PrepPanel
              subjectKind="manager"
              subjectId={manager.id}
              subjectName={manager.name}
              onFix={goFix}
            />
            <LeadUpManual
              key={manager.id}
              subject={manager}
              onChange={(patch) => updateManagerLeadUp(manager.id, patch)}
            />
            <WinsLedger subjectId={manager.id} />
            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach manager={manager} />
            </section>
          </div>
        )}

        {tab === "sessions" && (
          <div className={pad}>
            {checkIn ? (
              <SessionTable
                meetingId={checkIn.id}
                onOpen={(id) => setOpenSessionId(id)}
              />
            ) : (
              <button
                type="button"
                onClick={startNewSession}
                className="w-full rounded-xl border border-dashed border-stone-300 py-6 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
              >
                + Log a check-in with {manager.name.split(" ")[0]}
                <div className="mt-1 text-xs">
                  Starts tracking it as-needed — set a rhythm when you want it
                  measured
                </div>
              </button>
            )}
          </div>
        )}

        {tab === "topics" && (
          <div className={`space-y-3 ${pad}`}>
            <p className="text-xs text-stone-500">
              What you need from them — asks, escalations, decisions, things to
              flag before they hear it elsewhere. Pull into This check-in before
              you sit down.
            </p>
            <TopicKanban personId={manager.id} direction="up" />
          </div>
        )}

        {tab === "notes" && (
          <div className={pad}>
            <NotesPanel
              subjectId={manager.id}
              placeholder="What they said, what they signalled, what to remember…"
            />
          </div>
        )}

        {openSessionId && (
          <MeetingEditor
            sessionId={openSessionId}
            onClose={() => setOpenSessionId(null)}
          />
        )}
      </div>

      {editing && (
        <ManagerModal manager={manager} onClose={() => setEditing(false)} />
      )}
    </aside>
  );
}

function QuickAction({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 transition-colors ${
        danger
          ? "border-stone-200 text-stone-400 hover:border-red-300 hover:text-red-500 dark:border-stone-700"
          : "border-stone-200 text-stone-600 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:text-stone-300"
      }`}
    >
      {children}
    </button>
  );
}
