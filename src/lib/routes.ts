/**
 * The URL is the source of truth for what's selected.
 *
 * One entity renders on two surfaces: a **peek** panel beside a tab, and a
 * full-page **focus** route. Promotion between them is just a route change,
 * which is what makes every entity deep-linkable and back-button-safe.
 *
 *   /tree                        canvas, nothing open
 *   /tree?team=t1                team peek beside the canvas
 *   /tree?person=p3&s=sessions   person peek, 1:1s section
 *   /team/t1                     team in focus
 *   /person/p3/sessions          person in focus, 1:1s section
 *   /person/p3/sessions/s42      full-screen editor for session s42
 *   /meetings                    every recurring meeting
 *   /meeting/m4/plan             the planner for one recurring meeting
 *   /me                          my own profile in focus
 *
 * A meeting is an entity kind rather than a page of its own, so it inherits
 * peek, focus, the breadcrumb, the sibling pager and swipe paging without a
 * second implementation of any of them.
 */

export type Tab = "tree" | "table" | "ideas" | "meetings";
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

const TABS: Tab[] = ["tree", "table", "ideas", "meetings"];

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

/** Org tree — the structural home screen. `/` and unknown tab paths land here. */
export const DEFAULT_TAB: Tab = "tree";

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
    const base = kind === "me" ? "/me" : `/${kind}/${encodeURIComponent(id)}`;
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
  return `/${route.tab}${query ? `?${query}` : ""}`;
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
