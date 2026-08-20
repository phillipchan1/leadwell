import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { useDismiss } from "@/hooks/use-dismiss";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import type { MeetingRhythm, MeetingRole, TrackedMeeting } from "../types";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { SectionTitle, TintBadge } from "./ui";
import { MeetingPlanner } from "./MeetingPlanner";
import { SessionHistoryTable } from "./SessionHistoryTable";
import { TrackerLink } from "./TrackerLink";
import { MeetingScheduleFields } from "./MeetingScheduleFields";
import { CurriculumEditor } from "./CurriculumEditor";
import { confirmAction } from "./ConfirmDialog";
import {
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  STATE_COLOR,
  STATE_LABEL,
  formatCountdown,
  meetingSubjectName,
  meetingTitle,
  readinessOf,
} from "../lib/readiness";
import { looseTopics, topicsFor } from "../lib/topics";
import type { Density } from "./EntitySurface";
import { EntityModeTabs } from "./EntityModeTabs";
import { entityModeFor, modeSection } from "../lib/entityModes";

const ROLE_OPTIONS: { label: string; value: MeetingRole }[] = [
  { label: "I convene it", value: "convene" },
  { label: "I attend it", value: "attend" },
];

/**
 * One recurring meeting, as a thing in its own right.
 *
 * This is the surface the whole feature turned on. Topics used to hang off a
 * person, which meant a staff meeting had nowhere to keep them and a team had
 * no board at all — so the meeting itself had to become somewhere you can
 * stand. Plan is the board, Notes is the history, Settings is what makes it
 * recurring.
 */
export function MeetingProfile({
  meeting,
  density = "peek",
}: {
  meeting: TrackedMeeting;
  density?: Density;
}) {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const openSession = useStore((s) => s.openSession);
  const updateMeeting = useStore((s) => s.updateMeeting);
  const untrackMeeting = useStore((s) => s.untrackMeeting);
  const clearSelection = useStore((s) => s.clearSelection);
  // Escape closed every other entity panel and not this one.
  useDismiss(() => clearSelection());

  /* On the five-mode contract now (see lib/entityModes). A meeting carries
     three of the five: Plan is its `meetings` mode, Write-ups its `notes`, and
     Settings its `profile`. `now` and `prayer` are omitted deliberately — the
     contract documents why. */
  const mode = entityModeFor("meeting", section);
  const pad = density === "focus" ? "p-6" : "p-4";
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  const closeNotes = useCallback(() => setSelectedSlotKey(null), []);

  const openSessionNotes = useCallback((sessionId: string) => {
    setSelectedSlotKey(`s:${sessionId}`);
  }, []);

  const onSelectWeek = useCallback((slotKey: string) => {
    setSelectedSlotKey(slotKey);
  }, []);

  useEffect(() => {
    setSelectedSlotKey(null);
  }, [mode]);

  const subjectName = meetingSubjectName(meeting, { people, teams, managers });
  const title = meetingTitle(meeting, subjectName);
  const readiness = readinessOf(meeting, { meetings: [meeting], sessions, topics });
  const color = STATE_COLOR[readiness.state];
  const mine = topicsFor(topics, meeting.id);
  const openCount = mine.filter((t) => t.status === "open").length;
  const loose = looseTopics(topics, sessions, meeting.id);
  const sessionCount = sessions.filter((s) => s.meetingId === meeting.id).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`entity-header shrink-0 border-b border-secondary ${pad}`}
      >
        <h2 className="truncate text-lg font-semibold text-stone-800 dark:text-stone-100">
          {title}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
          <span className="text-caption text-quaternary">
            {RHYTHM_LABEL[meeting.rhythm]}
            {subjectName && ` · with ${subjectName}`}
            {` · ${formatCountdown(readiness)}`}
          </span>
        </div>
        {loose.length > 0 && (
          <p className="mt-1 text-caption font-medium text-amber-700 dark:text-amber-500">
            {loose.length} topic{loose.length === 1 ? "" : "s"} planned for a
            meeting that's already been and gone.
          </p>
        )}
      </div>

      <EntityModeTabs
        subject="meeting"
        mode={mode}
        onMode={(next) => setSection(modeSection(next))}
        counts={{ meetings: openCount, notes: sessionCount }}
      />

      <div className="scroll-contain relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {mode === "meetings" && (
          <div className={`flex min-h-0 flex-1 flex-col ${pad}`}>
            <MeetingPlanner
              meeting={meeting}
              selectedSlotKey={selectedSlotKey}
              onSelectWeek={onSelectWeek}
              onCloseNotes={closeNotes}
              onOpenSession={openSession}
            />
          </div>
        )}

        {mode === "notes" && (
          <div className={`min-h-0 flex-1 overflow-y-auto ${pad}`}>
            <div className="space-y-3">
              <TrackerLink meetingId={meeting.id} />
              <SessionHistoryTable
                meetingId={meeting.id}
                onOpen={openSessionNotes}
              />
            </div>
          </div>
        )}

        {mode === "notes" && selectedSlotKey && (
          <OccurrenceNotesSheet
            open
            onClose={closeNotes}
            label="Meeting notes"
          >
            <OccurrenceNotesPanel
              meeting={meeting}
              slotKey={selectedSlotKey}
              onClose={closeNotes}
              onOpenFullEditor={openSession}
            />
          </OccurrenceNotesSheet>
        )}

        {mode === "profile" && (
          <MeetingSettings
            meeting={meeting}
            title={title}
            unnamedFallback={subjectName ? `Meeting · ${subjectName}` : "Meeting"}
            sessionCount={sessionCount}
            pad={pad}
            onChange={(patch) => updateMeeting(meeting.id, patch)}
            onDelete={async () => {
              if (
                await confirmAction({
                  title: `Delete "${title}"?`,
                  body: `Its ${sessionCount} write-up${sessionCount === 1 ? "" : "s"} and ${mine.length} topic${mine.length === 1 ? "" : "s"} go with it. This can't be undone.`,
                  confirmLabel: "Delete",
                })
              ) {
                untrackMeeting(meeting.id);
                clearSelection();
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

function MeetingSettings({
  meeting,
  title,
  unnamedFallback,
  sessionCount,
  pad,
  onChange,
  onDelete,
}: {
  meeting: TrackedMeeting;
  title: string;
  unnamedFallback: string;
  sessionCount: number;
  pad: string;
  onChange: (patch: Partial<Omit<TrackedMeeting, "id">>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(meeting.name ?? "");
  const setCurriculum = useStore((s) => s.setCurriculum);

  return (
    <div className={`flex flex-col gap-6 ${pad}`}>
      <section className="space-y-2.5">
        <SectionTitle>What it's called</SectionTitle>
        <Input
          size="md"
          label="Name"
          placeholder={`Staff meeting, weekly sync, Practice…`}
          hint={`Left blank it's “${unnamedFallback}”.`}
          value={name}
          onChange={setName}
          onBlur={() => onChange({ name: name.trim() || undefined })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onChange({ name: name.trim() || undefined });
            }
          }}
        />
      </section>

      <section className="space-y-2.5">
        <SectionTitle>How often</SectionTitle>
        <NativeSelect
          size="md"
          label="Rhythm"
          value={meeting.rhythm}
          onChange={(e) => {
            const rhythm = e.target.value as MeetingRhythm;
            onChange({
              rhythm,
              floorDays: rhythm === "as_needed" ? (meeting.floorDays ?? 45) : undefined,
            });
          }}
          options={RHYTHM_OPTIONS.map((r) => ({
            label: RHYTHM_LABEL[r],
            value: r,
          }))}
        />
        {meeting.rhythm === "as_needed" && (
          <Input
            size="md"
            type="number"
            inputMode="numeric"
            label="Nudge me after"
            hint="Days of silence before this counts as drifting. Blank never nudges."
            value={meeting.floorDays?.toString() ?? ""}
            placeholder="never"
            onChange={(value) =>
              onChange({ floorDays: value ? Number(value) : undefined })
            }
          />
        )}
        <MeetingScheduleFields meeting={meeting} onChange={onChange} />
        <NativeSelect
          size="md"
          label="My part in it"
          value={meeting.role ?? "convene"}
          onChange={(e) => onChange({ role: e.target.value as MeetingRole })}
          options={ROLE_OPTIONS}
        />
      </section>

      <section className="space-y-2.5">
        <SectionTitle>Standing agenda</SectionTitle>
        <p className="text-caption text-quaternary">
          Every occurrence inherits these slots. Empty ones stay visible on the
          plan so you can see when a meeting is unbalanced.
        </p>
        <CurriculumEditor
          slots={meeting.curriculum ?? []}
          onChange={(next) => setCurriculum(meeting.id, next)}
        />
      </section>

      <section className="space-y-2">
        <SectionTitle>Where the notes live</SectionTitle>
        <TrackerLink meetingId={meeting.id} />
      </section>

      <section className="space-y-2">
        <SectionTitle>Danger zone</SectionTitle>
        <p className="text-caption text-quaternary">
          {sessionCount > 0
            ? `This meeting has ${sessionCount} write-up${sessionCount === 1 ? "" : "s"}. Consider switching it to As needed instead — history is worth keeping even when the rhythm stops.`
            : "Nothing has been logged against this meeting yet."}
        </p>
        <Button size="sm" color="secondary-destructive" onClick={onDelete}>
          Delete "{title}"
        </Button>
      </section>
    </div>
  );
}
