/**
 * The MCP end to end: real handler, real tools, real persistence mappers —
 * only Supabase is in memory. Each call goes over JSON-RPC exactly as a client
 * would send it, and the assertions read the rows that landed.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PersistedData } from "../../src/lib/persist";
import { loadAll, writeAll } from "../../src/lib/persist";
import * as seed from "../../src/data/seed";
import { fakeSupabase } from "./fake-supabase";

const USER = "user-phil";
const TOKEN = "test-token-0123456789";

process.env.SUPABASE_URL = "http://supabase.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.LEADWELL_USER_ID = USER;
process.env.LEADWELL_MCP_TOKEN = TOKEN;

function seedDoc(): PersistedData {
  return {
    me: seed.seedMe,
    capacities: seed.seedCapacities,
    domains: seed.seedDomains,
    managers: seed.seedManagers,
    teams: seed.seedTeams,
    people: seed.seedPeople,
    actions: seed.seedActions,
    meetings: seed.seedMeetings,
    tags: seed.seedTags,
    topics: seed.seedTopics,
    followUps: seed.seedFollowUps,
    sessions: seed.seedSessions,
    goals: seed.seedGoals,
    notes: seed.seedNotes,
    wins: seed.seedWins,
    prayers: seed.seedPrayers,
    teamActions: seed.seedTeamActions,
    teamGoals: seed.seedTeamGoals,
    teamNotes: seed.seedTeamNotes,
    chats: {},
    nodePositions: {},
  };
}

let db: ReturnType<typeof fakeSupabase>;
let handle: (r: Request) => Promise<Response>;
let setClient: (c: ReturnType<typeof fakeSupabase>["client"]) => void;

beforeAll(async () => {
  ({ handleLeadwellMcp: handle } = await import("../src/handler"));
  ({ setServiceClient: setClient } = await import("../src/db"));
});

beforeEach(async () => {
  db = fakeSupabase();
  await writeAll(db.client, USER, seedDoc());
  setClient(db.client);
});

let nextId = 1;
async function rpc(method: string, params: unknown, path = "/mcp", auth = true) {
  const res = await handle(
    new Request(`https://leadwell.test${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    })
  );
  const text = await res.text();
  if (res.status !== 200) return { status: res.status, text };
  const json = text.startsWith("{")
    ? JSON.parse(text)
    : JSON.parse(text.split("\n").find((l) => l.startsWith("data: "))!.slice(6));
  return { status: res.status, json };
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const { json } = await rpc("tools/call", { name, arguments: args });
  const result = json.result;
  if (!result) throw new Error(JSON.stringify(json));
  const text = result.content.map((c: { text: string }) => c.text).join("\n");
  if (result.isError) throw new Error(text);
  return text as string;
}

async function reload() {
  return (await loadAll(db.client, USER))!;
}

describe("auth", () => {
  it("rejects a missing token", async () => {
    const res = await rpc("tools/list", {}, "/mcp", false);
    expect(res.status).toBe(401);
  });

  it("accepts the token as the last path segment", async () => {
    const res = await rpc("tools/list", {}, `/mcp/${TOKEN}`, false);
    expect(res.status).toBe(200);
  });

  it("accepts ?key=", async () => {
    const res = await rpc("tools/list", {}, `/api/mcp?key=${TOKEN}`, false);
    expect(res.status).toBe(200);
  });
});

describe("tools", () => {
  it("lists the meeting surface", async () => {
    const { json } = await rpc("tools/list", {});
    const names = json.result.tools.map((t: { name: string }) => t.name);
    for (const name of [
      "get_overview",
      "get_meeting",
      "get_agenda",
      "get_ideas",
      "capture",
      "place_topic",
      "set_meeting_rows",
      "update_meeting",
      "skip_occurrence",
      "move_occurrence",
      "write_up",
      "create_tag",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("reads the overview", async () => {
    const text = await call("get_overview");
    expect(text).toContain("Staff meeting");
    expect(text).toContain("Prayer → Training → Discussion");
  });
});

describe("capture onto an agenda", () => {
  it("files into the next occurrence's row and books it", async () => {
    const text = await call("capture", {
      text: "Pray for the retreat #prayer !",
      meeting: "staff meeting",
      occurrence: "next",
    });
    expect(text).toContain("Staff meeting on");
    expect(text).toContain("Prayer");

    const doc = await reload();
    const topic = doc.topics.find((t) => t.text === "Pray for the retreat")!;
    expect(topic.urgent).toBe(true);
    expect(topic.meetingId).toBe("m-staff");
    const session = doc.sessions.find((s) => s.id === topic.sessionId)!;
    expect(session.meetingId).toBe("m-staff");
    // Monday meeting — anchorWeekday 1.
    expect(new Date(`${session.date}T00:00:00Z`).getUTCDay()).toBe(1);
    const prayerTag = doc.tags.find((t) => t.label === "Prayer")!;
    expect(topic.tagIds).toContain(prayerTag.id);

    const agenda = await call("get_agenda", { meeting: "m-staff", occurrence: "next" });
    expect(agenda).toMatch(/### Prayer[\s\S]*Pray for the retreat/);
  });

  it("lands on the Ideas board when unassigned, and makes new tags", async () => {
    await call("capture", { text: "Launch a mentoring cohort #mentoring" });
    const doc = await reload();
    const topic = doc.topics.find((t) => t.text === "Launch a mentoring cohort")!;
    expect(topic.meetingId).toBeUndefined();
    expect(topic.sessionId).toBeUndefined();
    expect(doc.tags.some((t) => t.label === "Mentoring")).toBe(true);
    const ideas = await call("get_ideas", { groupBy: "tag" });
    expect(ideas).toContain("#Mentoring");
  });

  it("refuses a date the meeting doesn't meet on", async () => {
    await expect(
      call("capture", { text: "x", meeting: "m-staff", occurrence: "2099-01-07" })
    ).rejects.toThrow(/doesn't meet on/);
  });
});

describe("rows and cadence", () => {
  it("replaces the template, keeping rows matched by label and backing new ones with tags", async () => {
    await call("set_meeting_rows", {
      meeting: "Staff meeting",
      rows: [{ label: "Prayer" }, { label: "Vision", minutes: 10 }, { label: "Discussion" }],
    });
    const doc = await reload();
    const staff = doc.meetings.find((m) => m.id === "m-staff")!;
    expect(staff.curriculum!.map((c) => c.label)).toEqual(["Prayer", "Vision", "Discussion"]);
    expect(staff.curriculum![0].id).toBe("cs-prayer");
    const vision = doc.tags.find((t) => t.label === "Vision")!;
    expect(staff.curriculum![1].tagId).toBe(vision.id);
    expect(staff.curriculum![1].minutes).toBe(10);
    // Survives a reload with its tag — the loader used to drop it.
    expect(staff.curriculum![0].tagId).toBe(doc.tags.find((t) => t.label === "Prayer")!.id);
    expect(doc.topics.some((t) => t.meetingId === "m-staff" && t.slotId === "cs-training")).toBe(false);
  });

  it("moves the weekday and carries booked weeks along", async () => {
    await call("capture", { text: "Budget review", meeting: "m-staff", occurrence: "next" });
    await call("update_meeting", { meeting: "m-staff", weekday: "friday" });
    const doc = await reload();
    const staff = doc.meetings.find((m) => m.id === "m-staff")!;
    expect(staff.anchorWeekday).toBe(5);
    const topic = doc.topics.find((t) => t.text === "Budget review")!;
    const session = doc.sessions.find((s) => s.id === topic.sessionId)!;
    expect(new Date(`${session.date}T00:00:00Z`).getUTCDay()).toBe(5);
  });

  it("skips a week and restores it", async () => {
    const plan = await call("get_meeting", { meeting: "m-staff", weeks: 3 });
    const date = /### \w{3} (\d{4}-\d{2}-\d{2}) · projected/.exec(plan)![1];
    await call("skip_occurrence", { meeting: "m-staff", occurrence: date });
    let doc = await reload();
    expect(doc.sessions.find((s) => s.meetingId === "m-staff" && s.date === date)?.kind).toBe("skipped");
    await expect(call("get_agenda", { meeting: "m-staff", occurrence: date })).rejects.toThrow(/skipped/);
    await call("restore_occurrence", { meeting: "m-staff", date });
    doc = await reload();
    expect(doc.sessions.some((s) => s.meetingId === "m-staff" && s.date === date)).toBe(false);
  });

  it("moves one occurrence without moving the series, and adds a one-off", async () => {
    const plan = await call("get_meeting", { meeting: "m-staff", weeks: 2 });
    const date = /### \w{3} (\d{4}-\d{2}-\d{2}) · projected/.exec(plan)![1];
    const tuesday = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    await call("move_occurrence", { meeting: "m-staff", occurrence: date, to: tuesday });
    await call("add_extra_occurrence", { meeting: "m-staff", date: "2099-01-01" });
    const doc = await reload();
    const moved = doc.sessions.find((s) => s.meetingId === "m-staff" && s.date === tuesday)!;
    expect(moved.seriesDate).toBe(date);
    expect(doc.meetings.find((m) => m.id === "m-staff")!.anchorWeekday).toBe(1);
    expect(doc.sessions.find((s) => s.date === "2099-01-01")!.kind).toBe("extra");
    // The moved week is still its series' week: no Monday is drawn beside it.
    const after = await call("get_meeting", { meeting: "m-staff", weeks: 3 });
    expect(after).toContain(`moved from ${date}`);
    expect(after).not.toContain(`### Mon ${date}`);
  });

  it("carries loose topics onto the next occurrence", async () => {
    const before = await reload();
    const today = new Date().toLocaleDateString("en-CA");
    const loose = before.topics.filter((t) => {
      const s = before.sessions.find((x) => x.id === t.sessionId);
      return t.status === "open" && s && s.date < today;
    });
    expect(loose.length).toBeGreaterThan(0);
    const text = await call("carry_forward");
    expect(text).toContain(`Carried ${loose.length}`);
    const doc = await reload();
    for (const t of loose) {
      const after = doc.topics.find((x) => x.id === t.id)!;
      expect(after.carried).toBe(t.carried + 1);
      const s = doc.sessions.find((x) => x.id === after.sessionId);
      if (s) expect(s.date >= today).toBe(true);
    }
  });

  it("creates a meeting with rows", async () => {
    const text = await call("create_meeting", {
      subject: "Sarah",
      name: "Career check-in",
      rhythm: "monthly",
      weekday: "wed",
      rows: [{ label: "Growth" }, { label: "Work" }],
    });
    expect(text).toContain("Career check-in");
    const doc = await reload();
    const m = doc.meetings.find((x) => x.name === "Career check-in")!;
    expect(m.anchorWeekday).toBe(3);
    expect(m.curriculum!.map((c) => c.label)).toEqual(["Growth", "Work"]);
    // "Work" already existed as a tag — reused, not duplicated.
    expect(doc.tags.filter((t) => t.label === "Work")).toHaveLength(1);
  });
});

describe("write-ups, topics and follow-ups", () => {
  it("writes notes onto an occurrence and edits a topic's points", async () => {
    await call("capture", { text: "Hiring plan", meeting: "m-staff", occurrence: "next" });
    let doc = await reload();
    const topic = doc.topics.find((t) => t.text === "Hiring plan")!;
    await call("update_topic", {
      topic: topic.id,
      detail: "Two roles before Q1",
      addPoints: ["Draft JD", "Budget sign-off"],
      addTags: ["hiring"],
    });
    await call("update_topic", { topic: topic.id, checkPoints: ["1"] });
    await call("write_up", { meeting: "m-staff", point: "Get hiring moving", notes: "## Prep\n- bring numbers" });
    doc = await reload();
    const after = doc.topics.find((t) => t.id === topic.id)!;
    expect(after.points!.map((p) => [p.text, p.done])).toEqual([
      ["Draft JD", true],
      ["Budget sign-off", false],
    ]);
    expect(after.detail).toBe("Two roles before Q1");
    const session = doc.sessions.find((s) => s.id === after.sessionId)!;
    expect(session.point).toBe("Get hiring moving");
    expect(session.notes).toContain("bring numbers");
  });

  it("places a topic into another row and swaps the row tag", async () => {
    await call("capture", { text: "Retreat logistics #prayer", meeting: "m-staff" });
    let doc = await reload();
    const topic = doc.topics.find((t) => t.text === "Retreat logistics")!;
    await call("place_topic", { topic: topic.id, occurrence: "next", row: "Discussion" });
    doc = await reload();
    const moved = doc.topics.find((t) => t.id === topic.id)!;
    const tag = (label: string) => doc.tags.find((t) => t.label === label)!.id;
    expect(moved.sessionId).toBeTruthy();
    expect(moved.slotId).toBe("cs-discussion");
    expect(moved.tagIds).toContain(tag("Discussion"));
  });

  it("adds and completes a follow-up", async () => {
    const text = await call("add_follow_up", { meeting: "m-staff", text: "Send the budget deck" });
    const id = /\[(\w+)\]/.exec(text)![1];
    await call("update_follow_up", { followUp: id, done: true });
    const doc = await reload();
    expect(doc.followUps.find((f) => f.id === id)!.status).toBe("done");
  });

  it("only writes the rows it changed", async () => {
    const before = structuredClone(db.tables.people);
    db.tables.people[0].name = "Edited elsewhere";
    await call("capture", { text: "Something new" });
    // A capture touches topics, never people — a concurrent edit survives.
    expect(db.tables.people[0].name).toBe("Edited elsewhere");
    expect(db.tables.people).toHaveLength(before.length);
  });
});
