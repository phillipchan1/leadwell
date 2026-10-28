import { parseRoute, routePath, type Route } from "./routes";

/**
 * Where an open entity came from, kept on its history entry.
 *
 * Back, X and Esc used to mean three different things because nothing
 * remembered where you were when you opened the thing: each control guessed
 * (the remembered tab, Today, the team above). The rule now is one sentence —
 * leaving returns to the page you opened it from.
 *
 * It lives in the router's per-entry state rather than the store, so the
 * browser's own Back and Forward stay correct: every entry carries its own
 * answer, and walking history can't desync a counter held somewhere else.
 */
export type Trail = {
  /**
   * The page with nothing open that the entity was opened from. Paging to a
   * sibling, following a breadcrumb or going full-page don't change it.
   */
  origin: string | null;
  /** History entries between this one and `origin`. */
  depth: number;
  /**
   * Set on a write-up opened by `openSession`: the page it was opened from,
   * exactly one entry back. Closing the editor pops to it.
   */
  opener: string | null;
};

export const NO_TRAIL: Trail = { origin: null, depth: 0, opener: null };

/** Where the router says we are. `state` is the entry's own state. */
export type Where = { pathname: string; search: string; state: unknown };

export function readTrail(state: unknown): Trail {
  const t = (state as { trail?: Partial<Trail> } | null | undefined)?.trail;
  if (!t || typeof t !== "object") return NO_TRAIL;
  return {
    origin: typeof t.origin === "string" ? t.origin : null,
    depth:
      typeof t.depth === "number" && Number.isInteger(t.depth) && t.depth > 0
        ? t.depth
        : 0,
    opener: typeof t.opener === "string" ? t.opener : null,
  };
}

export function splitPath(path: string): { pathname: string; search: string } {
  const [beforeHash = ""] = path.split("#");
  const q = beforeHash.indexOf("?");
  return q === -1
    ? { pathname: beforeHash, search: "" }
    : { pathname: beforeHash.slice(0, q), search: beforeHash.slice(q) };
}

function isOpen(route: Route): boolean {
  return route.view === "focus" || route.peek !== null;
}

function tabOf(path: string | null) {
  if (!path) return null;
  const { pathname, search } = splitPath(path);
  const route = parseRoute(pathname, search);
  return route.view === "tab" ? route.tab : null;
}

/**
 * The state for the entry a navigation to `to` creates, or null when `to` has
 * nothing open (a tab page keeps no trail — it is what trails point back at).
 *
 * `replace` navigations stay at the same depth: they don't add an entry.
 * `opener` marks a write-up, whose way back is the single entry behind it.
 */
export function nextTrail(
  here: Where,
  to: string,
  opts: { replace: boolean; opener?: boolean }
): Trail | null {
  const dest = splitPath(to);
  const route = parseRoute(dest.pathname, dest.search);
  if (!isOpen(route)) return null;

  const hereRoute = parseRoute(here.pathname, here.search);
  const herePath = here.pathname + here.search;
  const opener = opts.opener && !opts.replace ? herePath : null;

  // Opening from a page with nothing open: that page is where leaving returns.
  if (!isOpen(hereRoute)) {
    return { origin: herePath, depth: opts.replace ? 0 : 1, opener };
  }

  const cur = readTrail(here.state);

  // The entity moved to another tab with you (the People views, a "see all"
  // link). The page behind it is now that tab, and history can't get there.
  if (route.view === "tab") {
    const was = hereRoute.view === "tab" ? hereRoute.tab : tabOf(cur.origin);
    if (was !== route.tab) {
      return {
        origin: routePath({ view: "tab", tab: route.tab, peek: null }),
        depth: 0,
        opener,
      };
    }
  }

  return {
    origin: cur.origin,
    depth: cur.depth + (opts.replace ? 0 : 1),
    opener,
  };
}
