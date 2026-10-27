/**
 * Book lookup for arcs: title in, a few candidate covers out.
 *
 * Open Library is free, needs no key, and serves covers from a stable CDN.
 * Only a cover id ever comes back to the client, rebuilt here into a
 * covers.openlibrary.org URL, so a stored cover can never point anywhere
 * else (see COVER_URL in store.ts).
 */

export type BookHit = {
  key: string;
  title: string;
  author?: string;
  year?: number;
  coverUrl: string;
};

const SEARCH_URL = "https://openlibrary.org/search.json";
const FIELDS = "key,title,author_name,cover_i,first_publish_year";
const MAX_HITS = 4;
const TIMEOUT_MS = 4000;

/** Open Library asks callers to identify themselves. */
const USER_AGENT = "Polarch/1.0 (https://polarch.day)";

export function coverUrlFor(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

/** The query as sent: trimmed, collapsed, and too short or long → null. */
export function bookQuery(raw: string | undefined): string | null {
  const q = (raw ?? "").replace(/\s+/g, " ").trim();
  return q.length >= 3 && q.length <= 120 ? q : null;
}

/** Search results → hits with a cover, first author only, no duplicates. */
export function parseOpenLibrary(body: unknown): BookHit[] {
  const docs = (body as { docs?: unknown })?.docs;
  if (!Array.isArray(docs)) return [];
  const out: BookHit[] = [];
  const seen = new Set<number>();
  for (const d of docs as Record<string, unknown>[]) {
    const coverId = d.cover_i;
    const title = typeof d.title === "string" ? d.title.trim() : "";
    if (!Number.isInteger(coverId) || (coverId as number) <= 0 || !title) continue;
    if (seen.has(coverId as number)) continue;
    seen.add(coverId as number);
    const authors = Array.isArray(d.author_name) ? d.author_name : [];
    const author = typeof authors[0] === "string" ? authors[0] : undefined;
    out.push({
      key: typeof d.key === "string" ? d.key : String(coverId),
      title: title.slice(0, 200),
      author: author?.slice(0, 120),
      year: Number.isInteger(d.first_publish_year) ? (d.first_publish_year as number) : undefined,
      coverUrl: coverUrlFor(coverId as number),
    });
    if (out.length === MAX_HITS) break;
  }
  return out;
}

export async function searchBooks(q: string, fetchImpl: typeof fetch = fetch): Promise<BookHit[]> {
  const url = `${SEARCH_URL}?${new URLSearchParams({ q, fields: FIELDS, limit: "12" })}`;
  const res = await fetchImpl(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    // The same title is looked up again and again while someone types.
    cf: { cacheTtl: 86_400, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`open library ${res.status}`);
  return parseOpenLibrary(await res.json());
}
