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
import { meetingFor, type CheckFix } from "../lib/readiness";
import { WinsLedger } from "./WinsLedger";
import type { Density } from "./EntitySurface";

/**
 * Side panel for a leader I report to. Managers have no assessments, goals, or
 * 1:1 history — leading up is the operating manual, the wins banked in their
 * currency, and a coach that reasons off both.
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
    addSession,
    trackMeeting,
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

  useEffect(() => {
    setEditing(false);
    setOpenSessionId(null);
  }, [manager.id]);

  /**
   * Leading up has no topic board yet, so an empty agenda points at the wins
   * ledger — banking value in their currency *is* the prep for a check-in.
   */
  const goFix = (fix: CheckFix, sessionId?: string) => {
    if (fix === "writeUp" && sessionId) {
      setOpenSessionId(sessionId);
      return;
    }
    if (fix === "book") {
      const meetingId =
        checkIn?.id ?? trackMeeting("manager", manager.id, "as_needed");
      setOpenSessionId(
        addSession({
          meetingId,
          date: new Date().toISOString().slice(0, 10),
        })
      );
      return;
    }
    document
      .getElementById(`wins-${manager.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal || askAIOpen || settingsOpen || editing) return;
      e.preventDefault();
      selectManager(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, askAIOpen, settingsOpen, editing, selectManager]);

  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-stone-900">
      {/* Header */}
      <div
        className={`shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90 ${
          density === "focus" ? "p-6" : "p-4"
        }`}
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

      {openSessionId && (
        <MeetingEditor
          sessionId={openSessionId}
          onClose={() => setOpenSessionId(null)}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`flex flex-col gap-6 ${density === "focus" ? "p-6" : "p-4"}`}>
          <PrepPanel
            subjectKind="manager"
            subjectId={manager.id}
            subjectName={manager.name}
            onFix={goFix}
          />
          {checkIn && (
            <section className="space-y-2">
              <SectionTitle>{checkIn.name ?? "Check-ins"}</SectionTitle>
              <SessionTable
                meetingId={checkIn.id}
                onOpen={(id) => setOpenSessionId(id)}
              />
            </section>
          )}
          <LeadUpManual
            key={manager.id}
            subject={manager}
            onChange={(patch) => updateManagerLeadUp(manager.id, patch)}
          />
          <div id={`wins-${manager.id}`}>
            <WinsLedger subjectId={manager.id} />
          </div>
          <section className="space-y-2">
            <SectionTitle>AI coach</SectionTitle>
            <AICoach manager={manager} />
          </section>
        </div>
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
