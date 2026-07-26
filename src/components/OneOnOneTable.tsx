import type { OneOnOne } from "../types";
import { useStore } from "../store/useStore";
import {
  oneOnOneStatus,
  oneOnOneStatusLabel,
  oneOnOneSummary,
} from "../lib/oneOnOne";

const STATUS_CLS: Record<string, string> = {
  scheduled:
    "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  needs_notes:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  done: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
};

export function OneOnOneTable({
  personId,
  onOpen,
  onCreated,
}: {
  personId: string;
  onOpen: (id: string) => void;
  onCreated?: (id: string) => void;
}) {
  const { oneOnOnes, addOneOnOne, updateOneOnOne, deleteOneOnOne } = useStore();
  const rows = oneOnOnes
    .filter((o) => o.personId === personId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const createNew = () => {
    const id = addOneOnOne({
      personId,
      date: new Date().toISOString().slice(0, 10),
    });
    onCreated?.(id);
    onOpen(id);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 dark:border-stone-800">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-stone-200 bg-stone-50 text-[11px] tracking-wide text-stone-400 uppercase dark:border-stone-800 dark:bg-stone-950/60">
            <th className="w-[22%] px-2.5 py-2 font-medium">Date</th>
            <th className="w-[22%] px-2.5 py-2 font-medium">Next</th>
            <th className="w-[22%] px-2.5 py-2 font-medium">Status</th>
            <th className="px-2.5 py-2 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <OneOnOneRow
              key={o.id}
              row={o}
              onOpen={() => onOpen(o.id)}
              onPatch={(patch) => updateOneOnOne(o.id, patch)}
              onDelete={() => {
                if (confirm("Delete this 1:1?")) deleteOneOnOne(o.id);
              }}
            />
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={createNew}
        className="flex w-full items-center gap-2 border-t border-dashed border-stone-200 px-3 py-2.5 text-left text-sm text-stone-400 transition-colors hover:bg-teal-50/60 hover:text-teal-700 dark:border-stone-800 dark:hover:bg-teal-950/30 dark:hover:text-teal-300"
      >
        <span className="text-base leading-none">+</span>
        New
      </button>
    </div>
  );
}

function OneOnOneRow({
  row,
  onOpen,
  onPatch,
  onDelete,
}: {
  row: OneOnOne;
  onOpen: () => void;
  onPatch: (patch: Partial<OneOnOne>) => void;
  onDelete: () => void;
}) {
  const status = oneOnOneStatus(row);
  const summary = oneOnOneSummary(row);

  return (
    <tr
      className="group cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50/80 dark:border-stone-800/80 dark:hover:bg-stone-950/40"
      onClick={onOpen}
    >
      <td className="px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          className="field-input field-input--ghost field-input--sm tabular-nums"
          value={row.date}
          onChange={(e) => onPatch({ date: e.target.value })}
        />
      </td>
      <td className="px-1.5 py-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="date"
          className="field-input field-input--ghost field-input--sm tabular-nums text-stone-500"
          value={row.nextDate ?? ""}
          onChange={(e) =>
            onPatch({ nextDate: e.target.value || undefined })
          }
        />
      </td>
      <td className="px-2.5 py-2">
        <span
          className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[status]}`}
        >
          {oneOnOneStatusLabel(status)}
        </span>
      </td>
      <td className="relative px-2.5 py-2">
        <span
          className={`block truncate ${
            summary
              ? "text-stone-600 dark:text-stone-300"
              : "italic text-stone-400"
          }`}
        >
          {summary || "Empty — click to write"}
        </span>
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-stone-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
          aria-label="Delete 1:1"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}
