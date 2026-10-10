/**
 * The URL is the source of truth for what's selected.
 *
 * One entity renders on two surfaces: a **peek** panel beside a tab, and a
 * full-page **focus** route. Promotion between them is just a route change,
 * which is what makes every entity deep-linkable and back-button-safe.
 *
 *   /                            Today — what needs me, the front door
 *   /tree                        canvas, nothing open
 *   /tree?team=t1                team peek beside the canvas
 *   /tree?person=p3&s=sessions   person peek, 1:1s section
 *   /team/t1                     team in focus
 *   /person/p3/sessions          person in focus, 1:1s section
 *   /person/p3/sessions/s42      full-screen editor for session s42
 *   /meetings                    every recurring meeting
 *   /prayer                      who I'm carrying
 *   /m/staff-meeting             one meeting's agenda for its next occurrence
 *   /m/staff-meeting/plan        the same meeting, planned weeks ahead
 *   /me                          my own profile in focus
 *
 * A meeting is an entity kind rather than a page of its own, so it inherits
 * peek, focus, the breadcrumb, the sibling pager and swipe paging without a
 * second implementation of any of them.
 */

/**
 * One id per surface. The five places in the sidebar map onto these; People
 * owns three of them (`circles`, `tree` and `table`, the list), because a view
 * of the same place is still its own URL.
 */
export type Tab =
  | "today"
  | "circles"
  | "tree"
  | "table"
  | "ideas"
  | "meetings"
  | "prayer";
export type EntityKind = "team" | "person" | "manager" | "meeting" | "me";

export type Selection = {
  kind: EntityKind;
  /** Empty for the singleton "me" entity, which needs no id. */
  id: string;
  /** Sub-page within the entity — a person's tab, a team's section. */
  section?: string;
  /** When set, the full-screen session editor is open for this session. */
  sessionId?: string;
};

export type Route =
  | { view: "tab"; tab: Tab; peek: Selection | null }
  | { view: "focus"; target: Selection };

const TABS: Tab[] = ["today", "circles", "tree", "table", "ideas", "meetings", "prayer"];

/**
 * `/people` was a fifth destination rendering a strict subset of `/table` —
 * every column it had, the table already had — so it spent 20% of the primary
 * nav on a filter. On a phone it was worse: the tree tab renders `TableView`
 * too, so three of five bottom-nav items landed on the same component.
 *
 * It survives as a saved filter. Old links keep working; `App` rewrites them.
 */
export const LEGACY_PEOPLE_PATH = "/people";
export const PEOPLE_FILTER_PATH = "/table?type=person";
export const LEGACY_OVERVIEW_PATH = "/overview";
/** Entities addressed as /<kind>/<id>. "me" is a bare /me. */
const ID_KINDS: EntityKind[] = ["team", "person", "manager", "meeting"];

/**
 * Today — what needs me. Nobody opens the app wanting the shape of the org;
 * they open it asking who needs them this week. `/` and unknown tab paths
 * land here — including `/home`, the teams page that Today absorbed.
 */
export const DEFAULT_TAB: Tab = "today";
/**
 * Meetings are addressed by a readable slug (`/m/staff-meeting`) because the
 * agenda is the page people bookmark. `routes.ts` is pure and knows nothing
 * about the data, so the store installs the id → slug lookup at startup; until
 * it does, or for a meeting with no usable name, the id stands in.
 */
let meetingSlugOf: (id: string) => string | undefined = () => undefined;

export function setMeetingSlugResolver(fn: (id: string) => string | undefined) {
  meetingSlugOf = fn;
}

/** Short prefix for the readable meeting address. `/meeting/:id` still parses. */
const MEETING_PREFIX = "m";

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab);
}

/**
 * A person outranks their team: selecting someone keeps their team selected
 * for canvas highlighting, but the panel shows the person.
 */
function parsePeek(params: URLSearchParams): Selection | null {
  const section = params.get("s") ?? undefined;
  const sessionId = params.get("session") ?? undefined;
  for (const kind of ID_KINDS) {
    const id = params.get(kind);
    if (id) return { kind, id, section, sessionId };
  }
  if (params.get("me")) return { kind: "me", id: "", section, sessionId };
  return null;
}

export function parseRoute(pathname: string, search: string): Route {
  const [head, ...rest] = pathname.split("/").filter(Boolean);

  if (head === "me") {
    return { view: "focus", target: { kind: "me", id: "", section: rest[0] } };
  }
  // The id may be a slug here. The store resolves it against the data, which
  // a pure parser can't see — and which may not have loaded yet on a cold link.
  if (head === MEETING_PREFIX && rest[0]) {
    return {
      view: "focus",
      target: {
        kind: "meeting",
        id: decodeURIComponent(rest[0]),
        section: rest[1],
        sessionId: rest[2] ? decodeURIComponent(rest[2]) : undefined,
      },
    };
  }
  if (ID_KINDS.includes(head as EntityKind) && rest[0]) {
    return {
      view: "focus",
      target: {
        kind: head as EntityKind,
        id: decodeURIComponent(rest[0]),
        section: rest[1],
        sessionId: rest[2] ? decodeURIComponent(rest[2]) : undefined,
      },
    };
  }

  return {
    view: "tab",
    tab: isTab(head) ? head : DEFAULT_TAB,
    peek: parsePeek(new URLSearchParams(search)),
  };
}

export function routePath(route: Route): string {
  if (route.view === "focus") {
    const { kind, id, section, sessionId } = route.target;
    const base =
      kind === "me"
        ? "/me"
        : kind === "meeting"
          ? `/${MEETING_PREFIX}/${encodeURIComponent(meetingSlugOf(id) ?? id)}`
          : `/${kind}/${encodeURIComponent(id)}`;
    if (!section) return base;
    const withSection = `${base}/${section}`;
    return sessionId
      ? `${withSection}/${encodeURIComponent(sessionId)}`
      : withSection;
  }

  const params = new URLSearchParams();
  const peek = route.peek;
  if (peek) {
    if (peek.kind === "me") params.set("me", "1");
    else params.set(peek.kind, peek.id);
    if (peek.section) params.set("s", peek.section);
    if (peek.sessionId) params.set("session", peek.sessionId);
  }
  const query = params.toString();
  // Home is the root, so the address you'd type is the address you get.
  const path = route.tab === DEFAULT_TAB ? "/" : `/${route.tab}`;
  return `${path}${query ? `?${query}` : ""}`;
}

export function sameSelection(
  a: Selection | null,
  b: Selection | null
): boolean {
  if (!a || !b) return a === b;
  return (
    a.kind === b.kind &&
    a.id === b.id &&
    a.section === b.section &&
    a.sessionId === b.sessionId
  );
}
