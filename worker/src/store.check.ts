import { PGlite } from "@electric-sql/pglite";
import { applySchema } from "./isolationDb.ts";
import { pgliteAsSql } from "./pgliteSql.ts";
import { applySync, loadTables, wipeUser } from "./store.ts";

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
  profile: { name: "Phil", title: "Lead" },
  upserts: {
    teams: [{ id: "t1", name: "Frontier", capacity_id: "c1", sort_order: 0 }],
    people: [{ id: "p1", name: "Ada", team_id: "t1", clifton_top5: ["Learner"] }],
  },
});

const loadedA = await loadTables(sql, a);
ok(loadedA.profile?.name === "Phil", "owner can read their profile");
ok(loadedA.tables.teams?.length === 1, "owner sees their team");
ok(loadedA.tables.people?.[0]?.name === "Ada", "owner sees their person");

const loadedB = await loadTables(sql, b);
ok(loadedB.profile == null, "other user has no profile");
ok((loadedB.tables.teams ?? []).length === 0, "other user cannot see teams");
ok((loadedB.tables.people ?? []).length === 0, "other user cannot see people");

await applySync(sql, b, {
  deletes: { teams: ["t1"], people: ["p1"] },
});
const stillA = await loadTables(sql, a);
ok(stillA.tables.teams?.length === 1, "other user cannot delete owner rows");

await applySync(sql, a, {
  upserts: { teams: [{ id: "t1", name: "Frontier II", capacity_id: "c1", sort_order: 1 }] },
  deletes: { people: ["p1"] },
});
const after = await loadTables(sql, a);
ok(after.tables.teams?.[0]?.name === "Frontier II", "owner upsert updates the row");
ok((after.tables.people ?? []).length === 0, "owner delete removes the person");

let unknownThrew = false;
try {
  await applySync(sql, a, { upserts: { not_a_table: [{ id: "x" }] } });
} catch {
  unknownThrew = true;
}
ok(unknownThrew, "unknown table is rejected");

await wipeUser(sql, b);
const afterWipeB = await loadTables(sql, a);
ok(afterWipeB.tables.teams?.length === 1, "wiping another user leaves owner data");

await wipeUser(sql, a);
const empty = await loadTables(sql, a);
ok(empty.profile == null, "wipe removes profile");
ok((empty.tables.teams ?? []).length === 0, "wipe removes teams");

if (fails.length) {
  console.error(`${fails.length}/${checks} failed`);
  for (const f of fails) console.error("  -", f);
  process.exit(1);
}
console.log(`store.check: ${checks} ok`);
