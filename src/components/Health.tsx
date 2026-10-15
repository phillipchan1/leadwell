/**
 * The health property, in every density it's needed at.
 *
 * One control, three sizes: a full field in the modals and profiles, a compact
 * dropdown in table cells, and read-only chips/dots/bars on the canvas. They
 * all write through the same two store actions, so a call made on a card, in a
 * table row, or in a modal is the same call.
 */
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { Health, HealthLevel } from "../types";
import {
  HEALTH_COLOR,
  HEALTH_HINT,
  HEALTH_LABEL,
  HEALTH_LEVELS,
  formatRatedOn,
  healthDistribution,
  isStale,
  type HealthRollUp,
} from "../lib/health";
import { Input } from "@/components/base/input/input";
import { Label } from "@/components/base/input/label";
import { Explain } from "./Explain";
import { HEALTH_PILL, HealthMeter } from "./brand/glyphs";
import { cx } from "@/utils/cx";

/** The property dropdown. `null` from onChange means "clear the rating". */
export function HealthSelect({
  value,
  onChange,
  size = "md",
  ariaLabel = "Health",
  className = "",
}: {
  value?: HealthLevel;
  onChange: (level: HealthLevel | null) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
}) {
  const compact = size === "sm";
  const options = [
    { label: "Not rated", value: "" },
    ...HEALTH_LEVELS.map((l) => ({ label: HEALTH_LABEL[l], value: l })),
  ];

  // The dense table-cell variant stays custom: the control itself is tinted
  // by its value, which the design system's select can't express.
  if (compact) {
    return (
      <select
        aria-label={ariaLabel}
        title={value ? HEALTH_HINT[value] : "Not rated yet"}
        value={value ?? ""}
        onChange={(e) => onChange((e.target.value || null) as HealthLevel | null)}
        onClick={(e) => e.stopPropagation()}
        /* Hand-rolled rather than the design-system select, so it carries the
           touch floors itself: 16px keeps iOS from zooming the page on focus,
           and min-h-11 makes a 26px row control a real target. */
        className={cx(
          "w-auto max-w-[9.5rem] shrink-0 cursor-pointer appearance-none rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none focus:ring-2 focus:ring-teal-500/40 touch:min-h-11 touch:text-md",
          value ? HEALTH_PILL[value] : "bg-transparent text-quaternary",
          className
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  /* The full-size control is the scale itself: five levels side by side, one
     tap each, the meter on every one so the scale teaches itself. A dropdown
     hid four of the five answers behind a click. */
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx("flex flex-wrap gap-1.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {HEALTH_LEVELS.map((l) => {
        const on = value === l;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            title={HEALTH_HINT[l]}
            onClick={() => onChange(on ? null : l)}
            className={cx(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors touch:min-h-11",
              on
                ? cx("border-transparent", HEALTH_PILL[l])
                : "border-secondary text-tertiary hover:border-primary hover:text-secondary"
            )}
          >
            <HealthMeter level={on ? l : undefined} size={16} />
            {HEALTH_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}

/** Read-only pill: the level, and a stale marker once the call is 3 months old. */
export function HealthChip({
  health,
  derived = false,
  size = "md",
}: {
  health: Health;
  /** True when this is averaged from members rather than my own call. */
  derived?: boolean;
  size?: "sm" | "md";
}) {
  const stale = isStale(health);
  const rated = formatRatedOn(health);
  const title = [
    derived ? "Averaged from the people on it — not rated directly" : HEALTH_HINT[health.level],
    health.note,
    rated,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        size === "sm" ? "py-0.5 pr-1.5 pl-1 text-caption" : "py-0.5 pr-2 pl-1.5 text-xs",
        // A team read averaged from its people is hollow — it isn't my call.
        derived ? "border border-dashed border-current bg-transparent" : "",
        HEALTH_PILL[health.level],
        derived && "!bg-transparent"
      )}
      title={title}
    >
      <HealthMeter level={health.level} size={size === "sm" ? 13 : 15} />
      {derived && "~"}
      {HEALTH_LABEL[health.level]}
      {stale && <span className="opacity-60">·&nbsp;stale</span>}
    </span>
  );
}

/** The smallest read there is — a colored dot for dense person rows. */
export function HealthDot({ health }: { health?: Health }) {
  if (!health) return null;
  return (
    <Explain
      text={`${HEALTH_LABEL[health.level]}${health.note ? ` — ${health.note}` : ""}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: HEALTH_COLOR[health.level] }}
      />
    </Explain>
  );
}

/** Proportional bar of a group's health mix, strongest first. */
export function HealthBar({ roll }: { roll: HealthRollUp }) {
  const segments = healthDistribution(roll);
  if (segments.length === 0) return null;
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const title = segments
    .map((s) => `${HEALTH_LABEL[s.level]}: ${s.count}`)
    .join(" · ");

  return (
    <div
      className="flex h-1.5 overflow-hidden rounded-full bg-tertiary"
      title={title}
      role="img"
      aria-label={title}
    >
      {segments.map((s) => (
        <span
          key={s.level}
          className="h-full"
          style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}

/**
 * The full property: dropdown, the one line of evidence behind it, and when
 * the call was last made. Used in the add/edit modals and on both profiles.
 */
export function HealthField({
  health,
  onLevel,
  onNote,
  label = "Health",
  hint,
}: {
  health?: Health;
  onLevel: (level: HealthLevel | null) => void;
  /** Omit to hide the note field (e.g. inside a create form). */
  onNote?: (note: string) => void;
  label?: string;
  hint?: ReactNode;
}) {
  const [note, setNote] = useState(health?.note ?? "");

  // Follow the subject when the panel switches to another team or person.
  useEffect(() => {
    setNote(health?.note ?? "");
  }, [health?.note]);

  const rated = formatRatedOn(health);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        {rated && (
          <Explain
            text={
              isStale(health)
                ? "This call is over three months old — worth a fresh look"
                : undefined
            }
          >
            <span
              className={`text-caption ${
                isStale(health)
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-quaternary"
              }`}
            >
              {rated}
            </span>
          </Explain>
        )}
      </div>
      <HealthSelect value={health?.level} onChange={onLevel} ariaLabel={label} />
      {/* The scale, taught in place: what the level you just picked means. */}
      <p className="text-caption text-quaternary">
        {health
          ? HEALTH_HINT[health.level]
          : "Not rated — pick the level that matches your gut."}
      </p>
      {health && onNote && (
        <Input
          size="sm"
          placeholder="What makes it that? (optional)"
          value={note}
          onChange={setNote}
          onBlur={() => {
            if ((health.note ?? "") !== note.trim()) onNote(note);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setNote(health.note ?? "");
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`${label} note`}
        />
      )}
      {hint && <p className="text-caption text-quaternary">{hint}</p>}
    </div>
  );
}
