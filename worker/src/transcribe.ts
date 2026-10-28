import type { Env } from "./env.ts";

/**
 * Meeting audio to text, a segment at a time.
 *
 * The client records ~10–30 seconds, cut on a pause (src/lib/liveMeeting.ts),
 * and posts each segment here with a prompt: the names, arcs and agenda of
 * the meeting, then the last few lines already heard. The prompt is what makes
 * "Meghan" come back spelled the way you spell her, and it's how the
 * transcriber learns a workspace without anything being trained.
 *
 * Audio passes through and is never stored. The text goes back to the client,
 * which writes it into the occurrence's transcript like anything else typed.
 */

const OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";

export const TRANSCRIBE_MODELS = [
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "whisper-1",
] as const;
export type TranscribeModel = (typeof TRANSCRIBE_MODELS)[number];

/** A segment is well under a megabyte of opus; this is not a file upload. */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** The transcriber only reads the end of a long prompt anyway. */
export const MAX_PROMPT_CHARS = 1200;

/** What browsers' MediaRecorder actually produces, plus what OpenAI reads. */
const AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
];

const EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
};

export type TranscribeInput = {
  audio: Blob;
  /** Without parameters: `audio/webm;codecs=opus` → `audio/webm`. */
  type: string;
  prompt: string;
  model: TranscribeModel;
};

export function transcribeModel(env: Env): TranscribeModel {
  const wanted = env.OPENAI_TRANSCRIBE_MODEL?.trim() ?? "";
  return (TRANSCRIBE_MODELS as readonly string[]).includes(wanted)
    ? (wanted as TranscribeModel)
    : TRANSCRIBE_MODELS[0];
}

export function transcribeConfigured(env: Env): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

/** Validate the client's form. Throws with a message fit for a 400. */
export function readTranscribeForm(form: FormData, env: Env): TranscribeInput {
  const audio = form.get("audio");
  if (!audio || typeof audio === "string") throw new Error("audio is required");
  if (audio.size === 0) throw new Error("audio is empty");
  if (audio.size > MAX_AUDIO_BYTES) throw new Error("audio is too large");
  const type = (audio.type || "").split(";")[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(type)) throw new Error("audio type is not supported");
  const rawPrompt = form.get("prompt");
  const prompt = typeof rawPrompt === "string" ? rawPrompt.slice(-MAX_PROMPT_CHARS) : "";
  return { audio, type, prompt, model: transcribeModel(env) };
}

/** Ask OpenAI, and answer `{ text }` — or pass its error status through. */
export async function transcribe(
  env: Env,
  input: TranscribeInput,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return reply({ error: "OPENAI_API_KEY is not set" }, 501);

  const body = new FormData();
  body.append("file", input.audio, `segment.${EXTENSION[input.type] ?? "webm"}`);
  body.append("model", input.model);
  body.append("language", "en");
  body.append("response_format", "json");
  if (input.prompt.trim()) body.append("prompt", input.prompt);

  let upstream: Response;
  try {
    upstream = await fetcher(OPENAI_TRANSCRIBE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body,
    });
  } catch {
    return reply({ error: "transcriber unreachable" }, 502);
  }
  if (!upstream.ok) {
    // OpenAI's own message is about our request, never the user's audio.
    const detail = await upstream.text().catch(() => "");
    return reply({ error: "transcription failed", detail: detail.slice(0, 300) }, upstream.status);
  }
  const data = (await upstream.json().catch(() => null)) as { text?: unknown } | null;
  return reply({ text: typeof data?.text === "string" ? data.text.trim() : "" }, 200);
}

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
