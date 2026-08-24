import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { CoverageBar } from "./CoverageBar";
import { DropList } from "./DropList";
import { LabTopicCard } from "./LabTopicCard";
import { TemplateEditor } from "./TemplateEditor";
import { tagDotClass } from "./TagChip";
import { useBoardDnD } from "./useBoardDnD";
import type { DropTarget, LabApi } from "./store";
import {
  coverageStats,
  parseSlotKey,
  plannedSlots,
  slotHint,
  slotKey,
  slotLabel,
} from "./slots";
import { UNSORTED, parseZoneKey, zoneKey } from "./types";
import type { LabSlot, LabTopic } from "./types";

const IDEAS = "ideas";
const PARKED = "parked";

export function Planner({ api }: { api: LabApi }) {
  const { state } = api;
  const meeting = state.meetings.find((m) => m.id === state.activeMeetingId);
  const [templateOpen, setTemplateOpen] = useState(false);

  const slots = useMemo(
    () =>
      meeting
        ? plannedSlots(meeting, state.sessions, state.topics, state.today)
        : [],
    [meeting, state.sessions, state.topics, state.today]
  );

  /** The only occurrence you can actually run right now. */
  const nextKey = useMemo(() => {
    const next = slots.find((sl) => !sl.past);
    return next ? slotKey(next) : null;
  }, [slots]);

  const stats = useMemo(
    () =>
      meeting ? coverageStats(meeting, slots, state.topics, state.tags) : [],
    [meeting, slots, state.topics, state.tags]
  );

  /** Zone key → drop target. The board's whole vocabulary lives here. */
  const onDrop = useCallback(
    (topicId: string, zone: string, index: number) => {
      if (!meeting) return;
      if (zone === IDEAS) {
        api.moveTopic(topicId, { kind: "ideas", meetingId: meeting.id }, index);
        return;
      }
      if (zone === PARKED) {
        api.moveTopic(topicId, { kind: "parked", meetingId: meeting.id }, index);
        return;
      }
      const parsed = parseZoneKey(zone);
      if (!parsed) return;
      const slot = parseSlotKey(parsed.slotKey);
      const target: DropTarget = {
        kind: "session",
        meetingId: meeting.id,
        sessionId: slot.sessionId,
        date: slot.date,
        sectionId: parsed.sectionId,
      };
      api.moveTopic(topicId, target, index);
    },
    [api, meeting]
  );

  const dnd = useBoardDnD(onDrop);

  const addTo = useCallback(
    (zone: string, raw: string) => {
      if (!meeting) return;
      if (zone === IDEAS) {
        api.addTopic(raw, { kind: "ideas", meetingId: meeting.id });
        return;
      }
      const parsed = parseZoneKey(zone);
      if (!parsed) return;
      const slot = parseSlotKey(parsed.slotKey);
      api.addTopic(raw, {
        kind: "session",
        meetingId: meeting.id,
        sessionId: slot.sessionId,
        date: slot.date,
        sectionId: parsed.sectionId,
      });
    },
    [api, meeting]
  );

  const railTopics = useMemo(() => {
    if (!meeting) return [];
    return state.topics
      .filter(
        (t) =>
          t.status === "open" &&
          !t.sessionId &&
          t.lane !== "parked" &&
          (t.meetingId === meeting.id ||
            !t.meetingId ||
            t.suggestedMeetingId === meeting.id)
      )
      .sort((a, b) => a.order - b.order);
  }, [meeting, state.topics]);

  const returned = railTopics.filter((t) => t.returnedOn);
  const ideas = railTopics.filter((t) => !t.returnedOn);

  const parked = useMemo(() => {
    if (!meeting) return [];
    return state.topics
      .filter(
        (t) =>
          t.meetingId === meeting.id &&
          t.lane === "parked" &&
          t.status === "open" &&
          !t.sessionId
      )
      .sort((a, b) => a.order - b.order);
  }, [meeting, state.topics]);

  // Keyboard: ←→ across weeks, ↑↓ within a band, x covers, a moves.
  useEffect(() => {
    if (!meeting) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const el = document.activeElement as HTMLElement | null;
      const topicId = el
        ?.closest?.("[data-topic-id]")
        ?.getAttribute("data-topic-id");
      if (!topicId) return;
      const topic = state.topics.find((x) => x.id === topicId);

      if (e.key === "ArrowRight") {
        e.preventDefault();
        api.moveTopicToAdjacent(topicId, 1, meeting.id);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        api.moveTopicToAdjacent(topicId, -1, meeting.id);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        api.nudgeTopic(topicId, -1);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        api.nudgeTopic(topicId, 1);
      }
      if ((e.key === "x" || e.key === "X") && topic?.sessionId) {
        e.preventDefault();
        api.coverTopic(topicId, topic.status === "open");
      }
      if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        api.openQuickAssign(topicId);
      }
      if (e.key === "Tab" && topic) {
        if (
          (!topic.meetingId && topic.suggestedMeetingId) ||
          (topic.tagIds.length === 0 && (topic.suggestedTagIds?.length ?? 0) > 0)
        ) {
          e.preventDefault();
          api.acceptSuggestion(topicId);
        }
      }
      if (e.key === "Escape" && topic) {
        if (topic.suggestedMeetingId || (topic.suggestedTagIds?.length ?? 0) > 0) {
          e.preventDefault();
          api.dismissSuggestion(topicId);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api, meeting, state.topics]);

  if (!meeting) {
    return (
      <p className="py-12 text-center text-sm text-quaternary">
        Pick a meeting from Ideas.
      </p>
    );
  }

  const topicsIn = (slot: LabSlot, sectionId: string): LabTopic[] => {
    if (!slot.sessionId) return [];
    return state.topics
      .filter(
        (t) =>
          t.sessionId === slot.sessionId &&
          t.meetingId === meeting.id &&
          t.status !== "dropped" &&
          (t.sectionId ?? UNSORTED) === sectionId
      )
      .sort((a, b) => a.order - b.order);
  };

  const allIn = (slot: LabSlot): LabTopic[] =>
    slot.sessionId
      ? state.topics.filter(
          (t) =>
            t.sessionId === slot.sessionId &&
            t.meetingId === meeting.id &&
            t.status !== "dropped"
        )
      : [];

  const dragged = dnd.drag
    ? state.topics.find((t) => t.id === dnd.drag!.id)
    : null;

  const card = (
    topic: LabTopic,
    zone: string,
    inWeek: boolean,
    bandTagId?: string
  ) => (
    <LabTopicCard
      key={topic.id}
      topic={topic}
      zone={zone}
      tags={state.tags}
      meetings={state.meetings}
      compact
      showCheckbox={inWeek}
      hideTagIds={bandTagId ? [bandTagId] : undefined}
      isDragging={dnd.drag?.id === topic.id}
      handleProps={dnd.handleProps}
      onCover={inWeek ? (c) => api.coverTopic(topic.id, c) : undefined}
      onDelete={() => api.deleteTopic(topic.id)}
      onAcceptSuggestion={() => api.acceptSuggestion(topic.id)}
      onOpen={() => api.openTopic(topic.id)}
      onPromote={() => api.promoteToFollowUp(topic.id)}
      onPark={() =>
        api.moveTopic(topic.id, { kind: "parked", meetingId: meeting.id })
      }
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">
            {meeting.name}
          </h2>
          <p className="text-caption text-quaternary">
            {meeting.rhythm} · {meeting.subjectName} ·{" "}
            {meeting.template.length} bands
          </p>
        </div>
        <Button
          size="sm"
          color={templateOpen ? "primary" : "secondary"}
          onClick={() => setTemplateOpen((v) => !v)}
        >
          Running order
        </Button>
      </div>

      {templateOpen && (
        <TemplateEditor
          api={api}
          meeting={meeting}
          onClose={() => setTemplateOpen(false)}
        />
      )}

      <CoverageBar stats={stats} tags={state.tags} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* Left rail — ideas, what came back, parked */}
        <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-72 xl:w-80">
          <div className="group/col flex flex-col gap-2 rounded-xl border border-secondary bg-stone-50/40 p-2 dark:bg-stone-950/30">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-semibold">Ideas</span>
              <span className="text-caption tabular-nums text-quaternary">
                {ideas.length}
              </span>
            </div>
            <DropList
              zone={IDEAS}
              topics={ideas}
              dnd={dnd}
              onAdd={(raw) => addTo(IDEAS, raw)}
              renderCard={(t) => card(t, IDEAS, false)}
              empty={
                <p className="px-1 py-3 text-center text-caption text-quaternary">
                  Drop topics here, or add one.
                </p>
              }
            />

            {returned.length > 0 && (
              <div className="border-t border-secondary pt-2">
                <p className="px-1 text-caption font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-500">
                  Came back · {returned.length}
                </p>
                <p className="px-1 pb-1 text-caption text-quaternary">
                  Unchecked when the day passed.
                </p>
                <ul className="space-y-1">
                  {returned.map((t) => card(t, IDEAS, false))}
                </ul>
              </div>
            )}

            {parked.length > 0 && (
              <div className="border-t border-secondary pt-2">
                <p className="px-1 pb-1 text-caption font-semibold tracking-wide text-quaternary uppercase">
                  Parked · {parked.length}
                </p>
                <DropList
                  zone={PARKED}
                  topics={parked}
                  dnd={dnd}
                  renderCard={(t) => card(t, PARKED, false)}
                />
              </div>
            )}
          </div>
        </aside>

        {/* Week strip */}
        <div
          ref={dnd.scrollerRef}
          className="scroll-contain min-w-0 flex-1 overflow-x-auto pb-2"
        >
          <div className="inline-flex min-w-full items-start gap-2">
            {slots.map((slot) => {
              const key = slotKey(slot);
              const topics = allIn(slot);
              const openCount = topics.filter((t) => t.status === "open").length;
              const coveredCount = topics.filter(
                (t) => t.status === "covered"
              ).length;
              const isToday = slot.date === state.today;
              const selected = state.activeSlotKey === key;
              const unsorted = topicsIn(slot, UNSORTED);

              return (
                <div
                  key={key}
                  className={cx(
                    "group/col flex w-[15.5rem] shrink-0 flex-col rounded-xl border bg-primary",
                    slot.past
                      ? "border-amber-300 dark:border-amber-800"
                      : isToday
                        ? "border-teal-400 dark:border-teal-700"
                        : "border-secondary",
                    selected && "ring-2 ring-teal-500"
                  )}
                >
                  <div className="border-b border-secondary px-2 py-2">
                    <div
                      className={cx(
                        "text-caption font-semibold uppercase",
                        slot.past
                          ? "text-amber-700 dark:text-amber-500"
                          : isToday
                            ? "text-teal-700 dark:text-teal-400"
                            : "text-quaternary"
                      )}
                    >
                      {slotLabel(slot)}
                    </div>
                    <div className="text-caption text-quaternary">
                      {slotHint(slot, state.today)}
                      {topics.length > 0 && (
                        <>
                          {" "}
                          · {coveredCount}/{topics.length} done
                        </>
                      )}
                    </div>
                    {isToday && openCount > 0 && state.carryMode === "inbox" && (
                      <p className="mt-1 rounded bg-amber-50 px-1.5 py-1 text-caption text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                        {openCount} unchecked — back to Ideas once today passes.
                      </p>
                    )}
                    {/*
                      Eight identical primary buttons made the loudest thing on
                      the board the one action you take once a week. Only the
                      next occurrence gets the weight.
                    */}
                    <Button
                      size="sm"
                      color={key === nextKey ? "primary" : "tertiary"}
                      className={cx(
                        "mt-1.5 w-full",
                        key !== nextKey &&
                          "opacity-0 transition group-hover/col:opacity-100 group-focus-within/col:opacity-100"
                      )}
                      onClick={() => api.openRun(meeting.id, slot)}
                    >
                      Run
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1.5 p-1.5">
                    {meeting.template.map((section) => {
                      const zone = zoneKey(key, section.id);
                      const list = topicsIn(slot, section.id);
                      const tag = state.tags.find((t) => t.id === section.tagId);
                      return (
                        <div key={section.id}>
                          <div className="flex items-center gap-1 px-0.5 pb-0.5">
                            <span
                              className={cx(
                                "size-1.5 shrink-0 rounded-full",
                                tagDotClass(tag)
                              )}
                              aria-hidden
                            />
                            <span className="truncate text-caption font-medium tracking-wide text-quaternary uppercase">
                              {section.label}
                            </span>
                            {section.minutes ? (
                              <span className="ml-auto text-caption text-quaternary opacity-60">
                                {section.minutes}m
                              </span>
                            ) : null}
                          </div>
                          <DropList
                            zone={zone}
                            topics={list}
                            dnd={dnd}
                            onAdd={(raw) => addTo(zone, raw)}
                            renderCard={(t) => card(t, zone, true, section.tagId)}
                            className="min-h-[1.75rem] p-0.5"
                          />
                        </div>
                      );
                    })}

                    {(unsorted.length > 0 || meeting.template.length === 0) && (
                      <div>
                        {meeting.template.length > 0 && (
                          <p className="px-0.5 pb-0.5 text-caption font-semibold text-quaternary">
                            Unsorted
                          </p>
                        )}
                        <DropList
                          zone={zoneKey(key, UNSORTED)}
                          topics={unsorted}
                          dnd={dnd}
                          onAdd={(raw) => addTo(zoneKey(key, UNSORTED), raw)}
                          renderCard={(t) =>
                            card(t, zoneKey(key, UNSORTED), true)
                          }
                          className="min-h-[1.75rem] p-0.5"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {dnd.drag && dragged && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rounded-lg border border-teal-400 bg-primary px-2 py-1.5 text-xs shadow-lg"
          style={{
            left: dnd.drag.x - dnd.drag.dx,
            top: dnd.drag.y - dnd.drag.dy,
            width: dnd.drag.width,
          }}
        >
          {dragged.text}
        </div>
      )}
    </div>
  );
}
