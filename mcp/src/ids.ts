/** Same 8-char id the Zustand store generates. */
export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
