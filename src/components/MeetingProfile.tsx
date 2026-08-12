import { useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingRhythm, MeetingRole, TrackedMeeting } from "../types";
import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { SectionTitle, TintBadge } from "./ui";
import { TopicBoard } from "./TopicBoard";
import { SessionTable } from "./SessionTable";
import { TrackerLink } from "./TrackerLink";
import { confirmAction } from "./ConfirmDialog";
import {
  MEETING_LABEL,
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

type MeetingTab = "plan" | "notes" | "settings";

const MEETING_TABS: { id: MeetingTab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "notes", label: "Notes" },
  { id: "settings", label: "Settings" },
];

function isMeetingTab(value: string | null): value is MeetingTab {
  return MEETING_TABS.some((t) => t.id === value);
}

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
  const {
    people,
    teams,
    managers,
    sessions,
    topics,
    section,
    setSection,
    openSession,
    updateMeeting,
    untrackMeeting,
    clearSelection,
  } = useStore();

  const tab: MeetingTab = isMeetingTab(section) ? section : "plan";
  const pad = density === "focus" ? "p-6" : "p-4";

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
        className={`entity-header shrink-0 border-b border-stone-200 dark:border-stone-800 ${pad}`}
      >
        <h2 className="truncate text-lg font-semibold text-stone-800 dark:text-stone-100">
          {title}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <TintBadge color={color}>{STATE_LABEL[readiness.state]}</TintBadge>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            {RHYTHM_LABEL[meeting.rhythm]}
            {subjectName && ` · with ${subjectName}`}
            {` · ${formatCountdown(readiness)}`}
          </span>
        </div>
        {loose.length > 0 && (
          <p className="mt-1 text-[11px] font-medium text-amber-700 dark:text-amber-500">
            {loose.length} topic{loose.length === 1 ? "" : "s"} planned for a
            meeting that's already been and gone.
          </p>
        )}
      </div>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => setSection(key as MeetingTab)}
        className="scrollbar-hide shrink-0 overflow-x-auto border-b border-stone-200 px-3 dark:border-stone-800"
      >
        <TabList type="underline" size="sm" items={MEETING_TABS}>
          {(t) => (
            <TabItem
              id={t.id}
              label={t.label}
              badge={
                t.id === "plan" && openCount > 0
                  ? openCount
                  : t.id === "notes" && sessionCount > 0
                    ? sessionCount
                    : undefined
              }
            />
          )}
        </TabList>
      </Tabs>

      <div className="scroll-contain relative min-h-0 flex-1 overflow-y-auto">
        {tab === "plan" && (
          <div className={`space-y-3 ${pad}`}>
            <TopicBoard meeting={meeting} />
          </div>
        )}

        {tab === "notes" && (
          <div className={`space-y-3 ${pad}`}>
            <TrackerLink meetingId={meeting.id} />
            <SessionTable meetingId={meeting.id} onOpen={openSession} />
          </div>
        )}

        {tab === "settings" && (
          <MeetingSettings
            meeting={meeting}
            title={title}
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
  sessionCount,
  pad,
  onChange,
  onDelete,
}: {
  meeting: TrackedMeeting;
  title: string;
  sessionCount: number;
  pad: string;
  onChange: (patch: Partial<Omit<TrackedMeeting, "id">>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(meeting.name ?? "");
  const label = MEETING_LABEL[meeting.subjectKind];

  return (
    <div className={`flex flex-col gap-6 ${pad}`}>
      <section className="space-y-2.5">
        <SectionTitle>What it's called</SectionTitle>
        <Input
          size="md"
          label="Name"
          placeholder={`Staff meeting, 1:1, Practice…`}
          hint={`Left blank it's just "${label}".`}
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
        <NativeSelect
          size="md"
          label="My part in it"
          value={meeting.role ?? "convene"}
          onChange={(e) => onChange({ role: e.target.value as MeetingRole })}
          options={ROLE_OPTIONS}
        />
      </section>

      <section className="space-y-2">
        <SectionTitle>Where the notes live</SectionTitle>
        <TrackerLink meetingId={meeting.id} />
      </section>

      <section className="space-y-2">
        <SectionTitle>Danger zone</SectionTitle>
        <p className="text-[11px] text-stone-500 dark:text-stone-400">
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
