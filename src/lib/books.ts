import type { ArcStep } from "../types";
import { apiFetch, readApiError } from "./api";
import { DEMO } from "./demo";

/**
 * Real books for arcs, found by title through the Worker (`/api/books`,
 * backed by Open Library): the cover when there is one, and the actual
 * chapter list when an edition records it. Optional by design: an arc that
 * isn't a book never asks.
 */

export type BookHit = {
  /** The Open Library work, e.g. "/works/OL282391W". */
  key: string;
  title: string;
  author?: string;
  year?: number;
  coverUrl?: string;
};

export type BookChapters = {
  chapters: Pick<ArcStep, "label" | "read">[];
  edition: { key: string; year?: string };
};

/** The only cover URLs an arc shows; the Worker refuses to store any other. */
const COVER_URL = /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d{1,12}-[SML]\.jpg$/;

export function isCoverUrl(url: string | undefined): url is string {
  return typeof url === "string" && COVER_URL.test(url);
}

export async function searchBooks(q: string, signal?: AbortSignal): Promise<BookHit[]> {
  if (DEMO) return [];
  const res = await apiFetch(`/api/books?${new URLSearchParams({ q })}`, { method: "GET", signal });
  if (!res.ok) await readApiError(res, "book search");
  const body = (await res.json()) as { books?: BookHit[] };
  return (body.books ?? []).filter((b) => b.coverUrl === undefined || isCoverUrl(b.coverUrl));
}

/** The book's chapters from Open Library, or null when no edition lists them. */
export async function bookChapters(work: string, signal?: AbortSignal): Promise<BookChapters | null> {
  if (DEMO) return null;
  const res = await apiFetch(`/api/books/chapters?${new URLSearchParams({ work })}`, { method: "GET", signal });
  if (!res.ok) await readApiError(res, "chapters");
  const body = (await res.json()) as Partial<BookChapters> | null;
  return body?.chapters?.length && body.edition ? (body as BookChapters) : null;
}
