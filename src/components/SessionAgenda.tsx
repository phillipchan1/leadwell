import { useMemo, useState } from "react";
import type { CurriculumSlot, Session, Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  curriculumOf,
  effectiveSlotId,
  nextSlotAfter,
  plannedSlots,
  slotDotClass,
  topicsFor,
} from "../lib/topics";
import { todayISO } from "../lib/readiness";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ArrowRight, DotsGrid, Plus } from "@untitledui/icons";
import {
  useReorderableRow,
  type MoveResult,
} from "@/hooks/use-reorderable-row";
import { InlineComposer } from "./InlineComposer";
import { TopicDetail } from "./TopicDetail";
import { cx } from "@/utils/cx";

/**
 * What we planned to talk about, at the top of the write-up.
 *
 * This is the half of the loop the board can't close on its own. Planning a
 * topic is easy and marking it covered is a chore, so asking someone to go
 * back to a board afterwards means it never happens — and a topic that's
 * planned but never closed is exactly the failure the planner exists to catch.
 *
 * Here it costs a tick, in the one moment you're already thinking about what
 * you just discussed. "Next time" is the honest alternative: we didn't get to
 * it, push it to the next one and count that it slipped.
 *
 * It works before the occurrence exists. A week you've only opened to look at
 * is still a projection; the first thing you put in it books it.
 */
export function SessionAgenda({
  session,
  meeting,
  ensureSession,
}: {
  session: Session | null;
  meeting: TrackedMeeting;
  /** Book the occurrence if it isn't yet, and say which session it is. */
  ensureSession: () => string;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const captureTopics = useStore((s) => s.captureTopics);
  const coverTopic = useStore((s) => s.coverTopic);
  const rollTopic = useStore((s) => s.rollTopic);
  const addSession = useStore((s) => s.addSession);
  const placeTopic = useStore((s) => s.placeTopic);
  const moveTopic = useStore((s) => s.moveTopic);
  const [draft, setDraft] = useState("");
  const [pulling, setPulling] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayISO();
  const sessionId = session?.id;

  const curriculum = curriculumOf(meeting);
  const known = new Set(curriculum.map((s) => s.id));
  const rowOf = (t: Topic) => effectiveSlotId(t, curriculum);

  const mine = useMemo(
    () =>
      sessionId
        ? topicsFor(topics, meeting.id).filter(
            (t) => t.sessionId === sessionId && t.status !== "dropped"
          )
        : [],
    [topics, meeting.id, sessionId]
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
    const next = nextSlotAfter(slots, sessionId);
    if (!next) {
      rollTopic(topicId, undefined);
      return;
    }
    const target =
      next.sessionId ?? addSession({ meetingId: meeting.id, date: next.date });
    rollTopic(topicId, target);
  };

  const pull = (t: Topic, slotId?: string) =>
    placeTopic(t.id, { sessionId: ensureSession(), slotId: slotId ?? t.slotId });

  const addInto = (raw: string, slotId?: string) =>
    captureTopics(raw, {
      kind: "session",
      sessionId: ensureSession(),
      slotId,
      meetingId: meeting.id,
    });

  const sections: { slot?: CurriculumSlot; id: string; label: string; topics: Topic[] }[] =
    curriculum.length
      ? [
          ...curriculum.map((slot) => ({
            slot,
            id: slot.id,
            label: slot.label,
            topics: mine.filter((t) => rowOf(t) === slot.id),
          })),
          {
            id: "other",
            label: "Other",
            topics: mine.filter((t) => {
              const r = rowOf(t);
              return !r || !known.has(r);
            }),
          },
        ].filter((g) => g.id !== "other" || g.topics.length > 0)
      : [{ id: "all", label: "", topics: mine }];

  const open = mine.filter((t) => t.status === "open").length;
  const minutes = curriculum.reduce((n, s) => n + (s.minutes ?? 0), 0);
  const timed = curriculum.length > 0 && curriculum.every((s) => s.minutes);

  return (
    <section aria-label="Agenda" className="meeting-editor-agenda flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-primary">Agenda</h2>
        <span className="ml-auto font-mono text-[11px] text-quaternary uppercase">
          {mine.length === 0
            ? "Nothing planned yet"
            : `${mine.length - open} of ${mine.length} covered`}
          {minutes > 0 && ` · ${minutes} min`}
        </span>
      </div>

      {timed && (
        <div className="flex gap-[3px]" aria-hidden>
          {curriculum.map((slot) => {
            const filled = mine.some((t) => rowOf(t) === slot.id);
            const dot = slotDotClass(curriculum, slot.id, tags);
            return (
              <span
                key={slot.id}
                title={`${slot.label} · ${slot.minutes} min`}
                style={{ flexGrow: slot.minutes }}
                className={cx(
                  "h-2 basis-0 rounded-full",
                  filled ? dot : "bg-quaternary"
                )}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {sections.map((group) => {
          const suggestions = group.slot
            ? backlog.filter((t) => rowOf(t) === group.slot!.id).slice(0, 3)
            : [];
          return (
            <div key={group.id} className="flex flex-col gap-1.5">
              {group.label && (
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-primary">
                  {group.slot && (
                    <i
                      aria-hidden
                      className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, group.slot.id, tags))}
                    />
                  )}
                  {group.label}
                  {group.slot?.minutes ? (
                    <span className="ml-auto font-mono text-[10.5px] font-normal text-quaternary">
                      {group.slot.minutes} MIN
                    </span>
                  ) : null}
                </div>
              )}

              {group.topics.length > 0 && (
                <ul className="-mx-2 flex flex-col">
                  {group.topics.map((t) => (
                    <AgendaRow
                      key={t.id}
                      topic={t}
                      onOpen={() => setOpenId(t.id)}
                      onCover={(selected) => coverTopic(t.id, selected)}
                      onReorder={(dir) => moveTopic(t.id, dir)}
                      onRoll={() => roll(t.id)}
                    />
                  ))}
                </ul>
              )}

              {group.topics.length === 0 && group.slot && (
                <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-primary px-3 py-2.5">
                  {suggestions.length > 0 ? (
                    <>
                      <span className="text-[12.5px] text-tertiary">
                        Nothing planned. From your {group.label} ideas:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => pull(t, group.slot!.id)}
                            className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-[7px] border border-primary bg-primary px-2 py-1 text-left text-[12.5px] leading-4 font-medium text-primary transition-colors hover:border-teal-300 hover:text-teal-800 touch:min-h-11 dark:hover:border-teal-700 dark:hover:text-teal-300"
                          >
                            <Plus aria-hidden className="size-3 shrink-0" />
                            <span className="min-w-0">{t.text}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <span className="text-[12.5px] text-tertiary">Nothing planned.</span>
                  )}
                  <div className="-mx-1">
                    <InlineComposer
                      compact
                      label={`Add to ${group.label}`}
                      placeholder={`Add to ${group.label}…  #tag !`}
                      onAdd={(raw) => addInto(raw, group.slot!.id)}
                    />
                  </div>
                </div>
              )}

              {group.topics.length === 0 && !group.slot && (
                <p className="font-serif text-[16px] text-secondary italic">
                  Nothing planned for this one yet.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          addInto(text);
          setDraft("");
        }}
        className="flex h-10 items-center gap-2 rounded-[10px] border border-dashed border-primary px-3 focus-within:border-solid focus-within:border-teal-300 dark:focus-within:border-teal-700"
      >
        <Plus aria-hidden className="size-3.5 shrink-0 text-quaternary" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Came up? Add it…"
          aria-label="Add a topic to this meeting"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-quaternary"
        />
        <span aria-hidden className="font-mono text-[10.5px] text-quaternary">
          #tag ↵
        </span>
      </form>

      {backlog.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setPulling((v) => !v)}
            aria-expanded={pulling}
            className="self-start text-[12.5px] font-semibold text-teal-700 hover:text-teal-800 touch:min-h-11 dark:text-teal-400"
          >
            {pulling ? "Hide ideas" : `Pull from ideas (${backlog.length})`}
          </button>
          {pulling && (
            <ul className="flex flex-wrap gap-1.5">
              {backlog.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => pull(t)}
                    className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-primary px-2.5 py-1 text-left text-[12.5px] text-secondary transition-colors hover:border-teal-400 hover:text-teal-700 touch:min-h-11 dark:hover:text-teal-300"
                  >
                    <Plus aria-hidden className="size-3 shrink-0" />
                    {t.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {openId && <TopicDetail topicId={openId} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/**
 * One planned topic.
 *
 * The agenda's order is the order you mean to take them in, which makes it
 * worth changing — so the row has a small handle of its own, mostly so ⌥↑/⌥↓
 * have somewhere labelled to live.
 */
function AgendaRow({
  topic,
  onOpen,
  onCover,
  onReorder,
  onRoll,
}: {
  topic: Topic;
  onOpen: () => void;
  onCover: (selected: boolean) => void;
  onReorder: (direction: -1 | 1) => MoveResult;
  onRoll: () => void;
}) {
  const { rowProps, handleProps } = useReorderableRow({
    label: `“${topic.text}”`,
    onMove: onReorder,
  });
  const done = topic.status !== "open";
  const points = topic.points ?? [];

  return (
    <li
      {...rowProps}
      className="group/row flex items-start gap-2 rounded-[10px] px-2 py-2 transition-colors hover:bg-secondary touch:items-center touch:py-0.5"
    >
      <button
        type="button"
        {...handleProps}
        aria-label={`Reorder “${topic.text}” — Alt with up or down arrow`}
        title="⌥↑ / ⌥↓ to reorder"
        className="-ml-1 flex size-5 shrink-0 items-center justify-center rounded text-quaternary opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 touch:hidden"
      >
        <DotsGrid className="size-3" />
      </button>
      <Checkbox
        size="sm"
        aria-label={`Covered: “${topic.text}”`}
        isSelected={done}
        onChange={onCover}
        className="mt-0.5 shrink-0 touch:mt-0"
      />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
      >
        <span
          className={cx(
            "block text-[14px] leading-[19px]",
            done ? "text-quaternary line-through" : "text-primary"
          )}
        >
          {topic.urgent && !done && <span className="mr-1 font-semibold text-cond-critical-ink">!</span>}
          {topic.text}
        </span>
        {!done && (topic.carried > 1 || points.length > 0 || topic.detail?.trim()) && (
          <span className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10px] text-quaternary uppercase">
            {topic.carried > 1 && <span className="text-cond-watch-ink">Pushed {topic.carried}×</span>}
            {points.length > 0 && (
              <span>
                {points.filter((p) => p.done).length}/{points.length} points
              </span>
            )}
            {topic.detail?.trim() && <span>Notes</span>}
          </span>
        )}
      </button>
      {!done && (
        <button
          type="button"
          onClick={onRoll}
          aria-label={`Didn't get to “${topic.text}” — push it to the next one`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-[12px] font-semibold text-tertiary opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:text-secondary focus-visible:opacity-100 touch:min-h-11 touch:opacity-100"
        >
          Next time
          <ArrowRight className="size-3" />
        </button>
      )}
    </li>
  );
}
