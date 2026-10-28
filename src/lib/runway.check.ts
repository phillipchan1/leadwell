/**
 * Runway, proven:
 * - cover runs to the first empty meeting, not the furthest full one
 * - it's measured in days, so rhythms compare on one axis
 * - sections filled shade a week without changing whether it counts
 */
import { formatAhead, runwayLevel, runwayOf } from "./runway";
import type { Session, Topic, TrackedMeeting } from "../types";

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const today = "2026-10-28"; // a Wednesday
const weekly: TrackedMeeting = {
  id: "m1",
  subjectKind: "team",
  subjectId: "t1",
  rhythm: "weekly",
  anchorWeekday: 4,
};
// Last met Thursday the 22nd, so the next is tomorrow and then every Thursday.
const held: Session = { id: "s0", meetingId: "m1", date: "2026-10-22" };

let n = 0;
function topic(sessionId: string | undefined, extra: Partial<Topic> = {}): Topic {
  n++;
  return {
    id: `x${n}`,
    meetingId: "m1",
    text: `topic ${n}`,
    tagIds: [],
    status: "open",
    lane: "backlog",
    sessionId,
    carried: 0,
    carriedFrom: [],
    createdOn: today,
    order: n,
    ...extra,
  };
}
const on = (id: string, date: string): Session => ({ id, meetingId: "m1", date });

// ── Nothing planned ─────────────────────────────────────────────────────────
{
  const r = runwayOf(weekly, [held], [], today);
  ok(r.marks.length === 12, `a weekly meeting shows 12 weeks (got ${r.marks.length})`);
  ok(r.marks[0].date === "2026-10-29", `the first mark is tomorrow (got ${r.marks[0]?.date})`);
  ok(r.ahead === 0 && r.through === null, "nothing planned, nothing ahead");
  ok(r.gap === "2026-10-29" && r.days === 1, "the gap is the next meeting");
  ok(r.level === "bare", `tomorrow empty is bare (got ${r.level})`);
  ok(formatAhead(r) === "none", "nothing ahead reads none");
}

// ── Three weeks planned, then a hole, then week six ─────────────────────────
{
  const sessions = [
    held,
    on("a", "2026-10-29"),
    on("b", "2026-11-05"),
    on("c", "2026-11-12"),
    on("f", "2026-12-03"),
  ];
  const topics = [topic("a"), topic("b"), topic("c"), topic("f"), topic(undefined)];
  const r = runwayOf(weekly, sessions, topics, today);
  ok(r.ahead === 3, `three in a row (got ${r.ahead})`);
  ok(r.through === "2026-11-12", "planned through the 12th");
  ok(r.gap === "2026-11-19", "the hole on the 19th caps it, not the full week after");
  ok(r.days === 22 && r.level === "thin", `22 days is thin (got ${r.days}, ${r.level})`);
  ok(r.marks.filter((m) => m.planned).length === 4, "week six still draws as planned");
  ok(r.waiting === 1, "the unplaced idea is waiting");
  ok(formatAhead(r) === "3 ahead", `reads 3 ahead (got ${formatAhead(r)})`);
}

// ── A dropped topic doesn't plan a week ─────────────────────────────────────
{
  const r = runwayOf(weekly, [held, on("a", "2026-10-29")], [topic("a", { status: "dropped" })], today);
  ok(r.ahead === 0, "dropped is not planned");
}

// ── Sections shade, they don't count ────────────────────────────────────────
{
  const staff: TrackedMeeting = {
    ...weekly,
    curriculum: [
      { id: "pray", label: "Prayer" },
      { id: "train", label: "Training" },
    ],
  };
  const r = runwayOf(staff, [held, on("a", "2026-10-29")], [topic("a", { slotId: "pray" })], today);
  ok(r.marks[0].planned && r.marks[0].fill === 0.5, `half the sections is half full (got ${r.marks[0].fill})`);
  ok(r.ahead === 1, "a thin week still counts");
}

// ── Monthly: one planned is about a month and a half of cover ───────────────
{
  const monthly: TrackedMeeting = { ...weekly, rhythm: "monthly" };
  const r = runwayOf(monthly, [held, on("a", "2026-11-21")], [topic("a")], today);
  ok(r.marks.length >= 2 && r.marks.length <= 3, `a quarter holds 2–3 monthly meetings (got ${r.marks.length})`);
  ok(r.ahead === 1 && r.level === "steady", `next monthly planned is steady (got ${r.ahead}, ${r.level}, ${r.days}d)`);
}

// ── Everything planned runs off the end of the horizon ──────────────────────
{
  const sessions = [held];
  const topics: Topic[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2026, 9, 29 + i * 7)).toISOString().slice(0, 10);
    sessions.push(on(`w${i}`, d));
    topics.push(topic(`w${i}`));
  }
  const r = runwayOf(weekly, sessions, topics, today);
  ok(r.gap === null && r.level === "deep", "no gap in the quarter is deep");
  ok(formatAhead(r) === "12+ ahead", `reads 12+ ahead (got ${formatAhead(r)})`);
}

// ── As needed promises nothing ──────────────────────────────────────────────
{
  const r = runwayOf({ ...weekly, rhythm: "as_needed" }, [held], [], today);
  ok(r.level === "none" && formatAhead(r) === "—", "as-needed has no runway");
}

ok(runwayLevel(6) === "bare" && runwayLevel(7) === "thin", "a week is the line for bare");
ok(runwayLevel(27) === "thin" && runwayLevel(28) === "steady", "a month is the line for steady");
ok(runwayLevel(56) === "deep", "eight weeks is deep");

if (fails.length) {
  console.error(`runway.check: ${fails.length} of ${checks} failed`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`runway.check: ${checks} checks passed`);
