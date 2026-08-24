import { useEffect, useRef, useState } from "react";
import { dispatchKey } from "@/lib/shortcuts";
import { setAnnouncer } from "@/lib/announce";
import { isTypingTarget } from "@/lib/keys";

/** How long a `g` prefix waits for its second key before giving up. */
const SEQUENCE_MS = 1200;

export type GoTarget = "tree" | "meetings" | "table";

const GO_KEYS: Record<string, GoTarget> = {
  t: "tree",
  m: "meetings",
  b: "table",
};

/**
 * Mounts the app's single `keydown` listener, the single live region, and the
 * `g`-prefixed "go to" sequences.
 *
 * One listener rather than the eleven the app had before. Those each re-derived
 * "is the user typing" and "is a modal open", and they disagreed — which is how
 * the org tree's digit shortcuts kept firing inside the canvas's own text
 * fields. Everything routes through `dispatchKey` now.
 *
 * Sequences live here rather than in the registry because they're the one
 * binding with state: `g` alone means nothing until the next key arrives.
 */
export function ShortcutHost({ onGo }: { onGo: (target: GoTarget) => void }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<number>(undefined);

  useEffect(() => {
    setAnnouncer(setMessage);
    return () => setAnnouncer(null);
  }, []);

  useEffect(() => {
    const clearPending = () => {
      window.clearTimeout(timerRef.current);
      pendingRef.current = false;
      setPending(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (pendingRef.current) {
        clearPending();
        const target = GO_KEYS[e.key.toLowerCase()];
        if (target) {
          e.preventDefault();
          onGo(target);
          return;
        }
        // Not a "go to" key — fall through and let it mean whatever it means.
      } else if (
        e.key.toLowerCase() === "g" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        pendingRef.current = true;
        setPending(true);
        timerRef.current = window.setTimeout(clearPending, SEQUENCE_MS);
        return;
      }
      dispatchKey(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timerRef.current);
    };
  }, [onGo]);

  return (
    <>
      {/* Everything the app needs to say out loud. Always mounted — a live
          region added at the same moment as its text is not announced. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {message}
      </div>

      {/* The pending `g`, shown rather than left as a guess. */}
      {pending && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg dark:bg-stone-700">
          <kbd className="font-mono">G</kbd> — then T, M or B
        </div>
      )}
    </>
  );
}
