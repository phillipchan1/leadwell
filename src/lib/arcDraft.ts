import type { ArcStep } from "../types";
import { completeChat } from "./openai";

/**
 * "Type the book, we lay out the chapters."
 *
 * A draft, never a source of truth: chapter numbers and page ranges differ by
 * edition, so the sheet always says to check them, and nothing is saved until
 * the leader has looked at it.
 */

export type ArcDraft = {
  author?: string;
  steps: Pick<ArcStep, "label" | "read" | "prompts" | "practice">[];
};

const SYSTEM = `You help a leader plan something they will work through with someone, one step per meeting — usually a book read together in 1:1s or a team meeting.

Reply with JSON only, no prose, in exactly this shape:
{"author": string | null, "steps": [{"label": string, "read": string | null, "prompts": string[], "practice": string | null}]}

Rules:
- For a book: one step per chapter, in order. "label" is "Ch. N · Chapter title". "read" is the page range if you are confident of it, else null.
- For anything that isn't a book (an onboarding plan, a study, a skill): 4–12 sensible steps with short labels.
- "prompts": one or two open questions to discuss in the meeting — personal, concrete, never a quiz about the content.
- "practice": one small thing to try before the next meeting, phrased as an instruction ("Before one hard conversation this week, ask: what do I really want?").
- Keep every string under 140 characters.
- If you don't recognise the title, still return a reasonable plan rather than refusing.`;

export async function draftArc(input: {
  title: string;
  author?: string;
  /** "1:1 with Meghan", "Frontier staff meeting" — tone for the prompts. */
  context?: string;
}): Promise<ArcDraft> {
  const user = [
    `Title: ${input.title.trim()}`,
    input.author?.trim() ? `Author: ${input.author.trim()}` : "",
    input.context?.trim() ? `Where: ${input.context.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await completeChat({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    max_tokens: 4000,
  });
  if (!res.ok) {
    if (res.status === 501) throw new Error("AI drafting isn't set up on this server.");
    if (res.status === 401) throw new Error("Sign in again to draft with AI.");
    throw new Error("The draft didn't come back. Try again, or add steps by hand.");
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseDraft(body.choices?.[0]?.message?.content ?? "");
}

/** Tolerant of code fences and chatter around the JSON. */
export function parseDraft(content: string): ArcDraft {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The draft came back empty. Try again.");
  let raw: unknown;
  try {
    raw = JSON.parse(content.slice(start, end + 1));
  } catch {
    throw new Error("The draft came back garbled. Try again.");
  }
  const obj = (raw ?? {}) as { author?: unknown; steps?: unknown };
  const clip = (v: unknown) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
  const steps = (Array.isArray(obj.steps) ? obj.steps : [])
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      label: clip(s.label) ?? "",
      read: clip(s.read),
      prompts: (Array.isArray(s.prompts) ? s.prompts : [])
        .map(clip)
        .filter((p): p is string => Boolean(p))
        .slice(0, 3),
      practice: clip(s.practice),
    }))
    .filter((s) => s.label)
    .slice(0, 60);
  if (!steps.length) throw new Error("The draft had no steps. Try again, or add them by hand.");
  return { author: clip(obj.author), steps };
}
