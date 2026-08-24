/**
 * Tag / meeting suggestion seam. Heuristics now; same signature a model Edge
 * Function would expose later.
 */
import type { LabMeeting, LabTag, LabTopic } from "./types";

export type Suggestion = {
  id: string;
  label: string;
  score: number;
  reason: string;
};

export type SuggestContext = {
  tags: LabTag[];
  meetings: LabMeeting[];
  topics: LabTopic[];
};

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

/** Build term → tagId weights from already-tagged topics. */
function tagLexicon(topics: LabTopic[], tags: LabTag[]): Map<string, Map<string, number>> {
  const lex = new Map<string, Map<string, number>>();
  const tagById = new Map(tags.map((t) => [t.id, t]));
  for (const topic of topics) {
    if (!topic.tagIds.length) continue;
    for (const tok of tokens(topic.text)) {
      let bucket = lex.get(tok);
      if (!bucket) {
        bucket = new Map();
        lex.set(tok, bucket);
      }
      for (const tagId of topic.tagIds) {
        if (!tagById.has(tagId)) continue;
        bucket.set(tagId, (bucket.get(tagId) ?? 0) + 1);
      }
    }
  }
  // Also index tag labels themselves so "#training" and "do some training"
  // both fire even before the lexicon has examples.
  for (const tag of tags) {
    for (const tok of tokens(tag.label)) {
      let bucket = lex.get(tok);
      if (!bucket) {
        bucket = new Map();
        lex.set(tok, bucket);
      }
      bucket.set(tag.id, (bucket.get(tag.id) ?? 0) + 3);
    }
  }
  return lex;
}

export function suggestTags(text: string, ctx: SuggestContext): Suggestion[] {
  const lex = tagLexicon(ctx.topics, ctx.tags);
  const scores = new Map<string, number>();
  for (const tok of tokens(text)) {
    const bucket = lex.get(tok);
    if (!bucket) continue;
    for (const [tagId, w] of bucket) {
      scores.set(tagId, (scores.get(tagId) ?? 0) + w);
    }
  }
  const tagById = new Map(ctx.tags.map((t) => [t.id, t]));
  return [...scores.entries()]
    .map(([id, score]) => ({
      id,
      label: tagById.get(id)?.label ?? id,
      score,
      reason: "matches past tagged topics",
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function fuzzyName(query: string, name: string): number {
  const q = query.toLowerCase();
  const n = name.toLowerCase();
  if (n === q) return 10;
  if (n.startsWith(q)) return 8;
  if (n.includes(q)) return 5;
  // Token overlap
  const qt = tokens(q);
  const nt = tokens(n);
  let hit = 0;
  for (const t of qt) if (nt.some((x) => x.startsWith(t) || t.startsWith(x))) hit++;
  return hit * 2;
}

export function suggestMeeting(
  text: string,
  ctx: SuggestContext
): Suggestion | null {
  const toks = tokens(text);
  if (!toks.length && !text.trim()) return null;

  // Recency: meetings with more recently created / slotted topics score higher.
  const recent = new Map<string, number>();
  for (const t of ctx.topics) {
    if (!t.meetingId) continue;
    recent.set(t.meetingId, (recent.get(t.meetingId) ?? 0) + 1);
  }

  let best: Suggestion | null = null;
  for (const m of ctx.meetings) {
    let score = fuzzyName(text, m.name) + fuzzyName(text, m.subjectName);
    for (const tok of toks) {
      score += fuzzyName(tok, m.name) + fuzzyName(tok, m.subjectName);
    }
    score += Math.min(3, recent.get(m.id) ?? 0) * 0.3;
    if (score <= 0) continue;
    const candidate: Suggestion = {
      id: m.id,
      label: m.name,
      score,
      reason: "name match + recency",
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best && best.score >= 2 ? best : null;
}

/** Resolve a #label or @query against known entities. */
export function resolveTagLabel(label: string, tags: LabTag[]): LabTag | undefined {
  const q = label.toLowerCase();
  return (
    tags.find((t) => t.label.toLowerCase() === q) ??
    tags.find((t) => t.label.toLowerCase().startsWith(q)) ??
    tags.find((t) => t.label.toLowerCase().includes(q))
  );
}

export function resolveMeetingQuery(
  query: string,
  meetings: LabMeeting[]
): LabMeeting | undefined {
  const q = query.toLowerCase();
  return (
    meetings.find((m) => m.name.toLowerCase() === q) ??
    meetings.find((m) => m.name.toLowerCase().includes(q)) ??
    meetings.find((m) => m.subjectName.toLowerCase().includes(q)) ??
    meetings.find((m) =>
      m.name
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.startsWith(q))
    )
  );
}
