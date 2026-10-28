import { useEffect, useRef, type RefObject } from "react";

/*
 * The one entrance the app uses: rise a few pixels and fade in. Driven by
 * WAAPI rather than a keyed remount, so a screen keeps its state (scroll,
 * drafts, drag) and only the pixels move. The old view never animates out —
 * nothing waits on a transition to finish.
 */
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function rise(el: Element | null | undefined, { distance = 6, duration = 260, delay = 0 } = {}) {
  if (!el || reduced() || !("animate" in el)) return;
  el.animate(
    [
      { opacity: 0, transform: `translateY(${distance}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration, delay, easing: EASE, fill: "backwards" }
  );
}

/**
 * Rise `ref`'s element — or the first match of `selector` inside it — each
 * time `key` changes. The first render counts, so a screen arrives the same
 * way whether you navigated to it or loaded it.
 */
export function useEnterMotion<T extends Element>(
  key: unknown,
  { selector, ...opts }: { selector?: string; distance?: number; duration?: number } = {}
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const root = ref.current;
    rise(selector ? root?.querySelector(selector) : root, opts);
    // `opts` is a fresh literal each render; only `key` should replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ref;
}
