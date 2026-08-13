import { cx } from "@/utils/cx";

/**
 * The one loading shape.
 *
 * There were four bespoke ones — the splash, the pane fallback, the profile
 * fallback and the AI brief — each with its own markup, its own opacity and its
 * own hand-typed `[animation-delay:150ms]`. They read as four different apps
 * loading, because the stagger and the tint were guessed separately each time.
 *
 * `ProfileFallback`'s avatar-shaped layout was the best of the four and is the
 * idea generalized here: a skeleton should be the silhouette of the thing that's
 * coming, not a generic grey box. Hence `circle` for an avatar, `line` for text
 * (which fades with each successive line, the way a paragraph does) and `block`
 * for a card.
 *
 * `index` drives the stagger so a group ripples rather than pulsing in unison —
 * pass the map index and it works out.
 */
export type SkeletonShape = "line" | "block" | "circle";

const STAGGER_MS = 120;

export function Skeleton({
  shape = "line",
  className = "",
  index = 0,
  /** 0–1. Successive lines in a paragraph sit back a little. */
  fade = 1,
}: {
  shape?: SkeletonShape;
  className?: string;
  index?: number;
  fade?: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        animationDelay: index ? `${index * STAGGER_MS}ms` : undefined,
        opacity: fade === 1 ? undefined : fade,
      }}
      className={cx(
        "animate-pulse bg-stone-200 dark:bg-stone-800",
        shape === "circle" && "rounded-full",
        shape === "line" && "h-3 rounded",
        shape === "block" && "rounded-xl",
        className
      )}
    />
  );
}

/**
 * A run of text lines, each a little shorter and a little fainter than the
 * last — the shape of a paragraph you can't read yet.
 */
export function SkeletonLines({
  count = 3,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-5/6", "w-2/3"];
  return (
    <div className={cx("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          shape="line"
          index={i}
          fade={1 - i * 0.15}
          className={widths[i % widths.length]}
        />
      ))}
    </div>
  );
}
