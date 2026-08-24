/**
 * Capture grammar: `#tag` `@meeting` `!` urgent, bare text = title.
 * Multi-line paste is handled by the caller (one topic per line).
 */

export type CaptureParse = {
  text: string;
  tagLabels: string[];
  meetingQuery: string | null;
  urgent: boolean;
};

const TAG_RE = /#([\w][\w-]*)/g;
const MEETING_RE = /@([\w][\w-]*)/g;

export function parseCapture(raw: string): CaptureParse {
  const tagLabels: string[] = [];
  let meetingQuery: string | null = null;
  let urgent = false;

  let working = raw.trim();
  if (/(?:^|\s)!(?:\s|$)/.test(working) || working.endsWith("!")) {
    urgent = true;
    working = working.replace(/(?:^|\s)!(\s|$)/g, "$1").replace(/!$/, "").trim();
  }

  for (const m of working.matchAll(TAG_RE)) {
    tagLabels.push(m[1].toLowerCase());
  }
  working = working.replace(TAG_RE, " ").trim();

  const meetingMatch = [...working.matchAll(MEETING_RE)];
  if (meetingMatch.length) {
    meetingQuery = meetingMatch[meetingMatch.length - 1][1].toLowerCase();
  }
  working = working.replace(MEETING_RE, " ").replace(/\s+/g, " ").trim();

  return { text: working, tagLabels, meetingQuery, urgent };
}

/** Split a paste into candidate topic lines (empty lines dropped). */
export function splitCaptureLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}
