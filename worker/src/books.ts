/**
 * Book lookup for arcs: title in, a few candidate books out, and a book's real
 * chapter list when Open Library has one.
 *
 * Open Library is free, needs no key, and serves covers from a stable CDN.
 * (Google Books refuses unauthenticated calls from Workers, so it's no
 * fallback.) Only a cover id ever comes back to the client, rebuilt here into
 * a covers.openlibrary.org URL, so a stored cover can never point anywhere
 * else (see COVER_URL in store.ts).
 */

export type BookHit = {
  /** The Open Library work, e.g. "/works/OL282391W". Chapters are looked up by it. */
  key: string;
  title: string;
  author?: string;
  year?: number;
  /** Absent when Open Library has no cover; the arc keeps its typographic one. */
  coverUrl?: string;
};

export type Chapter = { label: string; read?: string };
export type Chapters = { chapters: Chapter[]; edition: { key: string; year?: string } };

const SEARCH_URL = "https://openlibrary.org/search.json";
const FIELDS = [
  "key",
  "title",
  "author_name",
  "cover_i",
  "first_publish_year",
  "editions",
  "editions.key",
  "editions.title",
  "editions.cover_i",
  "editions.language",
].join(",");
const MAX_HITS = 5;
const TIMEOUT_MS = 8000;

/** Open Library asks callers to identify themselves. */
const USER_AGENT = "Polarch/1.0 (https://polarch.day)";
const HEADERS = { "user-agent": USER_AGENT, accept: "application/json" };
/** The same title is looked up again and again while someone types. */
const CACHE = { cacheTtl: 86_400, cacheEverything: true };

export function coverUrlFor(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

/** The query as sent: trimmed, collapsed, and too short or long → null. */
export function bookQuery(raw: string | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim();
  return q.length >= 3 && q.length <= 160 ? q : null;
}

/** "/works/OL282391W" or "OL282391W" → "OL282391W"; anything else → null. */
export function workId(raw: string | undefined): string | null {
  const m = (raw ?? "").match(/^(?:\/works\/)?(OL\d{1,12}W)$/);
  return m ? m[1] : null;
}

const isCoverId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

/**
 * Search results → hits, first author only, no duplicate works. An English
 * edition's title wins over a work filed under a translation ("Las cinco
 * disfunciones…" → "Five Dysfunctions of a Team"). Books without a cover
 * still come back: finding the book matters more than its picture.
 */
export function parseOpenLibrary(body: unknown): BookHit[] {
  const docs = (body as { docs?: unknown })?.docs;
  if (!Array.isArray(docs)) return [];
  const out: BookHit[] = [];
  const seenKeys = new Set<string>();
  const seenCovers = new Set<number>();
  for (const d of docs as Record<string, unknown>[]) {
    const key = typeof d.key === "string" && workId(d.key) ? d.key : null;
    const workTitle = typeof d.title === "string" ? d.title.trim() : "";
    if (!key || !workTitle || seenKeys.has(key)) continue;
    const ed = ((d.editions as { docs?: Record<string, unknown>[] } | undefined)?.docs ?? [])[0];
    const edEnglish = Array.isArray(ed?.language) && (ed.language as unknown[]).includes("eng");
    const title = (edEnglish && typeof ed?.title === "string" && ed.title.trim()) || workTitle;
    const coverId = isCoverId(ed?.cover_i) ? ed.cover_i : isCoverId(d.cover_i) ? d.cover_i : undefined;
    if (coverId !== undefined && seenCovers.has(coverId)) continue;
    seenKeys.add(key);
    if (coverId !== undefined) seenCovers.add(coverId);
    const authors = Array.isArray(d.author_name) ? d.author_name : [];
    const author = typeof authors[0] === "string" ? authors[0] : undefined;
    out.push({
      key,
      title: title.slice(0, 200),
      author: author?.slice(0, 120),
      year: Number.isInteger(d.first_publish_year) ? (d.first_publish_year as number) : undefined,
      coverUrl: coverId !== undefined ? coverUrlFor(coverId) : undefined,
    });
    if (out.length === MAX_HITS) break;
  }
  // Books with a cover first: they're the ones people recognise at a glance.
  return [...out.filter((h) => h.coverUrl), ...out.filter((h) => !h.coverUrl)];
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cf: CACHE,
  } as RequestInit);
  if (!res.ok) throw new Error(`open library ${res.status}`);
  return res.json();
}

export async function searchBooks(q: string, fetchImpl: typeof fetch = fetch): Promise<BookHit[]> {
  const params = { fields: FIELDS, limit: "12", lang: "en" };
  const hits = parseOpenLibrary(await getJson(`${SEARCH_URL}?${new URLSearchParams({ q, ...params })}`, fetchImpl));
  if (hits.length) return hits;
  // A general search can miss a title that a title search finds ("the" vs no "the", subtitles).
  return parseOpenLibrary(await getJson(`${SEARCH_URL}?${new URLSearchParams({ title: q, ...params })}`, fetchImpl));
}

// ── Chapters ───────────────────────────────────────────────────────────────

type TocEntry = { level?: unknown; label?: unknown; title?: unknown; pagenum?: unknown };
type Edition = {
  key?: unknown;
  publish_date?: unknown;
  languages?: unknown;
  table_of_contents?: unknown;
};

/** Front and back matter: not something you talk about for a week. */
const MATTER =
  /^(foreword|preface|acknowledg\w*|contents|table of contents|dedication|copyright|index|notes|endnotes|bibliography|references|about the authors?|also by|praise for|glossary|credits|resources|appendix\w*)\b/i;

const sentence = (s: string) => (s === s.toLowerCase() ? s.replace(/^\p{L}/u, (c) => c.toUpperCase()) : s);

/** "Start with Heart: How to Stay Focused…" → "Start with Heart". */
function mainTitle(raw: string): string {
  // Library catalogue punctuation ("Luck ;", "The fable --") and a part heading run into a chapter.
  const t = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^part\s+[ivxlc\d]+\s*[.:\-–—]\s*/i, "")
    .replace(/[\s\-–—;,/:.]+$/, "");
  const cut = t.split(/\s*:\s+|\s+:\s*/)[0] || t;
  return sentence(cut).slice(0, 120);
}

/** One edition's contents → chapters, or [] when it doesn't read like chapters. */
export function chaptersFromToc(toc: unknown): Chapter[] {
  if (!Array.isArray(toc)) return [];
  const entries = (toc as TocEntry[])
    .map((e) => ({
      level: Number.isInteger(e.level) ? (e.level as number) : 0,
      label: typeof e.label === "string" ? e.label.trim() : "",
      title: typeof e.title === "string" ? e.title.trim() : "",
      page: typeof e.pagenum === "string" && /^\d+$/.test(e.pagenum.trim()) ? Number(e.pagenum.trim()) : undefined,
    }))
    .filter((e) => e.title || e.label);
  if (!entries.length) return [];
  const top = Math.min(...entries.map((e) => e.level));
  // Parts at the top and chapters beneath: the chapters are the steps.
  const levels = [top, top + 1].map((lv) => entries.filter((e) => e.level === lv && !MATTER.test(e.title)));
  const rows = levels[1].length > levels[0].length * 2 ? levels[1] : levels[0];

  const out: Chapter[] = [];
  let n = 0;
  rows.forEach((e) => {
    const numbered = `${e.label} ${e.title}`.match(/\b(?:ch(?:apter)?)\.?\s*(\d+)\b/i);
    const plain = /^(introduction|conclusion|epilogue|prologue|afterword)\b/i.test(e.title);
    const title = mainTitle(e.title.replace(/^(?:ch(?:apter)?)\.?\s*\d+\s*[:.\-–—]?\s*/i, "") || e.label);
    if (!title) return;
    let label: string;
    if (plain && !numbered) label = title;
    else {
      n = numbered ? Number(numbered[1]) : n + 1;
      label = `Ch. ${n} · ${title}`;
    }
    // A chapter runs to wherever the next entry starts, back matter included.
    const after = entries.slice(entries.indexOf(e) + 1).find((x) => x.page !== undefined);
    const next = after?.page;
    const read =
      e.page !== undefined && next !== undefined && next > e.page
        ? `pp. ${e.page}–${next - 1}`
        : plain && !numbered
          ? undefined
          : `Ch. ${n}`;
    out.push({ label, read });
  });
  return out.filter((c) => c.label.startsWith("Ch.")).length >= 3 ? out.slice(0, 60) : [];
}

/**
 * The best contents among a work's editions: English first, then the one with
 * the most chapters, then the newest.
 */
export function bestChapters(body: unknown): Chapters | null {
  const entries = (body as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) return null;
  const year = (e: Edition) => (typeof e.publish_date === "string" ? e.publish_date.match(/\d{4}/)?.[0] : undefined);
  const english = (e: Edition) =>
    Array.isArray(e.languages) && (e.languages as { key?: string }[]).some((l) => l?.key === "/languages/eng");
  const scored = (entries as Edition[])
    .map((e) => ({ e, chapters: chaptersFromToc(e.table_of_contents) }))
    .filter((x) => x.chapters.length && typeof x.e.key === "string")
    .sort(
      (a, b) =>
        Number(english(b.e)) - Number(english(a.e)) ||
        b.chapters.length - a.chapters.length ||
        Number(year(b.e) ?? 0) - Number(year(a.e) ?? 0)
    );
  const best = scored[0];
  return best ? { chapters: best.chapters, edition: { key: best.e.key as string, year: year(best.e) } } : null;
}

export async function chaptersFor(work: string, fetchImpl: typeof fetch = fetch): Promise<Chapters | null> {
  return bestChapters(await getJson(`https://openlibrary.org/works/${work}/editions.json?limit=100`, fetchImpl));
}
