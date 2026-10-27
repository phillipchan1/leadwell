import { useState } from "react";
import type { Arc } from "../../types";
import { coverOf } from "../../lib/arcs";
import { isCoverUrl } from "../../lib/books";
import { cx } from "@/utils/cx";

const BOOK_SHAPE =
  "shrink-0 overflow-hidden rounded-[3px_5px_5px_3px] shadow-[inset_3px_0_0_rgb(0_0_0/0.25),0_4px_10px_-4px_rgb(0_0_0/0.45)]";

/**
 * The arc's face: a little book, whether or not it is one. Typographic by
 * default, so an arc that isn't a book still has one. A book arc can carry its
 * real cover instead; if that image ever fails to load, the typographic one is
 * back.
 */
export function ArcCover({
  arc,
  size = "sm",
  className,
}: {
  arc: Pick<Arc, "id" | "cover" | "title" | "coverUrl">;
  size?: "xs" | "sm" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const box = size === "lg" ? "h-[132px] w-[92px]" : size === "xs" ? "h-[30px] w-[21px]" : "h-[62px] w-[44px]";
  const dims = size === "lg" ? "p-2.5 text-[12px]" : size === "xs" ? "p-[3px] text-[0px]" : "p-1.5 text-[6.5px]";
  if (isCoverUrl(arc.coverUrl) && failed !== arc.coverUrl) {
    return (
      <img
        src={arc.coverUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(arc.coverUrl ?? null)}
        // Open Library answers a missing cover with a 1×1 blank, not an error.
        onLoad={(e) => e.currentTarget.naturalWidth <= 1 && setFailed(arc.coverUrl ?? null)}
        style={{ background: coverOf(arc) }}
        className={cx(BOOK_SHAPE, box, "object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ background: coverOf(arc) }}
      className={cx(
        BOOK_SHAPE,
        "grid content-between font-serif leading-[1.05] font-extrabold tracking-[0.02em] text-[#f1efec] uppercase",
        box,
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
