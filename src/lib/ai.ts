import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, Person, Team } from "../types";
import {
  DOMAIN_COLOR,
  MBTI,
  parseEnneagram,
  THEME_DOMAIN,
} from "../data/frameworks";
import { derivedRead } from "./derive";
import { useStore } from "../store/useStore";

const ENV_API_KEY: string | undefined = import.meta.env
  .VITE_ANTHROPIC_API_KEY as string | undefined;

/** Resolve Anthropic key: in-app setting first, then env fallback. */
export function getApiKey(): string | undefined {
  const stored = useStore.getState().anthropicApiKey;
  if (stored?.trim()) return stored.trim();
  return ENV_API_KEY || undefined;
}

export function hasApiKey(): boolean {
  return Boolean(getApiKey());
}

/** @deprecated Prefer getApiKey() — kept for any stray imports. */
export const API_KEY: string | undefined = ENV_API_KEY;

function client(): Anthropic {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("No Anthropic API key configured.");
  return new Anthropic({
    apiKey,
    // Single-user local app; the key never leaves this machine.
    dangerouslyAllowBrowser: true,
  });
}

/** Build the full leadership-context system prompt for one person. */
export function personSystemPrompt(personId: string): string {
  const s = useStore.getState();
  const person = s.people.find((p) => p.id === personId);
  if (!person) return orgSystemPrompt();

  const team = s.teams.find((t) => t.id === person.teamId);
  const capacity = s.capacities.find((c) => c.id === team?.capacityId);
  const read = derivedRead(person);
  const enn = parseEnneagram(person.assessments.enneagram);
  const goals = s.goals.filter((g) => g.personId === person.id);
  const notes = s.notes
    .filter((n) => n.personId === person.id)
    .slice(-5);
  const oneOnOnes = s.oneOnOnes
    .filter((o) => o.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const actions = s.actions.filter(
    (a) => a.personId === person.id && !a.done
  );
  const isLeadUp = team?.direction === "up";
  const lu = person.leadUp;
  const wins = s.wins
    .filter((w) => w.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const manualLines = isLeadUp && lu
    ? [
        lu.winsLike && `- What "good" looks like to them: ${lu.winsLike}`,
        lu.anxieties && `- What makes them anxious: ${lu.anxieties}`,
        lu.currency && `- Their currency (what earns trust): ${lu.currency}`,
        lu.comms && `- How they want to hear from me: ${lu.comms}`,
        lu.theirScorecard &&
          `- What they're measured on by their boss: ${lu.theirScorecard}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const top5 = (person.assessments.cliftonTop5 ?? [])
    .map((t, i) => `${i + 1}. ${t} (${THEME_DOMAIN[t] ?? "?"})`)
    .join("\n");

  const topicLines = actions
    .map((a) => {
      const col = a.column ?? "backlog";
      return `- [${col}] ${a.text}`;
    })
    .join("\n");

  return [
    `You are a leadership coach helping ${s.me.name} lead one specific person well. Be practical, specific, and grounded in the person's assessment profile. Keep answers concise and actionable.`,
    ``,
    `## Person: ${person.name}`,
    person.role && `Role: ${person.role}`,
    team && `Team: ${team.name}`,
    team?.direction === "up"
      ? `Relationship: ${person.name} is a leader ${s.me.name} REPORTS TO. Coaching here is about leading up — communicating well, building trust, bringing solutions, and managing this relationship — not about directing them.`
      : capacity &&
        `${s.me.name}'s capacity for this team: ${capacity.label} (${
          capacity.label === "Manager"
            ? "formal authority"
            : capacity.label === "Leader"
              ? "leads without formal authority"
              : "leads peers through influence"
        })`,
    person.relationshipType && `Relationship: ${person.relationshipType}`,
    ``,
    top5 && `## CliftonStrengths Top 5\n${top5}`,
    enn &&
      `## Enneagram\n${person.assessments.enneagram} — ${enn.name}${
        enn.wing ? ` with a ${enn.wing} wing` : ""
      }`,
    person.assessments.mbti &&
      `## MBTI\n${person.assessments.mbti} — ${
        MBTI[person.assessments.mbti.toUpperCase()] ?? ""
      }`,
    read.strengths.length &&
      `## Strengths\n${read.strengths.map((x) => `- ${x}`).join("\n")}`,
    read.watchOuts.length &&
      `## Watch-outs\n${read.watchOuts.map((x) => `- ${x}`).join("\n")}`,
    person.howToLead && `## How to lead them\n${person.howToLead}`,
    manualLines &&
      `## Operating manual (how to succeed with them)\nThis is their wiring as ${s.me.name}'s manager — reward, anxieties, currency, and scorecard. Anchor leading-up advice on this, especially their currency and what their own boss measures them on.\n${manualLines}`,
    isLeadUp &&
      wins.length &&
      `## Wins banked with them\nValue ${s.me.name} has delivered, in their currency — usable as evidence at reviews or before an ask:\n${wins
        .map((w) => `- ${w.date}: ${w.text}${w.impact ? ` — ${w.impact}` : ""}`)
        .join("\n")}`,
    goals.length &&
      `## Current goals\n${goals
        .map((g) => `- ${g.title} (${Math.round(g.progress)}%)`)
        .join("\n")}`,
    topicLines && `## Open topics / actions\n${topicLines}`,
    oneOnOnes.length &&
      `## Recent 1:1s\n${oneOnOnes
        .map((o) => `- ${o.date}: ${o.notes ?? "(no notes)"}`)
        .join("\n")}`,
    notes.length &&
      `## Recent notes\n${notes.map((n) => `- ${n.date}: ${n.body}`).join("\n")}`,
    !top5 && !enn && !person.assessments.mbti
      ? `\nNo assessments recorded yet — suggest getting CliftonStrengths, Enneagram, or MBTI results, but still give practical general coaching.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build the leadership-context system prompt for a whole team. */
export function teamSystemPrompt(teamId: string): string {
  const s = useStore.getState();
  const team = s.teams.find((t) => t.id === teamId);
  if (!team) return orgSystemPrompt();

  const capacity = s.capacities.find((c) => c.id === team.capacityId);
  const domain = s.domains.find((d) => d.id === team.domainId);
  const parent = s.teams.find((t) => t.id === team.parentId);
  const children = s.teams
    .filter((t) => t.parentId === team.id)
    .sort((a, b) => a.order - b.order);
  const members = s.people.filter((p) => p.teamId === team.id);
  const goals = s.teamGoals.filter((g) => g.teamId === team.id);
  const actions = s.teamActions.filter((a) => a.teamId === team.id && !a.done);
  const notes = s.teamNotes.filter((n) => n.teamId === team.id).slice(-5);

  const memberLines = members
    .map((p) => {
      const a = p.assessments;
      const bits = [
        p.role,
        a.cliftonTop5?.length
          ? `Top5: ${a.cliftonTop5.join(", ")}`
          : "unassessed",
        a.enneagram && `Enneagram ${a.enneagram}`,
        a.mbti,
      ]
        .filter(Boolean)
        .join(" · ");
      return `- ${p.name}${bits ? ` (${bits})` : ""}`;
    })
    .join("\n");

  return [
    `You are a leadership coach helping ${s.me.name} lead a whole team well — the group dynamics, culture, and shared direction, not just one individual. Be practical, specific, and grounded in the team's makeup and the strengths/wiring of its members. Keep answers concise and actionable.`,
    ``,
    `## Team: ${team.name}`,
    domain && `Life area: ${domain.name}`,
    parent &&
      `Nested under: ${parent.name} (broader purview; this is a team ${s.me.name} specifically leads)`,
    children.length > 0 &&
      `Sub-teams: ${children.map((c) => c.name).join(", ")}`,
    team.direction === "up"
      ? `Relationship: this is a team ${s.me.name} REPORTS UP INTO. Coaching is about leading up and influencing the group well, not directing it.`
      : capacity &&
        `${s.me.name}'s capacity: ${capacity.label} (${
          capacity.label === "Manager"
            ? "formal authority"
            : capacity.label === "Leader"
              ? "leads without formal authority"
              : "leads peers through influence"
        })`,
    team.purpose && `Purpose: ${team.purpose}`,
    team.cadence && `Meeting cadence: ${team.cadence}`,
    team.lastMet && `Last met: ${team.lastMet}`,
    ``,
    `## Members (${members.length})`,
    memberLines || "(no members yet)",
    goals.length &&
      `\n## Team goals\n${goals
        .map((g) => `- ${g.title} (${Math.round(g.progress)}%)`)
        .join("\n")}`,
    actions.length &&
      `\n## Open team actions\n${actions.map((a) => `- ${a.text}`).join("\n")}`,
    notes.length &&
      `\n## Recent team notes\n${notes
        .map((n) => `- ${n.date}: ${n.body}`)
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Org-level system prompt for the header "Ask AI" chat and the Overview brief. */
export function orgSystemPrompt(): string {
  const s = useStore.getState();
  const byOrder = [...s.teams].sort((a, b) => a.order - b.order);
  const roots = byOrder.filter((t) => !t.parentId);
  const formatTeam = (t: (typeof s.teams)[0], indent: string): string => {
    const cap = s.capacities.find((c) => c.id === t.capacityId);
    const members = s.people.filter((p) => p.teamId === t.id);
    const memberLines = members
      .map((p) => {
        const a = p.assessments;
        const bits = [
          p.role,
          a.cliftonTop5?.length ? `Top5: ${a.cliftonTop5.join(", ")}` : "unassessed",
          a.enneagram && `Enneagram ${a.enneagram}`,
          a.mbti,
        ]
          .filter(Boolean)
          .join(" · ");
        return `${indent}  - ${p.name}${bits ? ` (${bits})` : ""}`;
      })
      .join("\n");
    const kids = byOrder.filter((c) => c.parentId === t.id);
    const kidLines = kids.map((k) => formatTeam(k, indent + "  ")).join("\n");
    return `${indent}- ${t.name} [capacity: ${cap?.label ?? "?"}${
      t.direction === "up" ? " — people Phil reports up to" : ""
    }]\n${memberLines}${kidLines ? `\n${kidLines}` : ""}`;
  };
  const lines = roots.map((t) => formatTeam(t, ""));
  return [
    `You are a leadership coach for ${s.me.name}, who leads multiple teams in different capacities (Manager = formal authority, Leader = leads without authority, Influence = leads peers). Be concise, practical, and specific. Use the org data below. Nested teams are sub-teams under a broader purview.`,
    ``,
    `## Org`,
    ...lines,
  ].join("\n");
}

/**
 * Stream a chat completion. Calls onDelta with incremental text and resolves
 * with the final full text.
 */
export async function streamChat(
  system: string,
  history: ChatMessage[],
  onDelta: (text: string) => void
): Promise<string> {
  const stream = client().messages.stream({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  stream.on("text", onDelta);
  const final = await stream.finalMessage();
  return final.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

const MEETING_STRUCTURE_SYSTEM = `You turn messy 1:1 transcripts and draft notes into clean, leadership-useful meeting notes.

Output ONLY markdown with these exact headings (omit a section only if truly empty):

## Summary
2–4 sentences: what mattered in this conversation.

## Decisions
Bullet list of decisions made (or "None").

## Commitments
Bullet list of concrete follow-ups. Prefer short actionable phrases someone can put on a topic board (e.g. "Share Q3 roadmap draft by Friday"). Tag owner when clear: "Phil: …" or "{person}: …".

## Personal notes
Tone, energy, life context, relationship cues the leader should remember. Keep private and respectful.

## Follow-ups for next 1:1
Bullets of topics to revisit next time.

## Suggested next date
A single ISO date (YYYY-MM-DD) suggestion if cadence or conversation implies one; otherwise write "None".

Rules:
- Be concise and practical. No fluff, no preamble before ## Summary.
- Ground language in the person's assessment profile when relevant (how they hear feedback, what drains them).
- Do not invent facts that aren't in the transcript/draft. If unclear, say so briefly.
- Prefer the leader's voice (first person optional; third person about the other person is fine).`;

export type StructuredMeeting = {
  notes: string;
  commitments: string[];
  suggestedNextDate?: string;
};

/** Parse commitment bullets and suggested date from structured markdown. */
export function parseStructuredMeeting(markdown: string): StructuredMeeting {
  const commitments: string[] = [];
  const lines = markdown.split("\n");
  let inCommitments = false;
  let suggestedNextDate: string | undefined;

  for (const line of lines) {
    if (/^##\s+commitments/i.test(line)) {
      inCommitments = true;
      continue;
    }
    if (/^##\s+/.test(line)) {
      inCommitments = false;
      if (/^##\s+suggested next date/i.test(line)) {
        // date may be on next non-empty line
      }
      continue;
    }
    if (inCommitments) {
      const m = line.match(/^\s*[-*]\s+(.+)/);
      if (m) {
        const text = m[1].trim();
        if (text && !/^none\.?$/i.test(text)) commitments.push(text);
      }
    }
  }

  const dateSection = markdown.match(
    /##\s+Suggested next date\s*\n+([^\n#]+)/i
  );
  if (dateSection) {
    const raw = dateSection[1].trim();
    const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
    if (iso) suggestedNextDate = iso[0];
  }

  return { notes: markdown.trim(), commitments, suggestedNextDate };
}

/**
 * Structure a 1:1 from transcript + optional draft notes using person context.
 */
export async function structureMeetingNotes(opts: {
  personId: string;
  transcript?: string;
  draftNotes?: string;
  onDelta?: (text: string) => void;
}): Promise<StructuredMeeting> {
  const person = useStore.getState().people.find((p) => p.id === opts.personId);
  const name = person?.name ?? "this person";
  const context = personSystemPrompt(opts.personId);

  const userParts = [
    `Structure notes for my 1:1 with ${name}.`,
    opts.draftNotes?.trim() &&
      `## Draft notes already written\n${opts.draftNotes.trim()}`,
    opts.transcript?.trim() &&
      `## Transcript (raw)\n${opts.transcript.trim()}`,
    !opts.draftNotes?.trim() &&
      !opts.transcript?.trim() &&
      `(No transcript or draft provided — write a short template the leader can fill in based on open topics.)`,
  ].filter(Boolean);

  let acc = "";
  const full = await streamChat(
    `${MEETING_STRUCTURE_SYSTEM}\n\n---\n\n# Leadership context\n\n${context}`,
    [{ role: "user", content: userParts.join("\n\n") }],
    (delta) => {
      acc += delta;
      opts.onDelta?.(acc);
    }
  );

  return parseStructuredMeeting(full);
}

// --- Brain dump → structured profile ------------------------------------

export type ProfileFieldTarget = "person" | "leadUp" | "assessments";
export type ProfileFieldKind = "text" | "list";

export type ProfileFieldDef = {
  key: string;
  label: string;
  kind: ProfileFieldKind;
  target: ProfileFieldTarget;
  /** Guidance passed to the model about what belongs in this field. */
  hint: string;
};

/** Fields the AI can draft for a person I report to (leading up). */
const UP_FIELDS: ProfileFieldDef[] = [
  { key: "archetype", label: "Leader type / archetype", kind: "text", target: "leadUp", hint: "The kind of leader they are, in a phrase (e.g. 'operator / driver', 'visionary', 'consensus-builder'). Name the recognizable leadership style." },
  { key: "winsLike", label: "What \"good\" looks like to them", kind: "text", target: "leadUp", hint: "Their definition of a strong report — what earns their approval." },
  { key: "anxieties", label: "What makes them anxious", kind: "text", target: "leadUp", hint: "What erodes their trust or triggers stress." },
  { key: "currency", label: "Their currency", kind: "text", target: "leadUp", hint: "What earns trust fastest with them: throughput, data, decisiveness, loyalty, optics, etc." },
  { key: "comms", label: "How they want to hear from me", kind: "text", target: "leadUp", hint: "Preferred cadence, channel, detail level, when to escalate vs. handle." },
  { key: "theirScorecard", label: "What they're measured on", kind: "text", target: "leadUp", hint: "What their own boss judges them on — the number making them look good upward." },
];

/** Fields the AI can draft for someone I lead (leading down). */
const DOWN_FIELDS: ProfileFieldDef[] = [
  { key: "strengths", label: "Strengths", kind: "list", target: "person", hint: "Concrete behavioral strengths, each a short phrase." },
  { key: "watchOuts", label: "Watch-outs", kind: "list", target: "person", hint: "Failure modes / things to watch, each a short phrase." },
  { key: "howToLead", label: "How to lead them", kind: "text", target: "person", hint: "1-3 sentences of practical guidance on leading this specific person." },
  { key: "enneagram", label: "Enneagram (hypothesis)", kind: "text", target: "assessments", hint: "A likely Enneagram type e.g. '3w2' — a hypothesis inferred from behavior, NOT a real test result. Keep confidence low unless the dump is strongly indicative." },
  { key: "mbti", label: "MBTI (hypothesis)", kind: "text", target: "assessments", hint: "A likely MBTI type e.g. 'ENTJ' — a hypothesis from behavior, NOT a real test. Keep confidence low unless strongly indicative." },
];

export function profileFieldsFor(direction: "up" | "down"): ProfileFieldDef[] {
  return direction === "up" ? UP_FIELDS : DOWN_FIELDS;
}

export type ProfileSuggestion = {
  field: string;
  value: string | string[];
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export type ProfileDraft = {
  /** One-line headline read of who this person is. */
  headline: string;
  suggestions: ProfileSuggestion[];
};

/**
 * Turn a free-text brain dump about a person into structured, confidence-scored
 * field suggestions. The model only proposes a field when the text supports it,
 * and reports how confident it is so the caller can gate on trust.
 */
export async function draftProfileFromBrainDump(
  personId: string,
  brainDump: string
): Promise<ProfileDraft> {
  const s = useStore.getState();
  const person = s.people.find((p) => p.id === personId);
  if (!person) throw new Error("Person not found.");
  const team = s.teams.find((t) => t.id === person.teamId);
  const direction: "up" | "down" = team?.direction === "up" ? "up" : "down";
  const fields = profileFieldsFor(direction);
  const allowedKeys = new Set(fields.map((f) => f.key));

  const relationship =
    direction === "up"
      ? `${person.name} is someone ${s.me.name} REPORTS TO. Build an operating manual for leading up to them.`
      : `${person.name} is someone ${s.me.name} LEADS. Build a profile for leading them well.`;

  const fieldSpec = fields
    .map((f) => `- "${f.key}" (${f.kind}): ${f.label}. ${f.hint}`)
    .join("\n");

  const system = [
    `You help ${s.me.name} turn what they know about a person into a structured leadership profile.`,
    relationship,
    ``,
    `You will be given a free-text brain dump. Extract and INFER the following fields. Reason like an expert on leadership, CliftonStrengths, Enneagram and MBTI — you may infer a person's likely type/archetype from described behavior.`,
    ``,
    `Fields (propose ONLY these keys, omit any the dump doesn't support):`,
    fieldSpec,
    ``,
    `Rules:`,
    `- Only include a field if the dump gives you something real to say. Do not pad.`,
    `- Set confidence honestly: "high" = the dump states or strongly implies it; "medium" = a reasonable inference; "low" = a guess worth verifying. Formal test types (Enneagram/MBTI) inferred from behavior should almost never be "high".`,
    `- rationale: one short clause pointing at what in the dump supports it.`,
    `- For list fields, value is an array of short phrases. For text fields, value is a string.`,
    `- headline: one plain-language sentence naming who this person is / how they operate.`,
  ].join("\n");

  const tool = {
    name: "profile_draft",
    description: "Return the structured, confidence-scored profile draft.",
    input_schema: {
      type: "object" as const,
      properties: {
        headline: { type: "string" },
        suggestions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: [...allowedKeys] },
              value: {
                oneOf: [
                  { type: "string" },
                  { type: "array", items: { type: "string" } },
                ],
              },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              rationale: { type: "string" },
            },
            required: ["field", "value", "confidence", "rationale"],
          },
        },
      },
      required: ["headline", "suggestions"],
    },
  };

  const msg = await client().messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: "profile_draft" },
    messages: [
      {
        role: "user",
        content: `Here is everything I know about ${person.name}:\n\n${brainDump.trim()}`,
      },
    ],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("The model did not return a structured profile.");
  }
  const raw = block.input as {
    headline?: string;
    suggestions?: ProfileSuggestion[];
  };

  const suggestions = (raw.suggestions ?? [])
    .filter((sg) => allowedKeys.has(sg.field))
    .map((sg) => {
      const def = fields.find((f) => f.key === sg.field)!;
      // Coerce value shape to the field's kind.
      let value = sg.value;
      if (def.kind === "list" && !Array.isArray(value)) {
        value = value ? [String(value)] : [];
      } else if (def.kind === "text" && Array.isArray(value)) {
        value = value.join(" ");
      }
      return { ...sg, value };
    });

  return { headline: raw.headline ?? "", suggestions };
}

export function coachPresets(person: Person): { label: string; prompt: string }[] {
  return [
    {
      label: "Prep me for our next 1:1",
      prompt: `Prep me for my next 1:1 with ${person.name}. Give me 3-5 talking points based on their profile, goals, and recent notes.`,
    },
    {
      label: "How should I lead them this month?",
      prompt: `Based on how ${person.name} is wired, how should I lead them this month? Be specific about what to do more of and less of.`,
    },
    {
      label: "Draft a check-in message",
      prompt: `Draft a short, warm check-in message I could send ${person.name} today. Match the tone to their personality.`,
    },
  ];
}

export function teamCoachPresets(
  team: Team
): { label: string; prompt: string }[] {
  return [
    {
      label: "How do I lead this team well?",
      prompt: `Given how the members of ${team.name} are wired, how should I lead this team as a whole right now? Call out the team's collective strengths and where the group is likely to struggle.`,
    },
    {
      label: "Plan our next meeting",
      prompt: `Help me plan an effective next meeting for ${team.name}. Suggest an agenda that fits this team's makeup and current goals.`,
    },
    {
      label: "Spot our blind spots",
      prompt: `Looking at the strengths and personalities across ${team.name}, what blind spots or gaps should I watch for as this team's leader?`,
    },
  ];
}

// Re-export so components can color coach context consistently if needed.
export { DOMAIN_COLOR };
