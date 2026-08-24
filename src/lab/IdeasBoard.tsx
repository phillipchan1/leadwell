import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Plus, SearchLg, Trash01, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { CaptureBar } from "./CaptureBar";
import { DropList } from "./DropList";
import { LabTopicCard } from "./LabTopicCard";
import { daysBetween, slotHint, slotLabel, upNextByMeeting } from "./slots";
import { tagChipClass, tagDotClass } from "./TagChip";
import { useBoardDnD } from "./useBoardDnD";
import type { LabApi } from "./store";
import type { LabTopic } from "./types";

type GroupBy = "meeting" | "tag";
type Refine = "all" | "untriaged" | "returned" | "aging";
const UNTAGGED = "untagged";
const UNASSIGNED = "unassigned";

/**
 * Everything not yet on a week.
 *
 * This used to be two surfaces. The Inbox was a queue you worked top to bottom;
 * Ideas was a board you organised on. They were the same pile twice — and the
 * split created the exact confusion it was meant to avoid, because "which of
 * these two places does this live in" is a question about our information
 * architecture, not about the user's work.
 *
 * The merge falls out of one observation: **the untriaged inbox is just the
 * "No meeting" column.** Group by meeting and the first column is the queue;
 * group by tag and the same pile becomes an organising board. One surface, two
 * lenses, and the "up next" rail sits alongside either.
 *
 * Scoped to unscheduled topics on purpose. Anything already in a week belongs to
 * the Planner; showing it here would make two surfaces argue about one card.
 */
export function IdeasBoard({ api }: { api: LabApi }) {
  const { state } = api;
  const [groupBy, setGroupBy] = useState<GroupBy>("meeting");
  const [refine, setRefine] = useState<Refine>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const matches = useCallback(
    (t: LabTopic, r: Refine): boolean => {
      if (t.status !== "open" || t.sessionId) return false;
      switch (r) {
        case "all":
          return true;
        case "untriaged":
          return !t.meetingId;
        case "returned":
          return Boolean(t.returnedOn);
        case "aging":
          return t.carried >= 3 || daysBetween(t.createdOn, state.today) >= 30;
      }
    },
    [state.today]
  );

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.topics
      .filter(
        (t) =>
          matches(t, refine) &&
          (!q ||
            t.text.toLowerCase().includes(q) ||
            t.notes?.toLowerCase().includes(q) ||
            state.tags.some(
              (tag) =>
                t.tagIds.includes(tag.id) &&
                tag.label.toLowerCase().includes(q)
            ))
      )
      .sort((a, b) => {
        // What came back sits on top — it is the only thing here you have
        // already decided about once.
        const ra = a.returnedOn ? 0 : 1;
        const rb = b.returnedOn ? 0 : 1;
        return ra - rb || a.order - b.order;
      });
  }, [state.topics, state.tags, query, refine, matches]);

  const columns = useMemo(() => {
    if (groupBy === "tag") {
      return [
        {
          key: `tag:${UNTAGGED}`,
          id: UNTAGGED,
          label: "Untagged",
          tagId: undefined as string | undefined,
          topics: pool.filter((t) => t.tagIds.length === 0),
        },
        ...state.tags.map((tag) => ({
          key: `tag:${tag.id}`,
          id: tag.id,
          label: tag.label,
          tagId: tag.id as string | undefined,
          topics: pool.filter((t) => t.tagIds.includes(tag.id)),
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
      ...state.meetings.map((m) => ({
        key: `meeting:${m.id}`,
        id: m.id,
        label: m.name,
        tagId: undefined as string | undefined,
        topics: pool.filter((t) => t.meetingId === m.id),
      })),
    ];
  }, [groupBy, state.tags, state.meetings, pool]);

  const upNext = useMemo(
    () =>
      upNextByMeeting(state.meetings, state.sessions, state.topics, state.today),
    [state.meetings, state.sessions, state.topics, state.today]
  );

  /**
   * A drop is a *move*, not an add: leaving Training and landing in Prayer
   * should mean "this is a prayer item now", not "it is both". Knowing the
   * source zone is what makes that readable.
   */
  const onDrop = useCallback(
    (topicId: string, zone: string, index: number, from: string) => {
      if (zone === from) {
        const topic = state.topics.find((t) => t.id === topicId);
        if (topic) {
          api.moveTopic(
            topicId,
            { kind: "ideas", meetingId: topic.meetingId },
            index
          );
        }
        return;
      }
      if (zone.startsWith("up:")) {
        // Straight onto the next occurrence, skipping the Planner entirely.
        const [meetingId, ...rest] = zone.slice(3).split(":");
        if (rest[0] === "s" && rest[1]) {
          api.moveTopic(topicId, {
            kind: "session",
            meetingId,
            sessionId: rest[1],
          });
        } else {
          api.moveTopic(topicId, {
            kind: "session",
            meetingId,
            date: rest.join(":"),
          });
        }
        return;
      }
      const [kind, id] = zone.split(":");
      const fromId = from.split(":")[1];
      if (kind === "tag") {
        if (fromId && fromId !== UNTAGGED) api.tagTopics([topicId], fromId, false);
        if (id !== UNTAGGED) api.tagTopics([topicId], id, true);
        return;
      }
      if (kind === "meeting") {
        api.assignTopics([topicId], id === UNASSIGNED ? null : id);
      }
    },
    [api, state.topics]
  );

  const dnd = useBoardDnD(onDrop);

  const toggleSelect = (topic: LabTopic, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked) {
        // Range across the flattened board order — the order the eye reads,
        // not per-column.
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
      api.addTopic(col.tagId ? `${raw} #${col.label}` : raw, { kind: "ideas" });
      return;
    }
    api.addTopic(raw, {
      kind: "ideas",
      meetingId: col.id === UNASSIGNED ? undefined : col.id,
    });
  };

  const count = (r: Refine) => state.topics.filter((t) => matches(t, r)).length;
  const REFINES: { id: Refine; label: string }[] = [
    { id: "all", label: "All" },
    { id: "untriaged", label: "Untriaged" },
    { id: "returned", label: "Came back" },
    { id: "aging", label: "Aging" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CaptureBar api={api} autoFocus={state.captureOpen} />

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
                api.createTag(newTag);
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
          {state.tags.map((tag) => {
            const all = ids.every((id) =>
              state.topics.find((t) => t.id === id)?.tagIds.includes(tag.id)
            );
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => api.tagTopics(ids, tag.id, !all)}
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
              api.assignTopics(
                ids,
                e.target.value === UNASSIGNED ? null : e.target.value
              );
            }}
          >
            <option value="">Assign to…</option>
            {state.meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value={UNASSIGNED}>No meeting</option>
          </select>
          <Button size="sm" color="secondary" onClick={() => api.parkTopics(ids, true)}>
            Park
          </Button>
          <Button
            size="sm"
            color="secondary"
            onClick={() => {
              api.deleteTopics(ids);
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
              const tag = col.tagId
                ? state.tags.find((t) => t.id === col.tagId)
                : undefined;
              const isQueue =
                col.id === UNASSIGNED || col.id === UNTAGGED;
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
                          className={cx(
                            "size-2 shrink-0 rounded-full",
                            tagDotClass(tag)
                          )}
                          aria-hidden
                        />
                        <input
                          value={tag.label}
                          aria-label={`Rename ${tag.label}`}
                          onChange={(e) =>
                            api.updateTag(tag.id, { label: e.target.value })
                          }
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
                          onClick={() =>
                            api.updateTag(tag.id, { color: (tag.color + 1) % 6 })
                          }
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
                          onClick={() => api.deleteTag(tag.id)}
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
                      <LabTopicCard
                        key={topic.id}
                        topic={topic}
                        zone={col.key}
                        tags={state.tags}
                        meetings={state.meetings}
                        selected={selected.has(topic.id)}
                        onToggleSelect={(shift) => toggleSelect(topic, shift)}
                        isDragging={dnd.drag?.id === topic.id}
                        handleProps={dnd.handleProps}
                        onDelete={() => api.deleteTopic(topic.id)}
                        showMeeting={groupBy === "tag"}
                        hideTagIds={col.tagId ? [col.tagId] : undefined}
                        onAcceptSuggestion={() => api.acceptSuggestion(topic.id)}
                        onOpen={() => api.openTopic(topic.id)}
                        onPromote={() => api.promoteToFollowUp(topic.id)}
                      />
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Up next — schedule without going via the Planner */}
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
                    onClick={() => api.selectMeeting(meeting.id)}
                  >
                    <div className="truncate text-xs font-medium text-stone-800 dark:text-stone-100">
                      {meeting.name}
                    </div>
                    <div className="text-caption text-quaternary">
                      {slotLabel(slot)} · {slotHint(slot, state.today)}
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
          {state.topics.find((t) => t.id === dnd.drag!.id)?.text}
        </div>
      )}
    </div>
  );
}
