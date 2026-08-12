import { useEffect, useRef, useState } from "react";
import type { Session, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import { SessionAgenda } from "./SessionAgenda";
import { Button } from "@/components/base/buttons/button";
import { confirmAction } from "./ConfirmDialog";
import { Expand01, Trash01 } from "@untitledui/icons";
import { autoFocusUnlessTouch } from "../lib/pointer";

/**
 * Writing up a meeting without leaving the panel.
 *
 * Logging a 1:1 used to mean a full-viewport takeover: the app disappeared,
 * the rich editor booted, and closing it navigated you back. That's the right
 * surface for a long write-up and completely wrong for the thing you do twenty
 * times a week — tick what you covered, type two lines, move on.
 *
 * So this is the fast path, in place: the agenda you planned, a line for why
 * you met, and a plain textarea over the same markdown string the full editor
 * saves. Nothing is a different document — Expand opens the very same session
 * in the full editor when the write-up deserves it.
 */
export function InlineSessionEditor({
  session,
  meeting,
  onExpand,
  onDeleted,
  autoFocus = false,
}: {
  session: Session;
  meeting: TrackedMeeting;
  /** Promote this session to the full-page editor. */
  onExpand: () => void;
  onDeleted?: () => void;
  autoFocus?: boolean;
}) {
  const { updateSession, deleteSession } = useStore();
  const [notes, setNotes] = useState(session.notes ?? "");
  const [point, setPoint] = useState(session.point ?? "");
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Opening only ever happens on purpose — from a row, from "+ Log a meeting",
  // or from a readiness fix — and the history sits below a topic board, so the
  // editor has to come to you rather than wait below the fold.
  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // Switching rows reuses this component; reload from whichever session it is.
  useEffect(() => {
    setNotes(session.notes ?? "");
    setPoint(session.point ?? "");
  }, [session.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Grow to the content instead of scrolling a four-line box.
  useEffect(() => {
    const el = notesRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, [notes]);

  return (
    <div
      ref={rootRef}
      className="space-y-3 border-t border-stone-200 bg-stone-50/60 p-3 dark:border-stone-800 dark:bg-stone-950/40"
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Date
          </span>
          <input
            type="date"
            className="field-input field-input--sm tabular-nums"
            value={session.date}
            onChange={(e) => updateSession(session.id, { date: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Next
          </span>
          <input
            type="date"
            className="field-input field-input--sm tabular-nums"
            value={session.nextDate ?? ""}
            onChange={(e) =>
              updateSession(session.id, {
                nextDate: e.target.value || undefined,
              })
            }
          />
        </label>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            color="link-gray"
            iconLeading={Expand01}
            onClick={onExpand}
            aria-label="Open the full editor — transcript, AI structuring, blocks"
          >
            Expand
          </Button>
          <Button
            size="sm"
            color="link-destructive"
            iconLeading={Trash01}
            onClick={async () => {
              if (
                await confirmAction({
                  title: "Delete this entry?",
                  body: "The write-up and any transcript go with it.",
                  confirmLabel: "Delete",
                })
              ) {
                deleteSession(session.id);
                onDeleted?.();
              }
            }}
          >
            <span className="sr-only">Delete entry</span>
          </Button>
        </div>
      </div>

      <input
        type="text"
        className="field-input field-input--sm w-full"
        placeholder="Why we met this time…"
        value={point}
        onChange={(e) => {
          setPoint(e.target.value);
          updateSession(session.id, {
            point: e.target.value.trim() || undefined,
          });
        }}
      />

      {/* Ticking off what you planned is the half of the loop the board can't
          close on its own, and this is the moment it's cheap. */}
      <SessionAgenda session={session} meeting={meeting} />

      <textarea
        ref={notesRef}
        className="w-full resize-none rounded-xl border border-stone-200 bg-white p-3 text-[0.95rem] leading-relaxed text-stone-800 outline-none placeholder:text-stone-400 focus:border-teal-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        placeholder="What did you cover? Markdown works — Expand for blocks, transcript and AI."
        value={notes}
        autoFocus={autoFocus && autoFocusUnlessTouch()}
        onChange={(e) => {
          setNotes(e.target.value);
          updateSession(session.id, {
            notes: e.target.value.trim() || undefined,
          });
        }}
      />
    </div>
  );
}
