import { useState } from "react";
import { useStore } from "../store/useStore";
import { Modal, buttonGhostCls } from "./ui";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { userEmail, signOut } = useStore();
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    try {
      await signOut();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-6">
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
            Account
          </h3>
          <p className="text-xs leading-relaxed text-stone-500">
            Signed in with Google. Your org data syncs to the cloud and is
            private to your account.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-sm text-stone-700 dark:bg-stone-800 dark:text-stone-200">
              {userEmail ?? "Signed in"}
            </span>
            <button
              type="button"
              className={buttonGhostCls}
              onClick={onSignOut}
              disabled={busy}
            >
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
            AI coach
          </h3>
          <p className="text-xs leading-relaxed text-stone-500">
            The AI coach and 1:1 note structuring run through a secure server
            function that holds the Anthropic key — nothing sensitive lives in
            your browser, and there's no key to paste here.
          </p>
        </section>
      </div>
    </Modal>
  );
}
