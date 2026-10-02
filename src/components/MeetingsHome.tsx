import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  RHYTHM_LABEL,
  STATE_COLOR,
  STATE_LABEL,
  addDays,
  daysBetween,
  isBehind,
  meetingSubjectName,
  meetingTitle,
  readinessOf,
  todayISO,
  type Readiness,
} from "../lib/readiness";
import { allLooseTopics, curriculumOf, effectiveSlotId, slotDotClass } from "../lib/topics";
import {
  horizon,
  occurrencesInRange,
  openFollowUpsFor,
  weekDays,
  weekStart,
  type Occurrence,
} from "../lib/week";
import { MeetingsTable } from "./MeetingsTable";
import { CopyAgendaButton } from "./CopyAgendaButton";
import { TintBadge } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { useShortcut } from "@/hooks/use-shortcut";
import { ChevronLeft, ChevronRight, Plus } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * The Meetings tab, organised around the job rather than the list.
 *
 * The table of every recurring meeting answers "what do I run?", which is a
 * question you ask once. The question a leader with nine standing meetings
 * asks every week is different: *what's this week, and am I ready for all of
 * it* — and, further out, *how far ahead is any of this actually planned?*
 * Those are the first two lenses. The table stays as the third, for the
 * administrative pass.
 */

type Lens = "week" | "horizon" | "all";

const LENSES: { id: Lens; label: string }[] = [
  { id: "week", label: "This week" },
  { id: "horizon", label: "Horizon" },
  { id: "all", label: "All meetings" },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function MeetingsHome() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const lens: Lens = raw === "horizon" || raw === "all" ? raw : "week";
  const roving = useRovingFocus();

  const setLens = (next: Lens) => {
    const p = new URLSearchParams(params);
    if (next === "week") p.delete("view");
    else p.set("view", next);
    if (next !== "week") p.delete("week");
    setParams(p, { replace: true });
  };

  return (
    <div className="scroll-contain min-h-0 flex-1 overflow-y-auto">
      <div
        className={cx(
          "mx-auto flex w-full flex-col gap-4 p-4 sm:p-6",
          // The week reads as one column of agendas; the grid and table want the width.
          lens === "week" && "max-w-3xl sm:px-0"
        )}
      >
        <div
          {...roving.groupProps}
          role="tablist"
          aria-label="Meetings lens"
          className="inline-flex h-9 w-fit items-stretch gap-0.5 self-start rounded-lg bg-tertiary p-0.5 touch:h-auto"
        >
          {LENSES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={lens === l.id}
              {...roving.itemProps(lens === l.id)}
              onClick={() => setLens(l.id)}
              className={cx(
                "rounded-md px-3 text-sm font-medium whitespace-nowrap transition touch:min-h-11",
                lens === l.id
                  ? "bg-primary text-primary shadow-xs"
                  : "text-quaternary hover:text-secondary"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>

        {lens === "week" && <WeekLens />}
        {lens === "horizon" && <HorizonLens />}
        {lens === "all" && <MeetingsTable embedded />}
      </div>
    </div>
  );
}

// ── This week ─────────────────────────────────────────────────────────────

const dayHeading = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function useNames() {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  return useMemo(() => ({ people, teams, managers }), [people, teams, managers]);
}

function WeekLens() {
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const followUps = useStore((s) => s.followUps);
  const selectMeeting = useStore((s) => s.selectMeeting);
  const names = useNames();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const thisWeek = weekStart(today);
  const asked = params.get("week");
  const start = asked && ISO.test(asked) ? weekStart(asked) : thisWeek;
  const end = addDays(start, 6);

  const goWeek = (monday: string) => {
    const p = new URLSearchParams(params);
    if (monday === thisWeek) p.delete("week");
    else p.set("week", monday);
    setParams(p, { replace: true });
  };

  useShortcut(() => goWeek(addDays(start, -7)), {
    chord: "ArrowLeft",
    label: "Previous week",
    group: "Navigation",
  });
  useShortcut(() => goWeek(addDays(start, 7)), {
    chord: "ArrowRight",
    label: "Next week",
    group: "Navigation",
  });

  const occurrences = useMemo(
    () => occurrencesInRange(meetings, sessions, topics, start, end, today),
    [meetings, sessions, topics, start, end, today]
  );
  const readings = useMemo(
    () =>
      new Map(
        meetings.map((m) => [m.id, readinessOf(m, { meetings, sessions, topics }, today)])
      ),
    [meetings, sessions, topics, today]
  );

  const live = occurrences.filter((o) => !o.skipped);
  const upcoming = live.filter((o) => o.slot.date >= today);
  const unplanned = upcoming.filter((o) => o.topics.length === 0);
  const planned = live.reduce((n, o) => n + o.topics.length, 0);
  const owed = new Set(live.map((o) => `${o.meeting.subjectKind}:${o.meeting.subjectId}`));
  const openCommitments = followUps.filter(
    (f) => f.status === "open" && owed.has(`${f.subjectKind}:${f.subjectId}`)
  ).length;

  // Only the week you're living in gets the "needs you" pass; a week in
  // March doesn't owe anything yet.
  const isCurrent = start === thisWeek;
  const attention = isCurrent
    ? meetings
        .map((m) => ({ meeting: m, r: readings.get(m.id)! }))
        .filter(({ r }) => r.state === "drifting" || r.state === "loose_end")
    : [];
  const looseCount = isCurrent ? allLooseTopics(topics, sessions, today).length : 0;

  const days = weekDays(occurrences, start).filter(
    (d) => d.occurrences.length > 0 || d.date === today
  );

  const range = `${shortDate(start)} – ${shortDate(end)}`;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="-ml-2 flex items-center gap-1">
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={ChevronLeft}
            tooltip="Previous week (←)"
            onClick={() => goWeek(addDays(start, -7))}
          />
          <h2 className="min-w-0 px-1 text-lg font-semibold tracking-tight text-primary">
            {isCurrent ? "This week" : start === addDays(thisWeek, 7) ? "Next week" : start === addDays(thisWeek, -7) ? "Last week" : "Week of " + shortDate(start)}
            <span className="block text-sm font-normal whitespace-nowrap text-quaternary sm:ml-2 sm:inline">
              {range}
            </span>
          </h2>
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={ChevronRight}
            tooltip="Next week (→)"
            onClick={() => goWeek(addDays(start, 7))}
          />
          {!isCurrent && (
            <Button size="sm" color="link-color" className="ml-2" onClick={() => goWeek(thisWeek)}>
              Back to this week
            </Button>
          )}
        </div>
      </div>

      <p className="-mt-2 text-sm text-tertiary">
        {live.length === 0 ? (
          "Nothing on the calendar this week."
        ) : (
          <>
            {live.length} meeting{live.length === 1 ? "" : "s"} · {planned} topic
            {planned === 1 ? "" : "s"} planned
            {unplanned.length > 0 && (
              <>
                {" · "}
                <span className="font-medium text-amber-700 dark:text-amber-500">
                  {unplanned.length} without an agenda yet
                </span>
              </>
            )}
            {openCommitments > 0 && (
              <>
                {" · "}
                {openCommitments} commitment{openCommitments === 1 ? "" : "s"} open
              </>
            )}
          </>
        )}
      </p>

      {(attention.length > 0 || looseCount > 0) && (
        <section className="rounded-xl border border-red-200 bg-red-50/40 dark:border-red-900/50 dark:bg-red-950/15">
          <p className="border-b border-red-100 px-4 py-2 text-caption font-semibold tracking-wide text-red-800 uppercase dark:border-red-900/40 dark:text-red-400">
            Needs you
          </p>
          <ul className="divide-y divide-red-100 dark:divide-red-900/40">
            {attention.map(({ meeting, r }) => (
              <li key={meeting.id}>
                <button
                  type="button"
                  onClick={() => selectMeeting(meeting.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-red-50 touch:min-h-11 dark:hover:bg-red-950/30"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary">
                      {meetingTitle(meeting, meetingSubjectName(meeting, names))}
                    </span>
                    <span className="block truncate text-caption text-tertiary">{r.headline}</span>
                  </span>
                  <TintBadge color={STATE_COLOR[r.state]}>{STATE_LABEL[r.state]}</TintBadge>
                </button>
              </li>
            ))}
            {looseCount > 0 && attention.every(({ r }) => r.state !== "loose_end") && (
              <li className="px-4 py-2.5 text-sm text-tertiary">
                {looseCount} topic{looseCount === 1 ? " was" : "s were"} planned for a meeting
                that's passed and never ticked off.
              </li>
            )}
          </ul>
        </section>
      )}

      {days.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary px-4 py-10 text-center text-sm text-quaternary">
          No meetings land this week.
          {meetings.length === 0 && " Add the ones you run from All meetings."}
        </div>
      ) : (
        days.map((day) => (
          <section key={day.date} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-2 px-1">
              <span
                className={cx(
                  "text-sm font-semibold",
                  day.date === today ? "text-teal-700 dark:text-teal-400" : day.date < today ? "text-quaternary" : "text-secondary"
                )}
              >
                {dayHeading(day.date)}
              </span>
              {day.date === today && (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-caption font-medium text-teal-800 dark:bg-teal-950/60 dark:text-teal-400">
                  Today
                </span>
              )}
              {day.date === addDays(today, 1) && (
                <span className="text-caption text-quaternary">Tomorrow</span>
              )}
            </h3>
            {day.occurrences.length === 0 ? (
              <p className="px-1 text-sm text-quaternary">Nothing on today.</p>
            ) : (
              day.occurrences.map((o) => (
                <OccurrenceCard
                  key={`${o.meeting.id}:${o.slot.date}`}
                  occurrence={o}
                  readiness={readings.get(o.meeting.id)!}
                  names={names}
                />
              ))
            )}
          </section>
        ))
      )}
    </div>
  );
}

/**
 * One meeting on one day, with everything you'd want before walking in:
 * what's still owed from last time, what's planned, and the two moves that
 * matter — plan it properly, or send the agenda out.
 */
function OccurrenceCard({
  occurrence: o,
  readiness,
  names,
}: {
  occurrence: Occurrence;
  readiness: Readiness;
  names: ReturnType<typeof useNames>;
}) {
  const followUps = useStore((s) => s.followUps);
  const toggleFollowUp = useStore((s) => s.toggleFollowUp);
  const coverTopic = useStore((s) => s.coverTopic);
  const addTopic = useStore((s) => s.addTopic);
  const addSession = useStore((s) => s.addSession);
  const planOccurrence = useStore((s) => s.planOccurrence);
  const openSession = useStore((s) => s.openSession);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const today = todayISO();

  const { meeting, slot } = o;
  const subjectName = meetingSubjectName(meeting, names);
  const title = meetingTitle(meeting, subjectName);
  const past = slot.date < today;
  const isNext = readiness.nextDate === slot.date;
  const owed = past ? [] : openFollowUpsFor(followUps, meeting);
  const covered = o.topics.filter((t) => t.status !== "open").length;
  const daysOut = daysBetween(today, slot.date);
  // An empty agenda only reads as a problem once prep would have started.
  const emptyMatters = !past && o.topics.length === 0 && (isNext ? readiness.windowOpen : daysOut <= 2);
  const accent = o.skipped
    ? "transparent"
    : isNext && isBehind(readiness.state)
      ? STATE_COLOR[readiness.state]
      : emptyMatters
        ? STATE_COLOR.prep_due
        : "transparent";

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const sessionId = slot.sessionId ?? addSession({ meetingId: meeting.id, date: slot.date });
    addTopic(meeting.id, text, { sessionId });
    setDraft("");
  };

  const sub = [
    subjectName && !title.includes(subjectName) ? `with ${subjectName}` : null,
    RHYTHM_LABEL[meeting.rhythm],
    meeting.role === "attend" ? "I attend" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (o.skipped) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-secondary px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-quaternary line-through">{title}</span>
        <span className="text-caption text-quaternary">Skipped this week</span>
      </div>
    );
  }

  return (
    <article
      className="overflow-hidden rounded-xl border border-secondary bg-primary shadow-xs"
      style={{ boxShadow: accent !== "transparent" ? `inset 3px 0 0 ${accent}` : undefined }}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3">
        <button
          type="button"
          onClick={() => planOccurrence(meeting.id, slot.date, slot.sessionId)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-md font-semibold text-primary hover:underline">
            {title}
          </span>
          <span className="block truncate text-caption text-quaternary">
            {sub}
            {slot.projected && " · projected"}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {isNext && !past && (
            <TintBadge color={STATE_COLOR[readiness.state]}>{STATE_LABEL[readiness.state]}</TintBadge>
          )}
          {past && o.topics.length > 0 && (
            <span className="text-caption tabular-nums text-quaternary">
              {covered}/{o.topics.length} covered
            </span>
          )}
        </div>
      </header>

      <div className="px-4 pt-2 pb-3">
        {owed.length > 0 && (
          <div className="mb-2">
            <p className="text-caption font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-400">
              Since last time
            </p>
            <ul className="mt-1">
              {owed.slice(0, 4).map((f) => (
                <li key={f.id} className="flex items-start gap-2 py-0.5">
                  <Checkbox
                    size="sm"
                    aria-label={`Done: "${f.text}"`}
                    isSelected={false}
                    onChange={() => toggleFollowUp(f.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 text-sm text-secondary">{f.text}</span>
                </li>
              ))}
            </ul>
            {owed.length > 4 && (
              <p className="pl-6 text-caption text-quaternary">+{owed.length - 4} more</p>
            )}
          </div>
        )}

        {o.topics.length > 0 ? (
          <AgendaList meeting={meeting} topics={o.topics} onCover={coverTopic} />
        ) : (
          <p
            className={cx(
              "text-sm",
              emptyMatters ? "font-medium text-amber-700 dark:text-amber-500" : "text-quaternary"
            )}
          >
            {past ? "Nothing was planned." : "No agenda yet."}
          </p>
        )}

        {adding && (
          <form onSubmit={add} className="mt-2">
            <Input
              size="sm"
              autoFocus
              placeholder="Add a topic to this one…"
              aria-label={`Add a topic to ${title} on ${shortDate(slot.date)}`}
              value={draft}
              onChange={setDraft}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(false);
                  setDraft("");
                }
              }}
              onBlur={() => {
                if (!draft.trim()) setAdding(false);
              }}
            />
          </form>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-secondary bg-secondary/40 px-4 py-2">
        <Button
          size="sm"
          color="link-color"
          onClick={() => planOccurrence(meeting.id, slot.date, slot.sessionId)}
        >
          {past ? "Open" : "Plan it"}
        </Button>
        {!past && !adding && (
          <Button size="sm" color="link-gray" iconLeading={Plus} onClick={() => setAdding(true)}>
            Add topic
          </Button>
        )}
        {past && slot.sessionId && (
          <Button size="sm" color="link-gray" onClick={() => openSession(slot.sessionId!)}>
            Write-up
          </Button>
        )}
        <span className="ml-auto flex items-center">
          <CopyAgendaButton meeting={meeting} sessionId={slot.sessionId} date={slot.date} />
        </span>
      </footer>
    </article>
  );
}

/** The occurrence's topics in running order, a dot for the row each sits in. */
function AgendaList({
  meeting,
  topics,
  onCover,
}: {
  meeting: TrackedMeeting;
  topics: Topic[];
  onCover: (id: string, covered: boolean) => void;
}) {
  const curriculum = curriculumOf(meeting);
  const rank = (t: Topic) => {
    const slot = effectiveSlotId(t, curriculum);
    const i = curriculum.findIndex((c) => c.id === slot);
    return i < 0 ? curriculum.length : i;
  };
  const ordered = [...topics].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  return (
    <ul>
      {ordered.map((t) => {
        const slotId = effectiveSlotId(t, curriculum);
        const label = curriculum.find((c) => c.id === slotId)?.label;
        const done = t.status !== "open";
        return (
          <li key={t.id} className="flex items-start gap-2 py-0.5">
            <Checkbox
              size="sm"
              aria-label={`Covered "${t.text}"`}
              isSelected={done}
              onChange={(v) => onCover(t.id, v)}
              className="mt-0.5 shrink-0"
            />
            <span
              className={cx(
                "min-w-0 flex-1 text-sm",
                done ? "text-quaternary line-through" : "text-secondary"
              )}
            >
              {t.text}
              {t.carried > 1 && !done && (
                <span className="ml-1.5 text-caption text-amber-700 dark:text-amber-500">
                  pushed {t.carried}×
                </span>
              )}
            </span>
            {label && (
              <span className="mt-0.5 flex shrink-0 items-center gap-1 text-caption text-quaternary">
                <span className={cx("size-1.5 rounded-full", slotDotClass(curriculum, slotId))} />
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Horizon ───────────────────────────────────────────────────────────────

const HORIZON_OPTIONS = [
  { label: "Next 8 weeks", value: "8" },
  { label: "Next 12 weeks", value: "12" },
  { label: "Next 6 months", value: "26" },
];

/**
 * Every meeting against the weeks ahead — the roadmap lens.
 *
 * Each cell is one occurrence. Filled means something is already planned into
 * it; hollow means it's still open. Reading across a row tells you how far
 * out one meeting is thought through; reading down a column tells you whether
 * a given week is going anywhere. Click any cell to plan that occurrence.
 */
function HorizonLens() {
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const planOccurrence = useStore((s) => s.planOccurrence);
  const names = useNames();
  const [weeks, setWeeks] = useState(12);
  const today = todayISO();

  const data = useMemo(
    () => horizon(meetings, sessions, topics, weeks, today),
    [meetings, sessions, topics, weeks, today]
  );
  const pct = data.total ? Math.round((data.planned / data.total) * 100) : 0;

  // Furthest week with anything planned — "the plan reaches to Nov 9".
  let reach: string | null = null;
  data.rows.forEach((r) =>
    r.weeks.forEach((w, i) => {
      if (w.some((o) => o.topics.length > 0) && (!reach || data.weeks[i] > reach)) reach = data.weeks[i];
    })
  );

  const monthOf = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-primary">How far ahead is it planned?</h2>
          <p className="mt-0.5 text-sm text-tertiary">
            {data.total === 0
              ? "No recurring meetings on the horizon."
              : `${data.planned} of ${data.total} upcoming meetings have something on the agenda (${pct}%)${reach ? ` · the plan reaches the week of ${shortDate(reach)}` : ""}.`}
          </p>
        </div>
        <NativeSelect
          size="sm"
          className="w-auto"
          aria-label="How far ahead"
          value={String(weeks)}
          onChange={(e) => setWeeks(Number(e.target.value))}
          options={HORIZON_OPTIONS}
        />
      </div>

      {data.total > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-tertiary">
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}

      {data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-secondary bg-primary">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-32 bg-primary px-3 py-2 text-left text-caption font-semibold text-quaternary sm:min-w-44">
                  Meeting
                </th>
                {data.weeks.map((w, i) => (
                  <th
                    key={w}
                    className={cx(
                      "min-w-12 px-1 py-2 text-center text-caption font-medium whitespace-nowrap",
                      i === 0 ? "text-teal-700 dark:text-teal-400" : "text-quaternary"
                    )}
                  >
                    <span className="block text-[10px] tracking-wide uppercase opacity-70">
                      {i === 0 || monthOf(w) !== monthOf(data.weeks[i - 1]) ? monthOf(w) : " "}
                    </span>
                    {Number(w.slice(8))}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-caption font-semibold text-quaternary">Planned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
              {data.rows.map((row) => {
                const subjectName = meetingSubjectName(row.meeting, names);
                const title = meetingTitle(row.meeting, subjectName);
                return (
                  <tr key={row.meeting.id}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-36 bg-primary px-3 py-2 text-left font-medium sm:max-w-56"
                    >
                      <span className="block truncate text-primary">{title}</span>
                      <span className="block truncate text-caption font-normal text-quaternary">
                        {RHYTHM_LABEL[row.meeting.rhythm]}
                      </span>
                    </th>
                    {row.weeks.map((occ, i) => (
                      <td key={data.weeks[i]} className="px-1 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {occ.map((o) => (
                            <HorizonCell
                              key={o.slot.date}
                              occurrence={o}
                              title={title}
                              onPlan={() => planOccurrence(row.meeting.id, o.slot.date, o.slot.sessionId)}
                            />
                          ))}
                        </div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-caption tabular-nums whitespace-nowrap text-quaternary">
                      {row.planned}/{row.total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-quaternary">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex size-5 items-center justify-center rounded-md bg-teal-600 text-[10px] font-semibold text-white">2</span>
          topics planned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-5 rounded-md border border-dashed border-stone-300 dark:border-stone-600" />
          open — nothing planned yet
        </span>
        <span>Click any cell to plan it.</span>
      </p>
    </div>
  );
}

function HorizonCell({
  occurrence: o,
  title,
  onPlan,
}: {
  occurrence: Occurrence;
  title: string;
  onPlan: () => void;
}) {
  const n = o.topics.length;
  const when = shortDate(o.slot.date);
  if (o.skipped) {
    return (
      <span
        className="inline-flex size-7 items-center justify-center text-caption text-stone-300 dark:text-stone-600"
        title={`${title} · ${when} · skipped`}
      >
        –
      </span>
    );
  }
  const label =
    n === 0
      ? `${title}, ${when}: nothing planned yet — plan it`
      : `${title}, ${when}: ${o.topics.map((t) => t.text).join("; ")}`;
  return (
    <button
      type="button"
      onClick={onPlan}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition touch:size-11",
        n > 0
          ? "bg-teal-600 text-white hover:bg-teal-700"
          : "border border-dashed border-stone-300 text-transparent hover:border-teal-500 hover:text-teal-600 dark:border-stone-600"
      )}
    >
      {n > 0 ? n : "+"}
    </button>
  );
}
