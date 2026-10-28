import { useEffect, useState } from "react";
import { Microphone01, MicrophoneOff01, X } from "@untitledui/icons";
import { useStore } from "../store/useStore";
import { meetingSubjectName, meetingTitle } from "../lib/readiness";
import { endMeeting, formatElapsed, toggleListening, useLive } from "../lib/liveMeeting";
import { canTranscribe } from "../lib/transcriber";
import { cx } from "@/utils/cx";

/**
 * The meeting you stepped out of, wherever you went. One tap goes back into
 * Run; the mic and Done are here too, so checking the planner mid-meeting
 * never costs the transcript.
 *
 * `sidebar` sits in the desktop leather, `phone` is a strip over the tab bar,
 * and `run` is a chip in Run's own header for when the meeting that's live
 * isn't the one on screen.
 */
export function LivePill({
  tone,
  exceptSessionId,
}: {
  tone: "sidebar" | "phone" | "run";
  /** Hide while this occurrence is the one on screen. */
  exceptSessionId?: string;
}) {
  const sessionId = useLive((s) => s.sessionId);
  const startedAt = useLive((s) => s.startedAt);
  const listening = useLive((s) => s.listening);
  const session = useStore((s) => s.sessions.find((o) => o.id === sessionId));
  const meeting = useStore((s) => s.meetings.find((m) => m.id === session?.meetingId));
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const openSession = useStore((s) => s.openSession);
  const [canListen] = useState(canTranscribe);
  const now = useNow(Boolean(sessionId));

  if (!sessionId || !session || !meeting || sessionId === exceptSessionId) return null;

  const subject = meetingSubjectName(meeting, { people, teams, managers });
  const title = meetingTitle(meeting, subject);
  const elapsed = startedAt ? formatElapsed(now - startedAt) : "";
  const back = () => openSession(sessionId);

  const dot = (
    <span
      aria-hidden
      className={cx(
        "size-2 shrink-0 rounded-full",
        listening ? "animate-pulse bg-red-500" : "shadow-[inset_0_0_0_1.5px_currentColor]"
      )}
    />
  );

  if (tone === "run") {
    return (
      <button
        type="button"
        onClick={back}
        title={`Back to ${title}`}
        className="flex h-9 min-w-0 shrink items-center gap-2 rounded-[9px] border border-leather-line px-2.5 text-[12.5px] text-leather-ink transition-colors hover:text-leather-fg max-sm:hidden"
      >
        {dot}
        <span className="truncate">{title}</span>
        <span className="font-mono text-[11px]">{elapsed}</span>
      </button>
    );
  }

  const icon = tone === "phone" ? "size-11" : "size-8";
  const controls = (
    <>
      {canListen && (
        <button
          type="button"
          onClick={() => toggleListening(sessionId)}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Listen"}
          title={listening ? "Stop listening" : "Listen"}
          className={cx(
            "flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-leather-hi hover:text-leather-fg",
            icon,
            listening && "text-red-400"
          )}
        >
          {listening ? <Microphone01 className="size-4" /> : <MicrophoneOff01 className="size-4" />}
        </button>
      )}
      <button
        type="button"
        onClick={() => endMeeting(sessionId)}
        aria-label={`End ${title}`}
        title="End the meeting"
        className={cx(
          "flex shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-leather-hi hover:text-leather-fg",
          icon
        )}
      >
        <X className="size-4" />
      </button>
    </>
  );

  if (tone === "phone") {
    return (
      <div
        role="status"
        aria-label={`In a meeting: ${title}`}
        className="pad-safe-x flex shrink-0 items-center gap-1 border-t border-leather-line bg-leather text-leather-ink [--pad-safe-x:0.75rem] lg:hidden"
      >
        <button
          type="button"
          onClick={back}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          {dot}
          <span className="truncate font-serif text-[15px] text-leather-fg">{title}</span>
          <span className="ml-auto font-mono text-[11.5px]">{elapsed}</span>
        </button>
        {controls}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={`In a meeting: ${title}`}
      className="flex items-center gap-0.5 rounded-[10px] bg-leather-hi py-1 pr-1 pl-2.5 text-leather-ink"
    >
      <button
        type="button"
        onClick={back}
        title="Back to the meeting"
        className="flex min-w-0 flex-1 flex-col items-start py-0.5 text-left"
      >
        <span className="flex w-full items-center gap-2 text-[10.5px] font-semibold tracking-[0.08em] whitespace-nowrap uppercase">
          {dot}
          {listening ? "Listening" : "Live"}
          <span className="ml-auto font-mono text-[11px] tracking-normal normal-case">{elapsed}</span>
        </span>
        <span className="w-full truncate font-serif text-[15px] text-leather-fg">{title}</span>
      </button>
      {controls}
    </div>
  );
}

/** The time, ticking once a second while there's a clock to show. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}
