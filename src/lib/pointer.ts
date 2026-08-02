/**
 * Whether the primary input is a finger, read synchronously.
 *
 * For one-shot decisions at mount — chiefly `autoFocus`, which on a phone
 * raises the keyboard before the user has read the form and shrinks the visual
 * viewport enough to push the dialog's own action bar off screen. Anything that
 * has to react to a change should use the `useCoarsePointer` hook, and anything
 * purely visual should use the `touch:` Tailwind variant.
 */
export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** `autoFocus` that stands down on touch. */
export const autoFocusUnlessTouch = () => !isCoarsePointer();
