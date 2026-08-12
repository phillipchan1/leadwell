/**
 * A single polite live region for the whole app.
 *
 * Moving a row, deleting one, undoing that delete — these change the page in a
 * way that is obvious to a sighted mouse user and invisible to everyone else.
 * `announce()` is how a component says what just happened without owning a
 * live region of its own; scattering `aria-live` across the tree means several
 * regions racing to speak over each other.
 *
 * The text is cleared shortly after so that repeating the *same* message —
 * pressing ⌥↓ twice to move a row down two places — is announced twice rather
 * than swallowed as an unchanged value.
 */

type Listener = (message: string) => void;

let listener: Listener | null = null;
let clearTimer: number | undefined;

export function setAnnouncer(fn: Listener | null): void {
  listener = fn;
}

export function announce(message: string): void {
  if (!listener) return;
  // An empty beat first, so an identical repeat still registers as a change.
  listener("");
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => listener?.(message), 50);
}

/** "3rd of 7" — how a moved row says where it landed. */
export function positionLabel(index: number, total: number): string {
  return `position ${index + 1} of ${total}`;
}
