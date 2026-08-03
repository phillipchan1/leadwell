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
import { NativeSelect } from "@/components/base/select/select-native";
import { Explain } from "./Explain";

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
  const color = value ? HEALTH_COLOR[value] : undefined;
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
        className={`w-full max-w-[9.5rem] cursor-pointer appearance-none rounded-md border-0 px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-teal-500/40 touch:min-h-11 touch:text-md ${
          value ? "" : "text-stone-500 dark:text-stone-400"
        } ${className}`}
        style={
          color
            ? { backgroundColor: color + "1f", color }
            : { backgroundColor: "transparent" }
        }
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <NativeSelect
      aria-label={ariaLabel}
      title={value ? HEALTH_HINT[value] : "Not rated yet"}
      value={value ?? ""}
      onChange={(e) => onChange((e.target.value || null) as HealthLevel | null)}
      onClick={(e) => e.stopPropagation()}
      options={options}
      selectClassName={`cursor-pointer font-medium ${className}`}
      style={color ? { color } : undefined}
    />
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
  const color = HEALTH_COLOR[health.level];
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
      className={`inline-flex items-center gap-1 rounded-md font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{ backgroundColor: color + "1f", color }}
      title={title}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: derived ? "transparent" : color,
          boxShadow: derived ? `inset 0 0 0 1.5px ${color}` : undefined,
        }}
      />
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
      className="flex h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800"
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
              className={`text-[10px] ${
                isStale(health)
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {rated}
            </span>
          </Explain>
        )}
      </div>
      <HealthSelect value={health?.level} onChange={onLevel} ariaLabel={label} />
      {/* The scale, taught in place: what the level you just picked means. */}
      <p className="text-[11px] text-stone-500 dark:text-stone-400">
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
      {hint && <p className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  );
}
