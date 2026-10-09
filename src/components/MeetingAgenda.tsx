import { useMemo, useState } from "react";
import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  RHYTHM_LABEL,
  STATE_COLOR,
  daysBetween,
  readinessOf,
  todayISO,
  type Check,
} from "../lib/readiness";
import { aheadForHorizon, ensureSessionId, plannedSlots } from "../lib/topics";
import { TopicBoard } from "./TopicBoard";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import { SectionTitle } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { ChevronLeft, ChevronRight, File06 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * How far the agenda pages ahead. Further than the board's default runway on
 * purpose: stepping to the next occurrence and the one after is how you plan
 * ahead from here, and stopping at eight weeks would stop a monthly meeting
 * two months out.
 */
const AGENDA_AHEAD = aheadForHorizon("all");

/**
 * One occurrence of a meeting, as a running order — the page a meeting opens
 * on, and the one `/m/<slug>` bookmarks.
 *
 * The board answers "what's coming over the next eight weeks?". This answers
 * the question you actually arrive with: what's on the agenda for the next
 * one, and is anything missing? So it shows exactly one occurrence, with the
 * readiness checks across the top while it's the next one, the follow-ups
 * still open from earlier meetings, and the same cards and ideas rail as the
 * board beneath. ← and → step through the occurrences ahead — planning further
 * out happens here too, one meeting at a time.
 */
export function MeetingAgenda({
  meeting,
  onOpenSession,
}: {
  meeting: TrackedMeeting;
  onOpenSession?: (sessionId: string) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const addSession = useStore((s) => s.addSession);
  const today = todayISO();

  const upcoming = useMemo(
    () =>
      plannedSlots(meeting, sessions, topics, today, AGENDA_AHEAD).filter(
        (s) => !s.past
      ),
    [meeting, sessions, topics, today]
  );

  // Held by date, not index: adding a one-off ahead of this week would
  // otherwise shift the agenda you're looking at onto a different meeting.
  const [pinnedDate, setPinnedDate] = useState<string | null>(null);
  const index = Math.max(
    0,
    pinnedDate ? upcoming.findIndex((s) => s.date === pinnedDate) : 0
  );
  const slot = upcoming[index];
  const isNext = index === 0;

  const [notesKey, setNotesKey] = useState<string | null>(null);
  const openNotesFor = (sessionId: string) => setNotesKey(`s:${sessionId}`);

  const readiness = readinessOf(meeting, {
    meetings: [meeting],
    sessions,
    topics,
  });

  if (!slot) {
    return (
      <p className="text-sm text-quaternary">
        Nothing ahead for this meeting. Book a date from Plan ahead.
      </p>
    );
  }

  const step = (by: -1 | 1) => {
    const next = upcoming[index + by];
    if (next) setPinnedDate(by < 0 && index + by === 0 ? null : next.date);
  };

  const fix = (check: Check) => {
    if (check.fix === "writeUp" && check.sessionId) {
      openNotesFor(check.sessionId);
    } else if (check.fix === "book") {
      // The same answer the profiles give: it happened, so log it today.
      openNotesFor(addSession({ meetingId: meeting.id, date: today }));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption font-medium text-quaternary">
            {isNext ? "Next meeting" : `${index} after the next one`}
          </p>
          <h3 className="text-xl font-semibold tracking-tight text-primary tabular-nums">
            {longDate(slot.date)}
          </h3>
          <p className="text-caption text-quaternary">
            {whenLabel(today, slot.date)}
            {slot.projected &&
              ` · projected from the ${RHYTHM_LABEL[meeting.rhythm].toLowerCase()} rhythm`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            color="secondary"
            iconLeading={ChevronLeft}
            isDisabled={index === 0}
            onClick={() => step(-1)}
            aria-label="Previous occurrence"
          />
          {!isNext && (
            <Button size="sm" color="secondary" onClick={() => setPinnedDate(null)}>
              Back to next
            </Button>
          )}
          <Button
            size="sm"
            color="secondary"
            iconLeading={ChevronRight}
            isDisabled={index >= upcoming.length - 1}
            onClick={() => step(1)}
            aria-label="Next occurrence"
          />
          <Button
            size="sm"
            color="secondary"
            iconLeading={File06}
            onClick={() =>
              openNotesFor(ensureSessionId(meeting.id, slot, sessions, addSession))
            }
          >
            Notes
          </Button>
        </div>
      </div>

      {/* The checks describe the next occurrence. On a later one they'd be
          answering a question nobody asked of it, so they step aside. */}
      {isNext && readiness.checks.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {readiness.checks.map((check) => (
            <CheckTile key={check.id} check={check} onFix={() => fix(check)} />
          ))}
        </ul>
      )}

      <FollowUps meeting={meeting} />

      <TopicBoard meeting={meeting} occurrence={slot.date} ahead={AGENDA_AHEAD} />

      {notesKey && (
        <OccurrenceNotesSheet
          open
          onClose={() => setNotesKey(null)}
          label="Meeting notes"
        >
          <OccurrenceNotesPanel
            meeting={meeting}
            slotKey={notesKey}
            onClose={() => setNotesKey(null)}
            onOpenFullEditor={onOpenSession}
          />
        </OccurrenceNotesSheet>
      )}
    </div>
  );
}

const FIXABLE: Partial<Record<Check["fix"], string>> = {
  writeUp: "Write up",
  book: "Log it",
};

function CheckTile({ check, onFix }: { check: Check; onFix: () => void }) {
  const action = !check.done ? FIXABLE[check.fix] : undefined;
  return (
    <li
      className={cx(
        "flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2 text-xs",
        check.done
          ? "border-secondary"
          : "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
      )}
    >
      <span
        className="mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-caption font-bold text-white"
        style={
          check.done
            ? { backgroundColor: STATE_COLOR.ready }
            : { boxShadow: `inset 0 0 0 1.5px ${STATE_COLOR.prep_due}` }
        }
        aria-hidden
      >
        {check.done ? "✓" : ""}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={
            check.done
              ? "text-quaternary"
              : "font-medium text-stone-800 dark:text-stone-100"
          }
        >
          {check.label}
        </div>
        {check.detail && (
          <div className="text-caption text-quaternary">{check.detail}</div>
        )}
      </div>
      {action && (
        <Button size="sm" color="link-color" className="shrink-0" onClick={onFix}>
          {action}
        </Button>
      )}
    </li>
  );
}

/**
 * Commitments that outlive one occurrence — "Dana sends the budget". Not a
 * topic: a topic is something to talk about and gets ticked when it's been
 * talked about; a follow-up is something someone owes, and it stays on the
 * agenda until it's done, however many meetings that takes.
 */
function FollowUps({ meeting }: { meeting: TrackedMeeting }) {
  const followUps = useStore((s) => s.followUps);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const toggleFollowUp = useStore((s) => s.toggleFollowUp);
  const deleteFollowUp = useStore((s) => s.deleteFollowUp);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);

  const mine = followUps.filter(
    (f) =>
      f.meetingId === meeting.id ||
      // Made from the subject's own page, before it named a meeting.
      (!f.meetingId &&
        f.subjectKind === meeting.subjectKind &&
        f.subjectId === meeting.subjectId)
  );
  const open = mine.filter((f) => f.status === "open");
  const done = mine.filter((f) => f.status === "done");
  const shown = showDone ? [...open, ...done] : open;

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <SectionTitle>
          Follow-ups{open.length > 0 && ` · ${open.length} open`}
        </SectionTitle>
        {done.length > 0 && (
          <Button size="sm" color="link-gray" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide done" : `${done.length} done`}
          </Button>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {shown.map((f) => {
            const isDone = f.status === "done";
            return (
              <li
                key={f.id}
                className="group flex min-w-0 items-start gap-2.5 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={isDone ? "Mark open" : "Mark done"}
                  onClick={() => toggleFollowUp(f.id)}
                  className="mt-0.5 flex shrink-0 items-center justify-center touch:-my-2.5 touch:mt-0 touch:size-11"
                >
                  <span
                    className={cx(
                      "flex size-4 items-center justify-center rounded border-2 text-[10px] font-bold",
                      isDone
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-stone-300 hover:border-teal-500 dark:border-stone-600"
                    )}
                  >
                    {isDone && "✓"}
                  </span>
                </button>
                <span
                  className={cx(
                    "min-w-0 flex-1 break-words",
                    isDone
                      ? "text-quaternary line-through decoration-stone-300"
                      : "text-stone-800 dark:text-stone-100"
                  )}
                >
                  {f.text}
                  <span className="block text-caption text-quaternary">
                    since {shortDate(f.openedOn)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Delete “${f.text}”`}
                  onClick={() => deleteFollowUp(f.id)}
                  className="shrink-0 rounded px-1 text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500 touch:opacity-100"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          addFollowUp(meeting.subjectKind, meeting.subjectId, draft, {
            meetingId: meeting.id,
          });
          setDraft("");
        }}
      >
        <input
          className="w-full rounded-lg border border-dashed border-primary bg-transparent px-3 py-2 text-sm text-stone-700 outline-none placeholder:text-stone-400 focus:border-teal-500 touch:min-h-11 touch:text-md dark:text-stone-200"
          placeholder="Someone owes something? Add a follow-up… ↵"
          aria-label="Add a follow-up"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>
    </section>
  );
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function whenLabel(today: string, date: string): string {
  const days = daysBetween(today, date);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
