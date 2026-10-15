import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useStore } from "../store/useStore";
import { useDismiss } from "@/hooks/use-dismiss";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import type { MeetingRhythm, MeetingRole, TrackedMeeting } from "../types";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { AddOneOff, MeetingPlanner } from "./MeetingPlanner";
import { MeetingAgenda } from "./MeetingAgenda";
import { weekName } from "./TopicBoard";
import { SessionHistoryTable } from "./SessionHistoryTable";
import { TrackerLink } from "./TrackerLink";
import { MeetingScheduleFields } from "./MeetingScheduleFields";
import { CurriculumEditor } from "./CurriculumEditor";
import { TagManager } from "./TagManager";
import { confirmAction } from "./ConfirmDialog";
import { Avatar } from "./Avatar";
import { RhythmRing, STATE_TEXT } from "./brand/glyphs";
import {
  RHYTHM_LABEL,
  RHYTHM_OPTIONS,
  STATE_LABEL,
  daysBetween,
  formatCountdown,
  meetingSubjectName,
  meetingTitle,
  readinessOf,
  todayISO,
} from "../lib/readiness";
import {
  boardLayout,
  curriculumOf,
  ensureSessionId,
  slotDotClass,
  topicsFor,
  type Slot,
} from "../lib/topics";
import type { Density } from "./EntitySurface";
import { EntityModeTabs } from "./EntityModeTabs";
import { entityModeFor, modeSection } from "../lib/entityModes";
import { Play } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const ROLE_OPTIONS: { label: string; value: MeetingRole }[] = [
  { label: "I convene it", value: "convene" },
  { label: "I attend it", value: "attend" },
];

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

/**
 * One recurring meeting, as a thing in its own right.
 *
 * This is the surface the whole feature turned on. Topics used to hang off a
 * person, which meant a staff meeting had nowhere to keep them and a team had
 * no board at all — so the meeting itself had to become somewhere you can
 * stand. Agenda is the next occurrence as a running order, Plan ahead is the
 * board of the weeks to come, Write-ups is the history, Settings is what
 * makes it recurring.
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
  const addSession = useStore((s) => s.addSession);
  const addExtraOccurrence = useStore((s) => s.addExtraOccurrence);
  const updateMeeting = useStore((s) => s.updateMeeting);
  const untrackMeeting = useStore((s) => s.untrackMeeting);
  const clearSelection = useStore((s) => s.clearSelection);

  /* On the five-mode contract (see lib/entityModes). A meeting carries four
     of the five: Agenda is its `now`, Plan ahead its `meetings`, Write-ups
     its `notes`, and Settings its `profile`. */
  const mode = entityModeFor("meeting", section);
  const focus = density === "focus";
  const pad = focus ? "px-4 sm:px-8" : "px-4 sm:px-6";
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  // Escape closes the open week first, then the meeting.
  useDismiss(() => (selectedSlotKey ? setSelectedSlotKey(null) : clearSelection()));

  const closeNotes = useCallback(() => setSelectedSlotKey(null), []);
  const onSelectWeek = useCallback((key: string) => setSelectedSlotKey(key), []);

  /*
   * Changing mode closes any open week — except when the change was made in
   * order to open one (the header's "Next up", a new one-off), which parks
   * the week here until the Plan tab is on screen.
   */
  const pendingKey = useRef<string | null>(null);
  useEffect(() => {
    setSelectedSlotKey(pendingKey.current);
    pendingKey.current = null;
  }, [mode]);
  const showWeek = (key: string) => {
    if (mode === "meetings") {
      setSelectedSlotKey(key);
      return;
    }
    pendingKey.current = key;
    setSection(modeSection("meetings", "meeting"));
  };

  const subjectName = meetingSubjectName(meeting, { people, teams, managers });
  const title = meetingTitle(meeting, subjectName);
  const mine = topicsFor(topics, meeting.id);
  const openCount = mine.filter((t) => t.status === "open").length;
  const sessionCount = sessions.filter((s) => s.meetingId === meeting.id).length;

  const today = todayISO();
  const layout = useMemo(
    () => boardLayout(meeting, sessions, topics, today, { ahead: 8 }),
    [meeting, sessions, topics, today]
  );
  const next = layout.weeks.find((w) => !w.slot.past) ?? null;

  const start = (slot: Slot) =>
    openSession(ensureSessionId(meeting.id, slot, sessions, addSession));

  const startLabel = next
    ? daysBetween(today, next.slot.date) === 0
      ? "Start today's meeting"
      : `Start ${weekName(next.slot.date)}`
    : null;

  const actions = (
    <>
      <AddOneOff
        onAdd={(date) => showWeek(`s:${addExtraOccurrence(meeting.id, date)}`)}
      />
      {next && startLabel && (
        <button
          type="button"
          onClick={() => start(next.slot)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] bg-teal-600 px-3.5 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 touch:min-h-11 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
        >
          <Play aria-hidden className="size-3.5" />
          {startLabel}
        </button>
      )}
    </>
  );

  return (
    <div className="scroll-contain relative flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-primary">
      <header className={cx("entity-header @container shrink-0 pt-6 pb-5", pad)}>
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <Avatar
              name={subjectName || title}
              photo={
                meeting.subjectKind === "person"
                  ? people.find((p) => p.id === meeting.subjectId)?.photo
                  : meeting.subjectKind === "manager"
                    ? managers.find((m) => m.id === meeting.subjectId)?.photo
                    : undefined
              }
              size={focus ? 60 : 52}
              className={meeting.subjectKind === "team" ? "!rounded-[15px]" : undefined}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 className={cx("name leading-tight", focus ? "text-[34px] sm:text-[38px]" : "text-[28px]")}>
                {title}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-secondary">
                <span>
                  {RHYTHM_LABEL[meeting.rhythm]}
                  {meeting.rhythm !== "as_needed" && meeting.anchorWeekday !== undefined
                    ? ` on ${WEEKDAY[meeting.anchorWeekday]}s`
                    : ""}
                </span>
                {/* Each separator travels with the words after it, so a wrap
                    never leaves a line ending on "·". */}
                {subjectName && (meeting.name?.trim() || meeting.subjectKind === "team") && (
                  <span className="whitespace-nowrap">
                    <span aria-hidden className="mr-2 text-quaternary">·</span>
                    with <span className="font-serif text-[15.5px] text-primary">{subjectName}</span>
                  </span>
                )}
                <span className="whitespace-nowrap">
                  <span aria-hidden className="mr-2 text-quaternary">·</span>
                  {meeting.role === "attend" ? "you attend" : "you convene"}
                </span>
              </p>
              <PhoneRhythm meeting={meeting} />
            </div>
            {/* Inline only from lg: at md the ~320px of buttons squeezed the
                title down to "1:1 with Sarah" and a lone "Kim". */}
            <div className="flex shrink-0 items-center gap-2 max-lg:hidden">{actions}</div>
          </div>

          <MeetingStatus
            meeting={meeting}
            next={next?.slot ?? null}
            weeks={layout.weeks}
            ideas={layout.bucket.slice(0, -1).reduce((n, g) => n + g.topics.length, 0)}
            onRhythm={() => setSection(modeSection("profile", "meeting"))}
            // The Agenda is the next one, as a running order.
            onNext={() => setSection(modeSection("now", "meeting"))}
          />
          <div className="flex flex-wrap gap-2 lg:hidden">{actions}</div>
        </div>
      </header>

      <div className="sticky top-0 z-20 bg-primary">
        <EntityModeTabs
          subject="meeting"
          mode={mode}
          onMode={(m) => setSection(modeSection(m, "meeting"))}
          counts={{ meetings: openCount, notes: sessionCount }}
        />
      </div>

      {mode === "now" && (
        <div className={cx("flex flex-col pt-5 pb-10", pad)}>
          <MeetingAgenda meeting={meeting} onOpenSession={openSession} narrow={!focus} />
        </div>
      )}

      {mode === "meetings" && (
        <div className={cx("flex flex-col pt-5 pb-10", pad)}>
          <MeetingPlanner
            meeting={meeting}
            selectedSlotKey={selectedSlotKey}
            onSelectWeek={onSelectWeek}
            onCloseNotes={closeNotes}
            onOpenSession={openSession}
            historyView={false}
            oneOff={false}
            narrow={!focus}
          />
        </div>
      )}

      {mode === "notes" && (
        <div className={cx("flex flex-col gap-4 pt-5 pb-10", pad)}>
          <TrackerLink meetingId={meeting.id} />
          <SessionHistoryTable meetingId={meeting.id} onOpen={(id) => setSelectedSlotKey(`s:${id}`)} />
        </div>
      )}

      {mode === "notes" && selectedSlotKey && (
        <OccurrenceNotesSheet open onClose={closeNotes} label="Meeting notes">
          <OccurrenceNotesPanel
            meeting={meeting}
            slotKey={selectedSlotKey}
            onClose={closeNotes}
            onOpenFullEditor={openSession}
            onMaterialized={(id) => setSelectedSlotKey(`s:${id}`)}
          />
        </OccurrenceNotesSheet>
      )}

      {mode === "profile" && (
        <MeetingSettings
          meeting={meeting}
          title={title}
          unnamedFallback={meetingTitle({ ...meeting, name: undefined }, subjectName)}
          sessionCount={sessionCount}
          pad={pad}
          onChange={(patch) => updateMeeting(meeting.id, patch)}
          onDelete={async () => {
            if (
              await confirmAction({
                title: `Delete “${title}”?`,
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
  );
}

/**
 * The three things worth knowing before you plan: is the rhythm holding,
 * what's on the next one, and which parts of the standing agenda keep getting
 * skipped.
 */
function MeetingStatus({
  meeting,
  next,
  weeks,
  ideas,
  onRhythm,
  onNext,
}: {
  meeting: TrackedMeeting;
  next: Slot | null;
  weeks: ReturnType<typeof boardLayout>["weeks"];
  ideas: number;
  onRhythm: () => void;
  onNext: (slot: Slot) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const reading = readinessOf(meeting, { meetings: [meeting], sessions, topics });
  const curriculum = curriculumOf(meeting);
  const upcoming = weeks.filter((w) => !w.slot.past);
  const nextWeek = next ? upcoming.find((w) => w.slot.date === next.date) : undefined;
  const minutes = curriculum.reduce((n, s) => n + (s.minutes ?? 0), 0);
  const filledIn = (slotId: string) =>
    Boolean(nextWeek?.cells.some((c) => c.slotId === slotId && c.topics.length > 0));
  const planned = curriculum.filter((s) => filledIn(s.id));
  const openNames = curriculum.filter((s) => !filledIn(s.id)).map((s) => s.label);
  const plannedAhead = upcoming.reduce((n, w) => n + w.topics.length, 0);

  return (
    // On a phone the plan is the point; the rhythm rides under the title.
    <div className="grid overflow-hidden rounded-[16px] border border-secondary bg-primary max-md:hidden @2xl:grid-cols-3">
      <Cell label="Rhythm" aside={RHYTHM_LABEL[meeting.rhythm].toUpperCase()} onClick={onRhythm}>
        <span className={cx("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1", STATE_TEXT[reading.state])}>
          <RhythmRing reading={reading} size={24} />
          <span className="font-mono text-[13px] font-medium whitespace-nowrap uppercase">{formatCountdown(reading)}</span>
          <span className="text-[13px] font-semibold whitespace-nowrap">{STATE_LABEL[reading.state]}</span>
        </span>
        <p className="text-[13.5px] leading-5 text-secondary">
          {reading.lastMet
            ? `Last met ${fmt(reading.lastMet, { weekday: "short", month: "short", day: "numeric" })}.`
            : "Not met yet."}
        </p>
      </Cell>

      <Cell
        label="Next up"
        aside={minutes ? `${minutes} MIN` : undefined}
        onClick={next ? () => onNext(next) : undefined}
      >
        {next ? (
          <>
            <p className="font-serif text-[19px] leading-6">
              {fmt(next.date, { weekday: "long", month: "long", day: "numeric" })}
            </p>
            {curriculum.length > 0 ? (
              <>
                <span className="flex gap-1" aria-hidden>
                  {curriculum.map((s) => (
                    <span
                      key={s.id}
                      style={{ flexGrow: s.minutes || 1 }}
                      className={cx(
                        "h-1.5 basis-0 rounded-full",
                        filledIn(s.id) ? slotDotClass(curriculum, s.id, tags) : "bg-quaternary"
                      )}
                    />
                  ))}
                </span>
                <p className="text-[13px] leading-5 text-secondary">
                  {planned.length} of {curriculum.length} sections planned
                  {openNames.length > 0 && openNames.length < curriculum.length
                    ? `. ${listNames(openNames)} ${openNames.length === 1 ? "is" : "are"} open.`
                    : "."}
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-5 text-secondary">
                {nextWeek?.topics.length
                  ? `${nextWeek.topics.length} topic${nextWeek.topics.length === 1 ? "" : "s"} planned.`
                  : "Nothing planned yet."}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-serif text-[19px] leading-6 text-secondary">Nothing coming up</p>
            <p className="text-[13px] leading-5 text-secondary">
              Set a rhythm in Settings, or add a one-off date.
            </p>
          </>
        )}
      </Cell>

      {curriculum.length > 0 && upcoming.length > 0 ? (
        <Cell label="Coverage" aside={`NEXT ${upcoming.length} ${upcoming.length === 1 ? "WEEK" : "WEEKS"}`}>
          <div className="grid grid-cols-[minmax(0,auto)_auto_1fr] items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
            {curriculum.map((s) => {
              const filled = upcoming.map((w) =>
                w.cells.some((c) => c.slotId === s.id && c.topics.length > 0)
              );
              const n = filled.filter(Boolean).length;
              const dot = slotDotClass(curriculum, s.id, tags);
              return (
                <div key={s.id} className="contents" title={`${s.label}: planned in ${n} of the next ${filled.length}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <i aria-hidden className={cx("size-2 shrink-0 rounded-[2px]", dot)} />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span aria-hidden className="flex items-end gap-[2.5px]">
                    {filled.slice(0, 12).map((on, i) => (
                      <i key={i} className={cx("h-2.5 w-[5px] rounded-[1.5px]", on ? dot : "bg-quaternary")} />
                    ))}
                  </span>
                  <span className="font-mono text-[11px] text-quaternary">
                    {n}/{filled.length}
                  </span>
                </div>
              );
            })}
          </div>
        </Cell>
      ) : (
        <Cell label="Ideas">
          <p className="font-serif text-[19px] leading-6">
            {ideas} waiting
          </p>
          <p className="text-[13px] leading-5 text-secondary">
            {plannedAhead
              ? `${plannedAhead} topic${plannedAhead === 1 ? "" : "s"} planned ahead.`
              : "Nothing planned ahead yet."}
          </p>
        </Cell>
      )}
    </div>
  );
}

/** The rhythm in one line, for a phone, where the status panels don't fit. */
function PhoneRhythm({ meeting }: { meeting: TrackedMeeting }) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const reading = readinessOf(meeting, { meetings: [meeting], sessions, topics });
  return (
    <span className={cx("mt-1 inline-flex items-center gap-2 md:hidden", STATE_TEXT[reading.state])}>
      <RhythmRing reading={reading} size={18} />
      <span className="font-mono text-[12px] font-medium uppercase">{formatCountdown(reading)}</span>
      <span className="text-[12.5px] font-semibold">{STATE_LABEL[reading.state]}</span>
    </span>
  );
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function Cell({
  label,
  aside,
  onClick,
  children,
}: {
  label: string;
  aside?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const body = (
    <>
      <span className="flex w-full items-center gap-2">
        <span className="eyebrow">{label}</span>
        {aside && (
          <span className="ml-auto shrink-0 font-mono text-[11px] whitespace-nowrap text-quaternary">{aside}</span>
        )}
      </span>
      {children}
    </>
  );
  const cls =
    "flex min-w-0 flex-col gap-2.5 border-secondary px-5 py-4 text-left not-last:border-b @2xl:not-last:border-r @2xl:not-last:border-b-0";
  return onClick ? (
    <button type="button" onClick={onClick} className={cx(cls, "transition-colors hover:bg-secondary")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
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
    <div className={cx("flex max-w-3xl flex-col gap-8 pt-6 pb-12", pad)}>
      <SettingsSection title="What it's called">
        <Input
          size="md"
          label="Name"
          placeholder="Staff meeting, weekly sync, Practice…"
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
      </SettingsSection>

      <SettingsSection title="How often">
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
      </SettingsSection>

      <SettingsSection
        title="Standing agenda"
        note="Every occurrence gets these sections, in this order. Give one a tag and anything placed in it is labelled automatically — that's what keeps coverage honest without tagging by hand."
      >
        <CurriculumEditor
          slots={meeting.curriculum ?? []}
          onChange={(next) => setCurriculum(meeting.id, next)}
        />
      </SettingsSection>

      <SettingsSection
        title="Tags"
        note="Shared across every meeting — renaming one here renames it everywhere."
      >
        <TagManager />
      </SettingsSection>

      <SettingsSection title="Where the notes live">
        <TrackerLink meetingId={meeting.id} />
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        note={
          sessionCount > 0
            ? `This meeting has ${sessionCount} write-up${sessionCount === 1 ? "" : "s"}. Consider switching it to As needed instead — history is worth keeping even when the rhythm stops.`
            : "Nothing has been logged against this meeting yet."
        }
      >
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-9 items-center self-start rounded-[9px] border border-cond-critical/40 px-3.5 text-[13px] font-semibold text-cond-critical-ink transition-colors hover:bg-cond-critical-soft"
        >
          Delete “{title}”
        </button>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="eyebrow">{title}</h2>
        {note && <p className="max-w-[60ch] text-[13px] leading-5 text-tertiary">{note}</p>}
      </div>
      {children}
    </section>
  );
}
