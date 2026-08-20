import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import type { MeetingSubjectKind, TrackedMeeting } from "../types";
import {
  RHYTHM_LABEL,
  STATE_COLOR,
  STATE_LABEL,
  formatCountdown,
  meetingSubjectName,
  meetingTitle,
  readinessOf,
  type Readiness,
} from "../lib/readiness";
import { looseTopics, topicsFor } from "../lib/topics";
import { Card, SectionTitle, TintBadge } from "./ui";
import { Th } from "./Th";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { NewMeetingRow } from "./NewMeetingRow";
import { SearchLg } from "@untitledui/icons";
import { tableRowActivationProps } from "@/lib/rowActivation";
import { useSearchShortcut } from "@/hooks/use-search-shortcut";

type SortKey = "next" | "name" | "planned" | "state";

type Row = {
  meeting: TrackedMeeting;
  title: string;
  subjectName?: string;
  readiness: Readiness;
  /** Open topics on the board, whether or not they're slotted yet. */
  open: number;
  /** Open topics slotted into an occurrence that's already gone. */
  loose: number;
};

const KIND_FILTERS: { label: string; value: "" | MeetingSubjectKind }[] = [
  { label: "Everything", value: "" },
  { label: "People", value: "person" },
  { label: "Teams", value: "team" },
  { label: "Managers", value: "manager" },
];

/**
 * Every recurring meeting in one list — the thing that was missing.
 *
 * Opting into a meeting used to be buried in the readiness panel of whichever
 * profile it hung off, so there was no answer to "what do I actually run?".
 * This is that answer, sorted by what's next, with the two numbers that decide
 * whether you're ready: what's planned, and what got dropped.
 */
export function MeetingsTable() {
  const { meetings, sessions, topics, people, teams, managers, selectMeeting } =
    useStore();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"" | MeetingSubjectKind>("");
  const [sortKey, setSortKey] = useState<SortKey>("next");
  const [asc, setAsc] = useState(true);
  const [creating, setCreating] = useState(false);
  const searchRef = useSearchShortcut();

  const rows = useMemo<Row[]>(() => {
    const enriched = meetings.map((meeting) => {
      const subjectName = meetingSubjectName(meeting, {
        people,
        teams,
        managers,
      });
      const mine = topicsFor(topics, meeting.id);
      return {
        meeting,
        title: meetingTitle(meeting, subjectName),
        subjectName,
        readiness: readinessOf(meeting, { meetings, sessions, topics }),
        open: mine.filter((t) => t.status === "open").length,
        loose: looseTopics(topics, sessions, meeting.id).length,
      };
    });

    const q = query.trim().toLowerCase();
    const filtered = enriched.filter(
      (r) =>
        (!kind || r.meeting.subjectKind === kind) &&
        (!q ||
          r.title.toLowerCase().includes(q) ||
          r.subjectName?.toLowerCase().includes(q))
    );

    const dir = asc ? 1 : -1;
    return filtered.sort((x, y) => {
      switch (sortKey) {
        case "name":
          return dir * x.title.localeCompare(y.title);
        case "planned":
          return dir * (x.open - y.open);
        case "state":
          // Worst first when ascending — the list is a to-do, not an index.
          return (
            dir *
            (STATE_RANK[y.readiness.state] - STATE_RANK[x.readiness.state])
          );
        default:
          // No next date sorts last either way: it's unknown, not imminent.
          return (
            dir * (x.readiness.nextDate ?? "9999").localeCompare(
              y.readiness.nextDate ?? "9999"
            )
          );
      }
    });
  }, [meetings, sessions, topics, people, teams, managers, query, kind, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const sortedAs = (key: SortKey): "asc" | "desc" | undefined =>
    sortKey === key ? (asc ? "asc" : "desc") : undefined;

  const totalLoose = rows.reduce((n, r) => n + r.loose, 0);

  return (
    <div className="scroll-contain min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionTitle>Meetings</SectionTitle>
            <p className="mt-1 text-xs text-quaternary">
              {rows.length} recurring
              {totalLoose > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-amber-700 dark:text-amber-500">
                    {totalLoose} planned and never covered
                  </span>
                </>
              )}
            </p>
          </div>
          <Button
            size="sm"
            color={creating ? "secondary" : "primary"}
            onClick={() => setCreating((v) => !v)}
          >
            New recurring meeting
          </Button>
        </div>

        {creating && <NewMeetingRow onDone={() => setCreating(false)} />}

        <div className="flex flex-wrap gap-2">
          <Input
            size="sm"
            className="w-full sm:w-64"
            icon={SearchLg}
            ref={searchRef}
          placeholder="Find a meeting…"
            aria-label="Find a meeting"
            value={query}
            onChange={setQuery}
          />
          <NativeSelect
            size="sm"
            className="w-auto"
            aria-label="Filter by kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "" | MeetingSubjectKind)}
            options={KIND_FILTERS}
          />
        </div>

        {rows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-quaternary">
            {meetings.length === 0
              ? "No recurring meetings yet. Add the ones you actually run — a 1:1 per person, a staff meeting per team."
              : "Nothing matches that."}
          </Card>
        ) : (
          <>
            {/* Below sm the table becomes cards: four columns can't hold a
                date, a countdown and two counts on a phone. */}
            <ul className="flex flex-col gap-2 sm:hidden">
              {rows.map((r) => (
                <li key={r.meeting.id}>
                  <button
                    type="button"
                    onClick={() => selectMeeting(r.meeting.id)}
                    className="w-full rounded-xl border border-secondary bg-primary p-3 text-left touch:min-h-11"
                  >
                    <div className="flex items-center gap-2">
                      <StateDot readiness={r.readiness} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                        {r.title}
                      </span>
                      <span
                        className="shrink-0 font-mono text-caption tabular-nums"
                        style={{ color: STATE_COLOR[r.readiness.state] }}
                      >
                        {formatCountdown(r.readiness)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-4 text-caption text-quaternary">
                      <span>{RHYTHM_LABEL[r.meeting.rhythm]}</span>
                      <span>·</span>
                      <span>
                        {r.open} topic{r.open === 1 ? "" : "s"}
                      </span>
                      {r.loose > 0 && <LooseBadge count={r.loose} />}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-hidden rounded-xl border border-secondary sm:block">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left dark:bg-stone-950/60">
                  <tr>
                    <Th sorted={sortedAs("name")} onClick={() => sortBy("name")}>
                      Meeting
                    </Th>
                    <Th>Rhythm</Th>
                    <Th sorted={sortedAs("next")} onClick={() => sortBy("next")}>
                      Next
                    </Th>
                    <Th
                      sorted={sortedAs("planned")}
                      onClick={() => sortBy("planned")}
                    >
                      Planned
                    </Th>
                    <Th sorted={sortedAs("state")} onClick={() => sortBy("state")}>
                      Readiness
                    </Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/80">
                  {rows.map((r) => (
                    <tr
                      key={r.meeting.id}
                      {...tableRowActivationProps(
                        () => selectMeeting(r.meeting.id),
                        { label: `Open ${r.title}` }
                      )}
                      className="cursor-pointer hover:bg-stone-50 focus-visible:bg-stone-50 dark:hover:bg-stone-800/40 dark:focus-visible:bg-stone-800/40"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <StateDot readiness={r.readiness} />
                          <span className="truncate font-medium text-stone-800 dark:text-stone-100">
                            {r.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-quaternary">
                        {RHYTHM_LABEL[r.meeting.rhythm]}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="font-mono text-xs tabular-nums"
                          style={{ color: STATE_COLOR[r.readiness.state] }}
                        >
                          {formatCountdown(r.readiness)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-quaternary">
                          <span className="tabular-nums">{r.open}</span>
                          {r.loose > 0 && <LooseBadge count={r.loose} />}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <TintBadge color={STATE_COLOR[r.readiness.state]}>
                          {STATE_LABEL[r.readiness.state]}
                        </TintBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const STATE_RANK: Record<string, number> = {
  drifting: 5,
  loose_end: 4,
  prep_due: 3,
  ready: 2,
  resting: 1,
  dormant: 0,
};

function StateDot({ readiness }: { readiness: Readiness }) {
  const color = STATE_COLOR[readiness.state];
  return (
    <span
      aria-hidden
      className="h-2 w-2 shrink-0 rounded-full"
      title={STATE_LABEL[readiness.state]}
      style={{
        // Drifting is drawn hollow so it reads as absence, not alarm — the
        // same treatment the canvas and the prep panel already give it.
        backgroundColor: readiness.state === "drifting" ? "transparent" : color,
        boxShadow:
          readiness.state === "drifting" ? `inset 0 0 0 2px ${color}` : undefined,
      }}
    />
  );
}

function LooseBadge({ count }: { count: number }) {
  return (
    <span
      className="rounded bg-amber-100 px-1.5 py-0.5 text-caption font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-500"
      title="Planned into a meeting that's already been and gone"
    >
      {count} loose
    </span>
  );
}
