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
 * The meetings mode is always "Meetings". Who it's with lives on the subject;
 * the gathering itself is the same room whether you lead them, report to them,
 * or sit on their team.
 *
 * ── Why meetings is one mode and not two ─────────────────────────────────
 * "Topics" and session history were separate tabs, which split one activity
 * across two places. They're the same mode.
 *
 * ── Why two kinds carry fewer than five ──────────────────────────────────
 * `meeting` and `me` used to sit outside this contract entirely — a meeting
 * invented Plan / History / Settings, and `me` had no tabs at all — which meant
 * three sub-navigation vocabularies across five entity kinds.
 *
 * They're on the contract now, but not by padding them out. A mode is omitted
 * only where it would be an empty room:
 *
 *   meeting  omits `now` and `prayer`. Readiness for a meeting is *the meeting*,
 *            so Plan already is its Now; and a meeting has no posture to hold
 *            toward it — the people in it do, on their own panels.
 *   me       is `profile` alone. There are no meetings with yourself, no record
 *            about yourself distinct from your own profile, and no sibling
 *            pager. A single-tab strip is a worse answer than no strip.
 *
 * What the contract actually guarantees is that a mode *id* means the same
 * thing everywhere — `?s=notes` is always "the record", `?s=profile` is always
 * "the slow-moving stuff" — and that shared modes keep their order. That still
 * holds for all five kinds. Profile is the one label that still bends
 * (Leading up vs Profile); meetings do not.
 */

export type EntityMode = "now" | "meetings" | "profile" | "notes" | "prayer";

export type ModeSubject =
  | "person"
  | "leadUpPerson"
  | "team"
  | "manager"
  | "meeting"
  | "me";

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
  // Pre-contract meeting tabs.
  plan: "meetings",
  settings: "profile",
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

/**
 * Modes a kind genuinely has no content for. Not a shortcut — see the note at
 * the top of this file before adding to it.
 */
const OMITS: Partial<Record<ModeSubject, EntityMode[]>> = {
  meeting: ["now", "prayer"],
  me: ["now", "meetings", "notes", "prayer"],
};

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
    meetings: "Meetings",
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
    meetings: "Meetings",
    profile: "Leading up",
    notes: "Notes",
    prayer: "Prayer",
  },
  meeting: {
    now: "Now",
    // The board of what to raise, in the occurrences ahead.
    meetings: "Plan",
    // Subject, rhythm, role — what this meeting *is*.
    profile: "Settings",
    /* "Write-ups", not "Notes". On a person, Notes is my running record about
       them; here it is the record of what happened in one occurrence. Same word
       was doing two jobs, and this is the one that already had another name —
       the readiness checklist and PrepPanel both call it a write-up. */
    notes: "Write-ups",
    prayer: "Prayer",
  },
  me: {
    now: "Now",
    meetings: "Meetings",
    profile: "Profile",
    notes: "Notes",
    prayer: "Prayer",
  },
};

export type ModeTab = {
  id: EntityMode;
  label: string;
};

/** The modes one kind actually has, in the shared order. */
export function modesFor(subject: ModeSubject): EntityMode[] {
  const omitted = OMITS[subject];
  return omitted ? MODE_ORDER.filter((m) => !omitted.includes(m)) : MODE_ORDER;
}

/** The tab strip for one entity, in the shared order. */
export function modeTabs(subject: ModeSubject): ModeTab[] {
  const labels = LABELS[subject];
  return modesFor(subject).map((id) => ({ id, label: labels[id] }));
}

/**
 * The mode a URL section names, clamped to what this kind has. A link to
 * `?s=prayer` on a meeting lands on that meeting's first mode rather than a
 * blank panel.
 */
export function entityModeFor(
  subject: ModeSubject,
  section: string | null | undefined
): EntityMode {
  const available = modesFor(subject);
  const mode = entityMode(section);
  return available.includes(mode) ? mode : available[0];
}
