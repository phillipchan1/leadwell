/**
 * Readable addresses for meetings — `/m/staff-meeting` instead of `/m/9f3c…`.
 *
 * ── Why derived, not stored ───────────────────────────────────────────────
 * A meeting's agenda is the page you bookmark, so the address has to be
 * something you'd recognise in a bookmarks bar. Storing a slug would mean a
 * migration and a uniqueness rule in the database; deriving one from the name
 * needs neither, and the id still resolves, so nothing that already links by id
 * breaks. The cost is that renaming a meeting changes its address — an old
 * bookmark then falls back to the Meetings list like any stale link.
 *
 * ── Why collisions are settled in array order ─────────────────────────────
 * Two teams can both have a "Staff meeting". The first one keeps the plain
 * slug and the second is qualified by who it's with. Array order is creation
 * order, so a meeting's address doesn't change when a newer one is added.
 */
import type { Manager, Person, Team, TrackedMeeting } from "../types";
import { meetingSubjectName } from "./readiness";

export type SlugSource = {
  meetings: TrackedMeeting[];
  people: Pick<Person, "id" | "name">[];
  teams: Pick<Team, "id" | "name">[];
  managers: Pick<Manager, "id" | "name">[];
};

export type SlugIndex = {
  slugById: Map<string, string>;
  idBySlug: Map<string, string>;
};

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildIndex(src: SlugSource): SlugIndex {
  const slugById = new Map<string, string>();
  const idBySlug = new Map<string, string>();
  const ids = new Set(src.meetings.map((m) => m.id));

  for (const meeting of src.meetings) {
    const subject = meetingSubjectName(meeting, src) ?? "";
    // An unnamed 1:1 is addressed by who it's with: /m/sarah-kim.
    const base = slugify(meeting.name?.trim() || subject);
    if (!base) continue;

    const candidates = [base];
    const qualifier = slugify(subject);
    if (qualifier && qualifier !== base) candidates.push(`${base}-${qualifier}`);
    let slug = candidates.find((c) => !idBySlug.has(c) && !ids.has(c));
    for (let n = 2; !slug; n++) {
      const next = `${base}-${n}`;
      if (!idBySlug.has(next) && !ids.has(next)) slug = next;
    }

    slugById.set(meeting.id, slug);
    idBySlug.set(slug, meeting.id);
  }
  return { slugById, idBySlug };
}

let memo: { src: SlugSource; index: SlugIndex } | null = null;

/** Cached on the identity of the four collections — they're immutable in the store. */
export function meetingSlugs(src: SlugSource): SlugIndex {
  if (
    memo &&
    memo.src.meetings === src.meetings &&
    memo.src.people === src.people &&
    memo.src.teams === src.teams &&
    memo.src.managers === src.managers
  ) {
    return memo.index;
  }
  const index = buildIndex(src);
  memo = {
    src: {
      meetings: src.meetings,
      people: src.people,
      teams: src.teams,
      managers: src.managers,
    },
    index,
  };
  return index;
}

/**
 * The meeting a URL key names — an id or a slug. Ids win, so a link written
 * before slugs existed means exactly what it always meant.
 */
export function resolveMeetingKey(src: SlugSource, key: string): string {
  if (src.meetings.some((m) => m.id === key)) return key;
  return meetingSlugs(src).idBySlug.get(key) ?? key;
}

export function findMeeting(
  src: SlugSource,
  key: string | null | undefined
): TrackedMeeting | undefined {
  if (!key) return undefined;
  const id = resolveMeetingKey(src, key);
  return src.meetings.find((m) => m.id === id);
}
