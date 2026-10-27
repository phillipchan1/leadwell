import type { ArcStep } from "../types";
import { apiFetch, readApiError } from "./api";
import { DEMO } from "./demo";
import { isCoverUrl, mergeBooks, parseAppleBooks, type BookHit } from "./bookMatch";

export { isCoverUrl, type BookHit };

/**
 * Real books for arcs: the cover when there is one, and the actual chapter
 * list when an edition records it. Optional by design: an arc that isn't a
 * book never asks.
 *
 * Two sources, searched together:
 *  - Open Library, through the Worker (`/api/books`): free and open, the only
 *    one with chapter lists, but volunteer-catalogued, so recent books are
 *    often missing.
 *  - Apple Books, straight from the browser: has new releases within days.
 *    Apple rate-limits Cloudflare's shared addresses (as Google does), so the
 *    Worker can't ask it; a browser asking for itself is well inside its
 *    limits, and only the typed title is sent.
 */

export type BookChapters = {
  chapters: Pick<ArcStep, "label" | "read">[];
  edition: { key: string; year?: string };
};

/** Open Library has chapters to look up; Apple Books doesn't. */
export const hasChapterSource = (hit: Pick<BookHit, "key">) => hit.key.startsWith("/works/");

async function searchOpenLibrary(q: string, signal?: AbortSignal): Promise<BookHit[]> {
  const res = await apiFetch(`/api/books?${new URLSearchParams({ q })}`, { method: "GET", signal });
  if (!res.ok) await readApiError(res, "book search");
  const body = (await res.json()) as { books?: BookHit[] };
  return body.books ?? [];
}

async function searchAppleBooks(q: string, signal?: AbortSignal): Promise<BookHit[]> {
  const params = new URLSearchParams({ term: q, media: "ebook", entity: "ebook", limit: "6", country: "us" });
  const res = await fetch(`https://itunes.apple.com/search?${params}`, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(`apple books ${res.status}`);
  return parseAppleBooks(await res.json());
}

export async function searchBooks(q: string, signal?: AbortSignal): Promise<BookHit[]> {
  if (DEMO) return [];
  const [ol, apple] = await Promise.allSettled([searchOpenLibrary(q, signal), searchAppleBooks(q, signal)]);
  if (ol.status === "rejected" && apple.status === "rejected") throw ol.reason;
  const keep = (hits: BookHit[]) => hits.filter((b) => b.coverUrl === undefined || isCoverUrl(b.coverUrl));
  return mergeBooks(
    q,
    keep(ol.status === "fulfilled" ? ol.value : []),
    keep(apple.status === "fulfilled" ? apple.value : [])
  );
}

/** The book's chapters from Open Library, or null when no edition lists them. */
export async function bookChapters(work: string, signal?: AbortSignal): Promise<BookChapters | null> {
  if (DEMO) return null;
  const res = await apiFetch(`/api/books/chapters?${new URLSearchParams({ work })}`, { method: "GET", signal });
  if (!res.ok) await readApiError(res, "chapters");
  const body = (await res.json()) as Partial<BookChapters> | null;
  return body?.chapters?.length && body.edition ? (body as BookChapters) : null;
}
