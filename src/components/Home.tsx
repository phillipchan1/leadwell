import { useMemo, type ReactNode } from "react";
import type { Domain, Team, TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  RHYTHM_LABEL,
  STATE_COLOR,
  STATE_LABEL,
  addDays,
  formatCountdown,
  isBehind,
  meetingSubjectName,
  meetingTitle,
  meetingsFor,
  readinessOf,
  todayISO,
  type Readiness,
} from "../lib/readiness";
import { boardLayout, curriculumOf } from "../lib/topics";
import { delegatedTeamIds } from "../lib/teams";
import { meetingSlugs } from "../lib/slugs";
import { SectionTitle, TintBadge } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * Home — the teams I lead, each with what its next meeting needs.
 *
 * ── Why teams and not a list of meetings ──────────────────────────────────
 * The teams are the stable part of the week; which meetings fall inside it is
 * not. A meetings-first page loses a monthly team for three weeks out of four,
 * and has nowhere to put the things a team needs from me that aren't on any
 * agenda. So a card per team, sorted by how soon it next meets — the urgency
 * of a calendar without its blind spots — with the meeting as the card's main
 * line and the team's next step and open follow-ups under it.
 *
 * ── Where the work happens ────────────────────────────────────────────────
 * Not here. Every card opens its meeting's agenda (`/m/<slug>`), which is
 * where planning — this week's or further out — actually gets done. Home is
 * the index that says which agenda to open, and nothing on it is a second
 * place to keep score.
 *
 * ── What isn't a card ─────────────────────────────────────────────────────
 * 1:1s are relationships, not teams, so they're a compact row of their own.
 * A delegated team (`Team.leaderId`) isn't mine to convene: I move it forward
 * by investing in its leader, so it rides along on that leader's 1:1 instead
 * of getting a card. Meetings I only attend, and the people I report to, sit
 * in their own quieter row — what they need from me is a thing to raise, not
 * a running order.
 */
export function Home() {
  const me = useStore((s) => s.me);
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const managers = useStore((s) => s.managers);
  const domains = useStore((s) => s.domains);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const followUps = useStore((s) => s.followUps);
  const teamActions = useStore((s) => s.teamActions);
  const selectMeeting = useStore((s) => s.selectMeeting);
  const selectTeam = useStore((s) => s.selectTeam);
  const openModal = useStore((s) => s.openModal);
  const today = todayISO();

  const model = useMemo(() => {
    const data = { meetings, sessions, topics };
    const readOf = (m: TrackedMeeting) => readinessOf(m, data, today);
    const delegated = delegatedTeamIds(teams);
    const placed = new Set<string>();

    const led = teams
      .filter((t) => t.direction !== "up" && !delegated.has(t.id))
      .map((team) => {
        const own = meetingsFor(meetings, "team", team.id).sort(
          (a, b) => roleRank(a) - roleRank(b)
        );
        const primary = own.find((m) => m.role !== "attend");
        own.forEach((m) => m.role !== "attend" && placed.add(m.id));
        return {
          team,
          primary,
          others: own.filter((m) => m !== primary && m.role !== "attend"),
          readiness: primary ? readOf(primary) : null,
        };
      })
      .sort((a, b) => urgency(a.readiness) - urgency(b.readiness));

    const leaderOf = new Map<string, Team[]>();
    for (const t of teams) {
      if (!t.leaderId) continue;
      leaderOf.set(t.leaderId, [...(leaderOf.get(t.leaderId) ?? []), t]);
    }

    const oneOnOnes = meetings
      .filter((m) => m.subjectKind === "person" && m.role !== "attend")
      .map((m) => {
        placed.add(m.id);
        return {
          meeting: m,
          readiness: readOf(m),
          leads: leaderOf.get(m.subjectId) ?? [],
        };
      })
      .sort((a, b) => urgency(a.readiness) - urgency(b.readiness));

    // Everything else I'm in: meetings I attend, the people I report to, the
    // teams above me. Whatever didn't land on a card or in the 1:1s.
    const partOf = meetings
      .filter((m) => !placed.has(m.id))
      .map((m) => ({ meeting: m, readiness: readOf(m) }))
      .sort((a, b) => urgency(a.readiness) - urgency(b.readiness));

    return { led, oneOnOnes, partOf };
  }, [meetings, sessions, topics, teams, today]);

  const names = { people, teams, managers };
  const titleOf = (m: TrackedMeeting) =>
    meetingTitle(m, meetingSubjectName(m, names));
  const slugs = meetingSlugs({ meetings, people, teams, managers });

  const withMeeting = model.led.filter((r) => r.readiness);
  const needYou = withMeeting.filter((r) => isBehind(r.readiness!.state)).length;
  const firstName = me.name.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-display-xs font-semibold tracking-tight text-primary">
            {greeting()}
            {firstName && `, ${firstName}`}
          </h2>
          <p className="mt-1 text-sm text-quaternary">
            {model.led.length} team{model.led.length === 1 ? "" : "s"} you lead
            {withMeeting.length > 0 &&
              (needYou === 0
                ? " · every next meeting is in hand"
                : ` · ${needYou} need${needYou === 1 ? "s" : ""} you before ${needYou === 1 ? "its" : "their"} next meeting`)}
          </p>
        </div>
      </header>

      <WeekStrip
        today={today}
        meetings={meetings}
        readOf={(m) => readinessOf(m, { meetings, sessions, topics }, today)}
        titleOf={(m) => shortTitle(m, names)}
        onOpen={(id) => selectMeeting(id)}
      />

      {model.led.length === 0 ? (
        <div className="rounded-xl border border-dashed border-primary px-4 py-6 text-center">
          <p className="text-sm text-quaternary">
            Add the teams you lead, and each one's next meeting shows up here.
          </p>
          <Button
            size="sm"
            className="mt-3"
            onClick={() => openModal({ kind: "team" })}
          >
            Add a team
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {model.led.map((row) => (
            <TeamCard
              key={row.team.id}
              team={row.team}
              parent={teams.find((t) => t.id === row.team.parentId)}
              domain={domains.find((d) => d.id === row.team.domainId)}
              meeting={row.primary}
              others={row.others}
              readiness={row.readiness}
              title={row.primary ? titleOf(row.primary) : ""}
              slug={row.primary ? slugs.slugById.get(row.primary.id) : undefined}
              nextStep={
                teamActions.find((a) => a.teamId === row.team.id && !a.done)?.text
              }
              openFollowUps={
                followUps.filter(
                  (f) =>
                    f.status === "open" &&
                    ((f.subjectKind === "team" && f.subjectId === row.team.id) ||
                      (row.primary && f.meetingId === row.primary.id))
                ).length
              }
              onOpenMeeting={(id) => selectMeeting(id)}
              onOpenTeam={() => selectTeam(row.team.id)}
              titleOf={titleOf}
            />
          ))}
        </ul>
      )}

      {model.oneOnOnes.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>1:1s</SectionTitle>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {model.oneOnOnes.map(({ meeting, readiness, leads }) => (
              <CompactRow
                key={meeting.id}
                title={meetingSubjectName(meeting, names) ?? titleOf(meeting)}
                sub={
                  leads.length
                    ? `Leads ${leads.map((t) => t.name).join(", ")}`
                    : RHYTHM_LABEL[meeting.rhythm]
                }
                readiness={readiness}
                onOpen={() => selectMeeting(meeting.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {model.partOf.length > 0 && (
        <section className="space-y-2">
          <SectionTitle>Meetings I'm part of</SectionTitle>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {model.partOf.map(({ meeting, readiness }) => (
              <CompactRow
                key={meeting.id}
                title={titleOf(meeting)}
                sub={
                  meeting.name
                    ? meetingSubjectName(meeting, names) ?? RHYTHM_LABEL[meeting.rhythm]
                    : RHYTHM_LABEL[meeting.rhythm]
                }
                readiness={readiness}
                onOpen={() => selectMeeting(meeting.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TeamCard({
  team,
  parent,
  domain,
  meeting,
  others,
  readiness,
  title,
  slug,
  nextStep,
  openFollowUps,
  onOpenMeeting,
  onOpenTeam,
  titleOf,
}: {
  team: Team;
  parent?: Team;
  domain?: Domain;
  meeting?: TrackedMeeting;
  others: TrackedMeeting[];
  readiness: Readiness | null;
  title: string;
  slug?: string;
  nextStep?: string;
  openFollowUps: number;
  onOpenMeeting: (id: string) => void;
  onOpenTeam: () => void;
  titleOf: (m: TrackedMeeting) => string;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const health = team.health;

  // The next occurrence's running order, band by band — the one-glance answer
  // to "is Monday planned?".
  const bands = useMemo(() => {
    if (!meeting) return [];
    const next = boardLayout(meeting, sessions, topics, todayISO(), {
      ahead: 1,
    }).weeks.find((w) => !w.slot.past);
    if (!next) return [];
    const curriculum = curriculumOf(meeting);
    if (!curriculum.length) {
      return [{ id: "all", label: "Topics", count: next.topics.length }];
    }
    return next.cells
      .filter((c) => c.slotId || c.topics.length > 0)
      .map((c) => ({ id: c.key, label: c.label, count: c.topics.length }));
  }, [meeting, sessions, topics]);

  const color = readiness ? STATE_COLOR[readiness.state] : undefined;
  // An empty band is only worth amber once prep matters. A month out, an
  // empty Training slot is just the future not being written yet.
  const flagEmpty = Boolean(
    readiness && (readiness.windowOpen || isBehind(readiness.state))
  );

  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-secondary bg-primary shadow-xs">
      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2.5">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpenTeam}
            className="max-w-full truncate text-left text-md font-semibold text-primary hover:underline"
          >
            {team.name}
          </button>
          <div className="flex flex-wrap items-center gap-x-1.5 text-caption text-quaternary">
            {domain && (
              <span className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="size-1.5 rounded-sm"
                  style={{ backgroundColor: domain.color }}
                />
                {domain.name}
              </span>
            )}
            {parent && <span>· in {parent.name}</span>}
            {meeting && <span>· {RHYTHM_LABEL[meeting.rhythm].toLowerCase()}</span>}
          </div>
        </div>
        {readiness && (
          <TintBadge color={color!}>{STATE_LABEL[readiness.state]}</TintBadge>
        )}
      </div>

      {meeting && readiness ? (
        <button
          type="button"
          onClick={() => onOpenMeeting(meeting.id)}
          className="mx-2.5 rounded-lg border border-secondary bg-secondary px-3 py-2.5 text-left transition-colors hover:border-teal-400 dark:hover:border-teal-700"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <StateDot readiness={readiness} />
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <span
              className="shrink-0 font-mono text-caption tabular-nums"
              style={{ color }}
            >
              {formatCountdown(readiness)}
            </span>
          </div>
          {bands.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bands.map((b) => (
                <span
                  key={b.id}
                  className={cx(
                    "rounded-md px-1.5 py-0.5 text-caption tabular-nums",
                    b.count === 0 && flagEmpty
                      ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200 ring-inset dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-900"
                      : "bg-primary text-tertiary ring-1 ring-secondary ring-inset"
                  )}
                >
                  {b.label} {b.count}
                </span>
              ))}
            </div>
          )}
          {readiness.headline && (
            <p className="mt-1.5 truncate text-caption text-quaternary">
              {readiness.headline}
            </p>
          )}
        </button>
      ) : (
        <div className="mx-2.5 rounded-lg border border-dashed border-primary px-3 py-2.5 text-caption text-quaternary">
          {team.noMeeting ? (
            "No standing meeting — by choice."
          ) : (
            <>
              No meeting tracked yet.{" "}
              <Button size="sm" color="link-color" onClick={onOpenTeam}>
                Set one up
              </Button>
            </>
          )}
        </div>
      )}

      <dl className="grid gap-1 px-4 pt-2.5 pb-3 text-caption">
        <Fact label="Next step">
          {nextStep ?? <span className="text-quaternary">None set</span>}
        </Fact>
        {openFollowUps > 0 && (
          <Fact label="Follow-ups">{openFollowUps} open</Fact>
        )}
        {health && (health.level === "watch" || health.level === "strained" || health.level === "critical") && (
          <Fact label="Health">
            <span className="capitalize">{health.level}</span>
            {health.note && <span className="text-quaternary"> — {health.note}</span>}
          </Fact>
        )}
        {others.length > 0 && (
          <Fact label="Also">
            {others.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ", "}
                <Button size="sm" color="link-gray" onClick={() => onOpenMeeting(m.id)}>
                  {titleOf(m)}
                </Button>
              </span>
            ))}
          </Fact>
        )}
      </dl>

      {meeting && slug && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-secondary px-4 py-2">
          <span className="truncate font-mono text-caption text-quaternary">
            /m/{slug}
          </span>
          <Button size="sm" color="link-color" onClick={() => onOpenMeeting(meeting.id)}>
            Open agenda
          </Button>
        </div>
      )}
    </li>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="w-18 shrink-0 font-semibold tracking-wide text-stone-400 uppercase dark:text-stone-500">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-secondary">{children}</dd>
    </div>
  );
}

function CompactRow({
  title,
  sub,
  readiness,
  onOpen,
}: {
  title: string;
  sub?: string;
  readiness: Readiness;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-lg border border-secondary bg-primary px-3 py-2 text-left transition-colors hover:border-teal-400 touch:min-h-11 dark:hover:border-teal-700"
      >
        <StateDot readiness={readiness} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-primary">
            {title}
          </span>
          {sub && (
            <span className="block truncate text-caption text-quaternary">{sub}</span>
          )}
        </span>
        <span
          className="shrink-0 font-mono text-caption tabular-nums"
          style={{ color: STATE_COLOR[readiness.state] }}
        >
          {formatCountdown(readiness)}
        </span>
      </button>
    </li>
  );
}

/**
 * The next seven days, one cell each, with whatever meets on them. The time
 * view a team-first page otherwise lacks.
 */
function WeekStrip({
  today,
  meetings,
  readOf,
  titleOf,
  onOpen,
}: {
  today: string;
  meetings: TrackedMeeting[];
  readOf: (m: TrackedMeeting) => Readiness;
  titleOf: (m: TrackedMeeting) => string;
  onOpen: (id: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const byDay = new Map<string, { meeting: TrackedMeeting; readiness: Readiness }[]>();
  for (const meeting of meetings) {
    const readiness = readOf(meeting);
    const date = readiness.nextDate;
    if (!date || date < today || date > days[6]) continue;
    byDay.set(date, [...(byDay.get(date) ?? []), { meeting, readiness }]);
  }

  return (
    <ol className="grid grid-cols-4 gap-1.5 sm:grid-cols-7" aria-label="The next seven days">
      {days.map((day) => {
        const items = byDay.get(day) ?? [];
        return (
          <li
            key={day}
            className={cx(
              "min-h-16 min-w-0 rounded-lg border px-2 py-1.5",
              day === today
                ? "border-teal-400 bg-primary dark:border-teal-700"
                : "border-secondary bg-secondary"
            )}
          >
            <div className="text-caption font-semibold text-quaternary tabular-nums">
              {dayLabel(day)}
            </div>
            <ul className="mt-1 space-y-0.5">
              {items.map(({ meeting, readiness }) => (
                <li key={meeting.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(meeting.id)}
                    className="flex w-full min-w-0 items-center gap-1.5 rounded px-0.5 text-left text-xs text-secondary hover:bg-tertiary"
                    title={`${titleOf(meeting)} · ${STATE_LABEL[readiness.state]}`}
                  >
                    <StateDot readiness={readiness} />
                    <span className="truncate">{titleOf(meeting)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function StateDot({ readiness }: { readiness: Readiness }) {
  const color = STATE_COLOR[readiness.state];
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{
        // Drifting is drawn hollow so it reads as absence, not alarm — the
        // same treatment the meetings table and the prep panel give it.
        backgroundColor: readiness.state === "drifting" ? "transparent" : color,
        boxShadow:
          readiness.state === "drifting" ? `inset 0 0 0 2px ${color}` : undefined,
      }}
    />
  );
}

/** I convene it, then everything else — a team's own meeting before one I sit in. */
function roleRank(m: TrackedMeeting): number {
  return m.role === "attend" ? 1 : 0;
}

/**
 * Sort key: what's late or drifting first, then by how soon it meets, then
 * teams with no meeting at all. Days, so the ordering reads like a calendar.
 */
function urgency(r: Readiness | null): number {
  if (!r) return Number.MAX_SAFE_INTEGER;
  if (r.state === "drifting" || r.state === "loose_end") return -1e6 + (r.daysUntil ?? 0);
  return r.daysUntil ?? 1e6;
}

/** A week cell has room for "Staff meeting" or "Sarah", not "Meeting · Sarah Kim". */
function shortTitle(
  m: TrackedMeeting,
  names: Parameters<typeof meetingSubjectName>[1]
): string {
  if (m.name?.trim()) return m.name.trim();
  const subject = meetingSubjectName(m, names);
  return subject?.split(/\s+/)[0] ?? "Meeting";
}

/** "Fri 9". Built by hand: locales disagree on which comes first. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = d.toLocaleDateString(undefined, {
    weekday: "short",
    timeZone: "UTC",
  });
  return `${weekday} ${d.getUTCDate()}`;
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
