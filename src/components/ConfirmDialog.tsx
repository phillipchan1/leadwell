import { useEffect, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Modal } from "./ui";

/**
 * In-app replacement for `window.confirm`.
 *
 * The system dialog is titled with the origin, which breaks the installed-app
 * illusion in iOS standalone and renders unthemed on Android. This keeps
 * destructive confirmation inside the app's own sheet — and, unlike
 * `confirm()`, it does not block the main thread.
 *
 * Usage: `if (await confirmAction({ … })) remove()`, with a single
 * `<ConfirmHost />` mounted at the app root.
 */
export type ConfirmRequest = {
  title: string;
  body?: string;
  /** Label for the affirmative action. Defaults to "Delete". */
  confirmLabel?: string;
  /** Renders the affirmative action as destructive. Defaults to true. */
  destructive?: boolean;
};

type PendingRequest = ConfirmRequest & { resolve: (ok: boolean) => void };

let publish: ((req: PendingRequest | null) => void) | null = null;

export function confirmAction(request: ConfirmRequest): Promise<boolean> {
  // No host mounted (tests, isolated renders): fail closed rather than
  // silently destroying data.
  if (!publish) return Promise.resolve(false);
  return new Promise((resolve) => {
    publish?.({ ...request, resolve });
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<PendingRequest | null>(null);

  useEffect(() => {
    publish = setRequest;
    return () => {
      publish = null;
    };
  }, []);

  if (!request) return null;

  const settle = (ok: boolean) => {
    request.resolve(ok);
    setRequest(null);
  };

  return (
    <Modal
      title={request.title}
      onClose={() => settle(false)}
      footer={
        <>
          <Button size="md" color="secondary" onClick={() => settle(false)}>
            Cancel
          </Button>
          <Button
            size="md"
            /* Focused on open, so the dialog answers ↵ and needs no reach for
               the mouse. Confirming is what you came here to do — you already
               pressed Delete once — and the way out is Esc, which is both the
               larger target and the one a keyboard user reaches first. */
            autoFocus
            color={
              request.destructive === false ? "primary" : "primary-destructive"
            }
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? "Delete"}
          </Button>
        </>
      }
    >
      <p className="text-sm text-stone-600 dark:text-stone-400">
        {request.body ?? "This can't be undone."}
      </p>
    </Modal>
  );
}
