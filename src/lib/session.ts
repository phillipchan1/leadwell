import type { Session } from "../types";

export type SessionStatus = "scheduled" | "needs_notes" | "done";

/** Derive a simple status for table display. */
export function sessionStatus(o: Session): SessionStatus {
  const hasNotes = Boolean(o.notes?.trim());
  if (hasNotes) return "done";
  if (o.nextDate) return "scheduled";
  return "needs_notes";
}

export function sessionStatusLabel(status: SessionStatus): string {
  switch (status) {
    case "scheduled":
      return "Scheduled";
    case "needs_notes":
      return "Needs notes";
    case "done":
      return "Done";
  }
}

/** First non-empty line of notes, truncated for table summary. */
export function sessionSummary(o: Session, maxLen = 72): string {
  const raw = o.notes?.trim();
  if (!raw) return "";
  const first = raw
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
    .find(Boolean);
  if (!first) return "";
  return first.length > maxLen ? first.slice(0, maxLen - 1) + "…" : first;
}
