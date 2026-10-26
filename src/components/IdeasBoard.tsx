import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Plus, SearchLg, Trash01, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useBoardDnD } from "@/hooks/use-board-dnd";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  daysBetween,
  meetingSubjectName,
  meetingTitle,
  readinessOf,
  todayISO,
} from "@/lib/readiness";
import { findMeeting, findTag, parseCapture, splitCaptureLines } from "@/lib/ideas";
import { nextSlotAfter, plannedSlots } from "@/lib/topics";
import { deleteWithUndo } from "@/lib/undo";
import { chainVerticalWheel } from "@/lib/scroll-chain";
import { useStore } from "@/store/useStore";
import { DropList } from "./DropList";
import { tagChipClass, tagDotClass } from "./TagChip";
import { TopicCard } from "./TopicCard";
import { TopicDetail } from "./TopicDetail";
import { Avatar } from "./Avatar";
import { RhythmRing } from "./brand/glyphs";
import { MeetingsSwitch } from "./shell/MeetingsSwitch";
import { StripPager, fitColumns, pageStrip } from "./StripPager";
import type { Topic, TrackedMeeting } from "@/types";

type GroupBy = "meeting" | "tag";
type Refine = "all" | "untriaged" | "returned" | "aging" | "parked";
const UNTAGGED = "untagged";
const UNASSIGNED = "unassigned";

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

/** "TODAY", "TOMORROW", "WED 19". */
function nextLabel(date: string, today: string): string {
  const d = daysBetween(today, date);
  if (d === 0) return "TODAY";
  if (d === 1) return "TOMORROW";
  return `${fmt(date, { weekday: "short" }).toUpperCase()} ${Number(date.slice(8, 10))}`;
}

/** An empty column is only a drop target, so it stays narrow. */
const EMPTY_COL_W = 208; // 13rem

/**
 * Everything not yet on a week.
 *
 * This is the backlog, the inbox and the organiser at once. They were briefly
 * three ideas; they are one pile, and splitting a pile across surfaces is how
 * it quietly becomes several piles that disagree.
 *
 * The merge falls out of one observation: **the untriaged inbox is just the
 * first column.** Group by meeting and that column is the queue; group by tag
 * and the same set becomes an organising board.
 *
 * Scoped to unscheduled topics on purpose. Anything already in a week belongs
 * to the planner; showing it in both would make two surfaces argue about one
 * card. Parked ideas are set aside, so they only show when asked for.
 */
export function IdeasBoard() {
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);

  const captureTopics = useStore((s) => s.captureTopics);
  const placeTopicAt = useStore((s) => s.placeTopicAt);
  const tagTopics = useStore((s) => s.tagTopics);
  const assignTopics = useStore((s) => s.assignTopics);
  const parkTopics = useStore((s) => s.parkTopics);
  const deleteTopics = useStore((s) => s.deleteTopics);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const restoreTopic = useStore((s) => s.restoreTopic);
  const promoteToFollowUp = useStore((s) => s.promoteToFollowUp);
  const addTag = useStore((s) => s.addTag);
  const updateTag = useStore((s) => s.updateTag);
  const deleteTag = useStore((s) => s.deleteTag);
  const selectMeeting = useStore((s) => s.selectMeeting);
  const isPhone = useMediaQuery("(max-width: 767px)");

  const [groupBy, setGroupBy] = useState<GroupBy>("meeting");
  const [refine, setRefine] = useState<Refine>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const today = todayISO();
  const src = useMemo(() => ({ people, teams, managers }), [people, teams, managers]);

  /** A meeting is called by its own name, or by who it's with. */
  const labelOf = useMemo(
    () =>
      new Map(
        meetings.map((m) => {
          const who = meetingSubjectName(m, src);
          return [m.id, m.name?.trim() || who || meetingTitle(m, who)];
        })
      ),
    [meetings, src]
  );

  const matches = useCallback(
    (t: Topic, r: Refine): boolean => {
      if (t.status !== "open" || t.sessionId) return false;
      if (r === "parked") return t.lane === "parked";
      if (t.lane === "parked") return false;
      switch (r) {
        case "all":
          return true;
        case "untriaged":
          return !t.meetingId;
        case "returned":
          return Boolean(t.returnedOn);
        case "aging":
          return t.carried >= 3 || daysBetween(t.createdOn, today) >= 30;
      }
    },
    [today]
  );

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics
      .filter(
        (t) =>
          matches(t, refine) &&
          (!q ||
            t.text.toLowerCase().includes(q) ||
            t.detail?.toLowerCase().includes(q) ||
            tags.some(
              (tag) =>
                (t.tagIds ?? []).includes(tag.id) &&
                tag.label.toLowerCase().includes(q)
            ))
      )
      .sort((a, b) => {
        // What came back sits on top — it's the only thing here you have
        // already made a decision about once.
        const ra = a.returnedOn ? 0 : 1;
        const rb = b.returnedOn ? 0 : 1;
        return ra - rb || a.order - b.order;
      });
  }, [topics, tags, query, refine, matches]);

  /** Nearest upcoming occurrence per meeting, soonest first. */
  const upNext = useMemo(
    () =>
      meetings
        .map((m) => {
          const slot = nextSlotAfter(plannedSlots(m, sessions, topics, today, 4));
          return slot ? { meeting: m, slot } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .sort((a, b) => a.slot.date.localeCompare(b.slot.date)),
    [meetings, sessions, topics, today]
  );
  const nextOf = useMemo(
    () => new Map(upNext.map((u) => [u.meeting.id, u.slot.date])),
    [upNext]
  );

  type Column = {
    key: string;
    id: string;
    label: string;
    tagId?: string;
    meeting?: TrackedMeeting;
    topics: Topic[];
  };

  const columns: Column[] = useMemo(() => {
    if (groupBy === "tag") {
      return [
        {
          key: `tag:${UNTAGGED}`,
          id: UNTAGGED,
          label: "Untagged",
          topics: pool.filter((t) => (t.tagIds ?? []).length === 0),
        },
        ...tags.map((tag) => ({
          key: `tag:${tag.id}`,
          id: tag.id,
          label: tag.label,
          tagId: tag.id,
          topics: pool.filter((t) => (t.tagIds ?? []).includes(tag.id)),
        })),
      ];
    }
    // Meetings with something waiting first, each group in the order they
    // next happen: the one you sit down in soonest is the one you're most
    // likely planning for, and an empty column is only a drop target.
    const order = new Map(upNext.map((u, i) => [u.meeting.id, i]));
    const waiting = new Set(pool.map((t) => t.meetingId));
    const byNext = [...meetings].sort(
      (a, b) =>
        Number(waiting.has(b.id)) - Number(waiting.has(a.id)) ||
        (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999)
    );
    return [
      {
        key: `meeting:${UNASSIGNED}`,
        id: UNASSIGNED,
        label: "Inbox",
        topics: pool.filter((t) => !t.meetingId),
      },
      ...byNext.map((m) => ({
        key: `meeting:${m.id}`,
        id: m.id,
        label: labelOf.get(m.id) ?? "Meeting",
        meeting: m,
        topics: pool.filter((t) => t.meetingId === m.id),
      })),
    ];
  }, [groupBy, tags, meetings, pool, labelOf, upNext]);

  /**
   * A drop is a *move*, not an add: leaving Training and landing in Prayer
   * means it's a prayer item now, not both. Knowing the source zone is what
   * makes that readable.
   */
  const onDrop = useCallback(
    (topicId: string, zone: string, index: number, from: string) => {
      const topic = topics.find((t) => t.id === topicId);
      if (!topic) return;
      if (zone === from) {
        // A reorder. It keeps the topic's lane, so reordering the parked pile
        // doesn't quietly unpark it.
        placeTopicAt(
          topicId,
          { kind: "lane", lane: topic.lane, meetingId: topic.meetingId },
          index
        );
        return;
      }
      if (zone.startsWith("up:")) {
        // Straight onto the next occurrence, skipping the planner entirely.
        const [meetingId, ...rest] = zone.slice(3).split(":");
        placeTopicAt(
          topicId,
          rest[0] === "s"
            ? { kind: "session", sessionId: rest[1], meetingId }
            : { kind: "projected", date: rest.join(":"), meetingId }
        );
        return;
      }
      const [kind, id] = zone.split(":");
      const fromId = from.split(":")[1];
      if (kind === "tag") {
        if (fromId && fromId !== UNTAGGED) tagTopics([topicId], fromId, false);
        if (id !== UNTAGGED) tagTopics([topicId], id, true);
        return;
      }
      if (kind === "meeting") {
        assignTopics([topicId], id === UNASSIGNED ? null : id);
      }
    },
    [topics, placeTopicAt, tagTopics, assignTopics]
  );

  const dnd = useBoardDnD(onDrop);

  /*
   * The columns are a strip wider than the page. At fixed widths the last one
   * showing was sliced through its cards; sized by `fitColumns`, the edge
   * falls between two, and the pager moves a page at a time.
   */
  const [strip, setStrip] = useState<HTMLDivElement | null>(null);
  const [stripBox, setStripBox] = useState(0);
  const [stripAt, setStripAt] = useState({ back: false, forward: false });
  const measureStrip = useCallback(() => {
    if (!strip) return;
    setStripBox(strip.clientWidth);
    const back = strip.scrollLeft > 4;
    const forward = strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1;
    setStripAt((at) => (at.back === back && at.forward === forward ? at : { back, forward }));
  }, [strip]);
  useLayoutEffect(() => {
    if (!strip) return;
    measureStrip();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measureStrip);
    ro.observe(strip);
    if (strip.firstElementChild) ro.observe(strip.firstElementChild);
    return () => ro.disconnect();
  }, [strip, measureStrip]);
  const colW = fitColumns(
    stripBox,
    columns.map((c) => ({ fixed: c.topics.length === 0 ? EMPTY_COL_W : undefined })),
    { gap: 12, min: 240, max: 352 }
  );
  const { scrollerRef } = dnd;
  const stripRef = useCallback(
    (el: HTMLDivElement | null) => {
      setStrip(el);
      // Dragging a card near the edge pans the strip.
      scrollerRef(el);
    },
    [scrollerRef]
  );

  const toggleSelect = (topic: Topic, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked) {
        // Range across the flattened board order — the order the eye reads.
        const flat = columns.flatMap((c) => c.topics.map((t) => t.id));
        const a = flat.indexOf(lastClicked);
        const b = flat.indexOf(topic.id);
        if (a >= 0 && b >= 0) {
          for (const id of flat.slice(Math.min(a, b), Math.max(a, b) + 1)) {
            next.add(id);
          }
          return next;
        }
      }
      if (next.has(topic.id)) next.delete(topic.id);
      else next.add(topic.id);
      return next;
    });
    setLastClicked(topic.id);
  };

  const ids = [...selected].filter((id) => topics.some((t) => t.id === id));
  const clear = () => setSelected(new Set());

  const removeWithUndo = (doomed: Topic[]) => {
    if (!doomed.length) return;
    deleteWithUndo(
      doomed.length === 1 ? "Idea deleted." : `${doomed.length} ideas deleted.`,
      () => (doomed.length === 1 ? deleteTopic(doomed[0].id) : deleteTopics(doomed.map((t) => t.id))),
      () => doomed.forEach((t) => restoreTopic(t))
    );
  };

  const addTo = (col: Column, raw: string) => {
    if (groupBy === "tag") {
      // Tag by id, not by appending `#Label` to the text: a two-word tag
      // ("Team building") would otherwise lose its second word to the title.
      const created = captureTopics(raw, { kind: "lane", lane: "backlog" });
      if (col.tagId && created.length) tagTopics(created, col.tagId, true);
      return;
    }
    captureTopics(raw, {
      kind: "lane",
      lane: "backlog",
      meetingId: col.id === UNASSIGNED ? undefined : col.id,
    });
  };

  const count = (r: Refine) => topics.filter((t) => matches(t, r)).length;
  const REFINES: { id: Refine; label: string }[] = [
    { id: "all", label: "All" },
    { id: "untriaged", label: "Inbox" },
    { id: "returned", label: "Came back" },
    { id: "aging", label: "Aging" },
    { id: "parked", label: "Parked" },
  ];
  const counts = { all: count("all"), returned: count("returned"), parked: count("parked") };

  const renderCard = (col: Column) => (topic: Topic) => (
    <TopicCard
      key={topic.id}
      topic={topic}
      zone={col.key}
      tags={tags}
      meetingLabel={topic.meetingId ? labelOf.get(topic.meetingId) : undefined}
      showMeeting={groupBy === "tag"}
      hideTagIds={col.tagId ? [col.tagId] : undefined}
      selected={selected.has(topic.id)}
      selecting={ids.length > 0}
      onToggleSelect={(shift) => toggleSelect(topic, shift)}
      isDragging={dnd.drag?.id === topic.id}
      handleProps={dnd.handleProps}
      onDelete={() => removeWithUndo([topic])}
      onOpen={() => setOpenId(topic.id)}
      onPromote={topic.meetingId ? () => promoteToFollowUp(topic.id) : undefined}
      onPark={() => parkTopics([topic.id], true)}
      onUnpark={topic.lane === "parked" ? () => parkTopics([topic.id], false) : undefined}
    />
  );

  const columnHeader = (col: Column) => {
    const tag = col.tagId ? tags.find((t) => t.id === col.tagId) : undefined;
    if (tag) {
      return (
        <div className="flex items-center gap-2 px-1 pb-1.5">
          <i aria-hidden className={cx("size-2.5 shrink-0 rounded-[3px]", tagDotClass(tag))} />
          <input
            value={tag.label}
            aria-label={`Rename ${tag.label}`}
            onChange={(e) => updateTag(tag.id, { label: e.target.value })}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-[14px] font-semibold text-primary outline-none hover:bg-primary focus:bg-primary"
          />
          <span className="font-mono text-[11px] text-quaternary">{col.topics.length}</span>
          <button
            type="button"
            aria-label={`Recolor ${tag.label}`}
            title="Recolor"
            onClick={() => updateTag(tag.id, { color: (tag.color + 1) % 6 })}
            className={cx("size-3.5 shrink-0 rounded-full ring-2 ring-primary", tagDotClass(tag))}
          />
          <ButtonUtility
            size="xs"
            color="tertiary"
            icon={Trash01}
            tooltip="Delete tag — ideas keep their text"
            onClick={() => deleteTag(tag.id)}
          />
        </div>
      );
    }
    if (col.meeting) {
      const m = col.meeting;
      const subject = meetingSubjectName(m, src);
      const photo =
        m.subjectKind === "person"
          ? people.find((p) => p.id === m.subjectId)?.photo
          : m.subjectKind === "manager"
            ? managers.find((x) => x.id === m.subjectId)?.photo
            : undefined;
      const next = nextOf.get(m.id);
      return (
        <button
          type="button"
          onClick={() => selectMeeting(m.id)}
          title={`Open ${col.label}`}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-1 pb-1.5 text-left"
        >
          <Avatar
            name={subject || col.label}
            photo={photo}
            size={30}
            className={m.subjectKind === "team" ? "!rounded-[9px]" : undefined}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-serif text-[17px] leading-5 text-primary">{col.label}</span>
            <span className="truncate font-mono text-[10.5px] text-quaternary">
              {m.subjectKind === "team" ? "TEAM" : "1:1"}
              {next ? ` · NEXT ${nextLabel(next, today)}` : ""}
            </span>
          </span>
          <span className="font-mono text-[11px] text-quaternary">{col.topics.length}</span>
        </button>
      );
    }
    return (
      <div className="flex items-baseline gap-2 px-1 pb-1.5">
        <span className="text-[14px] font-semibold text-primary">{col.label}</span>
        <span className="font-mono text-[11px] text-quaternary">{col.topics.length}</span>
      </div>
    );
  };

  const isQueue = (col: Column) => col.id === UNASSIGNED || col.id === UNTAGGED;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-5 pb-24">
      <MeetingsSwitch current="ideas" />

      <header className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-[34px] leading-10 font-medium tracking-[-0.01em] sm:text-[40px] sm:leading-[44px]">
            Ideas
          </h1>
          <p className="font-serif text-[17px] text-secondary italic sm:text-[18px]">
            What do I want to raise?
          </p>
        </div>
        <span className="ml-auto pb-1.5 font-mono text-[11.5px] tracking-[0.03em] text-quaternary max-sm:hidden">
          {counts.all} OPEN
          {counts.returned ? ` · ${counts.returned} CAME BACK` : ""}
          {counts.parked ? ` · ${counts.parked} PARKED` : ""}
        </span>
      </header>

      <CaptureBar
        meetings={meetings}
        labelOf={labelOf}
        matchLabel={(m) => m.name ?? meetingSubjectName(m, src) ?? "Meeting"}
        onCapture={(raw) => captureTopics(raw)}
      />

      {/* Lenses */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="inline-flex gap-0.5 rounded-[11px] bg-tertiary p-[3px]" role="radiogroup" aria-label="Group by">
          {(["meeting", "tag"] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={groupBy === g}
              onClick={() => setGroupBy(g)}
              className={cx(
                "h-8 rounded-lg px-3 text-[13px] transition-colors touch:min-h-11",
                groupBy === g
                  ? "bg-primary font-semibold text-primary shadow-[0_1px_2px_rgba(10,34,37,0.12)]"
                  : "font-medium text-tertiary hover:text-secondary"
              )}
            >
              By {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Show">
          {REFINES.map((r) => {
            const n = count(r.id);
            if (n === 0 && r.id !== "all" && refine !== r.id) return null;
            const on = refine === r.id;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => setRefine(r.id)}
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors touch:min-h-11",
                  on
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : r.id === "returned"
                      ? "text-cond-watch-ink hover:bg-secondary"
                      : "text-tertiary hover:bg-secondary hover:text-secondary"
                )}
              >
                {r.label}
                <span className="font-mono text-[10.5px] opacity-70">{n}</span>
              </button>
            );
          })}
        </div>

        {!isPhone && (stripAt.back || stripAt.forward) && (
          <span className="sm:ml-auto">
            <StripPager
              canBack={stripAt.back}
              canForward={stripAt.forward}
              onPage={(dir) => strip && pageStrip(strip, dir, { gap: 12 })}
              backLabel="Previous columns"
              forwardLabel="More columns"
              forwardText="More"
            />
          </span>
        )}
        <div
          className={cx(
            "flex h-9 w-full items-center gap-2 rounded-[9px] bg-tertiary px-2.5 sm:w-56",
            !(!isPhone && (stripAt.back || stripAt.forward)) && "sm:ml-auto"
          )}
        >
          <SearchLg aria-hidden className="size-3.5 shrink-0 text-quaternary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ideas…"
            aria-label="Search ideas"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-quaternary"
          />
          {query && (
            <ButtonUtility size="xs" color="tertiary" icon={X} tooltip="Clear" onClick={() => setQuery("")} />
          )}
        </div>

        {groupBy === "tag" &&
          (addingTag ? (
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                addTag(newTag);
                setNewTag("");
                setAddingTag(false);
              }}
            >
              <input
                autoFocus
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onBlur={() => !newTag.trim() && setAddingTag(false)}
                onKeyDown={(e) => e.key === "Escape" && setAddingTag(false)}
                placeholder="Tag name"
                aria-label="New tag name"
                className="h-9 w-32 rounded-[9px] border border-teal-300 bg-primary px-2.5 text-[13px] outline-none dark:border-teal-700"
              />
              <button
                type="submit"
                className="h-9 rounded-[9px] bg-teal-600 px-3 text-[13px] font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingTag(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-semibold text-teal-700 hover:bg-secondary dark:text-teal-400"
            >
              <Plus aria-hidden className="size-4" />
              New tag
            </button>
          ))}
      </div>

      {isPhone ? (
        <div className="flex flex-col gap-6">
          {columns
            .filter((c) => c.topics.length > 0 || dnd.drag)
            .map((col) => (
              <section key={col.key} className="group/col flex flex-col gap-2">
                {columnHeader(col)}
                <DropList
                  zone={col.key}
                  topics={col.topics}
                  dnd={dnd}
                  compact={false}
                  renderCard={renderCard(col)}
                />
              </section>
            ))}
          {pool.length === 0 && (
            <p className="py-8 font-serif text-[18px] text-secondary italic">
              {refine === "all" && !query ? "Nothing waiting. Capture something above." : "Nothing matches."}
            </p>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-start gap-5">
          <div
            // A new lens starts from its first column, not wherever the last one was scrolled.
            key={groupBy}
            ref={stripRef}
            onScroll={measureStrip}
            onWheel={chainVerticalWheel}
            className="scroll-contain min-w-0 flex-1 overflow-x-auto pb-3"
          >
            <div className="inline-flex min-w-full items-start gap-3">
              {columns.map((col) => {
                const queue = isQueue(col);
                // An empty column is only a target: narrow, and quiet about it.
                const empty = col.topics.length === 0;
                return (
                  <section
                    key={col.key}
                    aria-label={col.label}
                    data-lane
                    style={{ width: empty ? EMPTY_COL_W : colW }}
                    className={cx(
                      "group/col flex min-h-[24rem] shrink-0 flex-col gap-2 rounded-[16px] p-3",
                      queue
                        ? "border-[1.5px] border-dashed border-primary"
                        : empty
                          ? "bg-secondary"
                          : "bg-tertiary"
                    )}
                  >
                    {columnHeader(col)}
                    {queue && empty && !dnd.drag && (
                      <div className="flex flex-col gap-3 px-1">
                        <p className="text-[12.5px] leading-[18px] text-tertiary">
                          {groupBy === "tag"
                            ? "Ideas with no tag land here."
                            : "Ideas with no meeting yet land here."}
                        </p>
                        <p className="font-serif text-[17px] text-secondary italic">All filed.</p>
                      </div>
                    )}
                    {(
                      <DropList
                        zone={col.key}
                        topics={col.topics}
                        dnd={dnd}
                        compact={false}
                        className="flex-1 p-0.5"
                        onAdd={(raw) => addTo(col, raw)}
                        addLabel={
                          col.meeting
                            ? `Add for ${col.label}`
                            : col.tagId
                              ? `Add to ${col.label}`
                              : "Add an idea"
                        }
                        empty={
                          queue ? null : (
                            <p className="px-2 py-3 text-[12.5px] leading-[18px] text-quaternary">
                              {groupBy === "tag" ? "Drag an idea here to tag it." : "Drag an idea here to file it."}
                            </p>
                          )
                        }
                        renderCard={renderCard(col)}
                      />
                    )}
                  </section>
                );
              })}
            </div>
          </div>

          {/* Up next — schedule without going via the planner */}
          <aside className="sticky top-0 hidden w-[15rem] shrink-0 flex-col gap-2.5 rounded-[16px] border border-secondary bg-primary px-3.5 py-4 xl:flex">
            <span className="eyebrow">Up next</span>
            <p className="text-[12.5px] leading-[18px] text-tertiary">
              Drop an idea on a meeting to put it on the very next one.
            </p>
            <ul className="flex flex-col gap-1">
              {upNext.map(({ meeting, slot }) => {
                const zone = slot.sessionId
                  ? `up:${meeting.id}:s:${slot.sessionId}`
                  : `up:${meeting.id}:${slot.date}`;
                const active = dnd.drag?.over === zone;
                const reading = readinessOf(meeting, { meetings, sessions, topics });
                const soon = daysBetween(today, slot.date) <= 0;
                return (
                  <li key={meeting.id} ref={dnd.zoneRef(zone)}>
                    <button
                      type="button"
                      onClick={() => selectMeeting(meeting.id)}
                      className={cx(
                        "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-teal-50 shadow-[inset_0_0_0_1.5px_var(--color-teal-600)] dark:bg-teal-950/50"
                          : dnd.drag
                            ? "shadow-[inset_0_0_0_1px_var(--color-border-primary)]"
                            : "hover:bg-secondary"
                      )}
                    >
                      <RhythmRing reading={reading} size={20} />
                      <span className="min-w-0 flex-1 truncate font-serif text-[15px] text-primary">
                        {labelOf.get(meeting.id)}
                      </span>
                      <span
                        className={cx(
                          "shrink-0 font-mono text-[10.5px]",
                          soon ? "text-teal-700 dark:text-teal-300" : "text-quaternary"
                        )}
                      >
                        {slot.projected ? "~" : ""}
                        {nextLabel(slot.date, today)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}

      {/* Bulk — the reason a board beats a list */}
      {ids.length > 0 && (
        <div
          role="toolbar"
          aria-label={`${ids.length} selected`}
          className="sticky bottom-4 z-30 mx-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-[14px] bg-leather py-2 pr-2 pl-4 text-leather-fg shadow-[0_14px_32px_-10px_rgba(10,34,37,0.45),0_2px_6px_rgba(10,34,37,0.18)]"
        >
          <span className="text-[13px] font-semibold">
            <span className="font-mono text-gilt">{ids.length}</span> selected
          </span>
          <i aria-hidden className="mx-1.5 h-5 w-px bg-leather-line" />
          <span className="text-[12px] text-leather-ink">Tag</span>
          {tags.map((tag) => {
            const all = ids.every((id) => topics.find((t) => t.id === id)?.tagIds?.includes(tag.id));
            return (
              <button
                key={tag.id}
                type="button"
                aria-pressed={all}
                onClick={() => tagTopics(ids, tag.id, !all)}
                title={all ? `Remove ${tag.label}` : `Add ${tag.label}`}
                className={cx(
                  "inline-flex h-7 items-center gap-1.5 rounded-[7px] border px-2 text-[12px] font-medium transition-colors",
                  all
                    ? "border-leather-line bg-leather-hi text-leather-fg"
                    : "border-transparent text-leather-ink hover:text-leather-fg"
                )}
              >
                <i aria-hidden className={cx("size-2 rounded-[2px]", tagDotClass(tag))} />
                {tag.label}
              </button>
            );
          })}
          <i aria-hidden className="mx-1.5 h-5 w-px bg-leather-line" />
          <label className="relative inline-flex h-8 items-center rounded-lg px-2 text-[12.5px] font-semibold hover:bg-leather-hi">
            <span className="sr-only">File selected under a meeting</span>
            Move to…
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                assignTopics(ids, e.target.value === UNASSIGNED ? null : e.target.value);
              }}
            >
              <option value="">Move to…</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>
                  {labelOf.get(m.id)}
                </option>
              ))}
              <option value={UNASSIGNED}>Inbox (no meeting)</option>
            </select>
          </label>
          {refine === "parked" ? (
            <button
              type="button"
              onClick={() => {
                parkTopics(ids, false);
                clear();
              }}
              className="h-8 rounded-lg px-2.5 text-[12.5px] font-semibold hover:bg-leather-hi"
            >
              Bring back
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                parkTopics(ids, true);
                clear();
              }}
              className="h-8 rounded-lg px-2.5 text-[12.5px] font-semibold hover:bg-leather-hi"
            >
              Park
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              removeWithUndo(topics.filter((t) => ids.includes(t.id)));
              clear();
            }}
            className="h-8 rounded-lg px-2.5 text-[12.5px] font-semibold text-[#F2A3A8] hover:bg-leather-hi"
          >
            Delete
          </button>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clear}
            className="flex size-8 items-center justify-center rounded-lg bg-leather-hi text-leather-ink hover:text-leather-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {dnd.drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -rotate-2 rounded-[11px] border border-teal-200 bg-primary px-3 py-2.5 text-[13.5px] leading-[19px] shadow-[0_14px_32px_-10px_rgba(10,34,37,0.35),0_2px_6px_rgba(10,34,37,0.12)] dark:border-teal-800"
          style={{
            left: dnd.drag.x - dnd.drag.dx,
            top: dnd.drag.y - dnd.drag.dy,
            width: dnd.drag.width,
          }}
        >
          {topics.find((t) => t.id === dnd.drag!.id)?.text}
        </div>
      )}

      {openId && <TopicDetail topicId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/**
 * The capture box, with the grammar read back as you type: where the idea
 * will land and what it'll be tagged, before you press Enter.
 */
function CaptureBar({
  meetings,
  labelOf,
  matchLabel,
  onCapture,
}: {
  meetings: TrackedMeeting[];
  labelOf: Map<string, string>;
  matchLabel: (m: TrackedMeeting) => string;
  onCapture: (raw: string) => void;
}) {
  const tags = useStore((s) => s.tags);
  const [draft, setDraft] = useState("");
  const lines = splitCaptureLines(draft);
  const preview = lines.length === 1 ? parseCapture(lines[0]) : null;
  const meeting =
    preview?.meetingQuery != null ? findMeeting(preview.meetingQuery, meetings, matchLabel) : undefined;
  const tagHits = preview
    ? preview.tagLabels.map((l) => ({ label: l, tag: findTag(l, tags) }))
    : [];

  return (
    <form
      className="flex flex-col gap-2.5 rounded-[16px] border border-secondary bg-primary p-3 pl-4 shadow-[0_1px_2px_rgba(10,34,37,0.05)] focus-within:border-teal-300 dark:focus-within:border-teal-800"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onCapture(draft);
        setDraft("");
      }}
    >
      <div className="flex items-start gap-3">
        <textarea
          value={draft}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!draft.trim()) return;
              onCapture(draft);
              setDraft("");
              (e.target as HTMLTextAreaElement).style.height = "auto";
            }
          }}
          placeholder="Something to raise…  #tag @name"
          aria-label="Capture an idea"
          className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-6 outline-none placeholder:text-quaternary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-teal-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
        >
          Add <span className="font-mono text-[11px] opacity-80">↵</span>
        </button>
      </div>
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-secondary pt-2.5 text-[12.5px] text-tertiary"
        aria-live="polite"
      >
        {lines.length > 1 ? (
          <span>{lines.length} ideas, one per line.</span>
        ) : preview && (meeting || tagHits.length || preview.urgent) ? (
          <span className="flex flex-wrap items-center gap-2 text-secondary">
            {meeting ? (
              <>
                Lands with
                <b className="font-serif text-[15px] font-normal text-primary">{labelOf.get(meeting.id)}</b>
              </>
            ) : (
              "Lands in the inbox"
            )}
            {tagHits.length > 0 && (
              <>
                as
                {tagHits.map(({ label, tag }) => (
                  <span
                    key={label}
                    className={cx(
                      "inline-flex h-[21px] items-center gap-1.5 rounded-[6px] px-1.5 text-[11px] font-medium",
                      tag ? tagChipClass(tag) : "bg-secondary text-secondary"
                    )}
                  >
                    {tag && <i aria-hidden className={cx("size-[7px] rounded-[2px]", tagDotClass(tag))} />}
                    {tag ? tag.label : `${label} (new)`}
                  </span>
                ))}
              </>
            )}
            {preview.urgent && <span className="font-semibold text-cond-critical-ink">· urgent</span>}
          </span>
        ) : (
          <span>Enter to add. Paste a list for many.</span>
        )}
        <span className="ml-auto flex flex-wrap gap-3 max-sm:hidden">
          <span>
            <span className="font-mono text-[11.5px]">#tag</span> label
          </span>
          <span>
            <span className="font-mono text-[11.5px]">@name</span> meeting
          </span>
          <span>
            <span className="font-mono text-[11.5px]">!</span> urgent
          </span>
        </span>
      </div>
    </form>
  );
}
