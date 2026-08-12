/**
 * The five modes every entity shares.
 *
 * Person, team and manager panels used to each invent their own shape: a
 * person had five tabs whose first one was a dumping ground (health, prep,
 * assessments, goals and the AI coach in one scroll), a manager had a
 * different five, and a team had none at all — eleven sections stacked in a
 * single column. Same job, three layouts, nothing transferable.
 *
 * These are the five things a leader actually does with someone, in the order
 * they do them:
 *
 *   now       Where do we stand and what do I owe them — the cockpit.
 *   meetings  The recurring meeting: what to raise, and what we said.
 *   profile   Who or what this is — the slow-moving stuff.
 *   notes     My running record.
 *   prayer    My posture toward them. Not a metric, so not mixed in.
 *
 * The nouns change by entity ("Meetings" vs "Check-ins") because that's how
 * the thing is actually spoken about, but the position and the meaning never do.
 *
 * ── Why meetings is one mode and not two ─────────────────────────────────
 * "Topics" and session history were separate tabs, which split one activity
 * across two places. They're the same mode.
 */

export type EntityMode = "now" | "meetings" | "profile" | "notes" | "prayer";

export type ModeSubject = "person" | "leadUpPerson" | "team" | "manager";

const MODE_ORDER: EntityMode[] = ["now", "meetings", "profile", "notes", "prayer"];

/**
 * A mode is a URL sub-page (`?s=meetings`), so the labels can't be the source
 * of truth for the id. Older links used the pre-merge section names; they still
 * have to land somewhere sensible.
 */
const ALIASES: Record<string, EntityMode> = {
  // Pre-merge person/manager tabs.
  sessions: "meetings",
  topics: "meetings",
  "1:1s": "meetings",
  checkins: "meetings",
  manual: "profile",
  // Teams had section anchors rather than tabs.
  "next-steps": "now",
  people: "profile",
  mandate: "profile",
  readiness: "now",
};

/** Which mode a URL section names. Unknown or absent lands on Now. */
export function entityMode(section: string | null | undefined): EntityMode {
  if (!section) return "now";
  if (MODE_ORDER.includes(section as EntityMode)) return section as EntityMode;
  return ALIASES[section] ?? "now";
}

/** The section value for a mode. Now is the default, so it clears the param. */
export function modeSection(mode: EntityMode): string | null {
  return mode === "now" ? null : mode;
}

const LABELS: Record<ModeSubject, Record<EntityMode, string>> = {
  person: {
    now: "Now",
    meetings: "Meetings",
    profile: "Profile",
    notes: "Notes",
    prayer: "Prayer",
  },
  leadUpPerson: {
    now: "Now",
    meetings: "Check-ins",
    profile: "Leading up",
    notes: "Notes",
    prayer: "Prayer",
  },
  team: {
    now: "Now",
    meetings: "Meetings",
    profile: "Profile",
    notes: "Notes",
    prayer: "Prayer",
  },
  manager: {
    now: "Now",
    meetings: "Check-ins",
    profile: "Leading up",
    notes: "Notes",
    prayer: "Prayer",
  },
};

export type ModeTab = {
  id: EntityMode;
  label: string;
};

/** The tab strip for one entity, in the shared order. */
export function modeTabs(subject: ModeSubject): ModeTab[] {
  const labels = LABELS[subject];
  return MODE_ORDER.map((id) => ({ id, label: labels[id] }));
}
