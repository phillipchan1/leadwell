import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import { dismissToast, toast } from "../lib/toasts";

/**
 * Says out loud what the sync machinery is already doing.
 *
 * The retry/backoff in the store is correct and does not need help — what was
 * missing is that a leader who typed four sentences about a hard conversation
 * had no way to know whether they landed. So: announce the *transitions*, not
 * the traffic. One toast when saving starts failing, one when it recovers, and
 * nothing at all for the ordinary debounced write that succeeds — a receipt
 * printed every 600ms is noise, and noise is how a real warning gets ignored.
 *
 * The failure toast is held open across the whole retry sequence (error →
 * saving → error leaves it up), because the honest state for that entire
 * window is "not saved yet". It is dismissed by the recovery, not by a timer.
 *
 * Called from `App` above the phase gates, so a failure is announced in the
 * session editor too — that route renders its own chrome and no header.
 */
export function useSyncToasts() {
  const syncStatus = useStore((s) => s.syncStatus);
  const openErrorToast = useRef<string | null>(null);

  useEffect(() => {
    if (syncStatus === "error") {
      // Already announced. Every subsequent retry failure is the same news.
      if (openErrorToast.current) return;
      openErrorToast.current = toast({
        message: "Couldn't save — we'll keep retrying.",
        tone: "error",
      });
      return;
    }

    // "saving" after an error is not yet recovery — hold the warning until a
    // write actually lands.
    if (syncStatus !== "idle" || !openErrorToast.current) return;

    dismissToast(openErrorToast.current);
    openErrorToast.current = null;
    toast({ message: "Saved." });
  }, [syncStatus]);
}
