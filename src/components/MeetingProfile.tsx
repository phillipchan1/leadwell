import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { refreshShared, useStore } from "../store/useStore";
import { ShareSheet } from "./sharing/ShareSheet";
import { sharedWithLabel, sharesFor } from "../lib/shares";
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
import { startMeeting } from "../lib/liveMeeting";
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
import { Play, Users01 } from "@untitledui/icons";
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
  const allShares = useStore((s) => s.shares);
  const shares = sharesFor(allShares, meeting.id);
  const [sharing, setSharing] = useState(false);

  // Someone else can be adding to this agenda right now. Fold their changes in
  // sooner than the background refresh would.
  const shared = shares.length > 0;
  useEffect(() => {
    if (!shared) return;
    refreshShared();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshShared();
    }, 15_000);
    return () => clearInterval(t);
  }, [shared, meeting.id]);

  /* On the five-mode contract (see lib/entityModes). A meeting carries four
     of the five: Agenda is its `now`, Plan ahead its `meetings`, Write-ups
     its `notes`, and Settings its `profile`. */
  const mode = entityModeFor("meeting", section);
  const focus = density === "focus";
  const pad = focus ? "px-4 sm:px-8" : "px-4 sm:px-6";
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  // Escape closes the open week. Only the week: with none open there's nothing
  // here to answer, and the next one down the stack — the meeting, from
  // EntityChrome — closes. Registering only while a week is open is what keeps
  // it from ever being the one that closes the meeting.
  useDismiss(() => setSelectedSlotKey(null), selectedSlotKey !== null);

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

  const start = (slot: Slot) => {
    const id = ensureSessionId(meeting.id, slot, sessions, addSession);
    startMeeting(id);
    openSession(id);
  };

  // The button already sits on the meeting's page; "today's meeting" was
  // the page title said again.
  const startLabel = next
    ? daysBetween(today, next.slot.date) === 0
      ? "Start"
      : `Start ${weekName(next.slot.date)}`
    : null;

  /* One primary button. Share and a one-off date are things you do rarely,
     so they're quiet icons beside it, words on hover. */
  const actions = (
    <>
      <button
        type="button"
        onClick={() => setSharing(true)}
        aria-label={shared ? `Shared with ${sharedWithLabel(shares)}` : "Share"}
        title={shared ? `Visible to ${sharedWithLabel(shares)}` : "Share"}
        className={cx(
          "inline-flex h-9 shrink-0 items-center justify-center rounded-[9px] text-tertiary hover:bg-secondary hover:text-secondary touch:min-h-11",
          shared ? "px-1.5" : "w-9 touch:w-11"
        )}
      >
        {shared ? (
          <span className="flex">
            {shares.slice(0, 3).map((sh, i) => (
              <Avatar
                key={sh.id}
                name={sh.name ?? sh.email}
                size={24}
                className={cx("ring-2 ring-[var(--color-bg-primary)]", i > 0 && "-ml-2")}
              />
            ))}
          </span>
        ) : (
          <Users01 aria-hidden className="size-[18px]" />
        )}
      </button>
      <AddOneOff
        iconOnly
        onAdd={(date) => showWeek(`s:${addExtraOccurrence(meeting.id, date)}`)}
      />
      {next && startLabel && (
        <button
          type="button"
          onClick={() => start(next.slot)}
          className="ml-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-[9px] bg-teal-600 px-4 text-[13px] font-semibold text-white shadow-xs hover:bg-teal-700 touch:min-h-11 dark:bg-teal-500 dark:text-stone-950 dark:hover:bg-teal-400"
        >
          <Play aria-hidden className="size-3.5" />
          {startLabel}
        </button>
      )}
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-primary">
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
                {/* Convening is the norm; only the exception is worth a word. */}
                {meeting.role === "attend" && (
                  <span className="whitespace-nowrap">
                    <span aria-hidden className="mr-2 text-quaternary">·</span>
                    you attend
                  </span>
                )}
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

      <EntityModeTabs
        subject="meeting"
        mode={mode}
        onMode={(m) => setSection(modeSection(m, "meeting"))}
        counts={{ meetings: openCount, notes: sessionCount }}
      />

      <div className="pane-scroll relative">
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

      {sharing && <ShareSheet meeting={meeting} onClose={() => setSharing(false)} />}

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
    </div>
  );
}

/**
 * The three things worth knowing before you plan — is the rhythm holding,
 * what's on the next one, how many ideas are waiting — as one quiet line
 * under the title. They used to be three boxed cards with a label each, which
 * gave a status line the weight of the page's content. Which sections keep
 * getting skipped is the Plan ahead board's job; it shows it week by week.
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
  const nextWeek = next ? weeks.find((w) => !w.slot.past && w.slot.date === next.date) : undefined;
  const filledIn = (slotId: string) =>
    Boolean(nextWeek?.cells.some((c) => c.slotId === slotId && c.topics.length > 0));
  const planned = curriculum.filter((s) => filledIn(s.id)).length;
  const topicCount = nextWeek?.topics.length ?? 0;
  const when = formatCountdown(reading);

  const item = "inline-flex items-center gap-2 rounded-md whitespace-nowrap transition-colors hover:text-primary";

  return (
    // On a phone the plan is the point; the rhythm rides under the title.
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13.5px] text-tertiary max-md:hidden">
      <button type="button" onClick={onRhythm} className={item} title="Rhythm and schedule">
        <RhythmRing reading={reading} size={18} />
        <span className={cx("font-semibold", STATE_TEXT[reading.state])}>
          {when.charAt(0).toUpperCase() + when.slice(1)} · {STATE_LABEL[reading.state]}
        </span>
        {reading.lastMet && (
          <span>last met {fmt(reading.lastMet, { month: "short", day: "numeric" })}</span>
        )}
      </button>

      {next ? (
        <button type="button" onClick={() => onNext(next)} className={item} title="Open the agenda">
          {curriculum.length > 0 ? (
            <>
              <span className="flex w-14 gap-0.5" aria-hidden>
                {curriculum.map((s) => (
                  <span
                    key={s.id}
                    style={{ flexGrow: s.minutes || 1 }}
                    className={cx(
                      "h-1.5 basis-0 rounded-full transition-colors duration-300",
                      filledIn(s.id) ? slotDotClass(curriculum, s.id, tags) : "bg-quaternary"
                    )}
                  />
                ))}
              </span>
              {planned} of {curriculum.length} sections planned
            </>
          ) : topicCount ? (
            `${topicCount} topic${topicCount === 1 ? "" : "s"} planned`
          ) : (
            "Nothing planned yet"
          )}
        </button>
      ) : (
        <span>Nothing coming up</span>
      )}

      {ideas > 0 && (
        <span className="whitespace-nowrap">
          {ideas} idea{ideas === 1 ? "" : "s"} waiting
        </span>
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
