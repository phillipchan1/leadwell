/**
 * Table — the canvas's correlated view.
 *
 * Same org, same records, same health calls; a different question. The canvas
 * is for shape and place ("who sits under what"), the table for comparison
 * ("show me everything strained, sorted by how long since I met"). Clicking a
 * row opens the same peek panel a card does, so drilling in never means
 * starting over on the other surface.
 *
 * Default view is the outline — teams, their people, then their sub-teams,
 * indented — because that's the structure the canvas draws and the one the
 * question "which sub-team is this" is asked against. Grouping by domain,
 * health, capacity or type flattens it into buckets when the comparison
 * matters more than the hierarchy.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import type { HealthLevel } from "../types";
import {
  HEALTH_FILTER_VALUES,
  HEALTH_LEVELS,
  WEAK_LEVELS,
  filterColor,
  filterLabel,
  matchesHealth,
  rollUpHealth,
} from "../lib/health";
import {
  PRAYER_COLOR,
  PRAYER_FILTER_VALUES,
  PRAYER_HINT,
  PRAYER_LABEL,
  matchesPrayer,
} from "../lib/prayer";
import {
  buildOutline,
  buildRecords,
  compareRecords,
  groupOf,
  type GroupBy,
  type OrgRecord,
  type OrgSource,
  type OutlineNode,
  type SortKey,
} from "../lib/orgTable";
import {
  STATE_LABEL,
  formatCountdown,
} from "../lib/readiness";
import { Avatar } from "./Avatar";
import { ReadinessChip } from "./ReadinessChip";
import { Explain } from "./Explain";
import { Th } from "./Th";
import { HealthBar, HealthSelect } from "./Health";
import { PrayerIcon, PrayerMark } from "./Prayer";
import { TintBadge, Card } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { Checkbox } from "@/components/base/checkbox/checkbox";

import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { SearchLg } from "@untitledui/icons";
import { cx } from "@/utils/cx";

type ColumnKey = Exclude<SortKey, "name">;

const COLUMNS: {
  key: ColumnKey;
  label: string;
  /** Weakest/worst first reads better than A–Z on these. */
  descFirst?: boolean;
  defaultOn: boolean;
}[] = [
  { key: "type", label: "Type", defaultOn: true },
  { key: "under", label: "Under", defaultOn: true },
  { key: "health", label: "Health", defaultOn: true },
  { key: "prayer", label: "Prayer", defaultOn: false },
  { key: "note", label: "Why", defaultOn: true },
  { key: "domain", label: "Domain", defaultOn: true },
  { key: "ready", label: "Ready", defaultOn: true },
  { key: "next", label: "Next", defaultOn: true },
  { key: "capacity", label: "Capacity", defaultOn: false },
  { key: "read", label: "Read", defaultOn: false },
  { key: "size", label: "Size", defaultOn: false },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "team", label: "Team outline" },
  { value: "health", label: "Health" },
  { value: "domain", label: "Domain" },
  { value: "capacity", label: "Capacity" },
  { value: "type", label: "Type" },
  { value: "none", label: "Nothing (flat)" },
];

type ShowKind = "all" | "teams" | "people";

/** One rendered line: a group header, or a record at some indent depth. */
type Line =
  | { kind: "group"; key: string; label: string; color?: string; count: number; records: OrgRecord[] }
  | {
      kind: "row";
      record: OrgRecord;
      depth: number;
      hasChildren: boolean;
      expanded: boolean;
      /** Kept only to give a matching descendant its context. */
      context: boolean;
    };

/**
 * Which job this instance is doing.
 *
 * `table` is the pivot: group by anything, show anything, pick columns. `tree`
 * is the Org tree tab's sub-lg surface, where the canvas can't be read on a
 * phone — it answers the tree's question instead ("who sits under what"), so
 * it's locked to the outline and drops the controls that would flatten it.
 * Without this the two tabs rendered the identical screen.
 */
export type TableVariant = "table" | "tree";

export function TableView({ variant = "table" }: { variant?: TableVariant } = {}) {
  const {
    teams,
    people,
    domains,
    capacities,
    meetings,
    sessions,
    actions,
    teamActions,
    healthScan,
    toggleHealthScan,
    setHealthScan,
    prayerScan,
    togglePrayerScan,
    setPrayerScan,
    setHealth,
    setHealthNote,
    selectTeam,
    selectPerson,
    selectedTeamId,
    selectedPersonId,
    treeDomainId,
  } = useStore();

  const isTree = variant === "tree";

  const [query, setQuery] = useState("");
  // The outline *is* the hierarchy, so tree mode pins the grouping there —
  // any other value would flatten the one thing this surface exists to show.
  const [ownGroupBy, setOwnGroupBy] = useState<GroupBy>("team");
  const groupBy: GroupBy = isTree ? "team" : ownGroupBy;
  const setGroupBy = setOwnGroupBy;
  const [show, setShow] = useState<ShowKind>("all");
  const [ownDomainFilter, setOwnDomainFilter] = useState("");
  // In tree mode the domain chips above the outline are the filter, so this
  // instance follows them instead of carrying a second, conflicting control.
  const domainFilter = isTree ? (treeDomainId ?? "") : ownDomainFilter;
  const setDomainFilter = setOwnDomainFilter;
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<Set<ColumnKey>>(
    () => new Set(COLUMNS.filter((c) => c.defaultOn).map((c) => c.key))
  );
  const [columnsOpen, setColumnsOpen] = useState(false);

  const source: OrgSource = useMemo(
    () => ({
      teams,
      people,
      domains,
      capacities,
      meetings,
      sessions,
      actions,
      teamActions,
    }),
    [teams, people, domains, capacities, meetings, sessions, actions, teamActions]
  );

  const records = useMemo(() => buildRecords(source), [source]);
  const outline = useMemo(
    () => buildOutline(source, records),
    [source, records]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (r: OrgRecord) => {
      if (show === "teams" && r.kind !== "team") return false;
      if (show === "people" && r.kind !== "person") return false;
      if (domainFilter) {
        const id = domainFilter === "none" ? undefined : domainFilter;
        if ((r.domain?.id ?? undefined) !== id) return false;
      }
      if (!matchesHealth(r.health, healthScan)) return false;
      if (!matchesPrayer(r.prayer, prayerScan)) return false;
      if (!q) return true;
      return [r.name, r.role, r.underName, r.note, r.typeLabel]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    };
  }, [query, show, domainFilter, healthScan, prayerScan]);

  const compare = sort ? compareRecords(sort.key, sort.asc) : null;

  const lines: Line[] = useMemo(() => {
    if (groupBy === "team") {
      const out: Line[] = [];
      const walk = (nodes: OutlineNode[], depth: number): Line[] => {
        const sorted = compare
          ? [...nodes].sort((a, b) => compare(a.record, b.record))
          : nodes;
        const produced: Line[] = [];
        for (const node of sorted) {
          const childLines = walk(node.children, depth + 1);
          const self = matches(node.record);
          // An unmatched team still shows when something under it matched —
          // dropping it would leave a person floating with no context.
          if (!self && childLines.length === 0) continue;
          const expanded = !collapsed.has(node.record.id);
          produced.push({
            kind: "row",
            record: node.record,
            depth,
            hasChildren: node.children.length > 0,
            expanded,
            context: !self,
          });
          if (expanded) produced.push(...childLines);
        }
        return produced;
      };
      out.push(...walk(outline, 0));
      return out;
    }

    const flat = [...records.values()].filter(matches);
    const sorted = compare
      ? [...flat].sort(compare)
      : [...flat].sort((a, b) => a.name.localeCompare(b.name));

    if (groupBy === "none") {
      return sorted.map((record) => ({
        kind: "row" as const,
        record,
        depth: 0,
        hasChildren: false,
        expanded: true,
        context: false,
      }));
    }

    const buckets = new Map<
      string,
      { label: string; color?: string; records: OrgRecord[] }
    >();
    for (const record of sorted) {
      const g = groupOf(record, groupBy);
      const bucket = buckets.get(g.key) ?? {
        label: g.label,
        color: g.color,
        records: [],
      };
      bucket.records.push(record);
      buckets.set(g.key, bucket);
    }

    // Health reads strongest → weakest; everything else alphabetical, with the
    // "none" bucket last so an empty tag never leads the page.
    // Unrated always lands at the bottom; health otherwise reads strongest first.
    const order = (key: string) =>
      key === "~none"
        ? 999
        : groupBy === "health"
          ? HEALTH_LEVELS.indexOf(key as HealthLevel)
          : 0;
    const keys = [...buckets.keys()].sort((a, b) => {
      const d = order(a) - order(b);
      if (d !== 0) return d;
      if (a === "~none") return 1;
      if (b === "~none") return -1;
      return (buckets.get(a)!.label).localeCompare(buckets.get(b)!.label);
    });

    return keys.flatMap((key): Line[] => {
      const bucket = buckets.get(key)!;
      const header: Line = {
        kind: "group",
        key,
        label: bucket.label,
        color: bucket.color,
        count: bucket.records.length,
        records: bucket.records,
      };
      if (collapsed.has(`group:${key}`)) return [header];
      return [
        header,
        ...bucket.records.map((record) => ({
          kind: "row" as const,
          record,
          depth: 0,
          hasChildren: false,
          expanded: true,
          context: false,
        })),
      ];
    });
  }, [groupBy, outline, records, matches, compare, collapsed]);

  const rowCount = lines.filter((l) => l.kind === "row" && !l.context).length;
  const visible = COLUMNS.filter((c) => columns.has(c.key));

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const sortBy = (key: SortKey, descFirst = false) =>
    setSort((prev) =>
      prev?.key === key
        ? prev.asc === !descFirst
          ? { key, asc: descFirst }
          : null // third click drops back to the natural order
        : { key, asc: !descFirst }
    );

  const sortedDir = (key: SortKey) =>
    sort?.key === key ? (sort.asc ? ("asc" as const) : ("desc" as const)) : undefined;

  const scanning = healthScan.length > 0 || prayerScan.length > 0;
  const weakScan =
    healthScan.length === WEAK_LEVELS.length &&
    WEAK_LEVELS.every((l) => healthScan.includes(l));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          size="sm"
          icon={SearchLg}
          className="w-full sm:max-w-56"
          placeholder="Search teams and people…"
          aria-label="Search"
          value={query}
          onChange={setQuery}
        />
        {/* Pivot controls belong to the Table tab. The tree keeps its own
            domain chips and would only contradict them. */}
        {!isTree && (
          <>
            <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              Group
              <NativeSelect
                size="sm"
                className="max-w-40"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                aria-label="Group by"
                options={GROUP_OPTIONS}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
              Show
              <NativeSelect
                size="sm"
                className="max-w-36 touch:max-w-52"
                value={show}
                onChange={(e) => setShow(e.target.value as ShowKind)}
                aria-label="Show"
                options={[
                  { label: "Teams & people", value: "all" },
                  { label: "Teams only", value: "teams" },
                  { label: "People only", value: "people" },
                ]}
              />
            </label>
            <NativeSelect
              size="sm"
              className="max-w-40"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              aria-label="Filter by domain"
              options={[
                { label: "All domains", value: "" },
                ...domains.map((d) => ({ label: d.name, value: d.id })),
                { label: "No domain", value: "none" },
              ]}
            />
          </>
        )}

        <div className="max-lg:hidden">
        <ColumnsMenu
          open={columnsOpen}
          onOpenChange={setColumnsOpen}
          columns={columns}
          onToggle={(key) =>
            setColumns((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
        />
        </div>

        <span className="ml-auto text-xs tabular-nums text-stone-500 dark:text-stone-400">
          {rowCount} row{rowCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Health scan — the same filter the org tree is using. In tree mode the
          tree renders its own layer-aware copy directly above this one, so
          showing both would be two identical rows driving one store value. */}
      <div className={cx("flex flex-wrap items-center gap-1.5", isTree && "hidden")}>
        <Explain text="Shared with the org tree, so a scan follows you between the two views">
          <span className="text-[11px] font-medium tracking-wide text-stone-500 uppercase dark:text-stone-400">
            Health
          </span>
        </Explain>
        <button
          type="button"
          onClick={() => setHealthScan(weakScan ? [] : [...WEAK_LEVELS])}
          aria-pressed={weakScan}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors touch:min-h-11 touch:px-3.5 ${
            weakScan
              ? "border-transparent bg-amber-500 font-medium text-white"
              : "border-stone-300 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400"
          }`}
          title="Everything I've flagged watch, strained or critical"
        >
          Weak spots
        </button>
        {HEALTH_FILTER_VALUES.map((value) => {
          const active = healthScan.includes(value);
          const color = filterColor(value);
          const count = [...records.values()].filter((r) =>
            matchesHealth(r.health, [value])
          ).length;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => toggleHealthScan(value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors touch:min-h-11 touch:px-3.5 ${
                active
                  ? "border-transparent font-medium text-white"
                  : "border-stone-300 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400"
              }`}
              style={active ? { backgroundColor: color } : undefined}
            >
              {!active && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              {filterLabel(value)}
              <span
                className={`tabular-nums ${active ? "text-white/80" : "text-stone-500 dark:text-stone-400"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
        {(scanning || query || domainFilter || show !== "all" || sort) && (
          <Button
            size="sm"
            color="link-gray"
            onClick={() => {
              setHealthScan([]);
              setPrayerScan([]);
              setQuery("");
              setDomainFilter("");
              setShow("all");
              setSort(null);
            }}
          >
            Reset view
          </Button>
        )}
      </div>

      {/* Prayer scan — the same store value the canvas layer drives, so who
          you're carrying follows you between the two surfaces exactly as a
          health scan does. */}
      <div className={cx("flex flex-wrap items-center gap-1.5", isTree && "hidden")}>
        <Explain text="Shared with the org tree — who you're carrying, and how long since you last did">
          <span className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-violet-700 uppercase dark:text-violet-300">
            <PrayerIcon className="size-3.5" />
            Prayer
          </span>
        </Explain>
        {PRAYER_FILTER_VALUES.map((value) => {
          const active = prayerScan.includes(value);
          const color = PRAYER_COLOR[value];
          const count = [...records.values()].filter((r) =>
            matchesPrayer(r.prayer, [value])
          ).length;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => togglePrayerScan(value)}
              title={PRAYER_HINT[value]}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors touch:min-h-11 touch:px-3.5 ${
                active
                  ? "border-transparent font-medium text-white"
                  : "border-stone-300 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400"
              }`}
              style={active ? { backgroundColor: color } : undefined}
            >
              {!active && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              {PRAYER_LABEL[value]}
              <span
                className={`tabular-nums ${active ? "text-white/80" : "text-stone-500 dark:text-stone-400"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
        {prayerScan.length > 0 && (
          <Button size="sm" color="link-gray" onClick={() => setPrayerScan([])}>
            Clear
          </Button>
        )}
      </div>

      {/* Below lg the 52rem table would demand horizontal panning for every
          row, so the same lines render as stacked cards instead. */}
      <div className="flex flex-col gap-2 lg:hidden">
        {lines.map((line) =>
          line.kind === "group" ? (
            <button
              key={`mg-${line.key}`}
              type="button"
              onClick={() => toggleCollapsed(`group:${line.key}`)}
              className="flex min-h-11 items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-left text-xs font-medium text-stone-600 active:bg-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:active:bg-stone-800"
            >
              <span className="w-3 shrink-0 text-stone-500 dark:text-stone-400">
                {collapsed.has(`group:${line.key}`) ? "▸" : "▾"}
              </span>
              {line.color && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
              )}
              <span className="flex-1 truncate">{line.label}</span>
              <span className="tabular-nums text-stone-500">{line.count}</span>
              <span className="w-16 shrink-0">
                <HealthBar
                  roll={rollUpHealth(line.records.map((r) => r.health))}
                />
              </span>
            </button>
          ) : (
            <MobileRecordCard
              key={`m-${line.record.id}`}
              line={line}
              selected={
                line.record.kind === "team"
                  ? line.record.team?.id === selectedTeamId
                  : line.record.person?.id === selectedPersonId
              }
              onOpen={() =>
                line.record.kind === "team"
                  ? selectTeam(line.record.team!.id)
                  : selectPerson(line.record.person!.id)
              }
              onToggle={() => toggleCollapsed(line.record.id)}
              onHealth={(level) =>
                setHealth(
                  line.record.kind,
                  line.record.kind === "team"
                    ? line.record.team!.id
                    : line.record.person!.id,
                  level
                )
              }
            />
          )
        )}
        {rowCount === 0 && (
          <p className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            Nothing matches this view.
            {scanning && " Try clearing the scan."}
          </p>
        )}
      </div>

      <Card className="max-lg:hidden overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="sticky top-0 z-10 bg-white dark:bg-stone-900">
            <tr className="border-b border-stone-200 text-left text-xs text-stone-500 dark:text-stone-400 dark:border-stone-800">
              <Th
                onClick={() => sortBy("name")}
                sorted={sortedDir("name")}
                className="min-w-[16rem]"
              >
                Name
              </Th>
              {visible.map((c) => (
                <Th
                  key={c.key}
                  onClick={() => sortBy(c.key, c.descFirst)}
                  sorted={sortedDir(c.key)}
                >
                  {c.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) =>
              line.kind === "group" ? (
                <tr
                  key={`g-${line.key}`}
                  className="cursor-pointer border-b border-stone-100 bg-stone-50/70 dark:border-stone-800/60 dark:bg-stone-950/40"
                  onClick={() => toggleCollapsed(`group:${line.key}`)}
                >
                  <td
                    colSpan={visible.length + 1}
                    className="px-4 py-2 text-xs font-medium text-stone-500 dark:text-stone-400"
                  >
                    <span className="mr-1.5 inline-block w-3 text-stone-500 dark:text-stone-400">
                      {collapsed.has(`group:${line.key}`) ? "▸" : "▾"}
                    </span>
                    {line.color && (
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: line.color }}
                      />
                    )}
                    {line.label}
                    <span className="ml-2 text-stone-500 dark:text-stone-400 tabular-nums">
                      {line.count}
                    </span>
                    <span className="ml-3 inline-block w-24 align-middle">
                      <HealthBar
                        roll={rollUpHealth(line.records.map((r) => r.health))}
                      />
                    </span>
                  </td>
                </tr>
              ) : (
                <Row
                  key={line.record.id}
                  line={line}
                  columns={visible.map((c) => c.key)}
                  selected={
                    line.record.kind === "team"
                      ? line.record.team?.id === selectedTeamId
                      : line.record.person?.id === selectedPersonId
                  }
                  onOpen={() =>
                    line.record.kind === "team"
                      ? selectTeam(line.record.team!.id)
                      : selectPerson(line.record.person!.id)
                  }
                  onToggle={() => toggleCollapsed(line.record.id)}
                  onHealth={(level) =>
                    setHealth(
                      line.record.kind,
                      line.record.kind === "team"
                        ? line.record.team!.id
                        : line.record.person!.id,
                      level
                    )
                  }
                  onNote={(note) =>
                    setHealthNote(
                      line.record.kind,
                      line.record.kind === "team"
                        ? line.record.team!.id
                        : line.record.person!.id,
                      note
                    )
                  }
                />
              )
            )}
            {rowCount === 0 && (
              <tr>
                <td
                  colSpan={visible.length + 1}
                  className="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400"
                >
                  Nothing matches this view.
                  {scanning && " Try clearing the scan."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Row({
  line,
  columns,
  selected,
  onOpen,
  onToggle,
  onHealth,
  onNote,
}: {
  line: Extract<Line, { kind: "row" }>;
  columns: ColumnKey[];
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onHealth: (level: HealthLevel | null) => void;
  onNote: (note: string) => void;
}) {
  const { record, depth, hasChildren, expanded, context } = line;
  const isTeam = record.kind === "team";

  return (
    <tr
      className={`cursor-pointer border-b border-stone-100 last:border-0 hover:bg-stone-50 dark:border-stone-800/60 dark:hover:bg-stone-800/40 ${
        selected ? "bg-teal-50/70 dark:bg-teal-950/30" : ""
      } ${context ? "opacity-55" : ""}`}
      onClick={onOpen}
    >
      <td className="px-4 py-2">
        <div
          className="flex items-center gap-2"
          style={{ paddingLeft: depth * 18 }}
        >
          <button
            type="button"
            className={`w-3 shrink-0 text-stone-500 dark:text-stone-400 ${hasChildren ? "" : "invisible"}`}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? "▾" : "▸"}
          </button>
          {isTeam ? (
            <span
              className="h-6 w-6 shrink-0 rounded-md"
              style={{
                backgroundColor:
                  (record.domain?.color ?? record.capacity?.color ?? "#0D9488") +
                  "24",
                boxShadow: `inset 0 0 0 1.5px ${
                  record.domain?.color ?? record.capacity?.color ?? "#0D9488"
                }55`,
              }}
              aria-hidden
            />
          ) : (
            <Avatar
              name={record.name}
              photo={record.person?.photo}
              size={26}
              dimmed={record.coverage === 0}
            />
          )}
          <div className="min-w-0">
            <div
              className={`truncate ${isTeam ? "font-medium" : ""}`}
              title={record.name}
            >
              {record.name}
            </div>
            {record.role && (
              <div className="truncate text-[11px] text-stone-500 dark:text-stone-400" title={record.role}>
                {record.role}
              </div>
            )}
          </div>
        </div>
      </td>

      {columns.map((key) => (
        <td key={key} className="px-4 py-2 align-middle text-stone-500">
          <Cell
            column={key}
            record={record}
            onHealth={onHealth}
            onNote={onNote}
          />
        </td>
      ))}
    </tr>
  );
}

function Cell({
  column,
  record,
  onHealth,
  onNote,
}: {
  column: ColumnKey;
  record: OrgRecord;
  onHealth: (level: HealthLevel | null) => void;
  onNote: (note: string) => void;
}) {
  const dash = <span className="text-stone-400 dark:text-stone-600">—</span>;

  switch (column) {
    case "type":
      return <span className="text-xs">{record.typeLabel}</span>;
    case "under":
      return <span className="truncate text-xs">{record.underName}</span>;
    case "domain":
      return record.domain ? (
        <TintBadge color={record.domain.color}>{record.domain.name}</TintBadge>
      ) : (
        dash
      );
    case "capacity":
      return record.capacity ? (
        <TintBadge color={record.capacity.color}>{record.capacity.label}</TintBadge>
      ) : (
        dash
      );
    case "health":
      // A team whose level is averaged from its people is shown, but the
      // dropdown still writes the team's own call — editing here is making one.
      return (
        <div className="flex items-center gap-1">
          <HealthSelect
            size="sm"
            value={record.health?.level}
            onChange={onHealth}
            ariaLabel={`Health for ${record.name}`}
          />
          {record.derived && (
            <Explain text="Averaged from the people on it — I haven't rated the team itself">
              <span className="text-[10px] text-stone-500 dark:text-stone-400">
                ~{filterLabel(record.derived.level).toLowerCase()}
              </span>
            </Explain>
          )}
        </div>
      );
    case "prayer":
      // Read-only on purpose. Health is edited in place because rating a
      // whole org is a two-minute pass; ticking twelve names as prayed for in
      // ten seconds is the exact thing this dimension shouldn't become.
      return record.prayer ? <PrayerMark prayer={record.prayer} size="sm" /> : dash;
    case "note":
      return <NoteCell record={record} onNote={onNote} />;
    case "ready":
      return record.readiness ? (
        <ReadinessChip
          state={record.readiness.state}
          text={formatCountdown(record.readiness)}
          title={`${STATE_LABEL[record.readiness.state]} — ${record.readiness.headline}`}
          dot={false}
        />
      ) : (
        <span className="text-[11px] text-stone-400 dark:text-stone-600">
          untracked
        </span>
      );
    case "next":
      return record.nextDate ? (
        <span className="text-xs tabular-nums">{record.nextDate}</span>
      ) : (
        dash
      );
    case "read":
      return <span className="text-xs tabular-nums">{record.coverageLabel}</span>;
    case "size":
      return record.sizeLabel ? (
        <span className="text-xs">{record.sizeLabel}</span>
      ) : (
        dash
      );
    default:
      return dash;
  }
}

/** The one line of evidence behind a health call, editable in place. */
function NoteCell({
  record,
  onNote,
}: {
  record: OrgRecord;
  onNote: (note: string) => void;
}) {
  const [value, setValue] = useState(record.note ?? "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setValue(record.note ?? "");
  }, [record.note, focused]);

  // Without a level there's nothing to explain — rate it first.
  if (!record.health) {
    return <span className="text-stone-400 dark:text-stone-600">—</span>;
  }

  return (
    <input
      className="w-full min-w-[10rem] rounded-md bg-transparent px-1.5 py-1 text-xs outline-none hover:bg-stone-100 focus:bg-stone-100 dark:hover:bg-stone-800 dark:focus:bg-stone-800"
      placeholder="Why?"
      title={value || undefined}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if ((record.note ?? "") !== value.trim()) onNote(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setValue(record.note ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={`Health note for ${record.name}`}
    />
  );
}

function ColumnsMenu({
  open,
  onOpenChange,
  columns,
  onToggle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: Set<ColumnKey>;
  onToggle: (key: ColumnKey) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onOpenChange(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onOpenChange]);

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        color="secondary"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        Columns
        <span className="ml-1 text-stone-500 dark:text-stone-400 tabular-nums">{columns.size}</span>
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-xl border border-stone-200 bg-white p-1.5 shadow-lg dark:border-stone-800 dark:bg-stone-900">
          {COLUMNS.map((c) => (
            <label
              key={c.key}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              <Checkbox
                size="sm"
                isSelected={columns.has(c.key)}
                onChange={() => onToggle(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * One outline row as a card, for viewports where the wide table would need
 * horizontal panning. Carries the same identity, health call and readiness the
 * table's default columns show; the rest stays behind the desktop table.
 */
function MobileRecordCard({
  line,
  selected,
  onOpen,
  onToggle,
  onHealth,
}: {
  line: Extract<Line, { kind: "row" }>;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onHealth: (level: HealthLevel | null) => void;
}) {
  const { record, depth, hasChildren, expanded, context } = line;
  const isTeam = record.kind === "team";

  return (
    <div
      className={`rounded-xl border transition-colors ${
        selected
          ? "border-teal-300 bg-teal-50/70 dark:border-teal-800 dark:bg-teal-950/30"
          : "border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
      } ${context ? "opacity-60" : ""}`}
      // Indent tracks the outline, but capped so deep nesting still leaves
      // room for the name on a 320px screen.
      style={{ marginLeft: Math.min(depth, 3) * 12 }}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Negative margin keeps the 44px touch box from padding the row out. */}
        <button
          type="button"
          className={`-m-1 flex size-8 shrink-0 items-center justify-center text-stone-500 touch:-m-1.5 touch:size-11 dark:text-stone-400 ${
            hasChildren ? "" : "invisible"
          }`}
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={onToggle}
        >
          {expanded ? "▾" : "▸"}
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left touch:min-h-11"
        >
          {isTeam ? (
            <span
              className="size-8 shrink-0 rounded-md"
              style={{
                backgroundColor:
                  (record.domain?.color ?? record.capacity?.color ?? "#0D9488") +
                  "24",
                boxShadow: `inset 0 0 0 1.5px ${
                  record.domain?.color ?? record.capacity?.color ?? "#0D9488"
                }55`,
              }}
              aria-hidden
            />
          ) : (
            <Avatar
              name={record.name}
              photo={record.person?.photo}
              size={32}
              dimmed={record.coverage === 0}
            />
          )}
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-sm ${isTeam ? "font-medium" : ""}`}
            >
              {record.name}
            </span>
            <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
              {record.role || record.typeLabel}
              {record.underName ? ` · ${record.underName}` : ""}
            </span>
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 px-3 py-2 dark:border-stone-800">
        <HealthSelect
          size="sm"
          value={record.health?.level}
          onChange={onHealth}
          ariaLabel={`Health for ${record.name}`}
        />
        {record.readiness && (
          <ReadinessChip
            state={record.readiness.state}
            text={formatCountdown(record.readiness)}
            title={`${STATE_LABEL[record.readiness.state]} — ${record.readiness.headline}`}
            dot={false}
          />
        )}
        {/* On a phone this list *is* the tree, so the prayer mark has to be
            here too — otherwise the scan filters rows by something the rows
            never show. */}
        {record.prayer && <PrayerMark prayer={record.prayer} size="sm" />}
        {record.domain && (
          <TintBadge color={record.domain.color}>{record.domain.name}</TintBadge>
        )}
        {record.nextDate && (
          <span className="text-xs tabular-nums text-stone-500 dark:text-stone-400">
            Next {record.nextDate}
          </span>
        )}
      </div>

      {record.note && (
        <p className="border-t border-stone-100 px-3 py-2 text-xs text-stone-600 dark:border-stone-800 dark:text-stone-400">
          {record.note}
        </p>
      )}
    </div>
  );
}
