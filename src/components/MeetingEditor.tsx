import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import {
  hasApiKey,
  structureMeetingNotes,
  type StructuredMeeting,
} from "../lib/ai";
import { SessionEditor } from "./SessionEditor";
import { SessionAgenda } from "./SessionAgenda";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";

import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { confirmAction } from "./ConfirmDialog";
import { autoFocusUnlessTouch } from "../lib/pointer";
import { ArrowLeft, DotsVertical, Trash01 } from "@untitledui/icons";

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
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const meetings = useStore((s) => s.meetings);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const updateSession = useStore((s) => s.updateSession);
  const deleteSession = useStore((s) => s.deleteSession);
  const addTopic = useStore((s) => s.addTopic);
  const session = sessions.find((o) => o.id === sessionId);
  const meeting = meetings.find((m) => m.id === session?.meetingId);
  const person =
    meeting?.subjectKind === "person"
      ? people.find((p) => p.id === meeting.subjectId)
      : undefined;
  const team =
    meeting?.subjectKind === "team"
      ? teams.find((t) => t.id === meeting.subjectId)
      : undefined;
  const manager =
    meeting?.subjectKind === "manager"
      ? managers.find((m) => m.id === meeting.subjectId)
      : undefined;
  const subjectName =
    person?.name ?? team?.name ?? manager?.name ?? "this meeting";
  const meetingLabel =
    meeting?.name ??
    (person ? `1:1 with ${person.name}` : (team?.name ?? manager?.name ?? "meeting"));

  const [notes, setNotes] = useState(session?.notes ?? "");
  const [point, setPoint] = useState(session?.point ?? "");
  const [transcript, setTranscript] = useState(session?.transcript ?? "");
  const [date, setDate] = useState(session?.date ?? "");
  const [nextDate, setNextDate] = useState(session?.nextDate ?? "");
  const [listening, setListening] = useState(false);
  // Resolved once at mount so the control can say up front whether it works.
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()));
  const [showCapture, setShowCapture] = useState(
    Boolean(session?.transcript?.trim())
  );
  const [structuring, setStructuring] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [parsed, setParsed] = useState<StructuredMeeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createTopics, setCreateTopics] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  useEffect(() => {
    if (!session) return;
    setNotes(session.notes ?? "");
    setPoint(session.point ?? "");
    setTranscript(session.transcript ?? "");
    setDate(session.date);
    setNextDate(session.nextDate ?? "");
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (preview !== null && !structuring) {
        e.preventDefault();
        setPreview(null);
        setParsed(null);
        return;
      }
      if (showCapture || showTools || editingMeta) {
        e.preventDefault();
        setShowCapture(false);
        setShowTools(false);
        setEditingMeta(false);
        return;
      }
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preview, structuring, showCapture, showTools, editingMeta, onClose]);

  if (!session || !meeting) {
    return null;
  }

  const persist = (patch: Partial<{
    notes: string;
    point: string;
    transcript: string;
    date: string;
    nextDate: string | undefined;
  }>) => {
    const next: Partial<typeof session> = {};
    if ("notes" in patch) next.notes = patch.notes?.trim() || undefined;
    if ("point" in patch) next.point = patch.point?.trim() || undefined;
    if ("transcript" in patch)
      next.transcript = patch.transcript?.trim() || undefined;
    if ("date" in patch && patch.date) next.date = patch.date;
    if ("nextDate" in patch) next.nextDate = patch.nextDate || undefined;
    updateSession(session.id, next);
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
        "Live listen isn't supported in this browser. Paste a transcript instead."
      );
      setShowCapture(true);
      setShowTools(true);
      return;
    }
    setError(null);
    setShowCapture(true);
    setShowTools(true);
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
      updateSession(session.id, { transcript: next || undefined });
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
      setError("AI structuring needs a signed-in session and the server AI function.");
      return;
    }
    setError(null);
    setStructuring(true);
    setPreview("");
    setParsed(null);
    setShowTools(true);
    try {
      const result = await structureMeetingNotes({
        personId: person?.id,
        teamId: team?.id,
        managerId: manager?.id,
        label: meetingLabel,
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
      updateSession(session.id, {
        notes: parsed.notes,
        nextDate: parsed.suggestedNextDate,
      });
    }
    // Onto the meeting's board, not a person's — which is what makes this
    // work for a staff meeting, where there is no person to hang it on and the
    // commitments used to be quietly dropped.
    if (createTopics && parsed.commitments.length) {
      for (const text of parsed.commitments) {
        addTopic(meeting.id, text, { lane: "backlog" });
      }
    }
    setParsed(null);
    setPreview(null);
  };

  const firstName = subjectName.split(" ")[0] ?? subjectName;
  const backLabel = person
    ? person.name
    : team
      ? team.name
      : manager
        ? manager.name
        : subjectName;

  return (
    <div className="meeting-editor-fullscreen">
      <header className="meeting-editor-topbar">
        <button
          type="button"
          className="meeting-editor-back flex min-h-11 shrink-0 items-center gap-1"
          onClick={onClose}
        >
          <ArrowLeft className="size-4 shrink-0" />
          <span className="max-w-[9rem] truncate">{backLabel}</span>
        </button>
        <span className="meeting-editor-topbar-label">{meetingLabel}</span>
        <div className="flex-1" />
        <button
          type="button"
          className={`meeting-editor-tool-toggle ${showTools ? "is-active" : ""}`}
          onClick={() => setShowTools((v) => !v)}
        >
          Tools
        </button>
        <EntryMenu
          onDelete={async () => {
            if (
              await confirmAction({
                title: "Delete this entry?",
                body: "The write-up and any transcript go with it.",
              })
            ) {
              deleteSession(session.id);
              onClose();
            }
          }}
        />
      </header>

      <div className="meeting-editor-scroll">
        <div className="meeting-editor-page">
          <header className="meeting-editor-header">
            {editingMeta ? (
              <div className="meeting-editor-meta-form">
                <Input
                  type="date"
                  label="Date"
                  size="sm"
                  value={date}
                  autoFocus={autoFocusUnlessTouch()}
                  onChange={(value) => {
                    setDate(value);
                    persist({ date: value });
                  }}
                  onBlur={() => setEditingMeta(false)}
                />
                <Input
                  type="date"
                  label="Next time"
                  size="sm"
                  value={nextDate}
                  onChange={(value) => {
                    setNextDate(value);
                    updateSession(session.id, {
                      nextDate: value || undefined,
                    });
                  }}
                  onBlur={() => setEditingMeta(false)}
                />
              </div>
            ) : (
              <button
                type="button"
                className="meeting-editor-title-btn"
                onClick={() => setEditingMeta(true)}
                title="Edit dates"
              >
                <h1 className="meeting-editor-title">{formatEntryDate(date)}</h1>
                <p className="meeting-editor-subtitle">
                  {meetingLabel}
                  {nextDate ? (
                    <span>
                      {" "}
                      · Next {formatEntryDate(nextDate).replace(/^[^,]+, /, "")}
                    </span>
                  ) : null}
                </p>
              </button>
            )}

            <input
              type="text"
              className="meeting-editor-point"
              placeholder="Why we met this time…"
              value={point}
              onChange={(e) => {
                setPoint(e.target.value);
                persist({ point: e.target.value });
              }}
            />
          </header>

          {showTools && (
            <div className="meeting-editor-tools">
              <div className="meeting-editor-tools-row">
                {speechSupported ? (
                  <button
                    type="button"
                    className={`meeting-editor-chip ${listening ? "is-listening" : ""}`}
                    onClick={toggleListen}
                  >
                    {listening ? "● Listening…" : "Listen"}
                  </button>
                ) : (
                  <span
                    className="meeting-editor-chip cursor-not-allowed opacity-60"
                    title="Live listen needs speech recognition, which this browser doesn't offer"
                  >
                    Listen unavailable — paste a transcript
                  </span>
                )}
                <button
                  type="button"
                  className={`meeting-editor-chip ${showCapture ? "is-active" : ""}`}
                  onClick={() => setShowCapture((v) => !v)}
                >
                  Transcript
                </button>
                <button
                  type="button"
                  className="meeting-editor-chip is-primary"
                  disabled={structuring}
                  onClick={runStructure}
                >
                  {structuring ? "Structuring…" : "✦ Structure"}
                </button>
              </div>

              {error && (
                <p className="meeting-editor-error">{error}</p>
              )}

              {showCapture && (
                <TextArea
                  aria-label="Transcript"
                  size="md"
                  textAreaClassName="meeting-editor-transcript"
                  placeholder={`Paste a transcript from ${person ? `your 1:1 with ${firstName}` : meetingLabel}, or use Listen…`}
                  value={transcript}
                  onChange={saveTranscript}
                />
              )}
            </div>
          )}

          {preview !== null ? (
            <div className="meeting-editor-preview-block">
              <div className="meeting-editor-preview-label">
                {structuring ? "Writing draft…" : "AI draft — review"}
              </div>
              <SessionEditor
                sessionId={session.id}
                value={preview}
                onChange={(v) => {
                  setPreview(v);
                  if (parsed) setParsed({ ...parsed, notes: v });
                }}
                readOnly={structuring}
                autoFocus={!structuring && autoFocusUnlessTouch()}
              />
              {parsed && !structuring && (
                <div className="meeting-editor-preview-actions">
                  {parsed.commitments.length > 0 && (
                    <Checkbox
                      size="sm"
                      isSelected={createTopics}
                      onChange={setCreateTopics}
                      label={`Add ${parsed.commitments.length} commitment${
                        parsed.commitments.length === 1 ? "" : "s"
                      } as topics`}
                    />
                  )}
                  <Button type="button" size="md" onClick={acceptStructured}>
                    Accept into notes
                  </Button>
                  <Button
                    type="button"
                    size="md"
                    color="secondary"
                    onClick={() => {
                      setPreview(null);
                      setParsed(null);
                    }}
                  >
                    Discard
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* What we planned to cover, where ticking it off is a tick and
                  not a trip back to the board. */}
              <SessionAgenda session={session} meeting={meeting} />
              <SessionEditor
                sessionId={session.id}
                value={notes}
                onChange={saveNotes}
                placeholder={`What did you and ${firstName} cover?\n\n## Summary\n\n## Decisions\n- \n\n## Commitments\n- `}
                autoFocus={!notes.trim() && autoFocusUnlessTouch()}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Destructive actions for the open entry, held behind one control so "Delete"
 * is never adjacent to a benign button in the topbar.
 */
function EntryMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Entry actions"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-100 active:bg-stone-200 dark:hover:bg-stone-800 dark:active:bg-stone-700"
      >
        <DotsVertical className="size-4.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-stone-200 bg-primary py-1 shadow-xl dark:border-stone-700"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex min-h-11 w-full items-center gap-2.5 px-4 text-left text-sm text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950/40"
          >
            <Trash01 className="size-4 shrink-0" />
            Delete entry
          </button>
        </div>
      )}
    </div>
  );
}
