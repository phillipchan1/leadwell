import { useState } from "react";
import type { Arc } from "../../types";
import { useStore } from "../../store/useStore";
import { arcMove, shortLabel, tookLonger, type PlannedStep } from "../../lib/arcs";
import type { Slot } from "../../lib/topics";
import { toast } from "../../lib/toasts";
import { ContextMenu, type MenuEntry } from "../ContextMenu";
import { ArcCover } from "./ArcCover";
import { ArcSheet } from "./ArcSheet";
import { cx } from "@/utils/cx";

/** What a dragged step carries, so a week's cell knows it's an arc step and not a topic. */
export const ARC_STEP_MIME = "application/x-polarch-arc-step";
export type ArcStepDrag = { arcId: string; date: string };

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Move an arc's step to another week, from a drop or the menu, and say so
 * with a way back. Returns false when the move isn't possible.
 */
export function moveArcStepTo(arc: Arc, slots: Slot[], fromDate: string, toDate: string, label: string): boolean {
  const move = arcMove(arc, slots, fromDate, toDate);
  if (!move) {
    if (toDate < fromDate) toast({ message: `${label} can't go before the step ahead of it.` });
    return false;
  }
  const undo = useStore.getState().moveArcSteps(
    arc.id,
    move.wait.map((s) => ({ sessionId: s.sessionId, date: s.date })),
    move.unwait
  );
  toast({
    message: `${label} moved to ${fmt(toDate)}. The steps after it moved along too.`,
    action: { label: "Undo", onAction: undo },
  });
  return true;
}

/**
 * An arc's step in a week of the planning board, in the arc's own section:
 * the same column as everything else that week. Drag it to another week, or
 * right-click to push it back or bring it forward.
 */
export function ArcGridStep({
  arc,
  planned,
  date,
  slots,
}: {
  arc: Arc;
  planned: PlannedStep;
  date: string;
  /** The board's weeks, in order: where a push back lands. */
  slots: Slot[];
}) {
  const meeting = useStore((s) => s.meetings.find((m) => m.id === arc.meetingId));
  const [menu, setMenu] = useState<{ x: number; y: number; fromKeyboard: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const { step, state } = planned;
  const movable = state === "now" || state === "later";
  const label = shortLabel(step);
  const rest = step.label.replace(label, "").replace(/^\s*[·—–:-]\s*/, "");

  const ahead = slots.filter((s) => !s.past).sort((a, b) => a.date.localeCompare(b.date));
  const i = ahead.findIndex((s) => s.date === date);
  const next = i >= 0 ? ahead[i + 1] : undefined;
  const prev = i > 0 ? ahead[i - 1] : undefined;
  const canBack = Boolean(prev && arcMove(arc, slots, date, prev.date));

  const entries: MenuEntry[] = [
    { type: "heading", label: arc.title },
    {
      type: "item",
      label: "Push back a week",
      disabled: !movable || !next,
      onSelect: () => next && moveArcStepTo(arc, slots, date, next.date, label),
    },
    {
      type: "item",
      label: "Bring forward a week",
      disabled: !movable || !canBack,
      onSelect: () => prev && moveArcStepTo(arc, slots, date, prev.date, label),
    },
    { type: "separator" },
    { type: "item", label: "Edit arc…", onSelect: () => setEditing(true) },
  ];

  return (
    <>
      <div
        role="group"
        tabIndex={0}
        aria-label={`${arc.title}: ${step.label}${movable ? ". Drag to another week, or open the menu to move it." : ""}`}
        title={`${arc.title} · ${step.label}`}
        draggable={movable}
        onDragStart={(e) => {
          const payload: ArcStepDrag = { arcId: arc.id, date };
          e.dataTransfer.setData(ARC_STEP_MIME, JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "move";
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, fromKeyboard: false });
        }}
        onKeyDown={(e) => {
          if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10") || e.key === "Enter") {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom, fromKeyboard: true });
          }
        }}
        className={cx(
          "flex items-start gap-2 rounded-[9px] px-2 py-1.5 text-[12px] leading-[15px] outline-none focus-visible:ring-2 focus-visible:ring-teal-400",
          movable && "cursor-grab active:cursor-grabbing",
          state === "done" && "bg-secondary text-tertiary",
          state === "again" && "bg-cond-watch-soft text-cond-watch-ink",
          state === "now" && "bg-teal-600 text-white shadow-[0_6px_16px_-8px_var(--color-teal-600)] dark:bg-teal-500 dark:text-stone-950",
          state === "later" && "border-[1.5px] border-dashed border-teal-300 bg-primary text-secondary dark:border-teal-800"
        )}
      >
        <ArcCover arc={arc} size="xs" className="mt-px !h-[22px] !w-[15px]" />
        <span className="flex min-w-0 flex-col gap-0.5">
          <b className={cx("font-semibold", state === "done" && "line-through decoration-stone-300")}>{label}</b>
          {(rest || state === "again") && (
            <span className="line-clamp-2 opacity-85">{rest || "carried on"}</span>
          )}
          {state === "done" && tookLonger(step) && (
            <span className="self-start rounded-[4px] bg-cond-watch-soft px-1 font-mono text-[10px] font-bold text-cond-watch-ink">
              ½
            </span>
          )}
        </span>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          fromKeyboard={menu.fromKeyboard}
          label={`Actions for ${step.label}`}
          entries={entries}
          onClose={() => setMenu(null)}
        />
      )}
      {editing && meeting && <ArcSheet meeting={meeting} arc={arc} onClose={() => setEditing(false)} />}
    </>
  );
}
