import type { Arc, Session, Topic, TrackedMeeting } from "../types";
import {
  arcSuggestion,
  arcPlan,
  currentStep,
  markStep,
  progressOf,
  stepsOn,
  tookLonger,
  unmarkStep,
  unmarkedSession,
} from "./arcs";
import { plannedSlots } from "./topics";

/** Run with `npm run test:arcs`. The arc's whole promise is in these. */

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}

const meeting: TrackedMeeting = {
  id: "m1",
  subjectKind: "person",
  subjectId: "p1",
  rhythm: "weekly",
  anchorWeekday: 4, // Thursday
};

const step = (n: number) => ({
  id: `c${n}`,
  label: `Ch. ${n}`,
  prompts: [],
  status: "upcoming" as const,
  coveredIn: [] as string[],
});

const base: Arc = {
  id: "a1",
  meetingId: "m1",
  title: "Crucial Conversations",
  every: 1,
  startsOn: "2026-10-01",
  status: "active",
  steps: [1, 2, 3, 4, 5, 6, 7].map(step),
  createdOn: "2026-09-30",
  order: 0,
};

const sessions: Session[] = [
  { id: "s1", meetingId: "m1", date: "2026-10-01" },
  { id: "s8", meetingId: "m1", date: "2026-10-08" },
  { id: "s15", meetingId: "m1", date: "2026-10-15" },
  { id: "s22", meetingId: "m1", date: "2026-10-22" },
  // Phil's away: the 5th is skipped.
  { id: "s5n", meetingId: "m1", date: "2026-11-05", seriesDate: "2026-11-05", kind: "skipped" },
];
const today = "2026-10-27";

// Ch.1 on the 1st, Ch.2 on the 8th, Ch.3 ran over the 15th and finished the 22nd.
let arc = base;
arc = markStep(arc, "c1", "s1", "done", "2026-10-01");
arc = markStep(arc, "c2", "s8", "done", "2026-10-08");
arc = markStep(arc, "c3", "s15", "again", "2026-10-15");
ok(currentStep(arc)?.id === "c3", "held step stays current");
arc = markStep(arc, "c3", "s22", "done", "2026-10-22");
ok(currentStep(arc)?.id === "c4", "position advances once done");
ok(tookLonger(arc.steps[2]), "Ch. 3 shows it took two meetings");
ok(progressOf(arc).done === 3 && progressOf(arc).at === 4, "progress reads 3 done, on 4");

const slots = plannedSlots(meeting, sessions, [], today, 6);
const plan = arcPlan(arc, slots);
const on = (d: string) => plan.get(d)?.map((p) => `${p.step.id}:${p.state}`).join(",");

ok(on("2026-10-22") === "c3:done", `last meeting shows what finished there (${on("2026-10-22")})`);
ok(on("2026-10-29") === "c4:now", `the next meeting gets Ch. 4 (${on("2026-10-29")})`);
ok(!plan.has("2026-11-05"), "the skipped week holds nothing");
ok(on("2026-11-12") === "c5:later", `Ch. 5 slides past the skipped week (${on("2026-11-12")})`);
ok(on("2026-11-19") === "c6:later", "and the rest follow");

// Every other meeting.
const slow = { ...arc, every: 2 };
const slowPlan = arcPlan(slow, slots);
ok(slowPlan.get("2026-10-29")?.[0]?.step.id === "c4", "every-other still starts next meeting");
ok(!slowPlan.has("2026-11-12"), "and leaves the one after free");
ok(slowPlan.get("2026-11-19")?.[0]?.step.id === "c5", "then takes the next step");

// Paused: history stays, nothing is projected.
const paused = arcPlan({ ...arc, status: "paused" }, slots);
ok(paused.get("2026-10-22")?.[0]?.state === "done" && !paused.has("2026-10-29"), "paused arc projects nothing");

// Not before it starts.
const later = arcPlan({ ...arc, startsOn: "2026-11-10" }, slots);
ok(!later.has("2026-10-29") && later.get("2026-11-12")?.[0]?.step.id === "c4", "nothing lands before startsOn");

// Marking today's meeting "again" keeps the step there *and* next time.
const withToday = [...sessions, { id: "s29", meetingId: "m1", date: "2026-10-29" }];
const todaySlots = plannedSlots(meeting, withToday, [], "2026-10-29", 4);
const held = markStep(arc, "c4", "s29", "again", "2026-10-29");
const heldPlan = arcPlan(held, todaySlots);
ok(heldPlan.get("2026-10-29")?.[0]?.state === "again", "today shows it carried on");
ok(heldPlan.get("2026-11-12")?.[0]?.step.id === "c4", "and next time picks it up again");
const doneToday = markStep(arc, "c4", "s29", "done", "2026-10-29");
ok(arcPlan(doneToday, todaySlots).get("2026-11-12")?.[0]?.step.id === "c5", "done today moves the next step up");

// Undo is exact.
const undone = unmarkStep(doneToday, "c4", "s29");
ok(currentStep(undone)?.id === "c4" && undone.steps[3].coveredIn.length === 0, "undo restores the step");

// The gentle question about the last meeting.
const asked = unmarkedSession(markStep(base, "c1", "s1", "done"), sessions, today);
ok(asked?.id === "s22", "asks about the most recent untouched meeting");
ok(unmarkedSession(arc, sessions, today) === null, "doesn't ask once it's marked");
ok(unmarkedSession({ ...base, passedIn: ["s22"] }, sessions, today) === null, "doesn't ask once passed");
ok(stepsOn(arc, slots, "2026-10-29")[0]?.step.label === "Ch. 4", "stepsOn reads one date");

// Finishing closes it.
let all = base;
base.steps.forEach((s, i) => (all = markStep(all, s.id, `x${i}`, "done", "2026-12-01")));
ok(all.status === "done" && all.closedOn === "2026-12-01", "last step done closes the arc");
ok(unmarkStep(all, "c7", "x6").status === "active", "undoing the last step reopens it");

// Spotting an arc already being run by hand.
const tp = (id: string, text: string, sessionId?: string, meetingId = "m1"): Topic =>
  ({ id, meetingId, text, sessionId, tagIds: [], status: "open", lane: "backlog", carried: 0, carriedFrom: [] }) as unknown as Topic;
const sugSessions = [
  { id: "q1", meetingId: "m1", date: "2026-10-23" },
  { id: "q2", meetingId: "m1", date: "2026-10-30" },
  { id: "q3", meetingId: "m1", date: "2026-11-06" },
] as Session[];
const handRun = [
  tp("h1", "Check in + Crucial Conversations", "q1"),
  tp("h2", "Go Over Crucial Conversations Pt 1", "q2"),
  tp("h3", "Crucial Conversations Part 2", "q3"),
  tp("h4", "Budget sign-off", "q2"),
];
const sug = arcSuggestion("m1", handRun, sugSessions, [], "2026-10-27");
ok(sug?.title === "Crucial Conversations", `finds the book being run by hand (got ${sug?.title})`);
ok(sug?.weeks === 3, "counts the weeks it shows up in");
ok(sug?.startsOn === "2026-10-30", "starts at the first week ahead that has one");
ok(arcSuggestion("m1", handRun, sugSessions, [{ ...base, meetingId: "m1", title: "Crucial Conversations" }], "2026-10-27") === null, "not once an arc covers it");
ok(arcSuggestion("m1", handRun, sugSessions, [], "2026-10-27", ["Crucial Conversations"]) === null, "not once waved off");
ok(arcSuggestion("m2", handRun, sugSessions, [], "2026-10-27") === null, "only this meeting's items count");
const weekly = [tp("w1", "Budget sign-off", "q1"), tp("w2", "Budget sign-off", "q2")];
ok(arcSuggestion("m1", weekly, sugSessions, [], "2026-10-27") === null, "a repeat in two weeks without numbering is not a series");
const once = [tp("o1", "Crucial Conversations Pt 1", "q2"), tp("o2", "Crucial Conversations notes", "q2")];
ok(arcSuggestion("m1", once, sugSessions, [], "2026-10-27") === null, "twice in the same week is not a series");
const lower = [tp("l1", "atomic habits ch 1", "q1"), tp("l2", "atomic habits ch 2", "q2")];
ok(arcSuggestion("m1", lower, sugSessions, [], "2026-10-27")?.title === "Atomic Habits", "title-cases a lowercase title");
const noise = [tp("n1", "Check in pt 1", "q1"), tp("n2", "Check in pt 2", "q2")];
ok(arcSuggestion("m1", noise, sugSessions, [], "2026-10-27") === null, "series words alone are not a title");

if (fails.length) {
  console.error(`arcs.check: ${fails.length}/${checks} failed`);
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log(`arcs.check: ${checks} checks passed`);
