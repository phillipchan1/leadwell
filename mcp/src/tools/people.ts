/**
 * People, teams and the leaders I report to: notes, wins, prayer, health and
 * the profile fields. Health and prayer are my own reads — the tool
 * descriptions say to write them only when asked.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { HealthLevel, LeadUpProfile, Manager, Person, Team } from "../../../src/types";
import * as ops from "../../../src/lib/ops.js";
import { todayISO } from "../../../src/lib/readiness.js";
import { resolveSubject } from "../resolve.js";
import { tool, write, type Doc } from "./common.js";

const leadUp = z
  .object({
    archetype: z.string().optional(),
    winsLike: z.string().optional(),
    anxieties: z.string().optional(),
    currency: z.string().optional(),
    comms: z.string().optional(),
    theirScorecard: z.string().optional(),
  })
  .describe("Operating manual for someone I report to");

function patchRow<T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

export function registerPeopleTools(server: McpServer): void {
  tool(
    server,
    "add_note",
    {
      title: "Add note",
      description: "A dated note on a person, manager or team (markdown).",
      inputSchema: z.object({
        subject: z.string().describe("Id or name"),
        body: z.string(),
        date: z.string().optional().describe("YYYY-MM-DD, default today"),
      }),
    },
    ({ subject, body, date }) =>
      write((d, edit) => {
        const s = resolveSubject(d, subject);
        const text = body.trim();
        if (!text) throw new Error("Note is empty.");
        const id = ops.uid();
        const day = date ?? todayISO();
        if (s.kind === "team") {
          edit({ teamNotes: [...d.teamNotes, { id, teamId: s.id, body: text, date: day }] });
        } else {
          edit({ notes: [...d.notes, { id, personId: s.id, body: text, date: day }] });
        }
        return `Note [${id}] on ${s.name}.`;
      })
  );

  tool(
    server,
    "add_win",
    {
      title: "Bank a win",
      description: "A delivered win banked with someone I report to, phrased in their currency — evidence for reviews and asks.",
      inputSchema: z.object({
        subject: z.string().describe("The manager (or up-team person) it's banked with"),
        text: z.string(),
        impact: z.string().optional().describe("The impact in their language / metric"),
        date: z.string().optional(),
      }),
    },
    ({ subject, text, impact, date }) =>
      write((d, edit) => {
        const s = resolveSubject(d, subject);
        if (s.kind === "team") throw new Error("Wins are banked with a person or manager.");
        const id = ops.uid();
        edit({
          wins: [
            ...d.wins,
            { id, personId: s.id, text: text.trim(), impact: impact?.trim() || undefined, date: date ?? todayISO() },
          ],
        });
        return `Win [${id}] banked with ${s.name}.`;
      })
  );

  tool(
    server,
    "add_prayer",
    {
      title: "Write down a prayer",
      description:
        "Add a burden (something I'm asking for) or scripture (something I'm praying over them) to someone's prayer log. Starts carrying them if I wasn't.",
      inputSchema: z.object({
        subject: z.string(),
        text: z.string(),
        kind: z.enum(["burden", "scripture"]).optional(),
      }),
    },
    ({ subject, text, kind }) =>
      write((d, edit) => {
        const s = resolveSubject(d, subject);
        const id = ops.uid();
        let doc = edit({
          prayers: [
            ...d.prayers,
            { id, subjectKind: s.kind, subjectId: s.id, date: todayISO(), kind: kind ?? "burden", text: text.trim() },
          ],
        });
        doc = edit(ops.patchPrayer(doc, s.kind, s.id, (p) => p ?? { since: todayISO() }));
        return `Prayer [${id}] for ${s.name}.`;
      })
  );

  tool(
    server,
    "answer_prayer",
    {
      title: "Mark prayer answered",
      description: "Record that a burden was answered, and what happened. answered: false reopens it.",
      inputSchema: z.object({
        prayer: z.string().describe("Prayer entry id"),
        note: z.string().optional(),
        answered: z.boolean().optional(),
      }),
    },
    ({ prayer, note, answered }) =>
      write((d, edit) => {
        const e = d.prayers.find((x) => x.id === prayer);
        if (!e) throw new Error(`No prayer entry ${prayer}.`);
        const reopen = answered === false;
        edit({
          prayers: patchRow(d.prayers, e.id, reopen
            ? { answeredOn: undefined, answerNote: undefined }
            : { answeredOn: e.answeredOn ?? todayISO(), answerNote: note?.trim() || e.answerNote }),
        });
        return reopen ? "Reopened." : `Answered: ${e.text}`;
      })
  );

  tool(
    server,
    "set_prayer",
    {
      title: "Carry / mark prayed",
      description:
        "Prayer marks for a person, team or manager: take them up or lay them down (carrying), set the one-line focus, or mark that I prayed today. Only when I say so.",
      inputSchema: z.object({
        subject: z.string(),
        carrying: z.boolean().optional(),
        focus: z.string().optional(),
        prayedToday: z.boolean().optional(),
      }),
    },
    ({ subject, carrying, focus, prayedToday }) =>
      write((d, edit) => {
        const s = resolveSubject(d, subject);
        const today = todayISO();
        let doc = d;
        if (carrying !== undefined) {
          doc = edit(ops.patchPrayer(doc, s.kind, s.id, (p) => (carrying ? (p ?? { since: today }) : undefined)));
        }
        if (focus !== undefined) {
          doc = edit(
            ops.patchPrayer(doc, s.kind, s.id, (p) => ({ ...(p ?? { since: today }), focus: focus.trim() || undefined }))
          );
        }
        if (prayedToday) {
          doc = edit(
            ops.patchPrayer(doc, s.kind, s.id, (p) => {
              const base = p ?? { since: today };
              if (base.lastPrayedOn === today) return base;
              return { ...base, lastPrayedOn: today, times: (base.times ?? 0) + 1 };
            })
          );
        }
        return `Prayer updated for ${s.name}.`;
      })
  );

  tool(
    server,
    "set_health",
    {
      title: "Set health read",
      description:
        "My read on how a team or person is doing: thriving, solid, watch, strained, critical (null clears). A judgment call — only set it when I tell you what it is.",
      inputSchema: z.object({
        subject: z.string(),
        level: z.enum(["thriving", "solid", "watch", "strained", "critical"]).nullable().optional(),
        note: z.string().optional().describe("One line of evidence"),
      }),
    },
    ({ subject, level, note }) =>
      write((d, edit) => {
        const s = resolveSubject(d, subject);
        if (s.kind === "manager") throw new Error("Health is tracked for people and teams.");
        const current = (s.kind === "team" ? d.teams : d.people).find((x) => x.id === s.id)!.health;
        let health = current;
        if (level !== undefined) {
          health = level ? { level: level as HealthLevel, note: current?.note, ratedOn: todayISO() } : undefined;
        }
        if (note !== undefined && health) health = { ...health, note: note.trim() || undefined };
        if (s.kind === "team") edit({ teams: patchRow(d.teams, s.id, { health }) });
        else edit({ people: patchRow(d.people, s.id, { health }) });
        return health ? `${s.name}: ${health.level}${health.note ? ` — ${health.note}` : ""}.` : `${s.name}: health cleared.`;
      })
  );

  tool(
    server,
    "update_profile",
    {
      title: "Edit person / team / manager",
      description:
        "Update profile fields. People: name, role, howToLead, strengths, watchOuts, assessments, leadUp. Teams: name, purpose (mandate), description, cadence. Managers: name, role, leadUp. List fields replace.",
      inputSchema: z.object({
        subject: z.string(),
        name: z.string().optional(),
        role: z.string().optional(),
        howToLead: z.string().optional(),
        strengths: z.array(z.string()).optional(),
        watchOuts: z.array(z.string()).optional(),
        relationshipType: z.string().optional(),
        assessments: z
          .object({
            cliftonTop5: z.array(z.string()).max(5).optional(),
            enneagram: z.string().optional(),
            mbti: z.string().optional(),
          })
          .optional(),
        leadUp: leadUp.optional(),
        purpose: z.string().optional(),
        description: z.string().optional(),
        cadence: z.string().optional(),
      }),
    },
    (args) =>
      write((d, edit) => {
        const s = resolveSubject(d, args.subject);
        const text = (v?: string) => (v === undefined ? undefined : v.trim() || undefined);
        const set = <T extends object>(patch: T, key: keyof T, value: unknown) => {
          if (value !== undefined) Object.assign(patch, { [key]: value });
        };
        if (s.kind === "person") {
          const p = d.people.find((x) => x.id === s.id)!;
          const patch: Partial<Person> = {};
          if (args.name?.trim()) patch.name = args.name.trim();
          set(patch, "role", text(args.role));
          set(patch, "howToLead", text(args.howToLead));
          set(patch, "relationshipType", text(args.relationshipType));
          if (args.strengths) patch.strengths = args.strengths;
          if (args.watchOuts) patch.watchOuts = args.watchOuts;
          if (args.assessments) patch.assessments = { ...p.assessments, ...args.assessments };
          if (args.leadUp) patch.leadUp = { ...p.leadUp, ...(args.leadUp as LeadUpProfile) };
          edit({ people: patchRow(d.people, s.id, patch) });
        } else if (s.kind === "team") {
          const patch: Partial<Team> = {};
          if (args.name?.trim()) patch.name = args.name.trim();
          set(patch, "purpose", text(args.purpose));
          set(patch, "description", text(args.description));
          set(patch, "cadence", text(args.cadence));
          edit({ teams: patchRow(d.teams, s.id, patch) });
        } else {
          const m = d.managers.find((x) => x.id === s.id)!;
          const patch: Partial<Manager> = {};
          if (args.name?.trim()) patch.name = args.name.trim();
          set(patch, "role", text(args.role));
          if (args.leadUp) patch.leadUp = { ...m.leadUp, ...(args.leadUp as LeadUpProfile) };
          edit({ managers: patchRow(d.managers, s.id, patch) });
        }
        return `Updated ${s.name}.`;
      })
  );

  tool(
    server,
    "add_person",
    {
      title: "Add person",
      description: "Add someone I lead — on a team, or as a direct report with no team.",
      inputSchema: z.object({
        name: z.string(),
        role: z.string().optional(),
        team: z.string().optional().describe("Team id or name"),
      }),
    },
    ({ name, role, team }) =>
      write((d, edit) => {
        const t = team ? resolveSubject(d, team, "team") : undefined;
        const id = ops.uid();
        edit({
          people: [
            ...d.people,
            {
              id,
              name: name.trim(),
              role: role?.trim() || undefined,
              teamId: t?.id,
              assessments: {},
              strengths: [],
              watchOuts: [],
              customModalities: [],
            },
          ],
        });
        return `Added ${name.trim()} [${id}]${t ? ` to ${t.name}` : " as a direct report"}.`;
      })
  );

  tool(
    server,
    "add_team",
    {
      title: "Add team",
      description: "Add a team I lead (optionally nested under another team).",
      inputSchema: z.object({
        name: z.string(),
        purpose: z.string().optional(),
        parent: z.string().optional().describe("Parent team id or name"),
        domainId: z.string().optional(),
      }),
    },
    ({ name, purpose, parent, domainId }) =>
      write((d: Doc, edit) => {
        const p = parent ? resolveSubject(d, parent, "team") : undefined;
        const parentTeam = p ? d.teams.find((t) => t.id === p.id) : undefined;
        const id = ops.uid();
        edit({
          teams: [
            ...d.teams,
            {
              id,
              name: name.trim(),
              capacityId: d.capacities[0]?.id ?? "",
              purpose: purpose?.trim() || undefined,
              parentId: parentTeam?.id,
              domainId: domainId ?? parentTeam?.domainId,
              order: d.teams.length,
              ...(parentTeam ? { direction: "down" as const } : null),
            },
          ],
        });
        return `Added team ${name.trim()} [${id}].`;
      })
  );
}
