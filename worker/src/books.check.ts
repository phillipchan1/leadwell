import { PGlite } from "@electric-sql/pglite";
import { applySchema } from "./isolationDb.ts";
import { pgliteAsSql } from "./pgliteSql.ts";
import { applySync, loadTables } from "./store.ts";
import { bestChapters, bookQuery, chaptersFromToc, coverUrlFor, parseOpenLibrary, searchBooks, workId } from "./books.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

// The query.
ok(bookQuery("  crucial   conversations ") === "crucial conversations", "query is trimmed and collapsed");
ok(bookQuery("ab") === null, "two letters is too short to look up");
ok(bookQuery("x".repeat(161)) === null, "an essay is not a title");
ok(bookQuery(undefined) === null, "no query, no lookup");

// Parsing an Open Library search response (shape as of Oct 2026).
const sample = {
  numFound: 129,
  docs: [
    { key: "/works/OL282391W", title: "Crucial Conversations", author_name: ["Kerry Patterson", "Joseph Grenny"], cover_i: 1711809, first_publish_year: 2001 },
    { key: "/works/OL28924368W", title: "Crucial Conversations", author_name: ["Sunny Chien"], first_publish_year: 2022 },
    { key: "/works/OL84216W", title: "Crucial conversations", author_name: ["May Sarton"], cover_i: 5385552, first_publish_year: 1975 },
    { key: "/works/OL9001W", title: "Same cover again", cover_i: 1711809 },
    { key: "/works/OL9002W", title: "Bad id", cover_i: "1; drop" },
    { key: "/works/OL9003W", title: "Negative id", cover_i: -1 },
    { key: "/works/OL9004W", title: "Three", cover_i: 3 },
    { key: "/works/OL9005W", title: "Four", cover_i: 4 },
    { key: "/works/OL9006W", title: "Five", cover_i: 5 },
  ],
};
const hits = parseOpenLibrary(sample);
ok(hits.length === 5, `at most five hits (got ${hits.length})`);
ok(hits[0].title === "Crucial Conversations" && hits[0].author === "Kerry Patterson", "first author only");
ok(hits[0].year === 2001, "first published year");
ok(hits[0].coverUrl === "https://covers.openlibrary.org/b/id/1711809-M.jpg", "cover URL is rebuilt from the id");
ok(!hits.some((h) => h.key === "/works/OL9001W"), "the same cover twice is shown once");
const coverless = parseOpenLibrary({ docs: [{ key: "/works/OL1W", title: "Rare Book" }, { key: "/works/OL2W", title: "Has Cover", cover_i: 9 }] });
ok(coverless.length === 2 && coverless[0].title === "Has Cover", "a book without a cover still comes back, after those with one");
ok(coverless[1].coverUrl === undefined, "and keeps no cover");
ok(parseOpenLibrary({ docs: [{ key: "javascript:alert(1)", title: "x", cover_i: 1 }] }).length === 0, "only Open Library work keys");
const translated = parseOpenLibrary({
  docs: [
    {
      key: "/works/OL1835386W",
      title: "Las cinco disfunciones de un equipo",
      cover_i: 10863273,
      editions: { docs: [{ key: "/books/OL1M", title: "Five Dysfunctions of a Team", language: ["eng"], cover_i: 13296514 }] },
    },
  ],
});
ok(translated[0].title === "Five Dysfunctions of a Team", "an English edition's title wins over a translation");
ok(translated[0].coverUrl === coverUrlFor(13296514), "and its cover");
ok(workId("/works/OL282391W") === "OL282391W" && workId("OL282391W") === "OL282391W", "work ids");
ok(workId("/works/../admin") === null && workId("OL1M") === null, "anything else is refused");
ok(parseOpenLibrary({}).length === 0 && parseOpenLibrary(null).length === 0, "no docs, no hits");
ok(coverUrlFor(42) === "https://covers.openlibrary.org/b/id/42-M.jpg", "cover URL shape");

// The fetch: identifies itself, and a failure throws rather than returning junk.
let seen: { url: string; ua: string | null } | null = null;
const fakeFetch = (async (url: string, init?: RequestInit) => {
  seen = { url, ua: new Headers(init?.headers).get("user-agent") };
  return new Response(JSON.stringify(sample), { status: 200 });
}) as unknown as typeof fetch;
const live = await searchBooks("crucial conversations", fakeFetch);
ok(live.length === 5, "search returns parsed hits");
ok(seen!.url.startsWith("https://openlibrary.org/search.json?") && seen!.url.includes("q=crucial+conversations"), "searches Open Library");
ok(Boolean(seen!.ua?.startsWith("Polarch/")), "sends a User-Agent, as Open Library asks");
const calls: string[] = [];
const emptyThenTitle = (async (url: string) => {
  calls.push(url);
  const body = url.includes("title=") ? sample : { docs: [] };
  return new Response(JSON.stringify(body), { status: 200 });
}) as unknown as typeof fetch;
const second = await searchBooks("crucial conversations", emptyThenTitle);
ok(second.length === 5 && calls.length === 2 && calls[1].includes("title=crucial"), "a miss retries as a title search");
const down = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
let threw = false;
try {
  await searchBooks("anything", down);
} catch {
  threw = true;
}
ok(threw, "an Open Library outage throws");

// Chapters from an edition's table of contents (Crucial Conversations, 2002, as Open Library has it).
const toc2002 = [
  { level: 0, label: "", title: "Foreword", pagenum: "xi" },
  { level: 0, label: "", title: "Acknowledgments", pagenum: "xv" },
  { level: 0, label: "Ch. 1", title: "What's a Crucial Conversation?: And Who Cares?", pagenum: "1" },
  { level: 0, label: "Ch. 2", title: "Mastering Crucial Conversations: The Power of Dialogue", pagenum: "17" },
  { level: 0, label: "Ch. 3", title: "Start with Heart: How to Stay Focused on What You Really Want", pagenum: "27" },
  { level: 0, label: "Ch. 4", title: "Learn to Look: How to Notice When Safety Is at Risk", pagenum: "45" },
  { level: 0, label: "", title: "Index", pagenum: "233" },
];
const ch = chaptersFromToc(toc2002);
ok(ch.length === 4, `front and back matter dropped (got ${ch.length})`);
ok(ch[0].label === "Ch. 1 · What's a Crucial Conversation?", `label is the chapter's main title (got ${ch[0].label})`);
ok(ch[0].read === "pp. 1–16", `pages from the next chapter's start (got ${ch[0].read})`);
ok(ch[3].read === "pp. 45–232", "the last chapter runs to the next entry");
const tocLower = [
  { level: 0, title: "What's a crucial conversation? : and who cares?" },
  { level: 0, title: "Mastering crucial conversations : the power of dialogue" },
  { level: 0, title: "Start with heart : how to stay focused on what you really want" },
];
const chLower = chaptersFromToc(tocLower);
ok(chLower[0].label === "Ch. 1 · What's a crucial conversation?" && chLower[2].label === "Ch. 3 · Start with heart", "unlabelled chapters are numbered and sentence-cased");
ok(chLower[0].read === "Ch. 1", "no pages, so read the chapter");
const parts = [
  { level: 0, title: "Part One: Foundations" },
  { level: 1, title: "Chapter 1: Trust" },
  { level: 1, title: "Chapter 2: Conflict" },
  { level: 1, title: "Chapter 3: Commitment" },
];
ok(chaptersFromToc(parts).map((c) => c.label).join("|") === "Ch. 1 · Trust|Ch. 2 · Conflict|Ch. 3 · Commitment", "parts above chapters: the chapters are the steps");
ok(chaptersFromToc([{ title: "Introduction" }, { title: "One" }]).length === 0, "too short to be a book's chapters");
const catalogue = chaptersFromToc([
  { title: "Introduction --" },
  { title: "The fable --" },
  { title: "Luck ;" },
  { title: "Part I. What are boundaries? A day in a boundaryless life" },
]);
ok(catalogue.map((c) => c.label).join("|") === "Introduction|Ch. 1 · The fable|Ch. 2 · Luck|Ch. 3 · What are boundaries? A day in a boundaryless life", `catalogue punctuation and part headings are cleaned (got ${catalogue.map((c) => c.label).join("|")})`);
ok(chaptersFromToc("nope").length === 0 && chaptersFromToc(null).length === 0, "garbage in, nothing out");
const best = bestChapters({
  entries: [
    { key: "/books/ES", languages: [{ key: "/languages/spa" }], table_of_contents: toc2002, publish_date: "2015" },
    { key: "/books/OLD", languages: [{ key: "/languages/eng" }], table_of_contents: tocLower, publish_date: "2012" },
    { key: "/books/NEW", languages: [{ key: "/languages/eng" }], table_of_contents: toc2002, publish_date: "2002" },
    { key: "/books/NONE", languages: [{ key: "/languages/eng" }] },
  ],
});
ok(best?.edition.key === "/books/NEW" && best.edition.year === "2002", `English, then most chapters (got ${best?.edition.key})`);
ok(bestChapters({ entries: [{ key: "/books/X" }] }) === null && bestChapters({}) === null, "no contents anywhere → null");

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
      arc("apple", { cover_url: "https://is1-ssl.mzstatic.com/image/thumb/Publication221/v4/b7/28/e8/b728e8ea/cover.jpg/600x600bb.jpg" }),
      arc("appleish", { cover_url: "https://is1-ssl.mzstatic.com.evil.example/image/thumb/x/600x600bb.jpg" }),
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
ok(stored.apple?.startsWith("https://is1-ssl.mzstatic.com/") === true, "an Apple Books cover is stored");
ok(stored.appleish === null, "an Apple look-alike is dropped");
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
