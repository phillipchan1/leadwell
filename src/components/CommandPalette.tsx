import { useEffect, useMemo, useRef, useState } from "react";
import { SearchLg } from "@untitledui/icons";
import { useStore } from "../store/useStore";
import { meetingSubjectName, meetingTitle } from "../lib/readiness";
import { Avatar } from "./Avatar";
import { Modal } from "./ui";
import { cx } from "@/utils/cx";

/**
 * One way to reach anything by name.
 *
 * There was no way to jump to a person from anywhere: each table carried its
 * own local `query` state, so finding someone meant first picking the right
 * tab, then searching inside it. Dana on a laptop had no `⌘K`; Marcus on a
 * phone had to guess which of four surfaces held the name he wanted.
 *
 * Every result navigates through the existing selection setters, so the URL
 * stays the source of truth and a jump is back-button-safe like any other.
 */
type Hit = {
  key: string;
  kind: "person" | "team" | "manager" | "meeting";
  name: string;
  detail: string;
  photo?: string;
  go: () => void;
};

/** Matches on any word boundary, so "sk" finds "Sarah Kim". */
function score(name: string, detail: string, q: string): number {
  const n = name.toLowerCase();
  const d = detail.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  // initials: "sk" → "Sarah Kim"
  const initials = n
    .split(/\s+/)
    .map((w) => w[0])
    .join("");
  if (initials.startsWith(q)) return 2;
  if (n.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (n.includes(q)) return 4;
  if (d.includes(q)) return 5;
  return -1;
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);
  const selectMeeting = useStore((s) => s.selectMeeting);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const everything = useMemo<Hit[]>(() => {
    const teamName = (id?: string) => teams.find((t) => t.id === id)?.name;
    return [
      ...people.map((p) => ({
        key: `person:${p.id}`,
        kind: "person" as const,
        name: p.name,
        detail: [p.role, teamName(p.teamId) ?? "Direct report"]
          .filter(Boolean)
          .join(" · "),
        photo: p.photo,
        go: () => selectPerson(p.id),
      })),
      ...teams.map((t) => ({
        key: `team:${t.id}`,
        kind: "team" as const,
        name: t.name,
        detail: t.purpose?.slice(0, 60) ?? "Team",
        go: () => selectTeam(t.id),
      })),
      ...managers.map((m) => ({
        key: `manager:${m.id}`,
        kind: "manager" as const,
        name: m.name,
        detail: m.role ?? "I report to",
        photo: m.photo,
        go: () => selectManager(m.id),
      })),
      ...meetings.map((m) => ({
        key: `meeting:${m.id}`,
        kind: "meeting" as const,
        name: meetingTitle(
          m,
          meetingSubjectName(m, { people, teams, managers })
        ),
        detail: "Meeting",
        go: () => selectMeeting(m.id),
      })),
    ];
  }, [
    people,
    teams,
    managers,
    meetings,
    selectPerson,
    selectTeam,
    selectManager,
    selectMeeting,
  ]);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Empty query shows people first — the thing you are nearly always after.
    if (!q) return everything.filter((h) => h.kind === "person").slice(0, 8);
    return everything
      .map((h) => ({ h, s: score(h.name, h.detail, q) }))
      .filter(({ s }) => s >= 0)
      .sort((a, b) => a.s - b.s || a.h.name.localeCompare(b.h.name))
      .slice(0, 12)
      .map(({ h }) => h);
  }, [everything, query]);

  // A new query invalidates wherever the caret was.
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const commit = (hit?: Hit) => {
    if (!hit) return;
    hit.go();
    onClose();
  };

  return (
    <Modal
      title="Go to"
      subtitle="Anyone, any team, any meeting — by name."
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-primary px-3">
          <SearchLg
            className="size-4 shrink-0 text-quaternary"
            aria-hidden="true"
          />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                commit(hits[active]);
              }
            }}
            placeholder="Search people, teams, meetings…"
            aria-label="Search people, teams and meetings"
            className="w-full border-0 bg-transparent py-3 text-sm outline-none"
          />
        </div>

        {hits.length === 0 ? (
          <p className="px-1 py-8 text-center text-sm text-quaternary">
            Nothing matches "{query}".
          </p>
        ) : (
          <ul ref={listRef} className="-mx-1 max-h-80 overflow-y-auto px-1">
            {hits.map((hit, i) => (
              <li key={hit.key}>
                <button
                  type="button"
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(hit)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left",
                    i === active && "bg-secondary"
                  )}
                >
                  {hit.kind === "team" || hit.kind === "meeting" ? (
                    <span
                      className="size-7 shrink-0 rounded-lg bg-tertiary"
                      aria-hidden="true"
                    />
                  ) : (
                    <Avatar name={hit.name} photo={hit.photo} size={28} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {hit.name}
                    </span>
                    <span className="block truncate text-caption text-quaternary">
                      {hit.detail}
                    </span>
                  </span>
                  <span className="shrink-0 text-caption text-quaternary capitalize">
                    {hit.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
