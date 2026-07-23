import { useState } from "react";
import type { Action, ActionColumn } from "../types";
import { useStore } from "../store/useStore";
import { inputCls } from "./ui";

const COLUMNS: { id: ActionColumn; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "this_1on1", label: "This 1:1" },
  { id: "parking", label: "Parking" },
  { id: "done", label: "Done" },
];

export function TopicKanban({ personId }: { personId: string }) {
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
        const items = byColumn(col.id);
        const canQuickAdd = col.id === "backlog" || col.id === "this_1on1";
        return (
          <div
            key={col.id}
            className="flex w-[11.5rem] shrink-0 flex-col rounded-xl border border-line bg-surface-2/50"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/action-id") || dragId;
              if (id) setActionColumn(id, col.id);
              setDragId(null);
            }}
          >
            <div className="flex items-baseline justify-between px-2.5 pt-2 pb-1">
              <span className="label-caps">
                {col.label}
              </span>
              <span className="text-[10px] tabular-nums text-ink-3">
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
                className="border-t border-line p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(col.id);
                }}
              >
                <input
                  className={`${inputCls} text-xs`}
                  placeholder="Talk about…"
                  value={drafts[col.id] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [col.id]: e.target.value }))
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
      className="group relative cursor-grab rounded-lg border border-line bg-surface px-2 py-1.5 shadow-[0_1px_2px_rgb(35_32_28/0.06)] active:cursor-grabbing"
    >
      <textarea
        className={`w-full resize-none border-0 bg-transparent p-0 text-xs leading-snug outline-none ${
          action.done ? "text-ink-3 line-through" : "text-ink"
        }`}
        rows={2}
        value={action.text}
        onChange={(e) => onText(e.target.value)}
      />
      <button
        type="button"
        className="absolute top-1 right-1 rounded p-0.5 text-[10px] text-ink-3/70 opacity-0 hover:text-red-500 group-hover:opacity-100"
        aria-label="Delete topic"
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  );
}
