import type { Arc } from "../../types";
import { coverOf } from "../../lib/arcs";
import { cx } from "@/utils/cx";

/**
 * The arc's face: a little book, whether or not it is one. Typographic on
 * purpose — no artwork to fetch, and it reads as *ours* rather than as the
 * publisher's.
 */
export function ArcCover({
  arc,
  size = "sm",
  className,
}: {
  arc: Pick<Arc, "id" | "cover" | "title">;
  size?: "xs" | "sm" | "lg";
  className?: string;
}) {
  const dims =
    size === "lg"
      ? "h-[132px] w-[92px] p-2.5 text-[12px]"
      : size === "xs"
        ? "h-[30px] w-[21px] p-[3px] text-[0px]"
        : "h-[62px] w-[44px] p-1.5 text-[6.5px]";
  return (
    <span
      aria-hidden
      style={{ background: coverOf(arc) }}
      className={cx(
        "grid shrink-0 content-between overflow-hidden rounded-[3px_5px_5px_3px] font-serif leading-[1.05] font-extrabold tracking-[0.02em] text-[#f1efec] uppercase shadow-[inset_3px_0_0_rgb(0_0_0/0.25),0_4px_10px_-4px_rgb(0_0_0/0.45)]",
        dims,
        className
      )}
    >
      <span className="line-clamp-4 break-words">{arc.title}</span>
      <i className={cx("block bg-gilt", size === "lg" ? "h-[3px] w-[26px]" : "h-[2px] w-[14px]")} />
    </span>
  );
}

/** Ticks along the arc: done, the step we're on, what's ahead. */
export function ArcRail({ arc, className }: { arc: Arc; className?: string }) {
  const current = arc.steps.findIndex((s) => s.status !== "done");
  return (
    <span
      className={cx("flex gap-[3px]", className)}
      role="img"
      aria-label={`${arc.steps.filter((s) => s.status === "done").length} of ${arc.steps.length} done`}
    >
      {arc.steps.map((s, i) => (
        <span
          key={s.id}
          className={cx(
            "h-1.5 max-w-[22px] min-w-[4px] flex-1 rounded-[2px]",
            s.status === "done"
              ? "bg-teal-600 dark:bg-teal-500"
              : i === current
                ? "bg-gilt shadow-[0_0_0_2px_var(--color-bg-primary),0_0_0_3.5px_var(--color-gilt)]"
                : "bg-tertiary"
          )}
        />
      ))}
    </span>
  );
}
