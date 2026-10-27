import { useMemo, useState } from "react";
import type { Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  boardLayout,
  curriculumOf,
  effectiveSlotId,
  ensureSessionId,
  parseColumnKey,
  slotDotClass,
  slotKey,
  type Slot,
  type WeekColumn,
} from "../lib/topics";
import { daysBetween, todayISO } from "../lib/readiness";
import { startMeeting } from "../lib/liveMeeting";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import { Edit03, Play, Plus } from "@untitledui/icons";
import { InlineComposer } from "./InlineComposer";
import { TopicDetail } from "./TopicDetail";
import type { BoardDirection } from "./TopicBoard";
import { announce } from "@/lib/announce";
import { cx } from "@/utils/cx";

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

/**
 * The planner on a phone.
 *
 * Eight week columns don't fit a 390px screen, and dragging a card across a
 * strip you also have to scroll is a fight with your own thumb. So the weeks
 * stack, each one a card with its sections, and placing an idea is two taps:
 * pick it from the drawer, then tap where it goes.
 */
export function PhonePlan({
  meeting,
  direction = "down",
  ahead,
  onSelectWeek,
  onOpenSession,
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
  ahead?: number;
  onSelectWeek: (key: string, slot: Slot) => void;
  onOpenSession?: (sessionId: string) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const placeTopicAt = useStore((s) => s.placeTopicAt);
  const captureTopics = useStore((s) => s.captureTopics);
  const coverTopic = useStore((s) => s.coverTopic);
  const addSession = useStore((s) => s.addSession);
  const [placing, setPlacing] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [capturing, setCapturing] = useState(false);

  const today = todayISO();
  const curriculum = curriculumOf(meeting);
  const layout = useMemo(
    () => boardLayout(meeting, sessions, topics, today, { ahead }),
    [meeting, sessions, topics, today, ahead]
  );
  const ideas = layout.bucket.slice(0, -1).flatMap((g) => g.topics);
  const placingTopic = placing ? topics.find((t) => t.id === placing) : undefined;
  const placingRow = placingTopic ? effectiveSlotId(placingTopic, curriculum) : undefined;

  // Past weeks only earn a card while something on them is still open.
  const weeks = layout.weeks.filter(
    (w) => !w.slot.past || w.topics.some((t) => t.status === "open")
  );
  const nextKey = layout.weeks.find((w) => !w.slot.past)?.key;

  const placeInto = (cellKey: string, at: number, label: string) => {
    if (!placingTopic) return;
    placeTopicAt(placingTopic.id, { ...parseColumnKey(cellKey), meetingId: meeting.id }, at);
    announce(`Placed “${placingTopic.text}” in ${label}.`);
    setPlacing(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {placingTopic && (
        <div
          role="status"
          className="sticky top-12 z-10 flex items-center gap-2.5 rounded-[12px] bg-leather px-3.5 py-2.5 text-leather-fg shadow-lg"
        >
          <span className="min-w-0 flex-1 text-[12.5px] leading-[17px]">
            <span className="text-leather-ink">Placing</span> {placingTopic.text}.{" "}
            <span className="text-leather-ink">Tap where it goes.</span>
          </span>
          <button
            type="button"
            onClick={() => setPlacing(null)}
            className="h-9 shrink-0 rounded-lg bg-leather-hi px-3 text-[12.5px] font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      {weeks.length === 0 && (
        <p className="py-8 font-serif text-[18px] text-secondary italic">
          Nothing on the calendar yet. Set how often you meet in Settings.
        </p>
      )}

      {weeks.map((week) => (
        <WeekCard
          key={week.key}
          week={week}
          today={today}
          next={week.key === nextKey}
          curriculum={curriculum}
          tags={tags}
          placing={Boolean(placingTopic)}
          placingRow={placingRow}
          onOpenWeek={() => onSelectWeek(slotKey(week.slot), week.slot)}
          onStart={
            onOpenSession
              ? () => {
                  const id = ensureSessionId(meeting.id, week.slot, sessions, addSession);
                  // A past week opens for notes; anything else is starting it.
                  if (!week.slot.past) startMeeting(id);
                  onOpenSession(id);
                }
              : undefined
          }
          onOpenTopic={setOpenId}
          onCover={(t, on) => coverTopic(t.id, on)}
          onPlace={placeInto}
          onAdd={(raw, cellKey) =>
            captureTopics(raw, { ...parseColumnKey(cellKey), meetingId: meeting.id })
          }
        />
      ))}

      {/* The drawer: this meeting's ideas, one tap from any week. */}
      <section
        aria-label="Ideas"
        className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-col gap-2.5 rounded-t-[20px] bg-tertiary px-4 pt-3 pb-4 shadow-[0_-12px_28px_-16px_rgba(10,34,37,0.35)]"
      >
        <div className="flex items-baseline gap-2">
          <h2 className="font-serif text-[19px]">Ideas</h2>
          <span className="font-mono text-[11px] text-quaternary">{ideas.length}</span>
          <span className="ml-auto text-[12px] text-tertiary">
            {ideas.length ? "Tap one, then a week" : "Nothing waiting"}
          </span>
          <button
            type="button"
            onClick={() => setCapturing((v) => !v)}
            aria-expanded={capturing}
            aria-label={capturing ? "Stop adding ideas" : "Add an idea"}
            className="-my-2 -mr-2 flex size-11 items-center justify-center rounded-full text-teal-700 dark:text-teal-400"
          >
            <Plus className={cx("size-5 transition-transform", capturing && "rotate-45")} />
          </button>
        </div>
        {ideas.length > 0 && (
          <ul className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4">
            {ideas.map((t) => {
              const row = effectiveSlotId(t, curriculum);
              const label = curriculum.find((s) => s.id === row)?.label;
              const on = placing === t.id;
              return (
                <li key={t.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPlacing(on ? null : t.id)}
                    className={cx(
                      "flex h-full w-[10.5rem] flex-col gap-1.5 rounded-[12px] px-3 py-2.5 text-left text-[13px] leading-[17px] transition-colors",
                      on
                        ? "bg-teal-600 font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
                        : "border border-secondary bg-primary text-primary"
                    )}
                  >
                    {label && (
                      <span className={cx("flex items-center gap-1.5 text-[11px]", on ? "opacity-85" : "text-tertiary")}>
                        <i aria-hidden className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, row, tags))} />
                        {label}
                      </span>
                    )}
                    <span className="line-clamp-3">{t.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {(capturing || ideas.length === 0) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            captureTopics(draft, { kind: "lane", lane: "backlog", meetingId: meeting.id });
            setDraft("");
          }}
          className="flex h-11 items-center gap-2 rounded-[11px] border border-secondary bg-primary px-3"
        >
          <Plus aria-hidden className="size-4 shrink-0 text-quaternary" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={direction === "up" ? "Ask, escalate, flag…  #tag" : "Something to raise…  #tag"}
            aria-label="Add an idea"
            enterKeyHint="done"
            autoFocus={capturing}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-quaternary"
          />
        </form>
        )}
      </section>

      {openId && <TopicDetail topicId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function WeekCard({
  week,
  today,
  next,
  curriculum,
  tags,
  placing,
  placingRow,
  onOpenWeek,
  onStart,
  onOpenTopic,
  onCover,
  onPlace,
  onAdd,
}: {
  week: WeekColumn;
  today: string;
  next: boolean;
  curriculum: ReturnType<typeof curriculumOf>;
  tags: { id: string; color: number }[];
  placing: boolean;
  placingRow?: string;
  onOpenWeek: () => void;
  onStart?: () => void;
  onOpenTopic: (id: string) => void;
  onCover: (t: Topic, on: boolean) => void;
  onPlace: (cellKey: string, at: number, label: string) => void;
  onAdd: (raw: string, cellKey: string) => void;
}) {
  const past = week.slot.past;
  const expected = week.slot.projected && !past;
  const days = daysBetween(today, week.slot.date);
  const when = past
    ? "Not covered yet"
    : days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : `In ${days} days`;
  const name = fmt(week.slot.date, { weekday: "short", month: "short", day: "numeric" });

  const sections = curriculum.length
    ? [
        ...curriculum.map((s) => ({ id: s.id, label: s.label, slotId: s.id as string | undefined })),
        { id: "untagged", label: "Untagged", slotId: undefined },
      ]
    : [{ id: "all", label: "", slotId: undefined }];

  return (
    <section
      className={cx(
        "flex flex-col gap-3 rounded-[16px] p-3.5",
        past
          ? "border border-cond-watch bg-primary"
          : next
            ? "bg-primary ring-[1.5px] ring-teal-600 shadow-[0_0_0_5px_var(--color-teal-50)] dark:shadow-none"
            : expected
              ? "border-[1.5px] border-dashed border-primary"
              : "border border-secondary bg-primary"
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenWeek}
          aria-label={`Open ${fmt(week.slot.date, { weekday: "long", month: "long", day: "numeric" })}`}
          className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left"
        >
          <span className="font-mono text-[10.5px] text-quaternary">
            {fmt(week.slot.date, { weekday: "short" }).toUpperCase()}
          </span>
          <span className="font-serif text-[24px] leading-[26px]">{Number(week.slot.date.slice(8, 10))}</span>
          <span className={cx("truncate text-[12.5px]", past ? "text-cond-watch-ink" : "text-secondary")}>
            {fmt(week.slot.date, { month: "short" })} · {when}
          </span>
        </button>
        {(next || days === 0) && !past && !placing && onStart && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-teal-600 px-3 text-[12.5px] font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
          >
            <Play aria-hidden className="size-3" />
            Start
          </button>
        )}
        {/* Going back to write one up after the fact. */}
        {past && !placing && onStart && (
          <button
            type="button"
            onClick={onStart}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[12.5px] font-semibold text-teal-700 dark:text-teal-400"
          >
            <Edit03 aria-hidden className="size-3.5" />
            Notes
          </button>
        )}
      </div>

      {sections.map((s) => {
        const cell = s.slotId
          ? week.cells.find((c) => c.slotId === s.slotId)
          : week.cells.find((c) => !c.slotId);
        if (!cell) return null;
        // The untagged section only shows when it has something, or could.
        if (s.id === "untagged" && cell.topics.length === 0 && !(placing && !placingRow)) return null;
        const match = placing && (s.slotId ?? undefined) === placingRow;
        const where = s.label ? `${name} · ${s.label}` : name;
        return (
          <div key={s.id} className="flex flex-col gap-1.5">
            {s.label && (
              <span className="eyebrow flex items-center gap-1.5">
                {s.slotId && (
                  <i aria-hidden className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, s.slotId, tags))} />
                )}
                {s.label}
              </span>
            )}
            {cell.topics.map((t) => {
              const done = t.status !== "open";
              return (
                <div
                  key={t.id}
                  className={cx(
                    "flex items-center gap-2.5 rounded-[10px] border px-3 py-0.5",
                    done ? "border-transparent bg-secondary" : "border-secondary bg-primary"
                  )}
                >
                  {week.slot.sessionId && (
                    <Checkbox
                      size="md"
                      aria-label={`Covered: “${t.text}”`}
                      isSelected={done}
                      onChange={(on) => onCover(t, on)}
                      className="shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenTopic(t.id)}
                    className={cx(
                      "min-w-0 flex-1 py-2 text-left text-[14.5px] leading-5",
                      done ? "text-quaternary line-through" : "text-primary"
                    )}
                  >
                    {t.text}
                  </button>
                </div>
              );
            })}
            {placing && !past ? (
              <button
                type="button"
                onClick={() => onPlace(cell.key, cell.topics.length, where)}
                className={cx(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-semibold",
                  match
                    ? "border-[1.5px] border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                    : "border-[1.5px] border-dashed border-primary text-tertiary"
                )}
              >
                {match && <Plus aria-hidden className="size-4" />}
                {match && s.label ? `Place in ${s.label}` : "Place here"}
              </button>
            ) : (
              !past &&
              cell.topics.length === 0 && (
                <InlineComposer
                  compact
                  label={s.label ? `Add to ${s.label}` : "Add a topic"}
                  placeholder={s.label ? `Add to ${s.label}…` : "Add a topic…"}
                  onAdd={(raw) => onAdd(raw, cell.key)}
                />
              )
            )}
          </div>
        );
      })}
    </section>
  );
}
