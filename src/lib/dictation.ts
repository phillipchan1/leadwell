import { create } from "zustand";
import { useStore } from "../store/useStore";
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
 * Dictate: your own words into the write-up, where the caret is.
 *
 * Not the meeting transcript — that's the room, kept as a record. This is
 * you, saying the note instead of typing it, after the meeting or between
 * agenda items. Press to talk, press again and it lands at the caret, spelled
 * with the same names the transcript knows.
 *
 * With the Worker transcribing, one recording goes up when you stop (a
 * dictated note is short; MAX_MS stops a forgotten one). Without it, the
 * browser's speech recognition types each phrase in as it's confirmed.
 */

type DictationState = {
  state: "idle" | "recording" | "transcribing";
  error: string | null;
};

export const useDictation = create<DictationState>(() => ({ state: "idle", error: null }));

const MAX_MS = 3 * 60_000;

type Target = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

let target: Target | null = null;
let fallback: ((text: string) => void) | null = null;
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let speech: SpeechRecognitionLike | null = null;
let limit: ReturnType<typeof setTimeout> | null = null;

/**
 * Start dictating for this meeting. The caret's field is remembered now, so
 * pressing the button (which takes focus) doesn't lose where the words go;
 * with no field focused they're handed to `append`.
 */
export async function startDictation(meetingId: string, append: (text: string) => void) {
  if (useDictation.getState().state !== "idle") return;
  target = editableTarget(document.activeElement);
  fallback = append;
  useDictation.setState({ state: "recording", error: null });

  if (await serverTranscription()) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const denied = err instanceof DOMException && err.name === "NotAllowedError";
      finish(denied ? "Microphone permission denied." : "Could not start the microphone.");
      return;
    }
    if (useDictation.getState().state !== "recording") {
      release();
      return;
    }
    const mime = recordingMime();
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      release();
      const blob = new Blob(chunks, { type: r.mimeType || mime || "audio/webm" });
      if (!blob.size) return finish(null);
      useDictation.setState({ state: "transcribing" });
      const src = useStore.getState();
      const result = await transcribeSegment(blob, transcriptionPrompt(src, meetingId));
      if (result.ok) {
        insert(result.text.trim());
        finish(null);
      } else {
        finish(result.message);
      }
    };
    recorder = r;
    r.start();
    limit = setTimeout(stopDictation, MAX_MS);
    return;
  }

  const Ctor = getSpeechRecognition();
  if (!Ctor) {
    finish("Dictation isn't available in this browser.");
    return;
  }
  const s = new Ctor();
  s.continuous = true;
  s.interimResults = false;
  s.lang = "en-US";
  s.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) insert((event.results[i][0]?.transcript ?? "").trim());
    }
  };
  s.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      finish("Microphone permission denied.");
    }
  };
  // Dictation is one go: when the browser ends it after a pause, so do we.
  s.onend = () => {
    if (speech === s) finish(null);
  };
  speech = s;
  try {
    s.start();
  } catch {
    finish("Could not start the microphone.");
  }
}

export function stopDictation() {
  if (limit) clearTimeout(limit);
  limit = null;
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    recorder = null;
    return;
  }
  const s = speech;
  speech = null;
  s?.stop();
  if (useDictation.getState().state === "recording") finish(null);
}

export function toggleDictation(meetingId: string, append: (text: string) => void) {
  if (useDictation.getState().state === "idle") void startDictation(meetingId, append);
  else stopDictation();
}

function release() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
}

function finish(error: string | null) {
  if (limit) clearTimeout(limit);
  limit = null;
  release();
  recorder = null;
  speech = null;
  useDictation.setState({ state: "idle", error });
}

function editableTarget(el: Element | null): Target | null {
  if (!el) return null;
  if (el instanceof HTMLTextAreaElement) return el;
  if (el instanceof HTMLInputElement && el.type === "text") return el;
  if (el instanceof HTMLElement && el.isContentEditable) return el;
  return null;
}

/**
 * Type it in at the caret, as if typed, so the editor's own undo, autosave
 * and markdown all see an ordinary edit. A space goes first unless the caret
 * already sits after one.
 */
function insert(raw: string) {
  const text = applyGlossary(raw, useStore.getState().glossary);
  if (!text) return;
  const el = target;
  if (el && el.isConnected) {
    el.focus();
    const before = charBeforeCaret(el);
    const piece = before && !/\s/.test(before) ? ` ${text}` : text;
    if (document.execCommand("insertText", false, piece)) return;
  }
  fallback?.(text);
}

function charBeforeCaret(el: Target): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const at = el.selectionStart ?? el.value.length;
    return el.value.slice(at - 1, at);
  }
  const sel = window.getSelection();
  const node = sel?.anchorNode;
  if (!sel || !node || !el.contains(node)) return "";
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").slice(sel.anchorOffset - 1, sel.anchorOffset);
  return "";
}
