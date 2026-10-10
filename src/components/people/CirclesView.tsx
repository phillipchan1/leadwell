import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/store/useStore";
import type { Health, HealthLevel, Prayer } from "@/types";
import { layoutCircles, type CircleNode } from "@/lib/circles";
import { HEALTH_COLOR, HEALTH_LABEL, HEALTH_LEVELS, matchesHealth } from "@/lib/health";
import {
  STATE_COLOR,
  STATE_LABEL,
  formatCountdown,
  isBehind,
  readinessFor,
  type Readiness,
} from "@/lib/readiness";
import { PRAYER_COLOR, PRAYER_LABEL, matchesPrayer, prayerState, shortSincePrayed } from "@/lib/prayer";
import type { TreeMode } from "@/lib/treeMode";
import { Avatar } from "../Avatar";
import { HealthMeter, PrayerFlame, RhythmRing, STATE_TEXT } from "../brand/glyphs";
import { cx } from "@/utils/cx";

/*
 * The Circles view of People. You at the center, everyone you lead around
 * you, the leaders you answer to above. The lens decides what the rings say:
 * Assess colors them by your read, Prep by readiness, Pray by who you're
 * carrying, Plan leaves them quiet so the shape itself is the point.
 */

type Facts = {
  health?: Health;
  prayer?: Prayer;
  reading: Readiness | null;
  photo?: string;
};

export function CirclesView() {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const domains = useStore((s) => s.domains);
  const me = useStore((s) => s.me);
  const scopeId = useStore((s) => s.treeDomainId);
  const lens = useStore((s) => s.treeMode);
  const healthScan = useStore((s) => s.healthScan);
  const prayerScan = useStore((s) => s.prayerScan);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectedTeamId = useStore((s) => s.selectedTeamId);
  const selectedManagerId = useStore((s) => s.selectedManagerId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);
  const selectMe = useStore((s) => s.selectMe);

  const layout = useMemo(
    () => layoutCircles({ people, teams, managers }, scopeId),
    [people, teams, managers, scopeId]
  );

  const facts = useMemo(() => {
    const data = { meetings, sessions, topics };
    const out = new Map<string, Facts>();
    for (const n of layout.nodes) {
      if (n.kind === "person") {
        const p = people.find((x) => x.id === n.id);
        out.set(n.key, { health: p?.health, prayer: p?.prayer, photo: p?.photo, reading: readinessFor("person", n.id, data) });
      } else if (n.kind === "team") {
        const t = teams.find((x) => x.id === n.id);
        out.set(n.key, { health: t?.health, prayer: t?.prayer, reading: readinessFor("team", n.id, data) });
      } else if (n.kind === "manager") {
        const m = managers.find((x) => x.id === n.id);
        out.set(n.key, { prayer: m?.prayer, photo: m?.photo, reading: readinessFor("manager", n.id, data) });
      }
    }
    return out;
  }, [layout, people, teams, managers, meetings, sessions, topics]);

  // Fit the drawing to the column: scale down to fit, never up past 1.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapW, setWrapW] = useState(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWrapW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // On a phone this is a glance at the shape, so it fits rather than scrolls.
  const scale = wrapW ? Math.max(0.34, Math.min(1, wrapW / layout.width)) : 1;
  const offset = Math.max(0, (wrapW - layout.width * scale) / 2);

  const selectedKey = selectedPersonId
    ? `person:${selectedPersonId}`
    : selectedManagerId
      ? `manager:${selectedManagerId}`
      : selectedTeamId
        ? `team:${selectedTeamId}`
        : null;

  const open = (n: CircleNode) =>
    n.kind === "person"
      ? selectPerson(n.id)
      : n.kind === "team"
        ? selectTeam(n.id)
        : n.kind === "manager"
          ? selectManager(n.id)
          : selectMe(true);

  const dimmed = (n: CircleNode) => {
    const f = facts.get(n.key);
    if (!f) return false;
    if (lens === "assess" && healthScan.length && n.kind !== "manager") return !matchesHealth(f.health, healthScan);
    if (lens === "pray" && prayerScan.length) return !matchesPrayer(f.prayer, prayerScan);
    return false;
  };

  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const center = byKey.get("me")!;
  const domainColor = (id?: string) => domains.find((d) => d.id === id)?.color;
  const empty = layout.nodes.length <= 1;

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div
        ref={wrapRef}
        className="relative min-w-0 flex-[999_1_560px] overflow-x-auto overflow-y-hidden rounded-[18px] border border-secondary bg-primary"
        style={{ height: layout.height * scale }}
      >
        <div
          className="absolute top-0"
          style={{
            left: offset,
            width: layout.width,
            height: layout.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <svg width={layout.width} height={layout.height} className="absolute inset-0" aria-hidden="true">
            {/* Looking down into the well: each ring a shade deeper. */}
            {layout.radii.slice(0, 2).reverse().map((r, i, arr) => (
              <circle
                key={r}
                cx={layout.cx}
                cy={layout.cy}
                r={r + 40}
                className={i === arr.length - 1 ? "fill-stone-100 dark:fill-stone-950" : "fill-stone-50 dark:fill-stone-900/40"}
              />
            ))}
            {layout.radii.map((r, i) => (
              <circle
                key={`ring-${r}`}
                cx={layout.cx}
                cy={layout.cy}
                r={r}
                fill="none"
                strokeWidth="1"
                strokeDasharray={i === 0 ? undefined : "2 5"}
                className="stroke-stone-300 dark:stroke-stone-700"
              />
            ))}
            {layout.aboveY !== null && (
              <path
                d={`M${Math.min(...layout.nodes.filter((n) => n.ring === "above").map((n) => n.x))} ${layout.aboveY + 22}V${layout.aboveY + 38}H${Math.max(...layout.nodes.filter((n) => n.ring === "above").map((n) => n.x))}V${layout.aboveY + 22}M${layout.cx} ${layout.aboveY + 38}V${layout.cy - 40}`}
                fill="none"
                strokeWidth="1.5"
                className="stroke-stone-300 dark:stroke-stone-700"
              />
            )}
            {layout.nodes
              .filter((n) => n.parentKey && n.ring !== "above")
              .map((n) => {
                const p = byKey.get(n.parentKey!)!;
                return (
                  <line
                    key={`spoke-${n.key}`}
                    x1={p.x}
                    y1={p.y}
                    x2={n.x}
                    y2={n.y}
                    strokeWidth="1.5"
                    className={cx("stroke-stone-300 dark:stroke-stone-700", dimmed(n) && "opacity-30")}
                  />
                );
              })}
          </svg>

          {layout.aboveY !== null && (
            <span className="eyebrow absolute top-5 left-6">Above you</span>
          )}

          {layout.nodes.map((n) =>
            n.kind === "me" ? (
              <button
                key="me"
                type="button"
                onClick={() => open(n)}
                aria-label="You — open your profile"
                className="absolute flex size-[72px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-leather font-serif text-[22px] text-leather-fg shadow-[0_0_0_4px_var(--color-bg-primary),0_0_0_5px_var(--color-gilt)]"
                style={{ left: center.x, top: center.y }}
              >
                {me.photo ? (
                  <img src={me.photo} alt="" className="size-full rounded-full object-cover" />
                ) : (
                  me.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "Me"
                )}
              </button>
            ) : n.kind === "team" || n.ring === "above" ? (
              <PillNode
                key={n.key}
                node={n}
                facts={facts.get(n.key)}
                lens={lens}
                square={n.kind === "team" ? domainColor(n.domainId) : undefined}
                selected={selectedKey === n.key}
                dimmed={dimmed(n)}
                onOpen={() => open(n)}
              />
            ) : (
              <PersonNode
                key={n.key}
                node={n}
                facts={facts.get(n.key)}
                lens={lens}
                selected={selectedKey === n.key}
                dimmed={dimmed(n)}
                onOpen={() => open(n)}
              />
            )
          )}
          {empty && (
            <p className="absolute text-center text-[14px] text-tertiary" style={{ left: 0, right: 0, top: center.y + 60 }}>
              No one here yet. Add a team or a person with Capture.
            </p>
          )}
        </div>
      </div>

      <LensRail lens={lens} layout={layout.nodes} facts={facts} onOpen={open} />
    </div>
  );
}

// ── Nodes ──────────────────────────────────────────────────────────────────

/** The color a lens paints a node's ring, or null for no ring, "dashed" for unread. */
function lensRing(lens: TreeMode, f: Facts | undefined, kind: CircleNode["kind"]): string | "dashed" | null {
  if (!f) return null;
  if (lens === "assess") {
    if (kind === "manager") return null;
    return f.health ? HEALTH_COLOR[f.health.level] : "dashed";
  }
  if (lens === "prep") return f.reading ? STATE_COLOR[f.reading.state] : null;
  if (lens === "pray") return f.prayer ? PRAYER_COLOR[prayerState(f.prayer)] : null;
  return null;
}

function PersonNode({
  node,
  facts,
  lens,
  selected,
  dimmed,
  onOpen,
}: {
  node: CircleNode;
  facts?: Facts;
  lens: TreeMode;
  selected: boolean;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const ring = lensRing(lens, facts, node.kind);
  const label = [
    node.name,
    lens === "assess" && facts?.health ? HEALTH_LABEL[facts.health.level] : lens === "assess" ? "not rated" : null,
    lens === "prep" && facts?.reading ? STATE_LABEL[facts.reading.state] : null,
    lens === "pray" && facts?.prayer ? PRAYER_LABEL[prayerState(facts.prayer)] : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-pressed={selected}
      className={cx(
        "group absolute flex w-[132px] -translate-x-1/2 flex-col items-center gap-1.5 transition-opacity",
        dimmed && "opacity-30"
      )}
      style={{ left: node.x, top: node.y - 20 }}
    >
      <span
        className={cx(
          "relative rounded-full",
          ring === "dashed" && "outline-2 outline-offset-[3px] outline-stone-300 outline-dashed dark:outline-stone-600",
          selected && "ring-2 ring-teal-500 ring-offset-4 ring-offset-[var(--color-bg-primary)]"
        )}
        style={
          ring && ring !== "dashed"
            ? { boxShadow: `0 0 0 3px var(--color-bg-primary), 0 0 0 6px ${ring}` }
            : undefined
        }
      >
        <Avatar name={node.name} photo={facts?.photo} size={40} />
        {lens === "pray" && facts?.prayer && (
          <span className="absolute -right-1.5 -bottom-1.5 flex size-5 items-center justify-center rounded-full bg-primary">
            <PrayerFlame state={prayerState(facts.prayer)} size={13} />
          </span>
        )}
      </span>
      <span className="max-w-full truncate font-serif text-[14.5px] leading-[18px] text-primary group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">
        {node.name}
      </span>
      {lens === "prep" && facts?.reading && (
        <span className={cx("font-mono text-[10.5px] leading-3 uppercase", STATE_TEXT[facts.reading.state])}>
          {formatCountdown(facts.reading)}
        </span>
      )}
    </button>
  );
}

function PillNode({
  node,
  facts,
  lens,
  square,
  selected,
  dimmed,
  onOpen,
}: {
  node: CircleNode;
  facts?: Facts;
  lens: TreeMode;
  square?: string;
  selected: boolean;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const level = facts?.health?.level;
  const weak = lens === "assess" && (level === "strained" || level === "critical");
  const unread = node.ring === "above" && lens === "assess" && node.kind === "person" && !facts?.health;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={selected}
      className={cx(
        "absolute flex h-[38px] max-w-[220px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-[10px] border px-3 font-serif text-[15px] whitespace-nowrap transition-[opacity,box-shadow] hover:shadow-md",
        weak
          ? level === "critical"
            ? "border-cond-critical bg-cond-critical-soft"
            : "border-cond-strained bg-cond-strained-soft"
          : "border-secondary bg-primary",
        unread && "border-dashed border-primary",
        selected && "ring-2 ring-teal-500 ring-offset-2 ring-offset-[var(--color-bg-primary)]",
        dimmed && "opacity-30"
      )}
      style={{ left: node.x, top: node.y }}
    >
      {square && <i className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: square }} aria-hidden="true" />}
      <span className="truncate">{node.name}</span>
      {lens === "assess" && node.kind !== "manager" && (
        <HealthMeter level={level} size={16} label={level ? HEALTH_LABEL[level] : "Not rated"} />
      )}
      {lens === "prep" && facts?.reading && (
        <RhythmRing reading={facts.reading} size={16} label={STATE_LABEL[facts.reading.state]} />
      )}
      {lens === "pray" && facts?.prayer && (
        <PrayerFlame state={prayerState(facts.prayer)} size={14} label={PRAYER_LABEL[prayerState(facts.prayer)]} />
      )}
    </button>
  );
}

// ── The rail: what the lens surfaces ───────────────────────────────────────

function LensRail({
  lens,
  layout,
  facts,
  onOpen,
}: {
  lens: TreeMode;
  layout: CircleNode[];
  facts: Map<string, Facts>;
  onOpen: (n: CircleNode) => void;
}) {
  const setTab = useStore((s) => s.setTab);
  const openModal = useStore((s) => s.openModal);
  const teamActions = useStore((s) => s.teamActions);
  const teams = useStore((s) => s.teams);
  const setHealthScan = useStore((s) => s.setHealthScan);
  const healthScan = useStore((s) => s.healthScan);
  const nodes = layout.filter((n) => n.kind !== "me");
  const f = (n: CircleNode) => facts.get(n.key);

  let body: React.ReactNode = null;

  if (lens === "assess") {
    const rated = nodes.filter((n) => n.kind !== "manager" && f(n)?.health);
    const weakest = rated
      .filter((n) => ["watch", "strained", "critical"].includes(f(n)!.health!.level))
      .sort((a, b) => HEALTH_LEVELS.indexOf(f(b)!.health!.level) - HEALTH_LEVELS.indexOf(f(a)!.health!.level));
    const unrated = nodes.filter((n) => n.kind !== "manager" && n.ring !== "above" && !f(n)?.health);
    body = (
      <>
        <RailSection title="Weakest first">
          {weakest.length === 0 ? (
            <Quiet>Nobody is at watch or below.</Quiet>
          ) : (
            weakest.slice(0, 6).map((n) => (
              <RailRow key={n.key} onClick={() => onOpen(n)} name={n.name} note={[HEALTH_LABEL[f(n)!.health!.level], f(n)!.health!.note].filter(Boolean).join(" · ")}>
                <HealthMeter level={f(n)!.health!.level} />
              </RailRow>
            ))
          )}
        </RailSection>
        <ScanChips<HealthLevel>
          values={HEALTH_LEVELS}
          active={healthScan.filter((x): x is HealthLevel => x !== "unrated")}
          color={(l) => HEALTH_COLOR[l]}
          label={(l) => HEALTH_LABEL[l]}
          count={(l) => rated.filter((n) => f(n)!.health!.level === l).length}
          onToggle={(l) => setHealthScan(healthScan.includes(l) ? healthScan.filter((x) => x !== l) : [...healthScan, l])}
        />
        {unrated.length > 0 && (
          <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-primary px-5 py-4">
            <h3 className="text-[15px] font-semibold">{unrated.length} without a read</h3>
            <p className="text-[13.5px] leading-5 text-secondary">They show as dashed rings until you rate them. The list rates a whole org in one pass.</p>
            <button type="button" onClick={() => setTab("table")} className="self-start text-[13px] font-semibold text-teal-700 dark:text-teal-400">
              Rate them in the list
            </button>
          </section>
        )}
      </>
    );
  } else if (lens === "prep") {
    const behind = nodes
      .filter((n) => f(n)?.reading && isBehind(f(n)!.reading!.state))
      .sort((a, b) => (f(a)!.reading!.daysUntil ?? -99) - (f(b)!.reading!.daysUntil ?? -99));
    body = (
      <>
        <RailSection title="Owed before you walk in">
          {behind.length === 0 ? (
            <Quiet>Everyone you meet with is ready or resting.</Quiet>
          ) : (
            behind.slice(0, 7).map((n) => (
              <RailRow key={n.key} onClick={() => onOpen(n)} name={n.name} note={`${STATE_LABEL[f(n)!.reading!.state]} · ${formatCountdown(f(n)!.reading!)}`}>
                <RhythmRing reading={f(n)!.reading} size={18} />
              </RailRow>
            ))
          )}
        </RailSection>
        <button type="button" onClick={() => openModal({ kind: "triage" })} className="self-start text-[13px] font-semibold text-teal-700 dark:text-teal-400">
          Decide who you meet with
        </button>
      </>
    );
  } else if (lens === "pray") {
    const carried = nodes.filter((n) => f(n)?.prayer);
    const quiet = carried.filter((n) => prayerState(f(n)!.prayer) === "cold");
    body = (
      <>
        <RailSection title={quiet.length ? "Gone quiet" : "Carrying"}>
          {carried.length === 0 ? (
            <Quiet>You aren't carrying anyone in this view.</Quiet>
          ) : (
            (quiet.length ? quiet : carried).slice(0, 7).map((n) => (
              <RailRow key={n.key} onClick={() => onOpen(n)} name={n.name} note={f(n)!.prayer!.focus ?? shortSincePrayed(f(n)!.prayer)} italic>
                <PrayerFlame state={prayerState(f(n)!.prayer)} size={15} />
              </RailRow>
            ))
          )}
        </RailSection>
        <button type="button" onClick={() => setTab("prayer")} className="self-start text-[13px] font-semibold text-vesper">
          Open Prayer
        </button>
      </>
    );
  } else {
    const teamNodes = nodes.filter((n) => n.kind === "team");
    body = (
      <RailSection title="What's next for each team">
        {teamNodes.length === 0 ? (
          <Quiet>No teams in this view.</Quiet>
        ) : (
          teamNodes.slice(0, 8).map((n) => {
            const next = teamActions.find((a) => a.teamId === n.id && !a.done);
            const purpose = teams.find((t) => t.id === n.id)?.purpose;
            return (
              <RailRow key={n.key} onClick={() => onOpen(n)} name={n.name} note={next?.text ?? purpose ?? "No next step yet"}>
                <i className="size-2 rounded-[2px] bg-stone-300 dark:bg-stone-600" aria-hidden="true" />
              </RailRow>
            );
          })
        )}
      </RailSection>
    );
  }

  return (
    <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
      {body}
      <p className="px-1 text-[12.5px] leading-[18px] text-quaternary">
        You sit at the center. Teams and direct reports form the first ring and their people the second. The leaders you answer to sit above you.
      </p>
    </aside>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-secondary bg-primary px-5 pt-4 pb-1.5">
      <h3 className="pb-2 text-[15px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function RailRow({
  name,
  note,
  italic,
  onClick,
  children,
}: {
  name: string;
  note?: string;
  italic?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 border-t border-secondary py-2.5 text-left">
      <span className="flex w-5 shrink-0 justify-center">{children}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-serif text-[16px]">{name}</span>
        {note && <span className={cx("line-clamp-2 text-[12.5px] leading-[17px] text-quaternary", italic && "font-serif text-[14px] italic")}>{note}</span>}
      </span>
    </button>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="border-t border-secondary py-3 text-[13.5px] text-tertiary">{children}</p>;
}

function ScanChips<T extends string>({
  values,
  active,
  color,
  label,
  count,
  onToggle,
}: {
  values: T[];
  active: T[];
  color: (v: T) => string;
  label: (v: T) => string;
  count: (v: T) => number;
  onToggle: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dim everything but">
      {values.map((v) => {
        const on = active.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(v)}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors touch:min-h-11",
              on ? "border-primary bg-tertiary font-semibold" : "border-secondary bg-primary hover:border-primary"
            )}
          >
            <i className="size-2 rounded-full" style={{ backgroundColor: color(v) }} aria-hidden="true" />
            {label(v)}
            <span className="font-mono text-[11px] text-quaternary">{count(v)}</span>
          </button>
        );
      })}
    </div>
  );
}
