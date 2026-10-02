import { useMemo, useState } from "react";
import type { FollowUp, Session, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { todayISO } from "../lib/readiness";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * Commitments — follow-ups — inside one occurrence.
 *
 * A topic is something to talk about; a commitment is something someone said
 * they'd do. They were already stored (and a topic could be promoted into one)
 * but nothing ever showed them again, so a promise made in a meeting was
 * exactly as durable as the leader's memory of it.
 *
 * Two halves, at the two moments they matter. **Since last time** opens the
 * agenda with whatever is still owed from earlier meetings with this person or
 * team — the first five minutes of a good 1:1. **Commitments** closes it: what
 * came out of *this* conversation, captured while it's being said.
 */

const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function useSubjectFollowUps(meeting: TrackedMeeting) {
  const followUps = useStore((s) => s.followUps);
  return useMemo(
    () =>
      followUps
        .filter(
          (f) =>
            f.subjectKind === meeting.subjectKind &&
            f.subjectId === meeting.subjectId
        )
        .sort((a, b) => a.openedOn.localeCompare(b.openedOn) || a.order - b.order),
    [followUps, meeting.subjectKind, meeting.subjectId]
  );
}

/** Still owed from before this occurrence. Hidden entirely when nothing is. */
export function SinceLastTime({
  session,
  meeting,
}: {
  session: Session;
  meeting: TrackedMeeting;
}) {
  const all = useSubjectFollowUps(meeting);
  const today = todayISO();
  /*
   * Carried in = made somewhere other than this occurrence. Ticked ones stay
   * on screen for the rest of the day, struck through, so closing one mid-
   * meeting doesn't make the row jump out from under the pointer.
   */
  const carried = all.filter(
    (f) =>
      f.sourceSessionId !== session.id &&
      (f.status === "open" || f.closedOn === today) &&
      f.openedOn <= (session.date > today ? today : session.date)
  );
  if (!carried.length) return null;
  const open = carried.filter((f) => f.status === "open").length;

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-baseline justify-between gap-2 border-b border-amber-100 px-3 py-2 dark:border-amber-900/40">
        <span className="text-caption font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-400">
          Since last time
        </span>
        <span className="text-caption tabular-nums text-amber-700/80 dark:text-amber-500/80">
          {open === 0 ? "all closed" : `${open} still open`}
        </span>
      </div>
      <ul>
        {carried.map((f) => (
          <CommitmentRow key={f.id} followUp={f} showOrigin />
        ))}
      </ul>
    </section>
  );
}

/** What came out of this occurrence, and the field to capture the next one. */
export function CommitmentsCapture({
  session,
  meeting,
}: {
  session: Session;
  meeting: TrackedMeeting;
}) {
  const all = useSubjectFollowUps(meeting);
  const addFollowUp = useStore((s) => s.addFollowUp);
  const [draft, setDraft] = useState("");
  const mine = all.filter((f) => f.sourceSessionId === session.id);

  return (
    <section className="mb-6 rounded-xl border border-secondary">
      <div className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-3 py-2 dark:border-stone-800/80">
        <span className="text-caption font-semibold tracking-wide text-quaternary uppercase">
          Commitments
        </span>
        <span className="text-caption text-quaternary">
          {mine.length === 0
            ? "who'll do what"
            : `${mine.filter((f) => f.status === "open").length} open`}
        </span>
      </div>
      {mine.length > 0 && (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {mine.map((f) => (
            <CommitmentRow key={f.id} followUp={f} />
          ))}
        </ul>
      )}
      <form
        className="px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          addFollowUp(meeting.subjectKind, meeting.subjectId, text, {
            meetingId: meeting.id,
            sourceSessionId: session.id,
          });
          setDraft("");
        }}
      >
        <Input
          size="sm"
          placeholder="Who'll do what, by when…"
          aria-label="Add a commitment from this meeting"
          value={draft}
          onChange={setDraft}
        />
      </form>
    </section>
  );
}

function CommitmentRow({
  followUp: f,
  showOrigin,
}: {
  followUp: FollowUp;
  showOrigin?: boolean;
}) {
  const toggleFollowUp = useStore((s) => s.toggleFollowUp);
  const deleteFollowUp = useStore((s) => s.deleteFollowUp);
  // The meeting it came out of says more than the day it was typed in.
  const origin = useStore((s) =>
    f.sourceSessionId ? s.sessions.find((o) => o.id === f.sourceSessionId)?.date : undefined
  );
  const done = f.status === "done";
  return (
    <li className="group flex items-start gap-2 px-3 py-2">
      <Checkbox
        size="sm"
        aria-label={`Done: "${f.text}"`}
        isSelected={done}
        onChange={() => toggleFollowUp(f.id)}
        className="mt-0.5 shrink-0"
      />
      <span
        className={cx(
          "min-w-0 flex-1 text-sm",
          done
            ? "text-stone-400 line-through dark:text-stone-500"
            : "text-stone-700 dark:text-stone-200"
        )}
      >
        {f.text}
        {showOrigin && (
          <span className="ml-1.5 text-caption whitespace-nowrap text-quaternary">
            {origin ? `from ${short(origin)}` : `since ${short(f.openedOn)}`}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label={`Remove "${f.text}"`}
        title="Remove"
        onClick={() => deleteFollowUp(f.id)}
        className="flex size-6 shrink-0 items-center justify-center rounded text-stone-300 opacity-0 transition-opacity touch:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 hover:text-stone-500 dark:text-stone-600"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}
