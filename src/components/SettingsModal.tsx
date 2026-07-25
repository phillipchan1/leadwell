import { useState } from "react";
import { useStore } from "../store/useStore";
import { Modal, buttonGhostCls, buttonPrimaryCls } from "./ui";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { userEmail, dark, toggleDark, signOut } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSignOut = async () => {
    setError(null);
    setBusy(true);
    try {
      await signOut();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
            Account
          </h3>
          <p className="text-xs leading-relaxed text-stone-500">
            Signed in with Google. Your org data syncs to the cloud and stays
            private to this account (row-level security).
          </p>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-950/50">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
              Signed in as
            </p>
            <p className="mt-0.5 text-sm text-stone-800 dark:text-stone-100">
              {userEmail ?? "Google account"}
            </p>
          </div>
          <button
            type="button"
            className={`${buttonGhostCls} w-full border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40`}
            onClick={onSignOut}
            disabled={busy}
          >
            {busy ? "Signing out…" : "Sign out"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
            Appearance
          </h3>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-stone-700 dark:text-stone-200">
                Dark mode
              </p>
              <p className="text-xs text-stone-500">
                Preference stays on this device.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              onClick={toggleDark}
              className={`${buttonPrimaryCls} min-w-[4.5rem] ${
                dark ? "" : "bg-stone-300 text-stone-700 hover:bg-stone-400"
              }`}
            >
              {dark ? "On" : "Off"}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
            AI coach
          </h3>
          <p className="text-xs leading-relaxed text-stone-500">
            Coaching and 1:1 note structuring run through a secure server
            function. There is no API key to paste in the browser.
          </p>
        </section>
      </div>
    </Modal>
  );
}
