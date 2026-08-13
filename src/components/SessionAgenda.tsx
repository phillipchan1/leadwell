import { useMemo, useState } from "react";
import type { Session, Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { nextSlotAfter, plannedSlots, topicsFor } from "../lib/topics";
import { todayISO } from "../lib/readiness";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Input } from "@/components/base/input/input";
import { ArrowRight, DotsGrid } from "@untitledui/icons";
import {
  useReorderableRow,
  type MoveResult,
} from "@/hooks/use-reorderable-row";

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
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const addTopic = useStore((s) => s.addTopic);
  const coverTopic = useStore((s) => s.coverTopic);
  const rollTopic = useStore((s) => s.rollTopic);
  const addSession = useStore((s) => s.addSession);
  const placeTopic = useStore((s) => s.placeTopic);
  const moveTopic = useStore((s) => s.moveTopic);
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
    <section className="meeting-editor-agenda mb-6 rounded-xl border border-secondary">
      <div className="flex items-baseline justify-between gap-2 border-b border-stone-100 px-3 py-2 dark:border-stone-800/80">
        <span className="text-caption font-semibold tracking-wide text-quaternary uppercase">
          Agenda
        </span>
        <span className="text-caption tabular-nums text-quaternary">
          {mine.length === 0
            ? "nothing planned"
            : `${mine.length - open} of ${mine.length} covered`}
        </span>
      </div>

      {mine.length > 0 && (
        <ul className="divide-y divide-stone-100 dark:divide-stone-800/80">
          {mine.map((t) => (
            <AgendaRow
              key={t.id}
              topic={t}
              onCover={(selected) => coverTopic(t.id, selected)}
              onReorder={(dir) => moveTopic(t.id, dir)}
              onRoll={() => roll(t.id)}
            />
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
                      className="rounded-full border border-primary px-2.5 py-1 text-xs text-stone-600 touch:min-h-11 hover:border-teal-500 hover:text-teal-600 dark:text-stone-300"
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

/**
 * One planned topic.
 *
 * The agenda's order is the order you mean to take them in, which makes it
 * worth changing — and the board's drag handle isn't here, so this row grows a
 * small one of its own. It exists mostly so ⌥↑/⌥↓ have somewhere labelled to
 * live; a keyboard affordance nobody can see is one nobody uses.
 */
function AgendaRow({
  topic,
  onCover,
  onReorder,
  onRoll,
}: {
  topic: Topic;
  onCover: (selected: boolean) => void;
  onReorder: (direction: -1 | 1) => MoveResult;
  onRoll: () => void;
}) {
  const { rowProps, handleProps } = useReorderableRow({
    label: `“${topic.text}”`,
    onMove: onReorder,
  });

  return (
    <li {...rowProps} className="group flex items-start gap-2 px-3 py-2">
      <button
        type="button"
        {...handleProps}
        aria-label={`Reorder “${topic.text}” — Alt with up or down arrow`}
        title="⌥↑ / ⌥↓ to reorder"
        className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded text-stone-300 opacity-0 transition-opacity touch:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:text-stone-500 dark:text-stone-600"
      >
        <DotsGrid className="size-3.5" />
      </button>
      <Checkbox
        size="sm"
        aria-label={`Covered "${topic.text}"`}
        isSelected={topic.status !== "open"}
        onChange={onCover}
        className="mt-0.5 shrink-0"
      />
      <span
        className={
          topic.status === "open"
            ? "min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-200"
            : "min-w-0 flex-1 text-sm text-stone-400 line-through dark:text-stone-500"
        }
      >
        {topic.text}
        {topic.carried > 1 && topic.status === "open" && (
          <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-caption font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-500">
            pushed {topic.carried}×
          </span>
        )}
      </span>
      {topic.status === "open" && (
        <Button
          size="sm"
          color="link-gray"
          className="shrink-0"
          iconTrailing={ArrowRight}
          onClick={onRoll}
          aria-label={`Didn't get to "${topic.text}" — push it to the next one`}
        >
          Next time
        </Button>
      )}
    </li>
  );
}
