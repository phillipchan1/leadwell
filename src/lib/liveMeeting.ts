import { create } from "zustand";
import { useStore } from "../store/useStore";
import { storage } from "./storage";
import { todayISO } from "./readiness";

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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
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
  error: string | null;
};

const KEY = "live";
/** A meeting nobody ended is still forgotten by the next morning. */
const STALE_MS = 10 * 60 * 60 * 1000;
const ENDED_KEEP = 30;

type Persisted = Pick<LiveState, "sessionId" | "startedAt" | "ended">;

function load(): Persisted {
  const saved = storage.load<Persisted>(KEY);
  const ended = Array.isArray(saved?.ended) ? saved.ended : [];
  if (!saved?.sessionId || !saved.startedAt || Date.now() - saved.startedAt > STALE_MS) {
    return { sessionId: null, startedAt: null, ended };
  }
  return { sessionId: saved.sessionId, startedAt: saved.startedAt, ended };
}

export const useLive = create<LiveState>(() => ({
  ...load(),
  listening: false,
  error: null,
}));

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

let rec: SpeechRecognitionLike | null = null;
/** Still wanted. Chrome ends a "continuous" session after a pause; we go again. */
let wanted = false;
/** What was last written as unconfirmed, so the next result can replace it. */
let interim = "";
let restarts: number[] = [];

function join(a: string, b: string): string {
  if (!b) return a;
  if (!a) return b;
  return /\s$/.test(a) ? a + b : `${a} ${b}`;
}

function write(sessionId: string, text: string) {
  useStore.getState().updateSession(sessionId, { transcript: text || undefined });
}

function begin(sessionId: string) {
  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    set({ error: "Live listen isn't supported in this browser. Paste a transcript instead." });
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
    let base =
      useStore.getState().sessions.find((o) => o.id === sessionId)?.transcript ?? "";
    if (interim && base.endsWith(interim)) base = base.slice(0, -interim.length).trimEnd();
    let pending = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = (event.results[i][0]?.transcript ?? "").trim();
      if (!piece) continue;
      if (event.results[i].isFinal) base = join(base, piece);
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
      wanted = false;
      set({ error: "Microphone permission denied.", listening: false });
    } else if (e.error === "audio-capture") {
      wanted = false;
      set({ error: "No microphone found.", listening: false });
    } else {
      set({ error: `Listening stopped (${e.error}).` });
    }
  };
  r.onend = () => {
    if (rec !== r) return;
    rec = null;
    if (!wanted) {
      set({ listening: false });
      return;
    }
    // Go again — unless it keeps dying, which means it won't recover alone.
    const now = Date.now();
    restarts = [...restarts.filter((t) => now - t < 10_000), now];
    if (restarts.length > 5) {
      wanted = false;
      set({ listening: false, error: "Listening keeps dropping. Try Listen again." });
      return;
    }
    setTimeout(() => {
      if (wanted && !rec) begin(sessionId);
    }, 250);
  };
  rec = r;
  try {
    r.start();
    set({ listening: true });
  } catch {
    rec = null;
    wanted = false;
    set({ listening: false, error: "Could not start the microphone." });
  }
}

/** Turn the mic on for this occurrence. Recording makes it the live meeting. */
export function startListening(sessionId: string) {
  if (useLive.getState().listening && useLive.getState().sessionId === sessionId) return;
  stopListening();
  goLive(sessionId);
  set({ error: null });
  wanted = true;
  restarts = [];
  begin(sessionId);
}

export function stopListening() {
  wanted = false;
  const r = rec;
  rec = null;
  r?.stop();
  if (useLive.getState().listening) set({ listening: false });
}

export function toggleListening(sessionId: string) {
  const s = useLive.getState();
  if (s.listening && s.sessionId === sessionId) stopListening();
  else startListening(sessionId);
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
