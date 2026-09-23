/**
 * Meetings as calendar series: cadence, the rows each occurrence is shaped
 * by, the exceptions (skipped, moved, one-off), write-ups and follow-ups.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { CurriculumSlot, Session, TrackedMeeting } from "../../../src/types";
import * as ops from "../../../src/lib/ops.js";
import { findTag } from "../../../src/lib/ideas.js";
import { trackerName } from "../../../src/lib/tracker.js";
import { dayLabel } from "../format.js";
import {
  meetingName,
  parseDate,
  parseWeekday,
  resolveMeeting,
  resolveOccurrence,
  resolveSubject,
  resolveTag,
} from "../resolve.js";
import { tool, write, type Doc } from "./common.js";

const rhythm = z.enum(["weekly", "biweekly", "monthly", "quarterly", "as_needed"]);
const weekday = z
  .union([z.string(), z.number().int().min(0).max(6)])
  .describe('"friday", "fri", or 0 (Sun) … 6 (Sat)');
const rowSpec = z.object({
  label: z.string(),
  tag: z.string().optional().describe("Tag it stamps on topics placed in it. Defaults to the tag of the same name (created if needed)."),
  minutes: z.number().int().min(1).optional(),
});

/**
 * The rows a meeting should have, reusing existing row ids by label so the
 * topics already in them stay put. Each row is backed by a tag — the one
 * asked for, or the one of the same name, made if missing — which is what
 * `addMeetingRow` does in the app.
 */
function buildRows(
  d: Doc,
  meeting: TrackedMeeting | undefined,
  specs: z.infer<typeof rowSpec>[],
  edit: (p: ops.Patch) => Doc
): CurriculumSlot[] {
  let doc = d;
  const current = meeting?.curriculum ?? [];
  return specs
    .filter((s) => s.label.trim())
    .map((s) => {
      const label = s.label.trim();
      const kept = current.find((c) => c.label.trim().toLowerCase() === label.toLowerCase());
      let tagId: string | undefined;
      if (s.tag) {
        tagId = resolveTagOrCreate(doc, s.tag, (p) => (doc = edit(p)));
      } else if (kept?.tagId) {
        tagId = kept.tagId;
      } else {
        tagId = resolveTagOrCreate(doc, label, (p) => (doc = edit(p)));
      }
      return { id: kept?.id ?? ops.uid(), label, tagId, minutes: s.minutes ?? kept?.minutes };
    });
}

function resolveTagOrCreate(d: Doc, label: string, edit: (p: ops.Patch) => Doc): string {
  const clean = label.trim().replace(/^#/, "");
  const found =
    d.tags.find((t) => t.id === clean) ??
    d.tags.find((t) => t.label.trim().toLowerCase() === clean.toLowerCase()) ??
    findTag(clean.toLowerCase(), d.tags);
  if (found) return found.id;
  const id = ops.uid();
  edit(ops.addTag(d, id, clean));
  return id;
}

function rowsText(d: Doc, m: TrackedMeeting): string {
  const rows = m.curriculum ?? [];
  if (!rows.length) return "No rows — the board is one list.";
  return `Rows: ${rows
    .map((c) => `${c.label} [${c.id}]${c.tagId ? ` ↔ #${d.tags.find((t) => t.id === c.tagId)?.label ?? "?"}` : ""}`)
    .join(" → ")}`;
}

function occurrenceText(d: Doc, meetingId: string, sessionId: string): string {
  const s = d.sessions.find((x) => x.id === sessionId);
  const m = d.meetings.find((x) => x.id === meetingId)!;
  if (!s) return `${meetingName(d, m)}: done.`;
  const bits = [
    s.kind === "extra" ? "one-off" : "",
    s.kind === "skipped" ? "skipped" : "",
    s.seriesDate && s.seriesDate !== s.date && s.kind !== "skipped" ? `moved from ${s.seriesDate}` : "",
  ].filter(Boolean);
  return `${meetingName(d, m)} · ${dayLabel(s.date)} [${s.id}]${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

export function registerMeetingTools(server: McpServer): void {
  tool(
    server,
    "create_meeting",
    {
      title: "Create meeting",
      description:
        "Start tracking a meeting with a person, team or manager — a 1:1, a staff meeting, a check-in. A subject can have several. Rows are the standing agenda each occurrence is shaped by (e.g. Prayer, Training, Discussion); each row is backed by a tag.",
      inputSchema: z.object({
        subject: z.string().describe("Person, team or manager — id or name"),
        subjectKind: z.enum(["person", "team", "manager"]).optional(),
        name: z.string().optional().describe("e.g. 'Staff meeting'. Falls back to the subject's name."),
        rhythm: rhythm.optional().describe("Default weekly"),
        weekday: weekday.optional(),
        floorDays: z.number().int().min(1).optional().describe("as_needed only: how long before it counts as drifting"),
        role: z.enum(["convene", "attend"]).optional(),
        rows: z.array(rowSpec).optional(),
        nextDate: z.string().optional().describe("Explicit booking, YYYY-MM-DD"),
      }),
    },
    (args) =>
      write((d, edit) => {
        const subject = resolveSubject(d, args.subject, args.subjectKind);
        const id = ops.uid();
        let doc = d;
        const rows = args.rows ? buildRows(doc, undefined, args.rows, (p) => (doc = edit(p))) : undefined;
        doc = edit(
          ops.createMeeting(doc, id, subject.kind, subject.id, {
            name: args.name?.trim() || undefined,
            rhythm: args.rhythm ?? "weekly",
            anchorWeekday: args.weekday !== undefined ? parseWeekday(args.weekday) : undefined,
            floorDays: args.floorDays,
            role: args.role,
            nextDate: args.nextDate ? parseDate(args.nextDate) : undefined,
            curriculum: rows,
          })
        );
        const m = doc.meetings.find((x) => x.id === id)!;
        return `Created ${meetingName(doc, m)} [${id}] with ${subject.name}.\n${rowsText(doc, m)}`;
      })
  );

  tool(
    server,
    "update_meeting",
    {
      title: "Edit meeting settings",
      description:
        "Change a meeting's name, cadence (rhythm), weekday, booking, role or external notes link. Changing the weekday moves the upcoming booked weeks with it, like the app does; past meetings stay where they happened.",
      inputSchema: z.object({
        meeting: z.string(),
        name: z.string().nullable().optional(),
        rhythm: rhythm.optional(),
        weekday: weekday.nullable().optional().describe("null lets the rhythm float with the last meeting"),
        floorDays: z.number().int().min(1).nullable().optional(),
        nextDate: z.string().nullable().optional().describe("Explicit next booking; null clears"),
        role: z.enum(["convene", "attend"]).optional(),
        trackerUrl: z.string().nullable().optional().describe("Where the notes live when outside LeadWell (Notion, a doc)"),
        trackerName: z.string().nullable().optional(),
      }),
    },
    (args) =>
      write((d, edit) => {
        const m = resolveMeeting(d, args.meeting);
        const patch: Partial<TrackedMeeting> = {};
        if (args.name !== undefined) patch.name = args.name?.trim() || undefined;
        if (args.rhythm) patch.rhythm = args.rhythm;
        if (args.floorDays !== undefined) patch.floorDays = args.floorDays ?? undefined;
        if (args.nextDate !== undefined) patch.nextDate = args.nextDate ? parseDate(args.nextDate) : undefined;
        if (args.role) patch.role = args.role;
        if (args.trackerUrl !== undefined) patch.trackerUrl = args.trackerUrl?.trim() || undefined;
        if (args.trackerName !== undefined) patch.trackerName = args.trackerName?.trim() || undefined;
        let doc = edit(ops.updateMeeting(d, m.id, patch));
        if (args.weekday !== undefined) {
          doc = edit(
            ops.setMeetingWeekday(doc, m.id, args.weekday === null ? undefined : parseWeekday(args.weekday))
          );
        }
        const after = doc.meetings.find((x) => x.id === m.id)!;
        const tracker = after.trackerUrl ? ` · notes in ${after.trackerName ?? trackerName(after.trackerUrl)}` : "";
        return `Updated ${meetingName(doc, after)}: ${after.rhythm}${after.anchorWeekday !== undefined ? ` on ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][after.anchorWeekday]}` : ""}${after.nextDate ? ` · booked ${after.nextDate}` : ""}${tracker}.`;
      })
  );

  tool(
    server,
    "set_meeting_rows",
    {
      title: "Set meeting rows (template)",
      description:
        "Replace a meeting's rows — the standing agenda every occurrence is laid out by, in order. Rows matched by label keep their topics; a removed row's topics become untagged on the board (they aren't deleted). Each row stamps its tag on topics dropped into it.",
      inputSchema: z.object({ meeting: z.string(), rows: z.array(rowSpec) }),
    },
    ({ meeting, rows }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        let doc = d;
        const next = buildRows(doc, m, rows, (p) => (doc = edit(p)));
        doc = edit(ops.setCurriculum(doc, m.id, next));
        return `${meetingName(doc, m)} — ${rowsText(doc, doc.meetings.find((x) => x.id === m.id)!)}`;
      })
  );

  tool(
    server,
    "add_meeting_row",
    {
      title: "Add a row",
      description: "Add one row to the end of a meeting's board, backed by the tag of the same name. Topics on this meeting already carrying that tag move into it.",
      inputSchema: z.object({ meeting: z.string(), label: z.string() }),
    },
    ({ meeting, label }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const added = ops.addMeetingRow(d, m.id, label);
        if (!added) throw new Error("Row label is empty.");
        const doc = edit(added.patch);
        return `${meetingName(doc, m)} — ${rowsText(doc, doc.meetings.find((x) => x.id === m.id)!)}`;
      })
  );

  tool(
    server,
    "set_coverage_targets",
    {
      title: "Set coverage targets",
      description: "What to come back to and how often: e.g. #training at least once every 4 occurrences. Replaces the list; [] clears it.",
      inputSchema: z.object({
        meeting: z.string(),
        targets: z.array(z.object({ tag: z.string(), everyN: z.number().int().min(1) })),
      }),
    },
    ({ meeting, targets }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const list = targets.map((t) => ({ tagId: resolveTag(d, t.tag).id, everyNOccurrences: t.everyN }));
        edit(ops.updateMeeting(d, m.id, { coverageTargets: list.length ? list : undefined }));
        return `Coverage for ${meetingName(d, m)}: ${
          list.map((t) => `#${d.tags.find((x) => x.id === t.tagId)?.label} every ${t.everyNOccurrences}`).join(", ") || "none"
        }.`;
      })
  );

  tool(
    server,
    "set_no_meeting",
    {
      title: "Decide: no meeting",
      description: "Record that I deliberately don't meet with this person/team/manager (clears them from the undecided count), or undo it.",
      inputSchema: z.object({ subject: z.string(), value: z.boolean() }),
    },
    ({ subject, value }) =>
      write((d, edit) => {
        const s = resolveSubject(d, subject);
        edit(ops.setNoMeeting(d, s.kind, s.id, value));
        return `${s.name}: ${value ? "no meeting, by decision" : "undecided again"}.`;
      })
  );

  tool(
    server,
    "delete_meeting",
    {
      title: "Stop tracking meeting",
      description: "Delete a meeting along with ALL its occurrences, write-ups and topics. Irreversible — only when explicitly asked. Pass confirm: true.",
      inputSchema: z.object({ meeting: z.string(), confirm: z.literal(true) }),
      annotations: { destructiveHint: true },
    },
    ({ meeting }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        edit(ops.untrackMeeting(d, m.id));
        return `Deleted ${meetingName(d, m)} and everything under it.`;
      })
  );

  // ── Occurrences ─────────────────────────────────────────────────────────

  tool(
    server,
    "skip_occurrence",
    {
      title: "Skip a week",
      description: "This occurrence isn't happening. Its planned topics go back to the meeting's ideas; the series carries on. A one-off is simply removed. A past, written-up meeting can't be skipped.",
      inputSchema: z.object({ meeting: z.string(), occurrence: z.string().describe('"next", YYYY-MM-DD, weekday, or id') }),
    },
    ({ meeting, occurrence }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const ref = resolveOccurrence(d, m, occurrence);
        const patch = ops.skipOccurrence(d, m.id, { sessionId: ref.session?.id ?? null, date: ref.date });
        if (!Object.keys(patch).length) throw new Error("That meeting already happened and was written up — nothing to skip.");
        edit(patch);
        return `Skipped ${meetingName(d, m)} on ${dayLabel(ref.date)}.`;
      })
  );

  tool(
    server,
    "restore_occurrence",
    {
      title: "Undo skip / move",
      description: "Bring back a skipped week, or put a moved occurrence back on its series date.",
      inputSchema: z.object({ meeting: z.string(), date: z.string().describe("The skipped date, or the moved occurrence's current date or id") }),
    },
    ({ meeting, date }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const byId = d.sessions.find((s) => s.id === date && s.meetingId === m.id);
        const day = byId ? byId.date : parseDate(date);
        const s: Session | undefined =
          byId ??
          d.sessions.find((x) => x.meetingId === m.id && x.date === day && x.kind === "skipped") ??
          d.sessions.find((x) => x.meetingId === m.id && x.date === day && x.seriesDate);
        if (!s) throw new Error(`Nothing skipped or moved on ${day}.`);
        const patch = ops.restoreOccurrence(d, s.id);
        if (!Object.keys(patch).length) throw new Error("Can't restore — its series date is already taken.");
        edit(patch);
        return s.kind === "skipped"
          ? `${meetingName(d, m)} is back on for ${dayLabel(s.date)}.`
          : `Moved back to ${dayLabel(s.seriesDate!)}.`;
      })
  );

  tool(
    server,
    "move_occurrence",
    {
      title: "Move an occurrence",
      description:
        "Move one occurrence to another date (just this one — the series remembers it), or with scope 'series' move the whole rhythm to that weekday from now on. Landing on a day that already has one merges the two.",
      inputSchema: z.object({
        meeting: z.string(),
        occurrence: z.string().describe('"next", YYYY-MM-DD, weekday, or id'),
        to: z.string().describe("YYYY-MM-DD"),
        scope: z.enum(["one", "series"]).optional(),
      }),
    },
    ({ meeting, occurrence, to, scope }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const ref = resolveOccurrence(d, m, occurrence);
        const moved = ops.moveOccurrence(
          d,
          m.id,
          { sessionId: ref.session?.id ?? null, date: ref.date },
          parseDate(to),
          scope ?? "one"
        );
        const doc = edit(moved.patch);
        return `Moved → ${occurrenceText(doc, m.id, moved.sessionId)}`;
      })
  );

  tool(
    server,
    "add_extra_occurrence",
    {
      title: "Add a one-off",
      description: "An extra occurrence outside the rhythm (it doesn't shift the series).",
      inputSchema: z.object({ meeting: z.string(), date: z.string() }),
    },
    ({ meeting, date }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const added = ops.addExtraOccurrence(d, m.id, parseDate(date));
        const doc = edit(added.patch);
        return `${Object.keys(added.patch).length ? "Added" : "Already on"}: ${occurrenceText(doc, m.id, added.sessionId)}`;
      })
  );

  tool(
    server,
    "write_up",
    {
      title: "Write up / prep an occurrence",
      description:
        "Set the point of an occurrence (why we're meeting this time), its notes (markdown — prep before, write-up after), transcript, the uncovered ledger, or the next booking. Books a projected occurrence if needed. Notes append by default; set replaceNotes to overwrite.",
      inputSchema: z.object({
        meeting: z.string(),
        occurrence: z.string().optional().describe('"next" (default), "last", YYYY-MM-DD, weekday, or id'),
        point: z.string().nullable().optional(),
        notes: z.string().optional(),
        replaceNotes: z.boolean().optional(),
        transcript: z.string().nullable().optional(),
        uncovered: z.array(z.string()).optional(),
        nextDate: z.string().nullable().optional(),
      }),
    },
    (args) =>
      write((d, edit) => {
        const m = resolveMeeting(d, args.meeting);
        const ref = resolveOccurrence(d, m, args.occurrence ?? "next");
        let doc = d;
        let id = ref.session?.id;
        if (!id) {
          id = ops.uid();
          doc = edit(ops.addSession(doc, id, { meetingId: m.id, date: ref.date }));
        }
        const s = doc.sessions.find((x) => x.id === id)!;
        const patch: Partial<Session> = {};
        if (args.point !== undefined) patch.point = args.point?.trim() || undefined;
        if (args.notes !== undefined) {
          patch.notes = args.replaceNotes
            ? args.notes.trim() || undefined
            : [s.notes?.trim(), args.notes.trim()].filter(Boolean).join("\n\n") || undefined;
        }
        if (args.transcript !== undefined) patch.transcript = args.transcript?.trim() || undefined;
        if (args.uncovered) patch.uncovered = args.uncovered.length ? args.uncovered : undefined;
        if (args.nextDate !== undefined) patch.nextDate = args.nextDate ? parseDate(args.nextDate) : undefined;
        doc = edit(ops.updateSession(doc, id, patch));
        return `Saved ${occurrenceText(doc, m.id, id)}.`;
      })
  );

  tool(
    server,
    "delete_occurrence",
    {
      title: "Delete occurrence",
      description: "Delete an occurrence and its write-up. Its planned topics go back to ideas. To cancel a week use skip_occurrence instead.",
      inputSchema: z.object({ meeting: z.string(), occurrence: z.string() }),
      annotations: { destructiveHint: true },
    },
    ({ meeting, occurrence }) =>
      write((d, edit) => {
        const m = resolveMeeting(d, meeting);
        const ref = resolveOccurrence(d, m, occurrence);
        if (!ref.session) throw new Error("That occurrence is only projected — nothing to delete.");
        edit(ops.deleteSession(d, ref.session.id));
        return `Deleted ${meetingName(d, m)} on ${dayLabel(ref.date)}.`;
      })
  );

  // ── Follow-ups ──────────────────────────────────────────────────────────

  tool(
    server,
    "add_follow_up",
    {
      title: "Add follow-up",
      description: "A commitment that outlives the conversation — it opens the next occurrence as 'Since last time'. Give a meeting, or a subject.",
      inputSchema: z.object({
        text: z.string(),
        meeting: z.string().optional(),
        subject: z.string().optional().describe("Person, team or manager when there's no meeting"),
        fromOccurrence: z.string().optional().describe("Occurrence it came out of"),
      }),
    },
    ({ text, meeting, subject, fromOccurrence }) =>
      write((d, edit) => {
        const m = meeting ? resolveMeeting(d, meeting) : undefined;
        const s = m
          ? { kind: m.subjectKind, id: m.subjectId }
          : subject
            ? resolveSubject(d, subject)
            : null;
        if (!s) throw new Error("Give a meeting or a subject.");
        const source = m && fromOccurrence ? resolveOccurrence(d, m, fromOccurrence).session?.id : undefined;
        const id = ops.uid();
        const patch = ops.addFollowUp(d, id, s.kind, s.id, text, { meetingId: m?.id, sourceSessionId: source });
        if (!Object.keys(patch).length) throw new Error("Follow-up text is empty.");
        edit(patch);
        return `Follow-up [${id}] ${text.trim()}`;
      })
  );

  tool(
    server,
    "update_follow_up",
    {
      title: "Complete / edit follow-up",
      description: "Mark a follow-up done (or reopen it), or change its text.",
      inputSchema: z.object({
        followUp: z.string().describe("Follow-up id"),
        done: z.boolean().optional(),
        text: z.string().optional(),
      }),
    },
    ({ followUp, done, text }) =>
      write((d, edit) => {
        const f = d.followUps.find((x) => x.id === followUp);
        if (!f) throw new Error(`No follow-up ${followUp}.`);
        let doc = d;
        if (done !== undefined) doc = edit(ops.setFollowUpDone(doc, f.id, done));
        if (text?.trim()) {
          doc = edit({ followUps: doc.followUps.map((x) => (x.id === f.id ? { ...x, text: text.trim() } : x)) });
        }
        const after = doc.followUps.find((x) => x.id === f.id)!;
        return `[${after.id}] ${after.text} — ${after.status}.`;
      })
  );

  tool(
    server,
    "delete_follow_up",
    {
      title: "Delete follow-up",
      description: "Delete a follow-up. Prefer marking it done.",
      inputSchema: z.object({ followUp: z.string() }),
      annotations: { destructiveHint: true },
    },
    ({ followUp }) =>
      write((d, edit) => {
        const f = d.followUps.find((x) => x.id === followUp);
        if (!f) throw new Error(`No follow-up ${followUp}.`);
        edit(ops.deleteFollowUp(d, f.id));
        return `Deleted follow-up "${f.text}".`;
      })
  );
}

