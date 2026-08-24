import { useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import {
  Dialog,
  Modal,
  ModalOverlay,
} from "@/components/application/modals/modal";
import { cx } from "@/utils/cx";
import { tagDotClass } from "./TagChip";
import type { LabApi } from "./store";
import { plannedSlots, slotHint, slotLabel } from "./slots";
import type { LabSlot } from "./types";

/**
 * The keyboard-and-thumb path to everything dragging does.
 *
 * Dragging is a nicety; this is the guarantee. It mirrors the board exactly —
 * meeting, then week, then band — so the two never drift into different mental
 * models of where a topic can go.
 */
export function QuickAssignPalette({ api }: { api: LabApi }) {
  const { state } = api;
  const topicId = state.quickAssignTopicId;
  const topic = state.topics.find((t) => t.id === topicId);
  const [picked, setPicked] = useState<{
    meetingId: string;
    slot: LabSlot;
  } | null>(null);

  useEffect(() => {
    if (!topicId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (picked) setPicked(null);
        else api.closeQuickAssign();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topicId, api, picked]);

  if (!topic) return null;

  const pickedMeeting = picked
    ? state.meetings.find((m) => m.id === picked.meetingId)
    : null;

  const send = (sectionId?: string) => {
    if (!picked) return;
    api.moveTopic(topic.id, {
      kind: "session",
      meetingId: picked.meetingId,
      sessionId: picked.slot.sessionId ?? undefined,
      date: picked.slot.sessionId ? undefined : picked.slot.date,
      sectionId,
    });
    setPicked(null);
  };

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) {
          setPicked(null);
          api.closeQuickAssign();
        }
      }}
    >
      <Modal className="max-w-md">
        <Dialog aria-label={`Move ${topic.text}`} className="p-4">
          <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">
            Move “{topic.text}”
          </h2>

          {picked && pickedMeeting ? (
            <>
              <p className="mt-1 text-xs text-quaternary">
                {pickedMeeting.name} · {slotLabel(picked.slot)} — pick a band.
                Esc to go back.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {pickedMeeting.template.map((section) => {
                  const tag = state.tags.find((t) => t.id === section.tagId);
                  return (
                    <Button
                      key={section.id}
                      size="sm"
                      color="secondary"
                      onClick={() => send(section.id)}
                    >
                      <span
                        className={cx(
                          "mr-1.5 inline-block size-2 rounded-full align-middle",
                          tagDotClass(tag)
                        )}
                        aria-hidden
                      />
                      {section.label}
                    </Button>
                  );
                })}
                <Button size="sm" color="tertiary" onClick={() => send(undefined)}>
                  Unsorted
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-quaternary">
                Pick a meeting backlog or an upcoming week. Esc to cancel.
              </p>
              {topic.sessionId && (
                <div className="mt-3 border-b border-secondary pb-3">
                  <Button
                    size="sm"
                    color="secondary"
                    onClick={() => {
                      api.returnTopic(topic.id);
                      api.closeQuickAssign();
                    }}
                  >
                    ↩ Back to Ideas
                  </Button>
                  <p className="mt-1 text-caption text-quaternary">
                    Notes it against this occurrence, same as letting the day
                    pass.
                  </p>
                </div>
              )}
              <div className="mt-3 max-h-[50vh] space-y-3 overflow-y-auto">
                {state.meetings.map((meeting) => {
                  const slots = plannedSlots(
                    meeting,
                    state.sessions,
                    state.topics,
                    state.today,
                    4
                  ).filter((s) => !s.past);
                  return (
                    <div key={meeting.id}>
                      <p className="mb-1 text-caption font-semibold tracking-wide text-quaternary uppercase">
                        {meeting.name}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          color="tertiary"
                          onClick={() =>
                            api.moveTopic(topic.id, {
                              kind: "ideas",
                              meetingId: meeting.id,
                            })
                          }
                        >
                          Ideas
                        </Button>
                        {slots.map((slot) => (
                          <Button
                            key={slot.date}
                            size="sm"
                            color="secondary"
                            onClick={() => {
                              if (meeting.template.length === 0) {
                                api.moveTopic(topic.id, {
                                  kind: "session",
                                  meetingId: meeting.id,
                                  sessionId: slot.sessionId ?? undefined,
                                  date: slot.sessionId ? undefined : slot.date,
                                });
                              } else {
                                setPicked({ meetingId: meeting.id, slot });
                              }
                            }}
                          >
                            {slotLabel(slot)}
                            <span className="ml-1 text-quaternary">
                              {slotHint(slot, state.today)}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
