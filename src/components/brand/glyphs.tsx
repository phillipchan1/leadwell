import type { SVGProps } from "react";
import type { HealthLevel } from "@/types";
import type { Readiness, ReadinessState } from "@/lib/readiness";
import type { PrayerState } from "@/lib/prayer";
import { cx } from "@/utils/cx";

/*
 * The small, load-bearing glyphs of the design language. Each one encodes its
 * meaning in shape as well as color, so it still reads in grayscale and for
 * colorblind eyes: the health meter is a count of bars, the rhythm ring is an
 * arc and a fill, the prayer flame is filled, outlined or dashed.
 */

/** The mark: ripples in a well, with the gilt drop at the center. */
export function Mark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cx("shrink-0", className)}
    >
      <rect width="48" height="48" rx="13" fill="#114143" />
      <circle
        cx="24"
        cy="24"
        r="15"
        fill="none"
        stroke="#ACC3C1"
        strokeOpacity="0.45"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="72 22.25"
        transform="rotate(-20 24 24)"
      />
      <circle cx="24" cy="24" r="9" fill="none" stroke="#ACC3C1" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="3.8" fill="#E1B34D" />
    </svg>
  );
}

/** "Lead" is the action, in the sans; "Well" is the quality, in the serif. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-baseline leading-none", className)}>
      <span className="font-sans font-semibold">Lead</span>
      <span className="font-serif italic text-gilt">Well</span>
    </span>
  );
}

// ── Health meter ──────────────────────────────────────────────────────────

const METER_FILL: Record<HealthLevel, string> = {
  thriving: "fill-cond-thriving",
  solid: "fill-cond-solid",
  watch: "fill-cond-watch",
  strained: "fill-cond-strained",
  critical: "fill-cond-critical",
};

const METER_BARS: Record<HealthLevel, number> = {
  thriving: 5,
  solid: 4,
  watch: 3,
  strained: 2,
  critical: 1,
};

/** Five bars, filled to the read. No level = all five empty ("not rated"). */
export function HealthMeter({
  level,
  size = 18,
  className,
  label,
}: {
  level?: HealthLevel;
  /** Width in px; height follows the 22×14 aspect. */
  size?: number;
  className?: string;
  /** When set, the meter is announced instead of hidden. */
  label?: string;
}) {
  const on = level ? METER_BARS[level] : 0;
  const fill = level ? METER_FILL[level] : "";
  const bars = [0, 1, 2, 3, 4];
  return (
    <svg
      width={size}
      height={(size * 14) / 22}
      viewBox="0 0 22 14"
      className={cx("shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {bars.map((i) => {
        const h = 4 + i * 2.5;
        return (
          <rect
            key={i}
            x={i * 4.75}
            y={14 - h}
            width="3"
            height={h}
            rx="1"
            className={i < on ? fill : "fill-meter-off"}
          />
        );
      })}
    </svg>
  );
}

/** Soft pill classes for a health level — the chip, the header, the table. */
export const HEALTH_PILL: Record<HealthLevel, string> = {
  thriving: "bg-cond-thriving-soft text-cond-thriving-ink",
  solid: "bg-cond-solid-soft text-cond-solid-ink",
  watch: "bg-cond-watch-soft text-cond-watch-ink",
  strained: "bg-cond-strained-soft text-cond-strained-ink",
  critical: "bg-cond-critical-soft text-cond-critical-ink",
};

// ── Rhythm ring ───────────────────────────────────────────────────────────

const RING_STROKE: Record<ReadinessState, string> = {
  ready: "stroke-cond-thriving",
  resting: "stroke-cond-solid",
  prep_due: "stroke-cond-watch",
  loose_end: "stroke-cond-strained",
  drifting: "stroke-cond-critical",
  dormant: "stroke-stone-300 dark:stroke-stone-700",
};

const RING_FILL: Record<ReadinessState, string> = {
  ready: "fill-cond-thriving",
  resting: "fill-cond-solid",
  prep_due: "fill-cond-watch",
  loose_end: "fill-cond-strained",
  drifting: "fill-cond-critical",
  dormant: "fill-stone-300 dark:fill-stone-700",
};

/** Text color for a readiness state, for the countdown beside a ring. */
export const STATE_TEXT: Record<ReadinessState, string> = {
  ready: "text-cond-thriving-ink",
  resting: "text-cond-solid-ink",
  prep_due: "text-cond-watch-ink",
  loose_end: "text-cond-strained-ink",
  drifting: "text-cond-critical-ink",
  dormant: "text-quaternary",
};

/** How far into the current rhythm a reading is, 0–1. */
export function rhythmFraction(r: Readiness): number {
  if (r.daysSince === null || r.daysUntil === null) return 0;
  const span = r.daysSince + Math.max(0, r.daysUntil);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, r.daysSince / span));
}

const C = 2 * Math.PI * 9;

/**
 * The rhythm ring. The arc is how far into the rhythm you are; the center
 * fills once prep is done; the color is the readiness state. Drifting is a
 * full ring with a dot — the rhythm has run out, and nothing is next.
 */
export function RhythmRing({
  reading,
  state,
  size = 20,
  className,
  label,
}: {
  reading?: Readiness | null;
  /** Override when there is no reading (e.g. a roll-up of several). */
  state?: ReadinessState;
  size?: number;
  className?: string;
  label?: string;
}) {
  const s: ReadinessState = state ?? reading?.state ?? "dormant";
  const fraction = reading ? rhythmFraction(reading) : 0;
  const prepped = s === "ready";
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };

  if (s === "drifting") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={cx("shrink-0", className)} {...a11y}>
        <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" className={RING_STROKE.drifting} />
        <circle cx="12" cy="12" r="2.5" className={RING_FILL.drifting} />
      </svg>
    );
  }
  if (s === "dormant") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={cx("shrink-0", className)} {...a11y}>
        <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" strokeDasharray="3 4" className={RING_STROKE.dormant} />
      </svg>
    );
  }
  const arc = Math.max(4, fraction * C);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx("shrink-0", className)} {...a11y}>
      <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" className="stroke-meter-off" />
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${arc} ${C}`}
        transform="rotate(-90 12 12)"
        className={RING_STROKE[s]}
      />
      {prepped && <circle cx="12" cy="12" r="3.5" className={RING_FILL[s]} />}
    </svg>
  );
}

// ── Prayer flame ──────────────────────────────────────────────────────────

const FLAME = "M12 3.2c2.7 3.2 4.8 5.8 4.8 9a4.8 4.8 0 0 1-9.6 0c0-3.2 2.1-5.8 4.8-9z";

/**
 * The flame. Filled: prayed this week. Outlined: carrying. Dashed: gone
 * quiet. Gilt with a check: answered. Not carrying draws nothing, because
 * not carrying is never a gap.
 */
export function PrayerFlame({
  state,
  size = 16,
  className,
  label,
}: {
  state: PrayerState | "answered";
  size?: number;
  className?: string;
  label?: string;
}) {
  if (state === "none") return null;
  const a11y = label
    ? { role: "img" as const, "aria-label": label }
    : { "aria-hidden": true as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx("shrink-0", className)} {...a11y}>
      {state === "fresh" && <path d={FLAME} className="fill-vesper" />}
      {state === "carrying" && (
        <path d={FLAME} fill="none" strokeWidth="1.9" className="stroke-vesper" />
      )}
      {state === "cold" && (
        <path
          d={FLAME}
          fill="none"
          strokeWidth="1.9"
          strokeDasharray="2.5 2.5"
          className="stroke-vesper opacity-70"
        />
      )}
      {state === "answered" && (
        <>
          <path d={FLAME} className="fill-gilt" />
          <path
            d="M9.6 13.2l1.7 1.7 3.2-3.4"
            fill="none"
            stroke="#013133"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

/** The flame path, for places that need to draw it inline. */
export const FLAME_PATH = FLAME;

/**
 * The flame as an icon, with the same props as the icon set the app already
 * uses — so it drops into a Button's `iconLeading` or a tab's `icon`.
 */
export function FlameIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={FLAME} />
    </svg>
  );
}
