import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { DOMAIN_COLOR } from "../data/frameworks";
import { hasLeadershipRead, topDomain } from "../lib/derive";
import { HEALTH_SCORE } from "../lib/health";
import { meetingFor } from "../lib/readiness";
import { Avatar } from "./Avatar";
import { HealthSelect } from "./Health";
import { Badge, Card, inputSmCls } from "./ui";

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

  const arrow = (key: SortKey) =>
    sortKey === key ? (asc ? " ↑" : " ↓") : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          className={`${inputSmCls} max-w-xs`}
          placeholder="Search people…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={`${inputSmCls} max-w-52`}
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          <option value="">All teams</option>
          <option value="none">Direct reports (no team)</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs text-stone-400 dark:border-stone-800">
              <Th onClick={() => sortBy("name")}>Name{arrow("name")}</Th>
              <Th onClick={() => sortBy("team")}>Team{arrow("team")}</Th>
              <Th>Capacity</Th>
              <Th onClick={() => sortBy("health")}>Health{arrow("health")}</Th>
              <Th onClick={() => sortBy("coverage")}>
                Coverage{arrow("coverage")}
              </Th>
              <Th>Top domain</Th>
              <Th>Enneagram</Th>
              <Th>MBTI</Th>
              <Th onClick={() => sortBy("nextSession")}>
                Next 1:1{arrow("nextSession")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, team, capacity, next, coverage, domain }) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800/60 dark:hover:bg-stone-800/40"
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
                        <div className="text-[11px] text-stone-400">
                          {p.role}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-stone-500">
                  {team?.name ?? (
                    <span className="text-stone-400">Direct report</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {capacity && (
                    <Badge color={capacity.color}>{capacity.label}</Badge>
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
                    <span className="text-stone-300 dark:text-stone-600">—</span>
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
                  className="px-4 py-8 text-center text-sm text-stone-400"
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

function Th({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <th
      className={`px-4 py-2.5 font-medium ${onClick ? "cursor-pointer select-none hover:text-stone-600" : ""}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
