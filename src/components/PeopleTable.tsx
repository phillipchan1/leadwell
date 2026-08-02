import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { DOMAIN_COLOR } from "../data/frameworks";
import { hasLeadershipRead, topDomain } from "../lib/derive";
import { HEALTH_SCORE } from "../lib/health";
import { meetingFor } from "../lib/readiness";
import { Avatar } from "./Avatar";
import { Th } from "./Th";
import { HealthSelect } from "./Health";
import { TintBadge, Card } from "./ui";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { SearchLg } from "@untitledui/icons";

type SortKey = "name" | "team" | "coverage" | "nextSession" | "health";

export function PeopleTable() {
  const {
    people,
    teams,
    capacities,
    meetings,
    sessions,
    selectPerson,
    setHealth,
  } = useStore();
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const enriched = people.map((p) => {
      const team = teams.find((t) => t.id === p.teamId);
      const capacity = capacities.find((c) => c.id === team?.capacityId);
      const meeting = meetingFor(meetings, "person", p.id);
      const next = sessions
        .filter((o) => meeting && o.meetingId === meeting.id && o.nextDate)
        .map((o) => o.nextDate!)
        .sort()[0];
      const a = p.assessments;
      const coverage =
        Number(Boolean(a.cliftonTop5?.length)) +
        Number(Boolean(a.enneagram)) +
        Number(Boolean(a.mbti));
      return { p, team, capacity, next, coverage, domain: topDomain(p) };
    });

    const filtered = enriched.filter(
      (r) =>
        (!teamFilter ||
          (teamFilter === "none" ? !r.p.teamId : r.team?.id === teamFilter)) &&
        (!query ||
          r.p.name.toLowerCase().includes(query.toLowerCase()) ||
          r.p.role?.toLowerCase().includes(query.toLowerCase()))
    );

    const dir = asc ? 1 : -1;
    // Weakest first when ascending; unrated sorts last either way.
    const healthRank = (p: (typeof enriched)[number]) =>
      p.p.health ? HEALTH_SCORE[p.p.health.level] : 999;
    return filtered.sort((x, y) => {
      switch (sortKey) {
        case "health":
          return dir * (healthRank(x) - healthRank(y));
        case "team":
          return dir * (x.team?.name ?? "").localeCompare(y.team?.name ?? "");
        case "coverage":
          return dir * (x.coverage - y.coverage);
        case "nextSession":
          return dir * (x.next ?? "9999").localeCompare(y.next ?? "9999");
        default:
          return dir * x.p.name.localeCompare(y.p.name);
      }
    });
  }, [people, teams, capacities, sessions, query, teamFilter, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const sortedDir = (key: SortKey) =>
    sortKey === key ? (asc ? ("asc" as const) : ("desc" as const)) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          size="sm"
          icon={SearchLg}
          className="max-w-xs"
          placeholder="Search people…"
          aria-label="Search people"
          value={query}
          onChange={setQuery}
        />
        <NativeSelect
          size="sm"
          className="max-w-52"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          aria-label="Filter by team"
          options={[
            { label: "All teams", value: "" },
            { label: "Direct reports (no team)", value: "none" },
            ...teams.map((t) => ({ label: t.name, value: t.id })),
          ]}
        />
      </div>

      {/* Nine columns collapse to unreadable widths on a phone, so below lg
          each person is a card carrying the columns that actually get scanned:
          identity, team, health and the next 1:1. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {rows.map(({ p, team, capacity, next, coverage, domain }) => (
          <div
            key={p.id}
            className="rounded-xl border border-stone-200 bg-white transition-colors dark:border-stone-800 dark:bg-stone-900"
          >
            <button
              type="button"
              onClick={() => selectPerson(p.id)}
              className="flex w-full items-center gap-3 p-3 text-left active:bg-stone-50 dark:active:bg-stone-800/60"
            >
              <Avatar
                name={p.name}
                photo={p.photo}
                size={40}
                dimmed={!hasLeadershipRead(p)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                  {[p.role, team?.name ?? "Direct report"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {next && (
                <span className="shrink-0 text-xs tabular-nums text-stone-500 dark:text-stone-400">
                  {next}
                </span>
              )}
            </button>
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-3 py-2 dark:border-stone-800">
              <HealthSelect
                size="sm"
                value={p.health?.level}
                onChange={(level) => setHealth("person", p.id, level)}
                ariaLabel={`Health for ${p.name}`}
              />
              {capacity && (
                <TintBadge color={capacity.color}>{capacity.label}</TintBadge>
              )}
              {domain && (
                <span
                  className="text-xs font-medium"
                  style={{ color: DOMAIN_COLOR[domain] }}
                >
                  {domain}
                </span>
              )}
              <span className="ml-auto text-xs text-stone-500 dark:text-stone-400">
                Read {coverage}/3
              </span>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            No one matches this view.
          </p>
        )}
      </div>

      <Card className="max-lg:hidden overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
              <Th onClick={() => sortBy("name")} sorted={sortedDir("name")}>Name</Th>
              <Th onClick={() => sortBy("team")} sorted={sortedDir("team")}>Team</Th>
              <Th>Capacity</Th>
              <Th onClick={() => sortBy("health")} sorted={sortedDir("health")}>Health</Th>
              <Th onClick={() => sortBy("coverage")} sorted={sortedDir("coverage")}>
                Coverage
              </Th>
              <Th>Top domain</Th>
              <Th>Enneagram</Th>
              <Th>MBTI</Th>
              <Th
                onClick={() => sortBy("nextSession")}
                sorted={sortedDir("nextSession")}
              >
                Next 1:1
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, team, capacity, next, coverage, domain }) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50 active:bg-stone-100 dark:border-stone-800/60 dark:hover:bg-stone-800/40 dark:active:bg-stone-800"
                onClick={() => {
                  selectPerson(p.id);
                }}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={p.name}
                      photo={p.photo}
                      size={30}
                      dimmed={!hasLeadershipRead(p)}
                    />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.role && (
                        <div className="text-[11px] text-stone-500 dark:text-stone-400">
                          {p.role}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {team?.name ?? (
                    <span className="text-stone-500 dark:text-stone-400">Direct report</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {capacity && (
                    <TintBadge color={capacity.color}>{capacity.label}</TintBadge>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <HealthSelect
                    size="sm"
                    value={p.health?.level}
                    onChange={(level) => setHealth("person", p.id, level)}
                    ariaLabel={`Health for ${p.name}`}
                  />
                </td>
                <td className="px-4 py-2.5 text-stone-500">{coverage}/3</td>
                <td className="px-4 py-2.5">
                  {domain ? (
                    <span
                      className="text-xs font-medium"
                      style={{ color: DOMAIN_COLOR[domain] }}
                    >
                      {domain}
                    </span>
                  ) : (
                    <span className="text-stone-400 dark:text-stone-500">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {p.assessments.enneagram ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {p.assessments.mbti ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-stone-500">{next ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400"
                >
                  No people match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

