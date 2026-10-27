import { apiGet, readApiError } from "./api";
import { DEMO } from "./demo";

/**
 * Real covers for book arcs, found by title through the Worker
 * (`/api/books`, backed by Open Library). Optional by design: an arc that
 * isn't a book never asks.
 */

export type BookHit = {
  key: string;
  title: string;
  author?: string;
  year?: number;
  coverUrl: string;
};

/** The only cover URLs an arc shows; the Worker refuses to store any other. */
const COVER_URL = /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d{1,12}-[SML]\.jpg$/;

export function isCoverUrl(url: string | undefined): url is string {
  return typeof url === "string" && COVER_URL.test(url);
}

export async function searchBooks(q: string): Promise<BookHit[]> {
  if (DEMO) return [];
  const res = await apiGet(`/api/books?${new URLSearchParams({ q })}`);
  if (!res.ok) await readApiError(res, "book search");
  const body = (await res.json()) as { books?: BookHit[] };
  return (body.books ?? []).filter((b) => isCoverUrl(b.coverUrl));
}
