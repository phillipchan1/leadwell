import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { ArrowDown, ArrowUp, Trash01, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { tagChipClass, tagDotClass } from "./TagChip";
import { plannedSlots, slotHint, slotLabel } from "./slots";
import type { LabApi } from "./store";
import type { LabPoint } from "./types";

const selectClass =
  "rounded-md border border-secondary bg-primary px-2 py-1 text-xs text-stone-700 outline-none dark:text-stone-200";

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
export function TopicDetail({ api }: { api: LabApi }) {
  const { state } = api;
  const topic = state.topics.find((t) => t.id === state.openTopicId);
  const [pointDraft, setPointDraft] = useState("");
  const pointRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const el = e.target as HTMLElement | null;
      // Two steps: the first Escape leaves the field you are typing in, the
      // second closes the panel. Closing straight out of a half-typed point
      // loses the point.
      if (el?.closest("input, textarea")) {
        (el as HTMLElement).blur();
        return;
      }
      api.closeTopic();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  if (!topic) return null;

  const points = topic.points ?? [];
  const donePoints = points.filter((p) => p.done).length;
  const meeting = topic.meetingId
    ? state.meetings.find((m) => m.id === topic.meetingId)
    : undefined;
  const session = topic.sessionId
    ? state.sessions.find((s) => s.id === topic.sessionId)
    : undefined;
  const section = meeting?.template.find((s) => s.id === topic.sectionId);

  const setPoints = (next: LabPoint[]) =>
    api.updateTopic(topic.id, { points: next });

  const addPoint = () => {
    const text = pointDraft.trim();
    if (!text) return;
    setPoints([...points, { id: api.newPointId(), text, done: false }]);
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
    ? plannedSlots(meeting, state.sessions, state.topics, state.today, 6).filter(
        (s) => !s.past
      )
    : [];

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={() => api.closeTopic()}
        className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[1px] dark:bg-black/40"
      />
      <aside
        role="dialog"
        aria-label={`Idea: ${topic.text}`}
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-secondary bg-primary shadow-2xl"
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-secondary px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-caption font-medium tracking-wide text-quaternary uppercase">
              Idea
            </p>
            <textarea
              value={topic.text}
              aria-label="Idea title"
              rows={1}
              onChange={(e) => {
                api.updateTopic(topic.id, { text: e.target.value });
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              className="mt-0.5 w-full resize-none rounded bg-transparent text-base font-semibold text-stone-800 outline-none focus:bg-tertiary dark:text-stone-100"
            />
          </div>
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={X}
            tooltip="Close (Esc)"
            onClick={() => api.closeTopic()}
          />
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* Sub-points — the actual scaffolding */}
          <section>
            <div className="flex items-baseline justify-between">
              <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
                Break it down
              </h3>
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
                      "min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs outline-none focus:bg-tertiary",
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
                className="min-w-0 flex-1 rounded-md border border-secondary bg-primary px-2 py-1.5 text-xs outline-none focus:border-teal-400"
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
            <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
              Notes
            </h3>
            <textarea
              value={topic.notes ?? ""}
              aria-label="Notes"
              rows={5}
              placeholder="Why this matters, what you already know, what you want out of it…"
              onChange={(e) => api.updateTopic(topic.id, { notes: e.target.value })}
              className="mt-2 w-full rounded-lg border border-secondary bg-primary px-2.5 py-2 text-xs leading-relaxed text-stone-700 outline-none placeholder:text-quaternary focus:border-teal-400 dark:text-stone-200"
            />
          </section>

          {/* Tags — here a tag IS the subject, so it gets the loud chip */}
          <section>
            <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
              Tags
            </h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.tags.map((tag) => {
                const on = topic.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => api.tagTopics([topic.id], tag.id, !on)}
                    className={cx(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption font-medium transition",
                      on
                        ? tagChipClass(tag)
                        : "text-quaternary hover:bg-tertiary"
                    )}
                  >
                    <span
                      className={cx(
                        "size-1.5 rounded-full",
                        on ? tagDotClass(tag) : "bg-stone-300 dark:bg-stone-600"
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
            <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
              Where it goes
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <select
                className={selectClass}
                aria-label="Meeting"
                value={topic.meetingId ?? ""}
                onChange={(e) =>
                  api.assignTopics([topic.id], e.target.value || null)
                }
              >
                <option value="">No meeting yet</option>
                {state.meetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
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
                      api.moveTopic(topic.id, {
                        kind: "ideas",
                        meetingId: meeting.id,
                      });
                      return;
                    }
                    const slot = slots.find(
                      (s) => (s.sessionId ?? s.date) === e.target.value
                    );
                    if (!slot) return;
                    api.moveTopic(topic.id, {
                      kind: "session",
                      meetingId: meeting.id,
                      sessionId: slot.sessionId ?? undefined,
                      date: slot.sessionId ? undefined : slot.date,
                      sectionId: topic.sectionId ?? topic.lastSectionId,
                    });
                  }}
                >
                  <option value="">Ideas (unscheduled)</option>
                  {slots.map((slot) => (
                    <option
                      key={slot.date}
                      value={slot.sessionId ?? slot.date}
                    >
                      {slotLabel(slot)} · {slotHint(slot, state.today)}
                    </option>
                  ))}
                </select>
              )}

              {meeting && topic.sessionId && meeting.template.length > 0 && (
                <select
                  className={selectClass}
                  aria-label="Band"
                  value={topic.sectionId ?? ""}
                  onChange={(e) =>
                    api.moveTopic(topic.id, {
                      kind: "session",
                      meetingId: meeting.id,
                      sessionId: topic.sessionId,
                      sectionId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">Unsorted</option>
                  {meeting.template.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}

              <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-quaternary">
                <Checkbox
                  size="sm"
                  aria-label="Urgent"
                  isSelected={Boolean(topic.urgent)}
                  onChange={(v) =>
                    api.updateTopic(topic.id, { urgent: v || undefined })
                  }
                />
                Urgent
              </label>
            </div>
            {session && (
              <p className="mt-1.5 text-caption text-quaternary">
                Scheduled for {shortDate(session.date)}
                {section ? ` · ${section.label}` : ""}
              </p>
            )}
          </section>

          {/* Provenance */}
          <section className="border-t border-secondary pt-3">
            <dl className="grid grid-cols-2 gap-y-1 text-caption text-quaternary">
              <dt>Captured</dt>
              <dd className="text-right">{shortDate(topic.createdOn)}</dd>
              {topic.carried > 0 && (
                <>
                  <dt>Pushed</dt>
                  <dd className="text-right text-amber-700 dark:text-amber-500">
                    {topic.carried}×
                  </dd>
                </>
              )}
              {topic.returnedFromDate && (
                <>
                  <dt>Last missed</dt>
                  <dd className="text-right text-amber-700 dark:text-amber-500">
                    {shortDate(topic.returnedFromDate)}
                  </dd>
                </>
              )}
            </dl>
            {topic.carried >= 3 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="text-caption text-amber-900 dark:text-amber-300">
                  Pushed {topic.carried} times. A topic that keeps sliding is
                  usually a commitment in disguise.
                </p>
                <Button
                  size="sm"
                  color="secondary"
                  className="mt-2"
                  onClick={() => {
                    api.promoteToFollowUp(topic.id);
                    api.closeTopic();
                  }}
                >
                  Make it an action item
                </Button>
              </div>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-secondary px-4 py-3">
          <Button
            size="sm"
            color="tertiary"
            onClick={() => {
              api.deleteTopic(topic.id);
              api.closeTopic();
            }}
          >
            Delete
          </Button>
          <Button size="sm" color="primary" onClick={() => api.closeTopic()}>
            Done
          </Button>
        </footer>
      </aside>
    </>
  );
}
