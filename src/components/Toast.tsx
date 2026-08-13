import {
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as AriaToastContent,
  UNSTABLE_ToastRegion as AriaToastRegion,
} from "react-aria-components";
import { AlertCircle, X } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { toastQueue } from "../lib/toasts";
import { cx } from "@/utils/cx";

/**
 * Renders the queue in `lib/toasts.ts`. Mounted once at the app root, beside
 * `<ConfirmHost />` — deliberately the same shape, so a caller doesn't have to
 * hold two different mental models for "ask the user" and "tell the user".
 *
 * Built on React Aria's toast primitives (the same family `ui.tsx`'s `Modal`
 * uses) so the announcement, the landmark and focus containment come for free
 * rather than being re-derived here. The region portals into `document.body`
 * and renders nothing at all while the queue is empty.
 */
export function ToastHost() {
  return (
    <AriaToastRegion
      queue={toastQueue}
      aria-label="Notifications"
      /* Above the bottom nav on a phone — a toast that covers the primary
         navigation is a toast that has to be waited out. Bottom-right on lg,
         where there is no nav to clear and the centre of the screen is work.
         `col-reverse` because the region is anchored to the bottom: the queue
         hands us newest-first, and the newest one belongs nearest the edge
         you're already looking at, not pushed up the screen by older news. */
      className={cx(
        "pad-safe-x pointer-events-none fixed inset-x-0 z-50 flex flex-col-reverse items-center gap-2",
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] [--pad-safe-x:1rem]",
        "lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end"
      )}
    >
      {({ toast: t }) => {
        const { message, tone, action } = t.content;
        return (
          <AriaToast
            toast={t}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-xl border py-2 pr-2 pl-3.5 shadow-lg",
              "outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2",
              tone === "error"
                ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                : "border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"
            )}
          >
            <AriaToastContent className="flex min-w-0 flex-1 items-center gap-2">
              {tone === "error" && (
                <AlertCircle
                  className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              )}
              <Text
                slot="title"
                className={cx(
                  "min-w-0 text-sm",
                  tone === "error"
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-stone-700 dark:text-stone-200"
                )}
              >
                {message}
              </Text>
            </AriaToastContent>

            {action && (
              <Button
                size="sm"
                color="link-color"
                className="shrink-0"
                onClick={() => {
                  action.onAction();
                  toastQueue.close(t.key);
                }}
              >
                {action.label}
              </Button>
            )}

            <ButtonUtility
              slot="close"
              size="sm"
              color="tertiary"
              icon={X}
              tooltip="Dismiss"
              className="shrink-0"
            />
          </AriaToast>
        );
      }}
    </AriaToastRegion>
  );
}
