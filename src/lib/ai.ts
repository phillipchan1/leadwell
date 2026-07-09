import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, Person } from "../types";
import {
  DOMAIN_COLOR,
  MBTI,
  parseEnneagram,
  THEME_DOMAIN,
} from "../data/frameworks";
import { derivedRead } from "./derive";
import { useStore } from "../store/useStore";

export const API_KEY: string | undefined = import.meta.env
  .VITE_ANTHROPIC_API_KEY as string | undefined;

export const hasApiKey = Boolean(API_KEY);

function client(): Anthropic {
  return new Anthropic({
    apiKey: API_KEY,
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
    .slice(-3);
  const actions = s.actions.filter(
    (a) => a.personId === person.id && !a.done
  );

  const top5 = (person.assessments.cliftonTop5 ?? [])
    .map((t, i) => `${i + 1}. ${t} (${THEME_DOMAIN[t] ?? "?"})`)
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
    goals.length &&
      `## Current goals\n${goals
        .map((g) => `- ${g.title} (${Math.round(g.progress)}%)`)
        .join("\n")}`,
    actions.length &&
      `## Open next actions\n${actions.map((a) => `- ${a.text}`).join("\n")}`,
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

/** Org-level system prompt for the header "Ask AI" chat and the Overview brief. */
export function orgSystemPrompt(): string {
  const s = useStore.getState();
  const lines = s.teams.map((t) => {
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
        return `  - ${p.name}${bits ? ` (${bits})` : ""}`;
      })
      .join("\n");
    return `- ${t.name} [capacity: ${cap?.label ?? "?"}${
      t.direction === "up" ? " — people Phil reports up to" : ""
    }]\n${memberLines}`;
  });
  return [
    `You are a leadership coach for ${s.me.name}, who leads multiple teams in different capacities (Manager = formal authority, Leader = leads without authority, Influence = leads peers). Be concise, practical, and specific. Use the org data below.`,
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

// Re-export so components can color coach context consistently if needed.
export { DOMAIN_COLOR };
