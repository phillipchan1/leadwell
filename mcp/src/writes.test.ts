import { describe, expect, it } from "vitest";
import type { PersistedData } from "../../src/lib/persist";
import {
  applyAddFollowUp,
  applyCapture,
  applyCoverTopic,
  applyLogSession,
  applyPlaceTopic,
  applyPromoteTopic,
} from "./writes";

function emptyDoc(over: Partial<PersistedData> = {}): PersistedData {
  return {
    me: { name: "Phil", assessments: {}, strengths: [], watchOuts: [] },
    capacities: [],
    domains: [{ id: "dom-church", name: "Church", color: "#8B5CF6" }],
    managers: [],
    teams: [
      {
        id: "t-frontier",
        name: "Frontier",
        capacityId: "cap-lead",
        domainId: "dom-church",
        order: 0,
      },
    ],
    people: [
      {
        id: "p-meghan",
        name: "Meghan",
        teamId: "t-frontier",
        assessments: {},
        strengths: [],
        watchOuts: [],
      },
    ],
    actions: [],
    meetings: [
      {
        id: "m-staff",
        subjectKind: "team",
        subjectId: "t-frontier",
        name: "Staff meeting",
        rhythm: "weekly",
      },
    ],
    tags: [{ id: "tag-train", label: "Training", color: 0, order: 0 }],
    topics: [],
    followUps: [],
    sessions: [],
    goals: [],
    notes: [],
    wins: [],
    prayers: [],
    teamActions: [],
    teamGoals: [],
    teamNotes: [],
    chats: {},
    nodePositions: {},
    ...over,
  };
}

describe("applyCapture", () => {
  it("parses grammar, creates missing tags, and resolves @meeting", () => {
    const result = applyCapture(
      emptyDoc(),
      "Rewrite the covenant #training @frontier !\nPark the van"
    );
    expect(result.created).toHaveLength(2);
    expect(result.created[0].text).toBe("Rewrite the covenant");
    expect(result.created[0].urgent).toBe(true);
    expect(result.created[0].meetingId).toBe("m-staff");
    expect(result.created[0].tagIds).toEqual(["tag-train"]);
    expect(result.created[1].text).toBe("Park the van");
    expect(result.created[1].meetingId).toBeUndefined();
    expect(result.unresolvedMeetings).toEqual([]);
  });

  it("records unresolved @mentions without failing the other lines", () => {
    const result = applyCapture(emptyDoc(), "Ask about budget @unknown");
    expect(result.created).toHaveLength(1);
    expect(result.created[0].meetingId).toBeUndefined();
    expect(result.unresolvedMeetings).toEqual(["unknown"]);
  });
});

describe("topic lifecycle", () => {
  it("places a topic onto a projected date by booking the session", () => {
    const captured = applyCapture(emptyDoc(), "Hiring plan @staff");
    const topic = captured.created[0];
    const placed = applyPlaceTopic(captured.data, topic.id, {
      meetingId: "m-staff",
      date: "2026-09-01",
    });
    expect(placed.sessions).toHaveLength(1);
    expect(placed.sessions[0].date).toBe("2026-09-01");
    expect(placed.topics.find((t) => t.id === topic.id)?.sessionId).toBe(
      placed.sessions[0].id
    );
  });

  it("covers a topic and promotes another into a follow-up", () => {
    const captured = applyCapture(emptyDoc(), "Talk hiring @staff");
    const topic = captured.created[0];
    const covered = applyCoverTopic(captured.data, topic.id);
    expect(covered.topics[0].status).toBe("covered");

    const promoted = applyPromoteTopic(captured.data, topic.id);
    expect(promoted.followUp.text).toBe("Talk hiring");
    expect(promoted.followUp.subjectId).toBe("t-frontier");
    expect(promoted.data.topics[0].status).toBe("dropped");
  });
});

describe("sessions and follow-ups", () => {
  it("creates then appends notes on the same date", () => {
    const first = applyLogSession(emptyDoc(), {
      meetingId: "m-staff",
      date: "2026-08-28",
      point: "Sunday readiness",
      notes: "First pass",
    });
    expect(first.created).toBe(true);
    const second = applyLogSession(first.data, {
      meetingId: "m-staff",
      date: "2026-08-28",
      notes: "Added later",
    });
    expect(second.created).toBe(false);
    expect(second.session.notes).toBe("First pass\n\nAdded later");
    expect(second.session.point).toBe("Sunday readiness");
  });

  it("adds a follow-up from a meeting id", () => {
    const result = applyAddFollowUp(emptyDoc(), {
      text: "Email the elders",
      meetingId: "m-staff",
    });
    expect(result.followUp.subjectKind).toBe("team");
    expect(result.followUp.subjectId).toBe("t-frontier");
  });
});
