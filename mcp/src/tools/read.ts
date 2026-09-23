import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { getIndex, search } from "../../../src/lib/search.js";
import { todayISO } from "../../../src/lib/readiness.js";
import {
  formatFollowUps,
  formatIdeas,
  formatManager,
  formatMeeting,
  formatMeetings,
  formatOccurrence,
  formatOrg,
  formatOverview,
  formatPerson,
  formatSchedule,
  formatTags,
  formatTeam,
  formatTopic,
} from "../format.js";
import {
  parseDate,
  resolveMeeting,
  resolveOccurrence,
  resolveSubject,
  resolveTopic,
} from "../resolve.js";
import { read, tool } from "./common.js";

const readOnly = { readOnlyHint: true };

export function registerReadTools(server: McpServer, tz: string): void {
  tool(
    server,
    "get_overview",
    {
      title: "Overview",
      description:
        "Start here. Today's date, every meeting with its cadence, rows and next occurrence, what's behind, and counts for ideas, loose topics and follow-ups.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => read((d) => formatOverview(d, tz))
  );

  tool(
    server,
    "list_meetings",
    {
      title: "List meetings",
      description: "Tracked meetings with cadence and readiness. Filter by readiness state, subject or domain.",
      inputSchema: z.object({
        state: z.enum(["dormant", "resting", "ready", "prep_due", "loose_end", "drifting"]).optional(),
        subject: z.string().optional().describe("Person, team or manager — id or name"),
        domainId: z.string().optional(),
      }),
      annotations: readOnly,
    },
    ({ state, subject, domainId }) =>
      read((d) =>
        formatMeetings(d, {
          state,
          domainId,
          subjectId: subject ? resolveSubject(d, subject).id : undefined,
        })
      )
  );

  tool(
    server,
    "get_meeting",
    {
      title: "Get meeting plan",
      description:
        "One meeting the way its planner shows it: cadence, rows (standing agenda), coverage targets, the next few weeks row by row, this meeting's ideas, loose topics, follow-ups and recent write-ups.",
      inputSchema: z.object({
        meeting: z.string().describe("Meeting id or name"),
        weeks: z.number().int().min(1).max(26).optional().describe("How many upcoming occurrences to show (default 4)"),
      }),
      annotations: readOnly,
    },
    ({ meeting, weeks }) => read((d) => formatMeeting(d, resolveMeeting(d, meeting), weeks ?? 4))
  );

  tool(
    server,
    "get_agenda",
    {
      title: "Get one occurrence",
      description:
        "The agenda for one occurrence, grouped by row, with each topic's notes and points, open follow-ups, and the write-up (point, notes, transcript).",
      inputSchema: z.object({
        meeting: z.string().describe("Meeting id or name"),
        occurrence: z
          .string()
          .optional()
          .describe('"next" (default), "last", YYYY-MM-DD, a weekday like "friday", or an occurrence id'),
      }),
      annotations: readOnly,
    },
    ({ meeting, occurrence }) =>
      read((d) => {
        const m = resolveMeeting(d, meeting);
        const ref = resolveOccurrence(d, m, occurrence ?? "next");
        return formatOccurrence(d, m, ref.date, ref.session);
      })
  );

  tool(
    server,
    "get_schedule",
    {
      title: "Schedule",
      description: "Every meeting occurrence (booked or projected from its rhythm) in a date window, with how full each agenda is.",
      inputSchema: z.object({
        from: z.string().optional().describe("YYYY-MM-DD or today/tomorrow/weekday. Default today."),
        days: z.number().int().min(1).max(90).optional().describe("Default 7"),
      }),
      annotations: readOnly,
    },
    ({ from, days }) => read((d) => formatSchedule(d, from ? parseDate(from) : todayISO(), days ?? 7))
  );

  tool(
    server,
    "get_ideas",
    {
      title: "Ideas board",
      description:
        "Everything open that isn't on a week yet. Group by meeting (first group is the unassigned inbox) or by tag. Scope to one meeting to see its ideas plus the unassigned pile.",
      inputSchema: z.object({
        meeting: z.string().optional().describe("Meeting id or name"),
        groupBy: z.enum(["meeting", "tag"]).optional(),
        refine: z.enum(["all", "untriaged", "returned", "aging"]).optional(),
        includeParked: z.boolean().optional(),
      }),
      annotations: readOnly,
    },
    ({ meeting, groupBy, refine, includeParked }) =>
      read((d) =>
        formatIdeas(d, {
          meeting: meeting ? resolveMeeting(d, meeting) : undefined,
          groupBy,
          refine,
          includeParked,
        })
      )
  );

  tool(
    server,
    "get_topic",
    {
      title: "Get topic",
      description: "One topic in full: where it sits, tags, points, notes, history.",
      inputSchema: z.object({ topic: z.string().describe("Topic id (or exact text)") }),
      annotations: readOnly,
    },
    ({ topic }) => read((d) => formatTopic(d, resolveTopic(d, topic)))
  );

  tool(
    server,
    "list_tags",
    {
      title: "List tags",
      description: "Workspace tags, how many open topics carry each, and which meetings use it as a row.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => read(formatTags)
  );

  tool(
    server,
    "list_follow_ups",
    {
      title: "List follow-ups",
      description: "Commitments that outlive a single occurrence.",
      inputSchema: z.object({
        subject: z.string().optional().describe("Person, team or manager — id or name"),
        meeting: z.string().optional(),
        status: z.enum(["open", "done"]).optional(),
      }),
      annotations: readOnly,
    },
    ({ subject, meeting, status }) =>
      read((d) =>
        formatFollowUps(d, {
          subjectId: subject ? resolveSubject(d, subject).id : undefined,
          meetingId: meeting ? resolveMeeting(d, meeting).id : undefined,
          status,
        })
      )
  );

  tool(
    server,
    "search",
    {
      title: "Search",
      description: "Search people, teams, meetings, topics, write-ups, notes, wins and prayer — the same index as the in-app ⌘K.",
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(40).optional(),
      }),
      annotations: readOnly,
    },
    ({ query, limit }) =>
      read((d) => {
        const hits = search(getIndex(d), query, { limit: limit ?? 15 });
        if (!hits.length) return "No matches.";
        return hits
          .map((h) => {
            const target = h.doc.target.sessionId ?? h.doc.id.split(":").slice(1).join(":");
            return `- ${h.doc.kind} · ${h.doc.title}${h.doc.context ? ` · ${h.doc.context}` : ""} [${target}]${h.snippet ? `\n    ${h.snippet}` : ""}`;
          })
          .join("\n");
      })
  );

  tool(
    server,
    "get_org",
    {
      title: "Org tree",
      description: "Domains → teams → people, plus who I report to.",
      inputSchema: z.object({}),
      annotations: readOnly,
    },
    () => read(formatOrg)
  );

  tool(
    server,
    "get_subject",
    {
      title: "Get person, team or manager",
      description:
        "Profile of a person (assessments, how to lead, health, prayer, notes), a team (mandate, roster) or a manager (lead-up manual, wins), with their meetings and follow-ups.",
      inputSchema: z.object({ subject: z.string().describe("Id or name") }),
      annotations: readOnly,
    },
    ({ subject }) =>
      read((d) => {
        const s = resolveSubject(d, subject);
        if (s.kind === "person") return formatPerson(d, d.people.find((p) => p.id === s.id)!);
        if (s.kind === "team") return formatTeam(d, d.teams.find((t) => t.id === s.id)!);
        return formatManager(d, d.managers.find((m) => m.id === s.id)!);
      })
  );
}
