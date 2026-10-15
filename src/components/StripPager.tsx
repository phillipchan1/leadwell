import { ChevronLeft, ChevronRight } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * A strip of columns wider than its box — the planner's weeks, the Ideas
 * board's meetings — used to run under the edge at a fixed width, so whatever
 * didn't fit was left sliced through its cards. Two things fix that, and both
 * boards share them:
 *
 *   fitColumns   sizes the flexible columns so a whole number of them fill the
 *                box, and the edge lands between two columns.
 *   pageStrip    moves a page at a time and lands on a column's edge again.
 *
 * The columns a strip pages over carry `data-lane`. Wheel and trackpad
 * scrolling still go wherever they're pushed.
 */

export type StripLane = {
  /** A column that keeps its width. Omitted: the column shares the room. */
  fixed?: number;
};

export type StripMeasure = {
  /** Gap between columns. */
  gap: number;
  /** Width before the first column — a sticky label column, say. */
  lead?: number;
  /** Room kept after the last column whole, for a ring or shadow. */
  tail?: number;
  /** The narrowest a flexible column may go. */
  min: number;
  /** The widest, when every column already fits. */
  max: number;
};

/**
 * The width of a flexible column: as many columns as fit at `min`, stretched
 * to fill the box exactly. Capped at `max` only when everything fits — a cap
 * with columns still to come would leave the next one half in view.
 */
export function fitColumns(box: number, lanes: StripLane[], m: StripMeasure): number {
  if (!box) return m.min;
  // Every column has a gap before it; the first one only when a lead does.
  const start = (m.lead ? m.lead : -m.gap) + (m.tail ?? 0);
  for (let n = lanes.length; n > 0; n--) {
    const shown = lanes.slice(0, n);
    const flexible = shown.filter((l) => l.fixed === undefined).length;
    if (!flexible) continue;
    const taken = shown.reduce((sum, l) => sum + m.gap + (l.fixed ?? 0), start);
    const w = Math.floor((box - taken) / flexible);
    if (w < m.min) continue;
    return n === lanes.length ? Math.min(w, m.max) : w;
  }
  return m.min;
}

/** Scroll `el` a page of columns forward or back, landing on a column's edge. */
export function pageStrip(
  el: HTMLElement,
  dir: 1 | -1,
  m: Pick<StripMeasure, "gap" | "tail"> & { lead?: number }
) {
  const lead = m.lead ?? 0;
  const tail = m.tail ?? 0;
  const edges = [...el.querySelectorAll<HTMLElement>("[data-lane]")].map((s) => ({
    left: s.offsetLeft,
    right: s.offsetLeft + s.offsetWidth,
  }));
  const viewEnd = el.scrollLeft + el.clientWidth;
  let to: number;
  if (dir > 0) {
    const cut = edges.find((e) => e.right > viewEnd - tail + 1);
    to = cut ? cut.left - lead : el.scrollWidth;
  } else {
    // Back far enough that the column before the first one showing is whole.
    const first = edges.find((e) => e.left >= el.scrollLeft + lead - 1);
    const least = (first?.left ?? 0) - m.gap - el.clientWidth + tail;
    const land = edges.find((e) => e.left - lead >= least);
    to = land ? land.left - lead : 0;
  }
  el.scrollTo({ left: Math.max(0, to), behavior: "smooth" });
}

/** Back and forward for a strip, set beside it rather than over its cards. */
export function StripPager({
  canBack,
  canForward,
  onPage,
  backLabel,
  forwardLabel,
  forwardText = "Later",
}: {
  canBack: boolean;
  canForward: boolean;
  onPage: (dir: 1 | -1) => void;
  backLabel: string;
  forwardLabel: string;
  forwardText?: string;
}) {
  const button =
    "inline-flex h-8 items-center justify-center text-secondary transition-colors hover:bg-secondary hover:text-primary disabled:pointer-events-none disabled:opacity-35 touch:min-h-11";
  return (
    <span className="inline-flex shrink-0 items-stretch overflow-hidden rounded-[9px] border border-primary bg-primary shadow-xs">
      <button
        type="button"
        onClick={() => onPage(-1)}
        disabled={!canBack}
        aria-label={backLabel}
        title={backLabel}
        className={cx(button, "w-8 border-r border-secondary")}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => onPage(1)}
        disabled={!canForward}
        aria-label={forwardLabel}
        className={cx(button, "gap-1 pr-2 pl-2.5 text-[12px] font-semibold")}
      >
        {forwardText}
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </span>
  );
}
