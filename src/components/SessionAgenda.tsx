import { useMemo, useState } from "react";
import type { Session, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { nextSlotAfter, plannedSlots, topicsFor } from "../lib/topics";
import { todayISO } from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { ArrowRight } from "@untitledui/icons";

/**
 * What we planned to talk about, at the top of the write-up.
 *
 * This is the half of the loop the board can't close on its own. Planning a
 * topic is easy and marking it covered is a chore, so asking someone to go
 * back to a kanban afterwards means it never happens — and a topic that's
 * planned but never closed is exactly the failure the planner exists to catch.
 *
 * Here it costs a tick, in the one moment you're already thinking about what
 * you just discussed. The arrow is the honest alternative: we didn't get to
 * it, push it to next time and count that it slipped.
 */
export function SessionAgenda({
  session,
  meeting,
}: {
  session: Session;
  meeting: TrackedMeeting;
}) {
  const { sessions, topics, addTopic, coverTopic, rollTopic, addSession, placeTopic } =
    useStore();
  const [draft, setDraft] = useState("");
  const [pulling, setPulling] = useState(false);
  const today = todayISO();

  const mine = useMemo(
    () => topicsFor(topics, meeting.id).filter((t) => t.sessionId === session.id),
    [topics, meeting.id, session.id]
  );
  // Parked is deliberately not-now, so it stays out of this — offering it here
  // would put the pile you've already decided to defer in front of you again.
  const backlog = useMemo(
    () =>
      topicsFor(topics, meeting.id).filter(
        (t) => t.status === "open" && !t.sessionId && t.lane === "backlog"
      ),
    [topics, meeting.id]
  );

  const roll = (topicId: string) => {
    const slots = plannedSlots(meeting, sessions, topics, today);
    const next = nextSlotAfter(slots, session.id);
    if (!next) {
      rollTopic(topicId, undefined);
      return;
    }
    const sessionId =
      next.sessionId ?? addSession({ meetingId: meeting.id, date: next.date });
    rollTopic(topicId, sessionId);
  };

  const open = mine.filter((t) => t.status === "open").length;

  return (
    <section className="meeting-editor-agenda mb-6 rounded-xl border border-stone-200 dark:border-stone-800">
      <div className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-3 py-2 dark:border-stone-800/80">
        <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
          Agenda
        </span>
        <span className="text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
          {mine.length === 0
            ? "nothing planned"
            : `${mine.length - open} of ${mine.length} covered`}
        </span>
      </div>

      {mine.length > 0 && (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {mine.map((t) => (
            <li key={t.id} className="flex items-start gap-2.5 px-3 py-2">
              <Checkbox
                size="sm"
                aria-label={`Covered "${t.text}"`}
                isSelected={t.status !== "open"}
                onChange={(selected) => coverTopic(t.id, selected)}
                className="mt-0.5 shrink-0"
              />
              <span
                className={
                  t.status === "open"
                    ? "min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-200"
                    : "min-w-0 flex-1 text-sm text-stone-400 line-through dark:text-stone-500"
                }
              >
                {t.text}
                {t.carried > 1 && t.status === "open" && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-500">
                    pushed {t.carried}×
                  </span>
                )}
              </span>
              {t.status === "open" && (
                <Button
                  size="sm"
                  color="link-gray"
                  className="shrink-0"
                  iconTrailing={ArrowRight}
                  onClick={() => roll(t.id)}
                  aria-label={`Didn't get to "${t.text}" — push it to the next one`}
                >
                  Next time
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            addTopic(meeting.id, text, { sessionId: session.id });
            setDraft("");
          }}
        >
          <Input
            size="sm"
            placeholder="Came up — add it…"
            aria-label="Add a topic to this meeting"
            value={draft}
            onChange={setDraft}
          />
        </form>

        {backlog.length > 0 && (
          <div>
            <Button
              size="sm"
              color="link-gray"
              onClick={() => setPulling((v) => !v)}
            >
              {pulling
                ? "Hide the backlog"
                : `Pull from backlog (${backlog.length})`}
            </Button>
            {pulling && (
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {backlog.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => placeTopic(t.id, { sessionId: session.id })}
                      className="rounded-full border border-stone-300 px-2.5 py-1 text-xs text-stone-600 touch:min-h-11 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:text-stone-300"
                    >
                      + {t.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
