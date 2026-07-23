import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { DOMAIN_COLOR } from "../data/frameworks";
import { isAssessed, topDomain } from "../lib/derive";
import { Avatar } from "./Avatar";
import { Badge, Card, DueDate, inputCls } from "./ui";

type SortKey = "name" | "team" | "coverage" | "nextOneOnOne";

export function PeopleTable() {
  const { people, teams, capacities, oneOnOnes, selectPerson, setTab } =
    useStore();
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const enriched = people.map((p) => {
      const team = teams.find((t) => t.id === p.teamId);
      const capacity = capacities.find((c) => c.id === team?.capacityId);
      const next = oneOnOnes
        .filter((o) => o.personId === p.id && o.nextDate)
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
        (!teamFilter || r.team?.id === teamFilter) &&
        (!query ||
          r.p.name.toLowerCase().includes(query.toLowerCase()) ||
          r.p.role?.toLowerCase().includes(query.toLowerCase()))
    );

    const dir = asc ? 1 : -1;
    return filtered.sort((x, y) => {
      switch (sortKey) {
        case "team":
          return dir * (x.team?.name ?? "").localeCompare(y.team?.name ?? "");
        case "coverage":
          return dir * (x.coverage - y.coverage);
        case "nextOneOnOne":
          return dir * (x.next ?? "9999").localeCompare(y.next ?? "9999");
        default:
          return dir * x.p.name.localeCompare(y.p.name);
      }
    });
  }, [people, teams, capacities, oneOnOnes, query, teamFilter, sortKey, asc]);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setAsc(!asc);
    else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (asc ? " ↑" : " ↓") : "");

  return (
    <div className="anim-fade-up mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Everyone you lead
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {teamFilter || query ? " matching" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${inputCls} max-w-xs`}
            placeholder="Search people…  ( / )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Esc: clear once, then release focus so shortcuts work again.
              if (e.key === "Escape") {
                e.preventDefault();
                if (query) setQuery("");
                else (e.target as HTMLInputElement).blur();
              }
            }}
            data-people-search
          />
          <select
            className={`${inputCls} max-w-52`}
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <Th onClick={() => sortBy("name")}>Name{arrow("name")}</Th>
              <Th onClick={() => sortBy("team")}>Team{arrow("team")}</Th>
              <Th>Capacity</Th>
              <Th onClick={() => sortBy("coverage")}>
                Coverage{arrow("coverage")}
              </Th>
              <Th>Top domain</Th>
              <Th>Enneagram</Th>
              <Th>MBTI</Th>
              <Th onClick={() => sortBy("nextOneOnOne")}>
                Next 1:1{arrow("nextOneOnOne")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, team, capacity, next, coverage, domain }) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/60"
                onClick={() => {
                  selectPerson(p.id);
                  setTab("tree");
                }}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={p.name}
                      photo={p.photo}
                      size={30}
                      dimmed={!isAssessed(p)}
                    />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.role && (
                        <div className="text-[11px] text-ink-3">{p.role}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-ink-2">{team?.name}</td>
                <td className="px-4 py-2.5">
                  {capacity && (
                    <Badge color={capacity.color}>{capacity.label}</Badge>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <CoverageDots value={coverage} />
                </td>
                <td className="px-4 py-2.5">
                  {domain ? (
                    <span
                      className="text-xs font-medium"
                      style={{ color: DOMAIN_COLOR[domain] }}
                    >
                      {domain}
                    </span>
                  ) : (
                    <span className="text-ink-3/60">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-2">
                  {p.assessments.enneagram ?? (
                    <span className="text-ink-3/60">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-2">
                  {p.assessments.mbti ?? (
                    <span className="text-ink-3/60">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 tabular-nums text-ink-2">
                  {next ? (
                    <DueDate iso={next} />
                  ) : (
                    <span className="text-ink-3/60">—</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-ink-3"
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

function CoverageDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${value}/3 assessments`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < value ? "bg-accent" : "bg-line-strong"
          }`}
        />
      ))}
      <span className="ml-1 text-xs tabular-nums text-ink-3">{value}/3</span>
    </span>
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
      className={`label-caps px-4 py-3 ${
        onClick ? "cursor-pointer select-none hover:text-ink-2" : ""
      }`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
