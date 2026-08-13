/**
 * The one place that decides what a keystroke means.
 *
 * Every shortcut in the app is written as a chord string — `"mod+k"`, `"alt+ArrowUp"`,
 * `"?"` — and matched here. Two rules keep the whole thing predictable:
 *
 *   1. `mod` is ⌘ on Apple hardware and Ctrl everywhere else. Nothing else in
 *      the app is allowed to branch on platform; it asks here instead.
 *   2. A bare printable key (no modifier) never fires while the caret is in a
 *      text field. That guard lives in `isTypingTarget`, not in each handler,
 *      because the moment it's each handler's job one of them forgets and `c`
 *      opens a dialog in the middle of a sentence.
 *
 * Chords are compared against `event.key` for printable keys and named keys
 * (`Escape`, `ArrowUp`, `Enter`), and against `event.code` for digits — Shift+1
 * reports `"!"` on a US layout and something else again on every other one.
 */

export type Chord = string;

const APPLE = /Mac|iPhone|iPad|iPod/.test(
  typeof navigator === "undefined" ? "" : navigator.platform || navigator.userAgent
);

/** ⌘ on Apple hardware, Ctrl everywhere else. */
export const MOD_LABEL = APPLE ? "⌘" : "Ctrl";
const ALT_LABEL = APPLE ? "⌥" : "Alt";
const SHIFT_LABEL = APPLE ? "⇧" : "Shift";

const KEY_LABEL: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  enter: "↵",
  escape: "Esc",
  backspace: "⌫",
  delete: "Del",
  " ": "Space",
};

/**
 * A chord as a human reads it: `"mod+k"` → `"⌘K"`. Used by tooltips, the
 * shortcuts panel and the palette, so a shortcut is written once and rendered
 * the same everywhere.
 */
export function formatChord(chord: Chord): string {
  return chord
    .split("+")
    .map((part) => {
      const p = part.toLowerCase();
      if (p === "mod") return MOD_LABEL;
      if (p === "alt") return ALT_LABEL;
      if (p === "shift") return SHIFT_LABEL;
      return KEY_LABEL[p] ?? (part.length === 1 ? part.toUpperCase() : part);
    })
    .join(APPLE ? "" : "+");
}

/** The number row, addressed physically. See `matchChord`. */
export const DIGIT_CHORDS = Array.from({ length: 9 }, (_, i) => `Digit${i + 1}`);
export const SHIFT_DIGIT_CHORDS = DIGIT_CHORDS.map((d) => `shift+${d}`);

/** Renders a key sequence like `["g", "t"]` as `G then T`. */
export function formatSequence(keys: string[]): string {
  return keys.map((k) => k.toUpperCase()).join(" then ");
}

type Parsed = {
  mod: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
};

const cache = new Map<Chord, Parsed>();

function parse(chord: Chord): Parsed {
  const hit = cache.get(chord);
  if (hit) return hit;
  const parts = chord.split("+");
  const key = parts[parts.length - 1];
  const parsed: Parsed = {
    mod: parts.includes("mod"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    // `?` is Shift+/ on most layouts; the chord names the character, so the
    // shift state is whatever it takes to produce it.
    key: key.length === 1 ? key.toLowerCase() : key,
  };
  cache.set(chord, parsed);
  return parsed;
}

export function matchChord(e: KeyboardEvent, chord: Chord): boolean {
  const spec = parse(chord);
  const mod = APPLE ? e.metaKey : e.ctrlKey;
  // The non-mod key of the pair must be clear, or Ctrl+K on a Mac would fire
  // a ⌘K binding.
  const otherMod = APPLE ? e.ctrlKey : e.metaKey;
  if (otherMod) return false;
  if (spec.mod !== mod) return false;
  if (spec.alt !== e.altKey) return false;

  // Digits are matched on `e.code`. Shift+1 reports `"!"` on a US layout, `"1"`
  // on a French one and something else again elsewhere — the *physical* key is
  // the only stable thing about a number row.
  const key = spec.key.startsWith("Digit")
    ? e.code
    : e.key.length === 1
      ? e.key.toLowerCase()
      : e.key;
  if (key !== spec.key) return false;

  // Shift is only checked for named keys. For a printable one the character
  // already encodes it — `?` arrives as `?` with shiftKey set, and demanding
  // `shift: false` would never match.
  if (spec.key.length > 1 && spec.shift !== e.shiftKey) return false;
  return true;
}

/**
 * Is the keystroke landing in something the user is typing into?
 *
 * Deliberately broad: a `contenteditable` (the Tiptap editors), a native
 * field, and anything inside an element that has claimed the keyboard for
 * itself via `data-keyboard-owner` — the resize handle and the roving
 * toolbars use it so their arrow keys don't also page the app sideways.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable='true']"));
}

/** True when the element (or an ancestor) handles its own arrow/Enter keys. */
export function ownsKeyboard(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("[data-keyboard-owner]"));
}

/**
 * Marks a subtree as handling its own arrow keys, so the global sibling pager
 * and any other arrow binding stays out of its way. Spread onto the element
 * that owns the keys.
 */
export const keyboardOwner = { "data-keyboard-owner": "true" } as const;
