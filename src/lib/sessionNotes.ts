import type { Session, Topic } from "../types";

/**
 * Build a starter markdown doc from topics slotted into this occurrence.
 * Returns null when notes already exist or there is nothing to seed.
 */
export function seedNotesFromTopics(
  session: Session,
  topics: Topic[]
): string | null {
  if (session.notes?.trim()) return null;

  const agenda = topics.filter(
    (t) => t.sessionId === session.id && t.status !== "dropped"
  );
  if (agenda.length === 0) return null;

  const lines = ["## Agenda", ""];
  for (const t of agenda) {
    let line = `- [ ] ${t.text}`;
    if (t.detail?.trim()) line += `\n  ${t.detail.trim()}`;
    lines.push(line);
  }
  lines.push("");
  return lines.join("\n");
}
