import type { EntityKind } from "./routes";
import type {
  Manager,
  Me,
  Note,
  Person,
  PrayerEntry,
  Session,
  Team,
  TeamNote,
  Topic,
  TrackedMeeting,
  Win,
} from "../types";
import { meetingSubjectName, meetingTitle } from "./readiness";

/**
 * Quick search — the whole workspace, indexed locally, answered in a frame.
 *
 * ── Why an index and not a filter ─────────────────────────────────────────
 * The palette used to search *names*: every person, team, manager and meeting,
 * scored against the query with `Array.filter`. That is fine for sixty labels
 * and useless for the thing people actually reach for, which is **what was
 * said**. "Meghan" found Meghan; "the parking lot thing" found nothing, even
 * though it was written in her last three write-ups.
 *
 * So the unit of search here is not the entity — it's the record. A write-up,
 * a topic, a note, a banked win, a prayer entry and a profile field are each
 * their own document, and each one knows the route that opens it. Searching
 * for something you discussed lands you in the occurrence where you discussed
 * it, not on a profile you then have to dig through.
 *
 * ── Why it's offline ──────────────────────────────────────────────────────
 * Nothing here talks to the network, by construction. The store is already
 * hydrated from `docCache` on a cold open and the shell is already served by
 * the service worker, so the index is built from memory the app has anyway.
 * A basement with no signal, a plane, a church hallway with two bars — search
 * doesn't know the difference, because there is nothing for it to know.
 *
 * ── Why it's fast ─────────────────────────────────────────────────────────
 * Three things, in the order they matter:
 *
 *   1. The index is built once per document version and cached (`getIndex`),
 *      not rebuilt per keystroke. Typing costs a lookup, never a scan of every
 *      note in the workspace.
 *   2. An inverted token index narrows candidates before anything is scored.
 *      A query hits a binary search over the sorted token list and a merge of
 *      posting lists; only the survivors get the (much more expensive) tiered
 *      scoring.
 *   3. Nothing is parsed at query time. Every haystack is folded — lowercased,
 *      diacritics removed — once, at build.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What a hit *is*. The four entity kinds are the things you navigate to; the
 * rest are records that live inside one, and open it at the right section.
 */
export type SearchKind =
  | "person"
  | "team"
  | "manager"
  | "meeting"
  | "me"
  | "session"
  | "topic"
  | "note"
  | "win"
  | "prayer";

/** Where opening a hit goes. Mirrors `Selection` — the URL is still the truth. */
export type SearchTarget = {
  kind: EntityKind;
  id: string;
  section?: string;
  /** Set for a write-up: opens the full-screen editor for that occurrence. */
  sessionId?: string;
};

export type SearchDoc = {
  /** Stable and unique across kinds — `session:s42`. Also the recents key. */
  id: string;
  kind: SearchKind;
  /** The heading this clusters under in the palette. */
  group: string;
  title: string;
  /** Where it lives — "Meghan Ross · Mar 4". Searched, at half weight. */
  context?: string;
  /** The prose. Searched at lower weight still, and the source of the snippet. */
  body?: string;
  /** ISO date, for the recency tilt. Undated documents simply don't get one. */
  date?: string;
  photo?: string;
  target: SearchTarget;
};

/** Everything the index is built from. A subset of the store, by design. */
export type SearchSource = {
  me: Me;
  people: Person[];
  teams: Team[];
  managers: Manager[];
  meetings: TrackedMeeting[];
  sessions: Session[];
  topics: Topic[];
  notes: Note[];
  teamNotes: TeamNote[];
  wins: Win[];
  prayers: PrayerEntry[];
};

const GROUPS: Record<SearchKind, string> = {
  person: "People",
  team: "Teams",
  manager: "Managers",
  meeting: "Meetings",
  me: "You",
  session: "Write-ups",
  topic: "Topics",
  note: "Notes",
  win: "Wins",
  prayer: "Prayer",
};

/** Non-empty parts, one per line. The index never sees the blanks. */
function lines(...parts: (string | undefined | null)[]): string | undefined {
  const kept = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return kept.length ? kept.join("\n") : undefined;
}

function dayLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  const thisYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

/**
 * A one-line title for a record whose content *is* its title — a note has no
 * name, so its first line becomes one.
 */
function firstLine(body: string, max = 72): string {
  const line = stripMarkdown(body).split("\n").find((l) => l.trim()) ?? "";
  const trimmed = line.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Enough markdown stripping to make a snippet read as prose. Not a parser and
 * not trying to be — headings, bullets, emphasis and link syntax are what
 * actually show up as noise in a one-line preview.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s*)?/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "");
}

const LEAD_UP_FIELDS = [
  "archetype",
  "winsLike",
  "anxieties",
  "currency",
  "comms",
  "theirScorecard",
] as const;

function leadUpText(profile: Person["leadUp"]): string | undefined {
  if (!profile) return undefined;
  return lines(...LEAD_UP_FIELDS.map((f) => profile[f]));
}

/**
 * Flatten the workspace into documents.
 *
 * Every record that carries prose a leader would search for is here. What is
 * deliberately *not* here: ids, colors, positions, chat transcripts with the
 * AI coach (a conversation about a person is not a record of them), and the
 * deprecated `actions` table.
 */
export function buildDocs(src: SearchSource): SearchDoc[] {
  const docs: SearchDoc[] = [];

  const named = { people: src.people, teams: src.teams, managers: src.managers };
  const teamName = new Map(src.teams.map((t) => [t.id, t.name]));
  const personName = new Map(src.people.map((p) => [p.id, p.name]));
  const subjectName = new Map<string, string>([
    ...src.people.map((p) => [`person:${p.id}`, p.name] as const),
    ...src.teams.map((t) => [`team:${t.id}`, t.name] as const),
    ...src.managers.map((m) => [`manager:${m.id}`, m.name] as const),
  ]);
  const managerName = new Map(src.managers.map((m) => [m.id, m.name]));

  const push = (doc: SearchDoc) => docs.push(doc);

  push({
    id: "me",
    kind: "me",
    group: GROUPS.me,
    title: src.me.name || "Me",
    context: src.me.title ?? "You",
    body: lines(
      src.me.title,
      src.me.howToLead,
      src.me.strengths.join(", "),
      src.me.watchOuts.join(", "),
      assessmentText(src.me)
    ),
    photo: src.me.photo,
    target: { kind: "me", id: "" },
  });

  for (const p of src.people) {
    push({
      id: `person:${p.id}`,
      kind: "person",
      group: GROUPS.person,
      title: p.name,
      context: p.role ?? (p.teamId ? teamName.get(p.teamId) : undefined),
      body: lines(
        p.role,
        p.relationshipType,
        p.howToLead,
        p.strengths.join(", "),
        p.watchOuts.join(", "),
        assessmentText(p),
        p.customModalities
          ?.map((m) => lines(m.name, m.result, m.notes))
          .join("\n"),
        leadUpText(p.leadUp),
        p.health?.note,
        p.prayer?.focus
      ),
      photo: p.photo,
      target: { kind: "person", id: p.id },
    });
  }

  for (const t of src.teams) {
    push({
      id: `team:${t.id}`,
      kind: "team",
      group: GROUPS.team,
      title: t.name,
      context: t.parentId ? teamName.get(t.parentId) : "Team",
      body: lines(
        t.purpose,
        t.description,
        t.cadence,
        t.health?.note,
        t.prayer?.focus
      ),
      target: { kind: "team", id: t.id },
    });
  }

  for (const m of src.managers) {
    push({
      id: `manager:${m.id}`,
      kind: "manager",
      group: GROUPS.manager,
      title: m.name,
      context: m.role ?? "I report to",
      body: lines(m.role, leadUpText(m.leadUp), m.prayer?.focus),
      photo: m.photo,
      target: { kind: "manager", id: m.id },
    });
  }

  const meetingLabel = new Map<string, string>();
  for (const m of src.meetings) {
    const subject = meetingSubjectName(m, named);
    const title = meetingTitle(m, subject);
    meetingLabel.set(m.id, subject ?? title);
    push({
      id: `meeting:${m.id}`,
      kind: "meeting",
      group: GROUPS.meeting,
      title,
      context: subject ?? "Meeting",
      body: lines(m.name, m.trackerName, m.trackerUrl),
      date: m.nextDate,
      target: { kind: "meeting", id: m.id },
    });
  }

  const meetingSubjectId = new Map(src.meetings.map((m) => [m.id, m.subjectId]));

  for (const s of src.sessions) {
    const subject = meetingLabel.get(s.meetingId);
    const when = dayLabel(s.date);
    push({
      id: `session:${s.id}`,
      kind: "session",
      group: GROUPS.session,
      title: s.point?.trim() || (when ? `Write-up · ${when}` : "Write-up"),
      context: [subject, when].filter(Boolean).join(" · ") || undefined,
      // The raw transcript is searched too: "what did she say about the
      // budget" is answerable before anyone has written the notes up.
      body: lines(s.notes, s.transcript),
      date: s.date,
      target: {
        kind: "meeting",
        id: s.meetingId,
        section: "notes",
        sessionId: s.id,
      },
    });
  }

  for (const t of src.topics) {
    push({
      id: `topic:${t.id}`,
      kind: "topic",
      group: GROUPS.topic,
      title: t.text,
      context: [meetingLabel.get(t.meetingId), "Topic"]
        .filter(Boolean)
        .join(" · "),
      body: t.detail,
      date: t.closedOn ?? t.createdOn,
      target: { kind: "meeting", id: t.meetingId, section: "meetings" },
    });
  }

  for (const n of src.notes) {
    push({
      id: `note:${n.id}`,
      kind: "note",
      group: GROUPS.note,
      title: firstLine(n.body) || "Note",
      context: [personName.get(n.personId), dayLabel(n.date)]
        .filter(Boolean)
        .join(" · "),
      body: n.body,
      date: n.date,
      target: { kind: "person", id: n.personId, section: "notes" },
    });
  }

  for (const n of src.teamNotes) {
    push({
      id: `teamNote:${n.id}`,
      kind: "note",
      group: GROUPS.note,
      title: firstLine(n.body) || "Note",
      context: [teamName.get(n.teamId), dayLabel(n.date)]
        .filter(Boolean)
        .join(" · "),
      body: n.body,
      date: n.date,
      target: { kind: "team", id: n.teamId, section: "notes" },
    });
  }

  for (const w of src.wins) {
    // A win is banked against an up-team person *or* a manager; both render it
    // on the same profile section, so one lookup covers both.
    const kind: EntityKind = personName.has(w.personId) ? "person" : "manager";
    push({
      id: `win:${w.id}`,
      kind: "win",
      group: GROUPS.win,
      title: w.text,
      context: [
        personName.get(w.personId) ?? managerName.get(w.personId),
        dayLabel(w.date),
      ]
        .filter(Boolean)
        .join(" · "),
      body: w.impact,
      date: w.date,
      target: { kind, id: w.personId, section: "profile" },
    });
  }

  for (const p of src.prayers) {
    push({
      id: `prayer:${p.id}`,
      kind: "prayer",
      group: GROUPS.prayer,
      title: p.text,
      context: [
        subjectName.get(`${p.subjectKind}:${p.subjectId}`),
        p.kind === "scripture" ? "Scripture" : "Burden",
      ]
        .filter(Boolean)
        .join(" · "),
      body: p.answerNote,
      date: p.answeredOn ?? p.date,
      target: { kind: p.subjectKind, id: p.subjectId, section: "prayer" },
    });
  }

  // Meetings whose subject was deleted, notes whose person was: skip rather
  // than offer a row that opens an empty panel.
  return docs.filter(
    (d) =>
      d.kind === "me" ||
      d.target.kind === "me" ||
      hasTarget(d.target, { personName, teamName, managerName, meetingSubjectId })
  );
}

function hasTarget(
  target: SearchTarget,
  src: {
    personName: Map<string, string>;
    teamName: Map<string, string>;
    managerName: Map<string, string>;
    meetingSubjectId: Map<string, string>;
  }
): boolean {
  switch (target.kind) {
    case "person":
      return src.personName.has(target.id);
    case "team":
      return src.teamName.has(target.id);
    case "manager":
      return src.managerName.has(target.id);
    case "meeting":
      return src.meetingSubjectId.has(target.id);
    default:
      return true;
  }
}

function assessmentText(subject: { assessments: Me["assessments"] }): string | undefined {
  const a = subject.assessments;
  return lines(a.cliftonTop5?.join(", "), a.enneagram, a.mbti);
}

// ─────────────────────────────────────────────────────────────────────────────
// Folding and tokenizing
// ─────────────────────────────────────────────────────────────────────────────

/** Latin-1 supplement + extended-A, where the accented letters live. */
const ACCENTED = /[À-ɏ]/;
const ACCENTED_ALL = /[À-ɏ]/g;

/**
 * Lowercase, and strip accents so "jose" finds "José".
 *
 * **Length-preserving on purpose.** Snippets and highlights index back into the
 * original string using offsets found in the folded one, and the obvious
 * `normalize("NFD").replace(/\p{Diacritic}/gu, "")` shifts every offset after
 * the first accent. Replacing each accented character with the first character
 * of its decomposition keeps the two strings in lockstep.
 */
export function fold(text: string): string {
  const lower = text.toLowerCase();
  if (!ACCENTED.test(lower)) return lower;
  return lower.replace(ACCENTED_ALL, (c) => c.normalize("NFD")[0] ?? c);
}

/** Longer than this and it isn't a word anyone types — usually a pasted URL. */
const MAX_TOKEN = 32;

function tokenize(folded: string): string[] {
  const out: string[] = [];
  for (const raw of folded.split(/[^a-z0-9]+/)) {
    if (raw) out.push(raw.length > MAX_TOKEN ? raw.slice(0, MAX_TOKEN) : raw);
  }
  return out;
}

/** The query, split the same way the index was. Empty for a blank query. */
export function queryTokens(query: string): string[] {
  return tokenize(fold(query.trim()));
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How well `text` answers `query`, or 0 for "not at all". Both are assumed
 * folded already — see `score` for the public, unfolded version.
 *
 * Four tiers, deliberately narrow. A prefix wins, then a match at the start of
 * any word ("foster" finds "Dana Foster"), then a mid-word substring, then
 * initials ("df" finds the same).
 *
 * What's *not* here is a free subsequence match over the whole string. It's the
 * obvious thing to write and it makes a palette feel broken: with it, "da"
 * matched "A**d**d man**a**ger" and "Manage **d**om**a**ins", so the top of the
 * list filled with commands that have nothing to do with what was typed.
 */
export function scoreFolded(query: string, text: string): number {
  if (!query || !text) return 0;

  if (text.startsWith(query)) return 1000 - Math.min(text.length, 400);

  const at = text.indexOf(query);
  if (at > 0) {
    const wordStart = /[\s\-–—·:/(]/.test(text[at - 1]);
    // Mid-word substrings still count, just below every word-start match.
    return (wordStart ? 700 : 300) - Math.min(at, 250);
  }

  // Initials: "df" → "Dana Foster", "tmp" → "Tree mode — Pray". Only worth
  // computing for something short enough to *have* meaningful initials — over
  // a note body it is both nonsense and the one O(n) tier in this function.
  if (query.length > 1 && text.length <= 64) {
    const initials = text
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("");
    if (initials.startsWith(query)) return 600;
  }

  return 0;
}

/** `scoreFolded`, for callers holding raw strings — commands, mostly. */
export function score(query: string, text: string): number {
  if (!query || !text) return 0;
  return scoreFolded(fold(query), fold(text));
}

/**
 * What a match in each field is worth.
 *
 * A name is what you meant; where it lives is a decent second guess; the prose
 * is the long tail. Without the gap, one stray mention of "Meghan" in a team
 * note outranks Meghan.
 */
const FIELD_WEIGHT = { title: 1, context: 0.5, body: 0.32 };

/**
 * A thumb on the scale for the things you navigate *to*.
 *
 * Typing a name almost always means "take me to them", not "show me the
 * fourteen write-ups that mention them" — and those write-ups all carry the
 * name in their context line, so without this they'd bury the person.
 */
const KIND_BIAS: Record<SearchKind, number> = {
  person: 90,
  team: 80,
  manager: 80,
  me: 70,
  meeting: 60,
  topic: 10,
  session: 0,
  note: 0,
  win: 0,
  prayer: 0,
};

/** Recent work is more likely to be what you're after. Halves every ~31 days. */
function recencyBoost(date: string | undefined, now: number): number {
  if (!date) return 0;
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  const days = Math.max(0, (now - t) / 86_400_000);
  return 140 * Math.exp(-days / 45);
}

// ─────────────────────────────────────────────────────────────────────────────
// The index
// ─────────────────────────────────────────────────────────────────────────────

type Fields = { title: string; context: string; body: string };

export type SearchIndex = {
  docs: SearchDoc[];
  /** By id, for resolving a recents list without scanning the corpus. */
  byId: Map<string, SearchDoc>;
  /** Folded haystacks, parallel to `docs`. Scoring never folds anything. */
  fields: Fields[];
  /** Every token in the corpus, sorted, so a prefix is a binary search away. */
  tokens: string[];
  /** `postings[i]` = ascending doc indices containing `tokens[i]`. */
  postings: Int32Array[];
};

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  const fields: Fields[] = new Array(docs.length);
  const posting = new Map<string, number[]>();

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const f: Fields = {
      title: fold(doc.title),
      context: doc.context ? fold(doc.context) : "",
      body: doc.body ? fold(doc.body) : "",
    };
    fields[i] = f;

    for (const field of [f.title, f.context, f.body]) {
      if (!field) continue;
      for (const token of tokenize(field)) {
        const list = posting.get(token);
        if (!list) posting.set(token, [i]);
        // Postings stay ascending and duplicate-free because docs are indexed
        // in order — the last entry is the only one that could repeat.
        else if (list[list.length - 1] !== i) list.push(i);
      }
    }
  }

  const tokens = [...posting.keys()].sort();
  const postings = tokens.map((t) => Int32Array.from(posting.get(t)!));
  const byId = new Map(docs.map((d) => [d.id, d]));
  return { docs, byId, fields, tokens, postings };
}

/** First index in `tokens` whose value is >= `prefix`. */
function lowerBound(tokens: string[], prefix: string): number {
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Querying
// ─────────────────────────────────────────────────────────────────────────────

export type SearchHit = {
  doc: SearchDoc;
  score: number;
  /** A window of the body around the match. Only when the body is what hit. */
  snippet?: string;
};

export type SearchOptions = {
  limit?: number;
  /** Doc id → position in the recents list. Rank 0 is the most recent. */
  recentRank?: Map<string, number>;
  /** Injectable for tests; defaults to now. */
  now?: number;
};

/**
 * Multi-token AND. "meghan budget" means both, in any field, in any order —
 * which is how a half-remembered thing is actually recalled.
 */
export function search(
  index: SearchIndex,
  query: string,
  opts: SearchOptions = {}
): SearchHit[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];

  const { docs, fields } = index;
  const now = opts.now ?? Date.now();
  const limit = opts.limit ?? 40;

  // How many of the query's tokens each doc matched. A doc is a candidate only
  // once it has them all.
  const matched = new Int32Array(docs.length);
  const stamp = new Int32Array(docs.length).fill(-1);

  for (let qi = 0; qi < tokens.length; qi++) {
    const token = tokens[qi];

    // Prefix hits, straight out of the inverted index.
    for (let t = lowerBound(index.tokens, token); t < index.tokens.length; t++) {
      if (!index.tokens[t].startsWith(token)) break;
      const list = index.postings[t];
      for (let k = 0; k < list.length; k++) {
        const d = list[k];
        if (stamp[d] === qi) continue;
        stamp[d] = qi;
        matched[d]++;
      }
    }

    // Mid-word title hits ("well" → "Leadwell"), which a prefix index can't
    // see. Only titles: they're one short line per doc, so the scan is cheap,
    // and a mid-word match buried in a note body is noise anyway.
    for (let d = 0; d < docs.length; d++) {
      if (stamp[d] === qi) continue;
      if (fields[d].title.includes(token)) {
        stamp[d] = qi;
        matched[d]++;
      }
    }
  }

  const scored: { d: number; score: number; bodyWon: boolean }[] = [];
  for (let d = 0; d < docs.length; d++) {
    if (matched[d] !== tokens.length) continue;

    let total = 0;
    let bodyWon = false;
    for (const token of tokens) {
      const f = fields[d];
      const title = FIELD_WEIGHT.title * scoreFolded(token, f.title);
      const context = FIELD_WEIGHT.context * scoreFolded(token, f.context);
      const body = FIELD_WEIGHT.body * scoreFolded(token, f.body);
      const best = Math.max(title, context, body);
      if (best === 0) {
        // Matched the token index on one field but scored nowhere — can't
        // happen for a prefix hit, but a defensive zero beats a phantom row.
        total = 0;
        break;
      }
      // Only the prose *winning outright* earns a snippet — a tie with the
      // title means the title already says why the row is there.
      if (body > title && body > context) bodyWon = true;
      total += best;
    }
    if (total === 0) continue;

    const doc = docs[d];
    const rank = opts.recentRank?.get(doc.id);
    const frecency = rank === undefined ? 0 : Math.max(60, 320 - rank * 30);

    scored.push({
      d,
      score:
        total / tokens.length +
        KIND_BIAS[doc.kind] +
        recencyBoost(doc.date, now) +
        frecency,
      bodyWon,
    });
  }

  scored.sort(
    (a, b) => b.score - a.score || docs[a.d].title.localeCompare(docs[b.d].title)
  );

  // Snippets are cut last, for the handful of rows that survive. Cutting them
  // during scoring means stripping markdown out of every note in the workspace
  // to show thirty of them.
  return scored.slice(0, limit).map(({ d, score, bodyWon }) => {
    const doc = docs[d];
    return {
      doc,
      score,
      snippet:
        bodyWon && doc.body ? snippet(doc.body, fields[d].body, tokens) : undefined,
    };
  });
}

/** Roughly how much of the body to show around a match. */
const SNIPPET_WINDOW = 130;
const SNIPPET_LEAD = 36;

/**
 * A window of the body around the earliest match, so a hit in a 4,000-word
 * write-up shows the sentence it was in rather than the first line of the page.
 */
export function snippet(
  body: string,
  foldedBody: string,
  tokens: string[]
): string | undefined {
  let at = -1;
  for (const token of tokens) {
    const i = foldedBody.indexOf(token);
    if (i >= 0 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return undefined;

  let start = Math.max(0, at - SNIPPET_LEAD);
  // Don't start mid-word.
  if (start > 0) {
    const space = body.indexOf(" ", start);
    if (space >= 0 && space < start + 20) start = space + 1;
  }
  const end = Math.min(body.length, start + SNIPPET_WINDOW);
  const text = stripMarkdown(body.slice(start, end)).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return `${start > 0 ? "…" : ""}${text}${end < body.length ? "…" : ""}`;
}

/**
 * Split `text` into alternating plain and matched runs, so the palette can
 * mark what was typed without doing its own matching.
 */
export function highlight(
  text: string,
  tokens: string[]
): { text: string; hit: boolean }[] {
  if (!tokens.length || !text) return [{ text, hit: false }];

  const folded = fold(text);
  const ranges: [number, number][] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(token, from);
      if (at === -1) break;
      ranges.push([at, at + token.length]);
      from = at + token.length;
    }
  }
  if (!ranges.length) return [{ text, hit: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [from, to] of ranges) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }

  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [from, to] of merged) {
    if (from > cursor) parts.push({ text: text.slice(cursor, from), hit: false });
    parts.push({ text: text.slice(from, to), hit: true });
    cursor = to;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
// The cache
// ─────────────────────────────────────────────────────────────────────────────

let cached: { src: SearchSource; index: SearchIndex } | null = null;

/**
 * The index for this version of the document, building it if the document has
 * moved on.
 *
 * Keyed on the collection *references* rather than a version counter, because
 * that's what the store already gives us: every mutation replaces the array it
 * touched, so a cheap identity check over eleven slots is exact. Editing a
 * write-up invalidates the index; panning the org tree does not.
 *
 * Called from the palette on open — never on a keystroke, and never while the
 * user is typing into a note, which is the one time a rebuild would be felt.
 */
export function getIndex(src: SearchSource): SearchIndex {
  if (cached && sameSource(cached.src, src)) return cached.index;
  const index = buildIndex(buildDocs(src));
  cached = { src, index };
  return index;
}

/** Drop the cached index — on sign-out, so one account can't answer for another. */
export function clearIndex(): void {
  cached = null;
}

function sameSource(a: SearchSource, b: SearchSource): boolean {
  return (
    a.me === b.me &&
    a.people === b.people &&
    a.teams === b.teams &&
    a.managers === b.managers &&
    a.meetings === b.meetings &&
    a.sessions === b.sessions &&
    a.topics === b.topics &&
    a.notes === b.notes &&
    a.teamNotes === b.teamNotes &&
    a.wins === b.wins &&
    a.prayers === b.prayers
  );
}
