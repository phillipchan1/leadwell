import type { CurriculumSlot, Session, Topic } from "../types";

/**
 * Build a starter markdown doc from topics slotted into this occurrence.
 * Returns null when notes already exist or there is nothing to seed.
 *
 * When the meeting has a standing skeleton, the agenda is grouped under those
 * headings — empty slots still appear as unchecked placeholders so the write-up
 * matches the shape that was planned.
 */
export function seedNotesFromTopics(
  session: Session,
  topics: Topic[],
  curriculum: CurriculumSlot[] = []
): string | null {
  if (session.notes?.trim()) return null;

  const agenda = topics.filter(
    (t) => t.sessionId === session.id && t.status !== "dropped"
  );
  if (agenda.length === 0 && curriculum.length === 0) return null;

  const lines = ["## Agenda", ""];
  const known = new Set(curriculum.map((s) => s.id));

  const writeTopic = (t: Topic) => {
    let line = `- [ ] ${t.text}`;
    if (t.detail?.trim()) line += `\n  ${t.detail.trim()}`;
    lines.push(line);
  };

  if (curriculum.length) {
    for (const slot of curriculum) {
      lines.push(`### ${slot.label}`, "");
      const inSlot = agenda.filter((t) => t.slotId === slot.id);
      if (inSlot.length === 0) {
        lines.push("- [ ]");
      } else {
        for (const t of inSlot) writeTopic(t);
      }
      lines.push("");
    }
    const other = agenda.filter((t) => !t.slotId || !known.has(t.slotId));
    if (other.length) {
      lines.push("### Other", "");
      for (const t of other) writeTopic(t);
      lines.push("");
    }
  } else {
    if (agenda.length === 0) return null;
    for (const t of agenda) writeTopic(t);
    lines.push("");
  }

  return lines.join("\n");
}
