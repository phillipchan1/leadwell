/**
 * The two ways Polarch turns speech into text, and what they share.
 *
 * **Server** (preferred): record audio, post it to the Worker a segment at a
 * time, and get back text from a real transcription model, primed with the
 * meeting's names. Works in every browser that can record, Safari and phones
 * included, and is far more accurate.
 *
 * **Browser**: the Web Speech API. Instant words as you speak, but Chrome
 * mostly, no names, and it gives up after a pause. What's used when the
 * Worker has no transcription key, or for the demo.
 */

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: { isFinal: boolean; [j: number]: { transcript: string } };
  };
};

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Either engine could run here. */
export function canTranscribe(): boolean {
  return canRecord() || Boolean(getSpeechRecognition());
}

/** The container each browser records best: opus in WebM, MP4 on Safari. */
export function recordingMime(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

let serverAnswer: boolean | null = null;

/**
 * Whether the Worker can transcribe (it has a key). Asked once a page load —
 * but a failed request is not an answer, so that one is asked again.
 */
export async function serverTranscription(): Promise<boolean> {
  if (serverAnswer !== null) return serverAnswer;
  if (!canRecord()) return (serverAnswer = false);
  try {
    const res = await fetch("/api/transcribe", { credentials: "include" });
    const type = res.headers.get("content-type") ?? "";
    // The demo and a static host answer this path with the app's HTML.
    if (!type.includes("json")) return (serverAnswer = false);
    const data = (await res.json().catch(() => null)) as { available?: unknown } | null;
    return (serverAnswer = res.ok && data?.available === true);
  } catch {
    return false;
  }
}

export type SegmentResult =
  | { ok: true; text: string }
  /** `retry`: worth sending again (offline, rate limited, the server hiccuped). */
  | { ok: false; retry: boolean; message: string };

/** One recorded segment to text. Never throws. */
export async function transcribeSegment(blob: Blob, prompt: string): Promise<SegmentResult> {
  const form = new FormData();
  form.append("audio", blob, "segment");
  if (prompt) form.append("prompt", prompt);
  let res: Response;
  try {
    res = await fetch("/api/transcribe", { method: "POST", credentials: "include", body: form });
  } catch {
    return { ok: false, retry: true, message: "Can't reach the transcriber." };
  }
  if (res.ok) {
    const data = (await res.json().catch(() => null)) as { text?: unknown } | null;
    return { ok: true, text: typeof data?.text === "string" ? data.text : "" };
  }
  if (res.status === 401) return { ok: false, retry: true, message: "Signed out — sign in again to keep transcribing." };
  if (res.status === 429 || res.status >= 500) {
    return { ok: false, retry: res.status !== 501, message: "The transcriber is busy." };
  }
  return { ok: false, retry: false, message: "A stretch of audio couldn't be transcribed." };
}
