/**
 * Prayer — who I'm carrying, and whether I've actually prayed lately.
 *
 * The app already answers two questions about a person: *do I know them*
 * (coverage) and *am I ready for the next time we sit down* (readiness), plus
 * the one I answer myself, *is this going well* (health). This is the fourth,
 * and it's a different kind of thing entirely — not a measurement of them but
 * a record of me. There is no scale, no score and no roll-up average, because
 * "72% prayed for" would be an obscene number to put on a screen.
 *
 * What it does track is the only thing worth tracking: **how long it's been.**
 * Taking someone up is deliberate; so is laying them down. Between those two
 * acts the honest signal is silence — a name carried for eight months with
 * nothing marked in six weeks is exactly the thing this is for, and the state
 * below says so plainly rather than letting it sit green.
 */
import type {
  Prayer,
  PrayerEntry,
  PrayerSubjectKind,
} from "../types";

const DAY = 86_400_000;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(iso?: string): number | null {
  if (!iso) return null;
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = Date.parse(`${todayISO()}T00:00:00Z`);
  return Math.max(0, Math.round((now - then) / DAY));
}

/** Prayed inside this many days still counts as current. */
export const FRESH_DAYS = 7;
/** Past this, carrying them has become a name on a list. Say so. */
export const COLD_DAYS = 21;

/**
 * Four states, and only one of them is a problem.
 *
 * Note what's *not* here: nothing that grades the person. "Cold" grades me.
 */
export type PrayerState = "fresh" | "carrying" | "cold" | "none";

export const PRAYER_STATES: PrayerState[] = [
  "fresh",
  "carrying",
  "cold",
  "none",
];

export const PRAYER_LABEL: Record<PrayerState, string> = {
  fresh: "Prayed this week",
  carrying: "Carrying",
  cold: "Gone quiet",
  none: "Not carrying",
};

/**
 * Muted violet through to stone — deliberately outside the traffic-light
 * palette health and readiness share. This isn't a warning system, and the
 * canvas shouldn't read it as one.
 */
export const PRAYER_COLOR: Record<PrayerState, string> = {
  fresh: "#7C6BC4",
  carrying: "#9B8FD1",
  cold: "#A8A29E",
  none: "#D6D3D1",
};

export const PRAYER_HINT: Record<PrayerState, string> = {
  fresh: "Carried, and prayed for in the last week",
  carrying: "On the list — prayed for, but not in the last week",
  cold: `Carried, but nothing marked in ${COLD_DAYS} days`,
  none: "Not on the prayer list",
};

/** Where a subject stands. `undefined` prayer = not carrying, full stop. */
export function prayerState(prayer?: Prayer): PrayerState {
  if (!prayer) return "none";
  // Never marked? Measure the silence from the day I took them up — otherwise
  // taking someone up and never praying reads the same as praying today.
  const since = daysSince(prayer.lastPrayedOn ?? prayer.since);
  if (since === null) return "carrying";
  if (since <= FRESH_DAYS) return "fresh";
  if (since >= COLD_DAYS) return "cold";
  return "carrying";
}

export function isCarried(prayer?: Prayer): boolean {
  return Boolean(prayer);
}

/** Days since I took them up — "carrying since March" as a number. */
export function carriedDays(prayer?: Prayer): number | null {
  return daysSince(prayer?.since);
}

/** Days since the last mark, or null when there's never been one. */
export function daysSincePrayed(prayer?: Prayer): number | null {
  return daysSince(prayer?.lastPrayedOn);
}

function humanDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}

/** "prayed today" / "prayed 12d ago" / the honest blank. */
export function formatLastPrayed(prayer?: Prayer): string | null {
  if (!prayer) return null;
  const days = daysSincePrayed(prayer);
  if (days === null) return "not marked yet";
  return `prayed ${humanDays(days)}`;
}

/** "since 12 Mar · 84 days" — the weight of a name you've held a while. */
export function formatCarried(prayer?: Prayer): string | null {
  const days = carriedDays(prayer);
  if (days === null) return null;
  if (days === 0) return "taken up today";
  if (days === 1) return "carried 1 day";
  if (days < 60) return `carried ${days} days`;
  return `carried ${Math.round(days / 30)} months`;
}

/** The tightest possible read for a card: "3d" / "6w" / "—". */
export function shortSincePrayed(prayer?: Prayer): string {
  const days = daysSincePrayed(prayer);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

// --- filtering --------------------------------------------------------------

/**
 * The scan chips. They're the four states — mutually exclusive, so a count
 * means what it looks like it means and the chips add up to what's in view.
 */
export type PrayerFilterValue = PrayerState;

export const PRAYER_FILTER_VALUES: PrayerFilterValue[] = PRAYER_STATES;

/** An empty filter passes everything — same contract as the health scan. */
export function matchesPrayer(
  prayer: Prayer | undefined,
  filter: PrayerFilterValue[]
): boolean {
  if (filter.length === 0) return true;
  return filter.includes(prayerState(prayer));
}

// --- roll-ups ---------------------------------------------------------------

export type PrayerRollUp = {
  counts: Record<PrayerState, number>;
  /** How many of the group I'm carrying at all. */
  carried: number;
  total: number;
  /** Carried but gone quiet — the only number here that's asking for anything. */
  cold: number;
};

export function rollUpPrayer(prayers: (Prayer | undefined)[]): PrayerRollUp {
  const counts = Object.fromEntries(
    PRAYER_STATES.map((s) => [s, 0])
  ) as Record<PrayerState, number>;

  for (const p of prayers) counts[prayerState(p)]++;

  return {
    counts,
    carried: counts.fresh + counts.carrying + counts.cold,
    total: prayers.length,
    cold: counts.cold,
  };
}

// --- entries ----------------------------------------------------------------

/** Every entry for one subject, newest first. */
export function entriesFor(
  entries: PrayerEntry[],
  kind: PrayerSubjectKind,
  id: string
): PrayerEntry[] {
  return entries
    .filter((e) => e.subjectKind === kind && e.subjectId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Still being carried — written down and not yet answered. */
export function openEntries(entries: PrayerEntry[]): PrayerEntry[] {
  return entries.filter((e) => !e.answeredOn);
}

/** Answered, newest answer first. The part that's worth keeping. */
export function answeredEntries(entries: PrayerEntry[]): PrayerEntry[] {
  return entries
    .filter((e) => e.answeredOn)
    .sort((a, b) => (b.answeredOn ?? "").localeCompare(a.answeredOn ?? ""));
}

/** Answers recorded in the last N days — what a summary should surface. */
export function recentAnswers(
  entries: PrayerEntry[],
  withinDays = 30
): PrayerEntry[] {
  return answeredEntries(entries).filter((e) => {
    const days = daysSince(e.answeredOn);
    return days !== null && days <= withinDays;
  });
}
