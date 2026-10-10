import { useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { SessionEditor } from "./SessionEditor";
import { SessionAgenda } from "./SessionAgenda";
import { RunContext } from "./RunContext";
import { Avatar } from "./Avatar";

import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { confirmAction } from "./ConfirmDialog";
import { autoFocusUnlessTouch } from "../lib/pointer";
import { ArrowLeft, DotsVertical, Trash01 } from "@untitledui/icons";
import { useMenu } from "@/hooks/use-menu";

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
  const [error, setError] = useState<string | null>(null);
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
  }, [showCapture, showTools, editingMeta, onClose]);

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

  const firstName = subjectName.split(" ")[0] ?? subjectName;
  const backLabel = person
    ? person.name
    : team
      ? team.name
      : manager
        ? manager.name
        : subjectName;

  const subjectPhoto = person?.photo ?? manager?.photo;
  const runTitle = meeting.name?.trim()
    ? meeting.name
    : person
      ? `1:1 with ${person.name}`
      : manager
        ? `Check-in with ${manager.name}`
        : (team?.name ?? "Meeting");
  const dayLine = date
    ? new Date(`${date}T12:00:00`)
        .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
        .toUpperCase()
    : "";

  /*
   * Run: the meeting while it's happening. Leather across the top so it reads
   * as a different room from the rest of the app; the agenda on the left, the
   * write-up in the middle in the serif, and the person's context on the
   * right. Below lg the three stack, agenda first.
   */
  return (
    <div className="meeting-editor-fullscreen bg-secondary">
      <header className="pad-safe-top flex shrink-0 flex-wrap items-center gap-3 bg-leather px-3 pb-2.5 text-leather-fg [--pad-safe-top:0.625rem] sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={`Leave and go back to ${backLabel}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-leather-hi text-leather-ink transition-colors hover:text-leather-fg"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Avatar name={subjectName} photo={subjectPhoto} size={36} className={team ? "!rounded-[10px]" : undefined} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-serif text-[19px] leading-6">{runTitle}</span>
          <span className="font-mono text-[11px] tracking-[0.02em] text-leather-ink">
            {dayLine}
            {nextDate && ` · NEXT ${new Date(`${nextDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase()}`}
          </span>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowTools((v) => !v)}
          aria-pressed={showTools}
          className={`h-9 rounded-[9px] border px-3 text-[13px] font-medium transition-colors max-sm:hidden ${
            showTools ? "border-leather-hi bg-leather-hi text-leather-fg" : "border-leather-line text-leather-ink hover:text-leather-fg"
          }`}
        >
          {listening ? "● Listening" : "Transcribe"}
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
        <button
          type="button"
          onClick={onClose}
          className="h-9 rounded-[9px] bg-gilt px-4 text-[13.5px] font-semibold text-[#013133] transition-[filter] hover:brightness-105"
        >
          Done
        </button>
      </header>

      <div className="meeting-editor-scroll">
        <div className="flex min-h-full flex-wrap items-stretch">
          {/* Agenda */}
          <aside
            aria-label="Agenda"
            className="w-full border-secondary px-4 pt-6 sm:px-6 lg:w-[340px] lg:shrink-0 lg:border-r lg:pt-8 lg:pb-8"
          >
            <SessionAgenda session={session} meeting={meeting} ensureSession={() => session.id} />
          </aside>

          {/* The write-up */}
          <main className="min-w-0 flex-[999_1_480px] bg-primary px-5 py-8 sm:px-10 lg:px-14 lg:py-10">
            <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6">
              <header className="flex flex-col gap-3">
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
                    <span className="eyebrow">{formatEntryDate(date)} · edit dates</span>
                  </button>
                )}
                <label htmlFor="why-we-met" className="sr-only">
                  Why we met this time
                </label>
                <input
                  id="why-we-met"
                  type="text"
                  className="w-full border-0 bg-transparent p-0 font-serif text-[26px] leading-[34px] font-[450] text-primary outline-none placeholder:text-placeholder focus-visible:!outline-none"
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
                  </div>

                  {error && <p className="meeting-editor-error">{error}</p>}

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

              <SessionEditor
                sessionId={session.id}
                value={notes}
                onChange={saveNotes}
                placeholder={`What did you and ${firstName} cover?\n\n## Summary\n\n## Decisions\n- \n\n## Commitments\n- `}
                autoFocus={!notes.trim() && autoFocusUnlessTouch()}
              />

              <p className="flex flex-wrap gap-x-5 gap-y-1 border-t border-secondary pt-4 text-[12px] text-quaternary">
                <span>
                  <span className="font-mono">/</span> for headings, lists and to-dos
                </span>
                <span>Saved as you type</span>
              </p>
            </div>
          </main>

          {/* What you want in your peripheral vision */}
          <aside
            aria-label={`About ${subjectName}`}
            className="w-full border-secondary px-5 py-8 sm:px-6 xl:w-[320px] xl:shrink-0 xl:border-l"
          >
            <RunContext kind={meeting.subjectKind} id={meeting.subjectId} />
          </aside>
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
  const { triggerProps, menuProps, close } = useMenu(open, setOpen);

  return (
    <div className="relative">
      <button
        {...triggerProps}
        type="button"
        aria-label="Entry actions"
        onClick={() => setOpen((v) => !v)}
        className="flex size-9 items-center justify-center rounded-[9px] text-leather-ink transition-colors hover:bg-leather-hi hover:text-leather-fg touch:size-11"
      >
        <DotsVertical className="size-4.5" />
      </button>
      {open && (
        <div
          {...menuProps}
          aria-label="Entry actions"
          className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl border border-stone-200 bg-primary py-1 shadow-xl dark:border-stone-700"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(false);
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
