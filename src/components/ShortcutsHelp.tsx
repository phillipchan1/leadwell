import { Kbd, Modal } from "./ui";

type Row = { keys: string[]; label: string; note?: string };

const NAVIGATE: Row[] = [
  { keys: ["O"], label: "Overview" },
  { keys: ["T"], label: "Org tree" },
  { keys: ["P"], label: "People table" },
  { keys: ["1", "9"], label: "Filter tree by domain", note: "on Org tree" },
  { keys: ["←", "→"], label: "Previous / next teammate", note: "person open" },
  { keys: ["Esc"], label: "Close panel · back out" },
];

const ACT: Row[] = [
  { keys: ["N"], label: "New 1:1 for the open person" },
  { keys: ["/"], label: "Search people" },
  { keys: ["A"], label: "Ask AI about your org" },
  { keys: ["D"], label: "Toggle dark mode" },
  { keys: ["?"], label: "This cheatsheet" },
];

function Section({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div>
      <h3 className="label-caps mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start gap-3 text-sm">
            <span className="flex w-16 shrink-0 items-center gap-1 pt-px">
              {r.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[10px] text-ink-3">–</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))}
            </span>
            <span className="leading-snug text-ink-2">
              {r.label}
              {r.note && (
                <span className="text-xs text-ink-3"> — {r.note}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Section title="Navigate" rows={NAVIGATE} />
        <Section title="Act" rows={ACT} />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        Shortcuts stay out of the way while you type — they only fire outside
        inputs and open dialogs.
      </p>
    </Modal>
  );
}
