import type { OneOnOne } from "../types";

export type OneOnOneStatus = "scheduled" | "needs_notes" | "done";

/** Derive a simple status for table display. */
export function oneOnOneStatus(o: OneOnOne): OneOnOneStatus {
  const hasNotes = Boolean(o.notes?.trim());
  if (hasNotes) return "done";
  if (o.nextDate) return "scheduled";
  return "needs_notes";
}

export function oneOnOneStatusLabel(status: OneOnOneStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "needs_notes":
      return "Needs notes";
    case "done":
      return "Done";
  }
}

export type DateTone = "overdue" | "today" | "soon" | "future";

/** Urgency of an upcoming date — drives the overdue/today highlighting. */
export function dateTone(iso: string): DateTone {
  const today = new Date().toISOString().slice(0, 10);
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  const diff =
    (new Date(`${iso}T12:00:00`).getTime() -
      new Date(`${today}T12:00:00`).getTime()) /
    86400000;
  return diff <= 7 ? "soon" : "future";
}

/** Friendly short date — "Jul 15", with year only when it differs. */
export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" as const }),
  });
}

/** First non-empty line of notes, truncated for table summary. */
export function oneOnOneSummary(o: OneOnOne, maxLen = 72): string {
  const raw = o.notes?.trim();
  if (!raw) return "";
  const first = raw
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
    .find(Boolean);
  if (!first) return "";
  return first.length > maxLen ? first.slice(0, maxLen - 1) + "…" : first;
}
