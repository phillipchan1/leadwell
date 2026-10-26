/**
 * A self-contained demo build: the sample org, no sign-in, nothing written
 * anywhere. Turned on at build time with `VITE_DEMO=1` and never present in a
 * normal build, where this constant is statically false and Vite drops every
 * branch it guards.
 *
 *   VITE_DEMO=1 npx vite build
 */
export const DEMO = import.meta.env.VITE_DEMO === "1";

/** The day the sample data was written around: a Friday. */
const SAMPLE_TODAY = "2026-08-14";

const ISO = /^(\d{4})-(\d{2})-(\d{2})(T.*)?$/;

function shiftISO(value: string, days: number): string {
  const m = ISO.exec(value);
  if (!m) return value;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) + (m[4] ?? "");
}

function shiftAll<T>(value: T, days: number): T {
  if (typeof value === "string") return shiftISO(value, days) as T;
  if (Array.isArray(value)) return value.map((v) => shiftAll(v, days)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shiftAll(v, days)])
    ) as T;
  }
  return value;
}

/**
 * Move the sample's dates so its "today" lands in this week. Whole weeks only,
 * so a Monday meeting stays on a Monday.
 */
export function toThisWeek<T>(doc: T, today: string): T {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const days = Math.round((utc(today) - utc(SAMPLE_TODAY)) / 86_400_000);
  const weeks = Math.floor(days / 7) * 7;
  return weeks ? shiftAll(doc, weeks) : doc;
}
