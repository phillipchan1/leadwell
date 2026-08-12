import { useEffect } from "react";

/**
 * Keeps the field you're typing in above the on-screen keyboard.
 *
 * Android is handled declaratively — `interactive-widget=resizes-content` in
 * the viewport meta makes the keyboard shrink the layout, so the app's panes
 * re-fit on their own. iOS Safari doesn't: the layout viewport keeps its full
 * height and the keyboard is drawn over the top of it. In a document that
 * scrolls, Safari compensates by scrolling the page. This app has no document
 * scroll — every surface is an inner pane of a `100dvh` shell — so a field in
 * the lower half of a pane sits under the keyboard, and if it's the last thing
 * in that pane there is nothing left to scroll to lift it clear.
 *
 * So: measure the keyboard from `visualViewport`, pad the bottom of the pane
 * that holds the focused field by exactly that much (which is what gives the
 * pane somewhere to scroll to), then bring the field into view. The padding is
 * removed the moment the keyboard goes away.
 *
 * Exposed as `--kb-inset` on the root element as well, for anything that wants
 * to react to the keyboard in CSS.
 */
const TEXTUAL = "input, textarea, [contenteditable='true']";

/** Breathing room kept between the field and the top of the keyboard. */
const MARGIN = 12;

/**
 * Below this, a visual-viewport change is one of iOS's own toolbars rather than
 * the keyboard.
 */
const KEYBOARD_MIN = 80;

/** The nearest ancestor that actually scrolls vertically. */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    /** The pane we padded, so the padding can be handed back. */
    let padded: HTMLElement | null = null;
    let raf = 0;

    const release = () => {
      if (!padded) return;
      padded.style.paddingBottom = padded.dataset.kbPrevPad ?? "";
      delete padded.dataset.kbPrevPad;
      padded = null;
    };

    /** Height the keyboard is covering, in layout pixels. */
    const insetOf = () =>
      Math.max(0, window.innerHeight - vv.height - vv.offsetTop);

    const sync = () => {
      const inset = insetOf();
      document.documentElement.style.setProperty("--kb-inset", `${inset}px`);

      // Treat anything under a couple of rows as "no keyboard" — iOS reports
      // small visual-viewport changes for its own toolbars.
      if (inset < KEYBOARD_MIN) {
        release();
        return;
      }

      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.matches?.(TEXTUAL)) return;

      const scroller = scrollerOf(el);
      if (scroller && scroller !== padded) {
        release();
        padded = scroller;
        padded.dataset.kbPrevPad = scroller.style.paddingBottom;
      }
      if (padded) padded.style.paddingBottom = `${inset}px`;
    };

    /** Lift the focused field clear of the keyboard, once things have settled. */
    const reveal = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sync();
        if (insetOf() < KEYBOARD_MIN) return;
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.matches?.(TEXTUAL)) return;

        const box = el.getBoundingClientRect();
        const top = vv.offsetTop + MARGIN;
        const bottom = vv.offsetTop + vv.height - MARGIN;

        // Only move if it's actually clipped — an unprompted scroll while
        // someone is mid-sentence is worse than a field that's already visible.
        let delta =
          box.bottom > bottom
            ? box.bottom - bottom
            : box.top < top
              ? box.top - top
              : 0;
        if (delta === 0) return;

        // `scrollIntoView` is no use here: it positions against the *layout*
        // viewport, which on iOS is exactly the thing the keyboard doesn't
        // shrink — it would happily centre the field behind the keyboard. So
        // move the panes by hand, spending the shortfall on the innermost
        // scroller first and passing whatever it can't absorb outward.
        let node: HTMLElement | null = el.parentElement;
        while (node && Math.abs(delta) > 1) {
          const overflowY = getComputedStyle(node).overflowY;
          if (overflowY === "auto" || overflowY === "scroll") {
            const room =
              delta > 0
                ? Math.min(delta, node.scrollHeight - node.clientHeight - node.scrollTop)
                : Math.max(delta, -node.scrollTop);
            if (Math.abs(room) > 1) {
              node.scrollBy({ top: room, behavior: "smooth" });
              delta -= room;
            }
          }
          node = node.parentElement;
        }
      });
    };

    // The keyboard opening is a visualViewport resize; focus can also move
    // between fields while it's already up.
    vv.addEventListener("resize", reveal);
    vv.addEventListener("scroll", sync);
    document.addEventListener("focusin", reveal);

    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", reveal);
      vv.removeEventListener("scroll", sync);
      document.removeEventListener("focusin", reveal);
      release();
      document.documentElement.style.removeProperty("--kb-inset");
    };
  }, []);
}
