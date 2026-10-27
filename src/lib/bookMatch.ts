/**
 * Book search results, without the network: parsing Apple's answers, ranking
 * by what was typed, and the covers an arc may show. Pure, so it runs in the
 * checks.
 */

export type BookHit = {
  /** "/works/OL282391W" for Open Library (chapters are looked up by it), "apple:<id>" for Apple Books. */
  key: string;
  title: string;
  author?: string;
  year?: number;
  coverUrl?: string;
};

/** The only cover URLs an arc shows; the Worker refuses to store any other. */
const COVER_URL =
  /^https:\/\/(?:covers\.openlibrary\.org\/b\/id\/\d{1,12}-[SML]\.jpg|is\d{1,2}-ssl\.mzstatic\.com\/image\/thumb\/[A-Za-z0-9._\-/]{1,400}\/\d{2,4}x\d{2,4}bb\.(?:jpg|png))$/;

export function isCoverUrl(url: string | undefined): url is string {
  return typeof url === "string" && COVER_URL.test(url);
}

/** Apple's search results → hits, with the cover asked for at a size worth showing. */
export function parseAppleBooks(body: unknown): BookHit[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return (results as Record<string, unknown>[]).flatMap((r) => {
    const id = r.trackId;
    const title = typeof r.trackName === "string" ? r.trackName.trim() : "";
    if (!Number.isInteger(id) || !title) return [];
    const art = typeof r.artworkUrl100 === "string" ? r.artworkUrl100.replace(/\/\d{2,4}x\d{2,4}bb\.(jpg|png)$/, "/600x600bb.$1") : undefined;
    const year = typeof r.releaseDate === "string" ? Number(r.releaseDate.slice(0, 4)) || undefined : undefined;
    return [
      {
        key: `apple:${id}`,
        title: title.slice(0, 200),
        author: typeof r.artistName === "string" ? r.artistName.slice(0, 120) : undefined,
        year,
        coverUrl: isCoverUrl(art) ? art : undefined,
      },
    ];
  });
}

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
const sameBook = (a: BookHit, b: BookHit) =>
  words(a.title).join(" ") === words(b.title).join(" ") &&
  (words(a.author ?? "").pop() ?? "") === (words(b.author ?? "").pop() ?? "");

/** How much of what was typed the book accounts for, title and author together. */
export function matchScore(hit: Pick<BookHit, "title" | "author">, q: string): number {
  const typed = words(q);
  if (!typed.length) return 0;
  const have = new Set(words(`${hit.title} ${hit.author ?? ""}`));
  return typed.filter((w) => have.has(w)).length / typed.length;
}

/**
 * Both sources, best match first. Open Library wins a tie (it may have the
 * chapters), the same book from both shows once, and anything that matches
 * less than half of what was typed is left out rather than shown as a guess.
 */
export function mergeBooks(q: string, openLibrary: BookHit[], apple: BookHit[]): BookHit[] {
  const merged = [...openLibrary, ...apple.filter((a) => !openLibrary.some((o) => sameBook(o, a)))];
  return merged
    .map((hit, order) => ({ hit, order, score: matchScore(hit, q) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score || Number(Boolean(b.hit.coverUrl)) - Number(Boolean(a.hit.coverUrl)) || a.order - b.order)
    .slice(0, 6)
    .map((x) => x.hit);
}
