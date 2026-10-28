import { create } from "zustand";
import { useStore } from "../store/useStore";
import { storage } from "./storage";
import { todayISO } from "./readiness";
import {
  getSpeechRecognition,
  recordingMime,
  serverTranscription,
  transcribeSegment,
  type SpeechRecognitionLike,
} from "./transcriber";
import { transcriptionPrompt } from "./vocabulary";
import { applyGlossary } from "./glossary";

/**
 * The meeting you're in, held outside any one screen.
 *
 * Run used to own the microphone, so stepping out of it to check the planner
 * or someone's profile stopped the transcript mid-sentence. The meeting now
 * lives here: Run joins it, the live pill shows it wherever you are, and only
 * Done ends it. Leaving is not ending.
 *
 * A meeting is live from the moment Run opens on an occurrence that hasn't
 * happened yet (today's, or the next one you pressed Start on) until Done.
 * Opening a past write-up is taking notes on it, not rejoining it, so that
 * never goes live unless you turn the mic on.
 */

export { getSpeechRecognition } from "./transcriber";

export type Engine = "server" | "browser";

type LiveState = {
  /** The occurrence you're in. Null when nothing is running. */
  sessionId: string | null;
  startedAt: number | null;
  /**
   * Closed with Done. Opening one of these again is reading it back, not
   * rejoining it — the timer would otherwise restart on every glance.
   */
  ended: string[];
  /** The mic is on and writing into `sessionId`'s transcript. */
  listening: boolean;
  /** Which engine is listening; null until it's known. */
  engine: Engine | null;
  /** Recorded stretches still on their way to text. */
  pending: number;
  /** How loud the room is right now, 0–1. Only while recording. */
  level: number;
  error: string | null;
};

const KEY = "live";
/** A meeting nobody ended is still forgotten by the next morning. */
const STALE_MS = 10 * 60 * 60 * 1000;
const ENDED_KEEP = 30;

type Persisted = Pick<LiveState, "sessionId" | "startedAt" | "ended">;

function load(): Persisted {
  const saved = storage.load<Persisted>(KEY);
  const ended = Array.isArray(saved?.ended) ? saved.ended.filter(Boolean) : [];
  if (!saved?.sessionId || !saved.startedAt || Date.now() - saved.startedAt > STALE_MS) {
    return { sessionId: null, startedAt: null, ended };
  }
  return { sessionId: saved.sessionId, startedAt: saved.startedAt, ended };
}

export const useLive = create<LiveState>(() => ({
  ...load(),
  listening: false,
  engine: null,
  pending: 0,
  level: 0,
  error: null,
}));

/** For what's worth keeping across a reload. Level and the like go direct. */
function set(patch: Partial<LiveState>) {
  useLive.setState(patch);
  const { sessionId, startedAt, ended } = useLive.getState();
  storage.save<Persisted>(KEY, { sessionId, startedAt, ended });
}

function goLive(sessionId: string) {
  const s = useLive.getState();
  if (s.sessionId === sessionId) return;
  set({
    sessionId,
    startedAt: Date.now(),
    ended: s.ended.filter((id) => id !== sessionId),
    error: null,
  });
}

/**
 * Run calls this when it opens an occurrence. It goes live if it's today's
 * or ahead, wasn't ended, and isn't about to cut off a meeting that's still
 * recording — a glance at the next 1:1 mustn't stop the one you're in.
 */
export function joinMeeting(sessionId: string) {
  const s = useLive.getState();
  if (s.sessionId === sessionId || s.ended.includes(sessionId)) return;
  if (s.sessionId && s.listening) return;
  const session = useStore.getState().sessions.find((o) => o.id === sessionId);
  if (!session || session.kind === "skipped" || session.date < todayISO()) return;
  goLive(sessionId);
}

/**
 * A Start button. Unlike opening Run, this always goes live — even on an
 * occurrence that was ended (Done by mistake, or a second sitting) — and
 * takes the mic off a meeting that ran over rather than let it keep writing
 * into the wrong transcript. Call it before opening the session.
 */
export function startMeeting(sessionId: string) {
  const s = useLive.getState();
  if (s.sessionId === sessionId) return;
  if (s.listening) stopListening();
  goLive(sessionId);
}

/** Done. Stops the mic if it was this meeting's; a no-op for any other. */
export function endMeeting(sessionId: string) {
  const s = useLive.getState();
  if (!s.sessionId || s.sessionId !== sessionId) return;
  stopListening();
  set({
    sessionId: null,
    startedAt: null,
    ended: [sessionId, ...s.ended.filter((id) => id !== sessionId)].slice(0, ENDED_KEEP),
    error: null,
  });
}

// ── The microphone ─────────────────────────────────────────────────────────

/** Still wanted. Both engines stop on their own; we go again. */
let wanted = false;
/** Bumped on every start and stop, so a slow start can tell it was cancelled. */
let generation = 0;

function join(a: string, b: string): string {
  if (!b) return a;
  if (!a) return b;
  return /\s$/.test(a) ? a + b : `${a} ${b}`;
}

function transcriptOf(sessionId: string): string {
  return useStore.getState().sessions.find((o) => o.id === sessionId)?.transcript ?? "";
}

function write(sessionId: string, text: string) {
  useStore.getState().updateSession(sessionId, { transcript: text || undefined });
}

/** Turn the mic on for this occurrence. Recording makes it the live meeting. */
export function startListening(sessionId: string) {
  const s = useLive.getState();
  if (s.listening && s.sessionId === sessionId) return;
  stopListening();
  goLive(sessionId);
  wanted = true;
  const gen = ++generation;
  // Made inside the click, so Safari lets it run; the level meter needs it.
  const ctx = makeAudioContext();
  useLive.setState({ listening: true, engine: null, error: null });
  void serverTranscription().then((server) => {
    if (gen !== generation) {
      void ctx?.close();
      return;
    }
    if (server) {
      useLive.setState({ engine: "server" });
      void beginRecording(sessionId, ctx, gen);
    } else {
      void ctx?.close();
      useLive.setState({ engine: "browser" });
      restarts = [];
      beginSpeech(sessionId);
    }
  });
}

export function stopListening() {
  wanted = false;
  generation++;
  stopSpeech();
  stopRecording();
  if (useLive.getState().listening) useLive.setState({ listening: false, level: 0 });
}

export function toggleListening(sessionId: string) {
  const s = useLive.getState();
  if (s.listening && s.sessionId === sessionId) stopListening();
  else startListening(sessionId);
}

function fail(message: string) {
  wanted = false;
  generation++;
  stopSpeech();
  stopRecording();
  useLive.setState({ listening: false, level: 0, error: message });
}

// ── Browser engine: Web Speech ─────────────────────────────────────────────

let rec: SpeechRecognitionLike | null = null;
/** What was last written as unconfirmed, so the next result can replace it. */
let interim = "";
let restarts: number[] = [];

function beginSpeech(sessionId: string) {
  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    fail("Live listen isn't supported in this browser. Paste a transcript instead.");
    return;
  }
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = "en-US";
  // Whatever was unconfirmed when the last run ended stays as heard.
  interim = "";
  r.onresult = (event) => {
    if (rec !== r) return;
    // Read back what's stored rather than a copy taken at start, so anything
    // typed into the transcript while listening survives the next phrase.
    let base = transcriptOf(sessionId);
    if (interim && base.endsWith(interim)) base = base.slice(0, -interim.length).trimEnd();
    let pending = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = (event.results[i][0]?.transcript ?? "").trim();
      if (!piece) continue;
      if (event.results[i].isFinal) base = join(base, applyGlossary(piece, useStore.getState().glossary));
      else pending = join(pending, piece);
    }
    interim = pending;
    write(sessionId, join(base, pending).trim());
  };
  r.onerror = (e) => {
    if (rec !== r) return;
    // A pause or our own stop. The end handler decides whether to go again.
    if (e.error === "no-speech" || e.error === "aborted") return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      fail("Microphone permission denied.");
    } else if (e.error === "audio-capture") {
      fail("No microphone found.");
    } else {
      useLive.setState({ error: `Listening stopped (${e.error}).` });
    }
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    if (!wanted) {
      useLive.setState({ listening: false });
      return;
    }
    // Go again — unless it keeps dying, which means it won't recover alone.
    const now = Date.now();
    restarts = [...restarts.filter((t) => now - t < 10_000), now];
    if (restarts.length > 5) {
      fail("Listening keeps dropping. Try Listen again.");
      return;
    }
    setTimeout(() => {
      if (wanted && !rec) beginSpeech(sessionId);
    }, 250);
  };
  rec = r;
  try {
    r.start();
  } catch {
    rec = null;
    fail("Could not start the microphone.");
  }
}

function stopSpeech() {
  const r = rec;
  rec = null;
  r?.stop();
}

// ── Server engine: recorded segments ───────────────────────────────────────

/*
 * Audio is recorded in segments and each one is sent as it closes. A segment
 * ends at the first pause after MIN_SEGMENT_MS — so a sentence is rarely cut
 * in half — or at MAX_SEGMENT_MS whatever is happening. A segment nobody
 * spoke in is never sent: it costs money, and a transcription model handed
 * silence has a habit of hearing "Thank you for watching."
 */
const MIN_SEGMENT_MS = 12_000;
const MAX_SEGMENT_MS = 30_000;
const PAUSE_MS = 600;
const TICK_MS = 100;
/** RMS of a quiet room versus someone talking near a laptop mic. */
const SPEECH_RMS = 0.015;

type Segment = { recorder: MediaRecorder; startedAt: number; heard: boolean };

type Recording = {
  sessionId: string;
  stream: MediaStream;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  timer: ReturnType<typeof setInterval> | null;
  mime: string;
  segment: Segment | null;
  quietSince: number | null;
  closing: boolean;
};

let recording: Recording | null = null;

function makeAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = Ctor ? new Ctor() : null;
    void ctx?.resume();
    return ctx;
  } catch {
    return null;
  }
}

async function beginRecording(sessionId: string, ctx: AudioContext | null, gen: number) {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    void ctx?.close();
    if (gen !== generation) return;
    const name = err instanceof DOMException ? err.name : "";
    fail(
      name === "NotAllowedError"
        ? "Microphone permission denied."
        : name === "NotFoundError"
          ? "No microphone found."
          : "Could not start the microphone."
    );
    return;
  }
  if (gen !== generation) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close();
    return;
  }

  let analyser: AnalyserNode | null = null;
  if (ctx) {
    try {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch {
      analyser = null;
    }
  }

  const r: Recording = {
    sessionId,
    stream,
    ctx,
    analyser,
    timer: null,
    mime: recordingMime(),
    segment: null,
    quietSince: null,
    closing: false,
  };
  recording = r;
  // The track can end under us — a headset unplugged, permission revoked.
  stream.getAudioTracks()[0]?.addEventListener("ended", () => {
    if (recording === r && wanted) fail("The microphone went away.");
  });
  try {
    beginSegment(r);
  } catch {
    fail("Could not start recording.");
    return;
  }
  r.timer = setInterval(() => tick(r), TICK_MS);
}

/** A meter we can trust to say "silent". A suspended context reads zeros. */
function metering(r: Recording): boolean {
  return Boolean(r.analyser && r.ctx?.state === "running");
}

function beginSegment(r: Recording) {
  const recorder = new MediaRecorder(
    r.stream,
    r.mime ? { mimeType: r.mime, audioBitsPerSecond: 32_000 } : undefined
  );
  // Without a working meter there's no knowing it was silent, so send it.
  const seg: Segment = { recorder, startedAt: Date.now(), heard: !metering(r) };
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType || r.mime || "audio/webm" });
    if (seg.heard && blob.size > 0) enqueue(r.sessionId, blob);
    if (r.closing && r.segment === null) teardown(r);
  };
  recorder.start();
  r.segment = seg;
  r.quietSince = null;
}

function tick(r: Recording) {
  const seg = r.segment;
  if (!seg) return;
  const now = Date.now();
  if (metering(r)) {
    const level = rms(r.analyser!);
    const shown = Math.min(1, level * 12);
    if (Math.abs(shown - useLive.getState().level) > 0.03) useLive.setState({ level: shown });
    if (level > SPEECH_RMS) {
      seg.heard = true;
      r.quietSince = null;
    } else {
      r.quietSince ??= now;
    }
  }
  const age = now - seg.startedAt;
  const paused = r.quietSince !== null && now - r.quietSince >= PAUSE_MS;
  if ((age >= MIN_SEGMENT_MS && (paused || !metering(r))) || age >= MAX_SEGMENT_MS) {
    // The next segment starts before this one stops, so nothing falls between.
    beginSegment(r);
    seg.recorder.stop();
  }
}

function rms(analyser: AnalyserNode): number {
  const buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function stopRecording() {
  const r = recording;
  if (!r) return;
  recording = null;
  r.closing = true;
  if (r.timer) clearInterval(r.timer);
  const seg = r.segment;
  r.segment = null;
  // The last stretch still goes; the mic is let go once it's been collected.
  if (seg && seg.recorder.state !== "inactive") seg.recorder.stop();
  else teardown(r);
}

function teardown(r: Recording) {
  r.stream.getTracks().forEach((t) => t.stop());
  void r.ctx?.close().catch(() => undefined);
}

// ── Segments on their way to text ──────────────────────────────────────────

type Queued = { sessionId: string; blob: Blob; tries: number };
const queue: Queued[] = [];
let draining = false;
const BACKOFF_MS = [2_000, 5_000, 10_000, 20_000, 30_000];

function enqueue(sessionId: string, blob: Blob) {
  queue.push({ sessionId, blob, tries: 0 });
  useLive.setState({ pending: queue.length });
  void drain();
}

/** One at a time, in order: the transcript has to read in the order it was said. */
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const item = queue[0];
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        useLive.setState({ error: "Offline — transcription will catch up when you're back." });
        await new Promise<void>((resolve) =>
          window.addEventListener("online", () => resolve(), { once: true })
        );
        continue;
      }
      const src = useStore.getState();
      const meetingId = src.sessions.find((o) => o.id === item.sessionId)?.meetingId ?? "";
      const prompt = transcriptionPrompt(src, meetingId, transcriptOf(item.sessionId));
      const result = await transcribeSegment(item.blob, prompt);
      if (!result.ok && result.retry && item.tries < BACKOFF_MS.length) {
        useLive.setState({ error: `${result.message} Retrying…` });
        await new Promise((r) => setTimeout(r, BACKOFF_MS[item.tries]));
        item.tries++;
        continue;
      }
      queue.shift();
      useLive.setState({ pending: queue.length });
      if (result.ok) {
        if (useLive.getState().error?.endsWith("Retrying…") || useLive.getState().error?.startsWith("Offline")) {
          useLive.setState({ error: null });
        }
        const text = applyGlossary(result.text.trim(), useStore.getState().glossary);
        // A paragraph per stretch: it was cut at a pause, so it reads like one.
        if (text) write(item.sessionId, joinParagraph(transcriptOf(item.sessionId), text));
      } else {
        useLive.setState({ error: result.message });
      }
    }
  } finally {
    draining = false;
  }
}

function joinParagraph(a: string, b: string): string {
  const head = a.trimEnd();
  return head ? `${head}\n${b}` : b;
}

// Leaving the page with the mic on, or audio not yet written down, loses it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    if (recording || queue.length) e.preventDefault();
  });
}

/** "4:05", "1:02:05". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
