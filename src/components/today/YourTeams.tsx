import { useMemo } from "react";
import type { Team } from "@/types";
import { useStore } from "@/store/useStore";
import { STATE_LABEL, formatCountdown, meetingsFor, readinessOf, todayISO, type Readiness } from "@/lib/readiness";
import { delegatedTeamIds } from "@/lib/teams";
import { runwayOf, type Runway } from "@/lib/runway";
import { RunwayCover, RunwayTrack, runwayTitle } from "../RunwayTrack";
import { Avatar } from "../Avatar";
import { RhythmRing, STATE_TEXT } from "../brand/glyphs";

/**
 * Your teams — the ones "Coming up" can't see.
 *
 * The teams are the stable part of the week; which meetings fall inside it is
 * not. "Coming up" above loses a monthly team for three weeks out of four, and
 * has nowhere to put what a team needs from you that isn't on any agenda. So
 * one quiet row per team whose meeting isn't already in this week's list,
 * sorted by how soon it next meets: when, how it stands, and the team's next
 * step. The rest of a team lives on its own page.
 *
 * A delegated team (`Team.leaderId`) isn't yours to convene: you move it
 * forward by investing in its leader, so it rides on that leader's 1:1 and
 * gets no row. 1:1s and the meetings you only attend already sit in Coming up.
 */
export function YourTeams({ scopeId, skip }: { scopeId: string | null; skip?: ReadonlySet<string> }) {
  const teams = useStore((s) => s.teams);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
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
          primary,
          readiness: primary ? readinessOf(primary, data, today) : null,
          runway: primary ? runwayOf(primary, sessions, topics, today) : null,
        };
      })
      .sort((a, b) => urgency(a.readiness) - urgency(b.readiness));
  }, [teams, meetings, sessions, topics, today, scopeId]);

  if (!rows.length) {
    return (
      <p className="px-0.5 text-[13.5px] text-tertiary">
        Add the teams you lead and each one's next meeting shows up here.{" "}
        <button type="button" onClick={() => openModal({ kind: "team" })} className="font-semibold text-primary hover:underline">
          Add a team
        </button>
      </p>
    );
  }

  const shown = rows.filter((r) => !r.primary || !skip?.has(r.primary.id));
  if (!shown.length) return null;

  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="text-[15px] leading-5 font-semibold">Your other teams</h2>
      <ul className="flex flex-col overflow-hidden rounded-[14px] border border-secondary bg-primary">
        {shown.map((row) => (
          <TeamRow
            key={row.team.id}
            team={row.team}
            readiness={row.readiness}
            runway={row.runway}
            nextStep={teamActions.find((a) => a.teamId === row.team.id && !a.done)?.text}
            onOpenMeeting={row.primary ? () => selectMeeting(row.primary!.id) : undefined}
            onOpenTeam={() => selectTeam(row.team.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function TeamRow({
  team,
  readiness,
  runway,
  nextStep,
  onOpenMeeting,
  onOpenTeam,
}: {
  team: Team;
  readiness: Readiness | null;
  runway: Runway | null;
  nextStep?: string;
  onOpenMeeting?: () => void;
  onOpenTeam: () => void;
}) {
  const when = readiness
    ? formatCountdown(readiness)
    : team.noMeeting
      ? "No standing meeting, by choice"
      : "No meeting tracked yet";
  const showRunway = Boolean(runway && runway.level !== "none");
  return (
    <li className="flex items-center gap-3 border-t border-secondary px-4 py-3 first:border-t-0">
      <Avatar name={team.name} size={28} className="!rounded-[8px]" />
      <button type="button" onClick={onOpenTeam} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate font-serif text-[16.5px] leading-[22px] hover:underline hover:decoration-1 hover:underline-offset-4">
          {team.name}
        </span>
        <span className="truncate text-[13px] text-quaternary">
          {[when.charAt(0).toUpperCase() + when.slice(1), nextStep].filter(Boolean).join(" · ")}
        </span>
        {/* How far ahead it's planned — the leadership-block read of which
            team needs planning. Under the name on a phone, beside it above. */}
        {showRunway && (
          <span className="mt-1 flex items-center gap-2.5 sm:hidden" title={runwayTitle(runway!)}>
            <RunwayTrack runway={runway!} className="min-w-0 flex-1" />
            <RunwayCover runway={runway!} />
          </span>
        )}
      </button>
      {showRunway && (
        <span className="flex shrink-0 items-center gap-2.5 max-sm:hidden" title={runwayTitle(runway!)}>
          <RunwayTrack runway={runway!} className="w-[132px]" />
          <span className="w-[92px]">
            <RunwayCover runway={runway!} />
          </span>
        </span>
      )}
      {readiness && onOpenMeeting && (
        <button
          type="button"
          onClick={onOpenMeeting}
          aria-label={`Open the meeting — ${STATE_LABEL[readiness.state]}`}
          className={`inline-flex shrink-0 items-center gap-2 text-[13px] font-medium ${STATE_TEXT[readiness.state]}`}
        >
          <RhythmRing reading={readiness} size={20} />
          <span className="max-sm:hidden">{STATE_LABEL[readiness.state]}</span>
        </button>
      )}
    </li>
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
