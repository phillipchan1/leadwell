import { useState } from "react";
import type { Action, ActionColumn } from "../types";
import { useStore } from "../store/useStore";
import { inputSmCls } from "./ui";

const COLUMNS: ActionColumn[] = ["backlog", "this_1on1", "parking", "done"];

/**
 * Which way the board points. Same columns and same stored values — a topic
 * for my boss is still `this_1on1` on disk — but the copy differs because the
 * job does: leading down I raise things *about them*, leading up I raise asks,
 * escalations and decisions I need *from them*.
 */
export type BoardDirection = "down" | "up";

const COLUMN_LABEL: Record<BoardDirection, Record<ActionColumn, string>> = {
  down: {
    backlog: "Backlog",
    this_1on1: "This 1:1",
    parking: "Parking",
    done: "Done",
  },
  up: {
    backlog: "Backlog",
    this_1on1: "This check-in",
    parking: "Parking",
    done: "Done",
  },
};

const ADD_PLACEHOLDER: Record<BoardDirection, string> = {
  down: "Talk about…",
  up: "Ask, escalate, flag…",
};

export function TopicKanban({
  personId,
  direction = "down",
}: {
  personId: string;
  direction?: BoardDirection;
}) {
  const { actions, addAction, updateAction, setActionColumn, deleteAction } =
    useStore();
  const mine = actions.filter((a) => a.personId === personId);
  const [drafts, setDrafts] = useState<Partial<Record<ActionColumn, string>>>(
    {}
  );
  const [dragId, setDragId] = useState<string | null>(null);

  const byColumn = (col: ActionColumn) =>
    mine.filter((a) => (a.column ?? (a.done ? "done" : "backlog")) === col);

  const submit = (column: ActionColumn) => {
    const text = drafts[column]?.trim();
    if (!text) return;
    addAction(personId, text, undefined, column);
    setDrafts((d) => ({ ...d, [column]: "" }));
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {COLUMNS.map((col) => {
        const items = byColumn(col);
        const canQuickAdd = col === "backlog" || col === "this_1on1";
        return (
          <div
            key={col}
            className="flex w-[11.5rem] shrink-0 flex-col rounded-xl border border-stone-200 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-950/40"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/action-id") || dragId;
              if (id) setActionColumn(id, col);
              setDragId(null);
            }}
          >
            <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1">
              <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
                {COLUMN_LABEL[direction][col]}
              </span>
              <span className="text-[10px] tabular-nums text-stone-400">
                {items.length}
              </span>
            </div>
            <ul className="flex min-h-[4rem] flex-1 flex-col gap-1.5 px-2 pb-2">
              {items.map((a) => (
                <TopicCard
                  key={a.id}
                  action={a}
                  onDragStart={() => setDragId(a.id)}
                  onDragEnd={() => setDragId(null)}
                  onText={(text) => updateAction(a.id, { text })}
                  onDelete={() => deleteAction(a.id)}
                />
              ))}
            </ul>
            {canQuickAdd && (
              <form
                className="border-t border-stone-200 p-2 dark:border-stone-800"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(col);
                }}
              >
                <input
                  className={inputSmCls}
                  placeholder={ADD_PLACEHOLDER[direction]}
                  value={drafts[col] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [col]: e.target.value }))
                  }
                />
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TopicCard({
  action,
  onDragStart,
  onDragEnd,
  onText,
  onDelete,
}: {
  action: Action;
  onDragStart: () => void;
  onDragEnd: () => void;
  onText: (text: string) => void;
  onDelete: () => void;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/action-id", action.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group relative cursor-grab rounded-lg border border-stone-200 bg-white px-2 py-1.5 active:cursor-grabbing dark:border-stone-700 dark:bg-stone-900"
    >
      <textarea
        className={`w-full resize-none border-0 bg-transparent p-0 text-xs leading-snug outline-none ${
          action.done ? "text-stone-400 line-through" : "text-stone-700 dark:text-stone-200"
        }`}
        rows={2}
        value={action.text}
        onChange={(e) => onText(e.target.value)}
      />
      <button
        type="button"
        className="absolute top-1 right-1 rounded p-0.5 text-[10px] text-stone-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
        aria-label="Delete topic"
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  );
}
