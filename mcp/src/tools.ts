import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getIndex, search as searchIndex } from "../../src/lib/search";
import type { PersistedData } from "../../src/lib/persist";
import type { CollKey } from "../../src/lib/persist";
import {
  formatCreatedTopics,
  formatFollowUps,
  formatManager,
  formatMeeting,
  formatMeetings,
  formatOrg,
  formatPerson,
  formatPurview,
  formatTeam,
  formatTopics,
} from "./format";
import { loadWorkspace, saveCollections } from "./workspace";
import {
  applyAddFollowUp,
  applyAddNote,
  applyAddTeamNote,
  applyAddWin,
  applyAssignTopics,
  applyCapture,
  applyCompleteFollowUp,
  applyCoverTopic,
  applyLogSession,
  applyParkTopics,
  applyPlaceTopic,
  applyPromoteTopic,
  applyUpdateSession,
  applyUpdateTopic,
} from "./writes";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function mutate(
  run: (
    data: PersistedData
  ) => { data: PersistedData; changed: CollKey[]; text: string }
) {
  const data = await loadWorkspace();
  const result = run(data);
  const patch: Partial<Pick<PersistedData, CollKey>> = {};
  for (const key of result.changed) {
    Object.assign(patch, { [key]: result.data[key] });
  }
  await saveCollections(patch);
  return ok(result.text);
}

const readinessStates = [
  "dormant",
  "resting",
  "ready",
  "prep_due",
  "loose_end",
  "drifting",
] as const;

export function registerTools(server: McpServer): void {
  server.registerTool(
    "get_purview",
    {
      title: "Get leadership purview",
      description:
        "First-call brief of Phil's LeadWell workspace: teams, readiness debts, health watch-or-worse, prayer gone quiet, undecided meeting triage. Call this before asking more specific questions.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return ok(formatPurview(await loadWorkspace()));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_org",
    {
      title: "Get org tree",
      description: "Domain → team → person tree with health.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return ok(formatOrg(await loadWorkspace()));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_person",
    {
      title: "Get person",
      description:
        "Profile, assessments, how-to-lead, health/prayer, meetings, open topics, follow-ups, recent notes.",
      inputSchema: z.object({
        id: z.string().describe("Person id from get_org / search / get_purview"),
      }),
    },
    async ({ id }) => {
      try {
        return ok(formatPerson(await loadWorkspace(), id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_team",
    {
      title: "Get team",
      description: "Mandate, roster, health, meetings, recent notes.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      try {
        return ok(formatTeam(await loadWorkspace(), id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_manager",
    {
      title: "Get manager",
      description: "Lead-up manual, check-in readiness, wins ledger.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      try {
        return ok(formatManager(await loadWorkspace(), id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "list_meetings",
    {
      title: "List meetings",
      description: "Tracked meetings with readiness. Filter by state, domain, or subject.",
      inputSchema: z.object({
        state: z.enum(readinessStates).optional(),
        domainId: z.string().optional(),
        subjectId: z.string().optional(),
      }),
    },
    async (filter) => {
      try {
        return ok(formatMeetings(await loadWorkspace(), filter));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_meeting",
    {
      title: "Get meeting",
      description:
        "Rhythm, readiness, open topics, follow-ups, recent sessions. Tracker URL is a pointer only — do not fetch it here.",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      try {
        return ok(formatMeeting(await loadWorkspace(), id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "search",
    {
      title: "Search LeadWell",
      description:
        "Record-level search over people, teams, meetings, topics, write-ups, notes, wins, and prayer. Same index as the in-app ⌘K palette.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
    },
    async ({ query, limit }) => {
      try {
        const data = await loadWorkspace();
        const index = getIndex({
          me: data.me,
          people: data.people,
          teams: data.teams,
          managers: data.managers,
          meetings: data.meetings,
          sessions: data.sessions,
          topics: data.topics,
          notes: data.notes,
          teamNotes: data.teamNotes,
          wins: data.wins,
          prayers: data.prayers,
        });
        const hits = searchIndex(index, query, { limit: limit ?? 15 });
        if (!hits.length) return ok("No matches.");
        const text = hits
          .map((h) => {
            const snip = h.snippet ? `\n  ${h.snippet}` : "";
            return `- ${h.doc.kind} · ${h.doc.title}${h.doc.context ? ` · ${h.doc.context}` : ""} (${h.doc.id})${snip}`;
          })
          .join("\n");
        return ok(text);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "list_topics",
    {
      title: "List topics",
      description: "Open topics, optionally filtered to a meeting or the unassigned Ideas pile.",
      inputSchema: z.object({
        meetingId: z.string().optional(),
        unassigned: z.boolean().optional(),
        status: z.enum(["open", "covered", "dropped"]).optional(),
      }),
    },
    async (filter) => {
      try {
        return ok(formatTopics(await loadWorkspace(), filter));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "list_follow_ups",
    {
      title: "List follow-ups",
      description: "Commitments that outlive a single occurrence.",
      inputSchema: z.object({
        subjectId: z.string().optional(),
        meetingId: z.string().optional(),
        status: z.enum(["open", "done"]).optional(),
      }),
    },
    async (filter) => {
      try {
        return ok(formatFollowUps(await loadWorkspace(), filter));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "capture",
    {
      title: "Capture topics",
      description:
        "Full Ideas capture. Same grammar as the app: one topic per line, `#tag` `@meeting` `!` for urgent. Unknown #tags are created. `@meeting` matches a meeting or subject name. Multi-line paste is many topics.",
      inputSchema: z.object({
        text: z
          .string()
          .describe("Capture lines, e.g. 'Rewrite the covenant #training @frontier !'"),
        meetingId: z.string().optional().describe("Default meeting when a line has no @mention"),
        sessionId: z.string().optional(),
        lane: z.enum(["backlog", "parked"]).optional(),
        slotId: z.string().optional(),
      }),
    },
    async ({ text, meetingId, sessionId, lane, slotId }) => {
      try {
        return await mutate((data) => {
          const result = applyCapture(data, text, {
            meetingId,
            sessionId,
            lane,
            slotId,
          });
          return {
            data: result.data,
            changed: ["topics", "tags"],
            text: formatCreatedTopics(result.created, result.unresolvedMeetings),
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "update_topic",
    {
      title: "Update topic",
      description: "Edit text, detail, tags, urgency, status, lane, or due date.",
      inputSchema: z.object({
        id: z.string(),
        text: z.string().optional(),
        detail: z.string().nullable().optional(),
        urgent: z.boolean().optional(),
        status: z.enum(["open", "covered", "dropped"]).optional(),
        lane: z.enum(["backlog", "parked"]).optional(),
        dueDate: z.string().nullable().optional(),
        tagLabels: z.array(z.string()).optional(),
      }),
    },
    async ({ id, ...patch }) => {
      try {
        return await mutate((data) => ({
          data: applyUpdateTopic(data, id, patch),
          changed: ["topics", "tags"],
          text: `Updated topic ${id}.`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "place_topic",
    {
      title: "Place topic",
      description:
        "Move a topic onto a meeting, a specific session, a projected date (books the occurrence), a curriculum slot, or a lane.",
      inputSchema: z.object({
        id: z.string(),
        meetingId: z.string().optional(),
        sessionId: z.string().optional(),
        date: z.string().optional().describe("YYYY-MM-DD — books that occurrence if needed"),
        lane: z.enum(["backlog", "parked"]).optional(),
        slotId: z.string().optional(),
      }),
    },
    async ({ id, ...target }) => {
      try {
        return await mutate((data) => ({
          data: applyPlaceTopic(data, id, target),
          changed: ["topics", "sessions"],
          text: `Placed topic ${id}.`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "cover_topic",
    {
      title: "Cover or uncover topic",
      description: "Mark a topic covered (we talked about it) or reopen it.",
      inputSchema: z.object({
        id: z.string(),
        covered: z.boolean().optional(),
      }),
    },
    async ({ id, covered }) => {
      try {
        return await mutate((data) => ({
          data: applyCoverTopic(data, id, covered ?? true),
          changed: ["topics"],
          text: `${covered === false ? "Reopened" : "Covered"} topic ${id}.`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "park_topics",
    {
      title: "Park topics",
      description: "Park topics (defer, not now) or return them to the backlog.",
      inputSchema: z.object({
        ids: z.array(z.string()),
        parked: z.boolean(),
      }),
    },
    async ({ ids, parked }) => {
      try {
        return await mutate((data) => ({
          data: applyParkTopics(data, ids, parked),
          changed: ["topics"],
          text: `${parked ? "Parked" : "Unparked"} ${ids.length} topic(s).`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "assign_topics",
    {
      title: "Assign topics",
      description: "Move topics to a meeting, or clear the meeting to send them back to Ideas.",
      inputSchema: z.object({
        ids: z.array(z.string()),
        meetingId: z.string().nullable(),
      }),
    },
    async ({ ids, meetingId }) => {
      try {
        return await mutate((data) => ({
          data: applyAssignTopics(data, ids, meetingId),
          changed: ["topics"],
          text: `Assigned ${ids.length} topic(s).`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "add_follow_up",
    {
      title: "Add follow-up",
      description: "A commitment that outlives the conversation. Provide meetingId, or subjectKind + subjectId.",
      inputSchema: z.object({
        text: z.string(),
        meetingId: z.string().optional(),
        subjectKind: z.enum(["person", "team", "manager"]).optional(),
        subjectId: z.string().optional(),
        sourceSessionId: z.string().optional(),
      }),
    },
    async (input) => {
      try {
        return await mutate((data) => {
          const result = applyAddFollowUp(data, input);
          return {
            data: result.data,
            changed: ["followUps"],
            text: `Follow-up ${result.followUp.id}: ${result.followUp.text}`,
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "complete_follow_up",
    {
      title: "Complete or reopen follow-up",
      description: "Mark a follow-up done, or reopen it.",
      inputSchema: z.object({
        id: z.string(),
        done: z.boolean().optional(),
      }),
    },
    async ({ id, done }) => {
      try {
        return await mutate((data) => ({
          data: applyCompleteFollowUp(data, id, done ?? true),
          changed: ["followUps"],
          text: `${done === false ? "Reopened" : "Completed"} follow-up ${id}.`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "promote_topic",
    {
      title: "Promote topic to follow-up",
      description:
        "Turn a topic into a follow-up on its meeting's subject and drop the topic (it was never just something to talk about).",
      inputSchema: z.object({ id: z.string() }),
    },
    async ({ id }) => {
      try {
        return await mutate((data) => {
          const result = applyPromoteTopic(data, id);
          return {
            data: result.data,
            changed: ["topics", "followUps"],
            text: `Promoted topic ${id} → follow-up ${result.followUp.id}.`,
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "log_session",
    {
      title: "Log session",
      description:
        "Write up an occurrence. Creates the session for that date or appends notes if it already exists. Full capture: point, notes, transcript, nextDate, uncovered ledger.",
      inputSchema: z.object({
        meetingId: z.string(),
        date: z.string().describe("YYYY-MM-DD"),
        point: z.string().optional().describe("Why we met this time"),
        notes: z.string().optional(),
        transcript: z.string().optional(),
        nextDate: z.string().optional(),
        uncovered: z.array(z.string()).optional(),
      }),
    },
    async (input) => {
      try {
        return await mutate((data) => {
          const result = applyLogSession(data, input);
          return {
            data: result.data,
            changed: ["sessions"],
            text: `${result.created ? "Logged" : "Updated"} session ${result.session.id} on ${result.session.date}.`,
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "update_session",
    {
      title: "Update session",
      description: "Replace fields on an existing occurrence write-up.",
      inputSchema: z.object({
        id: z.string(),
        date: z.string().optional(),
        point: z.string().optional(),
        notes: z.string().optional(),
        transcript: z.string().optional(),
        nextDate: z.string().optional(),
        uncovered: z.array(z.string()).optional(),
      }),
    },
    async ({ id, ...patch }) => {
      try {
        return await mutate((data) => ({
          data: applyUpdateSession(data, id, patch),
          changed: ["sessions"],
          text: `Updated session ${id}.`,
        }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "add_note",
    {
      title: "Add person note",
      description: "Dated note on a person or manager (subject id).",
      inputSchema: z.object({
        personId: z.string(),
        body: z.string(),
      }),
    },
    async ({ personId, body }) => {
      try {
        return await mutate((data) => {
          const result = applyAddNote(data, personId, body);
          return {
            data: result.data,
            changed: ["notes"],
            text: `Note ${result.note.id} on ${personId}.`,
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "add_team_note",
    {
      title: "Add team note",
      description: "Dated note on a team.",
      inputSchema: z.object({
        teamId: z.string(),
        body: z.string(),
      }),
    },
    async ({ teamId, body }) => {
      try {
        return await mutate((data) => {
          const result = applyAddTeamNote(data, teamId, body);
          return {
            data: result.data,
            changed: ["teamNotes"],
            text: `Team note ${result.note.id} on ${teamId}.`,
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "add_win",
    {
      title: "Bank a win",
      description: "Bank a delivered win against someone you report to, phrased in their currency.",
      inputSchema: z.object({
        personId: z.string(),
        text: z.string(),
        impact: z.string().optional(),
      }),
    },
    async ({ personId, text, impact }) => {
      try {
        return await mutate((data) => {
          const result = applyAddWin(data, personId, text, impact);
          return {
            data: result.data,
            changed: ["wins"],
            text: `Win ${result.win.id} banked on ${personId}.`,
          };
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
