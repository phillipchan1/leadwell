import type { GlossaryTerm } from "../types";

/**
 * The glossary, learned from corrections.
 *
 * Fixing "Alayna" to "Elena" in a transcript is the most precise thing anyone
 * can tell a transcriber, and it used to be thrown away. Now the fix is
 * noticed (`findCorrections`), offered back as "always write Elena", and once
 * kept it's applied to everything heard after (`applyGlossary`) and handed to
 * the transcriber as a word to expect.
 */

/** Words are runs of letters and digits; apostrophes and hyphens stay inside. */
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every learned mishearing in `text`, replaced with what was meant. In any
 * case — except a short single word, which only matches as it was written:
 * having learned "Web" → "Webb" mustn't turn every "web" into a surname.
 */
export function applyGlossary(text: string, terms: GlossaryTerm[]): string {
  let out = text;
  for (const t of terms) if (t.heard) out = out.replace(phraseRe(t.heard), t.meant);
  return out;
}

/** How many times a phrase appears as whole words, matched as `applyGlossary` would. */
export function countPhrase(text: string, phrase: string): number {
  return phrase ? (text.match(phraseRe(phrase))?.length ?? 0) : 0;
}

function phraseRe(phrase: string): RegExp {
  const short = !/\s/.test(phrase) && phrase.length <= 4;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, short ? "gu" : "giu");
}

export type Correction = { heard: string; meant: string };

/** Longer than this between the edits and it's a rewrite, not a correction. */
const MAX_SPAN_WORDS = 4;
const MAX_DIFF_WORDS = 400;

/**
 * The word-for-word replacements between two versions of a transcript that
 * look like someone fixing what the transcriber misheard — not rewriting,
 * deleting or adding. "we talked to Alayna" → "we talked to Elena" gives
 * Alayna → Elena; trimming a sentence gives nothing.
 */
export function findCorrections(before: string, after: string): Correction[] {
  const a = words(before);
  const b = words(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (!midA.length || !midB.length) return [];
  if (midA.length > MAX_DIFF_WORDS || midB.length > MAX_DIFF_WORDS) return [];

  const out: Correction[] = [];
  for (const [x, y] of replacedSpans(midA, midB)) {
    if (!x.length || !y.length || x.length > MAX_SPAN_WORDS || y.length > MAX_SPAN_WORDS) continue;
    const heard = x.join(" ");
    const meant = y.join(" ");
    if (looksLikeCorrection(heard, meant)) out.push({ heard, meant });
  }
  return dedupe(out);
}

/** Swapping one of these for another is changing the facts, not the spelling. */
const CALENDAR_WORDS = new Set(
  "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december".split(
    " "
  )
);

/**
 * A mishearing sounds like what was meant, and what was meant is the kind of
 * word a transcriber gets wrong: a name, a title, a term — something with a
 * capital. So the two must be close in spelling (or the fix only capitalises
 * it), and a swap of "Tuesday" for "Thursday" is an edit to the facts, left
 * alone.
 */
export function looksLikeCorrection(heard: string, meant: string): boolean {
  const h = heard.toLowerCase();
  const m = meant.toLowerCase();
  if (meant.replace(/\s/g, "").length < 3 || !/\p{Lu}/u.test(meant)) return false;
  if (CALENDAR_WORDS.has(h) || CALENDAR_WORDS.has(m)) return false;
  if (h === m) return heard !== meant;
  const distance = levenshtein(h, m);
  return distance / Math.max(h.length, m.length) <= 0.5;
}

function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** Aligned by longest common subsequence; each gap is one replaced span. */
function replacedSpans(a: string[], b: string[]): [string[], string[]][] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const spans: [string[], string[]][] = [];
  let x: string[] = [];
  let y: string[] = [];
  let i = 0;
  let j = 0;
  const flush = () => {
    if (x.length || y.length) spans.push([x, y]);
    x = [];
    y = [];
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      x.push(a[i++]);
    } else {
      y.push(b[j++]);
    }
  }
  while (i < n) x.push(a[i++]);
  while (j < m) y.push(b[j++]);
  flush();
  return spans;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function dedupe(list: Correction[]): Correction[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const key = `${c.heard.toLowerCase()}→${c.meant}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
