import { completeChat } from "./openai";
import { currentStep, arcsFor } from "./arcs";
import { meetingSubjectName, meetingTitle } from "./readiness";
import { fixturesFor, knownFor } from "./knowledge";
import { meetingVocabulary, type VocabularySource } from "./vocabulary";
import type {
  Arc,
  FollowUp,
  Fixture,
  FixtureCadence,
  KnowledgeItem,
  MeetingSubjectKind,
  Session,
  Topic,
  TrackedMeeting,
} from "../types";
import { storage } from "./storage";

/**
 * The wrap-up: what a meeting leaves behind, drafted from the transcript and
 * your notes, and filed only where you say.
 *
 * It's the one moment the whole knowledge loop turns. What was covered is
 * ticked, the arc moves on, commitments become follow-ups, decisions and
 * themes go into what's known about the person or team, the fixtures that
 * came up are marked, and anything the transcript got wrong is offered to
 * the glossary. Each is a suggestion with a checkbox; nothing is written
 * until you apply it, and what you turn down isn't suggested again.
 */

export type WrapUpContext = {
  meetingId: string;
  sessionId: string;
  subjectKind: MeetingSubjectKind;
  subjectId: string;
  meetingTitle: string;
  subjectName: string;
  date: string;
  topics: { id: string; text: string; covered: boolean }[];
  arcStep?: { arcId: string; stepId: string; title: string; label: string };
  followUps: { id: string; text: string }[];
  fixtures: { id: string; title: string; owner?: string }[];
  known: string[];
  vocabulary: string[];
  dismissed: Dismissed;
  transcript: string;
  notes: string;
};

export type WrapUp = {
  writeUp: string;
  point?: string;
  covered: string[];
  arcStepDone: boolean;
  followUps: { text: string; owner: "me" | "them" | "both" }[];
  closedFollowUps: string[];
  decisions: string[];
  themes: string[];
  facts: string[];
  fixturesTouched: string[];
  newFixtures: { title: string; owner?: string; cadence: FixtureCadence }[];
  glossary: { heard: string; meant: string }[];
};

export type Dismissed = { fixtures: string[]; glossary: string[] };

const DISMISSED_KEY = "wrapup-dismissed";
const WRAPPED_KEY = "wrapped-sessions";

export function loadDismissed(): Dismissed {
  const d = storage.load<Dismissed>(DISMISSED_KEY);
  return { fixtures: d?.fixtures ?? [], glossary: d?.glossary ?? [] };
}

/** Turned-down suggestions, so the next wrap-up doesn't offer them again. */
export function rememberDismissed(more: Dismissed) {
  const d = loadDismissed();
  storage.save<Dismissed>(DISMISSED_KEY, {
    fixtures: [...d.fixtures, ...more.fixtures].slice(-200),
    glossary: [...d.glossary, ...more.glossary].slice(-200),
  });
}

/** Occurrences already wrapped up here, so Done doesn't ask twice. */
export function wasWrapped(sessionId: string): boolean {
  return (storage.load<string[]>(WRAPPED_KEY) ?? []).includes(sessionId);
}

export function markWrapped(sessionId: string) {
  const list = storage.load<string[]>(WRAPPED_KEY) ?? [];
  if (!list.includes(sessionId)) storage.save(WRAPPED_KEY, [...list, sessionId].slice(-300));
}

type Source = VocabularySource & {
  sessions: Session[];
  topics: Topic[];
  followUps: FollowUp[];
  fixtures: Fixture[];
  knowledge: KnowledgeItem[];
  arcs: Arc[];
};

/** Everything the draft is allowed to know, gathered from the store. */
export function wrapUpContext(src: Source, sessionId: string): WrapUpContext | null {
  const session = src.sessions.find((o) => o.id === sessionId);
  const meeting: TrackedMeeting | undefined = src.meetings.find((m) => m.id === session?.meetingId);
  if (!session || !meeting) return null;
  const subjectName = meetingSubjectName(meeting, src) ?? "";
  const arc = arcsFor(src.arcs, meeting.id).find(
    (a) => a.status === "active" || a.steps.some((s) => s.coveredIn.includes(session.id))
  );
  const step = arc
    ? (arc.steps.find((s) => s.coveredIn.includes(session.id)) ?? currentStep(arc) ?? undefined)
    : undefined;
  return {
    meetingId: meeting.id,
    sessionId: session.id,
    subjectKind: meeting.subjectKind,
    subjectId: meeting.subjectId,
    meetingTitle: meetingTitle(meeting, subjectName),
    subjectName,
    date: session.date,
    topics: src.topics
      .filter((t) => t.sessionId === session.id && t.status !== "dropped")
      .map((t) => ({ id: t.id, text: t.text, covered: t.status === "covered" })),
    arcStep: arc && step ? { arcId: arc.id, stepId: step.id, title: arc.title, label: step.label } : undefined,
    followUps: src.followUps
      .filter(
        (f) =>
          f.status === "open" &&
          (f.meetingId === meeting.id ||
            (!f.meetingId && f.subjectKind === meeting.subjectKind && f.subjectId === meeting.subjectId))
      )
      .map((f) => ({ id: f.id, text: f.text })),
    fixtures: fixturesFor(src.fixtures, meeting.subjectKind, meeting.subjectId, src.people).map((f) => ({
      id: f.id,
      title: f.title,
      owner: f.owner,
    })),
    known: knownFor(src.knowledge, meeting.subjectKind, meeting.subjectId).map((k) => k.text),
    vocabulary: meetingVocabulary(src, meeting.id).slice(0, 60),
    dismissed: loadDismissed(),
    transcript: clipMiddle(session.transcript ?? "", 60_000),
    notes: session.notes ?? "",
  };
}

const SYSTEM = `You wrap up a meeting for a leader: from the agenda, what's already known, a machine transcript (it has errors) and the leader's own notes, you draft what the meeting leaves behind. The leader reviews every item before anything is saved.

Reply with JSON only, no prose, in exactly this shape:
{"writeUp": string, "point": string | null, "covered": string[], "arcStepDone": boolean, "followUps": [{"text": string, "owner": "me" | "them" | "both"}], "closedFollowUps": string[], "decisions": string[], "themes": string[], "facts": string[], "fixturesTouched": string[], "newFixtures": [{"title": string, "owner": string | null, "cadence": "weekly" | "monthly" | "quarterly" | "yearly" | "as_needed"}], "glossary": [{"heard": string, "meant": string}]}

What each means:
- writeUp: Markdown with "## Summary" (2–4 sentences), "## Decisions" and "## Commitments" (bullets). Leave out a heading with nothing under it.
- point: why they met this time, one line under 90 characters, or null.
- covered: ids of agenda topics that were clearly discussed.
- arcStepDone: true only if the arc step was clearly discussed.
- followUps: new commitments. Each text names who owes what, e.g. "Dana sends the budget by Friday". owner "me" is the leader.
- closedFollowUps: ids of open follow-ups the meeting shows are done.
- decisions: decisions actually made, each a complete sentence.
- themes: concerns or patterns about the person or team worth tracking across meetings — not one-off details.
- facts: durable things worth not having to ask again (a family event, a preference, a constraint).
- fixturesTouched: ids of fixtures that came up.
- newFixtures: recurring responsibilities mentioned that aren't fixtures yet. Only clearly recurring work.
- glossary: words the transcript clearly got wrong that should be one of the known names or terms ("heard" exactly as written in the transcript).

Rules:
- Use only the ids given. Never invent one.
- Be conservative: an empty list beats a guess. Most meetings yield 0–3 decisions.
- Don't repeat anything under "Already known". Never suggest anything under "Don't suggest again".
- Write as the leader's private notes: plain and specific, no praise, no filler.
- Keep every string except writeUp under 200 characters.`;

function prompt(ctx: WrapUpContext): string {
  const list = <T,>(items: T[], line: (x: T) => string) => (items.length ? items.map(line).join("\n") : "(none)");
  return [
    `Meeting: ${ctx.meetingTitle}${ctx.subjectName ? ` (with ${ctx.subjectName})` : ""}, ${ctx.date}`,
    `Agenda topics:\n${list(ctx.topics, (t) => `- [${t.id}] ${t.text}${t.covered ? " (already ticked)" : ""}`)}`,
    ctx.arcStep ? `Arc step: ${ctx.arcStep.title} — ${ctx.arcStep.label}` : "Arc step: (none)",
    `Open follow-ups:\n${list(ctx.followUps, (f) => `- [${f.id}] ${f.text}`)}`,
    `Fixtures:\n${list(ctx.fixtures, (f) => `- [${f.id}] ${f.title}${f.owner ? ` (${f.owner})` : ""}`)}`,
    `Already known:\n${list(ctx.known, (k) => `- ${k}`)}`,
    `Known names and terms: ${ctx.vocabulary.join(", ") || "(none)"}`,
    `Don't suggest again:\n${list([...ctx.dismissed.fixtures, ...ctx.dismissed.glossary], (d) => `- ${d}`)}`,
    `Leader's notes:\n${ctx.notes.trim() || "(none)"}`,
    `Transcript:\n${ctx.transcript.trim() || "(none)"}`,
  ].join("\n\n");
}

export async function draftWrapUp(ctx: WrapUpContext): Promise<WrapUp> {
  const res = await completeChat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: prompt(ctx) },
    ],
    max_tokens: 6000,
  });
  if (!res.ok) {
    if (res.status === 501) throw new Error("AI wrap-up isn't set up on this server.");
    if (res.status === 401) throw new Error("Sign in again to wrap up with AI.");
    throw new Error("The wrap-up didn't come back. Try again, or finish without it.");
  }
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  return parseWrapUp(body?.choices?.[0]?.message?.content ?? "", ctx);
}

const CADENCES: FixtureCadence[] = ["weekly", "monthly", "quarterly", "yearly", "as_needed"];

/** Tolerant of fences and chatter; drops any id the draft wasn't given. */
export function parseWrapUp(content: string, ctx: WrapUpContext): WrapUp {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The wrap-up came back empty. Try again.");
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    throw new Error("The wrap-up came back garbled. Try again.");
  }
  const clip = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const strings = (v: unknown, cap: number) =>
    (Array.isArray(v) ? v : []).map((x) => clip(x)).filter((x): x is string => Boolean(x)).slice(0, cap);
  const ids = (v: unknown, known: string[]) => {
    const allow = new Set(known);
    return [...new Set(strings(v, 50).filter((x) => allow.has(x)))];
  };
  const objects = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  const dismissedFixtures = new Set(ctx.dismissed.fixtures.map((t) => t.toLowerCase()));
  const dismissedGlossary = new Set(ctx.dismissed.glossary.map((t) => t.toLowerCase()));

  return {
    writeUp: clip(raw.writeUp, 6000) ?? "",
    point: clip(raw.point, 120),
    covered: ids(raw.covered, ctx.topics.filter((t) => !t.covered).map((t) => t.id)),
    arcStepDone: Boolean(ctx.arcStep) && raw.arcStepDone === true,
    followUps: objects(raw.followUps)
      .map((f) => ({
        text: clip(f.text) ?? "",
        owner: (f.owner === "them" || f.owner === "both" ? f.owner : "me") as "me" | "them" | "both",
      }))
      .filter((f) => f.text)
      .slice(0, 12),
    closedFollowUps: ids(raw.closedFollowUps, ctx.followUps.map((f) => f.id)),
    decisions: strings(raw.decisions, 10),
    themes: strings(raw.themes, 6),
    facts: strings(raw.facts, 6),
    fixturesTouched: ids(raw.fixturesTouched, ctx.fixtures.map((f) => f.id)),
    newFixtures: objects(raw.newFixtures)
      .map((f) => ({
        title: clip(f.title, 80) ?? "",
        owner: clip(f.owner, 60),
        cadence: CADENCES.includes(f.cadence as FixtureCadence) ? (f.cadence as FixtureCadence) : "monthly",
      }))
      .filter((f) => f.title && !dismissedFixtures.has(f.title.toLowerCase()))
      .filter((f) => !ctx.fixtures.some((x) => x.title.toLowerCase() === f.title.toLowerCase()))
      .slice(0, 4),
    glossary: objects(raw.glossary)
      .map((g) => ({ heard: clip(g.heard, 60) ?? "", meant: clip(g.meant, 60) ?? "" }))
      .filter((g) => g.heard && g.meant && g.heard.toLowerCase() !== g.meant.toLowerCase())
      .filter((g) => !dismissedGlossary.has(`${g.heard}→${g.meant}`.toLowerCase()))
      .slice(0, 6),
  };
}

/** Long transcripts keep their opening and the bulk of the end. */
function clipMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max / 3);
  return `${text.slice(0, head)}\n[…]\n${text.slice(text.length - (max - head))}`;
}
