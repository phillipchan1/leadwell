import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  hasApiKey,
  structureMeetingNotes,
  type StructuredMeeting,
} from "../lib/ai";
import { WritingPad } from "./WritingPad";
import { buttonGhostCls, buttonPrimaryCls, inputCls } from "./ui";

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

function getSpeechRecognition():
  | (new () => SpeechRecognitionLike)
  | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function formatEntryDate(iso: string): string {
  if (!iso) return "Untitled entry";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function MeetingEditor({
  oneOnOneId,
  onClose,
}: {
  oneOnOneId: string;
  onClose: () => void;
}) {
  const {
    oneOnOnes,
    people,
    updateOneOnOne,
    deleteOneOnOne,
    addAction,
    setSettingsOpen,
  } = useStore();
  const meeting = oneOnOnes.find((o) => o.id === oneOnOneId);
  const person = people.find((p) => p.id === meeting?.personId);

  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [transcript, setTranscript] = useState(meeting?.transcript ?? "");
  const [date, setDate] = useState(meeting?.date ?? "");
  const [nextDate, setNextDate] = useState(meeting?.nextDate ?? "");
  const [listening, setListening] = useState(false);
  const [showCapture, setShowCapture] = useState(
    Boolean(meeting?.transcript?.trim())
  );
  const [structuring, setStructuring] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsed, setParsed] = useState<StructuredMeeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createTopics, setCreateTopics] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    if (!meeting) return;
    setNotes(meeting.notes ?? "");
    setTranscript(meeting.transcript ?? "");
    setDate(meeting.date);
    setNextDate(meeting.nextDate ?? "");
  }, [meeting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  if (!meeting || !person) {
    return null;
  }

  const persist = (patch: Partial<{
    notes: string;
    transcript: string;
    date: string;
    nextDate: string | undefined;
  }>) => {
    const next: Partial<typeof meeting> = {};
    if ("notes" in patch) next.notes = patch.notes?.trim() || undefined;
    if ("transcript" in patch)
      next.transcript = patch.transcript?.trim() || undefined;
    if ("date" in patch && patch.date) next.date = patch.date;
    if ("nextDate" in patch) next.nextDate = patch.nextDate || undefined;
    updateOneOnOne(meeting.id, next);
  };

  const saveNotes = (value: string) => {
    setNotes(value);
    persist({ notes: value });
  };

  const saveTranscript = (value: string) => {
    setTranscript(value);
    persist({ transcript: value });
  };

  const toggleListen = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError(
        "Live listen isn’t supported in this browser. Paste a transcript instead."
      );
      setShowCapture(true);
      return;
    }
    setError(null);
    setShowCapture(true);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let committed = transcriptRef.current;
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          committed = `${committed}${committed && !committed.endsWith(" ") ? " " : ""}${piece}`.trimEnd();
          if (!committed.endsWith("\n")) committed += " ";
        } else {
          interim += piece;
        }
      }
      const next = `${committed}${interim}`.trim();
      setTranscript(next);
      transcriptRef.current = next;
      updateOneOnOne(meeting.id, { transcript: next || undefined });
    };
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied." : e.error);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
      setListening(false);
    }
  };

  const runStructure = async () => {
    if (!hasApiKey()) {
      setSettingsOpen(true);
      return;
    }
    setError(null);
    setStructuring(true);
    setPreview("");
    setParsed(null);
    try {
      const result = await structureMeetingNotes({
        personId: person.id,
        transcript,
        draftNotes: notes,
        onDelta: (t) => setPreview(t),
      });
      setParsed(result);
      setPreview(result.notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not structure notes.");
      setPreview(null);
    } finally {
      setStructuring(false);
    }
  };

  const acceptStructured = () => {
    if (!parsed) return;
    saveNotes(parsed.notes);
    if (parsed.suggestedNextDate) {
      setNextDate(parsed.suggestedNextDate);
      updateOneOnOne(meeting.id, {
        notes: parsed.notes,
        nextDate: parsed.suggestedNextDate,
      });
    }
    if (createTopics && parsed.commitments.length) {
      for (const text of parsed.commitments) {
        addAction(person.id, text, undefined, "backlog");
      }
    }
    setParsed(null);
    setPreview(null);
  };

  const firstName = person.name.split(" ")[0] ?? person.name;

  return (
    <div className="meeting-journal absolute inset-0 z-20 flex flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          onClick={onClose}
        >
          ← Back
        </button>
        <div className="flex-1" />
        <button
          type="button"
          className="rounded-md p-1.5 text-ink-3/70 transition-colors hover:bg-red-500/10 hover:text-red-500"
          aria-label="Delete 1:1"
          onClick={() => {
            if (confirm("Delete this 1:1?")) {
              deleteOneOnOne(meeting.id);
              onClose();
            }
          }}
        >
          ✕
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-5 pb-10 sm:px-8">
          {/* Entry header — Day One style date hero */}
          <header className="pt-4 pb-6 text-center sm:pt-8 sm:pb-8">
            {editingMeta ? (
              <div className="mx-auto grid max-w-sm grid-cols-2 gap-3 text-left">
                <label className="block text-xs">
                  <span className="mb-1 block text-ink-3">Date</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={date}
                    autoFocus
                    onChange={(e) => {
                      setDate(e.target.value);
                      persist({ date: e.target.value });
                    }}
                    onBlur={() => setEditingMeta(false)}
                  />
                </label>
                <label className="block text-xs">
                  <span className="mb-1 block text-ink-3">Next 1:1</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={nextDate}
                    onChange={(e) => {
                      setNextDate(e.target.value);
                      updateOneOnOne(meeting.id, {
                        nextDate: e.target.value || undefined,
                      });
                    }}
                    onBlur={() => setEditingMeta(false)}
                  />
                </label>
              </div>
            ) : (
              <button
                type="button"
                className="group mx-auto block w-full"
                onClick={() => setEditingMeta(true)}
                title="Edit dates"
              >
                <h1 className="meeting-date text-[1.65rem] text-ink transition-colors group-hover:text-accent-ink sm:text-[1.85rem]">
                  {formatEntryDate(date)}
                </h1>
                <p className="mt-2 text-[13px] tracking-wide text-ink-3">
                  1:1 with {person.name}
                  {nextDate ? (
                    <span className="text-ink-3/60">
                      {" "}
                      · Next {formatEntryDate(nextDate).replace(/^[^,]+, /, "")}
                    </span>
                  ) : null}
                </p>
              </button>
            )}
          </header>

          {/* Quiet capture tools */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                listening
                  ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink"
              }`}
              onClick={toggleListen}
            >
              {listening ? "● Listening…" : "Listen"}
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                showCapture
                  ? "bg-surface-2 text-ink"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink"
              }`}
              onClick={() => setShowCapture((v) => !v)}
            >
              Transcript
            </button>
            <button
              type="button"
              className="btn-primary rounded-full !px-3 !py-1.5 text-xs disabled:opacity-60"
              disabled={structuring}
              onClick={runStructure}
            >
              {structuring ? "Structuring…" : "✦ Structure"}
            </button>
          </div>

          {error && (
            <p className="mb-4 text-center text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {showCapture && (
            <div className="mb-6 space-y-2">
              <div className="text-center text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
                Capture
              </div>
              <textarea
                className={`${inputCls} min-h-[88px] resize-y font-mono text-xs leading-relaxed`}
                placeholder={`Paste a transcript from your 1:1 with ${firstName}, or use Listen…`}
                value={transcript}
                onChange={(e) => saveTranscript(e.target.value)}
              />
            </div>
          )}

          {preview !== null ? (
            <div className="space-y-4">
              <div className="text-center text-[10px] font-medium tracking-[0.16em] text-accent-ink uppercase">
                {structuring ? "Writing draft…" : "AI draft — review"}
              </div>
              <WritingPad
                value={preview}
                onChange={(e) => {
                  setPreview(e.target.value);
                  if (parsed) {
                    setParsed({ ...parsed, notes: e.target.value });
                  }
                }}
                readOnly={structuring}
                dualMode={!structuring}
                startEditing={!structuring}
                placeholder="Structuring…"
              />
              {parsed && !structuring && (
                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {parsed.commitments.length > 0 && (
                    <label className="flex items-center gap-2 text-xs text-ink-2">
                      <input
                        type="checkbox"
                        style={{ accentColor: "var(--lw-accent)" }}
                        checked={createTopics}
                        onChange={(e) => setCreateTopics(e.target.checked)}
                      />
                      Add {parsed.commitments.length} commitment
                      {parsed.commitments.length === 1 ? "" : "s"} as topics
                    </label>
                  )}
                  <button
                    type="button"
                    className={buttonPrimaryCls}
                    onClick={acceptStructured}
                  >
                    Accept into notes
                  </button>
                  <button
                    type="button"
                    className={buttonGhostCls}
                    onClick={() => {
                      setPreview(null);
                      setParsed(null);
                    }}
                  >
                    Discard
                  </button>
                </div>
              )}
            </div>
          ) : (
            <WritingPad
              value={notes}
              onChange={(e) => saveNotes(e.target.value)}
              placeholder={`What did you and ${firstName} cover?\n\n## Summary\n\n## Decisions\n- \n\n## Commitments\n- `}
              autoFocus={!notes.trim()}
              startEditing={!notes.trim()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
