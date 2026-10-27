import { useMemo, useState } from "react";
import type { FollowUp, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  RHYTHM_LABEL,
  daysBetween,
  readinessOf,
  todayISO,
  type Check,
} from "../lib/readiness";
import { startMeeting } from "../lib/liveMeeting";
import { aheadForHorizon, ensureSessionId, plannedSlots } from "../lib/topics";
import { TopicBoard } from "./TopicBoard";
import { OccurrenceNotesPanel } from "./OccurrenceNotesPanel";
import { OccurrenceNotesSheet } from "./OccurrenceNotesSheet";
import { Check as CheckIcon, ChevronLeft, ChevronRight, ClockFastForward, File06, Lock01, Play, X } from "@untitledui/icons";
import { pushBackWeek } from "./pushBack";
import { ArcBand } from "./arcs/ArcBand";
import { cx } from "@/utils/cx";

/**
 * How far the agenda pages ahead. Further than the board's default runway on
 * purpose: stepping to the next occurrence and the one after is how you plan
 * ahead from here, and stopping at eight weeks would stop a monthly meeting
 * two months out.
 */
const AGENDA_AHEAD = aheadForHorizon("all");

/**
 * One occurrence of a meeting, as a running order — the Agenda tab, at
 * `/m/<slug>/agenda`.
 *
 * The board answers "what's coming over the next eight weeks?". This answers
 * the question you actually arrive with: what's on the agenda for the next
 * one, and is anything missing? So it shows exactly one occurrence, with the
 * readiness checks across the top while it's the next one, the follow-ups
 * still open from earlier meetings, and the same cards and ideas tray as the
 * board beneath. ← and → step through the occurrences ahead — planning further
 * out happens here too, one meeting at a time.
 */
export function MeetingAgenda({
  meeting,
  onOpenSession,
  narrow = false,
}: {
  meeting: TrackedMeeting;
  onOpenSession?: (sessionId: string) => void;
  /** Hosted in a side panel rather than a page. */
  narrow?: boolean;
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

  // The week panel, opened as a drawer. Opening it books nothing.
  const [notesKey, setNotesKey] = useState<string | null>(null);

  const readiness = readinessOf(meeting, { meetings: [meeting], sessions, topics });

  if (!slot) {
    return (
      <div className="flex flex-col items-start gap-1 rounded-[16px] border border-dashed border-primary px-6 py-8">
        <p className="font-serif text-[19px] text-secondary italic">Nothing ahead for this meeting.</p>
        <p className="text-[13px] text-tertiary">Book a date from Plan ahead, or add a one-off.</p>
      </div>
    );
  }

  const step = (by: -1 | 1) => {
    const next = upcoming[index + by];
    if (next) setPinnedDate(by < 0 && index + by === 0 ? null : next.date);
  };

  const fix = (check: Check) => {
    if (check.fix === "writeUp" && check.sessionId) {
      setNotesKey(`s:${check.sessionId}`);
    } else if (check.fix === "book") {
      // The same answer the profiles give: it happened, so log it today.
      setNotesKey(`s:${addSession({ meetingId: meeting.id, date: today })}`);
    }
  };

  const days = daysBetween(today, slot.date);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const round =
    "flex size-9 items-center justify-center rounded-full border border-primary bg-primary text-secondary transition-colors hover:bg-secondary disabled:opacity-40 touch:size-11";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-mono text-[11px] text-quaternary uppercase">
            {isNext ? "Next meeting" : `${index} after the next one`}
          </span>
          <h2 className="font-serif text-[30px] leading-[36px]">
            {fmt(slot.date, { weekday: "long", month: "long", day: "numeric" })}
          </h2>
          <span className="text-[13px] text-secondary">
            {when}
            {slot.projected
              ? ` · expected from the ${RHYTHM_LABEL[meeting.rhythm].toLowerCase()} rhythm`
              : " · booked"}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5">
            <button type="button" aria-label="Previous occurrence" disabled={index === 0} onClick={() => step(-1)} className={round}>
              <ChevronLeft className="size-4" />
            </button>
            {!isNext && (
              <button
                type="button"
                onClick={() => setPinnedDate(null)}
                className="h-9 rounded-full px-3 text-[12.5px] font-semibold text-teal-700 hover:bg-secondary dark:text-teal-400"
              >
                Back to next
              </button>
            )}
            <button
              type="button"
              aria-label="Next occurrence"
              disabled={index >= upcoming.length - 1}
              onClick={() => step(1)}
              className={round}
            >
              <ChevronRight className="size-4" />
            </button>
          </span>
          <button
            type="button"
            onClick={() => setNotesKey(slot.sessionId ? `s:${slot.sessionId}` : `p:${slot.date}`)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold text-secondary transition-colors hover:bg-secondary touch:min-h-11"
          >
            <File06 aria-hidden className="size-4 text-tertiary" />
            This week
          </button>
          <button
            type="button"
            onClick={() => pushBackWeek(meeting.id, { sessionId: slot.sessionId, date: slot.date }, false)}
            title="This week's items move to the next meeting, and every later week's move along one"
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold text-secondary transition-colors hover:bg-secondary touch:min-h-11"
          >
            <ClockFastForward aria-hidden className="size-4 text-tertiary" />
            Push back
          </button>
          {onOpenSession && (
            <button
              type="button"
              onClick={() => {
                const id = ensureSessionId(meeting.id, slot, sessions, addSession);
                startMeeting(id);
                onOpenSession(id);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-teal-600 px-3.5 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 touch:min-h-11 dark:bg-teal-500 dark:text-stone-950"
            >
              <Play aria-hidden className="size-3.5" />
              Start meeting
            </button>
          )}
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

      <ArcBand meeting={meeting} date={slot.date} slots={upcoming} isNext={isNext} />

      <FollowUps meeting={meeting} />

      <TopicBoard meeting={meeting} occurrence={slot.date} ahead={AGENDA_AHEAD} narrow={narrow} />

      {notesKey && (
        <OccurrenceNotesSheet open onClose={() => setNotesKey(null)} label="This week">
          <OccurrenceNotesPanel
            meeting={meeting}
            slotKey={notesKey}
            onClose={() => setNotesKey(null)}
            onOpenFullEditor={onOpenSession}
            onMaterialized={(id) => setNotesKey(`s:${id}`)}
          />
        </OccurrenceNotesSheet>
      )}
    </div>
  );
}

const FIXABLE: Partial<Record<Check["fix"], string>> = {
  writeUp: "Write it up",
  book: "Log it",
};

function CheckTile({ check, onFix }: { check: Check; onFix: () => void }) {
  const action = !check.done ? FIXABLE[check.fix] : undefined;
  return (
    <li
      className={cx(
        "flex min-w-0 items-start gap-2.5 rounded-[12px] px-3 py-2.5",
        check.done ? "border border-secondary" : "bg-cond-watch-soft"
      )}
    >
      <span
        aria-hidden
        className={cx(
          "mt-px flex size-4 shrink-0 items-center justify-center rounded-full",
          check.done
            ? "bg-cond-thriving text-white"
            : "shadow-[inset_0_0_0_1.5px_var(--color-cond-watch)]"
        )}
      >
        {check.done && <CheckIcon className="size-2.5" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx("text-[13px] leading-[18px]", check.done ? "text-tertiary" : "font-semibold text-cond-watch-ink")}>
          {check.label}
        </span>
        {check.detail && <span className="text-[12px] leading-4 text-tertiary">{check.detail}</span>}
        {action && (
          <button
            type="button"
            onClick={onFix}
            className="mt-1 self-start text-[12.5px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
          >
            {action}
          </button>
        )}
      </div>
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
  const updateFollowUp = useStore((s) => s.updateFollowUp);
  const shares = useStore((s) => s.shares).filter((x) => x.meetingId === meeting.id);
  const [draft, setDraft] = useState("");
  // Who owes it, on a shared meeting: me → both of us → each of them → me.
  const owners: (string | undefined)[] = [undefined, "both", ...shares.map((x) => x.id)];
  const ownerLabel = (o?: string) =>
    !o ? "You" : o === "both" ? "Both" : (() => {
      const sh = shares.find((x) => x.id === o);
      return sh ? (sh.name?.split(/\s+/)[0] ?? sh.email.split("@")[0]) : "Them";
    })();
  const [showDone, setShowDone] = useState(false);

  const mine = followUps.filter(
    (f) =>
      f.meetingId === meeting.id ||
      // Made from the subject's own page, before it named a meeting.
      (!f.meetingId && f.subjectKind === meeting.subjectKind && f.subjectId === meeting.subjectId)
  );
  const open = mine.filter((f) => f.status === "open");
  const done = mine.filter((f) => f.status === "done");
  const shown = showDone ? [...open, ...done] : open;

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-baseline gap-2">
        <h3 className="eyebrow">Follow-ups</h3>
        {open.length > 0 && <span className="font-mono text-[11px] text-quaternary">{open.length} OPEN</span>}
        {done.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="ml-auto text-[12.5px] font-semibold text-tertiary hover:text-secondary"
          >
            {showDone ? "Hide done" : `${done.length} done`}
          </button>
        )}
      </div>
      {shown.length > 0 && (
        <ul className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
          {shown.map((f) => {
            const isDone = f.status === "done";
            return (
              <li
                key={f.id}
                className="group/fu flex min-w-0 items-start gap-2.5 rounded-[10px] border border-secondary bg-primary px-3 py-2.5"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isDone}
                  aria-label={isDone ? `Mark open: ${f.text}` : `Mark done: ${f.text}`}
                  onClick={() => toggleFollowUp(f.id)}
                  className="mt-px flex shrink-0 items-center justify-center touch:-my-2.5 touch:mt-0 touch:size-11"
                >
                  <span
                    className={cx(
                      "flex size-4 items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
                      isDone
                        ? "border-teal-600 bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500 dark:text-stone-950"
                        : "border-primary hover:border-teal-500"
                    )}
                  >
                    {isDone && <CheckIcon className="size-2.5" />}
                  </span>
                </button>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cx(
                      "text-[13.5px] leading-[19px] break-words",
                      isDone ? "text-quaternary line-through" : "text-primary"
                    )}
                  >
                    {f.text}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-quaternary uppercase">
                    Since {fmt(f.openedOn, { month: "short", day: "numeric" })}
                    {shares.length > 0 && (
                      <>
                        <button
                          type="button"
                          title="Who owes it — the other chair can tick off theirs and ours"
                          onClick={() => {
                            const i = owners.indexOf(f.owner);
                            updateFollowUp(f.id, { owner: owners[(i + 1) % owners.length] as FollowUp["owner"] });
                          }}
                          className="rounded-[4px] bg-secondary px-1.5 py-px font-sans text-[11px] font-semibold tracking-normal text-secondary normal-case hover:bg-tertiary"
                        >
                          {ownerLabel(f.owner)}
                        </button>
                        <button
                          type="button"
                          aria-pressed={Boolean(f.private)}
                          title={f.private ? "Only you — kept off the shared page" : "Shared — click to keep it to yourself"}
                          onClick={() => updateFollowUp(f.id, { private: !f.private || undefined })}
                          className={cx(
                            "inline-flex items-center gap-1 font-sans text-[11px] tracking-normal normal-case",
                            f.private ? "font-semibold text-secondary" : "text-quaternary hover:text-secondary"
                          )}
                        >
                          <Lock01 aria-hidden className="size-3" />
                          {f.private ? "Only you" : "Shared"}
                        </button>
                      </>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Delete “${f.text}”`}
                  onClick={() => deleteFollowUp(f.id)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-quaternary opacity-0 transition-opacity group-hover/fu:opacity-100 hover:bg-secondary hover:text-secondary focus-visible:opacity-100 touch:opacity-100"
                >
                  <X className="size-3.5" />
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
          addFollowUp(meeting.subjectKind, meeting.subjectId, draft, { meetingId: meeting.id });
          setDraft("");
        }}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-dashed border-primary px-3 focus-within:border-solid focus-within:border-teal-300 dark:focus-within:border-teal-700"
      >
        <input
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ellipsis outline-none placeholder:text-quaternary"
          // The verb first: where the field is narrow, it's the tail that goes.
          placeholder="Add a follow-up — who owes what?"
          aria-label="Add a follow-up"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span aria-hidden className="font-mono text-[10.5px] text-quaternary">↵</span>
      </form>
    </section>
  );
}

function fmt(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}
