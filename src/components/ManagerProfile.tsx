import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { useDismiss } from "@/hooks/use-dismiss";
import type { Manager } from "../types";
import { Avatar } from "./Avatar";
import { TintBadge, ProfileAdminLinks, SectionTitle } from "./ui";
import { ManagerModal } from "./forms";
import { EntityModeTabs } from "./EntityModeTabs";
import { entityMode, modeSection, type EntityMode } from "../lib/entityModes";

import { AICoach } from "./AICoach";
import { LeadUpManual } from "./LeadUpManual";
import { PrepPanel } from "./PrepPanel";
import { SubjectMeetings } from "./SubjectMeetings";
import { NotesPanel } from "./NotesPanel";
import { meetingFor, todayISO, type CheckFix } from "../lib/readiness";
import { WinsLedger } from "./WinsLedger";
import { PrayerPanel } from "./Prayer";
import type { Density } from "./EntitySurface";
import { confirmAction } from "./ConfirmDialog";

/**
 * Side panel for a leader I report to, in the five modes every entity shares.
 *
 * Managers carry no assessments or goals — developing them isn't my job — but
 * everything about *the relationship* works the same as leading down: a
 * tracked check-in with a board and a history, notes, prayer. Those share the
 * person tables, keyed by the manager's id.
 *
 * What's unique upward is the operating manual and the wins banked in their
 * currency, which is why Profile is titled "Leading up".
 */
export function ManagerProfile({
  manager,
  density: _density = "peek",
}: {
  manager: Manager;
  density?: Density;
}) {
  const domains = useStore((s) => s.domains);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const notes = useStore((s) => s.notes);
  const trackMeeting = useStore((s) => s.trackMeeting);
  const addSession = useStore((s) => s.addSession);
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const selectManager = useStore((s) => s.selectManager);
  const updateManagerLeadUp = useStore((s) => s.updateManagerLeadUp);
  const deleteManager = useStore((s) => s.deleteManager);

  const domain = domains.find((d) => d.id === manager.domainId);
  const [editing, setEditing] = useState(false);
  const [focusSessionId, setFocusSessionId] = useState<string | undefined>();

  const checkIn = meetingFor(meetings, "manager", manager.id);
  const mySessions = sessions
    .filter((s) => checkIn && s.meetingId === checkIn.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myNotes = notes.filter((n) => n.personId === manager.id);

  const lastSession = mySessions.find((o) => o.notes?.trim());
  const nextSession = mySessions.find((o) => o.nextDate)?.nextDate;

  const mode = entityMode(section);
  const setMode = (next: EntityMode) => setSection(modeSection(next));

  useEffect(() => {
    setEditing(false);
    setFocusSessionId(undefined);
  }, [manager.id]);

  /** Send a failing readiness check to Meetings, where all of it now lives. */
  const goFix = (fix: CheckFix, sessionRowId?: string) => {
    if (fix === "book") {
      const meetingId =
        checkIn?.id ?? trackMeeting("manager", manager.id, "as_needed");
      setFocusSessionId(addSession({ meetingId, date: todayISO() }));
    } else {
      setFocusSessionId(fix === "writeUp" ? sessionRowId : undefined);
    }
    setMode("meetings");
  };

  // Ordering comes from the stack, not from a guard list — an editor
  // opened inside this panel registers after it and gets Escape first.
  useDismiss(() => selectManager(null));

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-primary"
      data-manager-mode={mode}
    >
      {/* Header — identity only; everything else lives in a mode */}
      <div className="entity-header shrink-0 border-b border-secondary bg-white/90 px-4 py-4 backdrop-blur sm:px-6 dark:bg-stone-900/90">
        <div className="flex items-start gap-3">
          <Avatar name={manager.name} photo={manager.photo} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{manager.name}</h2>
            <div className="text-xs text-stone-500">
              {manager.role ?? "Leader I report to"}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <TintBadge color="#3B82F6">Leading up</TintBadge>
              {domain && <TintBadge color={domain.color}>{domain.name}</TintBadge>}
            </div>
            <div className="mt-1 text-caption text-quaternary">
              {nextSession && `Next meeting ${nextSession}`}
              {nextSession && lastSession && " · "}
              {lastSession && `Last ${lastSession.date}`}
            </div>
          </div>
        </div>
      </div>

      <EntityModeTabs
        subject="manager"
        mode={mode}
        onMode={setMode}
        counts={{ meetings: mySessions.length, notes: myNotes.length }}
      />

      {/* A container query, not a viewport one: the panel is resizable, so the
          layout has to answer to how wide *it* is. */}
      <div className="scroll-contain @container relative min-h-0 flex-1 overflow-y-auto">
        {mode === "now" && (
          <div className="grid min-w-0 gap-6 p-4 sm:p-6 @3xl:grid-cols-2 @3xl:items-start">
            <PrepPanel
              subjectKind="manager"
              subjectId={manager.id}
              subjectName={manager.name}
              onFix={goFix}
            />
            <WinsLedger subjectId={manager.id} />
          </div>
        )}

        {mode === "meetings" && (
          <div className="p-4 sm:p-6">
            <SubjectMeetings
              subjectKind="manager"
              subjectId={manager.id}
              subjectName={manager.name}
              direction="up"
              focusSessionId={focusSessionId}
            />
          </div>
        )}

        {mode === "profile" && (
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <LeadUpManual
              key={manager.id}
              subject={manager}
              onChange={(patch) => updateManagerLeadUp(manager.id, patch)}
            />
            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach manager={manager} />
            </section>
            <ProfileAdminLinks
              onEdit={() => setEditing(true)}
              onRemove={async () => {
                if (
                  await confirmAction({
                    title: `Remove ${manager.name}?`,
                    body: "Their profile, notes and check-in history are removed.",
                    confirmLabel: "Remove",
                  })
                )
                  deleteManager(manager.id);
              }}
            />
          </div>
        )}

        {mode === "notes" && (
          <div className="p-4 sm:p-6">
            <NotesPanel
              subjectId={manager.id}
              placeholder="What they said, what they signalled, what to remember…"
            />
          </div>
        )}

        {mode === "prayer" && (
          <PrayerPanel
            subjectKind="manager"
            subjectId={manager.id}
            subjectName={manager.name}
          />
        )}
      </div>

      {editing && (
        <ManagerModal manager={manager} onClose={() => setEditing(false)} />
      )}
    </aside>
  );
}
