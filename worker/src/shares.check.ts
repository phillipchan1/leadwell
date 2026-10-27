import { PGlite } from "@electric-sql/pglite";
import { applySchema } from "./isolationDb.ts";
import { pgliteAsSql } from "./pgliteSql.ts";
import { applySync, loadTables } from "./store.ts";
import {
  ShareError,
  createShare,
  guestAddTopic,
  guestRemoveTopic,
  guestSetFollowUp,
  guestSetNote,
  guestSetTakeaway,
  listShares,
  loadShared,
  memberByToken,
  revokeShare,
  sharedWithMe,
} from "./shares.ts";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}
async function rejects(p: Promise<unknown>, status: number, msg: string) {
  try {
    await p;
    ok(false, `${msg} (did not reject)`);
  } catch (err) {
    ok(err instanceof ShareError && err.status === status, `${msg} (got ${String(err)})`);
  }
}

const phil = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-27T12:00:00Z");

const db = new PGlite();
await applySchema(db);
const sql = pgliteAsSql(db);

await applySync(sql, phil, {
  profile: { name: "Phil Chan" },
  upserts: {
    people: [
      {
        id: "p1",
        name: "Meghan Lee",
        email: "meghan@example.com",
        health: { level: "strained", note: "PRIVATE-HEALTH" },
        how_to_lead: "PRIVATE-HOWTOLEAD",
      },
    ],
    meetings: [
      {
        id: "m1",
        subject_kind: "person",
        subject_id: "p1",
        rhythm: "weekly",
        anchor_weekday: 4,
        tracker_url: "https://private.example/notes",
        curriculum: [
          { id: "growth", label: "Growth", tagId: "tg", minutes: 20 },
          { id: "work", label: "Work" },
        ],
      },
      { id: "m2", subject_kind: "person", subject_id: "p1", rhythm: "weekly" },
    ],
    one_on_ones: [
      { id: "s1", person_id: "p1", meeting_id: "m1", date: "2026-10-22", notes: "PRIVATE-NOTES" },
      { id: "s2", person_id: "p1", meeting_id: "m1", date: "2026-10-29" },
      { id: "s3", person_id: "p1", meeting_id: "m1", date: "2026-11-05", occurrence_kind: "skipped" },
      { id: "sx", person_id: "p1", meeting_id: "m2", date: "2026-10-29" },
    ],
    topics: [
      { id: "t1", meeting_id: "m1", text: "Budget sign-off", session_id: "s2", status: "open", lane: "backlog", urgent: false, carried: 0, sort_order: 0, is_private: false },
      { id: "t2", meeting_id: "m1", text: "PRIVATE-LOCKED", session_id: "s2", status: "open", lane: "backlog", urgent: false, carried: 0, sort_order: 1, is_private: true },
      { id: "t3", meeting_id: "m1", text: "PRIVATE-TRAY", status: "open", lane: "backlog", urgent: false, carried: 0, sort_order: 2, is_private: false },
      { id: "t4", meeting_id: "m2", text: "PRIVATE-OTHER-MEETING", session_id: "sx", status: "open", lane: "backlog", urgent: false, carried: 0, sort_order: 0 },
    ],
    follow_ups: [
      { id: "f1", subject_kind: "person", subject_id: "p1", meeting_id: "m1", text: "Send budget", status: "open", opened_on: "2026-10-22", sort_order: 0 },
      { id: "f2", subject_kind: "person", subject_id: "p1", meeting_id: "m1", text: "Try: ask what you want", status: "open", opened_on: "2026-10-22", sort_order: 1, owner: "both" },
      { id: "f3", subject_kind: "person", subject_id: "p1", meeting_id: "m1", text: "PRIVATE-FOLLOWUP", status: "open", opened_on: "2026-10-22", sort_order: 2, is_private: true, owner: "both" },
    ],
    arcs: [
      {
        id: "a1",
        meeting_id: "m1",
        title: "Crucial Conversations",
        pace_every: 1,
        starts_on: "2026-10-01",
        status: "active",
        steps: [
          { id: "st1", label: "Ch. 1", prompts: [], status: "done", coveredIn: ["s1"] },
          { id: "st2", label: "Ch. 2", prompts: ["Where do you go first?"], status: "upcoming", coveredIn: [] },
        ],
        sort_order: 0,
      },
    ],
  },
});

// Owner: share, list, and the stale-client guard.
const share = await createShare(sql, phil, { meetingId: "m1", email: "Meghan@Example.com", name: "Meghan Lee", personId: "p1" });
ok(share.email === "meghan@example.com", "email is normalised");
ok(share.token.length >= 40, "token is long");
await rejects(createShare(sql, other, { meetingId: "m1", email: "x@example.com" }), 404, "cannot share someone else's meeting");
await rejects(createShare(sql, phil, { meetingId: "m1", email: "nope" }), 400, "rejects a bad email");
const again = await createShare(sql, phil, { meetingId: "m1", email: "meghan@example.com" });
ok(again.id === share.id && again.token === share.token, "re-sharing keeps the same live link");
ok((await listShares(sql, phil)).length === 1, "owner lists one share");
ok((await listShares(sql, other)).length === 0, "nobody else sees it");

const member = await memberByToken(sql, share.token);
ok(member?.meetingId === "m1" && member.ownerId === phil, "token resolves to the meeting");
ok((await memberByToken(sql, "short")) === null, "malformed token resolves to nothing");

// Guest read: the room and nothing else.
const doc = await loadShared(sql, member!, now);
const text = JSON.stringify(doc);
ok(!text.includes("PRIVATE"), `shared page leaks nothing private: ${text.match(/PRIVATE-[A-Z-]+/g)}`);
ok(!text.includes("private.example"), "tracker link stays private");
ok(!text.includes('"tg"'), "tag ids stay private");
const topics = doc.topics as { id: string }[];
ok(topics.length === 1 && topics[0].id === "t1", "only placed, unlocked topics of this meeting");
const fus = doc.followUps as { id: string }[];
ok(fus.map((f) => f.id).sort().join() === "f1,f2", "locked follow-ups stay off");
ok((doc.arcs as unknown[]).length === 1, "the arc is shared");
ok((doc.meeting as { subjectName: string }).subjectName === "Meghan Lee", "subject name is there");
ok((doc.owner as { name: string }).name === "Phil Chan", "owner name is there");

// Guest writes.
const added = await guestAddTopic(sql, member!, { text: "Q4 volunteer schedule", date: "2026-10-29", slotId: "work" }, now);
ok(added.sessionId === "s2", "adding to a booked week uses that occurrence");
const booked = await guestAddTopic(sql, member!, { text: "Christmas Eve roles", date: "2026-11-12", slotId: "growth" }, now);
ok(booked.sessionId !== "s2", "adding to a projected week books it");
await rejects(guestAddTopic(sql, member!, { text: "x", date: "2026-11-05" }, now), 409, "a skipped week can't take items");
await rejects(guestAddTopic(sql, member!, { text: "", date: "2026-10-29" }, now), 400, "empty text is refused");
await rejects(guestAddTopic(sql, member!, { text: "x", date: "2020-01-01" }, now), 400, "past dates are refused");

await guestSetFollowUp(sql, member!, "f2", true, now);
await rejects(guestSetFollowUp(sql, member!, "f1", true, now), 403, "the owner's own follow-up isn't the guest's to tick");
await rejects(guestSetFollowUp(sql, member!, "f3", true, now), 403, "a locked follow-up can't be ticked");
await guestSetTakeaway(sql, member!, "st2", { text: "Ask before, not during." }, now);
await rejects(guestSetTakeaway(sql, member!, "nope", { text: "x" }, now), 404, "takeaways only on real steps");
await guestSetNote(sql, member!, "s2", { body: "We agreed on two Sundays." }, now);
await rejects(guestSetNote(sql, member!, "sx", { body: "x" }, now), 404, "notes only on this meeting's occurrences");
await guestRemoveTopic(sql, member!, added.id);
await rejects(guestRemoveTopic(sql, member!, "t1"), 404, "can't remove what the owner raised");

// The owner sees all of it through the ordinary load.
const ownerDoc = await loadTables(sql, phil);
const ownerTopics = ownerDoc.tables.topics as { id: string; raised_by: string | null; slot_id: string | null; tag_ids: string[] }[];
const christmas = ownerTopics.find((t) => t.id === booked.id);
ok(christmas?.raised_by === member!.id, "owner sees who raised it");
ok(christmas?.slot_id === "growth" && christmas.tag_ids.includes("tg"), "slot stamps its tag");
ok(!ownerTopics.some((t) => t.id === added.id), "removed topic is gone");
ok((ownerDoc.tables.follow_ups as { id: string; status: string }[]).find((f) => f.id === "f2")?.status === "done", "owner sees the tick");
ok((ownerDoc.tables.arc_takeaways as unknown[]).length === 1, "owner sees the takeaway");
ok((ownerDoc.tables.shared_notes as unknown[]).length === 1, "owner sees the shared note");
ok(!(ownerDoc.tables as Record<string, unknown>).meeting_members, "shares never ride along in /api/data");

// A stale client's upsert can't unlock a private topic.
await applySync(sql, phil, {
  upserts: { topics: [{ id: "t2", meeting_id: "m1", text: "PRIVATE-LOCKED", session_id: "s2", status: "open", lane: "backlog", urgent: false, carried: 0, sort_order: 1 }] },
});
const t2 = ((await loadTables(sql, phil)).tables.topics as { id: string; is_private: boolean }[]).find((t) => t.id === "t2");
ok(t2?.is_private === true, "an upsert without is_private leaves it locked");

// Phase 3: her own workspace finds it by email.
const mine = await sharedWithMe(sql, "MEGHAN@example.com");
ok(mine.length === 1 && mine[0].meetingName === "1:1 with Phil Chan", `shared-with-me names it from her side (${JSON.stringify(mine)})`);

// Revoke kills the link.
ok(await revokeShare(sql, phil, share.id), "owner can revoke");
ok((await memberByToken(sql, share.token)) === null, "revoked link stops working");
ok((await sharedWithMe(sql, "meghan@example.com")).length === 0, "revoked share leaves her sidebar");
const back = await createShare(sql, phil, { meetingId: "m1", email: "meghan@example.com" });
ok(back.id === share.id && back.token !== share.token, "re-inviting after revoke issues a new link");

await sql.end();

if (fails.length) {
  console.error(`shares.check: ${fails.length}/${checks} failed`);
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log(`shares.check: ${checks} checks passed`);
