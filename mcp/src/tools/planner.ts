/**
 * Topics, the Ideas board and tags — everything a card can do on the planner.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { Tag, Topic, TopicPoint, TrackedMeeting } from "../../../src/types";
import * as ops from "../../../src/lib/ops.js";
import { findMeeting, findTag, parseCapture, splitCaptureLines } from "../../../src/lib/ideas.js";
import { todayISO } from "../../../src/lib/readiness.js";
import { dayLabel, topicLine } from "../format.js";
import {
  meetingName,
  resolveMeeting,
  resolveOccurrence,
  resolveRow,
  resolveTag,
  resolveTopic,
} from "../resolve.js";
import { tool, write, type Doc } from "./common.js";

const topicIds = z.array(z.string()).min(1).describe("Topic ids");

/** Tags by label, made on the spot when they don't exist — same as `#new` in the capture bar. */
function tagsFor(d: Doc, labels: string[], edit: (p: ops.Patch) => Doc): string[] {
  const ids: string[] = [];
  let doc = d;
  for (const raw of labels) {
    const label = raw.trim().replace(/^#/, "");
    if (!label) continue;
    const found = doc.tags.find((t) => t.id === label) ?? findTag(label.toLowerCase(), doc.tags);
    if (found) {
      ids.push(found.id);
      continue;
    }
    const id = ops.uid();
    doc = edit(ops.addTag(doc, id, label.charAt(0).toUpperCase() + label.slice(1)));
    ids.push(id);
  }
  return ids;
}

/** Where a topic sits, in words. */
function whereIs(d: Doc, t: Topic): string {
  const m = t.meetingId ? d.meetings.find((x) => x.id === t.meetingId) : undefined;
  const on = t.sessionId ? d.sessions.find((s) => s.id === t.sessionId) : undefined;
  const row = m?.curriculum?.find((c) => c.id === t.slotId)?.label;
  const home = m ? meetingName(d, m) : "Ideas (unassigned)";
  const when = on ? ` on ${dayLabel(on.date)}` : t.lane === "parked" ? " (parked)" : m ? " ideas" : "";
  return `${home}${when}${row ? ` · ${row}` : ""}`;
}

/**
 * The drop target for a meeting / occurrence / row / lane combination —
 * the same `ColumnTarget` the drag engine hands the store.
 */
function targetFor(
  d: Doc,
  meeting: TrackedMeeting | undefined,
  opts: { occurrence?: string; row?: string; lane?: "ideas" | "parked" }
): ops.PlaceTarget | undefined {
  if ((opts.occurrence || opts.row) && !meeting) {
    throw new Error("An occurrence or row needs a meeting.");
  }
  const slotId = meeting && opts.row ? resolveRow(meeting, opts.row).id : undefined;
  if (meeting && opts.occurrence) {
    if (opts.lane) throw new Error("Pass an occurrence or a lane, not both.");
    const ref = resolveOccurrence(d, meeting, opts.occurrence);
    return ref.session
      ? { kind: "session", sessionId: ref.session.id, slotId, meetingId: meeting.id }
      : { kind: "projected", date: ref.date, slotId, meetingId: meeting.id };
  }
  if (opts.lane || meeting || slotId) {
    return {
      kind: "lane",
      lane: opts.lane === "parked" ? "parked" : "backlog",
      slotId,
      meetingId: meeting?.id,
    };
  }
  return undefined;
}

export function registerPlannerTools(server: McpServer): void {
  tool(
    server,
    "capture",
    {
      title: "Capture topics",
      description:
        "Add topics with the capture-bar grammar: one topic per line, `#tag` (unknown tags are created), `@meeting` to file it, `!` for urgent. " +
        "Without a meeting it lands on the Ideas board unassigned. Give meeting + occurrence (\"next\", a date, \"friday\") to put it straight on that week's agenda — a projected week is booked on the way in. Give row to drop it into a row (it picks up the row's tag).",
      inputSchema: z.object({
        text: z.string().describe("e.g. 'Rewrite the covenant #training @staff !' — several lines = several topics"),
        meeting: z.string().optional().describe("Default meeting for lines without an @mention (id or name)"),
        occurrence: z.string().optional().describe('"next", YYYY-MM-DD, a weekday, or an occurrence id'),
        row: z.string().optional().describe("Row on that meeting's board (id or label)"),
        parked: z.boolean().optional().describe("Park it instead (deferred, not now)"),
      }),
    },
    ({ text, meeting, occurrence, row, parked }) =>
      write((d, edit) => {
        const m = meeting ? resolveMeeting(d, meeting) : undefined;
        const target = targetFor(d, m, { occurrence, row, lane: parked ? "parked" : undefined });
        const { patch, created } = ops.captureTopics(d, text, target);
        if (!created.length) return "Nothing captured — every line was empty.";
        const doc = edit(patch);

        const labelOf = ops.meetingLabelOf(d);
        const unmatched = splitCaptureLines(text)
          .map((l) => parseCapture(l).meetingQuery)
          .filter((q): q is string => Boolean(q) && !findMeeting(q!, d.meetings, labelOf));
        const newTags = doc.tags.filter((t) => !d.tags.some((x) => x.id === t.id));

        const lines = created.map((id) => {
          const t = doc.topics.find((x) => x.id === id)!;
          return `${topicLine(doc, t)} → ${whereIs(doc, t)}`;
        });
        if (newTags.length) lines.push(`New tags: ${newTags.map((t) => `#${t.label}`).join(", ")}`);
        if (unmatched.length) {
          lines.push(`No meeting matched ${unmatched.map((q) => `@${q}`).join(", ")} — those lines were filed without it.`);
        }
        return lines.join("\n");
      })
  );

  tool(
    server,
    "update_topic",
    {
      title: "Edit topic",
      description:
        "Change a topic's text, notes (detail), urgency, due date, status, tags or points. Tags given by label are created if new. Points are the checklist a topic breaks down into.",
      inputSchema: z.object({
        topic: z.string().describe("Topic id"),
        text: z.string().optional(),
        detail: z.string().nullable().optional().describe("The longer notes behind the one-liner; null clears"),
        urgent: z.boolean().optional(),
        dueDate: z.string().nullable().optional().describe("YYYY-MM-DD; null clears"),
        status: z.enum(["open", "covered", "dropped"]).optional(),
        tags: z.array(z.string()).optional().describe("Replace all tags"),
        addTags: z.array(z.string()).optional(),
        removeTags: z.array(z.string()).optional(),
        points: z
          .array(z.object({ text: z.string(), done: z.boolean().optional() }))
          .optional()
          .describe("Replace the whole checklist"),
        addPoints: z.array(z.string()).optional(),
        checkPoints: z
          .array(z.string())
          .optional()
          .describe("Point ids or 1-based numbers to tick"),
        uncheckPoints: z.array(z.string()).optional(),
      }),
    },
    (args) =>
      write((d, edit) => {
        const t = resolveTopic(d, args.topic);
        const patch: Partial<Topic> = {};
        if (args.text !== undefined) {
          if (!args.text.trim()) throw new Error("Topic text can't be empty.");
          patch.text = args.text.trim();
        }
        if (args.detail !== undefined) patch.detail = args.detail?.trim() || undefined;
        if (args.urgent !== undefined) patch.urgent = args.urgent || undefined;
        if (args.dueDate !== undefined) patch.dueDate = args.dueDate ?? undefined;
        if (args.status && args.status !== t.status) {
          patch.status = args.status;
          patch.closedOn = args.status === "open" ? undefined : todayISO();
        }

        let doc = d;
        let tagIds = t.tagIds;
        if (args.tags) tagIds = tagsFor(doc, args.tags, (p) => (doc = edit(p)));
        if (args.addTags) {
          const add = tagsFor(doc, args.addTags, (p) => (doc = edit(p)));
          tagIds = [...tagIds, ...add.filter((x) => !tagIds.includes(x))];
        }
        if (args.removeTags) {
          const drop = new Set(args.removeTags.map((l) => resolveTag(doc, l).id));
          tagIds = tagIds.filter((x) => !drop.has(x));
        }
        if (tagIds !== t.tagIds) patch.tagIds = tagIds;

        let points: TopicPoint[] | undefined = t.points;
        if (args.points) {
          points = args.points.map((p) => ({
            id: t.points?.find((x) => x.text === p.text)?.id ?? ops.uid(),
            text: p.text,
            done: Boolean(p.done),
          }));
        }
        if (args.addPoints) {
          points = [...(points ?? []), ...args.addPoints.map((text) => ({ id: ops.uid(), text, done: false }))];
        }
        const mark = (refs: string[] | undefined, done: boolean) => {
          if (!refs) return;
          for (const ref of refs) {
            const i = /^\d+$/.test(ref) ? Number(ref) - 1 : (points ?? []).findIndex((p) => p.id === ref);
            if (!points || i < 0 || i >= points.length) throw new Error(`No point "${ref}" on this topic.`);
            points = points.map((p, j) => (j === i ? { ...p, done } : p));
          }
        };
        mark(args.checkPoints, true);
        mark(args.uncheckPoints, false);
        if (points !== t.points) patch.points = points?.length ? points : undefined;

        doc = edit(ops.updateTopic(doc, t.id, patch));
        return `Updated.\n${topicLine(doc, doc.topics.find((x) => x.id === t.id)!, { home: true, when: true })}`;
      })
  );

  tool(
    server,
    "place_topic",
    {
      title: "Move topic",
      description:
        "Move a topic like dragging its card: onto a meeting's occurrence (\"next\", a date, a weekday — projected weeks get booked), into a row, back to that meeting's ideas, or parked. Reopens a covered topic. `position` is its 0-based place among the cards it lands beside.",
      inputSchema: z.object({
        topic: z.string().describe("Topic id"),
        meeting: z.string().optional().describe("Target meeting; defaults to the topic's own"),
        occurrence: z.string().optional(),
        row: z.string().optional(),
        lane: z.enum(["ideas", "parked"]).optional().describe("Off the weeks: back to ideas, or parked"),
        position: z.number().int().min(0).optional(),
      }),
    },
    ({ topic, meeting, occurrence, row, lane, position }) =>
      write((d, edit) => {
        const t = resolveTopic(d, topic);
        const m = meeting
          ? resolveMeeting(d, meeting)
          : t.meetingId
            ? d.meetings.find((x) => x.id === t.meetingId)
            : undefined;
        const target = targetFor(d, m, { occurrence, row, lane: lane ?? (occurrence ? undefined : "ideas") });
        if (!target) throw new Error("Say where: a meeting occurrence, a row, or a lane.");
        const doc = edit(ops.placeTopicAt(d, t.id, target, position));
        const moved = doc.topics.find((x) => x.id === t.id)!;
        return `Moved → ${whereIs(doc, moved)}\n${topicLine(doc, moved)}`;
      })
  );

  tool(
    server,
    "cover_topics",
    {
      title: "Mark covered",
      description: "Tick topics off as talked about — or reopen them with covered: false.",
      inputSchema: z.object({ topics: topicIds, covered: z.boolean().optional() }),
    },
    ({ topics, covered }) =>
      write((d, edit) => {
        let doc = d;
        for (const ref of topics) doc = edit(ops.coverTopic(doc, resolveTopic(doc, ref).id, covered ?? true));
        return `${covered === false ? "Reopened" : "Covered"} ${topics.length} topic(s).`;
      })
  );

  tool(
    server,
    "assign_topics",
    {
      title: "Assign to meeting",
      description: "File topics under a meeting's ideas, or pass meeting: null to send them back to the unassigned Ideas pile. Clears their row.",
      inputSchema: z.object({ topics: topicIds, meeting: z.string().nullable() }),
    },
    ({ topics, meeting }) =>
      write((d, edit) => {
        const m = meeting ? resolveMeeting(d, meeting) : null;
        const ids = topics.map((ref) => resolveTopic(d, ref).id);
        edit(ops.assignTopics(d, ids, m?.id ?? null));
        return `Assigned ${ids.length} topic(s) to ${m ? meetingName(d, m) : "Ideas (unassigned)"}.`;
      })
  );

  tool(
    server,
    "park_topics",
    {
      title: "Park topics",
      description: "Park topics (defer — not now) or unpark them back to ideas.",
      inputSchema: z.object({ topics: topicIds, parked: z.boolean() }),
    },
    ({ topics, parked }) =>
      write((d, edit) => {
        const ids = topics.map((ref) => resolveTopic(d, ref).id);
        edit(ops.parkTopics(d, ids, parked));
        return `${parked ? "Parked" : "Unparked"} ${ids.length} topic(s).`;
      })
  );

  tool(
    server,
    "tag_topics",
    {
      title: "Tag topics",
      description: "Add a tag to (or remove it from) several topics. Adding an unknown tag creates it.",
      inputSchema: z.object({ topics: topicIds, tag: z.string(), on: z.boolean().optional() }),
    },
    ({ topics, tag, on }) =>
      write((d, edit) => {
        const adding = on ?? true;
        let doc = d;
        const tagId = adding ? tagsFor(doc, [tag], (p) => (doc = edit(p)))[0] : resolveTag(doc, tag).id;
        const ids = topics.map((ref) => resolveTopic(doc, ref).id);
        edit(ops.tagTopics(doc, ids, tagId, adding));
        return `${adding ? "Tagged" : "Untagged"} ${ids.length} topic(s).`;
      })
  );

  tool(
    server,
    "move_topic",
    {
      title: "Reorder topic",
      description: "Nudge a topic up or down among the cards beside it.",
      inputSchema: z.object({
        topic: z.string(),
        direction: z.enum(["up", "down"]),
        steps: z.number().int().min(1).max(50).optional(),
      }),
    },
    ({ topic, direction, steps }) =>
      write((d, edit) => {
        const id = resolveTopic(d, topic).id;
        let doc = d;
        let at: { index: number; total: number } | null = null;
        for (let i = 0; i < (steps ?? 1); i++) {
          const moved = ops.moveTopic(doc, id, direction === "up" ? -1 : 1);
          if (!moved) break;
          doc = edit(moved.patch);
          at = moved;
        }
        return at ? `Now ${at.index + 1} of ${at.total}.` : "Already at the edge.";
      })
  );

  tool(
    server,
    "return_topic",
    {
      title: "Take off the week",
      description:
        "Pull a topic off the occurrence it's on and back to ideas, recording it as not covered there and counting it as carried. Use place_topic instead for a plain move.",
      inputSchema: z.object({ topic: z.string() }),
    },
    ({ topic }) =>
      write((d, edit) => {
        const t = resolveTopic(d, topic);
        if (!t.sessionId) throw new Error("That topic isn't on an occurrence.");
        edit(ops.returnTopic(d, t.id));
        return `Returned "${t.text}" to ideas.`;
      })
  );

  tool(
    server,
    "carry_forward",
    {
      title: "Carry forward loose topics",
      description:
        "Roll every topic still open on a past occurrence onto that meeting's next one (backlog if there's none), stamping the carry count and the 'not covered' ledger. The app does this when it opens; run it before reading an agenda if the app hasn't been opened today.",
      inputSchema: z.object({}),
    },
    () =>
      write((d, edit) => {
        const { patch, count } = ops.sweepReturns(d);
        if (!count) return "Nothing loose.";
        edit(patch);
        return `Carried ${count} topic(s) forward.`;
      })
  );

  tool(
    server,
    "promote_topic",
    {
      title: "Promote to follow-up",
      description: "A topic that's really a commitment: make it a follow-up on its meeting's subject and drop the topic.",
      inputSchema: z.object({ topic: z.string() }),
    },
    ({ topic }) =>
      write((d, edit) => {
        const t = resolveTopic(d, topic);
        if (!t.meetingId) throw new Error("Assign the topic to a meeting first.");
        const id = ops.uid();
        edit(ops.promoteToFollowUp(d, t.id, id));
        return `Follow-up [${id}] ${t.text}`;
      })
  );

  tool(
    server,
    "delete_topics",
    {
      title: "Delete topics",
      description: "Delete topics outright. Prefer cover_topics (done) or update_topic status 'dropped' (decided against) — those keep history.",
      inputSchema: z.object({ topics: topicIds }),
      annotations: { destructiveHint: true },
    },
    ({ topics }) =>
      write((d, edit) => {
        const doomed = topics.map((ref) => resolveTopic(d, ref));
        edit(ops.deleteTopics(d, doomed.map((t) => t.id)));
        return `Deleted: ${doomed.map((t) => t.text).join("; ")}`;
      })
  );

  // ── Tags ────────────────────────────────────────────────────────────────

  tool(
    server,
    "create_tag",
    {
      title: "Create tag",
      description: "A workspace tag. Tags mean the same thing on every meeting and on the Ideas board.",
      inputSchema: z.object({
        label: z.string(),
        color: z.number().int().min(0).max(5).optional().describe("Palette index 0–5"),
      }),
    },
    ({ label, color }) =>
      write((d, edit) => {
        const existing = d.tags.find((t) => t.label.toLowerCase() === label.trim().replace(/^#/, "").toLowerCase());
        if (existing) return `#${existing.label} already exists [${existing.id}].`;
        const id = ops.uid();
        let doc = edit(ops.addTag(d, id, label.trim().replace(/^#/, "")));
        if (color !== undefined) doc = edit(ops.updateTag(doc, id, { color }));
        return `Created #${doc.tags.find((t) => t.id === id)!.label} [${id}].`;
      })
  );

  tool(
    server,
    "update_tag",
    {
      title: "Edit tag",
      description: "Rename or recolor a tag, or change its place in the order.",
      inputSchema: z.object({
        tag: z.string().describe("Tag id or label"),
        label: z.string().optional(),
        color: z.number().int().min(0).max(5).optional(),
        order: z.number().int().min(0).optional(),
      }),
    },
    ({ tag, label, color, order }) =>
      write((d, edit) => {
        const t = resolveTag(d, tag);
        const patch: Partial<Tag> = {};
        if (label?.trim()) patch.label = label.trim().replace(/^#/, "");
        if (color !== undefined) patch.color = color;
        let doc = d;
        if (order !== undefined) {
          const rest = doc.tags.filter((x) => x.id !== t.id).sort((a, b) => a.order - b.order);
          rest.splice(Math.min(order, rest.length), 0, t);
          for (const [i, x] of rest.entries()) {
            if (x.order !== i) doc = edit(ops.updateTag(doc, x.id, { order: i }));
          }
        }
        doc = edit(ops.updateTag(doc, t.id, patch));
        // A row named after the tag should keep reading the same.
        if (patch.label) {
          for (const m of doc.meetings) {
            if (!m.curriculum?.some((c) => c.tagId === t.id && c.label === t.label)) continue;
            doc = edit(
              ops.updateMeeting(doc, m.id, {
                curriculum: m.curriculum.map((c) =>
                  c.tagId === t.id && c.label === t.label ? { ...c, label: patch.label! } : c
                ),
              })
            );
          }
        }
        return `Updated #${doc.tags.find((x) => x.id === t.id)!.label}.`;
      })
  );

  tool(
    server,
    "delete_tag",
    {
      title: "Delete tag",
      description: "Delete a tag. Topics keep their text; rows and coverage targets that pointed at it are unwired.",
      inputSchema: z.object({ tag: z.string() }),
      annotations: { destructiveHint: true },
    },
    ({ tag }) =>
      write((d, edit) => {
        const t = resolveTag(d, tag);
        edit(ops.deleteTag(d, t.id));
        return `Deleted #${t.label}.`;
      })
  );
}
