import type { WheelEvent as ReactWheelEvent } from "react";

/**
 * Vertical wheel over a horizontal strip (the plan board, Ideas columns) does
 * not always reach the pane scroller behind it. Walk up to the first ancestor
 * that can scroll vertically and apply the delta there.
 */
export function chainVerticalWheel(e: ReactWheelEvent<HTMLElement>) {
  const { deltaY, deltaX } = e;
  if (deltaY === 0 || Math.abs(deltaY) <= Math.abs(deltaX)) return;

  let node: HTMLElement | null = e.currentTarget.parentElement;
  while (node) {
    const oy = getComputedStyle(node).overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      const before = node.scrollTop;
      node.scrollTop += deltaY;
      if (node.scrollTop !== before) e.preventDefault();
      return;
    }
    node = node.parentElement;
  }
}
