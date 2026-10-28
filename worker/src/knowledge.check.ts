/**
 * Prove the knowledge tables (009_knowledge.sql) behave like every other
 * owner-scoped table, against the real migrations in PGlite:
 * - glossary, fixtures and knowledge rows sync in and load back out
 * - another user sees none of them, and can't delete them
 * - the owner can delete them
 * - the schema refuses a cadence or kind the app doesn't know
 */
import { PGlite } from "@electric-sql/pglite";
import { applySchema } from "./isolationDb.ts";
import { pgliteAsSql } from "./pgliteSql.ts";
import { applySync, loadTables } from "./store.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const a = "11111111-1111-1111-1111-111111111111";
const b = "22222222-2222-2222-2222-222222222222";

const db = new PGlite();
await applySchema(db);
const sql = pgliteAsSql(db);

await applySync(sql, a, {
  profile: { name: "Phil" },
  upserts: {
    glossary: [{ id: "g1", heard: "Alayna", meant: "Elena", created_on: "2026-10-27" }],
    fixtures: [
      {
        id: "f1",
        subject_kind: "team",
        subject_id: "t1",
        title: "Sunday setup",
        owner: "Elena",
        cadence: "weekly",
        last_touched_on: "2026-10-26",
        created_on: "2026-10-01",
        sort_order: 0,
      },
    ],
    knowledge: [
      {
        id: "k1",
        subject_kind: "person",
        subject_id: "p1",
        kind: "decision",
        text: "Elena owns setup from November.",
        session_id: "s1",
        noted_on: "2026-10-27",
        pinned: true,
      },
    ],
  },
});

const mine = await loadTables(sql, a);
ok(mine.tables.glossary?.[0]?.meant === "Elena", "glossary loads back");
ok(mine.tables.fixtures?.[0]?.cadence === "weekly", "fixture loads back");
ok(mine.tables.knowledge?.[0]?.pinned === true, "knowledge loads back, pinned");

const theirs = await loadTables(sql, b);
ok(!(theirs.tables.glossary ?? []).length, "another user sees no glossary");
ok(!(theirs.tables.fixtures ?? []).length, "another user sees no fixtures");
ok(!(theirs.tables.knowledge ?? []).length, "another user sees no knowledge");

await applySync(sql, b, { deletes: { glossary: ["g1"], fixtures: ["f1"], knowledge: ["k1"] } });
const still = await loadTables(sql, a);
ok(
  still.tables.glossary?.length === 1 && still.tables.fixtures?.length === 1 && still.tables.knowledge?.length === 1,
  "another user's delete touches nothing"
);

await applySync(sql, a, { deletes: { knowledge: ["k1"] } });
ok(!((await loadTables(sql, a)).tables.knowledge ?? []).length, "the owner can delete");

let refused = false;
try {
  await applySync(sql, a, {
    upserts: {
      fixtures: [{ id: "f2", subject_kind: "team", subject_id: "t1", title: "x", cadence: "daily", sort_order: 1 }],
    },
  });
} catch {
  refused = true;
}
ok(refused, "an unknown cadence is refused");

await sql.end();

if (fails.length) {
  console.error(`knowledge.check: ${fails.length} of ${checks} failed`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`knowledge.check: ${checks} checks passed`);
