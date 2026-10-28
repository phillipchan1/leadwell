import { Microphone01 } from "@untitledui/icons";
import { toggleDictation, useDictation } from "../lib/dictation";
import { useShortcut } from "@/hooks/use-shortcut";
import { formatChord } from "@/lib/keys";
import { cx } from "@/utils/cx";

const CHORD = "mod+shift+d";

/**
 * Say the note instead of typing it. Sits in the write-up's toolbar; the
 * button never takes focus, so the words land where the caret was.
 */
export function DictateButton({
  meetingId,
  onAppend,
}: {
  meetingId: string;
  /** Where the words go when no field had the caret. */
  onAppend: (text: string) => void;
}) {
  const state = useDictation((s) => s.state);
  const error = useDictation((s) => s.error);
  const toggle = () => toggleDictation(meetingId, onAppend);

  useShortcut(toggle, {
    chord: CHORD,
    label: "Dictate into the write-up",
    group: "Writing",
    allowInInput: true,
  });

  const label =
    state === "recording" ? "Stop" : state === "transcribing" ? "Writing it down…" : "Dictate";

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[11.5px] text-red-600 dark:text-red-400">{error}</span>}
      <button
        type="button"
        // Keep the caret where it is: that's where the words go.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        disabled={state === "transcribing"}
        aria-pressed={state === "recording"}
        title={`Dictate (${formatChord(CHORD)})`}
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] font-semibold transition-colors touch:min-h-11",
          state === "recording"
            ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
            : "text-tertiary hover:bg-secondary hover:text-secondary disabled:opacity-60"
        )}
      >
        <Microphone01 aria-hidden className={cx("size-3.5", state === "recording" && "animate-pulse")} />
        {label}
        {state === "idle" && (
          <kbd className="font-mono text-[10.5px] font-normal text-quaternary max-sm:hidden">{formatChord(CHORD)}</kbd>
        )}
      </button>
    </span>
  );
}
