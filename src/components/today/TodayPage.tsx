import { useMemo } from "react";
import { useStore } from "@/store/useStore";
import { HEALTH_COLOR, HEALTH_LABEL, HEALTH_LEVELS } from "@/lib/health";
import {
  RHYTHM_LABEL,
  STATE_LABEL,
  todayISO,
  type Check,
  type CheckFix,
} from "@/lib/readiness";
import {
  buildToday,
  firstName,
  friendlyDates,
  greeting,
  summaryLine,
  type MeetingRow,
  type Subject,
} from "@/lib/today";
import { shortSincePrayed } from "@/lib/prayer";
import { nextArcSteps, stepTag } from "@/lib/arcs";
import { ensureSessionId, plannedSlots } from "@/lib/topics";
import { startMeeting } from "@/lib/liveMeeting";
import { Play } from "@untitledui/icons";
import type { Arc, ArcStep, TrackedMeeting } from "@/types";
import { Avatar } from "../Avatar";
import { YourTeams } from "./YourTeams";
import { HealthMeter, PrayerFlame, RhythmRing, STATE_TEXT } from "../brand/glyphs";
import { cx } from "@/utils/cx";

/*
 * Today — the front door. It answers "what needs me?" and nothing else: the
 * one next move, the week ahead, ideas waiting for a home, who you're
 * carrying, how the people you lead are doing, and anyone with no decision
 * yet. Every row is a door to where the work actually happens.
 */

const weekdayLong = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: "UTC",
  });

const dayParts = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).toUpperCase(),
    day: d.getUTCDate(),
  };
};

const FIX_ACTION: Record<CheckFix, string> = {
  book: "Book or log it",
  writeUp: "Write it up",
  agenda: "Add a topic",
  commitments: "Deal with what's due",
};

export function TodayPage() {
  const me = useStore((s) => s.me);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const scopeId = useStore((s) => s.treeDomainId);
  const domains = useStore((s) => s.domains);

  const today = todayISO();
  const model = useMemo(
    () => buildToday({ people, teams, managers, meetings, sessions, topics }, scopeId, today),
    [people, teams, managers, meetings, sessions, topics, scopeId, today]
  );
  const scope = domains.find((d) => d.id === scopeId);
  const now = new Date();
  const dateLine = now
    .toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  return (
    <div className="px-4 pt-6 pb-16 sm:px-8 lg:px-12 lg:pt-11">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-8 lg:gap-9">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <span className="font-mono text-[12px] tracking-[0.04em] text-quaternary">
              {dateLine}
              {scope && (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block size-2 rounded-[2px]" style={{ backgroundColor: scope.color }} aria-hidden="true" />
                    {scope.name.toUpperCase()}
                  </span>
                </>
              )}
            </span>
            <h1 className="font-serif text-[34px] leading-[40px] font-[450] tracking-[-0.01em] text-balance sm:text-[44px] sm:leading-[50px]">
              {greeting(now)}
              {me.name ? `, ${firstName(me.name)}` : ""}.
            </h1>
            <p className="max-w-[560px] text-[15.5px] leading-[23px] text-secondary">
              {summaryLine(model, weekdayLong)}
            </p>
          </div>
          <dl className="flex gap-6 pb-1">
            <Stat value={`${model.readyThisWeek}`} of={model.thisWeek.length} label="ready this week" />
            <Stat value={`${model.drifting.length}`} label="drifting" tone={model.drifting.length ? "critical" : undefined} />
            <Stat value={`${model.undecided.length}`} label="undecided" />
          </dl>
        </header>

        <div className="flex flex-wrap items-start gap-7">
          <div className="flex min-w-0 flex-[1.75_1_520px] flex-col gap-7">
            {model.nextMove ? <NextMove row={model.nextMove} /> : <AllClear />}
            <ComingUp rows={model.thisWeek} nextWeek={model.nextWeek} />
            <YourTeams scopeId={scopeId} />
            <IdeasWaiting ideas={model.ideas} />
          </div>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
            <SharedWithYou />
            <Carrying rows={model.carrying} />
            <HowTheyreDoing health={model.health} />
            <Undecided subjects={model.undecided} />
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  of,
  label,
  tone,
}: {
  value: string;
  of?: number;
  label: string;
  tone?: "critical";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dd className={cx("order-1 font-mono text-[22px] font-medium tabular-nums", tone === "critical" && "text-cond-critical-ink")}>
        {value}
        {of !== undefined && <span className="text-quaternary">/{of}</span>}
      </dd>
      <dt className="order-2 text-[12px] text-quaternary">{label}</dt>
    </div>
  );
}

// ── Doors into the rest of the app ─────────────────────────────────────────

function useOpen() {
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);
  return (s: Pick<Subject, "kind" | "id">, section?: string) =>
    s.kind === "person"
      ? selectPerson(s.id, section)
      : s.kind === "team"
        ? selectTeam(s.id, section)
        : selectManager(s.id, section);
}

/** "@sarah" — the capture grammar's handle for a meeting. */
function mentionFor(row: MeetingRow): string {
  const word = (row.meeting.name ?? row.subject?.name ?? row.title).split(/\s+/)[0] ?? "";
  return `@${word.toLowerCase().replace(/[^\w-]/g, "")} `;
}

function useFix() {
  const open = useOpen();
  const openSession = useStore((s) => s.openSession);
  const openModal = useStore((s) => s.openModal);
  const selectMeeting = useStore((s) => s.selectMeeting);
  return (row: MeetingRow, check: Check | undefined) => {
    if (!check) {
      selectMeeting(row.meeting.id);
      return;
    }
    if (check.fix === "writeUp" && check.sessionId) openSession(check.sessionId);
    else if (check.fix === "agenda") openModal({ kind: "capture", draft: mentionFor(row) });
    else if (row.subject) open(row.subject, "meetings");
    else selectMeeting(row.meeting.id);
  };
}

// ── The next move ──────────────────────────────────────────────────────────

/** What each live arc puts on a meeting's next occurrence. */
function useArcSteps() {
  const arcs = useStore((s) => s.arcs);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  return (meeting: TrackedMeeting) => nextArcSteps(arcs, meeting, sessions, topics);
}

function NextMove({ row }: { row: MeetingRow }) {
  const arcSteps = useArcSteps();
  const fix = useFix();
  const open = useOpen();
  const r = row.reading;
  const check = r.checks.find((c) => !c.done);
  const subject = row.subject;
  const who = subject?.name ?? row.title;

  const headline =
    r.state === "drifting"
      ? subject?.kind === "person" || subject?.kind === "manager"
        ? `Book a time with ${who}.`
        : `Get ${row.title} back on the calendar.`
      : r.state === "loose_end"
        ? `Write up the last ${row.title.toLowerCase().startsWith("meeting") ? "meeting" : row.title}.`
        : `Get ready for ${row.title}.`;

  const weeks = r.daysSince !== null ? Math.round(r.daysSince / 7) : null;
  const lastMet = r.lastMet
    ? new Date(`${r.lastMet}T00:00:00Z`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const reading = arcSteps(row.meeting).find((x) => x.step.read);
  const detail = [
    `${RHYTHM_LABEL[row.meeting.rhythm]} rhythm, ${lastMet ? `last met ${lastMet}` : "never met yet"}`,
    check?.detail ? sentence(friendlyDates(check.detail)) : null,
    reading ? readLine(reading.arc, reading.step) : null,
  ]
    .filter(Boolean)
    .join(". ");

  const cold = subject?.prayer ? isCold(subject) : false;

  return (
    <section
      aria-label="Your next move"
      className="flex flex-col gap-[18px] rounded-2xl border border-secondary bg-primary px-5 py-6 sm:px-7"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="eyebrow">Your next move</span>
        <span className={cx("inline-flex items-center gap-1.5 font-mono text-[11.5px] font-medium", STATE_TEXT[r.state])}>
          <RhythmRing reading={r} size={16} />
          {STATE_LABEL[r.state].toUpperCase()}
          {r.state === "drifting" && weeks !== null && weeks >= 2 ? ` · ${weeks} WK` : ""}
        </span>
      </div>
      <div className="flex items-start gap-[18px]">
        {subject && (
          <button type="button" onClick={() => open(subject)} className="shrink-0 rounded-full" aria-label={`Open ${subject.name}`}>
            <Avatar name={subject.name} photo={subject.photo} size={52} />
          </button>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="font-serif text-[24px] leading-[30px] font-[450] text-balance sm:text-[28px] sm:leading-[34px]">
            {headline}
          </h2>
          <p className="text-[14.5px] leading-[22px] text-secondary">
            {detail}.
            {cold && subject && (
              <> You were carrying {subject.kind === "team" ? "them" : firstName(subject.name)} in prayer, and that has gone quiet.</>
            )}
          </p>
        </div>
      </div>
      <div className={cx("flex flex-wrap gap-2.5", subject && "sm:pl-[70px]")}>
        <button
          type="button"
          onClick={() => fix(row, check)}
          className="inline-flex h-10 items-center gap-2.5 rounded-[9px] bg-teal-600 px-4 text-[14px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-teal-700 dark:bg-teal-400 dark:text-stone-950 dark:hover:bg-teal-300"
        >
          {check ? FIX_ACTION[check.fix] : "Open the meeting"}
        </button>
        {cold && subject && (
          <button
            type="button"
            onClick={() => open(subject, "prayer")}
            className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-primary px-3.5 text-[14px] font-semibold text-vesper transition-colors hover:bg-vesper-soft"
          >
            <PrayerFlame state="fresh" size={15} />
            Pray for {subject.kind === "team" ? subject.name : firstName(subject.name)}
          </button>
        )}
        {subject && (
          <button
            type="button"
            onClick={() => open(subject)}
            className="inline-flex h-10 items-center rounded-[9px] px-3 text-[14px] font-medium text-tertiary hover:bg-secondary"
          >
            Open {subject.kind === "team" ? "team" : "profile"}
          </button>
        )}
      </div>
    </section>
  );
}

/** Capitalize an engine detail line so it can start a sentence. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isCold(s: Subject): boolean {
  if (!s.prayer) return false;
  const last = s.prayer.lastPrayedOn ?? s.prayer.since;
  const days = Math.round((Date.parse(todayISO()) - Date.parse(last)) / 86_400_000);
  return days >= 21;
}

function AllClear() {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-primary px-7 py-6">
      <span className="eyebrow">Your next move</span>
      <h2 className="font-serif text-[26px] leading-[32px] font-[450]">Nothing is owed right now.</h2>
      <p className="text-[14.5px] leading-[22px] text-secondary">
        Every meeting you track is ready or resting. A good week to take someone up in prayer, or to
        rate the people you haven't read in a while.
      </p>
    </section>
  );
}

// ── The week ───────────────────────────────────────────────────────────────

/** Into Run for today's occurrence, booking it if the rhythm only expected it. */
function useStartToday() {
  const openSession = useStore((s) => s.openSession);
  const addSession = useStore((s) => s.addSession);
  return (meeting: TrackedMeeting) => {
    const { sessions, topics } = useStore.getState();
    const today = todayISO();
    const slot = plannedSlots(meeting, sessions, topics, today, 2).find((s) => s.date === today) ?? {
      sessionId: null,
      date: today,
      projected: true,
      past: false,
    };
    const id = ensureSessionId(meeting.id, slot, sessions, addSession);
    startMeeting(id);
    openSession(id);
  };
}

function rowAction(row: MeetingRow): { label: string; check?: Check } | null {
  const check = row.reading.checks.find((c) => !c.done);
  if (!check || row.reading.state === "ready" || row.reading.state === "resting") return null;
  return { label: FIX_ACTION[check.fix], check };
}

function ComingUp({ rows, nextWeek }: { rows: MeetingRow[]; nextWeek: MeetingRow[] }) {
  const arcSteps = useArcSteps();
  const arcLines = (meeting: TrackedMeeting) =>
    arcSteps(meeting).map(({ arc, step }) => `${arc.title} · ${stepTag(arc, step)}`);
  const selectMeeting = useStore((s) => s.selectMeeting);
  const setTab = useStore((s) => s.setTab);
  const fix = useFix();
  const startToday = useStartToday();

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] leading-5 font-semibold">Coming up this week</h2>
        <button type="button" onClick={() => setTab("meetings")} className="text-[13px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400">
          All meetings
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-primary px-5 py-5 text-[14px] text-tertiary">
          Nothing on the calendar in the next seven days.
        </p>
      ) : (
        // A container, not the viewport: with a peek open beside Today the
        // column is half as wide as the window says it is.
        <ul className="@container flex flex-col overflow-hidden rounded-[14px] border border-secondary bg-primary">
          {rows.map((row, i) => {
            const r = row.reading;
            const { weekday, day } = dayParts(r.nextDate!);
            const action = rowAction(row);
            return (
              <li
                key={row.meeting.id}
                className={cx(
                  // The action column is fixed so every row's status lines up;
                  // at `auto` each row sized it to its own label.
                  "grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 @min-[560px]:grid-cols-[64px_minmax(0,1fr)_140px_7.5rem] @min-[560px]:px-5",
                  i > 0 && "border-t border-secondary"
                )}
              >
                <span className="flex flex-col font-mono leading-tight">
                  <span className="text-[11px] text-quaternary">{r.projected ? `~${weekday}` : weekday}</span>
                  <span className="text-[20px] font-medium tabular-nums">{day}</span>
                </span>
                <button type="button" onClick={() => selectMeeting(row.meeting.id)} className="flex min-w-0 flex-col gap-0.5 text-left">
                  <span className="truncate font-serif text-[19px] leading-[23px] font-medium hover:underline hover:decoration-1 hover:underline-offset-4">
                    {row.title}
                  </span>
                  {/* Two lines where the row is narrow; one cut-off line hid how
                      much was on the agenda, which is the point of the row. */}
                  <span className="line-clamp-2 text-[13px] text-quaternary @min-[560px]:line-clamp-1">
                    {[
                      row.meeting.subjectKind === "person" ? "1:1" : row.subject?.kind === "team" ? row.subject.name : row.subject?.name,
                      RHYTHM_LABEL[row.meeting.rhythm].toLowerCase(),
                      row.agenda ? `${row.agenda} on the agenda` : "nothing on the agenda",
                      ...arcLines(row.meeting),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span className={cx("hidden items-center gap-2 text-[13px] font-medium @min-[560px]:inline-flex", STATE_TEXT[r.state])}>
                  <RhythmRing reading={r} size={20} />
                  {STATE_LABEL[r.state]}
                </span>
                <span className="justify-self-end">
                  {/* On the day, the only thing left to do is have it. */}
                  {r.daysUntil === 0 ? (
                    <button
                      type="button"
                      onClick={() => startToday(row.meeting)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-teal-600 px-3 text-[13px] font-semibold whitespace-nowrap text-white transition-colors hover:bg-teal-700 touch:min-h-11 dark:bg-teal-500 dark:text-stone-950"
                    >
                      <Play aria-hidden className="size-3" />
                      Start
                    </button>
                  ) : action ? (
                    <button
                      type="button"
                      onClick={() => fix(row, action.check)}
                      className="text-right text-[13px] font-semibold whitespace-nowrap text-teal-700 hover:text-teal-800 dark:text-teal-400"
                    >
                      {action.label}
                    </button>
                  ) : (
                    <span className="@min-[560px]:hidden">
                      <RhythmRing reading={r} size={20} label={STATE_LABEL[r.state]} />
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {nextWeek.length > 0 && (
        <p className="px-0.5 text-[13px] text-quaternary">
          Next week:{" "}
          {nextWeek.map((row, i) => {
            const { weekday, day } = dayParts(row.reading.nextDate!);
            return (
              <span key={row.meeting.id}>
                {i > 0 && " · "}
                <button type="button" onClick={() => selectMeeting(row.meeting.id)} className="font-serif text-[15px] text-secondary hover:underline">
                  {row.title}
                </button>{" "}
                <span className="font-mono text-[11.5px]">
                  {row.reading.projected ? "~" : ""}
                  {weekday} {day}
                </span>
              </span>
            );
          })}
        </p>
      )}
    </section>
  );
}

// ── Ideas ──────────────────────────────────────────────────────────────────

function IdeasWaiting({ ideas }: { ideas: ReturnType<typeof buildToday>["ideas"] }) {
  const setTab = useStore((s) => s.setTab);
  const tags = useStore((s) => s.tags);
  const meetings = useStore((s) => s.meetings);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const openModal = useStore((s) => s.openModal);
  if (!ideas.count) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary px-5 py-4">
        <p className="text-[14px] text-tertiary">No ideas waiting. Anything you capture lands in Ideas until it has a meeting.</p>
        <button type="button" onClick={() => openModal({ kind: "capture" })} className="text-[13px] font-semibold text-teal-700 dark:text-teal-400">
          Capture one
        </button>
      </section>
    );
  }
  const meetingName = (id?: string) => {
    const m = meetings.find((x) => x.id === id);
    if (!m) return null;
    const pool = m.subjectKind === "person" ? people : m.subjectKind === "team" ? teams : managers;
    return m.name ?? pool.find((x) => x.id === m.subjectId)?.name ?? null;
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] leading-5 font-semibold">
          Ideas waiting for a home
          <span className="ml-2 font-mono text-[12px] font-medium text-quaternary">
            {ideas.count}
            {ideas.aging ? ` · ${ideas.aging} aging` : ""}
          </span>
        </h2>
        <button type="button" onClick={() => setTab("ideas")} className="text-[13px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400">
          Open Ideas
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
        {ideas.waiting.map((t) => {
          const tag = tags.find((x) => t.tagIds?.includes(x.id));
          const home = meetingName(t.meetingId);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab("ideas")}
              className="flex flex-col gap-3 rounded-xl border border-secondary bg-primary px-4 py-3.5 text-left transition-colors hover:border-primary"
            >
              <span className="text-[14px] leading-5 font-medium">{t.text}</span>
              <span className="mt-auto flex items-center justify-between gap-2 text-[12px] text-quaternary">
                {t.carried >= 2 ? (
                  <span className="inline-flex h-5 items-center rounded-[5px] bg-gilt-soft px-1.5 font-mono text-[10.5px] text-gilt-ink">
                    carried {t.carried}×
                  </span>
                ) : tag ? (
                  <span>{tag.label}</span>
                ) : (
                  <span>No tag</span>
                )}
                <span className={cx(home ? "text-secondary" : "font-semibold text-teal-700 dark:text-teal-400")}>
                  {home ? `For ${home}` : "Needs a meeting"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Carrying ───────────────────────────────────────────────────────────────

function Carrying({ rows }: { rows: ReturnType<typeof buildToday>["carrying"] }) {
  const setTab = useStore((s) => s.setTab);
  const open = useOpen();
  const cold = rows.filter((r) => r.state === "cold").length;

  return (
    <section aria-label="Carrying in prayer" className="relative flex flex-col gap-4 rounded-2xl bg-leather px-[22px] pt-[22px] pb-5 text-leather-fg">
      <svg className="absolute -top-0.5 right-6" width="14" height="30" viewBox="0 0 14 30" aria-hidden="true">
        <path d="M0 0h14v30l-7-6-7 6z" fill="#6A51A4" />
      </svg>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11px] font-semibold tracking-[0.1em] text-vesper-glow uppercase">Carrying</span>
        <span className="font-mono text-[11.5px] text-leather-ink">
          {rows.length}
          {cold ? ` · ${cold} gone quiet` : ""}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="font-serif text-[16px] leading-6 text-leather-ink italic">
          You aren't carrying anyone right now. Taking someone up is one tap from their profile.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.slice(0, 4).map((r, i) => (
            <li key={`${r.kind}:${r.id}`} className={cx("py-3", i > 0 && "border-t border-leather-line", i === 0 && "pt-0")}>
              <button type="button" onClick={() => open(r, "prayer")} className="flex w-full flex-col gap-1 text-left">
                <span className="flex items-center gap-2">
                  <PrayerFlame state={r.state} size={14} className="[&_path]:fill-vesper-glow [&_path]:stroke-vesper-glow" />
                  <span className="truncate font-serif text-[17px] font-medium">{r.name}</span>
                  <span className={cx("ml-auto shrink-0 font-mono text-[11px]", r.state === "cold" ? "text-teal-400" : "text-leather-ink")}>
                    {r.state === "cold" ? `QUIET · ${r.silence ?? "?"}D` : shortSincePrayed(r.prayer).toUpperCase()}
                  </span>
                </span>
                {r.prayer?.focus && (
                  <span className="pl-[22px] font-serif text-[15px] leading-[21px] text-leather-ink italic">{r.prayer.focus}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setTab("prayer")}
        className="self-start rounded-[9px] bg-[#6A51A4] px-3.5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#5d4794]"
      >
        {rows.length ? "Begin a time of prayer" : "Open Prayer"}
      </button>
    </section>
  );
}

// ── Health ─────────────────────────────────────────────────────────────────

function HowTheyreDoing({ health }: { health: ReturnType<typeof buildToday>["health"] }) {
  const open = useOpen();
  const setTab = useStore((s) => s.setTab);
  const setHealthScan = useStore((s) => s.setHealthScan);
  if (!health.total) return null;
  const segments = [...HEALTH_LEVELS.map((l) => ({ id: l, n: health.counts[l], color: HEALTH_COLOR[l] })), { id: "unrated" as const, n: health.counts.unrated, color: "var(--color-meter-off)" }].filter((s) => s.n > 0);

  return (
    <section className="flex flex-col gap-3.5 rounded-2xl border border-secondary bg-primary px-[22px] py-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">How they're doing</h2>
        <span className="text-[12px] text-quaternary">your read · {health.rated} of {health.total}</span>
      </div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segments.map((s) => `${s.n} ${s.id === "unrated" ? "not rated" : HEALTH_LABEL[s.id]}`).join(", ")}>
        {segments.map((s) => (
          <i key={s.id} style={{ flex: s.n, backgroundColor: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-quaternary">
        {segments.map((s) => (
          <span key={s.id}>
            <b className="font-mono font-medium text-primary">{s.n}</b> {s.id === "unrated" ? "not rated" : HEALTH_LABEL[s.id].toLowerCase()}
          </span>
        ))}
      </div>
      {health.weakest.length > 0 && (
        <ul className="flex flex-col border-t border-secondary">
          {health.weakest.slice(0, 3).map((s) => (
            <li key={`${s.kind}:${s.id}`} className="border-b border-secondary last:border-b-0">
              <button type="button" onClick={() => open(s)} className="flex w-full items-center gap-2.5 py-2.5 text-left">
                <HealthMeter level={s.health?.level} label={s.health ? HEALTH_LABEL[s.health.level] : undefined} />
                {/* The name keeps its width and the note takes the rest; with
                    the note capped at 45% it cut off beside empty space. */}
                <span className="max-w-[55%] shrink-0 truncate font-serif text-[16px]">{s.name}</span>
                <span className="min-w-0 flex-1 truncate text-right text-[12px] text-quaternary">{s.health?.note ?? s.role ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => {
          setHealthScan(["watch", "strained", "critical"]);
          setTab("table");
        }}
        className="self-start text-[13px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400"
      >
        See every weak spot
      </button>
    </section>
  );
}

// ── Undecided ──────────────────────────────────────────────────────────────

function Undecided({ subjects }: { subjects: Subject[] }) {
  const openModal = useStore((s) => s.openModal);
  if (!subjects.length) return null;
  const shown = subjects.slice(0, 3);
  const rest = subjects.length - shown.length;
  const weak = subjects.find((s) => s.health && ["strained", "critical"].includes(s.health.level));

  return (
    <section className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-primary px-5 py-[18px]">
      <h2 className="text-[15px] font-semibold">Nobody falls off the edge</h2>
      <p className="text-[13.5px] leading-5 text-secondary">
        {shown.map((s, i) => (
          <span key={`${s.kind}:${s.id}`}>
            {i > 0 && (i === shown.length - 1 && rest === 0 ? " and " : ", ")}
            <span className="font-serif text-[15.5px] text-primary">{s.name}</span>
          </span>
        ))}
        {rest > 0 && <> and {rest} more</>} {subjects.length === 1 ? "has" : "have"} no meeting decision yet.
        {weak && <> {firstName(weak.name)} is {weak.health!.level}.</>}
      </p>
      <button
        type="button"
        onClick={() => openModal({ kind: "triage" })}
        className="self-start rounded-lg border border-primary bg-primary px-3 py-2 text-[13px] font-medium hover:bg-secondary"
      >
        Decide for {subjects.length === 1 ? "them" : subjects.length === 2 ? "both" : `all ${subjects.length}`}
      </button>
    </section>
  );
}

/** Meetings other people run and have shared with me — their agenda, mine to add to. */
function SharedWithYou() {
  const shared = useStore((s) => s.sharedWithMe);
  if (!shared.length) return null;
  return (
    <section aria-label="Shared with you" className="flex flex-col gap-2.5 rounded-2xl border border-secondary bg-primary px-5 py-4">
      <span className="eyebrow">Shared with you</span>
      <ul className="flex flex-col gap-1">
        {shared.map((m) => (
          <li key={m.token}>
            <a
              href={`/with/${m.token}`}
              className="flex items-center gap-2.5 rounded-lg py-1.5 text-[14px] hover:underline hover:decoration-1 hover:underline-offset-4"
            >
              <Avatar name={m.ownerName} size={26} />
              <span className="min-w-0 flex-1 truncate font-serif text-[15px] text-primary">{m.meetingName}</span>
              <span className="shrink-0 text-[12px] text-tertiary">their agenda</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Read Ch. 4 of Crucial Conversations before you meet" / "Read Matthew 5:13–16 for …". */
function readLine(arc: Arc, step: ArcStep): string {
  const tag = stepTag(arc, step);
  if (!tag.startsWith("Step ")) {
    const where = step.read && step.read !== tag ? ` (${step.read})` : "";
    return `Read ${tag} of ${arc.title}${where} before you meet`;
  }
  return `Read ${step.read} for ${arc.title} before you meet`;
}
