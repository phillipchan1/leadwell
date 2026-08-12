/**
 * Tree modes — what I came to the chart to do.
 *
 * The canvas used to carry eight independent layer toggles, all of them
 * offered at once regardless of the question being asked. But nobody opens the
 * org tree wanting "mandate and health and readiness"; they open it *in a
 * mode* — planning, prepping for a 1:1, assessing how things are going, or
 * praying. Each of those wants a different card and a different scan bar, and
 * the other five toggles are noise in front of it.
 *
 * So mode is the only card control there is. What each team card shows, which
 * scan bar sits under the chips, and what dims — all of it follows from here.
 * The domain filter stays orthogonal and composes: mode is *what I'm doing*,
 * domain is *where*.
 */
import type { SortKey } from "./orgTable";

export type TreeMode = "plan" | "prep" | "assess" | "pray";

/** What a card can surface. Internal now — derived from mode, never toggled. */
export type TreeLayer =
  | "people"
  | "mandate"
  | "action"
  | "readiness"
  | "health"
  | "prayer";
export type TreeLayers = Record<TreeLayer, boolean>;

export const TREE_MODES: {
  id: TreeMode;
  label: string;
  /** The one question this mode answers — the chip's tooltip. */
  question: string;
  /** Digit key, unshifted. Shift+digit belongs to the domain filter. */
  key: string;
}[] = [
  {
    id: "plan",
    label: "Plan",
    question: "What is each team for, and what's next?",
    key: "1",
  },
  {
    id: "prep",
    label: "Prep",
    question: "Am I ready for the next 1:1?",
    key: "2",
  },
  {
    id: "assess",
    label: "Assess",
    question: "Is this going well?",
    key: "3",
  },
  {
    id: "pray",
    label: "Pray",
    question: "Who am I carrying?",
    key: "4",
  },
];

/**
 * The layer set each mode stamps on the cards.
 *
 * A module constant on purpose: `MODE_LAYERS[mode]` is a stable reference, so
 * reading layers out of the store costs nothing in re-renders.
 *
 * Only Plan leaves `people` off — mandate and next step are team-level answers,
 * and a roster under them would bury the two lines that matter. The other three
 * are per-person signals, so they need the names.
 */
export const MODE_LAYERS: Record<TreeMode, TreeLayers> = {
  plan: {
    people: false,
    mandate: true,
    action: true,
    readiness: false,
    health: false,
    prayer: false,
  },
  prep: {
    people: true,
    mandate: false,
    action: true,
    readiness: true,
    health: false,
    prayer: false,
  },
  assess: {
    people: true,
    mandate: false,
    action: false,
    readiness: false,
    health: true,
    prayer: false,
  },
  pray: {
    people: true,
    mandate: false,
    action: false,
    readiness: false,
    health: false,
    prayer: true,
  },
};

/**
 * Which scan the canvas applies in each mode, if any.
 *
 * The scans themselves stay shared with the table — they follow you between
 * the two surfaces — but a mode that couldn't explain why something dimmed has
 * no business dimming it. Plan and Prep own no scan, so nothing dims there;
 * composing health *and* prayer at once is still the table's job.
 */
export const MODE_SCAN: Record<TreeMode, "health" | "prayer" | null> = {
  plan: null,
  prep: null,
  assess: "health",
  pray: "prayer",
};

/**
 * Columns the sub-lg outline shows per mode. The canvas can't be read on a
 * phone, so the outline answers the same question there — which means it has
 * to answer the *mode's* question, not a fixed default set.
 */
export const MODE_COLUMNS: Record<TreeMode, Exclude<SortKey, "name">[]> = {
  plan: ["type", "under", "domain", "next", "size"],
  prep: ["type", "under", "ready", "next"],
  assess: ["type", "under", "health", "note", "domain"],
  pray: ["type", "under", "prayer", "note"],
};
