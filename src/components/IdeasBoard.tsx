import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Plus, SearchLg, Trash01, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { useBoardDnD } from "@/hooks/use-board-dnd";
import { meetingSubjectName, meetingTitle } from "@/lib/readiness";
import { nextSlotAfter, plannedSlots, slotLabel } from "@/lib/topics";
import { useStore } from "@/store/useStore";
import { DropList } from "./DropList";
import { tagChipClass, tagDotClass } from "./TagChip";
import { TopicCard } from "./TopicCard";
import { TopicDetail } from "./TopicDetail";
import type { Topic } from "@/types";

type GroupBy = "meeting" | "tag";
type Refine = "all" | "untriaged" | "returned" | "aging";
const UNTAGGED = "untagged";
const UNASSIGNED = "unassigned";

function daysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Everything not yet on a week.
 *
 * This is the backlog, the inbox and the organiser at once. They were briefly
 * three ideas; they are one pile, and splitting a pile across surfaces is how
 * it quietly becomes several piles that disagree.
 *
 * The merge falls out of one observation: **the untriaged inbox is just the
 * "Not assigned" column.** Group by meeting and the first column is the queue;
 * group by tag and the same set becomes an organising board.
 *
 * Scoped to unscheduled topics on purpose. Anything already in a week belongs
 * to the planner; showing it in both would make two surfaces argue about one
 * card.
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
  const promoteToFollowUp = useStore((s) => s.promoteToFollowUp);
  const addTag = useStore((s) => s.addTag);
  const updateTag = useStore((s) => s.updateTag);
  const deleteTag = useStore((s) => s.deleteTag);
  const selectMeeting = useStore((s) => s.selectMeeting);

  const [groupBy, setGroupBy] = useState<GroupBy>("meeting");
  const [refine, setRefine] = useState<Refine>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const labelOf = useMemo(() => {
    const src = { people, teams, managers };
    return new Map(
      meetings.map((m) => [m.id, meetingTitle(m, meetingSubjectName(m, src))])
    );
  }, [meetings, people, teams, managers]);

  const matches = useCallback(
    (t: Topic, r: Refine): boolean => {
      if (t.status !== "open" || t.sessionId) return false;
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

  const columns = useMemo(() => {
    if (groupBy === "tag") {
      return [
        {
          key: `tag:${UNTAGGED}`,
          id: UNTAGGED,
          label: "Untagged",
          tagId: undefined as string | undefined,
          topics: pool.filter((t) => (t.tagIds ?? []).length === 0),
        },
        ...tags.map((tag) => ({
          key: `tag:${tag.id}`,
          id: tag.id,
          label: tag.label,
          tagId: tag.id as string | undefined,
          topics: pool.filter((t) => (t.tagIds ?? []).includes(tag.id)),
        })),
      ];
    }
    return [
      {
        key: `meeting:${UNASSIGNED}`,
        id: UNASSIGNED,
        label: "Not assigned",
        tagId: undefined as string | undefined,
        topics: pool.filter((t) => !t.meetingId),
      },
      ...meetings.map((m) => ({
        key: `meeting:${m.id}`,
        id: m.id,
        label: labelOf.get(m.id) ?? "Meeting",
        tagId: undefined as string | undefined,
        topics: pool.filter((t) => t.meetingId === m.id),
      })),
    ];
  }, [groupBy, tags, meetings, pool, labelOf]);

  /** Nearest upcoming occurrence per meeting, for the rail. */
  const upNext = useMemo(
    () =>
      meetings
        .map((m) => {
          const slots = plannedSlots(m, sessions, topics, today, 4);
          const slot = nextSlotAfter(slots);
          return slot ? { meeting: m, slot } : null;
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x)),
    [meetings, sessions, topics, today]
  );

  /**
   * A drop is a *move*, not an add: leaving Training and landing in Prayer
   * means it's a prayer item now, not both. Knowing the source zone is what
   * makes that readable.
   */
  const onDrop = useCallback(
    (topicId: string, zone: string, index: number, from: string) => {
      if (zone === from) {
        const topic = topics.find((t) => t.id === topicId);
        if (topic) {
          placeTopicAt(
            topicId,
            { kind: "lane", lane: "backlog", meetingId: topic.meetingId },
            index
          );
        }
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

  const ids = [...selected];
  const clear = () => setSelected(new Set());

  const addTo = (col: (typeof columns)[number], raw: string) => {
    if (groupBy === "tag") {
      captureTopics(col.tagId ? `${raw} #${col.label}` : raw);
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
    { id: "untriaged", label: "Untriaged" },
    { id: "returned", label: "Came back" },
    { id: "aging", label: "Aging" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Capture */}
      <form
        className="flex flex-wrap items-end gap-2 rounded-xl border border-secondary bg-primary p-3 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          captureTopics(draft);
          setDraft("");
        }}
      >
        <div className="min-w-[12rem] flex-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Something to raise…  #training @sarah !"
            aria-label="Capture a topic"
            className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm outline-none placeholder:text-quaternary focus:border-teal-400"
          />
          <p className="mt-1 text-caption text-quaternary">
            Enter to add · paste multiple lines ·{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">#tag</kbd>{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">@meeting</kbd>{" "}
            <kbd className="rounded bg-tertiary px-1 font-mono">!</kbd> urgent
          </p>
        </div>
        <Button size="md" color="primary" type="submit" isDisabled={!draft.trim()}>
          Add
        </Button>
      </form>

      {/* Lenses */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center rounded-lg border border-secondary p-0.5">
          {(["meeting", "tag"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={cx(
                "rounded-md px-2.5 py-1 text-caption font-medium transition",
                groupBy === g
                  ? "bg-teal-600 text-white dark:bg-teal-700"
                  : "text-quaternary hover:text-stone-700 dark:hover:text-stone-200"
              )}
            >
              By {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {REFINES.map((r) => {
            const n = count(r.id);
            if (n === 0 && r.id !== "all") return null;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRefine(r.id)}
                className={cx(
                  "rounded-full px-2.5 py-0.5 text-caption font-medium transition",
                  refine === r.id
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                    : r.id === "returned"
                      ? "text-amber-700 hover:bg-tertiary dark:text-amber-500"
                      : "text-quaternary hover:bg-tertiary hover:text-stone-700 dark:hover:text-stone-200"
                )}
              >
                {r.label}
                <span className="ml-1 tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-secondary px-2 py-1">
          <SearchLg className="size-3.5 text-quaternary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search ideas"
            className="w-32 bg-transparent text-xs outline-none placeholder:text-quaternary"
          />
          {query && (
            <ButtonUtility
              size="xs"
              color="tertiary"
              icon={X}
              tooltip="Clear"
              onClick={() => setQuery("")}
            />
          )}
        </div>

        {groupBy === "tag" &&
          (addingTag ? (
            <form
              className="flex items-center gap-1"
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
                placeholder="Tag name"
                aria-label="New tag name"
                className="w-28 rounded-md border border-teal-400 bg-primary px-2 py-1 text-xs outline-none"
              />
              <Button size="sm" color="secondary" type="submit">
                Add
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              color="tertiary"
              iconLeading={Plus}
              onClick={() => setAddingTag(true)}
            >
              New tag
            </Button>
          ))}
      </div>

      {/* Bulk bar — the reason a board beats a list */}
      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 dark:border-teal-800 dark:bg-teal-950/40">
          <span className="text-xs font-semibold text-teal-900 dark:text-teal-300">
            {ids.length} selected
          </span>
          <span className="text-caption text-teal-800/80 dark:text-teal-400/80">
            Tag:
          </span>
          {tags.map((tag) => {
            const all = ids.every((id) =>
              topics.find((t) => t.id === id)?.tagIds?.includes(tag.id)
            );
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => tagTopics(ids, tag.id, !all)}
                title={all ? `Remove ${tag.label}` : `Add ${tag.label}`}
                className={cx(
                  "rounded px-1.5 py-px text-caption font-medium transition",
                  tagChipClass(tag),
                  all && "ring-2 ring-teal-600"
                )}
              >
                {tag.label}
              </button>
            );
          })}
          <select
            className="rounded-md border border-secondary bg-primary px-1.5 py-1 text-caption"
            value=""
            aria-label="Assign selected to a meeting"
            onChange={(e) => {
              if (!e.target.value) return;
              assignTopics(ids, e.target.value === UNASSIGNED ? null : e.target.value);
            }}
          >
            <option value="">Assign to…</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {labelOf.get(m.id)}
              </option>
            ))}
            <option value={UNASSIGNED}>No meeting</option>
          </select>
          <Button size="sm" color="secondary" onClick={() => parkTopics(ids, true)}>
            Park
          </Button>
          <Button
            size="sm"
            color="secondary"
            onClick={() => {
              deleteTopics(ids);
              clear();
            }}
          >
            Delete
          </Button>
          <Button size="sm" color="tertiary" onClick={clear}>
            Clear
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        <div
          ref={dnd.scrollerRef}
          className="scroll-contain min-w-0 flex-1 overflow-x-auto pb-2"
        >
          <div className="inline-flex min-w-full items-stretch gap-2">
            {columns.map((col) => {
              const tag = col.tagId ? tags.find((t) => t.id === col.tagId) : undefined;
              const isQueue = col.id === UNASSIGNED || col.id === UNTAGGED;
              return (
                <div
                  key={col.key}
                  className={cx(
                    "group/col flex min-h-[58vh] w-[17rem] shrink-0 flex-col rounded-xl border",
                    isQueue
                      ? "border-stone-300 bg-stone-100/60 dark:border-stone-700 dark:bg-stone-900/50"
                      : "border-secondary bg-stone-50/40 dark:bg-stone-950/30"
                  )}
                >
                  <div className="flex items-center gap-1.5 border-b border-secondary px-2 py-2">
                    {tag ? (
                      <>
                        <span
                          className={cx("size-2 shrink-0 rounded-full", tagDotClass(tag))}
                          aria-hidden
                        />
                        <input
                          value={tag.label}
                          aria-label={`Rename ${tag.label}`}
                          onChange={(e) => updateTag(tag.id, { label: e.target.value })}
                          className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs font-semibold text-stone-800 outline-none hover:bg-tertiary focus:bg-tertiary dark:text-stone-100"
                        />
                      </>
                    ) : (
                      <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold text-stone-700 dark:text-stone-200">
                        {col.label}
                      </span>
                    )}
                    <span className="text-caption tabular-nums text-quaternary">
                      {col.topics.length}
                    </span>
                    {tag && (
                      <>
                        <button
                          type="button"
                          aria-label={`Recolor ${tag.label}`}
                          title="Recolor"
                          onClick={() => updateTag(tag.id, { color: (tag.color + 1) % 6 })}
                          className={cx(
                            "size-3 shrink-0 rounded-full ring-1 ring-stone-300 dark:ring-stone-600",
                            tagDotClass(tag)
                          )}
                        />
                        <ButtonUtility
                          size="xs"
                          color="tertiary"
                          icon={Trash01}
                          tooltip="Delete tag — topics keep their text"
                          onClick={() => deleteTag(tag.id)}
                        />
                      </>
                    )}
                  </div>

                  <DropList
                    zone={col.key}
                    topics={col.topics}
                    dnd={dnd}
                    compact={false}
                    className="flex-1 p-1.5"
                    onAdd={(raw) => addTo(col, raw)}
                    empty={
                      <p className="px-1 py-4 text-center text-caption text-quaternary">
                        {isQueue
                          ? "Nothing waiting."
                          : groupBy === "tag"
                            ? "Drag an idea here to tag it."
                            : "Drag an idea here to assign it."}
                      </p>
                    }
                    renderCard={(topic) => (
                      <TopicCard
                        key={topic.id}
                        topic={topic}
                        zone={col.key}
                        tags={tags}
                        meetingLabel={
                          topic.meetingId ? labelOf.get(topic.meetingId) : undefined
                        }
                        showMeeting={groupBy === "tag"}
                        hideTagIds={col.tagId ? [col.tagId] : undefined}
                        selected={selected.has(topic.id)}
                        onToggleSelect={(shift) => toggleSelect(topic, shift)}
                        isDragging={dnd.drag?.id === topic.id}
                        handleProps={dnd.handleProps}
                        onDelete={() => deleteTopic(topic.id)}
                        onOpen={() => setOpenId(topic.id)}
                        onPromote={() => promoteToFollowUp(topic.id)}
                        onPark={() => parkTopics([topic.id], true)}
                      />
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Up next — schedule without going via the planner */}
        <aside className="hidden w-56 shrink-0 xl:block">
          <div className="sticky top-0 space-y-2 rounded-xl border border-secondary bg-stone-50/50 p-3 dark:bg-stone-950/30">
            <h2 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
              Up next
            </h2>
            <p className="text-caption text-quaternary">
              Drop an idea on a meeting to put it in the next occurrence.
            </p>
            {upNext.map(({ meeting, slot }) => {
              const zone = slot.sessionId
                ? `up:${meeting.id}:s:${slot.sessionId}`
                : `up:${meeting.id}:${slot.date}`;
              const active = dnd.drag?.over === zone;
              return (
                <div
                  key={meeting.id}
                  ref={dnd.zoneRef(zone)}
                  className={cx(
                    "rounded-lg border bg-primary p-2 transition",
                    active
                      ? "border-teal-400 bg-teal-50 dark:bg-teal-950/40"
                      : dnd.drag
                        ? "border-dashed border-stone-300 dark:border-stone-700"
                        : "border-secondary"
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => selectMeeting(meeting.id)}
                  >
                    <div className="truncate text-xs font-medium text-stone-800 dark:text-stone-100">
                      {labelOf.get(meeting.id)}
                    </div>
                    <div className="text-caption text-quaternary">
                      {slotLabel(slot)}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {dnd.drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-lg border border-teal-400 bg-primary px-2 py-1.5 text-xs shadow-lg"
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
