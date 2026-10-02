import type { FollowUp, Session, Topic, TrackedMeeting } from "../types";
import { curriculumOf, effectiveSlotId } from "./topics";

/**
 * An occurrence as plain text, for the place the team actually reads it.
 *
 * An agenda that lives only in the leader's planner prepares one person. Sent
 * the day before — to Slack, an email, the group text — it prepares the room:
 * people come with the numbers, the prayer request, the decision already
 * half-made. Afterwards the same occurrence becomes the recap, so what was
 * decided and who's doing what doesn't depend on anyone's memory.
 *
 * Markdown-flavoured but readable unrendered, since half the places this gets
 * pasted won't render it.
 */

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

type Group = { label?: string; topics: Topic[] };

/** Topics in running order, under the meeting's standing rows when it has them. */
function grouped(meeting: TrackedMeeting, topics: Topic[]): Group[] {
  const curriculum = curriculumOf(meeting);
  if (!curriculum.length) return [{ topics }];
  const rows: Group[] = curriculum.map((slot) => ({
    label: slot.label,
    topics: topics.filter((t) => effectiveSlotId(t, curriculum) === slot.id),
  }));
  const other = topics.filter((t) => !effectiveSlotId(t, curriculum));
  if (other.length) rows.push({ label: "Other", topics: other });
  return rows.filter((g) => g.topics.length > 0);
}

function topicLines(t: Topic, mark: string): string[] {
  const lines = [`${mark}${t.text}`];
  for (const p of t.points ?? []) {
    if (p.text.trim()) lines.push(`   - ${p.text.trim()}`);
  }
  return lines;
}

export function agendaText({
  meeting,
  title,
  session,
  date,
  topics,
  followUps,
}: {
  meeting: TrackedMeeting;
  title: string;
  session?: Session;
  date: string;
  /** Topics on this occurrence. */
  topics: Topic[];
  /** Open commitments with this subject. */
  followUps: FollowUp[];
}): string {
  const live = topics.filter((t) => t.status !== "dropped");
  const lines = [`**${title}** — ${longDate(date)}`];
  if (session?.point?.trim()) lines.push(`Why we're meeting: ${session.point.trim()}`);
  lines.push("");

  if (followUps.length) {
    lines.push("Since last time");
    for (const f of followUps) lines.push(`- ${f.text}`);
    lines.push("");
  }

  if (live.length === 0) {
    lines.push("Agenda: open — bring what's on your mind.");
  } else {
    lines.push("Agenda");
    let n = 0;
    for (const g of grouped(meeting, live)) {
      if (g.label) lines.push("", g.label);
      for (const t of g.topics) lines.push(...topicLines(t, `${++n}. `));
    }
  }
  return lines.join("\n").trim() + "\n";
}

/**
 * What happened, for the people who were there and the ones who weren't.
 * Covered, what's carrying forward, and the commitments — the three things a
 * recap is for. Notes stay in LeadWell; they're usually the leader's own.
 */
export function recapText({
  meeting,
  title,
  date,
  topics,
  followUps,
}: {
  meeting: TrackedMeeting;
  title: string;
  date: string;
  topics: Topic[];
  /** Commitments opened in this occurrence, plus any still open. */
  followUps: FollowUp[];
}): string {
  const covered = topics.filter((t) => t.status === "covered");
  const open = topics.filter((t) => t.status === "open");
  const lines = [`**${title} recap** — ${longDate(date)}`, ""];

  if (covered.length) {
    lines.push("Covered");
    for (const g of grouped(meeting, covered)) {
      for (const t of g.topics) lines.push(`- ${t.text}`);
    }
    lines.push("");
  }
  if (open.length) {
    lines.push("Carrying to next time");
    for (const t of open) lines.push(`- ${t.text}`);
    lines.push("");
  }
  const openCommitments = followUps.filter((f) => f.status === "open");
  const doneCommitments = followUps.filter((f) => f.status === "done");
  if (openCommitments.length || doneCommitments.length) {
    lines.push("Commitments");
    for (const f of openCommitments) lines.push(`- [ ] ${f.text}`);
    for (const f of doneCommitments) lines.push(`- [x] ${f.text}`);
    lines.push("");
  }
  if (!covered.length && !open.length && !openCommitments.length && !doneCommitments.length) {
    lines.push("Nothing was planned or logged for this one.");
  }
  return lines.join("\n").trim() + "\n";
}

/** Copy to the clipboard, falling back to a hidden textarea where the API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
