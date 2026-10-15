import { useMemo } from "react";
import type { Team, TrackedMeeting } from "@/types";
import { useStore } from "@/store/useStore";
import {
  RHYTHM_LABEL,
  STATE_LABEL,
  formatCountdown,
  isBehind,
  meetingSubjectName,
  meetingTitle,
  meetingsFor,
  readinessOf,
  todayISO,
  type Readiness,
} from "@/lib/readiness";
import { boardLayout, curriculumOf, slotDotClass } from "@/lib/topics";
import { delegatedTeamIds } from "@/lib/teams";
import { meetingSlugs } from "@/lib/slugs";
import { HEALTH_LABEL } from "@/lib/health";
import { Avatar } from "../Avatar";
import { RhythmRing, STATE_TEXT } from "../brand/glyphs";
import { cx } from "@/utils/cx";

/**
 * Your teams — each one with what its next meeting needs.
 *
 * The teams are the stable part of the week; which meetings fall inside it is
 * not. "Coming up" above loses a monthly team for three weeks out of four, and
 * has nowhere to put what a team needs from you that isn't on any agenda. So a
 * card per team, sorted by how soon it next meets, leading with that meeting
 * and the sections of its next occurrence, then the team's next step and open
 * follow-ups.
 *
 * A delegated team (`Team.leaderId`) isn't yours to convene: you move it
 * forward by investing in its leader, so it rides on that leader's 1:1 and
 * gets no card. 1:1s and the meetings you only attend already sit in Coming up.
 */
export function YourTeams({ scopeId }: { scopeId: string | null }) {
  const teams = useStore((s) => s.teams);
  const people = useStore((s) => s.people);
  const managers = useStore((s) => s.managers);
  const domains = useStore((s) => s.domains);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const tags = useStore((s) => s.tags);
  const followUps = useStore((s) => s.followUps);
  const teamActions = useStore((s) => s.teamActions);
  const selectMeeting = useStore((s) => s.selectMeeting);
  const selectTeam = useStore((s) => s.selectTeam);
  const openModal = useStore((s) => s.openModal);
  const today = todayISO();

  const rows = useMemo(() => {
    const data = { meetings, sessions, topics };
    const delegated = delegatedTeamIds(teams);
    const domainOf = (t: Team) =>
      t.domainId ?? (t.parentId ? teams.find((x) => x.id === t.parentId)?.domainId : undefined);
    return teams
      .filter((t) => t.direction !== "up" && !delegated.has(t.id))
      .filter((t) => !scopeId || domainOf(t) === scopeId)
      .map((team) => {
        const own = meetingsFor(meetings, "team", team.id).filter((m) => m.role !== "attend");
        const primary = own[0];
        return {
          team,
          domainId: domainOf(team),
          primary,
          others: own.slice(1),
          readiness: primary ? readinessOf(primary, data, today) : null,
        };
      })
      .sort((a, b) => urgency(a.readiness) - urgency(b.readiness));
  }, [teams, meetings, sessions, topics, today, scopeId]);

  if (!rows.length) {
    return (
      <section className="flex flex-col gap-3.5">
        <h2 className="text-[15px] leading-5 font-semibold">Your teams</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-primary px-5 py-4">
          <p className="text-[14px] text-tertiary">
            Add the teams you lead, and each one's next meeting shows up here.
          </p>
          <button
            type="button"
            onClick={() => openModal({ kind: "team" })}
            className="h-9 rounded-[9px] bg-teal-600 px-3.5 text-[13px] font-semibold text-white dark:bg-teal-500 dark:text-stone-950"
          >
            Add a team
          </button>
        </div>
      </section>
    );
  }

  const names = { people, teams, managers };
  const titleOf = (m: TrackedMeeting) => meetingTitle(m, meetingSubjectName(m, names));
  const slugs = meetingSlugs({ meetings, people, teams, managers });
  const needYou = rows.filter((r) => r.readiness && isBehind(r.readiness.state)).length;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] leading-5 font-semibold">Your teams</h2>
        <span className="font-mono text-[11px] text-quaternary uppercase">
          {rows.length} {rows.length === 1 ? "team" : "teams"}
          {needYou > 0 ? ` · ${needYou} ${needYou === 1 ? "needs" : "need"} you` : ""}
        </span>
      </div>
      {/* The container is the wrapper: a grid can't query its own width. */}
      <div className="@container">
      <ul className="grid gap-3 @min-[620px]:grid-cols-2">
        {rows.map((row) => (
          <TeamCard
            key={row.team.id}
            team={row.team}
            domain={domains.find((d) => d.id === row.domainId)}
            meeting={row.primary}
            others={row.others}
            readiness={row.readiness}
            title={row.primary ? titleOf(row.primary) : ""}
            slug={row.primary ? slugs.slugById.get(row.primary.id) : undefined}
            tags={tags}
            nextStep={teamActions.find((a) => a.teamId === row.team.id && !a.done)?.text}
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
      </div>
    </section>
  );
}

function TeamCard({
  team,
  domain,
  meeting,
  others,
  readiness,
  title,
  slug,
  tags,
  nextStep,
  openFollowUps,
  onOpenMeeting,
  onOpenTeam,
  titleOf,
}: {
  team: Team;
  domain?: { name: string; color: string };
  meeting?: TrackedMeeting;
  others: TrackedMeeting[];
  readiness: Readiness | null;
  title: string;
  slug?: string;
  tags: { id: string; color: number }[];
  nextStep?: string;
  openFollowUps: number;
  onOpenMeeting: (id: string) => void;
  onOpenTeam: () => void;
  titleOf: (m: TrackedMeeting) => string;
}) {
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const health = team.health;

  // The next occurrence, section by section — the one-glance answer to "is
  // Monday planned?".
  const sections = useMemo(() => {
    if (!meeting) return [];
    const next = boardLayout(meeting, sessions, topics, todayISO(), { ahead: 1 }).weeks.find(
      (w) => !w.slot.past
    );
    if (!next) return [];
    const curriculum = curriculumOf(meeting);
    if (!curriculum.length) return [{ id: "all", label: "Topics", count: next.topics.length, dot: "" }];
    return next.cells
      .filter((c) => c.slotId || c.topics.length > 0)
      .map((c) => ({
        id: c.key,
        label: c.label,
        count: c.topics.length,
        dot: c.slotId ? slotDotClass(curriculum, c.slotId, tags) : "",
      }));
  }, [meeting, sessions, topics, tags]);

  // An empty section only earns amber once prep matters. A month out, an
  // empty Training slot is just the future not being written yet.
  const flagEmpty = Boolean(readiness && (readiness.windowOpen || isBehind(readiness.state)));
  const showHealth = health && (health.level === "watch" || health.level === "strained" || health.level === "critical");

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-[16px] border border-secondary bg-primary p-4">
      <div className="flex items-start gap-3">
        <Avatar name={team.name} size={34} className="!rounded-[10px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The state rides on the name's line, so the line under it gets
              the card's full width instead of truncating beside an empty
              column. */}
          <span className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onOpenTeam}
              className="min-w-0 flex-1 truncate text-left font-serif text-[18px] leading-6 text-primary hover:underline hover:decoration-1 hover:underline-offset-4"
            >
              {team.name}
            </button>
            {readiness && (
              <span className={cx("inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold", STATE_TEXT[readiness.state])}>
                <RhythmRing reading={readiness} size={18} />
                {STATE_LABEL[readiness.state]}
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-quaternary uppercase">
            {domain && (
              <i aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: domain.color }} />
            )}
            <span className="truncate">
              {[domain?.name, meeting ? RHYTHM_LABEL[meeting.rhythm] : null].filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>
      </div>

      {meeting && readiness ? (
        <button
          type="button"
          onClick={() => onOpenMeeting(meeting.id)}
          className="flex flex-col gap-2 rounded-[12px] bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-tertiary"
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-primary">{title}</span>
            <span className={cx("shrink-0 font-mono text-[11.5px] uppercase", STATE_TEXT[readiness.state])}>
              {formatCountdown(readiness)}
            </span>
          </span>
          {sections.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {sections.map((s) => (
                <span
                  key={s.id}
                  className={cx(
                    "inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-1.5 text-[11.5px]",
                    s.count === 0 && flagEmpty
                      ? "bg-cond-watch-soft text-cond-watch-ink"
                      : "bg-primary text-secondary"
                  )}
                >
                  {s.dot && <i aria-hidden className={cx("size-[7px] rounded-[2px]", s.dot)} />}
                  {s.label}
                  <span className="font-mono text-[10.5px]">{s.count}</span>
                </span>
              ))}
            </span>
          )}
          {readiness.headline && (
            <span className="truncate text-[12.5px] text-tertiary">{readiness.headline}</span>
          )}
        </button>
      ) : (
        <div className="rounded-[12px] border border-dashed border-primary px-3 py-2.5 text-[13px] text-tertiary">
          {team.noMeeting ? (
            "No standing meeting, by choice."
          ) : (
            <>
              No meeting tracked yet.{" "}
              <button type="button" onClick={onOpenTeam} className="font-semibold text-teal-700 hover:underline dark:text-teal-400">
                Set one up
              </button>
            </>
          )}
        </div>
      )}

      <dl className="grid gap-1.5 text-[13px]">
        <Fact label="Next step">
          {nextStep ?? <span className="text-quaternary">None set</span>}
        </Fact>
        {openFollowUps > 0 && <Fact label="Follow-ups">{openFollowUps} open</Fact>}
        {showHealth && (
          <Fact label="Your read">
            {HEALTH_LABEL[health!.level]}
            {health!.note && <span className="text-tertiary"> — {health!.note}</span>}
          </Fact>
        )}
        {others.length > 0 && (
          <Fact label="Also">
            {others.map((m, i) => (
              <span key={m.id}>
                {i > 0 && ", "}
                <button type="button" onClick={() => onOpenMeeting(m.id)} className="text-secondary hover:underline">
                  {titleOf(m)}
                </button>
              </span>
            ))}
          </Fact>
        )}
      </dl>

      {meeting && slug && (
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-secondary pt-2.5">
          <span className="truncate font-mono text-[11px] text-quaternary">/m/{slug}</span>
          <button
            type="button"
            onClick={() => onOpenMeeting(meeting.id)}
            className="shrink-0 text-[12.5px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400"
          >
            Open agenda
          </button>
        </div>
      )}
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2.5">
      <dt className="w-[76px] shrink-0 font-mono text-[10px] tracking-[0.04em] text-quaternary uppercase">{label}</dt>
      <dd className="min-w-0 flex-1 text-secondary">{children}</dd>
    </div>
  );
}

/**
 * What's drifting or a loose end first, then by how soon it meets, then teams
 * with no meeting at all. Days, so the ordering reads like a calendar.
 */
function urgency(r: Readiness | null): number {
  if (!r) return Number.MAX_SAFE_INTEGER;
  if (r.state === "drifting" || r.state === "loose_end") return -1e6 + (r.daysUntil ?? 0);
  return r.daysUntil ?? 1e6;
}
