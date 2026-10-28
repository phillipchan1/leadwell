import { cx } from "@/utils/cx";
import { RUNWAY_DAYS, formatAhead, type Runway, type RunwayLevel } from "../lib/runway";

/*
 * How far ahead a meeting is planned. The track carries the color; the cover
 * beside it stays grey, so on a row of the Meetings list readiness is still
 * the one colored thing.
 */
const RUNWAY_MARK: Record<RunwayLevel, string> = {
  deep: "bg-cond-thriving",
  steady: "bg-cond-solid",
  thin: "bg-cond-watch",
  bare: "bg-cond-critical",
  none: "bg-quaternary",
};

/**
 * The next twelve weeks on one fixed-width axis, so every row lines up and
 * a short runway reads as a short bar without reading a number. One mark per
 * occurrence, placed by date: filled when something is on it (to the share
 * of sections planned), empty when it's still a date and nothing more. The
 * rule underneath runs from today to the first empty meeting.
 */
export function RunwayTrack({ runway, className }: { runway: Runway; className?: string }) {
  const at = (days: number) => `${Math.min(100, (days / RUNWAY_DAYS) * 100)}%`;
  return (
    <span aria-hidden className={cx("relative block h-4", className)}>
      {/* Month gridlines: the same place in every row. */}
      {[28, 56].map((d) => (
        <i key={d} className="absolute inset-y-0 w-px bg-stone-200 dark:bg-stone-800" style={{ left: at(d) }} />
      ))}
      <i className="absolute inset-x-0 bottom-0 h-px bg-stone-200 dark:bg-stone-800" />
      <i
        className={cx("absolute bottom-0 left-0 h-[2px] rounded-full", RUNWAY_MARK[runway.level])}
        style={{ width: at(runway.days) }}
      />
      {runway.marks.map((m) => (
        <i
          key={m.date}
          className="absolute bottom-[4px] flex h-3 w-[5px] -translate-x-1/2 flex-col justify-end overflow-hidden rounded-[1.5px] bg-quaternary"
          style={{ left: `clamp(3px, ${at(m.offset)}, calc(100% - 3px))` }}
        >
          {m.planned && (
            <i className={cx("block w-full", RUNWAY_MARK[runway.level])} style={{ height: `${Math.round(m.fill * 100)}%` }} />
          )}
        </i>
      ))}
    </span>
  );
}

export function RunwayCover({ runway }: { runway: Runway }) {
  return (
    <span className="shrink-0 text-xs whitespace-nowrap text-quaternary tabular-nums">
      {runway.level !== "none" && runway.ahead === 0 ? "Nothing planned" : formatAhead(runway)}
    </span>
  );
}

export function runwayTitle(r: Runway): string {
  if (r.level === "none") return "As needed — no rhythm to plan ahead of.";
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const parts: string[] = [];
  if (r.through) {
    parts.push(`Planned through ${day(r.through)} (${r.ahead} meeting${r.ahead === 1 ? "" : "s"}).`);
  }
  if (r.gap) parts.push(`Nothing on ${day(r.gap)} yet.`);
  else parts.push(`Every meeting in the next ${Math.round(RUNWAY_DAYS / 7)} weeks has something on it.`);
  if (r.waiting) parts.push(`${r.waiting} idea${r.waiting === 1 ? "" : "s"} waiting to be placed.`);
  return parts.join(" ");
}
