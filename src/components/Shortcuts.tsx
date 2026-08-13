import { Modal } from "./ui";

/**
 * The shortcuts that already work, in one place.
 *
 * All of these shipped long before this list did, and almost none of them were
 * discoverable: the tree modes and domain filters render `<kbd>` chips, `⌘↵`
 * appears in two tooltips, and everything else was invisible. A keyboard-first
 * user was never going to find sibling paging by pressing arrow keys at random.
 *
 * Every row here must be a shortcut that actually works. A help sheet that
 * lists something aspirational is worse than no help sheet — it teaches a
 * gesture and then doesn't answer it.
 */
const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Anywhere",
    items: [
      { keys: ["?"], label: "Show this list" },
      { keys: ["Esc"], label: "Close the top-most panel, sheet or editor" },
    ],
  },
  {
    title: "An open person, team, manager or meeting",
    items: [
      { keys: ["←"], label: "Previous sibling" },
      { keys: ["→"], label: "Next sibling" },
      { keys: ["⌘", "↵"], label: "Expand to full page, or back to the panel" },
    ],
  },
  {
    title: "Org tree",
    items: [
      { keys: ["1"], label: "Plan" },
      { keys: ["2"], label: "Prep" },
      { keys: ["3"], label: "Assess" },
      { keys: ["4"], label: "Pray" },
      { keys: ["⇧", "1"], label: "All domains" },
      { keys: ["⇧", "2–9"], label: "Filter to one domain" },
      { keys: ["↵", "Space"], label: "Open the focused card" },
    ],
  },
  {
    title: "Writing",
    items: [
      { keys: ["⌘", "↵"], label: "Save a note" },
      { keys: ["⌘", "⇧", "M"], label: "Switch editor mode" },
    ],
  },
  {
    title: "The panel divider",
    items: [{ keys: ["←", "→"], label: "Resize the panel when the divider has focus" }],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard shortcuts"
      subtitle="Press ? anywhere to bring this back."
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-1.5">
            <h3 className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
              {group.title}
            </h3>
            <ul className="flex flex-col">
              {group.items.map((item) => (
                <li
                  key={item.label}
                  className="flex min-h-9 items-center justify-between gap-4 border-b border-stone-100 py-1.5 last:border-0 dark:border-stone-800"
                >
                  <span className="min-w-0 text-sm text-stone-600 dark:text-stone-300">
                    {item.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[11px] text-stone-600 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-300"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
