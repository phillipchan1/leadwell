import { NO_TRAIL, nextTrail, readTrail, splitPath, type Where } from "./navTrail";

/**
 * Run with `npx esbuild src/lib/navTrail.check.ts --bundle --platform=node
 * --format=esm --outfile=node_modules/.cache/navTrail.check.mjs && node
 * node_modules/.cache/navTrail.check.mjs`.
 *
 * Back, X and Esc all mean "return to the page this was opened from". These
 * walk a small history the way the router does (push, replace, pop) and check
 * that leaving lands on the page that opened the entity — whatever happened in
 * between: paging, going full-page, opening a write-up.
 */

const fails: string[] = [];
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) fails.push(msg);
}
const is = (got: unknown, want: unknown, msg: string) =>
  ok(
    JSON.stringify(got) === JSON.stringify(want),
    `${msg} — got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`,
  );

type Entry = { path: string; state: unknown };

/** The router's history, reduced to what the trail depends on. */
function browser(start: string, startState: unknown = null) {
  const entries: Entry[] = [{ path: start, state: startState }];
  let i = 0;
  const here = (): Where => ({ ...splitPath(entries[i].path), state: entries[i].state });
  const h = {
    go(path: string, opts: { replace?: boolean; opener?: boolean } = {}) {
      const trail = nextTrail(here(), path, {
        replace: Boolean(opts.replace),
        opener: opts.opener,
      });
      const entry = { path, state: trail ? { trail } : null };
      if (opts.replace) entries[i] = entry;
      else {
        entries.splice(i + 1);
        entries.push(entry);
        i++;
      }
    },
    /** Back, X and Esc. */
    leave() {
      const t = readTrail(entries[i].state);
      if (t.origin === null) return false;
      if (t.depth > 0) i -= t.depth;
      else entries[i] = { path: t.origin, state: null };
      return true;
    },
    /** closeSession. */
    closeEditor() {
      const { opener } = readTrail(entries[i].state);
      if (opener === null) return false;
      i -= 1;
      return true;
    },
    browserBack() {
      i = Math.max(0, i - 1);
    },
    get path() {
      return entries[i].path;
    },
    get state() {
      return entries[i].state;
    },
    get length() {
      return entries.length;
    },
    get index() {
      return i;
    },
  };
  return h;
}

// --- an entity opened from a tab leaves back to that tab ---------------------
{
  const h = browser("/");
  h.go("/?person=p1");
  is(h.path, "/?person=p1", "opening a peek navigates to it");
  ok(h.leave(), "a peek opened from Today has somewhere to return to");
  is(h.path, "/", "X on a peek from Today lands on Today");
  is(h.length, 2, "…without adding a history entry");
  is(h.index, 0, "…it pops the entry it was opened on");
}

// --- promotion, paging and breadcrumbs don't change where it leaves to -------
{
  const h = browser("/table?type=person");
  h.go("/table?person=p1");
  h.go("/person/p1", {}); // expand to a full page
  h.go("/person/p2", { replace: true }); // page right
  h.go("/person/p3", { replace: true });
  h.go("/team/t1"); // follow the breadcrumb up
  ok(h.leave(), "leaves after paging and promotion");
  is(h.path, "/table?type=person", "Back, X and Esc return to the list it was opened from");
  is(h.index, 0, "and the whole stack is popped in one go");
}

// --- the same page, whichever control closes it ------------------------------
{
  const h = browser("/meetings");
  h.go("/m/staff");
  ok(h.leave(), "a meeting opened from Meetings leaves");
  is(h.path, "/meetings", "a meeting opened from Meetings returns to Meetings, not Today");
}

// --- a write-up returns to exactly where it was opened -----------------------
{
  const h = browser("/");
  h.go("/person/p1/sessions/s1", { opener: true });
  ok(h.closeEditor(), "a write-up opened from Today knows where it came from");
  is(h.path, "/", "closing a write-up opened from Today lands on Today");
}
{
  const h = browser("/");
  h.go("/m/staff/agenda");
  h.go("/m/staff/notes/s9", { opener: true });
  h.closeEditor();
  is(h.path, "/m/staff/agenda", "closing a write-up opened from the planner returns to the planner");
  h.leave();
  is(h.path, "/", "and leaving the planner still returns to where the meeting was opened");
}
{
  const h = browser("/table");
  h.go("/table?person=p1");
  h.go("/person/p1/sessions/s2", { opener: true });
  h.closeEditor();
  is(h.path, "/table?person=p1", "a write-up opened from a peek returns to the peek, not a full page");
}

// --- a tab change with the entity along moves the origin ---------------------
{
  const h = browser("/table");
  h.go("/table?person=p1");
  h.go("/prayer?person=p1"); // setTab keeps the peek
  ok(h.leave(), "an entity carried to another tab leaves");
  is(h.path, "/prayer", "…to the tab it was carried to, not the one it was opened on");
}
{
  const h = browser("/");
  h.go("/person/p1");
  h.go("/table?person=p1"); // Minimize: split view on another tab
  h.leave();
  is(h.path, "/table", "a full page minimised onto a tab leaves to that tab");
}

// --- replaced entries add no depth --------------------------------------------
{
  const h = browser("/");
  h.go("/?person=p1");
  h.go("/?person=p2", { replace: true });
  is(readTrail(JSON.parse(JSON.stringify(h.state))).depth, 1, "the trail survives the round trip history makes through JSON");
  h.leave();
  is(h.index, 0, "paging adds nothing to pop");
}
{
  // A replace from a page with nothing open (a redirect) keeps the origin.
  const h = browser("/tree");
  h.go("/tree?team=t1", { replace: true });
  ok(h.leave(), "an entity that replaced its origin still has one");
  is(h.path, "/tree", "…and returns to it");
}

// --- the browser's own Back agrees --------------------------------------------
{
  const h = browser("/");
  h.go("/?person=p1");
  h.go("/person/p1");
  h.browserBack();
  is(h.path, "/?person=p1", "browser Back from a full page is the peek it came from");
  h.leave();
  is(h.path, "/", "and leaving from there still returns to the origin");
}

// --- no origin: a cold link or a bad state ------------------------------------
{
  const h = browser("/person/p1");
  ok(!h.leave(), "a cold deep link has no remembered origin");
}
is(readTrail(null), NO_TRAIL, "no state reads as no trail");
is(readTrail({ trail: { origin: 3, depth: -2, opener: {} } }), NO_TRAIL, "junk state reads as no trail");
is(readTrail({ trail: { origin: "/x", depth: 2.5, opener: "/y" } }).depth, 0, "a fractional depth is ignored");

// --- a page with nothing open keeps no trail ---------------------------------
is(
  nextTrail({ pathname: "/person/p1", search: "", state: { trail: { origin: "/", depth: 1, opener: null } } }, "/table", { replace: false }),
  null,
  "navigating to a tab clears the trail",
);

if (fails.length) {
  console.error(`navTrail check FAILED (${fails.length}/${checks}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`navTrail check: ${checks} checks passed`);
