import { useRef, useState } from "react";
import { useDismiss } from "@/hooks/use-dismiss";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ArrowDown, ArrowUp, Trash01, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { tagChipClass, tagDotClass } from "./TagChip";
import { plannedSlots, slotLabel } from "@/lib/topics";
import { meetingSubjectName, meetingTitle, todayISO } from "@/lib/readiness";
import { deleteWithUndo } from "@/lib/undo";
import { useStore } from "@/store/useStore";
import type { TopicPoint } from "@/types";

const selectClass =
  "h-9 rounded-[9px] border border-primary bg-primary px-2.5 text-[13px] text-primary outline-none focus:border-teal-400";

function shortDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The full view of one idea.
 *
 * A card is a one-liner by design — it has to survive being one of forty on a
 * board. But an idea worth raising usually has more behind it than a title, and
 * with nowhere to put that, it either goes in a separate doc nobody opens again
 * or it never gets thought through at all. Clicking a card opens it here, where
 * it can grow sub-points, notes, and a real placement decision.
 */
export function TopicDetail({
  topicId,
  onClose,
}: {
  topicId: string;
  onClose: () => void;
}) {
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const updateTopic = useStore((s) => s.updateTopic);
  const tagTopics = useStore((s) => s.tagTopics);
  const assignTopics = useStore((s) => s.assignTopics);
  const placeTopicAt = useStore((s) => s.placeTopicAt);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const restoreTopic = useStore((s) => s.restoreTopic);
  const promoteToFollowUp = useStore((s) => s.promoteToFollowUp);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const today = todayISO();
  // A 1:1 has no name of its own; it's called by who it's with.
  const meetingLabel = (m: (typeof meetings)[number]) =>
    meetingTitle(m, meetingSubjectName(m, { people, teams, managers }));

  const topic = topics.find((t) => t.id === topicId);
  const [pointDraft, setPointDraft] = useState("");
  const pointRef = useRef<HTMLInputElement>(null);

  /*
   * On the shared Escape stack, so Escape closes this and only this — it used
   * to listen on the window alongside the meeting behind it, and one press
   * closed both. Two steps: the first Escape leaves the field you are typing
   * in, the second closes the panel; closing straight out of a half-typed
   * point loses the point.
   */
  useDismiss(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el?.closest("input, textarea")) {
      el.blur();
      return;
    }
    onClose();
  });

  if (!topic) return null;

  const points = topic.points ?? [];
  const donePoints = points.filter((p) => p.done).length;
  const meeting = topic.meetingId
    ? meetings.find((m) => m.id === topic.meetingId)
    : undefined;
  const session = topic.sessionId
    ? sessions.find((s) => s.id === topic.sessionId)
    : undefined;
  const section = meeting?.curriculum?.find((c) => c.id === topic.slotId);

  const setPoints = (next: TopicPoint[]) =>
    updateTopic(topic.id, { points: next });

  const addPoint = () => {
    const text = pointDraft.trim();
    if (!text) return;
    setPoints([...points, { id: Math.random().toString(36).slice(2, 10), text, done: false }]);
    setPointDraft("");
    pointRef.current?.focus();
  };

  const movePoint = (id: string, dir: -1 | 1) => {
    const i = points.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= points.length) return;
    const next = [...points];
    [next[i], next[j]] = [next[j], next[i]];
    setPoints(next);
  };

  const slots = meeting
    ? plannedSlots(meeting, sessions, topics, today, 6).filter(
        (s) => !s.past
      )
    : [];

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={() => onClose()}
        className="fixed inset-0 z-40 bg-stone-950/25 backdrop-blur-[1px] dark:bg-black/50"
      />
      <aside
        role="dialog"
        aria-label={`Idea: ${topic.text}`}
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-secondary bg-primary shadow-2xl"
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-secondary px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[11px] text-quaternary uppercase">
              Idea{meeting ? ` · ${meetingLabel(meeting)}` : " · not filed yet"}
              {session ? ` · ${shortDate(session.date)}` : ""}
            </p>
            <textarea
              value={topic.text}
              aria-label="Idea title"
              rows={1}
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onChange={(e) => {
                updateTopic(topic.id, { text: e.target.value });
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              className="mt-1 w-full resize-none rounded-md bg-transparent font-serif text-[24px] leading-[30px] text-primary outline-none focus:bg-secondary"
            />
          </div>
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={X}
            tooltip="Close (Esc)"
            onClick={() => onClose()}
          />
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Sub-points — the actual scaffolding */}
          <section>
            <div className="flex items-baseline justify-between">
              <h3 className="eyebrow">Break it down</h3>
              {points.length > 0 && (
                <span className="text-caption tabular-nums text-quaternary">
                  {donePoints} of {points.length}
                </span>
              )}
            </div>
            <ul className="mt-2 space-y-1">
              {points.map((point, i) => (
                <li
                  key={point.id}
                  className="group flex items-start gap-2 rounded-lg border border-secondary px-2 py-1.5"
                >
                  <Checkbox
                    size="sm"
                    aria-label={`Done: ${point.text}`}
                    isSelected={point.done}
                    onChange={(v) =>
                      setPoints(
                        points.map((p) =>
                          p.id === point.id ? { ...p, done: v } : p
                        )
                      )
                    }
                    className="mt-0.5 shrink-0"
                  />
                  <input
                    value={point.text}
                    aria-label={`Point ${i + 1}`}
                    onChange={(e) =>
                      setPoints(
                        points.map((p) =>
                          p.id === point.id ? { ...p, text: e.target.value } : p
                        )
                      )
                    }
                    className={cx(
                      "min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[13.5px] outline-none focus:bg-tertiary",
                      point.done
                        ? "text-quaternary line-through"
                        : "text-stone-700 dark:text-stone-200"
                    )}
                  />
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
                    <ButtonUtility
                      size="xs"
                      color="tertiary"
                      icon={ArrowUp}
                      tooltip="Move up"
                      isDisabled={i === 0}
                      onClick={() => movePoint(point.id, -1)}
                    />
                    <ButtonUtility
                      size="xs"
                      color="tertiary"
                      icon={ArrowDown}
                      tooltip="Move down"
                      isDisabled={i === points.length - 1}
                      onClick={() => movePoint(point.id, 1)}
                    />
                    <ButtonUtility
                      size="xs"
                      color="tertiary"
                      icon={Trash01}
                      tooltip="Remove"
                      onClick={() =>
                        setPoints(points.filter((p) => p.id !== point.id))
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="mt-1.5 flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addPoint();
              }}
            >
              <input
                ref={pointRef}
                value={pointDraft}
                onChange={(e) => setPointDraft(e.target.value)}
                placeholder={
                  points.length ? "Another point…" : "What does this break into?"
                }
                aria-label="New point"
                onKeyDown={(e) => {
                  // Explicit rather than leaning on implicit form submission —
                  // Enter is the whole interaction here, so it gets handled.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPoint();
                  }
                }}
                className="h-9 min-w-0 flex-1 rounded-[9px] border border-secondary bg-primary px-2.5 text-[13.5px] outline-none focus:border-teal-400"
              />
              <Button
                size="sm"
                color="secondary"
                type="submit"
                isDisabled={!pointDraft.trim()}
              >
                Add
              </Button>
            </form>
          </section>

          {/* Notes */}
          <section>
            <h3 className="eyebrow">Notes</h3>
            <textarea
              value={topic.detail ?? ""}
              aria-label="Notes"
              rows={5}
              placeholder="Why this matters, what you already know, what you want out of it…"
              onChange={(e) => updateTopic(topic.id, { detail: e.target.value })}
              className="mt-2 w-full rounded-[10px] border border-secondary bg-primary px-3 py-2.5 font-serif text-[16px] leading-6 text-primary outline-none placeholder:font-sans placeholder:text-[13.5px] placeholder:text-quaternary focus:border-teal-400"
            />
          </section>

          {/* Tags — here a tag IS the subject, so it gets the loud chip */}
          <section>
            <h3 className="eyebrow">Tags</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const on = topic.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => tagTopics([topic.id], tag.id, !on)}
                    className={cx(
                      "inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12.5px] font-medium transition",
                      on
                        ? tagChipClass(tag)
                        : "text-quaternary hover:bg-tertiary"
                    )}
                  >
                    <span
                      className={cx(
                        "size-2 rounded-[2px]",
                        on ? tagDotClass(tag) : "bg-quaternary"
                      )}
                      aria-hidden
                    />
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Placement */}
          <section>
            <h3 className="eyebrow">Where it goes</h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <select
                className={selectClass}
                aria-label="Meeting"
                value={topic.meetingId ?? ""}
                onChange={(e) => {
                  // Off its week first: a topic filed under one meeting must
                  // not keep sitting in another meeting's occurrence.
                  if (topic.sessionId) {
                    placeTopicAt(topic.id, { kind: "lane", lane: "backlog" });
                  }
                  assignTopics([topic.id], e.target.value || null);
                }}
              >
                <option value="">No meeting yet</option>
                {meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {meetingLabel(m)}
                  </option>
                ))}
              </select>

              {meeting && (
                <select
                  className={selectClass}
                  aria-label="Week"
                  value={topic.sessionId ?? ""}
                  onChange={(e) => {
                    if (!e.target.value) {
                      placeTopicAt(topic.id, {
                        kind: "lane",
                        lane: "backlog",
                        meetingId: meeting.id,
                      });
                      return;
                    }
                    const slot = slots.find(
                      (s) => (s.sessionId ?? s.date) === e.target.value
                    );
                    if (!slot) return;
                    // A projected week has no session yet; placing into it books
                    // one on the way in.
                    placeTopicAt(
                      topic.id,
                      slot.sessionId
                        ? {
                            kind: "session",
                            meetingId: meeting.id,
                            sessionId: slot.sessionId,
                            slotId: topic.slotId,
                          }
                        : {
                            kind: "projected",
                            meetingId: meeting.id,
                            date: slot.date,
                            slotId: topic.slotId,
                          }
                    );
                  }}
                >
                  <option value="">Ideas (unscheduled)</option>
                  {slots.map((slot) => (
                    <option
                      key={slot.date}
                      value={slot.sessionId ?? slot.date}
                    >
                      {slotLabel(slot)}
                    </option>
                  ))}
                </select>
              )}

              {meeting && topic.sessionId && (meeting.curriculum?.length ?? 0) > 0 && (
                <select
                  className={selectClass}
                  aria-label="Section"
                  value={topic.slotId ?? ""}
                  onChange={(e) =>
                    topic.sessionId &&
                    placeTopicAt(topic.id, {
                      kind: "session",
                      meetingId: meeting.id,
                      sessionId: topic.sessionId,
                      slotId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Untagged</option>
                  {(meeting.curriculum ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}

              <label className="ml-1 inline-flex items-center gap-1.5 text-[13px] text-secondary">
                <Checkbox
                  size="sm"
                  aria-label="Urgent"
                  isSelected={Boolean(topic.urgent)}
                  onChange={(v) =>
                    updateTopic(topic.id, { urgent: v || undefined })
                  }
                />
                Urgent
              </label>
            </div>
            {session && (
              <p className="mt-2 text-[12.5px] text-tertiary">
                Scheduled for {shortDate(session.date)}
                {section ? ` · ${section.label}` : ""}
              </p>
            )}
          </section>

          {/* Provenance */}
          <section className="border-t border-secondary pt-3">
            <dl className="grid grid-cols-2 gap-y-1 font-mono text-[11px] text-quaternary uppercase">
              <dt>Captured</dt>
              <dd className="text-right">{shortDate(topic.createdOn)}</dd>
              {topic.carried > 0 && (
                <>
                  <dt>Carried</dt>
                  <dd className="text-right text-cond-watch-ink">
                    {topic.carried}×
                  </dd>
                </>
              )}
              {topic.returnedFromDate && (
                <>
                  <dt>Last missed</dt>
                  <dd className="text-right text-cond-watch-ink">
                    {shortDate(topic.returnedFromDate)}
                  </dd>
                </>
              )}
            </dl>
            {topic.carried >= 3 && topic.meetingId && (
              <div className="mt-3 rounded-[12px] bg-cond-watch-soft p-3">
                <p className="text-[12.5px] leading-5 text-cond-watch-ink">
                  Carried {topic.carried} times. A topic that keeps sliding is
                  usually a commitment in disguise.
                </p>
                <Button
                  size="sm"
                  color="secondary"
                  className="mt-2"
                  onClick={() => {
                    promoteToFollowUp(topic.id);
                    onClose();
                  }}
                >
                  Make it an action item
                </Button>
              </div>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-secondary px-5 py-3">
          <Button
            size="sm"
            color="tertiary"
            onClick={() => {
              const snapshot = topic;
              deleteWithUndo(
                "Idea deleted.",
                () => deleteTopic(snapshot.id),
                () => restoreTopic(snapshot)
              );
              onClose();
            }}
          >
            Delete
          </Button>
          <Button size="sm" color="primary" onClick={() => onClose()}>
            Done
          </Button>
        </footer>
      </aside>
    </>
  );
}
