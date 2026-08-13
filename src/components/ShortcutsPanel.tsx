import { useMemo } from "react";
import { Modal } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { useOverlayGuard, useShortcutList } from "@/hooks/use-shortcut";
import { keysOf, type ShortcutGroup } from "@/lib/shortcuts";

/**
 * The `?` sheet — every shortcut the app has, in one place.
 *
 * Most of it is generated from the live registry, so a binding cannot drift out
 * of the documentation: it *is* the documentation. The static rows below are the
 * conventions that aren't single chords — the `g` sequences, and the handful of
 * behaviours that belong to a focused control rather than to the page.
 */

type Row = { keys: string; label: string };

const GROUP_ORDER: ShortcutGroup[] = [
  "Global",
  "Navigation",
  "Org tree",
  "Lists & rows",
  "Writing",
];

/**
 * The rows the registry can't supply.
 *
 * Two kinds live here. The first is conventions that aren't a single chord —
 * Tab, the `g` sequences, what ↵ means on a focused row. The second is
 * context-scoped bindings that are only *registered* while their surface is
 * mounted: press `?` from the People tab and the org tree's mode keys would
 * otherwise be missing from a sheet that claims to list everything.
 *
 * Rows are de-duplicated against the registry by their keys, so when you *are*
 * on the tree each one appears once, from whichever source got there first.
 */
const STATIC: Record<string, Row[]> = {
  Navigation: [
    { keys: "G then O / T / M / B / P", label: "Go to Overview, Tree, Meetings, Table or People" },
    { keys: "Tab / ⇧Tab", label: "Move between controls" },
    { keys: "↵ or Space", label: "Open the focused row, card or button" },
    { keys: "Esc", label: "Close the open entity, dialog or menu" },
  ],
  "Org tree": [
    { keys: "1–4", label: "Switch tree mode — Chart, Prep, Assess, Pray" },
    { keys: "⇧1–⇧9", label: "Filter the tree by domain — ⇧1 is All" },
    { keys: "↵", label: "Open the focused card on the canvas" },
    { keys: "↑ ↓ ← →", label: "Nudge the selected card; ⇧ for bigger steps" },
  ],
  "Lists & rows": [
    { keys: "← / →", label: "Page to the previous or next sibling entity" },
    { keys: "↑ / ↓", label: "Move within a toolbar, menu or result list" },
    { keys: "⌥↑ / ⌥↓", label: "Move the focused topic up or down its column" },
    { keys: "Del", label: "Delete the focused topic (from its handle)" },
  ],
  Writing: [
    { keys: "/", label: "Block menu in the note editor — ↑↓ to pick, ↵ to insert" },
    { keys: "↵", label: "Commit an inline field; ⇧↵ for a new line" },
    { keys: "Esc", label: "Discard an inline edit and restore what was there" },
  ],
};

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  useOverlayGuard();
  const shortcuts = useShortcutList();

  const grouped = useMemo(() => {
    const byGroup = new Map<string, Row[]>();
    for (const g of GROUP_ORDER) byGroup.set(g, []);

    // Keyed on the chord alone: the same keys in the same group are the same
    // binding, whether they arrived from the registry or from the table above.
    // Two surfaces also bind one idea to one chord (Escape closes whatever is
    // open), and that should read as one line.
    const add = (group: string, row: Row) => {
      const rows = byGroup.get(group) ?? [];
      if (rows.some((r) => r.keys === row.keys)) return;
      rows.push(row);
      byGroup.set(group, rows);
    };

    for (const s of shortcuts) add(s.group, { keys: keysOf(s), label: s.label });
    for (const [group, rows] of Object.entries(STATIC)) {
      for (const row of rows) add(group, row);
    }
    return [...byGroup.entries()].filter(([, rows]) => rows.length > 0);
  }, [shortcuts]);

  return (
    <Modal
      title="Keyboard shortcuts"
      subtitle="Leadwell is built to run without a mouse. Press ? any time to bring this back."
      size="lg"
      onClose={onClose}
      footer={
        <Button size="md" color="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="grid gap-x-8 gap-y-6 @2xl:grid-cols-2">
        {grouped.map(([group, rows]) => (
          <section key={group} className="break-inside-avoid">
            <h3 className="mb-2 text-caption font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
              {group}
            </h3>
            <dl className="divide-y divide-stone-100 dark:divide-stone-800">
              {rows.map((row) => (
                <div
                  key={`${row.keys}-${row.label}`}
                  className="flex items-baseline justify-between gap-4 py-1.5"
                >
                  <dt className="min-w-0 text-sm text-stone-600 dark:text-stone-300">
                    {row.label}
                  </dt>
                  <dd className="shrink-0">
                    <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-caption whitespace-nowrap text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300">
                      {row.keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-6 border-t border-stone-100 pt-4 text-xs leading-relaxed text-quaternary dark:border-stone-800">
        Single-letter shortcuts stand down while you're typing — a bare{" "}
        <kbd className="font-mono">C</kbd> in the middle of a note is a C.
      </p>
    </Modal>
  );
}
