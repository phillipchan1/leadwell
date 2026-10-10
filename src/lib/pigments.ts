import type { Capacity, Domain } from "../types";

/**
 * Identity pigments — the colors that say *which*, never *how it's going*.
 *
 * Life areas and capacities used to be picked from Tailwind's 500 row, which
 * is as loud as the health and readiness colors and so competed with them on
 * every card. These are mid-tone and slightly muted: readable as a 9px square
 * on paper or on leather, and never mistakable for a state.
 */
export const LIFE_AREA_SWATCHES = [
  "#4F76A8", // steel — the day job
  "#924666", // wine — church
  "#A87AA3", // heather — family
  "#748A4C", // olive — community
  "#B58A45", // ochre
  "#3E7F86", // deep teal
  "#B0644A", // clay
  "#5E62A8", // indigo
] as const;

/** The old Tailwind defaults, mapped to the pigment that replaced each one. */
const LEGACY_LIFE_AREA: Record<string, string> = {
  "#3b82f6": "#4F76A8",
  "#8b5cf6": "#924666",
  "#ec4899": "#A87AA3",
  "#14b8a6": "#748A4C",
  "#f59e0b": "#B58A45",
  "#0d9488": "#3E7F86",
  "#ef4444": "#B0644A",
  "#6366f1": "#5E62A8",
};

const LEGACY_CAPACITY: Record<string, string> = {
  "#0d9488": "#3E7F86",
  "#8b5cf6": "#816FA3",
  "#f59e0b": "#B58A45",
  "#3b82f6": "#4F76A8",
};

/**
 * Move a document's life areas and capacities off the retired defaults.
 *
 * Only exact matches move: a color someone picked by hand stays theirs.
 * Returns the same arrays when nothing matched, so an already-migrated
 * document costs nothing and syncs nothing.
 */
export function migratePigments(
  domains: Domain[],
  capacities: Capacity[]
): { domains: Domain[]; capacities: Capacity[] } {
  const remap = <T extends { color: string }>(
    rows: T[],
    table: Record<string, string>
  ): T[] => {
    let changed = false;
    const next = rows.map((r) => {
      const to = table[r.color?.toLowerCase()];
      if (!to) return r;
      changed = true;
      return { ...r, color: to };
    });
    return changed ? next : rows;
  };
  return {
    domains: remap(domains, LEGACY_LIFE_AREA),
    capacities: remap(capacities, LEGACY_CAPACITY),
  };
}

/**
 * Avatar tints. Initials sit on one of six quiet grounds, chosen by a stable
 * hash of the name so a person keeps their color everywhere.
 */
export const AVATAR_TINTS = 6;

export function avatarTint(name: string): number {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return (Math.abs(hash) % AVATAR_TINTS) + 1;
}

/** Tailwind classes for tint `n` — spelled out so the compiler can see them. */
const AVATAR_CLASS: Record<number, string> = {
  1: "bg-av1 text-av1-ink",
  2: "bg-av2 text-av2-ink",
  3: "bg-av3 text-av3-ink",
  4: "bg-av4 text-av4-ink",
  5: "bg-av5 text-av5-ink",
  6: "bg-av6 text-av6-ink",
};

export function avatarClass(name: string): string {
  return AVATAR_CLASS[avatarTint(name)];
}
