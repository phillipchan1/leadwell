import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Dialog,
  Modal as SysModal,
  ModalOverlay,
} from "@/components/application/modals/modal";
import { useStore } from "../store/useStore";
import { useOverlayGuard, useShortcutList } from "@/hooks/use-shortcut";
import { keysOf } from "@/lib/shortcuts";
import { meetingSubjectName, meetingTitle } from "../lib/readiness";
import { TREE_MODES } from "../lib/treeMode";
import { Avatar } from "./Avatar";
import { cx } from "@/utils/cx";
import { SearchLg } from "@untitledui/icons";

/**
 * ⌘K — one place to reach anything.
 *
 * Leadwell earns a palette: five tabs, five tree modes, four entity kinds that
 * each number in the dozens, and a set of create actions scattered across three
 * surfaces. Without it, "open Dana's 1:1" is a tab switch, a scan and a click;
 * with it, it's four keystrokes from anywhere.
 *
 * Two kinds of result share one list. **Commands** come from the shortcut
 * registry plus a handful of navigation entries, so a command that has a
 * shortcut shows it — the palette teaches the shortcut that would have skipped
 * the palette. **Entities** are every person, team, manager and meeting, ranked
 * below commands because an exact command match is almost always the intent.
 */

type Item = {
  id: string;
  label: string;
  hint?: string;
  chord?: string;
  group: string;
  photo?: string;
  run: () => void;
};

/**
 * How well `text` answers `query`, or 0 for "not at all".
 *
 * Three tiers, deliberately narrow. A prefix wins, then a match at the start of
 * any word ("foster" finds "Dana Foster"), then initials ("df" finds the same).
 *
 * What's *not* here is a free subsequence match over the whole string. It's the
 * obvious thing to write and it makes a palette feel broken: with it, "da"
 * matched "A**d**d man**a**ger" and "Manage **d**om**a**ins", so the top of the
 * list filled with commands that have nothing to do with what was typed.
 */
function score(query: string, text: string): number {
  if (!query || !text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (t.startsWith(q)) return 1000 - t.length;

  const at = t.indexOf(q);
  if (at > 0) {
    const wordStart = /[\s\-–—·:/(]/.test(t[at - 1]);
    // Mid-word substrings still count, just below every word-start match.
    return (wordStart ? 700 : 300) - at;
  }

  // Initials: "df" → "Dana Foster", "tmp" → "Tree mode — Pray".
  const initials = t
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
  if (q.length > 1 && initials.startsWith(q)) return 600;

  return 0;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  useOverlayGuard();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const shortcuts = useShortcutList();
  const {
    people,
    teams,
    managers,
    meetings,
    setTab,
    selectPerson,
    selectTeam,
    selectManager,
    selectMeeting,
    selectMe,
    setTreeMode,
    openModal,
    setAskAIOpen,
    setSettingsOpen,
    toggleDark,
    dark,
  } = useStore();

  const items = useMemo<Item[]>(() => {
    const go = (fn: () => void) => () => {
      onClose();
      fn();
    };

    const commands: Item[] = [
      { id: "go:overview", label: "Go to Overview", group: "Go to", run: go(() => setTab("overview")), hint: "G then O" },
      { id: "go:tree", label: "Go to Org tree", group: "Go to", run: go(() => setTab("tree")), hint: "G then T" },
      { id: "go:meetings", label: "Go to Meetings", group: "Go to", run: go(() => setTab("meetings")), hint: "G then M" },
      { id: "go:table", label: "Go to Table", group: "Go to", run: go(() => setTab("table")), hint: "G then B" },
      { id: "go:me", label: "Open my profile", group: "Go to", run: go(() => selectMe(true)) },

      { id: "new:team", label: "Add team", group: "Create", run: go(() => openModal({ kind: "team" })) },
      { id: "new:person", label: "Add person", group: "Create", run: go(() => openModal({ kind: "person", teamId: null })) },
      { id: "new:manager", label: "Add manager", group: "Create", run: go(() => openModal({ kind: "manager" })) },
      { id: "new:domain", label: "Manage domains", group: "Create", run: go(() => openModal({ kind: "domains" })) },

      ...TREE_MODES.map((m) => ({
        id: `mode:${m.id}`,
        label: `Tree mode — ${m.label}`,
        hint: m.question,
        chord: m.key,
        group: "Org tree",
        run: go(() => {
          setTab("tree");
          setTreeMode(m.id);
        }),
      })),

      { id: "app:ai", label: "Ask AI about your org", group: "App", run: go(() => setAskAIOpen(true)) },
      { id: "app:settings", label: "Open settings", group: "App", run: go(() => setSettingsOpen(true)) },
      {
        id: "app:theme",
        label: dark ? "Switch to light mode" : "Switch to dark mode",
        group: "App",
        run: go(toggleDark),
      },
    ];

    // Anything bound to a chord is offered here too, so the palette is a
    // complete index of what the app can do rather than a second, shorter list.
    const bound: Item[] = shortcuts
      .filter((s) => s.group !== "Writing")
      .map((s) => ({
        id: `key:${s.id}`,
        label: s.label,
        chord: keysOf(s),
        group: s.group,
        run: () => {
          onClose();
          s.run(new KeyboardEvent("keydown"));
        },
      }));

    const entities: Item[] = [
      ...people.map((p) => ({
        id: `person:${p.id}`,
        label: p.name,
        hint: p.role,
        photo: p.photo,
        group: "People",
        run: go(() => selectPerson(p.id)),
      })),
      ...teams.map((t) => ({
        id: `team:${t.id}`,
        label: t.name,
        hint: "Team",
        group: "Teams",
        run: go(() => selectTeam(t.id)),
      })),
      ...managers.map((m) => ({
        id: `manager:${m.id}`,
        label: m.name,
        hint: m.role ?? "I report to",
        photo: m.photo,
        group: "Managers",
        run: go(() => selectManager(m.id)),
      })),
      ...meetings.map((m) => ({
        id: `meeting:${m.id}`,
        label: meetingTitle(m, meetingSubjectName(m, { people, teams, managers })),
        hint: "Meeting",
        group: "Meetings",
        run: go(() => selectMeeting(m.id)),
      })),
    ];

    return [...commands, ...bound, ...entities];
  }, [
    shortcuts,
    people,
    teams,
    managers,
    meetings,
    dark,
    onClose,
    setTab,
    selectPerson,
    selectTeam,
    selectManager,
    selectMeeting,
    selectMe,
    setTreeMode,
    openModal,
    setAskAIOpen,
    setSettingsOpen,
    toggleDark,
  ]);

  const results = useMemo(() => {
    if (!query.trim()) {
      // The unfiltered list opens on commands, not on 60 names.
      return items.filter((i) => !i.id.match(/^(person|team|manager|meeting):/)).slice(0, 30);
    }
    const q = query.trim();
    const scored = items
      .map((item) => ({
        item,
        // A match on the subtitle counts, but never beats one on the name.
        s: Math.max(score(q, item.label), score(q, item.hint ?? "") - 400),
      }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40);

    // Then cluster by group, keeping groups in best-match order. Sorting purely
    // by score interleaves them, and the rendered headers repeat — three
    // separate "People" headings in one ten-row list.
    const order: string[] = [];
    const byGroup = new Map<string, Item[]>();
    for (const { item } of scored) {
      if (!byGroup.has(item.group)) {
        byGroup.set(item.group, []);
        order.push(item.group);
      }
      byGroup.get(item.group)!.push(item);
    }
    return order.flatMap((g) => byGroup.get(g)!);
  }, [items, query]);

  // A new query invalidates the highlight — otherwise Enter runs whatever
  // happened to be at index 4 in the previous result set.
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(Math.max(0, results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      results[active]?.run();
    }
  };

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="fixed inset-0 z-50 flex min-h-dvh w-full items-end justify-center bg-overlay/70 px-0 pt-4 backdrop-blur-[6px] sm:items-start sm:px-8 sm:pt-[12vh]"
    >
      <SysModal className="max-w-xl">
        <Dialog aria-label="Command palette" className="flex max-h-[inherit] flex-col">
          <div className="flex shrink-0 items-center gap-2.5 border-b border-secondary px-4 py-3">
            <SearchLg className="size-4 shrink-0 text-stone-400" aria-hidden />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search people, teams, meetings and commands…"
              aria-label="Search people, teams, meetings and commands"
              aria-controls={listId}
              aria-expanded
              aria-activedescendant={
                results[active] ? `${listId}-${results[active].id}` : undefined
              }
              role="combobox"
              aria-autocomplete="list"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500"
            />
            <kbd className="hidden shrink-0 rounded bg-tertiary px-1.5 py-0.5 font-mono text-caption text-quaternary sm:inline">
              Esc
            </kbd>
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Results"
            className="scroll-contain min-h-0 flex-1 overflow-y-auto py-1.5"
          >
            {results.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-quaternary">
                Nothing matches “{query}”.
              </p>
            )}
            {results.map((item, i) => {
              const first = i === 0 || results[i - 1].group !== item.group;
              return (
                <div key={item.id}>
                  {first && (
                    <div className="px-4 pt-2 pb-1 text-caption font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
                      {item.group}
                    </div>
                  )}
                  {/* Not a <button>: the input keeps focus so typing never
                      stops, and the active row is named by aria-activedescendant. */}
                  <div
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={item.run}
                    className={cx(
                      "flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm",
                      i === active
                        ? "bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
                        : "text-stone-700 dark:text-stone-200"
                    )}
                  >
                    {item.photo !== undefined && (
                      <Avatar name={item.label} photo={item.photo} size={22} />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.hint && (
                      <span className="hidden shrink-0 truncate text-xs text-stone-400 sm:inline dark:text-stone-500">
                        {item.hint}
                      </span>
                    )}
                    {item.chord && (
                      <kbd className="shrink-0 rounded bg-tertiary px-1.5 py-0.5 font-mono text-caption text-quaternary">
                        {item.chord}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pad-safe-bottom flex shrink-0 items-center gap-3 border-t border-secondary px-4 py-2 text-caption text-quaternary [--pad-safe-bottom:0.5rem]">
            <span>
              <kbd className="font-mono">↑↓</kbd> move
            </span>
            <span>
              <kbd className="font-mono">↵</kbd> open
            </span>
            <span>
              <kbd className="font-mono">?</kbd> all shortcuts
            </span>
          </div>
        </Dialog>
      </SysModal>
    </ModalOverlay>
  );
}
