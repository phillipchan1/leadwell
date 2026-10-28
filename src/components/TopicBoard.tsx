import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type { CurriculumSlot, Session, Tag, Topic, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { useBoardDnD } from "@/hooks/use-board-dnd";
import { useBoardSelection } from "@/hooks/use-board-selection";
import { ContextMenu, type MenuEntry } from "./ContextMenu";
import { arcPlan, liveArcs } from "../lib/arcs";
import { ARC_STEP_MIME, ArcGridStep, moveArcStepTo, type ArcStepDrag } from "./arcs/ArcGridStep";
import { InlineComposer } from "./InlineComposer";
import { TopicDetail } from "./TopicDetail";
import {
  boardLayout,
  curriculumOf,
  ensureSessionId,
  looseTopics,
  nextSlotAfter,
  parseColumnKey,
  plannedSlots,
  SLOTS_AHEAD,
  slotDotClass,
  slotKey,
  type BucketGroup,
  type Slot,
  type WeekCell,
  type WeekColumn,
} from "../lib/topics";
import { MEETING_LABEL, daysBetween, todayISO } from "../lib/readiness";
import { startMeeting } from "../lib/liveMeeting";
import { chainVerticalWheel } from "../lib/scroll-chain";
import { sessionSummary } from "../lib/session";
import { deleteWithUndo, doWithUndo } from "../lib/undo";
import { toast } from "../lib/toasts";
import { Checkbox } from "@/components/base/checkbox/checkbox";
import {
  ArrowRight,
  CheckCircle,
  ChevronRight,
  Copy01,
  CornerUpLeft,
  DotsGrid,
  Edit03,
  Flag01,
  FlipBackward,
  LayersTwo01,
  Maximize01,
  PauseCircle,
  Play,
  Plus,
  Trash01,
  Lock01,
  Users01,
} from "@untitledui/icons";
import { StripPager, fitColumns, pageStrip } from "./StripPager";
import {
  useReorderableRow,
  type MoveResult,
} from "@/hooks/use-reorderable-row";
import { announce } from "@/lib/announce";
import { MOD_LABEL, hasMod, isTypingTarget, ownsKeyboard } from "@/lib/keys";
import { IdeasIcon } from "./shell/places";
import { Avatar } from "./Avatar";
import { shareFirstName, sharedWithLabel, sharesFor } from "../lib/shares";
import { FromThemBar, FromThemContext, useFreshFromThem, useFromThem } from "./sharing/fromThem";
import { cx } from "@/utils/cx";

/**
 * The planner: this meeting's ideas in a tray on the left, its weeks laid out
 * to the right as sheets, one row per section of the standing agenda.
 *
 * Both halves stay mounted so a card can be dragged from the tray onto a week
 * and back without switching views. The grid is the point of the page — it
 * shows at a glance which weeks are planned and which sections keep getting
 * skipped, which is the thing no calendar shows you.
 */

export type BoardDirection = "down" | "up";

const HANDLE_LABEL = (name: string) =>
  `Move “${name}” — Alt with up or down arrow to reorder, Delete to remove`;

const CAPTURE_PLACEHOLDER: Record<BoardDirection, string> = {
  down: "Something to raise…",
  up: "Ask, escalate, flag…",
};

type MoveGroup = { label: string; options: { key: string; label: string }[] };

type CardHandlers = {
  moveGroups: MoveGroup[];
  handleProps: ReturnType<typeof useBoardDnD>["handleProps"];
  onMove: (id: string, key: string) => void;
  onReorder: (id: string, direction: -1 | 1) => MoveResult;
  onCover: (id: string, covered: boolean) => void;
  onRoll: (topic: Topic) => void;
  onBacklog: (id: string) => void;
  onDelete: (topic: Topic) => void;
  /** Capture straight into a cell, with the `#tag @meeting !` grammar. */
  onAddHere?: (raw: string, key: string) => void;
  /** Open the full idea — title, sub-points, notes, placement. */
  onOpen?: (id: string) => void;
  /** Selected cards, by id — the highlight, and what a right-click acts on. */
  selected: ReadonlySet<string>;
  /** Cards in the air: the one being dragged, and the rest of its group. */
  lifted: (id: string) => boolean;
  /** ⌘/Ctrl-click and Shift-click on a card. */
  onPick: (
    id: string,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => void;
  /** A plain click lets go of the selection before it opens the card. */
  onPlain: () => void;
  /** Right-click, or the menu key from the keyboard. Coordinates are the viewport's. */
  onMenu: (id: string, x: number, y: number, fromKeyboard: boolean) => void;
};

const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

/** "Mon, Aug 17" — the week's name everywhere a list has to say it. */
export function weekName(iso: string): string {
  return fmtDay(iso, { weekday: "short", month: "short", day: "numeric" });
}

export function TopicBoard({
  meeting,
  direction = "down",
  selectedSlotKey,
  onSelectWeek,
  ahead,
  narrow = false,
  occurrence,
}: {
  meeting: TrackedMeeting;
  direction?: BoardDirection;
  selectedSlotKey?: string | null;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
  ahead?: number;
  /** A side panel, not a page: the tray starts folded so the weeks get the room. */
  narrow?: boolean;
  /**
   * Draw one occurrence (by date) as a full-width running order instead of
   * the strip of weeks. The Agenda uses it: same cards, same drops, same
   * ideas tray — one meeting with room to read it.
   *
   * By date rather than slot key because the key changes under you: a
   * projected week becomes a real session the moment something lands on it.
   */
  occurrence?: string;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const placeTopic = useStore((s) => s.placeTopic);
  const placeTopicAt = useStore((s) => s.placeTopicAt);
  const captureTopics = useStore((s) => s.captureTopics);
  const coverTopic = useStore((s) => s.coverTopic);
  const rollTopic = useStore((s) => s.rollTopic);
  const deleteTopic = useStore((s) => s.deleteTopic);
  const restoreTopic = useStore((s) => s.restoreTopic);
  const moveTopic = useStore((s) => s.moveTopic);
  const addTopic = useStore((s) => s.addTopic);
  const updateTopic = useStore((s) => s.updateTopic);
  const meetingShared = useStore((s) => s.shares.some((x) => x.meetingId === meeting.id));
  const allShares = useStore((s) => s.shares);
  const meetingShares = useMemo(() => sharesFor(allShares, meeting.id), [allShares, meeting.id]);
  // What the other chair brought, ideas included: theirs to see apart from mine.
  const theirTopics = useMemo(
    () => (meetingShared ? topics.filter((t) => t.meetingId === meeting.id && t.raisedBy) : []),
    [topics, meeting.id, meetingShared]
  );
  const freshFromThem = useFreshFromThem(meeting.id, theirTopics, meetingShared);
  const [onlyTheirs, setOnlyTheirs] = useState(false);
  const fromThem = useMemo(
    () => ({ theirs: onlyTheirs && meetingShared, fresh: freshFromThem }),
    [onlyTheirs, meetingShared, freshFromThem]
  );
  const deleteTopics = useStore((s) => s.deleteTopics);
  const placeTopicsAt = useStore((s) => s.placeTopicsAt);
  const revertTopics = useStore((s) => s.revertTopics);
  const addSession = useStore((s) => s.addSession);
  const addMeetingRow = useStore((s) => s.addMeetingRow);
  const setCurriculum = useStore((s) => s.setCurriculum);
  const setTab = useStore((s) => s.setTab);
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  /*
   * With a week open beside the board there isn't room for the tray as well,
   * so it folds to a rail. Opening it from the rail holds until the week
   * closes.
   */
  const [trayWhileOpen, setTrayWhileOpen] = useState(false);
  useEffect(() => {
    if (!selectedSlotKey && !narrow) setTrayWhileOpen(false);
  }, [selectedSlotKey, narrow]);

  /*
   * Between the width where the tray moves up beside the weeks and the width
   * where both fit, the tray would leave room for barely one whole week. It
   * folds to its rail there too.
   */
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [cramped, setCramped] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const check = () => setCramped(el.clientWidth < (occurrence ? 768 : 1000));
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [occurrence]);
  const foldable = narrow || Boolean(selectedSlotKey) || cramped;
  const trayFolded = foldable && !trayWhileOpen;

  const selection = useBoardSelection({ rootRef, enabled: !openTopicId });
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    ids: string[];
    fromKeyboard: boolean;
  } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  /**
   * What is selected *and on screen*, in reading order. A tray filter can hide
   * selected cards without this component rendering at all, so anything that
   * acts on the selection asks here at the moment it acts rather than trusting
   * a set that may have outlived what it points at.
   */
  const liveSelection = useCallback((): Topic[] => {
    const byId = new Map(topics.map((t) => [t.id, t]));
    return selection.ordered().flatMap((id) => byId.get(id) ?? []);
  }, [topics, selection.ordered]);

  const removeTopic = useCallback(
    (topic: Topic) => {
      deleteWithUndo(
        "Topic deleted.",
        () => deleteTopic(topic.id),
        () => restoreTopic(topic)
      );
      announce(
        `Deleted “${topic.text || "topic"}”. Press ${MOD_LABEL} Z to undo.`
      );
    },
    [deleteTopic, restoreTopic]
  );

  const removeTopics = useCallback(
    (doomed: Topic[]) => {
      if (doomed.length === 0) return;
      if (doomed.length === 1) return removeTopic(doomed[0]);
      deleteWithUndo(
        `${doomed.length} topics deleted.`,
        () => deleteTopics(doomed.map((t) => t.id)),
        () => doomed.forEach((t) => restoreTopic(t))
      );
      announce(`Deleted ${doomed.length} topics. Press ${MOD_LABEL} Z to undo.`);
    },
    [deleteTopics, removeTopic, restoreTopic]
  );

  /*
   * An idea that isn't on a week has no meeting to be covered in, so ticking it
   * is done and it leaves the tray. A tick is an easy slip, so it gets the
   * same Undo a delete does rather than vanishing silently.
   */
  const completeIdea = useCallback(
    (topic: Topic) => {
      doWithUndo(
        "Idea marked done.",
        () => coverTopic(topic.id, true),
        () => coverTopic(topic.id, false)
      );
      announce(
        `Marked “${topic.text || "topic"}” done. Press ${MOD_LABEL} Z to undo.`
      );
    },
    [coverTopic]
  );

  const today = todayISO();
  const curriculum = curriculumOf(meeting);

  const layout = useMemo(
    () => boardLayout(meeting, sessions, topics, today, { ahead }),
    [meeting, sessions, topics, today, ahead]
  );
  const loose = useMemo(
    () => looseTopics(topics, sessions, meeting.id, today),
    [topics, sessions, meeting.id, today]
  );

  const place = useCallback(
    (topicId: string, key: string) => {
      const target = parseColumnKey(key);
      switch (target.kind) {
        case "lane":
          placeTopic(topicId, { lane: target.lane, slotId: target.slotId });
          return;
        case "session":
          placeTopic(topicId, {
            sessionId: target.sessionId,
            slotId: target.slotId,
          });
          return;
        case "projected": {
          const sessionId = addSession({
            meetingId: meeting.id,
            date: target.date,
          });
          placeTopic(topicId, { sessionId, slotId: target.slotId });
          return;
        }
      }
    },
    [addSession, meeting.id, placeTopic]
  );

  /*
   * Grabbing a selected card takes the whole selection with it. The group is
   * fixed at pickup — reading order, so it lands the way it looked — and held
   * in a ref because the drop reads it from an effect that outlives the render
   * that set it.
   */
  const liftedRef = useRef<string[]>([]);
  const [liftedIds, setLiftedIds] = useState<string[]>([]);
  const lifted = useMemo(() => new Set(liftedIds), [liftedIds]);

  /*
   * A drop resolves to a cell *and a position in it*. `place` still answers the
   * first half for the keyboard "Move to…" path, where there is no pointer to
   * read an index from and appending is the honest default.
   */
  const placeAt = useCallback(
    (topicId: string, key: string, index: number) => {
      const target = { ...parseColumnKey(key), meetingId: meeting.id };
      const group = liftedRef.current;
      if (group.length > 1 && group.includes(topicId)) {
        // `index` counts every card in the zone but the one grabbed — which
        // includes the rest of the group, who are about to leave it.
        const zone =
          layout.bucket.find((g) => g.key === key)?.topics ??
          layout.weeks.flatMap((w) => w.cells).find((c) => c.key === key)?.topics ??
          [];
        const above = zone
          .filter((t) => t.id !== topicId)
          .slice(0, index)
          .filter((t) => !group.includes(t.id)).length;
        placeTopicsAt(group, target, above);
        return;
      }
      placeTopicAt(topicId, target, index);
    },
    [layout, placeTopicAt, placeTopicsAt, meeting.id]
  );

  const dnd = useBoardDnD(placeAt);
  const { drag, zoneRef: columnRef, handleProps } = dnd;
  const dragged = drag ? topics.find((t) => t.id === drag.id) : null;

  const dragId = drag?.id ?? null;
  useEffect(() => {
    if (!dragId) {
      liftedRef.current = [];
      setLiftedIds([]);
      return;
    }
    // Picking up a card that isn't selected is a fresh start: it goes alone.
    if (!selection.selected.has(dragId)) {
      selection.clear();
      return;
    }
    const group = liveSelection().map((t) => t.id);
    liftedRef.current = group;
    setLiftedIds(group);
    // Only on pickup: the group is whatever was selected at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  const roll = useCallback(
    (topic: Topic) => {
      const slots = plannedSlots(meeting, sessions, topics, today, ahead);
      const next = nextSlotAfter(slots, topic.sessionId);
      if (!next) {
        rollTopic(topic.id, undefined);
        return;
      }
      const sessionId =
        next.sessionId ??
        addSession({ meetingId: meeting.id, date: next.date });
      rollTopic(topic.id, sessionId);
    },
    [addSession, ahead, meeting, rollTopic, sessions, today, topics]
  );

  // ── Right-click ───────────────────────────────────────────────────────────

  /** Do something to several topics, with the way back for all of them. */
  const revertible = useCallback(
    (message: string, targets: Topic[], act: () => void) => {
      const before = [...targets];
      doWithUndo(message, act, () => revertTopics(before));
    },
    [revertTopics]
  );

  /** "Topic" for one, "3 topics" for several — the front half of a toast. */
  const noun = (n: number, one: string) => (n === 1 ? one : `${n} topics`);

  const moveTo = (targets: Topic[], key: string) => {
    const ids = targets.map((t) => t.id);
    revertible(`${noun(ids.length, "Topic")} moved.`, targets, () =>
      placeTopicsAt(ids, { ...parseColumnKey(key), meetingId: meeting.id })
    );
  };

  const coverAll = (targets: Topic[]) => {
    const reopen = targets.every((t) => t.status !== "open");
    const acted = targets.filter((t) => (t.status === "open") !== reopen);
    const loose = acted.every((t) => !t.sessionId);
    const n = acted.length;
    revertible(
      reopen
        ? `${noun(n, "Topic")} reopened.`
        : n === 1
          ? loose
            ? "Idea marked done."
            : "Topic covered."
          : `${n} topics marked ${loose ? "done" : "covered"}.`,
      acted,
      () => acted.forEach((t) => coverTopic(t.id, !reopen))
    );
  };

  const parkAll = (targets: Topic[], park: boolean) => {
    const acted = targets.filter((t) =>
      park ? !(t.lane === "parked" && !t.sessionId) : t.lane === "parked" && !t.sessionId
    );
    revertible(
      park ? `${noun(acted.length, "Topic")} parked.` : `${noun(acted.length, "Topic")} back in ideas.`,
      acted,
      () =>
        acted.forEach((t) =>
          placeTopic(t.id, park ? { lane: "parked" } : { lane: "backlog", slotId: t.slotId })
        )
    );
  };

  /** Off the week, back to the tray — still in the same section. */
  const unplanAll = (targets: Topic[]) => {
    const acted = targets.filter((t) => t.sessionId);
    revertible(`${noun(acted.length, "Topic")} back in ideas.`, acted, () =>
      acted.forEach((t) => placeTopic(t.id, { lane: "backlog", slotId: t.slotId }))
    );
  };

  const flagAll = (targets: Topic[], urgent: boolean) => {
    targets.forEach((t) => updateTopic(t.id, { urgent: urgent || undefined }));
    announce(urgent ? "Marked urgent." : "No longer urgent.");
  };

  const duplicateAll = (targets: Topic[]) => {
    let made: string[] = [];
    doWithUndo(
      `${noun(targets.length, "Topic")} duplicated.`,
      () => {
        made = targets.map((t) => {
          const id = addTopic(meeting.id, t.text, {
            lane: t.lane,
            sessionId: t.sessionId,
            slotId: t.slotId,
            tagIds: t.tagIds,
            dueDate: t.dueDate,
          });
          updateTopic(id, { detail: t.detail, points: t.points, urgent: t.urgent });
          return id;
        });
      },
      () => deleteTopics(made)
    );
  };

  const copyAll = async (targets: Topic[]) => {
    try {
      await navigator.clipboard.writeText(targets.map((t) => t.text).join("\n"));
      toast({ message: targets.length === 1 ? "Copied." : `Copied ${targets.length} topics.` });
    } catch {
      toast({ message: "Couldn't copy to the clipboard." });
    }
  };

  /** Where to, for a topic or a handful: the tray's groups, then each week still ahead. */
  const moveEntries = (targets: Topic[]): MenuEntry[] => {
    const cells = [...layout.bucket, ...layout.weeks.flatMap((w) => w.cells)];
    // Only a single card has a "here" to tick; a mixed selection has several.
    const here =
      targets.length === 1
        ? cells.find((c) => c.topics.some((t) => t.id === targets[0].id))?.key
        : undefined;
    const item = (label: string, key: string): MenuEntry => ({
      type: "item",
      label,
      onSelect: () => moveTo(targets, key),
      ...(targets.length === 1 ? { checked: key === here, disabled: key === here } : {}),
    });

    const entries: MenuEntry[] = [
      { type: "heading", label: "Ideas" },
      ...layout.bucket.map((g) =>
        item(g.lane === "parked" ? "Parked" : g.label === "Ideas" ? "Not on a week" : g.label, g.key)
      ),
    ];
    for (const week of layout.weeks) {
      if (week.slot.past) continue;
      const bare = week.cells.length === 1 && !week.cells[0].label;
      if (!bare) entries.push({ type: "heading", label: weekName(week.slot.date) });
      for (const c of week.cells) {
        entries.push(item(c.label || weekName(week.slot.date), c.key));
      }
    }
    return entries;
  };

  const menuEntries = (targets: Topic[]): MenuEntry[] => {
    const n = targets.length;
    const one = n === 1 ? targets[0] : null;
    const count = n > 1 ? ` ${n}` : "";
    const allCovered = targets.every((t) => t.status !== "open");
    const allLoose = targets.every((t) => !t.sessionId);
    const allParked = targets.every((t) => t.lane === "parked" && !t.sessionId);
    const allUrgent = targets.every((t) => t.urgent);

    return [
      ...(one
        ? ([
            {
              type: "item",
              label: "Open",
              icon: <Maximize01 className="size-4" />,
              onSelect: () => setOpenTopicId(one.id),
            },
          ] satisfies MenuEntry[])
        : []),
      {
        type: "item",
        label: allCovered
          ? `Reopen${count}`
          : `Mark${count} ${allLoose ? "done" : "covered"}`,
        icon: <CheckCircle className="size-4" />,
        onSelect: () => coverAll(targets),
      },
      { type: "separator" },
      {
        type: "submenu",
        label: n > 1 ? `Move ${n} to` : "Move to",
        icon: <ArrowRight className="size-4" />,
        entries: moveEntries(targets),
      },
      ...(targets.some((t) => t.sessionId)
        ? ([
            {
              type: "item",
              label: "Back to ideas",
              icon: <CornerUpLeft className="size-4" />,
              onSelect: () => unplanAll(targets),
            },
          ] satisfies MenuEntry[])
        : []),
      {
        type: "item",
        label: allParked ? `Bring${count} back` : `Park${count}`,
        icon: allParked ? <FlipBackward className="size-4" /> : <PauseCircle className="size-4" />,
        onSelect: () => parkAll(targets, !allParked),
      },
      {
        type: "item",
        label: allUrgent ? "Not urgent" : "Mark urgent",
        icon: <Flag01 className="size-4" />,
        onSelect: () => flagAll(targets, !allUrgent),
      },
      ...(meetingShared && targets.every((t) => !t.sessionId && !t.raisedBy)
        ? ([
            // An idea isn't on a week, so it isn't shared until you say so.
            {
              type: "item",
              label: targets.every((t) => t.shared)
                ? `Stop sharing${count}`
                : `Share${count} with ${sharedWithLabel(meetingShares)}`,
              icon: <Users01 className="size-4" />,
              onSelect: () => {
                const share = !targets.every((t) => t.shared);
                for (const t of targets) updateTopic(t.id, { shared: share, private: share ? false : t.private });
              },
            },
          ] satisfies MenuEntry[])
        : meetingShared
        ? ([
            {
              type: "item",
              label: targets.every((t) => t.private) ? `Share${count} again` : `Keep${count} to myself`,
              icon: <Lock01 className="size-4" />,
              onSelect: () => {
                const lock = !targets.every((t) => t.private);
                for (const t of targets) updateTopic(t.id, { private: lock, shared: lock ? false : t.shared });
              },
            },
          ] satisfies MenuEntry[])
        : []),
      { type: "separator" },
      {
        type: "item",
        label: `Duplicate${count}`,
        icon: <LayersTwo01 className="size-4" />,
        onSelect: () => duplicateAll(targets),
      },
      {
        type: "item",
        label: n > 1 ? `Copy ${n} as text` : "Copy text",
        icon: <Copy01 className="size-4" />,
        onSelect: () => void copyAll(targets),
      },
      { type: "separator" },
      {
        type: "item",
        label: n > 1 ? `Delete ${n}` : "Delete",
        icon: <Trash01 className="size-4" />,
        hint: "⌫",
        danger: true,
        onSelect: () => removeTopics(targets),
      },
    ];
  };

  /**
   * Right-clicking a card that is part of the selection acts on all of it;
   * right-clicking one that isn't moves the selection there first — the same
   * thing Finder and Notion do, and what keeps a menu from quietly acting on
   * cards you weren't pointing at.
   */
  const openMenu = (id: string, x: number, y: number, fromKeyboard: boolean) => {
    const live = liveSelection();
    if (!live.some((t) => t.id === id)) selection.only([id]);
    setMenu({
      x,
      y,
      ids: live.some((t) => t.id === id) ? live.map((t) => t.id) : [id],
      fromKeyboard,
    });
  };
  const menuTargets = menu
    ? menu.ids.flatMap((id) => topics.find((t) => t.id === id) ?? [])
    : [];

  // A box sweeps through cards faster than a screen reader can say them; speak
  // where it ended up.
  const selectedCount = selection.selected.size;
  useEffect(() => {
    if (selectedCount > 0) announce(`${selectedCount} selected.`);
  }, [selectedCount]);

  /*
   * Esc lets go of the selection; Delete removes it. Both only while nothing in
   * particular has focus (or a card does, for Esc): a Backspace typed into a
   * field, or into a dialog over the board, is not for the cards behind it, and
   * a focused card handle has its own Delete.
   *
   * Listens in the capture phase and, for Esc, stops the event there. The
   * meeting page closes itself on Esc through two other routes — the app's
   * shared dismiss stack and the global shortcut handler — and neither looks at
   * whether someone else already took the key. Without this, letting go of a
   * selection would also take you off the page.
   */
  useEffect(() => {
    if (selection.selected.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (menu || openTopicId) return;
      if (isTypingTarget(e.target) || ownsKeyboard(e.target)) return;
      const active = document.activeElement as HTMLElement | null;
      const onSurface = !active || active === document.body;
      if (e.key === "Escape") {
        if (!onSurface && !active?.closest("[data-drag-item]")) return;
        e.preventDefault();
        e.stopPropagation();
        selection.clear();
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (e.metaKey || e.ctrlKey || e.altKey || !onSurface) return;
      const doomed = liveSelection();
      if (doomed.length === 0) return;
      e.preventDefault();
      removeTopics(doomed);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [selection.clear, selection.selected.size, menu, openTopicId, liveSelection, removeTopics]);

  const moveGroups: MoveGroup[] = [
    {
      label: "Ideas",
      options: layout.bucket.map((g) => ({
        key: g.key,
        label: g.label === "Ideas" ? "Ideas" : `Ideas · ${g.label}`,
      })),
    },
    ...layout.weeks.map((week) => ({
      label: weekName(week.slot.date),
      options: week.cells.map((c) => ({
        key: c.key,
        label: c.label ? `${weekName(week.slot.date)} · ${c.label}` : weekName(week.slot.date),
      })),
    })),
  ];

  const cardProps: CardHandlers = {
    moveGroups,
    handleProps,
    onAddHere: (raw, key) =>
      captureTopics(raw, { ...parseColumnKey(key), meetingId: meeting.id }),
    onOpen: setOpenTopicId,
    onMove: place,
    onReorder: (id, dir) => moveTopic(id, dir),
    // An idea off the week completes. A topic on a week is covered and stays put.
    onCover: (id, covered) => {
      const topic = topics.find((t) => t.id === id);
      if (covered && topic && !topic.sessionId) completeIdea(topic);
      else coverTopic(id, covered);
    },
    onRoll: roll,
    onBacklog: (id) => placeTopic(id, { lane: "backlog" }),
    // Delete on a card that is part of a selection removes the selection.
    onDelete: (topic) => {
      const group = liveSelection();
      if (group.length > 1 && group.some((t) => t.id === topic.id)) removeTopics(group);
      else removeTopic(topic);
    },
    selected: selection.selected,
    lifted: (id) => drag?.id === id || lifted.has(id),
    onPick: selection.pick,
    onPlain: selection.clear,
    onMenu: openMenu,
  };

  const parked = layout.bucket[layout.bucket.length - 1];
  const ideaGroups = layout.bucket.slice(0, -1);
  const ideaCount = ideaGroups.reduce((n, g) => n + g.topics.length, 0);

  return (
    <FromThemContext.Provider value={fromThem}>
    <div ref={rootRef} className="@container flex flex-col gap-4" {...selection.rootProps}>
      {meetingShared && (
        <FromThemBar
          shares={meetingShares}
          theirs={theirTopics}
          fresh={freshFromThem}
          showing={onlyTheirs}
          onShow={setOnlyTheirs}
        />
      )}
      {loose.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[14px] bg-cond-watch-soft px-4 py-3">
          <p className="min-w-0 flex-1 text-[13.5px] leading-5 text-cond-watch-ink">
            <b className="font-semibold">
              {loose.length} topic{loose.length === 1 ? "" : "s"}
            </b>{" "}
            {loose.length === 1 ? "was" : "were"} planned for a{" "}
            {MEETING_LABEL[meeting.subjectKind]} that's been and gone, and never
            ticked off.
          </p>
          <button
            type="button"
            onClick={() => loose.forEach(roll)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12.5px] font-semibold text-primary shadow-xs touch:min-h-11"
          >
            Carry to the next one
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      )}

      <div
        className={cx(
          "flex gap-5",
          trayFolded ? "items-start" : "flex-col @3xl:flex-row @3xl:items-start"
        )}
      >
        {trayFolded ? (
          <TrayRail count={ideaCount} onOpen={() => setTrayWhileOpen(true)} />
        ) : (
          <div className="@3xl:sticky @3xl:top-16 @3xl:w-[18rem] @3xl:shrink-0">
            <IdeasTray
              direction={direction}
              curriculum={curriculum}
              tags={tags}
              groups={ideaGroups}
              parked={parked}
              ideaCount={ideaCount}
              drag={drag}
              columnRef={columnRef}
              cardProps={cardProps}
              onFold={foldable ? () => setTrayWhileOpen(false) : undefined}
              onAllIdeas={() => setTab("ideas")}
              onCapture={(raw, slotId) =>
                captureTopics(raw, {
                  kind: "lane",
                  lane: "backlog",
                  slotId,
                  meetingId: meeting.id,
                })
              }
            />
          </div>
        )}

        <ScheduleGrid
          meetingId={meeting.id}
          weeks={
            occurrence
              ? layout.weeks.filter((w) => w.slot.date === occurrence)
              : layout.weeks
          }
          agenda={Boolean(occurrence)}
          // Coverage is measured over the board's usual runway, even when the
          // agenda pages half a year ahead to reach the week it shows.
          coverage={layout.weeks.filter((w) => !w.slot.past).slice(0, SLOTS_AHEAD)}
          curriculum={curriculum}
          tags={tags}
          today={today}
          selectedSlotKey={selectedSlotKey}
          drag={drag}
          columnRef={columnRef}
          scrollerRef={dnd.scrollerRef}
          cardProps={cardProps}
          onSelectWeek={onSelectWeek}
          onAddRow={(label) => addMeetingRow(meeting.id, label)}
          onReorderRows={(ids) => {
            const byId = new Map(curriculum.map((c) => [c.id, c]));
            setCurriculum(
              meeting.id,
              ids.map((id) => byId.get(id)!).filter(Boolean)
            );
          }}
        />
      </div>

      {drag && dragged && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 -rotate-2 rounded-[10px] border border-teal-200 bg-primary px-2.5 py-2 text-[13px] leading-[18px] text-primary shadow-[0_14px_32px_-10px_rgba(10,34,37,0.35),0_2px_6px_rgba(10,34,37,0.12)] dark:border-teal-800"
          style={{
            left: drag.x - drag.dx,
            top: drag.y - drag.dy,
            width: drag.width,
          }}
        >
          {dragged.text}
          {liftedIds.length > 1 && (
            <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-teal-600 px-1 font-mono text-[10.5px] font-medium text-white dark:bg-teal-500 dark:text-stone-950">
              {liftedIds.length}
            </span>
          )}
        </div>
      )}
      {/* The box being swept across the board. Positioned by the hook, every frame. */}
      <div
        ref={selection.marqueeRef}
        hidden
        aria-hidden
        className="pointer-events-none fixed z-40 rounded-[3px] border border-teal-500 bg-teal-500/15"
      />
      {menu && menuTargets.length > 0 && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          fromKeyboard={menu.fromKeyboard}
          label={`Actions for ${menuTargets.length === 1 ? "topic" : `${menuTargets.length} topics`}`}
          entries={menuEntries(menuTargets)}
          onClose={closeMenu}
        />
      )}
      {/*
        The full idea, opened from any card on the board. A card stays a
        one-liner because it has to survive being one of forty; the thinking
        behind it needs somewhere to live that isn't a separate doc.
      */}
      {openTopicId && (
        <TopicDetail
          topicId={openTopicId}
          onClose={() => setOpenTopicId(null)}
        />
      )}
    </div>
    </FromThemContext.Provider>
  );
}

// ── The grid ───────────────────────────────────────────────────────────────

type GridRow = { id: string; label: string; slotId?: string; minutes?: number };

/** The strip's fixed measures, in px: they size the week columns to fit. */
const LABEL_W = 140; // 8.75rem
const GAP = 12; // gap-x-3
const PAST_W = 124; // 7.75rem
const SKIP_W = 72; // 4.5rem
/** Room past the last sheet for its ring and halo, which overflow would clip. */
const RING_ROOM = 8;
const WEEK_MIN = { rows: 168, bare: 196 };
const WEEK_MAX = 320; // 20rem

function ScheduleGrid({
  meetingId,
  weeks,
  agenda = false,
  coverage,
  curriculum,
  tags,
  today,
  selectedSlotKey,
  drag,
  columnRef,
  scrollerRef,
  cardProps,
  onSelectWeek,
  onAddRow,
  onReorderRows,
}: {
  meetingId: string;
  weeks: WeekColumn[];
  /** One occurrence, full width, no week header — see `TopicBoard.occurrence`. */
  agenda?: boolean;
  /** The upcoming weeks the section rows report coverage over. */
  coverage?: WeekColumn[];
  curriculum: CurriculumSlot[];
  tags: Tag[];
  today: string;
  selectedSlotKey?: string | null;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  scrollerRef: ReturnType<typeof useBoardDnD>["scrollerRef"];
  cardProps: CardHandlers;
  onSelectWeek?: (slotKey: string, slot: Slot) => void;
  onAddRow: (label: string) => void;
  onReorderRows: (ids: string[]) => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const restoreOccurrence = useStore((s) => s.restoreOccurrence);
  const arcs = useStore((s) => s.arcs);
  /** The week an arc step is being dragged over. */
  const [arcOver, setArcOver] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const scrollLeftRef = useRef(0);
  const [hiddenRight, setHiddenRight] = useState(0);
  const [box, setBox] = useState(0);
  const [draggingRow, setDraggingRow] = useState<string | null>(null);
  const [overRow, setOverRow] = useState<string | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHiddenRight(Math.max(0, el.scrollWidth - el.clientWidth - el.scrollLeft));
    setScrolled(el.scrollLeft > 4);
    setBox(el.clientWidth);
  }, []);

  // The board re-renders on every store change; keep the strip where it was.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = scrollLeftRef.current;
    measure();
  });

  // Opening a week from elsewhere (the header's Next up, a new one-off)
  // brings its column into view.
  useEffect(() => {
    if (!selectedSlotKey) return;
    const head = scrollRef.current?.querySelector<HTMLElement>('[aria-expanded="true"]');
    head?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selectedSlotKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const setScroller = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el;
      // Dragging a card near the edge pans the strip.
      scrollerRef(el);
    },
    [scrollerRef]
  );

  const dropRow = (targetId: string) => {
    if (!draggingRow || draggingRow === targetId) return;
    const ids = curriculum.map((c) => c.id).filter((id) => id !== draggingRow);
    const at = ids.indexOf(targetId);
    const from = curriculum.findIndex((c) => c.id === draggingRow);
    const to = curriculum.findIndex((c) => c.id === targetId);
    ids.splice(from < to ? at + 1 : at, 0, draggingRow);
    onReorderRows(ids);
    announce("Section moved.");
  };

  const hasRows = curriculum.length > 0;
  const rows: GridRow[] = hasRows
    ? [
        ...curriculum.map((s) => ({ id: s.id, label: s.label, slotId: s.id, minutes: s.minutes })),
        { id: "untagged", label: "Untagged" },
      ]
    : [{ id: "all", label: "" }];

  /*
   * A skipped week isn't an occurrence, so the rhythm steps over it — but
   * leaving a gap where it was makes it impossible to find again. It keeps a
   * narrow column of its own, with the way back.
   */
  const lastDate = weeks[weeks.length - 1]?.slot.date;
  const skipped = agenda ? [] : sessions
    .filter(
      (o) =>
        o.meetingId === meetingId &&
        o.kind === "skipped" &&
        o.date >= today &&
        Boolean(lastDate) &&
        o.date <= lastDate!
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  type Lane = { kind: "week"; key: string; date: string; week: WeekColumn } | { kind: "skip"; key: string; date: string; session: Session };
  const lanes: Lane[] = [
    ...weeks.map((week) => ({ kind: "week" as const, key: week.key, date: week.slot.date, week })),
    ...skipped.map((session) => ({ kind: "skip" as const, key: `skip:${session.id}`, date: session.date, session })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const colOffset = hasRows ? 2 : 1;
  const colOf = new Map(lanes.map((l, i) => [l.key, i + colOffset]));
  const fixedOf = (l: Lane) =>
    l.kind === "skip" ? SKIP_W : l.week.slot.past ? PAST_W : undefined;
  const weekW = fitColumns(
    box,
    lanes.map((l) => ({ fixed: fixedOf(l) })),
    {
      gap: GAP,
      lead: hasRows ? LABEL_W : 0,
      tail: RING_ROOM,
      min: hasRows ? WEEK_MIN.rows : WEEK_MIN.bare,
      max: WEEK_MAX,
    }
  );
  const template = [
    hasRows ? `${LABEL_W}px` : null,
    ...lanes.map((l) => (agenda ? "minmax(0, 1fr)" : `${fixedOf(l) ?? weekW}px`)),
  ]
    .filter(Boolean)
    .join(" ");

  const page = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (el) pageStrip(el, dir, { gap: GAP, lead: hasRows ? LABEL_W + GAP : 0, tail: RING_ROOM });
  };
  const pages = !agenda && (scrolled || hiddenRight > RING_ROOM + 1);

  const upcoming = coverage ?? weeks.filter((w) => !w.slot.past);
  const nextKey = upcoming[0]?.key;

  const weekIsActive = (week: WeekColumn): boolean => {
    if (!selectedSlotKey) return false;
    return (
      selectedSlotKey === slotKey(week.slot) ||
      selectedSlotKey === `p:${week.slot.date}` ||
      Boolean(week.slot.sessionId && selectedSlotKey === `s:${week.slot.sessionId}`)
    );
  };

  const cellFor = (week: WeekColumn, row: GridRow) =>
    row.slotId
      ? week.cells.find((c) => c.slotId === row.slotId)
      : week.cells.find((c) => !c.slotId);

  /*
   * Arcs live in the weeks, not above them: each step sits in its arc's
   * section, in the same column as the rest of that week. (An agenda shows
   * its arcs in its own band.)
   */
  const boardSlots = weeks.map((w) => w.slot);
  const arcPlans = agenda ? [] : liveArcs(arcs, meetingId).map((arc) => ({ arc, plan: arcPlan(arc, boardSlots) }));
  const arcRow = (slotId?: string) =>
    !hasRows ? "all" : slotId && curriculum.some((c) => c.id === slotId) ? slotId : "untagged";
  const arcStepsAt = (week: WeekColumn, row: GridRow) =>
    arcPlans.flatMap(({ arc, plan }) =>
      arcRow(arc.slotId) === row.id
        ? (plan.get(week.slot.date) ?? []).map((planned) => (
            <ArcGridStep key={`${arc.id}-${planned.step.id}`} arc={arc} planned={planned} date={week.slot.date} slots={boardSlots} />
          ))
        : []
    );
  const arcDrop = (week: WeekColumn) => ({
    over: arcOver === week.key,
    handlers: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(ARC_STEP_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (arcOver !== week.key) setArcOver(week.key);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArcOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        const raw = e.dataTransfer.getData(ARC_STEP_MIME);
        setArcOver(null);
        if (!raw) return;
        e.preventDefault();
        const { arcId, date } = JSON.parse(raw) as ArcStepDrag;
        const found = arcPlans.find((p) => p.arc.id === arcId);
        const step = found?.plan.get(date)?.[0]?.step;
        if (found && step) moveArcStepTo(found.arc, boardSlots, date, week.slot.date, step.label.split(" · ")[0]);
      },
    },
  });

  const preview = (week: WeekColumn) => {
    const s = week.slot.sessionId ? sessions.find((o) => o.id === week.slot.sessionId) : null;
    return s ? sessionSummary(s, 64) : "";
  };

  if (!weeks.length) {
    return (
      <div className="flex min-h-40 flex-1 flex-col items-start justify-center gap-1 rounded-[16px] border border-dashed border-primary px-6 py-8">
        <p className="font-serif text-[19px] text-secondary italic">Nothing on the calendar yet.</p>
        <p className="text-[13px] text-tertiary">
          Set how often you meet in Settings, or add a one-off date.
        </p>
      </div>
    );
  }

  // In the board's empty corner (above the grid when there are no section
  // labels). It used to float over the last column's cards.
  const pager = pages && (
    <StripPager
      canBack={scrolled}
      canForward={hiddenRight > RING_ROOM + 1}
      onPage={page}
      backLabel="Earlier weeks"
      forwardLabel="Later weeks"
    />
  );

  return (
    <div className="relative min-w-0 flex-1">
      {!hasRows && pager && <div className="flex justify-end pb-2">{pager}</div>}
      <div
        ref={setScroller}
        onScroll={() => {
          scrollLeftRef.current = scrollRef.current?.scrollLeft ?? 0;
          measure();
        }}
        onWheel={chainVerticalWheel}
        // The drag-box pans this when it reaches the edge.
        data-board-scroller
        // A scroller clips on both axes, and the next week's ring and halo
        // sit just outside its sheet: the padding gives them room.
        className="scroll-contain scrollbar-hide -mt-2 overflow-x-auto pt-2 pb-3"
      >
        <div
          className={cx("relative gap-x-3", agenda ? "grid w-full" : "inline-grid")}
          style={{
            gridTemplateColumns: template,
            gridTemplateRows: `auto repeat(${rows.length}, minmax(${hasRows ? "5.75rem" : "12rem"}, auto))`,
            paddingRight: agenda ? undefined : RING_ROOM,
          }}
        >
          {/* The sheets: one per week, behind its header and cells. */}
          {lanes.map((lane) => {
            if (lane.kind === "skip") {
              const active = selectedSlotKey === `s:${lane.session.id}`;
              return (
                <Fragment key={lane.key}>
                  <div
                    aria-hidden
                    data-lane
                    style={{ gridColumn: colOf.get(lane.key), gridRow: `1 / span ${rows.length + 1}` }}
                    className={cx(
                      "rounded-[14px] bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--color-border-secondary)_7px_8px)]",
                      active && "ring-[1.5px] ring-teal-600"
                    )}
                  />
                  <div
                    style={{ gridColumn: colOf.get(lane.key), gridRow: `1 / span ${rows.length + 1}` }}
                    className="relative z-[2] flex flex-col items-center gap-1 px-1 pt-3.5 text-center"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onSelectWeek?.(`s:${lane.session.id}`, {
                          sessionId: lane.session.id,
                          date: lane.session.date,
                          projected: false,
                          past: false,
                        })
                      }
                      aria-label={`${fmtDay(lane.date, { weekday: "long", month: "long", day: "numeric" })} is skipped. Open it.`}
                      className="flex flex-col items-center gap-0.5 rounded-lg px-1 py-0.5"
                    >
                      <span className="font-mono text-[10.5px] text-quaternary">
                        {fmtDay(lane.date, { weekday: "short" }).toUpperCase()}
                      </span>
                      <span className="font-serif text-[22px] leading-7 text-quaternary line-through">
                        {Number(lane.date.slice(8, 10))}
                      </span>
                      <span className="font-mono text-[9.5px] tracking-[0.06em] text-quaternary">SKIPPED</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => restoreOccurrence(lane.session.id)}
                      className="mt-1 rounded-md bg-primary px-1.5 py-1 text-[11px] font-semibold text-teal-700 shadow-xs hover:text-teal-800 touch:min-h-11 dark:text-teal-300"
                    >
                      Restore
                    </button>
                  </div>
                </Fragment>
              );
            }
            const week = lane.week;
            const i = (colOf.get(lane.key) ?? colOffset) - colOffset;
            const active = weekIsActive(week);
            const next = week.key === nextKey;
            const expected = week.slot.projected && !week.slot.past;
            return (
              <div
                key={`sheet-${week.key}`}
                aria-hidden
                data-lane
                // An agenda has no header row; its sheet starts with the first section.
                style={{
                  gridColumn: i + colOffset,
                  gridRow: agenda ? `2 / span ${rows.length}` : `1 / span ${rows.length + 1}`,
                }}
                className={cx(
                  // Outlines are drawn inside the sheet: one drawn outside it was
                  // clipped wherever the sheet met the scroller's edge.
                  "rounded-[14px] transition-colors",
                  agenda
                    ? "bg-primary shadow-[inset_0_0_0_1px_var(--color-border-secondary)]"
                    : active
                    ? "bg-teal-50 ring-[1.5px] ring-teal-600 dark:bg-teal-950/40 dark:ring-teal-500"
                    : week.slot.past
                      ? "bg-secondary"
                      : expected
                        ? "border-[1.5px] border-dashed border-primary"
                        : next
                          ? "bg-primary ring-[1.5px] ring-teal-600 shadow-[0_0_0_5px_var(--color-teal-50)] dark:ring-teal-500 dark:shadow-none"
                          : "bg-primary shadow-[inset_0_0_0_1px_var(--color-border-secondary)]"
                )}
              />
            );
          })}

          {hasRows && !agenda && (
            <div
              style={{ gridColumn: 1, gridRow: 1 }}
              // Reaches up over the scroller's padding so a ring sliding
              // under the labels doesn't show above them.
              className="sticky left-0 z-[3] -mt-2 flex flex-col items-start justify-between gap-3 bg-primary pt-5 pb-3"
            >
              {pager || <span />}
              <span className="eyebrow">Standing agenda</span>
            </div>
          )}

          {!agenda && weeks.map((week) => (
            <WeekHeader
              key={`head-${week.key}`}
              meetingId={meetingId}
              column={colOf.get(week.key)!}
              week={week}
              today={today}
              isActive={weekIsActive(week)}
              isNext={week.key === nextKey}
              notesPreview={preview(week)}
              onSelect={() => onSelectWeek?.(slotKey(week.slot), week.slot)}
            />
          ))}

          {rows.map((row, ri) => (
            <Fragment key={row.id}>
              {hasRows && (
                <RowLabel
                  row={row}
                  gridRow={ri + 2}
                  weeks={upcoming}
                  dotClass={row.slotId ? slotDotClass(curriculum, row.slotId, tags) : undefined}
                  dragging={draggingRow === row.slotId}
                  over={overRow === row.slotId && draggingRow !== row.slotId}
                  onDragStart={() => row.slotId && setDraggingRow(row.slotId)}
                  onDragEnd={() => {
                    setDraggingRow(null);
                    setOverRow(null);
                  }}
                  onDragOver={() => draggingRow && row.slotId && setOverRow(row.slotId)}
                  onDrop={() => {
                    if (row.slotId) dropRow(row.slotId);
                    setDraggingRow(null);
                    setOverRow(null);
                  }}
                  onAddRow={ri === rows.length - 1 ? onAddRow : undefined}
                  canDrag={Boolean(draggingRow)}
                />
              )}
              {weeks.map((week) => {
                const cell = cellFor(week, row);
                const place = { gridColumn: colOf.get(week.key)!, gridRow: ri + 2 };
                const ruled = hasRows && ri > 0;
                const arcSteps = arcStepsAt(week, row);
                const drop = arcPlans.length ? arcDrop(week) : undefined;
                if (!cell) {
                  return (
                    <div
                      key={`${row.id}-${week.key}`}
                      style={place}
                      {...drop?.handlers}
                      className={cx(
                        "relative z-[2] flex flex-col gap-1.5 p-1.5",
                        ruled && "border-t border-secondary",
                        drop?.over && "rounded-[11px] outline-[1.5px] outline-teal-600 outline-dashed -outline-offset-4"
                      )}
                    >
                      {arcSteps}
                    </div>
                  );
                }
                return (
                  <GridCell
                    key={cell.key}
                    style={place}
                    cell={cell}
                    ruled={ruled}
                    past={week.slot.past}
                    tickable={Boolean(week.slot.sessionId)}
                    drag={drag}
                    columnRef={columnRef}
                    cardProps={cardProps}
                    dropLabel={`Drop into ${weekName(week.slot.date)}${row.slotId ? ` · ${row.label}` : ""}`}
                    composerLabel={row.slotId ? `Add to ${row.label}` : "Add a topic"}
                    alwaysCompose={agenda}
                    lead={arcSteps.length ? arcSteps : undefined}
                    arcDrop={drop}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
        {!hasRows && <AddRow onAdd={onAddRow} first />}
      </div>

      {hasRows && scrolled && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-[8.75rem] z-[4] w-5 bg-gradient-to-r from-[rgba(10,34,37,0.07)] to-transparent"
        />
      )}
    </div>
  );
}

function RowLabel({
  row,
  gridRow,
  weeks,
  dotClass,
  dragging,
  over,
  canDrag,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onAddRow,
}: {
  row: GridRow;
  gridRow: number;
  /** Upcoming weeks only — coverage looks forward. */
  weeks: WeekColumn[];
  dotClass?: string;
  dragging: boolean;
  over: boolean;
  canDrag: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onAddRow?: (label: string) => void;
}) {
  const filled = row.slotId
    ? weeks.map((w) => w.cells.some((c) => c.slotId === row.slotId && c.topics.length > 0))
    : [];
  const count = filled.filter(Boolean).length;

  return (
    <div
      style={{ gridColumn: 1, gridRow }}
      draggable={Boolean(row.slotId)}
      onDragStart={(e) => {
        if (!row.slotId) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", row.slotId);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!canDrag || !row.slotId) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      title={row.slotId ? "Drag to reorder sections" : undefined}
      className={cx(
        "group/row sticky left-0 z-[3] flex flex-col gap-1.5 bg-primary py-3.5 pr-3",
        gridRow > 2 && "border-t border-secondary",
        row.slotId && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
        over && "shadow-[inset_0_2px_0_0_var(--color-teal-600)]"
      )}
    >
      <span className="flex items-center gap-2 text-[13.5px] leading-5 font-semibold">
        {row.slotId ? (
          <DotsGrid aria-hidden className="size-3 shrink-0 text-quaternary opacity-50 transition-opacity group-hover/row:opacity-100" />
        ) : (
          <span aria-hidden className="size-3 shrink-0" />
        )}
        {dotClass && <i aria-hidden className={cx("size-2 shrink-0 rounded-[2px]", dotClass)} />}
        <span className={cx("min-w-0 break-words", !row.slotId && "text-tertiary")}>{row.label}</span>
      </span>
      {row.minutes ? (
        <span className="pl-5 font-mono text-[10.5px] text-quaternary">{row.minutes} MIN</span>
      ) : null}
      {row.slotId && filled.length > 0 && (
        <span
          className="flex items-center gap-2 pl-5"
          title={`Planned in ${count} of the next ${filled.length} weeks`}
        >
          <span aria-hidden className="flex items-end gap-[2.5px]">
            {filled.slice(0, 12).map((on, i) => (
              <i
                key={i}
                className={cx("h-[9px] w-[5px] rounded-[1.5px]", on ? dotClass : "bg-quaternary")}
              />
            ))}
          </span>
          <span className="font-mono text-[10.5px] text-quaternary">
            {count}/{filled.length}
          </span>
        </span>
      )}
      {onAddRow && <AddRow onAdd={onAddRow} />}
    </div>
  );
}

/** "+ Add a section", on the board itself — where the need for one is noticed. */
function AddRow({ onAdd, first }: { onAdd: (label: string) => void; first?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          "inline-flex items-center gap-1 self-start rounded-md text-[12px] font-semibold text-teal-700 hover:text-teal-800 touch:min-h-11 dark:text-teal-400",
          first ? "mt-3" : "mt-2 pl-5"
        )}
      >
        <Plus className="size-3.5" />
        {first ? "Split weeks into sections" : "Add a section"}
      </button>
    );
  }
  return (
    <form
      className={cx("flex flex-col gap-1.5", first ? "mt-3 max-w-xs" : "mt-2")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.trim()) return;
        onAdd(draft);
        setDraft("");
      }}
    >
      <input
        autoFocus
        placeholder="Prayer, Training…"
        aria-label="New section"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !draft.trim() && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft("");
            setOpen(false);
          }
        }}
        className="h-8 w-full min-w-0 rounded-lg border border-teal-300 bg-primary px-2 text-[12.5px] outline-none dark:border-teal-700"
      />
      <span className="text-[11px] text-quaternary">Enter to add · Esc to stop</span>
    </form>
  );
}

function weekStatus(week: WeekColumn, today: string): { text: string; tone: string } {
  const total = week.topics.length;
  const open = week.topics.filter((t) => t.status === "open").length;
  const covered = total - open;
  if (week.slot.past) {
    if (total === 0) return { text: "Nothing planned", tone: "text-quaternary" };
    if (open === 0) return { text: "All covered", tone: "text-cond-thriving-ink" };
    return { text: `${open} not covered`, tone: "text-cond-watch-ink" };
  }
  const days = daysBetween(today, week.slot.date);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return {
    text: covered > 0 ? `${when} · ${covered} of ${total} covered` : when,
    tone: "text-tertiary",
  };
}

function WeekHeader({
  meetingId,
  column,
  week,
  today,
  isActive,
  isNext,
  notesPreview,
  onSelect,
}: {
  meetingId: string;
  column: number;
  week: WeekColumn;
  today: string;
  isActive: boolean;
  isNext: boolean;
  notesPreview: string;
  onSelect: () => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const addSession = useStore((s) => s.addSession);
  const openSession = useStore((s) => s.openSession);
  const past = week.slot.past;
  const expected = week.slot.projected && !past;
  const status = weekStatus(week, today);
  const flag = isActive ? "Open" : isNext ? "Next" : null;
  const longDate = fmtDay(week.slot.date, { weekday: "long", month: "long", day: "numeric" });

  /*
   * Straight into Run from the board, without opening the week first. The
   * next one (or today's) starts; a past one opens for notes, which is how
   * you go back and write up a meeting after the fact. Weeks further out are
   * still being planned, so they offer neither.
   */
  const run = past ? "notes" : isNext || week.slot.date === today ? "start" : null;
  const go = () => {
    const id = ensureSessionId(meetingId, week.slot, sessions, addSession);
    if (run === "start") startMeeting(id);
    openSession(id);
  };

  return (
    <div style={{ gridColumn: column, gridRow: 1 }} className="relative z-[2] flex min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={isActive}
        aria-label={`${longDate}. ${status.text}. ${isActive ? "Close" : "Open"} this week.`}
        className={cx(
          "group/week relative flex min-w-0 flex-1 flex-col gap-0.5 rounded-t-[14px] px-3.5 pt-3.5 pb-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-inset",
          past && !isActive && "opacity-70 hover:opacity-100"
        )}
      >
        {/* Room for Start / Notes, which sit over this row's end. */}
        <span className={cx("flex h-[17px] min-w-0 items-center gap-2", run && "pr-[4.5rem]")}>
          <span
            className={cx(
              "font-mono text-[10.5px]",
              isActive ? "text-teal-700 dark:text-teal-300" : "text-quaternary"
            )}
          >
            {fmtDay(week.slot.date, { weekday: "short" }).toUpperCase()}
          </span>
          {flag && (
            <span className="inline-flex h-[17px] items-center rounded-[5px] bg-teal-600 px-1.5 font-mono text-[9.5px] font-medium tracking-[0.06em] text-white uppercase dark:bg-teal-500 dark:text-stone-950">
              {flag}
            </span>
          )}
          {week.exception ? (
            <span className="truncate font-mono text-[9.5px] tracking-[0.06em] text-teal-700 uppercase dark:text-teal-300">
              {week.exception}
            </span>
          ) : expected && !flag ? (
            <span className="font-mono text-[9.5px] tracking-[0.06em] text-quaternary">EXPECTED</span>
          ) : null}
        </span>
        <span className="flex items-baseline gap-1.5">
          <span
            className={cx(
              "font-serif leading-[30px] transition-colors group-hover/week:text-teal-700 dark:group-hover/week:text-teal-300",
              past ? "text-[22px]" : "text-[26px]",
              expected && "text-secondary"
            )}
          >
            {Number(week.slot.date.slice(8, 10))}
          </span>
          <span className="text-[12.5px] text-tertiary">
            {fmtDay(week.slot.date, { month: "short" })}
          </span>
        </span>
        <span className={cx("truncate text-[11.5px]", isActive ? "text-teal-800 dark:text-teal-300" : status.tone)}>
          {status.text}
        </span>
        {notesPreview && (
          <span className="mt-1 line-clamp-2 font-serif text-[13px] leading-[17px] text-secondary italic">
            {notesPreview}
          </span>
        )}
      </button>
      {run === "start" ? (
        <button
          type="button"
          onClick={go}
          aria-label={`Start the ${longDate} meeting`}
          className="absolute top-2.5 right-2.5 inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-teal-600 px-2.5 text-[12px] font-semibold text-white shadow-xs transition-colors hover:bg-teal-700 touch:min-h-11 dark:bg-teal-500 dark:text-stone-950"
        >
          <Play aria-hidden className="size-3" />
          Start
        </button>
      ) : run === "notes" ? (
        <button
          type="button"
          onClick={go}
          aria-label={`Notes for ${longDate}`}
          className="absolute top-2.5 right-2 inline-flex h-7 items-center gap-1 rounded-[8px] px-2 text-[12px] font-semibold text-tertiary transition-colors hover:bg-primary hover:text-teal-700 touch:min-h-11 dark:hover:text-teal-300"
        >
          <Edit03 aria-hidden className="size-3.5" />
          Notes
        </button>
      ) : null}
    </div>
  );
}

function GridCell({
  cell,
  style,
  ruled,
  past,
  tickable,
  drag,
  columnRef,
  cardProps,
  dropLabel,
  composerLabel,
  alwaysCompose = false,
  lead,
  arcDrop,
}: {
  /** Arc steps for this week, above its topics. */
  lead?: ReactNode;
  /** Takes a dragged arc step: the week it's dropped on is where it lands. */
  arcDrop?: { over: boolean; handlers: React.HTMLAttributes<HTMLDivElement> };
  /**
   * Keep the composer on screen. The strip hides it until hover so eight
   * weeks don't become thirty identical Add buttons; an agenda has one per
   * section, and adding to it is the main thing you came to do.
   */
  alwaysCompose?: boolean;
  cell: WeekCell;
  style: React.CSSProperties;
  ruled: boolean;
  past: boolean;
  tickable: boolean;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  dropLabel: string;
  composerLabel: string;
}) {
  const active = drag?.over === cell.key;
  // Where it would land, not just where it would go. In a cell that is a
  // running order, the position *is* the decision.
  const at = active ? drag!.index : -1;
  const line = (
    <li key="drop-line" aria-hidden className="h-0.5 list-none rounded-full bg-teal-600" />
  );

  const items: ReactNode[] = [];
  cell.topics.forEach((t, i) => {
    if (active && at === i) items.push(line);
    items.push(
      <BoardCard
        key={t.id}
        topic={t}
        columnKey={cell.key}
        past={past}
        tickable={tickable}
        covered={t.status !== "open"}
        isDragging={cardProps.lifted(t.id)}
        {...cardProps}
      />
    );
  });
  if (active && at >= cell.topics.length) items.push(line);

  return (
    <div
      ref={columnRef(cell.key)}
      style={style}
      {...arcDrop?.handlers}
      className={cx(
        "group/cell relative z-[2] flex min-w-0 flex-col gap-1.5 p-1.5",
        ruled && "border-t border-secondary",
        (active || arcDrop?.over) &&
          "rounded-[11px] bg-teal-50/90 outline-[1.5px] outline-teal-600 outline-dashed -outline-offset-4 dark:bg-teal-950/50"
      )}
    >
      {lead}
      {items.length > 0 && <ul className="flex flex-col gap-1.5">{items}</ul>}
      {active && cell.topics.length === 0 && (
        <p className="px-1.5 py-1 text-[11.5px] font-semibold text-teal-800 dark:text-teal-300">
          {dropLabel}
        </p>
      )}
      {/* Capture where it belongs. Hidden until the cell is hovered, or the
          board becomes thirty identical Add buttons. Never into the past. */}
      {!drag && !past && cardProps.onAddHere && (
        <div
          className={cx(
            !alwaysCompose &&
              "opacity-0 transition-opacity focus-within:opacity-100 group-hover/cell:opacity-100 touch:opacity-100"
          )}
        >
          <InlineComposer
            compact
            label={composerLabel}
            placeholder={`${composerLabel}…  #tag !`}
            onAdd={(raw) => cardProps.onAddHere?.(raw, cell.key)}
          />
        </div>
      )}
    </div>
  );
}

// ── The tray ───────────────────────────────────────────────────────────────

function TrayRail({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show ideas (${count})`}
      className="sticky top-16 flex w-12 shrink-0 flex-col items-center gap-2.5 rounded-[14px] bg-tertiary py-3.5 text-secondary transition-colors hover:bg-quaternary"
    >
      <IdeasIcon className="size-[18px]" />
      <span className="font-mono text-[11px]">{count}</span>
      <span className="font-serif text-[15px] text-primary [writing-mode:vertical-rl]">Ideas</span>
    </button>
  );
}

function IdeasTray({
  direction,
  curriculum,
  tags,
  groups,
  parked,
  ideaCount,
  drag,
  columnRef,
  cardProps,
  onCapture,
  onFold,
  onAllIdeas,
}: {
  direction: BoardDirection;
  curriculum: CurriculumSlot[];
  tags: Tag[];
  groups: BucketGroup[];
  parked?: BucketGroup;
  ideaCount: number;
  drag: ReturnType<typeof useBoardDnD>["drag"];
  columnRef: ReturnType<typeof useBoardDnD>["zoneRef"];
  cardProps: CardHandlers;
  onCapture: (text: string, slotId?: string) => void;
  onFold?: () => void;
  onAllIdeas: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [parkedOpen, setParkedOpen] = useState(false);

  // Filtering to a section means adding into it, too.
  const slotOf = filter !== "all" && filter !== "untagged" ? filter : undefined;
  const filterLabel = curriculum.find((s) => s.id === slotOf)?.label;

  const capture = () => {
    const text = draft.trim();
    if (!text) return;
    onCapture(text, slotOf);
    setDraft("");
    // Never let a capture vanish behind the active filter.
    const landsIn = text.includes("#") ? "all" : (slotOf ?? "untagged");
    if (filter !== "all" && filter !== landsIn) setFilter(landsIn);
  };

  const dropActive = (key: string) =>
    drag?.over === key || (key === "backlog" && drag?.over?.startsWith("backlog"));

  const visible = groups.flatMap((g) => {
    if (!g.topics.length) return [];
    if (filter === "all") return [g];
    if (filter === "untagged" && g.key === "backlog") return [g];
    if (g.slotId === filter) return [g];
    return [];
  });
  // Mid-drag every group is a target, empty or not.
  const listGroups = drag ? groups : visible;

  const filters: { id: string; label: string; count: number; slotId?: string }[] = [
    { id: "all", label: "All", count: ideaCount },
  ];
  const untagged = groups.find((g) => g.key === "backlog" && curriculum.length > 0);
  if (untagged && (untagged.topics.length || filter === "untagged"))
    filters.push({ id: "untagged", label: "Untagged", count: untagged.topics.length });
  for (const s of curriculum) {
    const n = groups.find((g) => g.slotId === s.id)?.topics.length ?? 0;
    if (n > 0 || filter === s.id) filters.push({ id: s.id, label: s.label, count: n, slotId: s.id });
  }

  return (
    <section
      aria-label="Ideas for this meeting"
      className="flex flex-col gap-3.5 rounded-[18px] bg-tertiary px-3.5 pt-4 pb-3"
    >
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="font-serif text-[22px] leading-[26px]">Ideas</h2>
        <span className="font-mono text-[12px] text-quaternary">{ideaCount}</span>
        <span className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={onAllIdeas}
            className="text-[12px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400"
          >
            All ideas
          </button>
          {onFold && (
            <button
              type="button"
              onClick={onFold}
              className="text-[12px] font-semibold text-tertiary hover:text-secondary"
            >
              Hide
            </button>
          )}
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          capture();
        }}
        className="flex h-[42px] items-center gap-2 rounded-[11px] border border-secondary bg-primary px-3 shadow-[0_1px_1.5px_rgba(10,34,37,0.05)] focus-within:border-teal-300 dark:focus-within:border-teal-700"
      >
        <Plus aria-hidden className="size-3.5 shrink-0 text-quaternary" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={filterLabel ? `Add to ${filterLabel}…` : CAPTURE_PLACEHOLDER[direction]}
          aria-label={filterLabel ? `Add an idea to ${filterLabel}` : "Add an idea"}
          enterKeyHint="done"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-quaternary"
        />
        <span aria-hidden className="font-mono text-[10.5px] text-quaternary">
          #tag ↵
        </span>
      </form>

      {filters.length > 1 && (
        <div className="-mx-1 flex flex-wrap gap-0.5" role="group" aria-label="Filter ideas">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              // The button is the 44px touch target; the pill inside it keeps
              // its 26px, so the selected one doesn't swell into a black disc.
              className="group/chip inline-flex items-center text-[12px] font-medium touch:min-h-11"
            >
              <span
                className={cx(
                  "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2 transition-colors",
                  filter === f.id
                    ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                    : "text-tertiary group-hover/chip:bg-primary group-hover/chip:text-secondary"
                )}
              >
                {f.slotId && (
                  <i
                    aria-hidden
                    className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, f.slotId, tags))}
                  />
                )}
                {f.label}
                <span className="font-mono text-[10.5px] opacity-70">{f.count}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={columnRef("backlog")}
        className={cx(
          "-mx-1 flex max-h-[min(30rem,55vh)] flex-col gap-3 overflow-y-auto rounded-xl px-1 py-0.5",
          drag && "min-h-16",
          dropActive("backlog") && !groups.some((g) => g.key !== "backlog" && drag?.over === g.key) &&
            "ring-2 ring-teal-500"
        )}
      >
        {listGroups.length === 0 && (
          <p className="px-2 py-5 font-serif text-[16px] leading-6 text-secondary italic">
            {ideaCount === 0
              ? drag
                ? "Drop here to take it off the week."
                : "Nothing waiting. Capture something above."
              : "Nothing in this section."}
          </p>
        )}
        {listGroups.map((group) => (
          <div
            key={group.key}
            ref={columnRef(group.key)}
            className={cx(
              "flex flex-col gap-1.5 rounded-[11px]",
              drag && "p-1",
              drag?.over === group.key && "bg-teal-50/90 ring-2 ring-teal-500 ring-inset dark:bg-teal-950/40"
            )}
          >
            {(filter === "all" || drag) && group.label !== "Ideas" && (
              <span className="eyebrow flex items-center gap-1.5 px-1">
                {group.slotId && (
                  <i
                    aria-hidden
                    className={cx("size-2 rounded-[2px]", slotDotClass(curriculum, group.slotId, tags))}
                  />
                )}
                {group.label}
              </span>
            )}
            {group.topics.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {group.topics.map((t) => (
                  <BoardCard
                    key={t.id}
                    topic={t}
                    columnKey={group.key}
                    past={false}
                    tickable
                    covered={false}
                    isDragging={cardProps.lifted(t.id)}
                    {...cardProps}
                  />
                ))}
              </ul>
            )}
            {drag && group.topics.length === 0 && (
              <p className="rounded-[10px] border border-dashed border-primary px-2 py-2.5 text-center text-[11.5px] text-quaternary">
                Drop in {group.label.toLowerCase()}
              </p>
            )}
          </div>
        ))}
      </div>

      {parked && (
        <div
          ref={columnRef(parked.key)}
          className={cx(
            "border-t border-primary pt-1",
            drag?.over === parked.key && "rounded-lg bg-teal-50/90 ring-2 ring-teal-500 dark:bg-teal-950/40"
          )}
        >
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 px-1.5 text-left text-[12.5px] font-medium text-tertiary hover:text-secondary"
            onClick={() => setParkedOpen((v) => !v)}
            aria-expanded={parkedOpen}
          >
            Parked
            <span className="font-mono text-[11px]">{parked.topics.length}</span>
            <ChevronRight
              aria-hidden
              className={cx("ml-auto size-3.5 transition-transform", parkedOpen && "rotate-90")}
            />
          </button>
          {drag && !parkedOpen && (
            <p className="px-1.5 pb-2 text-[11.5px] text-quaternary">Drop here to set it aside.</p>
          )}
          {parkedOpen && parked.topics.length > 0 && (
            <ul className="flex flex-col gap-1.5 pb-1">
              {parked.topics.map((t) => (
                <BoardCard
                  key={t.id}
                  topic={t}
                  columnKey={parked.key}
                  past={false}
                  tickable
                  covered={false}
                  isDragging={cardProps.lifted(t.id)}
                  {...cardProps}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ── The card ───────────────────────────────────────────────────────────────

function NotesGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-3" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8.5h5M9 13h7M9 16.5h5" strokeLinecap="round" />
    </svg>
  );
}

/** One muted line under the title, in priority order. */
function cardMeta(topic: Topic, covered: boolean): ReactNode[] {
  if (covered) return [];
  const out: ReactNode[] = [];
  if (topic.returnedOn) {
    out.push(
      <span key="back" className="text-cond-watch-ink">
        Came back
        {topic.returnedFromDate ? ` · ${fmtDay(topic.returnedFromDate, { month: "short", day: "numeric" })}` : ""}
      </span>
    );
  } else if (topic.carried > 1) {
    out.push(
      <span key="pushed" className="text-cond-watch-ink">
        Pushed {topic.carried}×
      </span>
    );
  }
  if (topic.dueDate) {
    const late = topic.dueDate < todayISO();
    out.push(
      <span key="due" className={late ? "text-cond-critical-ink" : undefined}>
        Due {fmtDay(topic.dueDate, { month: "short", day: "numeric" })}
      </span>
    );
  }
  if (topic.points?.length) {
    out.push(
      <span key="pts">
        {topic.points.filter((p) => p.done).length}/{topic.points.length} points
      </span>
    );
  }
  if (topic.detail?.trim()) {
    out.push(
      <span key="notes" title="Has notes" className="inline-flex">
        <NotesGlyph />
      </span>
    );
  }
  return out;
}

function BoardCard({
  topic,
  columnKey,
  past,
  tickable,
  covered,
  isDragging,
  moveGroups,
  handleProps,
  onMove,
  onReorder,
  onCover,
  onRoll,
  onBacklog,
  onDelete,
  onOpen,
  selected,
  onPick,
  onPlain,
  onMenu,
}: {
  topic: Topic;
  columnKey: string;
  past: boolean;
  /** Shows the done tick: a week that is a real meeting, or an idea. */
  tickable: boolean;
  covered: boolean;
  isDragging: boolean;
} & CardHandlers) {
  const ref = useRef<HTMLLIElement>(null);
  const name = topic.text || "topic";
  const down = useRef<{ x: number; y: number } | null>(null);
  const picked = selected.has(topic.id);
  const { rowProps, handleProps: keyHandleProps } = useReorderableRow({
    label: `“${name}”`,
    onMove: (dir) => onReorder(topic.id, dir),
    onDelete: () => onDelete(topic),
  });

  const grab = handleProps(topic.id, columnKey, ref);
  /*
   * Drag from anywhere on the card — this board asks you to move things
   * constantly, and a dot-sized handle is a target you have to aim for.
   * Controls opt out so a tick stays a tick; a drag only begins past the slop
   * threshold anyway, so the two never compete.
   */
  const cardGrab = {
    ...grab,
    onPointerDown: (e: ReactPointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY };
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, a, label, [role="checkbox"], button')) return;
      grab.onPointerDown(e);
    },
    /*
     * A press that never travelled is a click. Held with ⌘/Ctrl or Shift it
     * selects; plain, it opens the idea — and lets go of any selection first,
     * so what opens is never a surprise next to a highlighted group.
     */
    onClick: (e: ReactMouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, select, textarea, a, label, [role="checkbox"], button')) return;
      const start = down.current;
      down.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      if (e.shiftKey || hasMod(e)) {
        onPick(topic.id, e);
        return;
      }
      onPlain();
      onOpen?.(topic.id);
    },
  };

  const shares = useStore((s) => s.shares);
  const fromThem = useFromThem();
  const isNew = fromThem.fresh.has(topic.id);
  const stepsBack = fromThem.theirs && !topic.raisedBy;
  const meta = cardMeta(topic, covered);
  // On a shared meeting the card says whose it is and whether it's mine alone.
  const raiser = topic.raisedBy ? shares.find((s) => s.id === topic.raisedBy) : undefined;
  if (topic.raisedBy) {
    meta.unshift(
      <span key="raised" className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold tracking-normal text-teal-700 normal-case dark:text-teal-400">
        <Avatar name={raiser?.name ?? raiser?.email ?? "?"} size={14} />
        {raiser ? `${shareFirstName(raiser)} raised` : "Raised by a guest"}
      </span>
    );
  }
  if (isNew) {
    meta.unshift(
      <span key="new" className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold tracking-normal text-teal-700 normal-case dark:text-teal-400">
        <i aria-hidden className="size-1.5 rounded-full bg-teal-600 dark:bg-teal-400" />
        New
      </span>
    );
  }
  if (topic.shared && !topic.sessionId && !topic.raisedBy && !topic.private) {
    meta.push(
      <span key="shared" className="inline-flex items-center gap-1" title="On the shared page, under Ideas for later">
        <Users01 aria-hidden className="size-3" /> Shared
      </span>
    );
  }
  if (topic.private) {
    meta.push(
      <span key="private" className="inline-flex items-center gap-1" title="Only you — kept off the shared page">
        <Lock01 aria-hidden className="size-3" /> Only you
      </span>
    );
  }
  const slipped = past && !covered;

  return (
    <li
      ref={ref}
      data-drag-item={topic.id}
      data-selected={picked || undefined}
      {...rowProps}
      onKeyDown={(e) => {
        // The menu key, or Shift+F10: the keyboard's right-click.
        if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
          e.preventDefault();
          e.stopPropagation();
          const r = ref.current?.getBoundingClientRect();
          if (r) onMenu(topic.id, r.left + 16, r.top + r.height / 2, true);
          return;
        }
        rowProps.onKeyDown(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // On a touchscreen the long press is the drag; it doesn't also get a menu.
        if ((e.nativeEvent as PointerEvent).pointerType === "touch") return;
        onMenu(topic.id, e.clientX, e.clientY, false);
      }}
      className={cx(
        "group/card relative list-none rounded-[10px] border transition-[border-color,box-shadow]",
        covered
          ? "border-transparent bg-secondary"
          : slipped
            ? "border-cond-watch bg-primary shadow-[inset_3px_0_0_var(--color-cond-watch)]"
            : "border-secondary bg-primary shadow-[0_1px_1.5px_rgba(10,34,37,0.05)] hover:border-primary hover:shadow-[0_2px_6px_-2px_rgba(10,34,37,0.14)]",
        picked &&
          "border-teal-600 bg-teal-50 shadow-[0_0_0_1px_var(--color-teal-600)] hover:border-teal-600 dark:border-teal-500 dark:bg-teal-950/50 dark:shadow-[0_0_0_1px_var(--color-teal-500)]",
        stepsBack && !picked && "opacity-35 hover:opacity-100",
        isDragging && "opacity-35"
      )}
    >
      {/*
        The keyboard handle: ⌥↑/⌥↓ to reorder, Delete to remove. Invisible
        until it has focus — the whole card is the drag target for a pointer,
        and a visible grip would eat a fifth of a narrow column.
      */}
      <button
        type="button"
        aria-label={HANDLE_LABEL(name)}
        title="Drag, or ⌥↑ / ⌥↓ to reorder · Delete to remove"
        className="absolute top-1.5 -left-2.5 z-10 flex size-5 cursor-grab touch-none items-center justify-center rounded-md bg-primary text-quaternary opacity-0 shadow-xs ring-1 ring-secondary select-none group-hover/card:opacity-100 focus-visible:opacity-100"
        {...keyHandleProps}
        {...handleProps(topic.id, columnKey, ref)}
      >
        <DotsGrid className="size-3" />
      </button>

      <div
        {...cardGrab}
        // Not selectable text: a Shift-click would otherwise paint a text range
        // across the board, and a press here is a drag, never a caret.
        className="flex cursor-grab items-start gap-2 px-2.5 py-2 select-none active:cursor-grabbing"
      >
        {picked && <span className="sr-only">Selected.</span>}
        {tickable && (
          <Checkbox
            size="sm"
            aria-label={`${topic.sessionId ? "Covered" : "Done"}: “${name}”`}
            isSelected={covered}
            onChange={(selected) => onCover(topic.id, selected)}
            className="mt-px shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              "text-[13px] leading-[18px] break-words",
              covered ? "text-quaternary line-through" : "text-primary"
            )}
          >
            {topic.urgent && !covered && (
              <span className="mr-1 font-semibold text-cond-critical-ink" aria-label="Urgent">
                !
              </span>
            )}
            {topic.text || <span className="text-quaternary italic">Untitled</span>}
          </p>
          {meta.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] tracking-[0.02em] text-quaternary uppercase">
              {meta}
            </div>
          )}
        </div>
      </div>

      {slipped && (
        <div className="flex flex-wrap items-center gap-x-3 border-t border-cond-watch-soft px-2.5 py-1.5">
          <button
            type="button"
            onClick={() => onRoll(topic)}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-cond-watch-ink hover:underline touch:min-h-11"
          >
            Next time
            <ArrowRight className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => onBacklog(topic.id)}
            className="text-[11.5px] font-semibold text-tertiary hover:underline touch:min-h-11"
          >
            Back to ideas
          </button>
        </div>
      )}

      {/*
        "Move to…" is the keyboard and screen-reader path, so it cannot simply
        be hidden — a display:none control leaves the tab order. It collapses
        to nothing instead, and opens on keyboard focus, or on touch, where
        there is no hover to rely on.
      */}
      <label className="flex max-h-0 items-center gap-1 overflow-hidden border-secondary px-2.5 opacity-0 transition-all duration-150 touch:max-h-12 touch:border-t touch:py-1 touch:opacity-100 has-focus-visible:max-h-12 has-focus-visible:border-t has-focus-visible:py-1 has-focus-visible:opacity-100">
        <span className="sr-only">Move “{name}” to</span>
        <select
          value={columnKey}
          onChange={(e) => onMove(topic.id, e.target.value)}
          className="min-h-7 w-full cursor-pointer rounded border-0 bg-transparent py-0 text-[11.5px] text-tertiary outline-none touch:min-h-11"
        >
          {moveGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </li>
  );
}
