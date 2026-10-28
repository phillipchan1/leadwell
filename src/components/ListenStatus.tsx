import { useLive } from "../lib/liveMeeting";
import { cx } from "@/utils/cx";

/**
 * What the mic is doing, beside Listen: a level meter so you can see it's
 * hearing the room, and a line on how the words will arrive. Its own
 * component because the level changes ten times a second and nothing else in
 * Run should re-render with it.
 */
export function ListenStatus({ sessionId }: { sessionId: string }) {
  const listening = useLive((s) => s.listening && s.sessionId === sessionId);
  const engine = useLive((s) => s.engine);
  const level = useLive((s) => s.level);
  const pending = useLive((s) => (s.sessionId === sessionId ? s.pending : 0));

  if (!listening && !pending) return null;

  const note =
    pending > 0
      ? "Transcribing…"
      : engine === "server"
        ? "Words land after each pause"
        : engine === "browser"
          ? "Browser speech — names may come out wrong"
          : "Starting…";

  return (
    <span className="ml-1 inline-flex items-center gap-2 text-[11.5px] text-tertiary" aria-live="polite">
      {listening && engine === "server" && (
        <span aria-hidden className="flex h-3.5 items-end gap-[2px]">
          {[0.15, 0.3, 0.5, 0.7, 0.9].map((at) => (
            <i
              key={at}
              className={cx(
                "w-[3px] rounded-[1px] transition-colors",
                level >= at ? "bg-red-500" : "bg-stone-300 dark:bg-stone-600"
              )}
              style={{ height: `${30 + at * 70}%` }}
            />
          ))}
        </span>
      )}
      {note}
    </span>
  );
}
