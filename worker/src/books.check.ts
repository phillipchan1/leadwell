import { PGlite } from "@electric-sql/pglite";
import { applySchema } from "./isolationDb.ts";
import { pgliteAsSql } from "./pgliteSql.ts";
import { applySync, loadTables } from "./store.ts";
import { bookQuery, coverUrlFor, parseOpenLibrary, searchBooks } from "./books.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

// The query.
ok(bookQuery("  crucial   conversations ") === "crucial conversations", "query is trimmed and collapsed");
ok(bookQuery("ab") === null, "two letters is too short to look up");
ok(bookQuery("x".repeat(121)) === null, "an essay is not a title");
ok(bookQuery(undefined) === null, "no query, no lookup");

// Parsing an Open Library search response (shape as of Oct 2026).
const sample = {
  numFound: 129,
  docs: [
    { key: "/works/OL282391W", title: "Crucial Conversations", author_name: ["Kerry Patterson", "Joseph Grenny"], cover_i: 1711809, first_publish_year: 2001 },
    { key: "/works/OL28924368W", title: "Crucial Conversations", author_name: ["Sunny Chien"], first_publish_year: 2022 },
    { key: "/works/OL84216W", title: "Crucial conversations", author_name: ["May Sarton"], cover_i: 5385552, first_publish_year: 1975 },
    { key: "/works/DUP", title: "Same cover again", cover_i: 1711809 },
    { key: "/works/BAD", title: "Bad id", cover_i: "1; drop" },
    { key: "/works/NEG", title: "Negative id", cover_i: -1 },
    { key: "/works/X1", title: "Three", cover_i: 3 },
    { key: "/works/X2", title: "Four", cover_i: 4 },
    { key: "/works/X3", title: "Five", cover_i: 5 },
  ],
};
const hits = parseOpenLibrary(sample);
ok(hits.length === 4, `at most four hits (got ${hits.length})`);
ok(hits[0].title === "Crucial Conversations" && hits[0].author === "Kerry Patterson", "first author only");
ok(hits[0].year === 2001, "first published year");
ok(hits[0].coverUrl === "https://covers.openlibrary.org/b/id/1711809-M.jpg", "cover URL is rebuilt from the id");
ok(!hits.some((h) => h.key === "/works/OL28924368W"), "a book with no cover is skipped");
ok(!hits.some((h) => h.key === "/works/DUP"), "the same cover twice is shown once");
ok(!hits.some((h) => h.key === "/works/BAD" || h.key === "/works/NEG"), "a malformed cover id is skipped");
ok(parseOpenLibrary({}).length === 0 && parseOpenLibrary(null).length === 0, "no docs, no hits");
ok(coverUrlFor(42) === "https://covers.openlibrary.org/b/id/42-M.jpg", "cover URL shape");

// The fetch: identifies itself, and a failure throws rather than returning junk.
let seen: { url: string; ua: string | null } | null = null;
const fakeFetch = (async (url: string, init?: RequestInit) => {
  seen = { url, ua: new Headers(init?.headers).get("user-agent") };
  return new Response(JSON.stringify(sample), { status: 200 });
}) as unknown as typeof fetch;
const live = await searchBooks("crucial conversations", fakeFetch);
ok(live.length === 4, "search returns parsed hits");
ok(seen!.url.startsWith("https://openlibrary.org/search.json?") && seen!.url.includes("q=crucial+conversations"), "searches Open Library");
ok(Boolean(seen!.ua?.startsWith("Polarch/")), "sends a User-Agent, as Open Library asks");
const down = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
let threw = false;
try {
  await searchBooks("anything", down);
} catch {
  threw = true;
}
ok(threw, "an Open Library outage throws");

// Storage: only Open Library covers are kept, and an old client can't wipe one.
const db = new PGlite();
await applySchema(db);
const sql = pgliteAsSql(db);
const user = "11111111-1111-1111-1111-111111111111";
const arc = (id: string, extra: Record<string, unknown>) => ({
  id,
  meeting_id: "m1",
  title: "Crucial Conversations",
  pace_every: 1,
  starts_on: "2026-10-01",
  status: "active",
  steps: [],
  sort_order: 0,
  ...extra,
});
await applySync(sql, user, {
  upserts: {
    arcs: [
      arc("good", { cover_url: "https://covers.openlibrary.org/b/id/1711809-M.jpg" }),
      arc("pixel", { cover_url: "https://tracker.example/p.gif" }),
      arc("lookalike", { cover_url: "https://covers.openlibrary.org.evil.example/b/id/1-M.jpg" }),
      arc("none", {}),
    ],
  },
});
const coverOf = async () =>
  Object.fromEntries(((await loadTables(sql, user)).tables.arcs as { id: string; cover_url: string | null }[]).map((r) => [r.id, r.cover_url]));
let stored = await coverOf();
ok(stored.good === "https://covers.openlibrary.org/b/id/1711809-M.jpg", "an Open Library cover is stored");
ok(stored.pixel === null, "any other URL is dropped");
ok(stored.lookalike === null, "a look-alike host is dropped");
ok(stored.none === null, "no cover is fine");

// A tab still on the previous build upserts the arc without cover_url.
await applySync(sql, user, { upserts: { arcs: [arc("good", { title: "Crucial Conversations (2nd ed.)" })] } });
stored = await coverOf();
ok(stored.good === "https://covers.openlibrary.org/b/id/1711809-M.jpg", "a stale client keeps the cover");
// Removing it on purpose sends null.
await applySync(sql, user, { upserts: { arcs: [arc("good", { cover_url: null })] } });
stored = await coverOf();
ok(stored.good === null, "clearing the cover on purpose clears it");

await sql.end();

if (fails.length) {
  console.error(`books.check: ${fails.length}/${checks} failed`);
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log(`books.check: ${checks} checks passed`);
