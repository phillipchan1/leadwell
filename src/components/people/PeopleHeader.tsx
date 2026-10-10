import { useStore } from "@/store/useStore";
import type { Tab } from "@/lib/routes";
import { TREE_MODES } from "@/lib/treeMode";
import { DIGIT_CHORDS } from "@/lib/keys";
import { useShortcut } from "@/hooks/use-shortcut";
import { useRovingFocus } from "@/hooks/use-roving-focus";
import { FlameIcon } from "../brand/glyphs";
import { cx } from "@/utils/cx";

/*
 * People is one place with three views of the same org — Circles, Tree and
 * List — and four lenses that work on all of them: Plan, Prep, Assess, Pray.
 * View is the shape; lens is the question. They compose.
 */

const VIEWS: { tab: Tab; label: string }[] = [
  { tab: "circles", label: "Circles" },
  { tab: "tree", label: "Tree" },
  { tab: "table", label: "List" },
];

export function PeopleHeader() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const treeMode = useStore((s) => s.treeMode);
  const setTreeMode = useStore((s) => s.setTreeMode);
  const lens = TREE_MODES.find((m) => m.id === treeMode)!;

  // 1–4 pick a lens, from every view of People.
  useShortcut(
    (e) => {
      if (e.shiftKey) return;
      const digit = /^Digit([1-9])$/.exec(e.code);
      const mode = digit ? TREE_MODES[Number(digit[1]) - 1] : undefined;
      if (mode) setTreeMode(mode.id);
    },
    {
      chord: DIGIT_CHORDS,
      keysLabel: "1–4",
      label: "Switch lens — Plan, Prep, Assess, Pray",
      group: "Org tree",
    }
  );

  const up = new Set(teams.filter((t) => t.direction === "up").map((t) => t.id));
  const led = people.filter((p) => !p.teamId || !up.has(p.teamId)).length;
  const above = managers.length + people.filter((p) => p.teamId && up.has(p.teamId)).length;

  return (
    <div className="flex shrink-0 flex-col gap-4 pb-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-[34px] leading-10 font-medium tracking-[-0.01em]">People</h1>
          <span className="font-mono text-[11.5px] tracking-[0.03em] text-quaternary max-sm:hidden">
            {led} PEOPLE · {teams.length - up.size} TEAMS{above ? ` · ${above} ABOVE YOU` : ""}
          </span>
        </div>
        <Segmented
          label="View"
          className="ml-auto"
          items={VIEWS.map((v) => ({ id: v.tab, label: v.label }))}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <LensBar />
        <span className="font-serif text-[17px] text-secondary italic max-sm:hidden">{lens.question}</span>
      </div>
    </div>
  );
}

/** The four lenses as one segmented control. Pray wears vesper. */
export function LensBar() {
  const treeMode = useStore((s) => s.treeMode);
  const setTreeMode = useStore((s) => s.setTreeMode);
  const { groupProps, itemProps } = useRovingFocus();
  return (
    <div
      {...groupProps}
      role="radiogroup"
      aria-label="Lens"
      className="inline-flex gap-0.5 rounded-[11px] bg-tertiary p-[3px]"
    >
      {TREE_MODES.map((m) => {
        const on = m.id === treeMode;
        const pray = m.id === "pray";
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={on}
            {...itemProps(on)}
            onClick={() => setTreeMode(m.id)}
            title={`${m.question} (${m.key})`}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors touch:min-h-11",
              on
                ? "bg-primary font-semibold shadow-[0_1px_2px_rgba(10,34,37,0.12)]"
                : "font-medium text-tertiary hover:text-secondary",
              pray && "text-vesper"
            )}
          >
            {pray && <FlameIcon className="size-3.5" />}
            {m.label}
            <span className="font-mono text-[10.5px] text-quaternary max-sm:hidden">{m.key}</span>
          </button>
        );
      })}
    </div>
  );
}

function Segmented({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { groupProps, itemProps } = useRovingFocus();
  return (
    <div
      {...groupProps}
      role="radiogroup"
      aria-label={label}
      className={cx("inline-flex gap-0.5 rounded-[11px] bg-tertiary p-[3px]", className)}
    >
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={on}
            {...itemProps(on)}
            onClick={() => onChange(it.id)}
            className={cx(
              "h-8 rounded-lg px-3 text-[13px] transition-colors touch:min-h-11",
              on
                ? "bg-primary font-semibold shadow-[0_1px_2px_rgba(10,34,37,0.12)]"
                : "font-medium text-tertiary hover:text-secondary"
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
