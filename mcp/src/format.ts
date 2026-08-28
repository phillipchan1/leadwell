import type { PersistedData } from "../../src/lib/persist";
import type {
  FollowUp,
  Person,
  Session,
  Team,
  Topic,
} from "../../src/types";
import {
  HEALTH_LABEL,
  isStale,
  isWeak,
  needsAttention,
} from "../../src/lib/health";
import { PRAYER_LABEL, prayerState } from "../../src/lib/prayer";
import {
  STATE_LABEL,
  STATE_ORDER,
  formatCountdown,
  meetingTitle,
  readinessOf,
  triageState,
  type Readiness,
  type ReadinessState,
} from "../../src/lib/readiness";
import { meetingLabel } from "./writes";

function readinessData(data: PersistedData) {
  return {
    meetings: data.meetings,
    sessions: data.sessions,
    topics: data.topics,
  };
}

function healthLine(
  name: string,
  health?: Person["health"] | Team["health"]
): string | null {
  if (!health) return null;
  const stale = isStale(health) ? " · stale" : "";
  const note = health.note ? ` — ${health.note}` : "";
  return `${name} · ${HEALTH_LABEL[health.level]}${stale}${note}`;
}

function topicLine(topic: Topic, tags: PersistedData["tags"]): string {
  const labels = topic.tagIds
    .map((id) => tags.find((t) => t.id === id)?.label)
    .filter(Boolean)
    .map((l) => `#${l}`)
    .join(" ");
  const flags = [
    topic.urgent ? "!" : "",
    topic.status !== "open" ? topic.status : "",
    topic.lane === "parked" ? "parked" : "",
    topic.sessionId ? "slotted" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `- ${topic.id}  ${topic.text}${labels ? `  ${labels}` : ""}${flags ? `  (${flags})` : ""}`;
}

export function formatPurview(data: PersistedData): string {
  const src = readinessData(data);
  const readings = data.meetings.map((m) => ({
    meeting: m,
    read: readinessOf(m, src),
  }));

  const byState = (state: ReadinessState) =>
    readings.filter((r) => r.read.state === state);

  const attentionStates: ReadinessState[] = ["drifting", "loose_end", "prep_due"];
  const attention = attentionStates.flatMap((state) => byState(state));

  const weakPeople = data.people.filter((p) => p.health && isWeak(p.health.level));
  const weakTeams = data.teams.filter((t) => t.health && isWeak(t.health.level));
  const hotPeople = data.people.filter(
    (p) => p.health && needsAttention(p.health.level)
  );

  const cold = [
    ...data.people
      .filter((p) => prayerState(p.prayer) === "cold")
      .map((p) => `${p.name} · ${PRAYER_LABEL.cold}${p.prayer?.focus ? ` — ${p.prayer.focus}` : ""}`),
    ...data.teams
      .filter((t) => prayerState(t.prayer) === "cold")
      .map((t) => `${t.name} · ${PRAYER_LABEL.cold}${t.prayer?.focus ? ` — ${t.prayer.focus}` : ""}`),
    ...data.managers
      .filter((m) => prayerState(m.prayer) === "cold")
      .map((m) => `${m.name} · ${PRAYER_LABEL.cold}${m.prayer?.focus ? ` — ${m.prayer.focus}` : ""}`),
  ];

  const undecidedPeople = data.people.filter(
    (p) => triageState(p, data.meetings, "person") === "undecided"
  );
  const undecidedTeams = data.teams.filter(
    (t) => triageState(t, data.meetings, "team") === "undecided"
  );

  const lines: string[] = [
    `# LeadWell — ${data.me.name}${data.me.title ? `, ${data.me.title}` : ""}`,
    `Domains: ${data.domains.map((d) => d.name).join(", ") || "(none)"}`,
    `Teams ${data.teams.length} · People ${data.people.length} · Meetings ${data.meetings.length}`,
    "",
    "## Attention",
  ];

  if (!attention.length && !weakPeople.length && !weakTeams.length && !cold.length) {
    lines.push("Nothing overdue, strained, or gone quiet.");
  }

  if (attention.length) {
    const counts = attentionStates
      .map((state) => {
        const n = byState(state).length;
        return n ? `${n} ${STATE_LABEL[state].toLowerCase()}` : null;
      })
      .filter(Boolean);
    lines.push(`Readiness: ${counts.join(", ")}`);
    for (const { meeting, read } of attention.slice(0, 12)) {
      lines.push(
        `- ${meetingTitle(meeting, meetingLabel(meeting, data))} · ${STATE_LABEL[read.state]} · ${read.headline}`
      );
    }
  }

  const healthLines = [
    ...weakTeams.map((t) => healthLine(t.name, t.health)),
    ...weakPeople.map((p) => healthLine(p.name, p.health)),
  ].filter(Boolean) as string[];
  if (healthLines.length) {
    lines.push(
      `Health: ${hotPeople.length} strained-or-worse, ${weakPeople.length + weakTeams.length} watch-or-worse`
    );
    for (const line of healthLines.slice(0, 12)) lines.push(`- ${line}`);
  }

  if (cold.length) {
    lines.push(`Prayer gone quiet: ${cold.length}`);
    for (const line of cold.slice(0, 8)) lines.push(`- ${line}`);
  }

  const undecided = undecidedPeople.length + undecidedTeams.length;
  if (undecided) {
    lines.push(
      `Undecided (no meeting decision): ${undecidedPeople.length} people, ${undecidedTeams.length} teams`
    );
  }

  lines.push("", "## Teams");
  const roots = data.teams
    .filter((t) => !t.parentId)
    .sort((a, b) => a.order - b.order);
  if (!roots.length) lines.push("(none)");
  for (const team of roots) {
    lines.push(formatTeamSummary(team, data));
    for (const child of data.teams
      .filter((t) => t.parentId === team.id)
      .sort((a, b) => a.order - b.order)) {
      lines.push(formatTeamSummary(child, data, 1));
    }
  }

  if (data.managers.length) {
    lines.push("", "## Leading up");
    for (const manager of data.managers) {
      const read = data.meetings
        .filter((m) => m.subjectKind === "manager" && m.subjectId === manager.id)
        .map((m) => readinessOf(m, src))[0];
      lines.push(
        `- ${manager.name}${manager.role ? ` · ${manager.role}` : ""}${read ? ` · ${STATE_LABEL[read.state]}` : ""}`
      );
    }
  }

  return lines.join("\n");
}

function formatTeamSummary(team: Team, data: PersistedData, indent = 0): string {
  const pad = "  ".repeat(indent);
  const domain = data.domains.find((d) => d.id === team.domainId)?.name;
  const members = data.people.filter((p) => p.teamId === team.id);
  const health = team.health ? HEALTH_LABEL[team.health.level] : "unrated";
  const mandate = team.purpose ? ` — ${team.purpose}` : "";
  const names = members.map((p) => p.name).join(", ");
  return `${pad}- ${team.name}${domain ? ` · ${domain}` : ""} · ${health}${mandate}${names ? `\n${pad}  ${names}` : ""}`;
}

export function formatOrg(data: PersistedData): string {
  const lines = [`# Org — ${data.me.name}`, ""];
  for (const domain of data.domains) {
    const teams = data.teams.filter((t) => t.domainId === domain.id);
    if (!teams.length) continue;
    lines.push(`## ${domain.name}`);
    for (const team of teams.sort((a, b) => a.order - b.order)) {
      lines.push(formatTeamSummary(team, data));
    }
    lines.push("");
  }
  const untagged = data.teams.filter((t) => !t.domainId);
  if (untagged.length) {
    lines.push("## Untagged");
    for (const team of untagged) lines.push(formatTeamSummary(team, data));
  }
  const directs = data.people.filter((p) => !p.teamId);
  if (directs.length) {
    lines.push("## Direct reports");
    for (const person of directs) {
      lines.push(`- ${person.name}${person.role ? ` · ${person.role}` : ""}`);
    }
  }
  return lines.join("\n");
}

function formatReadiness(read: Readiness): string {
  const when = read.nextDate
    ? `${read.projected ? "~" : ""}${read.nextDate} (${formatCountdown(read)})`
    : "no next date";
  return `${STATE_LABEL[read.state]} · ${when} · ${read.headline}`;
}

export function formatPerson(data: PersistedData, id: string): string {
  const person = data.people.find((p) => p.id === id);
  if (!person) throw new Error(`Unknown person: ${id}`);
  const team = data.teams.find((t) => t.id === person.teamId);
  const src = readinessData(data);
  const meetings = data.meetings.filter(
    (m) => m.subjectKind === "person" && m.subjectId === person.id
  );
  const notes = data.notes
    .filter((n) => n.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  const topics = data.topics.filter((t) =>
    meetings.some((m) => m.id === t.meetingId) && t.status === "open"
  );
  const followUps = data.followUps.filter(
    (f) => f.subjectKind === "person" && f.subjectId === person.id && f.status === "open"
  );

  const lines = [
    `# ${person.name}${person.role ? ` · ${person.role}` : ""}`,
    `id: ${person.id}${team ? ` · ${team.name}` : " · direct report"}`,
  ];
  if (person.health) lines.push(healthLine(person.name, person.health)!);
  if (person.prayer) {
    lines.push(
      `Prayer: ${PRAYER_LABEL[prayerState(person.prayer)]}${person.prayer.focus ? ` — ${person.prayer.focus}` : ""}`
    );
  }
  const a = person.assessments;
  if (a.cliftonTop5?.length || a.enneagram || a.mbti) {
    lines.push(
      `Assessments: ${[
        a.cliftonTop5?.length ? `Clifton ${a.cliftonTop5.join(", ")}` : "",
        a.enneagram ? `Enneagram ${a.enneagram}` : "",
        a.mbti ? `MBTI ${a.mbti}` : "",
      ]
        .filter(Boolean)
        .join(" · ")}`
    );
  }
  if (person.howToLead) lines.push(`How to lead: ${person.howToLead}`);
  if (person.strengths.length) lines.push(`Strengths: ${person.strengths.join("; ")}`);
  if (person.watchOuts.length) lines.push(`Watch-outs: ${person.watchOuts.join("; ")}`);
  if (person.leadUp) {
    const u = person.leadUp;
    lines.push("Lead-up manual:");
    if (u.archetype) lines.push(`- Archetype: ${u.archetype}`);
    if (u.winsLike) lines.push(`- Wins like: ${u.winsLike}`);
    if (u.currency) lines.push(`- Currency: ${u.currency}`);
    if (u.anxieties) lines.push(`- Anxieties: ${u.anxieties}`);
    if (u.comms) lines.push(`- Comms: ${u.comms}`);
    if (u.theirScorecard) lines.push(`- Their scorecard: ${u.theirScorecard}`);
  }

  lines.push("", "## Meetings");
  if (!meetings.length) lines.push(person.noMeeting ? "Deliberate no-meeting." : "None tracked.");
  for (const meeting of meetings) {
    lines.push(`- ${meeting.id}  ${meetingTitle(meeting, person.name)} · ${formatReadiness(readinessOf(meeting, src))}`);
  }

  if (topics.length) {
    lines.push("", "## Open topics");
    for (const t of topics.slice(0, 20)) lines.push(topicLine(t, data.tags));
  }
  if (followUps.length) {
    lines.push("", "## Open follow-ups");
    for (const f of followUps) lines.push(`- ${f.id}  ${f.text}`);
  }
  if (notes.length) {
    lines.push("", "## Recent notes");
    for (const n of notes) lines.push(`- ${n.date}  ${n.body.split("\n")[0]}`);
  }
  return lines.join("\n");
}

export function formatTeam(data: PersistedData, id: string): string {
  const team = data.teams.find((t) => t.id === id);
  if (!team) throw new Error(`Unknown team: ${id}`);
  const members = data.people.filter((p) => p.teamId === team.id);
  const src = readinessData(data);
  const meetings = data.meetings.filter(
    (m) => m.subjectKind === "team" && m.subjectId === team.id
  );
  const notes = data.teamNotes
    .filter((n) => n.teamId === team.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const lines = [
    `# ${team.name}`,
    `id: ${team.id}`,
    team.purpose ? `Mandate: ${team.purpose}` : "",
    team.description ? team.description : "",
    team.health ? healthLine(team.name, team.health) : "Health: unrated",
    "",
    "## Roster",
    ...members.map((p) => `- ${p.id}  ${p.name}${p.role ? ` · ${p.role}` : ""}${p.health ? ` · ${HEALTH_LABEL[p.health.level]}` : ""}`),
    "",
    "## Meetings",
  ].filter((line) => line !== "");

  if (!meetings.length) lines.push(team.noMeeting ? "Deliberate no-meeting." : "None tracked.");
  for (const meeting of meetings) {
    lines.push(`- ${meeting.id}  ${meetingTitle(meeting, team.name)} · ${formatReadiness(readinessOf(meeting, src))}`);
  }
  if (notes.length) {
    lines.push("", "## Recent notes");
    for (const n of notes) lines.push(`- ${n.date}  ${n.body.split("\n")[0]}`);
  }
  return lines.join("\n");
}

export function formatManager(data: PersistedData, id: string): string {
  const manager = data.managers.find((m) => m.id === id);
  if (!manager) throw new Error(`Unknown manager: ${id}`);
  const src = readinessData(data);
  const meetings = data.meetings.filter(
    (m) => m.subjectKind === "manager" && m.subjectId === manager.id
  );
  const wins = data.wins
    .filter((w) => w.personId === manager.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const lines = [
    `# ${manager.name}${manager.role ? ` · ${manager.role}` : ""}`,
    `id: ${manager.id}`,
  ];
  if (manager.leadUp) {
    const u = manager.leadUp;
    if (u.archetype) lines.push(`Archetype: ${u.archetype}`);
    if (u.winsLike) lines.push(`Wins like: ${u.winsLike}`);
    if (u.currency) lines.push(`Currency: ${u.currency}`);
    if (u.anxieties) lines.push(`Anxieties: ${u.anxieties}`);
    if (u.comms) lines.push(`Comms: ${u.comms}`);
    if (u.theirScorecard) lines.push(`Their scorecard: ${u.theirScorecard}`);
  }
  lines.push("", "## Meetings");
  if (!meetings.length) lines.push(manager.noMeeting ? "Deliberate no-meeting." : "None tracked.");
  for (const meeting of meetings) {
    lines.push(`- ${meeting.id}  ${meetingTitle(meeting, manager.name)} · ${formatReadiness(readinessOf(meeting, src))}`);
  }
  if (wins.length) {
    lines.push("", "## Wins");
    for (const w of wins) {
      lines.push(`- ${w.date}  ${w.text}${w.impact ? ` — ${w.impact}` : ""}`);
    }
  }
  return lines.join("\n");
}

export function formatMeetings(
  data: PersistedData,
  filter?: { state?: ReadinessState; domainId?: string; subjectId?: string }
): string {
  const src = readinessData(data);
  let rows = data.meetings.map((meeting) => ({
    meeting,
    read: readinessOf(meeting, src),
    title: meetingTitle(meeting, meetingLabel(meeting, data)),
  }));
  if (filter?.state) rows = rows.filter((r) => r.read.state === filter.state);
  if (filter?.subjectId) {
    rows = rows.filter((r) => r.meeting.subjectId === filter.subjectId);
  }
  if (filter?.domainId) {
    const people = new Set(
      data.people.filter((p) => {
        const team = data.teams.find((t) => t.id === p.teamId);
        return (team?.domainId ?? p.domainId) === filter.domainId;
      }).map((p) => p.id)
    );
    const teams = new Set(
      data.teams.filter((t) => t.domainId === filter.domainId).map((t) => t.id)
    );
    const managers = new Set(
      data.managers.filter((m) => m.domainId === filter.domainId).map((m) => m.id)
    );
    rows = rows.filter((r) => {
      const { subjectKind, subjectId } = r.meeting;
      if (subjectKind === "person") return people.has(subjectId);
      if (subjectKind === "team") return teams.has(subjectId);
      return managers.has(subjectId);
    });
  }
  rows.sort(
    (a, b) => STATE_ORDER.indexOf(a.read.state) - STATE_ORDER.indexOf(b.read.state)
  );
  if (!rows.length) return "No meetings match.";
  return rows
    .map(
      (r) =>
        `- ${r.meeting.id}  ${r.title} · ${r.meeting.rhythm} · ${formatReadiness(r.read)}`
    )
    .join("\n");
}

export function formatMeeting(data: PersistedData, id: string): string {
  const meeting = data.meetings.find((m) => m.id === id);
  if (!meeting) throw new Error(`Unknown meeting: ${id}`);
  const src = readinessData(data);
  const read = readinessOf(meeting, src);
  const title = meetingTitle(meeting, meetingLabel(meeting, data));
  const topics = data.topics.filter((t) => t.meetingId === meeting.id);
  const sessions = data.sessions
    .filter((s) => s.meetingId === meeting.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const followUps = data.followUps.filter(
    (f) => f.meetingId === meeting.id && f.status === "open"
  );

  const lines = [
    `# ${title}`,
    `id: ${meeting.id} · ${meeting.subjectKind}:${meeting.subjectId} · ${meeting.rhythm}${meeting.role ? ` · ${meeting.role}` : ""}`,
    formatReadiness(read),
    meeting.trackerUrl ? `Tracker: ${meeting.trackerName ?? "external"} · ${meeting.trackerUrl}` : "",
    meeting.curriculum?.length
      ? `Curriculum: ${meeting.curriculum.map((c) => c.label).join(" → ")}`
      : "",
    "",
    "## Topics",
  ].filter((line) => line !== "");

  const open = topics.filter((t) => t.status === "open");
  if (!open.length) lines.push("(none open)");
  for (const t of open) lines.push(topicLine(t, data.tags));

  if (followUps.length) {
    lines.push("", "## Open follow-ups");
    for (const f of followUps) lines.push(`- ${f.id}  ${f.text}`);
  }

  lines.push("", "## Recent sessions");
  if (!sessions.length) lines.push("(none logged)");
  for (const s of sessions.slice(0, 5)) {
    lines.push(formatSession(s));
  }
  return lines.join("\n");
}

function formatSession(session: Session): string {
  const bits = [session.date, session.point].filter(Boolean);
  const body = session.notes ? `\n  ${session.notes.split("\n")[0]}` : "";
  return `- ${session.id}  ${bits.join(" · ")}${body}`;
}

export function formatTopics(
  data: PersistedData,
  filter?: { meetingId?: string; unassigned?: boolean; status?: Topic["status"] }
): string {
  let topics = data.topics;
  if (filter?.meetingId) topics = topics.filter((t) => t.meetingId === filter.meetingId);
  if (filter?.unassigned) topics = topics.filter((t) => !t.meetingId);
  if (filter?.status) topics = topics.filter((t) => t.status === filter.status);
  else topics = topics.filter((t) => t.status === "open");
  if (!topics.length) return "No topics match.";
  return topics
    .slice(0, 40)
    .map((t) => {
      const meeting = t.meetingId
        ? data.meetings.find((m) => m.id === t.meetingId)
        : undefined;
      const home = meeting ? meetingLabel(meeting, data) : "Ideas";
      return `${topicLine(t, data.tags)}  · ${home}`;
    })
    .join("\n");
}

export function formatFollowUps(
  data: PersistedData,
  filter?: { subjectId?: string; meetingId?: string; status?: FollowUp["status"] }
): string {
  let items = data.followUps;
  if (filter?.subjectId) items = items.filter((f) => f.subjectId === filter.subjectId);
  if (filter?.meetingId) items = items.filter((f) => f.meetingId === filter.meetingId);
  items = items.filter((f) => (filter?.status ?? "open") === f.status);
  if (!items.length) return "No follow-ups match.";
  return items
    .map((f) => `- ${f.id}  ${f.text}  (${f.subjectKind}:${f.subjectId} · ${f.status})`)
    .join("\n");
}

export function formatCreatedTopics(topics: Topic[], unresolved: string[]): string {
  const lines = topics.map((t) => `- ${t.id}  ${t.text}${t.meetingId ? ` → ${t.meetingId}` : " → Ideas"}`);
  if (unresolved.length) {
    lines.push(
      `Unresolved @meetings (left unassigned or on the given target): ${unresolved.join(", ")}`
    );
  }
  return lines.join("\n") || "Nothing captured.";
}
