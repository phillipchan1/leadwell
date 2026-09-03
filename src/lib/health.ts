/**
 * Health — my own assessment of how a team or a person is doing.
 *
 * Deliberately *not* derived from anything the app already knows. Readiness
 * answers "am I prepared for the next time we sit down"; coverage answers "do I
 * know them". Health is the third question those two can't touch: **is this
 * going well?** Only I can answer it, so the whole model is one dropdown, one
 * optional line of evidence, and the date I last made the call.
 *
 * Five levels, strongest first, so a scan reads top-down. The scale is
 * intentionally lopsided toward the weak end — "solid" covers everything that
 * needs nothing from me, and the three levels below it are the ones worth
 * telling apart when I'm deciding where to spend a week.
 */
import type { Health, HealthLevel, Person, Team } from "../types";

/** Strongest → weakest. Sort order for every health-aware list in the app. */
export const HEALTH_LEVELS: HealthLevel[] = [
  "thriving",
  "solid",
  "watch",
  "strained",
  "critical",
];

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  thriving: "Thriving",
  solid: "Solid",
  watch: "Watch",
  strained: "Strained",
  critical: "Critical",
};

export const HEALTH_COLOR: Record<HealthLevel, string> = {
  thriving: "#0D9488",
  solid: "#65A30D",
  watch: "#F59E0B",
  strained: "#EA580C",
  critical: "#DC2626",
};

/** What each level means, so the dropdown teaches the scale as you use it. */
export const HEALTH_HINT: Record<HealthLevel, string> = {
  thriving: "Ahead of me — I'd hold this up as the example",
  solid: "Healthy. Nothing owed beyond the rhythm",
  watch: "Something's off. Not broken, but I'm watching it",
  strained: "Carrying real strain — needs my attention soon",
  critical: "At risk right now. This is what I'd fix first",
};

/** 0–100, so a set of ratings can be averaged into a group read. */
export const HEALTH_SCORE: Record<HealthLevel, number> = {
  thriving: 100,
  solid: 75,
  watch: 50,
  strained: 25,
  critical: 0,
};

/** Where I'm strong — what a "show me what's working" scan should surface. */
export const STRONG_LEVELS: HealthLevel[] = ["thriving", "solid"];
/** Where I'm weak — the filter that matters most. */
export const WEAK_LEVELS: HealthLevel[] = ["watch", "strained", "critical"];

export function isWeak(level: HealthLevel): boolean {
  return WEAK_LEVELS.includes(level);
}

/** Strained or worse: not "keep an eye on it" but "do something about it". */
export function needsAttention(level: HealthLevel): boolean {
  return level === "strained" || level === "critical";
}

/** A rating this old is a memory, not a read. */
export const STALE_DAYS = 90;

const DAY = 86_400_000;

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Days since the call was last made, or null when it was never dated. */
export function ratingAgeDays(health?: Health): number | null {
  if (!health?.ratedOn) return null;
  const then = Date.parse(`${health.ratedOn}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.parse(`${todayISO()}T00:00:00Z`);
  return Math.max(0, Math.round((now - then) / DAY));
}

export function isStale(health?: Health): boolean {
  const age = ratingAgeDays(health);
  return age !== null && age > STALE_DAYS;
}

/** "rated today" / "rated 12d ago" — the honesty line under a level. */
export function formatRatedOn(health?: Health): string | null {
  if (!health?.ratedOn) return null;
  const age = ratingAgeDays(health);
  if (age === null) return `rated ${health.ratedOn}`;
  if (age === 0) return "rated today";
  if (age === 1) return "rated yesterday";
  if (age < 60) return `rated ${age}d ago`;
  return `rated ${Math.round(age / 30)}mo ago`;
}

// --- filtering --------------------------------------------------------------

/** A filter chip: one of the five levels, or the people I haven't called yet. */
export type HealthFilterValue = HealthLevel | "unrated";

export const HEALTH_FILTER_VALUES: HealthFilterValue[] = [
  ...HEALTH_LEVELS,
  "unrated",
];

export function filterLabel(value: HealthFilterValue): string {
  return value === "unrated" ? "Not rated" : HEALTH_LABEL[value];
}

export function filterColor(value: HealthFilterValue): string {
  return value === "unrated" ? "#a8a29e" : HEALTH_COLOR[value];
}

/**
 * Does this rating pass the active filter? An empty filter passes everything —
 * "no filter" and "every chip on" are the same view, and the empty set is the
 * one that survives a domain switch without stranding you on a blank canvas.
 */
export function matchesHealth(
  health: Health | undefined,
  filter: HealthFilterValue[]
): boolean {
  if (filter.length === 0) return true;
  if (!health) return filter.includes("unrated");
  return filter.includes(health.level);
}

// --- roll-ups ---------------------------------------------------------------

export type HealthRollUp = {
  counts: Record<HealthLevel, number>;
  /** How many of the group I've actually rated. */
  rated: number;
  total: number;
  /** Worst level present — what a card at a glance should shout. */
  worst: HealthLevel | null;
  /** Mean of the rated members, 0–100. Null when nothing is rated. */
  score: number | null;
  /** The level nearest that mean — a group's one-word answer. */
  level: HealthLevel | null;
};

/** The level whose score is closest to a 0–100 average. */
export function levelForScore(score: number): HealthLevel {
  return HEALTH_LEVELS.reduce((best, l) =>
    Math.abs(HEALTH_SCORE[l] - score) < Math.abs(HEALTH_SCORE[best] - score)
      ? l
      : best
  );
}

/**
 * Summarize a set of ratings. Unlike readiness — which rolls up worst-of
 * because relationship debt doesn't average away — health carries *both*: the
 * average is the honest summary of a group, and the worst is what you act on.
 */
export function rollUpHealth(healths: (Health | undefined)[]): HealthRollUp {
  const counts = Object.fromEntries(
    HEALTH_LEVELS.map((l) => [l, 0])
  ) as Record<HealthLevel, number>;
  let sum = 0;
  let rated = 0;

  for (const h of healths) {
    if (!h) continue;
    counts[h.level]++;
    sum += HEALTH_SCORE[h.level];
    rated++;
  }

  const worst =
    [...HEALTH_LEVELS].reverse().find((l) => counts[l] > 0) ?? null;
  const score = rated > 0 ? Math.round(sum / rated) : null;

  return {
    counts,
    rated,
    total: healths.length,
    worst,
    score,
    level: score === null ? null : levelForScore(score),
  };
}

/** Non-empty segments of a roll-up, strongest first — for a distribution bar. */
export function healthDistribution(
  roll: HealthRollUp
): { level: HealthLevel; count: number; color: string }[] {
  return HEALTH_LEVELS.filter((l) => roll.counts[l] > 0).map((l) => ({
    level: l,
    count: roll.counts[l],
    color: HEALTH_COLOR[l],
  }));
}

/**
 * A team's read: the call I made on the team itself, else — when I've never
 * rated the team but have rated its people — the average of theirs, flagged
 * as derived so the UI never passes it off as my own judgment.
 */
export type TeamHealth = {
  health: Health;
  derived: boolean;
};

export function teamHealth(team: Team, members: Person[]): TeamHealth | null {
  if (team.health) return { health: team.health, derived: false };
  const roll = rollUpHealth(members.map((m) => m.health));
  if (!roll.level) return null;
  return { health: { level: roll.level }, derived: true };
}
