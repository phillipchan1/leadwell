import type { ChatMessage, LeadUpProfile, Manager, Person, Team } from "../types";
import {
  DOMAIN_COLOR,
  MBTI,
  parseEnneagram,
  THEME_DOMAIN,
  ALL_THEMES,
} from "../data/frameworks";
import { derivedRead, hasLeadershipRead } from "./derive";
import { meetingFor, meetingsFor } from "./readiness";
import { directReports, teamsLedBy } from "./teams";
import { useStore } from "../store/useStore";
import { supabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase";
import { getAccessToken } from "./auth";

/**
 * AI is served by a Supabase Edge Function that holds the Anthropic key
 * server-side, so nothing sensitive lives in the browser. It's "available"
 * whenever the backend is configured and the user is signed in — the actual
 * key is never visible to the client.
 */
export function hasApiKey(): boolean {
  return supabaseConfigured && Boolean(useStore.getState().userId);
}

/** Operating-manual bullets, shared by the person and manager prompts. */
function leadUpManualLines(lu: LeadUpProfile | undefined): string {
  if (!lu) return "";
  return [
    lu.archetype && `- Leader type: ${lu.archetype}`,
    lu.winsLike && `- What "good" looks like to them: ${lu.winsLike}`,
    lu.anxieties && `- What makes them anxious: ${lu.anxieties}`,
    lu.currency && `- Their currency (what earns trust): ${lu.currency}`,
    lu.comms && `- How they want to hear from me: ${lu.comms}`,
    lu.theirScorecard &&
      `- What they're measured on by their boss: ${lu.theirScorecard}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build the full leadership-context system prompt for one person. */
export function personSystemPrompt(personId: string): string {
  const s = useStore.getState();
  const person = s.people.find((p) => p.id === personId);
  if (!person) return orgSystemPrompt();

  const team = s.teams.find((t) => t.id === person.teamId);
  const ledTeams = teamsLedBy(s.teams, person.id);
  const capacity = s.capacities.find((c) => c.id === team?.capacityId);
  const read = derivedRead(person);
  const enn = parseEnneagram(person.assessments.enneagram);
  const goals = s.goals.filter((g) => g.personId === person.id);
  const notes = s.notes
    .filter((n) => n.personId === person.id)
    .slice(-5);
  const meeting = meetingFor(s.meetings, "person", person.id);
  const sessions = s.sessions
    .filter((o) => meeting && o.meetingId === meeting.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  // Every board they're on, not just the primary meeting's — the coach should
  // see a career check-in's topics alongside the weekly 1:1's.
  const meetingIds = new Set(
    meetingsFor(s.meetings, "person", person.id).map((m) => m.id)
  );
  const openTopics = s.topics.filter(
    (t) => meetingIds.has(t.meetingId) && t.status === "open"
  );
  const isLeadUp = team?.direction === "up";
  const lu = person.leadUp;
  const wins = s.wins
    .filter((w) => w.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const manualLines = isLeadUp ? leadUpManualLines(lu) : "";

  const top5 = (person.assessments.cliftonTop5 ?? [])
    .map((t, i) => `${i + 1}. ${t} (${THEME_DOMAIN[t] ?? "?"})`)
    .join("\n");

  const topicLines = openTopics
    .map((t) => `- [${t.sessionId ? "planned" : t.lane}] ${t.text}`)
    .join("\n");

  return [
    `You are a leadership coach helping ${s.me.name} lead one specific person well. Be practical, specific, and grounded in the person's assessment profile. Keep answers concise and actionable.`,
    ``,
    `## Person: ${person.name}`,
    person.role && `Role: ${person.role}`,
    team && `Team: ${team.name}`,
    !team &&
      `Relationship: a direct report of ${s.me.name}'s who isn't on any team ${s.me.name} leads — the 1:1 is the whole relationship.`,
    !team &&
      ledTeams.length > 0 &&
      `Teams ${person.name} leads (${s.me.name} does NOT lead these — coach through them, not around them): ${ledTeams
        .map((t) => t.name)
        .join(", ")}`,
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
    (person.customModalities?.length ?? 0) > 0 &&
      `## Other modalities\n${person.customModalities!
        .map(
          (m) =>
            `- ${m.name}: ${m.result}${m.notes ? ` (${m.notes})` : ""} [${m.source}${m.confidence ? `, ${m.confidence}` : ""}]`
        )
        .join("\n")}`,
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
    sessions.length &&
      `## Recent 1:1s\n${sessions
        .map((o) => `- ${o.date}: ${o.notes ?? "(no notes)"}`)
        .join("\n")}`,
    notes.length &&
      `## Recent notes\n${notes.map((n) => `- ${n.date}: ${n.body}`).join("\n")}`,
    !hasLeadershipRead(person)
      ? `\nNo leadership read recorded yet — suggest a free-text brain dump (AI fill) or CliftonStrengths / Enneagram / MBTI / other modalities, but still give practical general coaching.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the leading-up system prompt for a manager node. Managers carry no
 * assessments — reading their personality isn't the job — but the check-in
 * history, the topic board and the notes are all keyed by their id, same as
 * anyone else, and the coach is much sharper with them than without.
 */
export function managerSystemPrompt(managerId: string): string {
  const s = useStore.getState();
  const manager = s.managers.find((m) => m.id === managerId);
  if (!manager) return orgSystemPrompt();

  const domain = s.domains.find((d) => d.id === manager.domainId);
  const manualLines = leadUpManualLines(manager.leadUp);
  const wins = s.wins
    .filter((w) => w.personId === manager.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  const checkIn = s.meetings.find(
    (m) => m.subjectKind === "manager" && m.subjectId === manager.id
  );
  const sessions = checkIn
    ? s.sessions
        .filter((o) => o.meetingId === checkIn.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
    : [];
  const topicLines = s.topics
    .filter((t) => t.meetingId === checkIn?.id && t.status === "open")
    .map(
      (t) =>
        `- ${t.text}${t.sessionId ? " (planned for an upcoming check-in)" : ""}`
    )
    .join("\n");
  const notes = s.notes
    .filter((n) => n.personId === manager.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  return [
    `You are a leadership coach helping ${s.me.name} lead UP to one specific leader they report to. Coaching here is about managing this relationship well — communicating in their language, building trust, bringing solutions, and making them successful upward — not about directing them. Be practical and specific.`,
    ``,
    `## Leader: ${manager.name}`,
    manager.role && `Role: ${manager.role}`,
    domain && `Life area: ${domain.name}`,
    `Relationship: ${s.me.name} REPORTS TO ${manager.name}.`,
    ``,
    manualLines &&
      `## Operating manual (how to succeed with them)\nThis is their wiring as ${s.me.name}'s manager — reward, anxieties, currency, and scorecard. Anchor advice on this, especially their currency and what their own boss measures them on.\n${manualLines}`,
    wins.length &&
      `## Wins banked with them\nValue ${s.me.name} has delivered, in their currency — usable as evidence at reviews or before an ask:\n${wins
        .map((w) => `- ${w.date}: ${w.text}${w.impact ? ` — ${w.impact}` : ""}`)
        .join("\n")}`,
    topicLines &&
      `## Open topics for them\nWhat ${s.me.name} needs to raise — asks, escalations, decisions to get:\n${topicLines}`,
    sessions.length &&
      `## Recent check-ins\n${sessions
        .map((o) => `- ${o.date}: ${o.notes ?? "(no notes)"}`)
        .join("\n")}`,
    notes.length &&
      `## Recent notes\n${notes.map((n) => `- ${n.date}: ${n.body}`).join("\n")}`,
    !manualLines
      ? `\nThe operating manual is still empty. Ask sharp questions that would fill it in — what they reward, what makes them anxious, their currency, how they want to hear from ${s.me.name}, and what their own boss measures them on — while still giving practical general leading-up advice.`
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
      const modalities = (p.customModalities ?? [])
        .map((m) => `${m.name}: ${m.result}`)
        .join("; ");
      const bits = [
        p.role,
        a.cliftonTop5?.length
          ? `Top5: ${a.cliftonTop5.join(", ")}`
          : null,
        a.enneagram && `Enneagram ${a.enneagram}`,
        a.mbti,
        modalities || null,
        !hasLeadershipRead(p) && "no read yet",
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
  // Teams handed to a direct report hang under that person below, not here.
  const roots = byOrder.filter((t) => !t.parentId && !t.leaderId);
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
  // Direct reports: people Phil manages who aren't on any team he leads. The
  // teams under them are theirs to run — coaching is about leading the leader.
  const reportLines = directReports(s.people).map((p) => {
    const a = p.assessments;
    const bits = [
      p.role,
      a.cliftonTop5?.length ? `Top5: ${a.cliftonTop5.join(", ")}` : "unassessed",
      a.enneagram && `Enneagram ${a.enneagram}`,
      a.mbti,
    ]
      .filter(Boolean)
      .join(" · ");
    const led = teamsLedBy(s.teams, p.id);
    const ledLines = led.map((t) => formatTeam(t, "  ")).join("\n");
    return `- ${p.name}${bits ? ` (${bits})` : ""}${
      led.length ? `\n  Leads these teams — ${s.me.name} does not:` : ""
    }${ledLines ? `\n${ledLines}` : ""}`;
  });
  const me = s.me;
  const meTop5 = (me.assessments.cliftonTop5 ?? []).join(", ");
  const meMods = (me.customModalities ?? [])
    .map((m) => `${m.name}: ${m.result}`)
    .join("; ");
  const meBits = [
    me.title,
    meTop5 && `Top5: ${meTop5}`,
    me.assessments.enneagram && `Enneagram ${me.assessments.enneagram}`,
    me.assessments.mbti,
    me.strengths.length && `strengths: ${me.strengths.join(", ")}`,
    meMods,
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    `You are a leadership coach for ${s.me.name}, who leads multiple teams in different capacities (Manager = formal authority, Leader = leads without authority, Influence = leads peers). Be concise, practical, and specific. Use the org data below. Nested teams are sub-teams under a broader purview.`,
    ``,
    `## ${s.me.name} (self)`,
    meBits || "(no self-assessment yet)",
    me.howToLead && `How they work best: ${me.howToLead}`,
    ``,
    `## Org`,
    ...lines,
    reportLines.length ? `\n## Direct reports (no team of mine)` : "",
    ...reportLines,
  ]
    .filter(Boolean)
    .join("\n");
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
  const token = await getAccessToken();
  if (!token) throw new Error("You're signed out — sign in again to use AI.");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/anthropic`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      system,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
      model: "claude-sonnet-5",
      max_tokens: 2048,
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      detail?.trim() ||
        `AI request failed (${res.status}). Check that the Edge Function is deployed and ANTHROPIC_API_KEY is set.`
    );
  }

  // The Edge Function streams plain-text deltas; forward each chunk.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      full += chunk;
      onDelta(chunk);
    }
  }
  return full;
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
  /** Present for a 1:1 — pulls in that person's full leadership context. */
  personId?: string;
  /** Present for a team meeting — the team whose context to load. */
  teamId?: string;
  /** Present for a check-in with a leader I report to — leading-up context. */
  managerId?: string;
  /** How to describe the meeting in the prompt, e.g. "1:1 with Sarah Kim". */
  label: string;
  transcript?: string;
  draftNotes?: string;
  onDelta?: (text: string) => void;
}): Promise<StructuredMeeting> {
  const context = opts.personId
    ? personSystemPrompt(opts.personId)
    : opts.teamId
      ? teamSystemPrompt(opts.teamId)
      : opts.managerId
        ? managerSystemPrompt(opts.managerId)
        : orgSystemPrompt();

  const userParts = [
    `Structure notes for my ${opts.label}.`,
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
  /** Grouping for the review UI. */
  group: "traits" | "known" | "leadUp";
  /** Guidance passed to the model about what belongs in this field. */
  hint: string;
};

const TRAIT_FIELDS: ProfileFieldDef[] = [
  {
    key: "strengths",
    label: "Strengths",
    kind: "list",
    target: "person",
    group: "traits",
    hint: "Concrete behavioral strengths as short phrases. Prefer this for observations like 'creative', 'relational', 'presence over process'.",
  },
  {
    key: "watchOuts",
    label: "Watch-outs",
    kind: "list",
    target: "person",
    group: "traits",
    hint: "Failure modes / things to watch, each a short phrase.",
  },
  {
    key: "howToLead",
    label: "How to lead them",
    kind: "text",
    target: "person",
    group: "traits",
    hint: "1-3 sentences of practical guidance on leading this specific person.",
  },
];

const KNOWN_ASSESSMENT_FIELDS: ProfileFieldDef[] = [
  {
    key: "cliftonTop5",
    label: "CliftonStrengths Top 5",
    kind: "list",
    target: "assessments",
    group: "known",
    hint: "Only when the dump names Clifton/Gallup themes. value = array of EXACT Gallup theme names (e.g. 'Woo', 'Empathy', 'Achiever'), ordered 1–5. Never invent themes.",
  },
  {
    key: "enneagram",
    label: "Enneagram (hypothesis)",
    kind: "text",
    target: "assessments",
    group: "known",
    hint: "A likely Enneagram type e.g. '3w2' — only when named or strongly evidenced. Hypothesis from behavior is almost never high confidence.",
  },
  {
    key: "mbti",
    label: "MBTI (hypothesis)",
    kind: "text",
    target: "assessments",
    group: "known",
    hint: "A likely MBTI type e.g. 'ENTJ' — only when named or strongly evidenced. Hypothesis from behavior is almost never high confidence.",
  },
];

/** Fields the AI can draft for a person I report to (leading up). */
const UP_FIELDS: ProfileFieldDef[] = [
  {
    key: "archetype",
    label: "Leader type / archetype",
    kind: "text",
    target: "leadUp",
    group: "leadUp",
    hint: "The kind of leader they are, in a phrase (e.g. 'operator / driver', 'visionary', 'consensus-builder'). Name the recognizable leadership style.",
  },
  {
    key: "winsLike",
    label: 'What "good" looks like to them',
    kind: "text",
    target: "leadUp",
    group: "leadUp",
    hint: "Their definition of a strong report — what earns their approval.",
  },
  {
    key: "anxieties",
    label: "What makes them anxious",
    kind: "text",
    target: "leadUp",
    group: "leadUp",
    hint: "What erodes their trust or triggers stress.",
  },
  {
    key: "currency",
    label: "Their currency",
    kind: "text",
    target: "leadUp",
    group: "leadUp",
    hint: "What earns trust fastest with them: throughput, data, decisiveness, loyalty, optics, etc.",
  },
  {
    key: "comms",
    label: "How they want to hear from me",
    kind: "text",
    target: "leadUp",
    group: "leadUp",
    hint: "Preferred cadence, channel, detail level, when to escalate vs. handle.",
  },
  {
    key: "theirScorecard",
    label: "What they're measured on",
    kind: "text",
    target: "leadUp",
    group: "leadUp",
    hint: "What their own boss judges them on — the number making them look good upward.",
  },
  ...TRAIT_FIELDS,
  ...KNOWN_ASSESSMENT_FIELDS,
];

const SELF_TRAIT_FIELDS: ProfileFieldDef[] = [
  TRAIT_FIELDS[0],
  TRAIT_FIELDS[1],
  {
    key: "howToLead",
    label: "How I work best",
    kind: "text",
    target: "person",
    group: "traits",
    hint: "1-3 sentences on how others should lead / work with me — what brings out my best, what to avoid.",
  },
];

/** Fields the AI can draft for someone I lead (leading down). */
const DOWN_FIELDS: ProfileFieldDef[] = [
  ...TRAIT_FIELDS,
  ...KNOWN_ASSESSMENT_FIELDS,
];

const SELF_FIELDS: ProfileFieldDef[] = [
  ...SELF_TRAIT_FIELDS,
  ...KNOWN_ASSESSMENT_FIELDS,
];

export type ProfileDirection = "up" | "down" | "self";

export function profileFieldsFor(direction: ProfileDirection): ProfileFieldDef[] {
  if (direction === "up") return UP_FIELDS;
  if (direction === "self") return SELF_FIELDS;
  return DOWN_FIELDS;
}

export type ProfileTargetId = string | "me";

function resolveProfileTarget(targetId: ProfileTargetId): {
  name: string;
  direction: ProfileDirection;
} {
  const s = useStore.getState();
  if (targetId === "me") {
    return { name: s.me.name || "me", direction: "self" };
  }
  const person = s.people.find((p) => p.id === targetId);
  if (!person) throw new Error("Person not found.");
  const team = s.teams.find((t) => t.id === person.teamId);
  return {
    name: person.name,
    direction: team?.direction === "up" ? "up" : "down",
  };
}

export type ProfileSuggestion = {
  field: string;
  value: string | string[];
  confidence: "high" | "medium" | "low";
  rationale: string;
};

export type CustomModalitySuggestion = {
  name: string;
  result: string;
  source: "test" | "inferred" | "self-report";
  confidence: "high" | "medium" | "low";
  rationale: string;
  notes?: string;
};

export type ProfileDraft = {
  /** One-line headline read of who this person is. */
  headline: string;
  suggestions: ProfileSuggestion[];
  modalities: CustomModalitySuggestion[];
};

const THEME_SET = new Set(ALL_THEMES.map((t) => t.toLowerCase()));
const THEME_BY_LOWER = Object.fromEntries(
  ALL_THEMES.map((t) => [t.toLowerCase(), t])
);

/** Normalize & keep only real Gallup theme names, preserving order, max 5. */
function normalizeCliftonTop5(raw: string[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    const key = item.trim().toLowerCase();
    if (!THEME_SET.has(key)) continue;
    const canon = THEME_BY_LOWER[key];
    if (out.some((t) => t.toLowerCase() === key)) continue;
    out.push(canon);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * Turn a free-text brain dump about a person (or yourself) into structured,
 * confidence-scored field suggestions.
 */
export async function draftProfileFromBrainDump(
  targetId: ProfileTargetId,
  brainDump: string
): Promise<ProfileDraft> {
  const s = useStore.getState();
  const { name, direction } = resolveProfileTarget(targetId);
  const fields = profileFieldsFor(direction);
  const allowedKeys = new Set(fields.map((f) => f.key));

  const relationship =
    direction === "self"
      ? `${name} is building a SELF-assessment — how they are wired as a leader. Capture traits and frameworks from first-person reflection.`
      : direction === "up"
        ? `${name} is someone ${s.me.name} REPORTS TO. Build an operating manual for leading up to them — and capture wiring traits when the dump supports them.`
        : `${name} is someone ${s.me.name} LEADS. Build a profile for leading them well.`;

  const fieldSpec = fields
    .map((f) => `- "${f.key}" (${f.kind}): ${f.label}. ${f.hint}`)
    .join("\n");

  const system = [
    direction === "self"
      ? `You help ${name} turn what they know about themselves into a structured self-assessment profile.`
      : `You help ${s.me.name} turn what they know about a person into a structured leadership profile.`,
    relationship,
    ``,
    `You will be given a free-text brain dump (or a guided-mapping Q&A transcript). Prefer free-text leadership traits. Use known frameworks only when named or clearly evidenced. Use custom modalities for other named systems or sticky archetype labels that are more than a single trait chip.`,
    ``,
    `Fields in "suggestions" (propose ONLY these keys, omit any the dump doesn't support):`,
    fieldSpec,
    ``,
    `Also optionally return "modalities" — an array of custom modalities when the dump names another assessment system (Working Genius, DISC, StrengthsFinder domains under a different label, pastoral style, etc.) OR a compact archetype label that isn't just a strength chip (e.g. "creative-relational shepherd"). Each: { "name": string, "result": string, "source": "test"|"inferred"|"self-report", "confidence": "high"|"medium"|"low", "rationale": string, "notes"?: string }.`,
    ``,
    `Rules:`,
    `- Traits first: behavioral observations ("creative", "relational", "leads through presence") go in strengths / watchOuts / howToLead — NOT forced into Enneagram/MBTI.`,
    `- Known frameworks (cliftonTop5, enneagram, mbti): only when the dump names them or evidence is clear. Do not invent Clifton themes; use exact Gallup names only.`,
    `- Custom modalities: other named systems, or a sticky multi-word archetype. Do not duplicate plain trait chips as modalities.`,
    `- Only include a field/modality if the dump gives you something real to say. Do not pad.`,
    `- Set confidence honestly: "high" = stated or strongly implied; "medium" = reasonable inference; "low" = guess. Formal types inferred from behavior should almost never be "high". source "test" only if the dump says they took the assessment.`,
    `- rationale: one short clause pointing at what in the dump supports it.`,
    `- For list fields, value is an array of short phrases. For text fields, value is a string.`,
    `- headline: one plain-language sentence naming who this person is / how they operate.`,
    ``,
    `Respond with ONLY a JSON object (no markdown fences) shaped as:`,
    `{ "headline": string, "suggestions": [{ "field": string, "value": string | string[], "confidence": "high"|"medium"|"low", "rationale": string }], "modalities": [{ "name": string, "result": string, "source": "test"|"inferred"|"self-report", "confidence": "high"|"medium"|"low", "rationale": string, "notes"?: string }] }`,
  ].join("\n");

  const full = await streamChat(
    system,
    [
      {
        role: "user",
        content:
          direction === "self"
            ? `Here is everything I know about myself:\n\n${brainDump.trim()}`
            : `Here is everything I know about ${name}:\n\n${brainDump.trim()}`,
      },
    ],
    () => {}
  );

  const raw = parseProfileDraftJson(full);
  const suggestions = (raw.suggestions ?? [])
    .filter((sg) => allowedKeys.has(sg.field))
    .map((sg) => {
      const def = fields.find((f) => f.key === sg.field)!;
      let value = sg.value;
      if (def.kind === "list" && !Array.isArray(value)) {
        value = value ? [String(value)] : [];
      } else if (def.kind === "text" && Array.isArray(value)) {
        value = value.join(" ");
      }
      if (def.key === "cliftonTop5" && Array.isArray(value)) {
        value = normalizeCliftonTop5(value.map(String));
        if (value.length === 0) return null;
      }
      return { ...sg, value };
    })
    .filter((sg): sg is ProfileSuggestion => sg !== null);

  const modalities = (raw.modalities ?? [])
    .filter(
      (m) =>
        typeof m?.name === "string" &&
        m.name.trim() &&
        typeof m?.result === "string" &&
        m.result.trim()
    )
    .map((m) => {
      const source =
        m.source === "test" || m.source === "self-report" || m.source === "inferred"
          ? m.source
          : "inferred";
      const confidence =
        m.confidence === "high" || m.confidence === "medium" || m.confidence === "low"
          ? m.confidence
          : "medium";
      return {
        name: m.name.trim(),
        result: m.result.trim(),
        source,
        confidence,
        rationale: (m.rationale ?? "").trim() || "From the brain dump.",
        ...(m.notes?.trim() ? { notes: m.notes.trim() } : {}),
      } satisfies CustomModalitySuggestion;
    });

  return { headline: raw.headline ?? "", suggestions, modalities };
}

export type ProbeTurn = { question: string; answer: string };

export type ProbeNext =
  | { done: false; question: string }
  | { done: true };

/**
 * Ask the next open-ended probe question to draw out a profile when the user
 * doesn't have a ready brain dump. After enough substance, returns done:true
 * so the caller can draft from the Q&A transcript.
 */
export async function nextProfileProbeQuestion(
  targetId: ProfileTargetId,
  turns: ProbeTurn[]
): Promise<ProbeNext> {
  const s = useStore.getState();
  const { name, direction } = resolveProfileTarget(targetId);

  const subject =
    direction === "self"
      ? `yourself (${name})`
      : direction === "up"
        ? `${name}, someone ${s.me.name} reports to`
        : `${name}, someone ${s.me.name} leads`;

  const goals =
    direction === "self"
      ? "strengths, watch-outs, how they work best, and any assessment frameworks they know"
      : direction === "up"
        ? "how they run things, what they reward, anxieties, currency, scorecard, and wiring traits"
        : "how they work, strengths, struggles, motivation, feedback style, and any assessments";

  const history =
    turns.length === 0
      ? "(no answers yet — ask the first question)"
      : turns
          .map((t, i) => `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}`)
          .join("\n\n");

  const system = [
    `You interview ${s.me.name} to build a leadership profile of ${subject}.`,
    `Ask ONE open-ended question at a time. Questions should be concrete and easy to answer from lived experience — not quiz questions about Enneagram/MBTI unless they volunteer frameworks.`,
    `Goal areas to cover over the conversation: ${goals}.`,
    ``,
    `Rules:`,
    `- Prefer behavior, stories, and observations over abstract labels.`,
    `- Do not repeat a question already asked.`,
    `- After 4–6 substantive answers (or sooner if answers are rich), set enough=true so we can draft the profile.`,
    `- If answers are thin, keep asking (up to 8 turns) before enough=true.`,
    `- Respond with ONLY JSON: { "enough": boolean, "question": string }. When enough is true, question may be "".`,
  ].join("\n");

  const full = await streamChat(
    system,
    [
      {
        role: "user",
        content: `Interview so far:\n\n${history}\n\nReturn the next question (or enough=true).`,
      },
    ],
    () => {}
  );

  const raw = parseProbeJson(full);
  if (raw.enough || turns.length >= 8) {
    return { done: true };
  }
  const question = (raw.question ?? "").trim();
  if (!question) return { done: true };
  return { done: false, question };
}

/** Format probe Q&A into a brain-dump transcript for drafting. */
export function probeTurnsToBrainDump(turns: ProbeTurn[]): string {
  return turns
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join("\n\n");
}

function parseProbeJson(text: string): { enough?: boolean; question?: string } {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    return { enough: false, question: trimmed.slice(0, 280) };
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as {
      enough?: boolean;
      question?: string;
    };
  } catch {
    return { enough: false, question: trimmed.slice(0, 280) };
  }
}

function parseProfileDraftJson(text: string): {
  headline?: string;
  suggestions?: ProfileSuggestion[];
  modalities?: CustomModalitySuggestion[];
} {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("The model did not return a structured profile.");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as {
      headline?: string;
      suggestions?: ProfileSuggestion[];
      modalities?: CustomModalitySuggestion[];
    };
  } catch {
    throw new Error("The model did not return a structured profile.");
  }
}

const MANDATE_REFINE_SYSTEM = `You refine a leader's team mandate into a clear, usable statement of purpose.

Take their rough draft (or thin notes) and return ONE refined mandate — typically 2–5 sentences — that clarifies:
- What outcome this team exists to drive
- Who they serve and what "good" looks like
- The leader's real responsibility (not a job-description dump)

Rules:
- Output ONLY the refined mandate text — no title, bullets, headings, or preamble
- Keep the leader's voice and intent; sharpen and clarify, don't invent a new mission
- Be concrete and leadership-useful; cut fluff and corporate jargon
- If the draft is empty or nearly empty, draft a strong starting mandate from the team context
- Prefer short paragraphs over lists
`;

/**
 * Enrich / clarify a team's mandate. Streams accumulated text via onDelta.
 */
export async function refineTeamMandate(opts: {
  teamId: string;
  purpose?: string;
  onDelta?: (text: string) => void;
}): Promise<string> {
  const context = teamSystemPrompt(opts.teamId);
  const draft = opts.purpose?.trim();
  const user = draft
    ? `Refine this team mandate:\n\n${draft}`
    : `Draft a clear starting mandate for this team from the context.`;

  let acc = "";
  const full = await streamChat(
    `${MANDATE_REFINE_SYSTEM}\n\n---\n\n# Leadership context\n\n${context}`,
    [{ role: "user", content: user }],
    (delta) => {
      acc += delta;
      opts.onDelta?.(acc);
    }
  );
  return full.trim();
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

/** Presets for a manager node — all leading-up, no 1:1 or development framing. */
export function managerCoachPresets(
  manager: Manager
): { label: string; prompt: string }[] {
  return [
    {
      label: "How do I win with them?",
      prompt: `Based on ${manager.name}'s operating manual, how do I win with them over the next month? Be specific about what to do more of and less of.`,
    },
    {
      label: "Fill in their manual",
      prompt: `Interview me to fill in ${manager.name}'s operating manual — what they reward, what makes them anxious, their currency, how they want to hear from me, and what their own boss measures them on. Ask a few questions at a time, then summarize what I should record in each field.`,
    },
    {
      label: "Frame my next ask",
      prompt: `I need to ask ${manager.name} for something. Using their currency and what their boss measures them on, help me frame the ask and pick which banked wins to lead with.`,
    },
    {
      label: "Draft a status update",
      prompt: `Draft a status update for ${manager.name} in the cadence and detail level they prefer. Match their language, not mine.`,
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
