import { useState } from "react";
import { AlertCircle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { useStore } from "../store/useStore";
import { SkeletonLines } from "./Skeleton";
import { Mark } from "./brand/glyphs";

/*
 * The app's chrome before it is the app: the first paint and the load
 * failure. Navigation itself lives in `shell/` — the leather sidebar on a
 * desktop, the header and tab bar on a phone.
 */

/**
 * Branded first paint, so a cold mobile connection is not a blank screen.
 */
export function LoadingSplash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-secondary px-6">
      <Mark size={56} className="shadow-sm" />
      <SkeletonLines count={3} className="w-full max-w-xs" />
      <p className="text-sm text-quaternary">
        Loading your org…
      </p>
    </div>
  );
}

/**
 * The load failed for a reason that isn't "signed out" — almost always the
 * network. Retrying is already happening on a backoff; this is the manual
 * escape hatch and the explanation.
 */
export function LoadErrorScreen() {
  const loadError = useStore((s) => s.loadError);
  const retryBootstrap = useStore((s) => s.retryBootstrap);
  const [retrying, setRetrying] = useState(false);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-secondary px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
        <AlertCircle className="size-6 text-amber-600 dark:text-amber-400" />
      </span>
      <div className="space-y-1">
        <h1 className="text-base font-semibold">We couldn't load your org</h1>
        <p className="max-w-xs text-sm text-quaternary">
          {loadError ?? "Check your connection and try again."} You're still
          signed in — nothing was lost.
        </p>
      </div>
      <Button
        size="md"
        isLoading={retrying}
        onClick={async () => {
          setRetrying(true);
          try {
            await retryBootstrap();
          } finally {
            setRetrying(false);
          }
        }}
      >
        Try again
      </Button>
    </div>
  );
}
