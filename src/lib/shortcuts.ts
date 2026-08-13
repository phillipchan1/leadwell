/**
 * The shortcut registry.
 *
 * Every binding in the app registers here rather than adding its own `keydown`
 * listener, which buys three things that ad-hoc listeners can't:
 *
 *   • **Discoverability for free.** The `?` panel and the ⌘K palette are
 *     rendered *from* this registry, so a shortcut cannot exist without being
 *     documented. Adding a binding adds its own help entry.
 *   • **One arbitration point.** Bindings are matched most-specific-first and
 *     the first match wins, so an overlay's Escape beats the page's Escape
 *     without either of them knowing the other exists.
 *   • **One input guard.** A bare printable key is suppressed while the caret
 *     is in a field, once, here — see `isTypingTarget`.
 *
 * @see keys.ts for the chord grammar.
 */

import {
  formatChord,
  isTypingTarget,
  matchChord,
  ownsKeyboard,
  type Chord,
} from "./keys";

export type ShortcutGroup =
  | "Global"
  | "Navigation"
  | "Org tree"
  | "Lists & rows"
  | "Writing";

export type Shortcut = {
  /** Stable id — also the palette's key. */
  id: string;
  /**
   * The chord, or several that mean the same thing — the tree's mode keys are
   * one binding across `1`–`4`, not four bindings that happen to agree.
   */
  chord: Chord | Chord[];
  /** Overrides the rendered keys when a list would read worse than a range. */
  keysLabel?: string;
  /** Imperative phrase: "Open the command palette". */
  label: string;
  group: ShortcutGroup;
  run: (e: KeyboardEvent) => void;
  /**
   * Fires while an overlay (modal, palette, sheet) is open. Off by default:
   * a dialog should not be able to trigger the page behind it.
   */
  overlay?: boolean;
  /** Fires even with the caret in a text field. Implied for `mod`/`alt` chords. */
  allowInInput?: boolean;
  /** Registered but kept out of the help panel and palette. */
  hidden?: boolean;
  /** Only offered in the palette when this returns true. */
  available?: () => boolean;
};

const registry = new Map<string, Shortcut>();
const listeners = new Set<() => void>();
/** Overlays currently on screen. Bare-page bindings stand down above zero. */
let overlayDepth = 0;

/**
 * `useSyncExternalStore` compares snapshots by identity, so the list has to be
 * the *same array* until the registry actually changes — rebuilding it per call
 * would re-render forever.
 */
let snapshot: Shortcut[] = [];

function emit() {
  snapshot = [...registry.values()].filter((s) => !s.hidden);
  for (const fn of listeners) fn();
}

export function subscribeShortcuts(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function registerShortcut(shortcut: Shortcut): () => void {
  registry.set(shortcut.id, shortcut);
  emit();
  return () => {
    // A remount can register the replacement before the old one unregisters;
    // only drop the entry if it's still the one we put there.
    if (registry.get(shortcut.id) === shortcut) {
      registry.delete(shortcut.id);
      emit();
    }
  };
}

export function listShortcuts(): Shortcut[] {
  return snapshot;
}

/** Push/pop while an overlay is mounted, so page bindings stand down. */
export function pushOverlay(): () => void {
  overlayDepth += 1;
  return () => {
    overlayDepth = Math.max(0, overlayDepth - 1);
  };
}

export function overlayOpen(): boolean {
  return overlayDepth > 0;
}

/**
 * A chord with a modifier is safe to fire mid-sentence (⌘K in a note is still
 * "open the palette"); a bare letter is not.
 */
export function chordsOf(s: Shortcut): Chord[] {
  return Array.isArray(s.chord) ? s.chord : [s.chord];
}

/** How a shortcut's keys are written in the help panel and the palette. */
export function keysOf(s: Shortcut): string {
  return s.keysLabel ?? formatChord(chordsOf(s)[0]);
}

function firesWhileTyping(s: Shortcut): boolean {
  if (s.allowInInput) return true;
  return chordsOf(s).every((c) => c.includes("mod+") || c.includes("alt+"));
}

/**
 * The single global handler, installed once by `<ShortcutHost />`.
 *
 * Overlay-scoped bindings are tried first so a dialog's Escape wins over the
 * page's, and later registrations win among equals — a nested overlay
 * registers after the one that opened it.
 */
export function dispatchKey(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;

  const typing = isTypingTarget(e.target);
  const inWidget = ownsKeyboard(e.target);
  const candidates = [...registry.values()].reverse();
  const ordered = overlayOpen()
    ? candidates.filter((s) => s.overlay)
    : candidates;

  for (const s of ordered) {
    if (typing && !firesWhileTyping(s)) continue;
    const chords = chordsOf(s);
    // A widget that runs its own arrow keys (roving toolbar, resize handle)
    // keeps them; modifier chords still pass through.
    if (inWidget && chords.every((c) => c.startsWith("Arrow"))) continue;
    if (!chords.some((c) => matchChord(e, c))) continue;
    if (s.available && !s.available()) continue;
    e.preventDefault();
    s.run(e);
    return;
  }
}
