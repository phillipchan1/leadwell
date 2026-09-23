/**
 * Plain-text views of the workspace for an agent to read.
 *
 * Shaped like the screens rather than like the tables: a meeting reads as its
 * settings, then the next few weeks row by row, then its ideas — the way the
 * planner draws it. Every record carries its id in [brackets] so the next call
 * can point at it exactly.
 */
import type {
  FollowUp,
  Health,
  Manager,
  Person,
  Session,
  Team,
  Topic,
  TrackedMeeting,
} from "../../src/types";
import type { PersistedData } from "../../src/lib/persist";
import { HEALTH_LABEL, isStale, isWeak } from "../../src/lib/health.js";
import { PRAYER_LABEL, prayerState } from "../../src/lib/prayer.js";
import { coverageStats } from "../../src/lib/ideas.js";
import {
  RHYTHM_LABEL,
  STATE_LABEL,
  STATE_ORDER,
  formatCountdown,
  isBehind,
  readinessOf,
  sessionsFor,
  todayISO,
  triageState,
  type Readiness,
  type ReadinessState,
} from "../../src/lib/readiness.js";
import {
  allLooseTopics,
  boardLayout,
  curriculumOf,
  effectiveSlotId,
  type Slot,
} from "../../src/lib/topics.js";
import { meetingName, upcomingSlots } from "./resolve.js";

type Doc = PersistedData;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]} ${iso}`;
}

function tagLabels(d: Doc, t: Topic): string {
  return t.tagIds
    .map((id) => d.tags.find((x) => x.id === id)?.label)
    .filter(Boolean)
    .map((l) => `#${l}`)
    .join(" ");
}

function occurrenceOf(d: Doc, t: Topic): Session | undefined {
  return t.sessionId ? d.sessions.find((s) => s.id === t.sessionId) : undefined;
}

/** One card: `- [id] text  #Tag  (urgent · due … · 2/4 points · notes)`. */
export function topicLine(
  d: Doc,
  t: Topic,
  opts: { home?: boolean; when?: boolean } = {}
): string {
  const points = t.points?.length
    ? `${t.points.filter((p) => p.done).length}/${t.points.length} points`
    : "";
  const on = opts.when ? occurrenceOf(d, t) : undefined;
  const meeting = opts.home && t.meetingId ? d.meetings.find((m) => m.id === t.meetingId) : undefined;
  const flags = [
    t.status !== "open" ? t.status : "",
    t.urgent ? "urgent" : "",
    t.lane === "parked" && !t.sessionId ? "parked" : "",
    t.dueDate ? `due ${t.dueDate}` : "",
    t.carried ? `carried ${t.carried}×` : "",
    t.returnedFromDate ? `came back from ${t.returnedFromDate}` : "",
    points,
    t.detail?.trim() ? "notes" : "",
    opts.home ? (meeting ? `@${meetingName(d, meeting)}` : "unassigned") : "",
    on ? `on ${on.date}` : "",
  ].filter(Boolean);
  const tags = tagLabels(d, t);
  return `- [${t.id}] ${t.text}${tags ? `  ${tags}` : ""}${flags.length ? `  (${flags.join(" · ")})` : ""}`;
}

function readinessLine(r: Readiness): string {
  const when = r.nextDate
    ? `next ${r.projected ? "~" : ""}${dayLabel(r.nextDate)} (${formatCountdown(r)})`
    : "no next date";
  return `${STATE_LABEL[r.state]} · ${when} · ${r.headline}`;
}

function rhythmLine(m: TrackedMeeting): string {
  const bits = [RHYTHM_LABEL[m.rhythm]];
  if (m.anchorWeekday !== undefined) bits.push(`on ${WEEKDAY[m.anchorWeekday]}s`);
  if (m.rhythm === "as_needed" && m.floorDays) bits.push(`floor ${m.floorDays}d`);
  if (m.nextDate) bits.push(`booked ${m.nextDate}`);
  bits.push(m.role === "attend" ? "I attend" : "I convene");
  return bits.join(" · ");
}

function healthLine(name: string, health?: Health): string | null {
  if (!health) return null;
  const stale = isStale(health) ? " · stale" : "";
  const note = health.note ? ` — ${health.note}` : "";
  return `${name} · ${HEALTH_LABEL[health.level]}${stale}${note}`;
}

// ── Overview ──────────────────────────────────────────────────────────────

export function formatOverview(d: Doc, tz: string): string {
  const today = todayISO();
  const reads = d.meetings
    .map((m) => ({ m, r: readinessOf(m, d) }))
    .sort((a, b) => {
      const s = STATE_ORDER.indexOf(a.r.state) - STATE_ORDER.indexOf(b.r.state);
      if (s) return s;
      return (a.r.nextDate ?? "9999").localeCompare(b.r.nextDate ?? "9999");
    });
  const ideas = d.topics.filter((t) => t.status === "open" && !t.sessionId && t.lane !== "parked");
  const unassigned = ideas.filter((t) => !t.meetingId);
  const loose = allLooseTopics(d.topics, d.sessions, today);
  const followUps = d.followUps.filter((f) => f.status === "open");

  const lines = [
    `# LeadWell — ${d.me.name}${d.me.title ? `, ${d.me.title}` : ""}`,
    `Today is ${dayLabel(today)} (${tz}).`,
    `${d.meetings.length} meetings · ${d.teams.length} teams · ${d.people.length} people · ${d.managers.length} managers`,
    `Ideas: ${ideas.length} open not yet on a week (${unassigned.length} unassigned) · ${loose.length} loose from past weeks · ${followUps.length} open follow-ups`,
    `Tags: ${d.tags.map((t) => t.label).join(", ") || "(none)"}`,
    "",
    "## Meetings",
  ];
  if (!reads.length) lines.push("(none tracked)");
  for (const { m, r } of reads) {
    const rows = curriculumOf(m).map((c) => c.label);
    lines.push(
      `- [${m.id}] ${meetingName(d, m)} · ${rhythmLine(m)}${rows.length ? ` · rows: ${rows.join(" → ")}` : ""}`,
      `    ${readinessLine(r)}`
    );
  }

  const behind = reads.filter(({ r }) => isBehind(r.state));
  const weak = [
    ...d.teams.filter((t) => t.health && isWeak(t.health.level)).map((t) => healthLine(t.name, t.health)),
    ...d.people.filter((p) => p.health && isWeak(p.health.level)).map((p) => healthLine(p.name, p.health)),
  ].filter(Boolean) as string[];
  const cold = [...d.people, ...d.teams, ...d.managers]
    .filter((x) => prayerState(x.prayer) === "cold")
    .map((x) => `${x.name}${x.prayer?.focus ? ` — ${x.prayer.focus}` : ""}`);
  const undecided = [
    ...d.people.filter((p) => triageState(p, d.meetings, "person") === "undecided").map((p) => p.name),
    ...d.teams.filter((t) => triageState(t, d.meetings, "team") === "undecided").map((t) => t.name),
  ];

  lines.push("", "## Attention");
  if (!behind.length && !weak.length && !cold.length && !loose.length) {
    lines.push("Nothing behind, strained, loose or gone quiet.");
  }
  for (const { m, r } of behind) lines.push(`- ${meetingName(d, m)}: ${STATE_LABEL[r.state]} — ${r.headline}`);
  if (loose.length) lines.push(`- ${loose.length} topic(s) left open on past weeks (carry_forward rolls them on)`);
  for (const w of weak.slice(0, 10)) lines.push(`- Health: ${w}`);
  if (cold.length) lines.push(`- Prayer gone quiet: ${cold.slice(0, 8).join("; ")}`);
  if (undecided.length) lines.push(`- No meeting decision yet: ${undecided.slice(0, 12).join(", ")}`);

  return lines.join("\n");
}

export function formatMeetings(
  d: Doc,
  filter: { state?: ReadinessState; subjectId?: string; domainId?: string } = {}
): string {
  let rows = d.meetings.map((m) => ({ m, r: readinessOf(m, d) }));
  if (filter.state) rows = rows.filter((x) => x.r.state === filter.state);
  if (filter.subjectId) rows = rows.filter((x) => x.m.subjectId === filter.subjectId);
  if (filter.domainId) {
    const inDomain = (m: TrackedMeeting) => {
      if (m.subjectKind === "team") return d.teams.find((t) => t.id === m.subjectId)?.domainId === filter.domainId;
      if (m.subjectKind === "manager") return d.managers.find((x) => x.id === m.subjectId)?.domainId === filter.domainId;
      const p = d.people.find((x) => x.id === m.subjectId);
      const team = d.teams.find((t) => t.id === p?.teamId);
      return (team?.domainId ?? p?.domainId) === filter.domainId;
    };
    rows = rows.filter((x) => inDomain(x.m));
  }
  if (!rows.length) return "No meetings match.";
  rows.sort((a, b) => STATE_ORDER.indexOf(a.r.state) - STATE_ORDER.indexOf(b.r.state));
  return rows
    .map(({ m, r }) => `- [${m.id}] ${meetingName(d, m)} · ${rhythmLine(m)}\n    ${readinessLine(r)}`)
    .join("\n");
}

// ── One meeting ───────────────────────────────────────────────────────────

function slotHeading(d: Doc, slot: Slot): string {
  const session = slot.sessionId ? d.sessions.find((s) => s.id === slot.sessionId) : undefined;
  const bits = [dayLabel(slot.date)];
  if (slot.projected) bits.push("projected");
  if (slot.past) bits.push("past");
  if (session?.kind === "extra") bits.push("one-off");
  if (session?.seriesDate && session.seriesDate !== session.date) {
    bits.push(`moved from ${session.seriesDate}`);
  }
  if (session?.point) bits.push(`point: ${session.point}`);
  if (session?.notes?.trim()) bits.push("has notes");
  return `### ${bits.join(" · ")}${slot.sessionId ? ` [${slot.sessionId}]` : ""}`;
}

export function formatMeeting(d: Doc, meeting: TrackedMeeting, weeks = 4): string {
  const today = todayISO();
  const r = readinessOf(meeting, d, today);
  const board = boardLayout(meeting, d.sessions, d.topics, today, { ahead: weeks });
  const curriculum = curriculumOf(meeting);
  const subject =
    meeting.subjectKind === "person"
      ? d.people.find((p) => p.id === meeting.subjectId)?.name
      : meeting.subjectKind === "team"
        ? d.teams.find((t) => t.id === meeting.subjectId)?.name
        : d.managers.find((m) => m.id === meeting.subjectId)?.name;

  const lines = [
    `# ${meetingName(d, meeting)} [${meeting.id}]`,
    `With: ${subject ?? "?"} (${meeting.subjectKind} ${meeting.subjectId})`,
    `Cadence: ${rhythmLine(meeting)}`,
    `Readiness: ${readinessLine(r)}`,
  ];
  if (meeting.trackerUrl) {
    lines.push(`Notes live in: ${meeting.trackerName ?? "external tracker"} — ${meeting.trackerUrl}`);
  }
  lines.push(
    curriculum.length
      ? `Rows (standing agenda, in order): ${curriculum
          .map((c) => {
            const tag = c.tagId ? d.tags.find((t) => t.id === c.tagId)?.label : undefined;
            return `${c.label} [${c.id}]${tag && tag !== c.label ? ` ↔ #${tag}` : ""}${c.minutes ? ` ${c.minutes}m` : ""}`;
          })
          .join(" → ")}`
      : "Rows: none — the board is one ungrouped list."
  );
  const upcomingIds = board.weeks.filter((w) => !w.slot.past).map((w) => w.slot.sessionId);
  const coverage = coverageStats(meeting, upcomingIds, d.topics, d.tags);
  if (coverage.length) {
    lines.push(
      `Coverage targets: ${coverage
        .map((c) => `#${c.label} every ${c.everyN} (${c.filled}/${c.total} planned${c.thin ? ", thin" : ""})`)
        .join("; ")}`
    );
  }

  lines.push("", "## Weeks");
  for (const week of board.weeks) {
    lines.push(slotHeading(d, week.slot));
    if (!week.topics.length) {
      lines.push(curriculum.length ? `(empty — rows: ${curriculum.map((c) => c.label).join(", ")})` : "(empty)");
      continue;
    }
    for (const cell of week.cells) {
      if (!cell.topics.length) {
        if (cell.slotId) lines.push(`${cell.label}: —`);
        continue;
      }
      if (curriculum.length) lines.push(`${cell.label}:`);
      for (const t of cell.topics) lines.push(`  ${topicLine(d, t)}`);
    }
  }

  lines.push("", "## Ideas for this meeting (not yet on a week)");
  let any = false;
  for (const group of board.bucket) {
    if (!group.topics.length) continue;
    any = true;
    lines.push(`${group.label}:`);
    for (const t of group.topics) lines.push(`  ${topicLine(d, t)}`);
  }
  if (!any) lines.push("(none)");

  const loose = d.topics.filter((t) => {
    const s = occurrenceOf(d, t);
    return t.meetingId === meeting.id && t.status === "open" && s && s.date < today && !board.weeks.some((w) => w.slot.sessionId === s.id);
  });
  if (loose.length) {
    lines.push("", "## Loose (left open on older weeks)");
    for (const t of loose) lines.push(topicLine(d, t, { when: true }));
  }

  const followUps = d.followUps.filter(
    (f) => f.status === "open" && (f.meetingId === meeting.id || (!f.meetingId && f.subjectId === meeting.subjectId))
  );
  if (followUps.length) {
    lines.push("", "## Open follow-ups");
    for (const f of followUps) lines.push(followUpLine(f));
  }

  const history = sessionsFor(meeting.id, d.sessions)
    .filter((s) => s.date < today && s.kind !== "skipped")
    .slice(-5)
    .reverse();
  lines.push("", "## Recent write-ups");
  if (!history.length) lines.push("(none)");
  for (const s of history) {
    const first = s.notes?.split("\n").find((l) => l.trim())?.trim();
    lines.push(`- [${s.id}] ${dayLabel(s.date)}${s.point ? ` · ${s.point}` : ""}${first ? ` — ${first.slice(0, 100)}` : " — (no notes)"}`);
  }
  return lines.join("\n");
}

export function formatOccurrence(
  d: Doc,
  meeting: TrackedMeeting,
  date: string,
  session: Session | null
): string {
  const curriculum = curriculumOf(meeting);
  const agenda = session
    ? d.topics
        .filter((t) => t.sessionId === session.id && t.status !== "dropped")
        .sort((a, b) => a.order - b.order)
    : [];
  const lines = [
    `# ${meetingName(d, meeting)} — ${dayLabel(date)}${session ? ` [${session.id}]` : " (projected — nothing booked yet)"}`,
  ];
  if (session?.kind === "extra") lines.push("One-off, outside the rhythm.");
  if (session?.seriesDate && session.seriesDate !== session.date) lines.push(`Moved from ${session.seriesDate}.`);
  if (session?.point) lines.push(`Point: ${session.point}`);

  lines.push("", "## Agenda");
  const rows = curriculum.length ? [...curriculum.map((c) => ({ id: c.id as string | undefined, label: c.label })), { id: undefined, label: "Untagged" }] : [{ id: undefined, label: "" }];
  for (const row of rows) {
    const inRow = agenda.filter((t) => (curriculum.length ? effectiveSlotId(t, curriculum) === row.id : true));
    if (row.label) lines.push(`### ${row.label}${row.id ? ` [${row.id}]` : ""}`);
    if (!inRow.length) lines.push("(nothing yet)");
    for (const t of inRow) {
      lines.push(topicLine(d, t));
      if (t.detail?.trim()) lines.push(`    notes: ${t.detail.trim().replace(/\n/g, "\n    ")}`);
      for (const p of t.points ?? []) lines.push(`    - [${p.done ? "x" : " "}] ${p.text}`);
    }
  }

  const since = d.followUps.filter(
    (f) => f.status === "open" && (f.meetingId === meeting.id || (!f.meetingId && f.subjectId === meeting.subjectId))
  );
  if (since.length) {
    lines.push("", "## Since last time (open follow-ups)");
    for (const f of since) lines.push(followUpLine(f));
  }
  if (session?.uncovered?.length) {
    lines.push("", "## Not covered", ...session.uncovered.map((u) => `- ${u}`));
  }
  lines.push("", "## Notes");
  lines.push(session?.notes?.trim() || "(none)");
  if (session?.transcript?.trim()) lines.push("", "## Transcript", session.transcript.trim());
  if (session?.nextDate) lines.push("", `Next booked: ${session.nextDate}`);
  return lines.join("\n");
}

// ── Ideas, topics, tags ───────────────────────────────────────────────────

export function formatIdeas(
  d: Doc,
  opts: {
    meeting?: TrackedMeeting;
    groupBy?: "tag" | "meeting";
    refine?: "all" | "untriaged" | "returned" | "aging";
    includeParked?: boolean;
  }
): string {
  const today = todayISO();
  let pool = d.topics.filter(
    (t) => t.status === "open" && !t.sessionId && (opts.includeParked || t.lane !== "parked")
  );
  if (opts.meeting) pool = pool.filter((t) => !t.meetingId || t.meetingId === opts.meeting!.id);
  if (opts.refine === "untriaged") pool = pool.filter((t) => !t.meetingId || !t.tagIds.length);
  if (opts.refine === "returned") pool = pool.filter((t) => Boolean(t.returnedOn));
  if (opts.refine === "aging") {
    pool = pool.filter((t) => t.createdOn && Date.parse(today) - Date.parse(t.createdOn) > 21 * 86_400_000);
  }
  pool.sort((a, b) => a.order - b.order);
  if (!pool.length) return "No ideas match.";

  const groupBy = opts.groupBy ?? (opts.meeting ? "tag" : "meeting");
  const lines = [
    `# Ideas${opts.meeting ? ` — ${meetingName(d, opts.meeting)} plus unassigned` : ""} (${pool.length})`,
  ];
  if (groupBy === "tag") {
    const untagged = pool.filter((t) => !t.tagIds.length);
    if (untagged.length) {
      lines.push("", "## Untagged");
      for (const t of untagged) lines.push(topicLine(d, t, { home: true }));
    }
    for (const tag of d.tags) {
      const inTag = pool.filter((t) => t.tagIds.includes(tag.id));
      if (!inTag.length) continue;
      lines.push("", `## #${tag.label} [${tag.id}]`);
      for (const t of inTag) lines.push(topicLine(d, t, { home: true }));
    }
  } else {
    const unassigned = pool.filter((t) => !t.meetingId);
    lines.push("", "## Not assigned to a meeting");
    if (!unassigned.length) lines.push("(none)");
    for (const t of unassigned) lines.push(topicLine(d, t));
    for (const m of d.meetings) {
      const mine = pool.filter((t) => t.meetingId === m.id);
      if (!mine.length) continue;
      lines.push("", `## ${meetingName(d, m)} [${m.id}]`);
      for (const t of mine) lines.push(topicLine(d, t));
    }
  }
  return lines.join("\n");
}

export function formatTopic(d: Doc, t: Topic): string {
  const meeting = t.meetingId ? d.meetings.find((m) => m.id === t.meetingId) : undefined;
  const on = occurrenceOf(d, t);
  const row = meeting ? effectiveSlotId(t, curriculumOf(meeting)) : undefined;
  const rowLabel = row ? meeting?.curriculum?.find((c) => c.id === row)?.label : undefined;
  const lines = [
    `# ${t.text} [${t.id}]`,
    `Status: ${t.status}${t.closedOn ? ` (${t.closedOn})` : ""}${t.urgent ? " · urgent" : ""}${t.dueDate ? ` · due ${t.dueDate}` : ""}`,
    `Meeting: ${meeting ? `${meetingName(d, meeting)} [${meeting.id}]` : "unassigned (Ideas)"}`,
    `Where: ${on ? `on ${dayLabel(on.date)} [${on.id}]` : t.lane === "parked" ? "parked" : "ideas (not on a week)"}${rowLabel ? ` · row ${rowLabel}` : ""}`,
    `Tags: ${tagLabels(d, t) || "(none)"}`,
    `Created ${t.createdOn || "?"}${t.carried ? ` · carried ${t.carried}×` : ""}${t.returnedFromDate ? ` · came back from ${t.returnedFromDate}` : ""}`,
  ];
  if (t.points?.length) {
    lines.push("", "## Points");
    t.points.forEach((p, i) => lines.push(`${i + 1}. [${p.done ? "x" : " "}] ${p.text} [${p.id}]`));
  }
  if (t.detail?.trim()) lines.push("", "## Notes", t.detail.trim());
  return lines.join("\n");
}

export function formatTags(d: Doc): string {
  if (!d.tags.length) return "No tags yet.";
  return d.tags
    .map((tag) => {
      const open = d.topics.filter((t) => t.status === "open" && t.tagIds.includes(tag.id)).length;
      const rows = d.meetings
        .filter((m) => m.curriculum?.some((c) => c.tagId === tag.id))
        .map((m) => meetingName(d, m));
      return `- [${tag.id}] #${tag.label} · color ${tag.color} · ${open} open${rows.length ? ` · row on ${rows.join(", ")}` : ""}`;
    })
    .join("\n");
}

export function formatSchedule(d: Doc, from: string, days: number): string {
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const items: { date: string; line: string }[] = [];
  for (const m of d.meetings) {
    // A dormant meeting has no next date; the planner still draws a column
    // for it to drop into, but it isn't on anyone's calendar.
    const expected = readinessOf(m, d).nextDate !== null;
    for (const slot of upcomingSlots(d, m, 60)) {
      if (slot.date < from || slot.date >= to) continue;
      if (slot.projected && !expected) continue;
      const n = slot.sessionId
        ? d.topics.filter((t) => t.sessionId === slot.sessionId && t.status !== "dropped").length
        : 0;
      items.push({
        date: slot.date,
        line: `- ${dayLabel(slot.date)} · ${meetingName(d, m)} [${m.id}]${slot.projected ? " (projected)" : ` [${slot.sessionId}]`} · ${n} on the agenda`,
      });
    }
  }
  const skipped = d.sessions.filter((s) => s.kind === "skipped" && s.date >= from && s.date < to);
  for (const s of skipped) {
    const m = d.meetings.find((x) => x.id === s.meetingId);
    if (m) items.push({ date: s.date, line: `- ${dayLabel(s.date)} · ${meetingName(d, m)} — skipped [${s.id}]` });
  }
  if (!items.length) return `Nothing scheduled ${from} → ${to}.`;
  items.sort((a, b) => a.date.localeCompare(b.date));
  return [`# Schedule ${from} → ${to}`, ...items.map((i) => i.line)].join("\n");
}

// ── Follow-ups ────────────────────────────────────────────────────────────

export function followUpLine(f: FollowUp): string {
  return `- [${f.id}] ${f.text} (${f.status}, opened ${f.openedOn}${f.closedOn ? `, closed ${f.closedOn}` : ""})`;
}

export function formatFollowUps(
  d: Doc,
  filter: { subjectId?: string; meetingId?: string; status?: FollowUp["status"] }
): string {
  let items = d.followUps;
  if (filter.subjectId) items = items.filter((f) => f.subjectId === filter.subjectId);
  if (filter.meetingId) items = items.filter((f) => f.meetingId === filter.meetingId);
  items = items.filter((f) => f.status === (filter.status ?? "open"));
  if (!items.length) return "No follow-ups match.";
  return items
    .map((f) => {
      const m = f.meetingId ? d.meetings.find((x) => x.id === f.meetingId) : undefined;
      return `${followUpLine(f)}${m ? ` · ${meetingName(d, m)}` : ""}`;
    })
    .join("\n");
}

// ── People, teams, managers ───────────────────────────────────────────────

function meetingsOf(d: Doc, kind: TrackedMeeting["subjectKind"], id: string): string[] {
  return d.meetings
    .filter((m) => m.subjectKind === kind && m.subjectId === id)
    .map((m) => `- [${m.id}] ${meetingName(d, m)} · ${readinessLine(readinessOf(m, d))}`);
}

function prayerLines(d: Doc, subject: { prayer?: Person["prayer"] }, id: string): string[] {
  const out: string[] = [];
  if (subject.prayer) {
    out.push(
      `Prayer: ${PRAYER_LABEL[prayerState(subject.prayer)]}${subject.prayer.focus ? ` — ${subject.prayer.focus}` : ""}${subject.prayer.lastPrayedOn ? ` (last ${subject.prayer.lastPrayedOn})` : ""}`
    );
  }
  const entries = d.prayers.filter((e) => e.subjectId === id);
  for (const e of entries.filter((x) => !x.answeredOn).slice(-6)) {
    out.push(`- [${e.id}] ${e.kind}: ${e.text} (${e.date})`);
  }
  return out;
}

function leadUpLines(u?: Person["leadUp"]): string[] {
  if (!u) return [];
  const out = ["Lead-up manual:"];
  if (u.archetype) out.push(`- Archetype: ${u.archetype}`);
  if (u.winsLike) out.push(`- Wins like: ${u.winsLike}`);
  if (u.currency) out.push(`- Currency: ${u.currency}`);
  if (u.anxieties) out.push(`- Anxieties: ${u.anxieties}`);
  if (u.comms) out.push(`- Comms: ${u.comms}`);
  if (u.theirScorecard) out.push(`- Their scorecard: ${u.theirScorecard}`);
  return out.length > 1 ? out : [];
}

export function formatPerson(d: Doc, person: Person): string {
  const team = d.teams.find((t) => t.id === person.teamId);
  const a = person.assessments;
  const lines = [
    `# ${person.name}${person.role ? ` · ${person.role}` : ""} [${person.id}]`,
    team ? `Team: ${team.name} [${team.id}]` : "Direct report (no team)",
  ];
  const h = healthLine("Health", person.health);
  if (h) lines.push(h);
  lines.push(...prayerLines(d, person, person.id));
  const assess = [
    a.cliftonTop5?.length ? `Clifton ${a.cliftonTop5.join(", ")}` : "",
    a.enneagram ? `Enneagram ${a.enneagram}` : "",
    a.mbti ? `MBTI ${a.mbti}` : "",
    ...(person.customModalities ?? []).map((c) => `${c.name} ${c.result}`),
  ].filter(Boolean);
  if (assess.length) lines.push(`Assessments: ${assess.join(" · ")}`);
  if (person.howToLead) lines.push(`How to lead: ${person.howToLead}`);
  if (person.strengths.length) lines.push(`Strengths: ${person.strengths.join("; ")}`);
  if (person.watchOuts.length) lines.push(`Watch-outs: ${person.watchOuts.join("; ")}`);
  lines.push(...leadUpLines(person.leadUp));
  lines.push("", "## Meetings", ...(meetingsOf(d, "person", person.id).length ? meetingsOf(d, "person", person.id) : [person.noMeeting ? "Deliberately no meeting." : "None tracked."]));
  const fu = d.followUps.filter((f) => f.subjectId === person.id && f.status === "open");
  if (fu.length) lines.push("", "## Open follow-ups", ...fu.map(followUpLine));
  const notes = d.notes.filter((n) => n.personId === person.id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6);
  if (notes.length) lines.push("", "## Recent notes", ...notes.map((n) => `- [${n.id}] ${n.date} ${n.body.split("\n")[0]}`));
  return lines.join("\n");
}

export function formatTeam(d: Doc, team: Team): string {
  const members = d.people.filter((p) => p.teamId === team.id);
  const leader = team.leaderId ? d.people.find((p) => p.id === team.leaderId) : undefined;
  const lines = [
    `# ${team.name} [${team.id}]`,
    team.purpose ? `Mandate: ${team.purpose}` : "",
    team.description ?? "",
    leader ? `Led by ${leader.name} (delegated)` : "",
    healthLine("Health", team.health) ?? "Health: unrated",
    ...prayerLines(d, team, team.id),
    "",
    "## Roster",
    ...(members.length ? members.map((p) => `- [${p.id}] ${p.name}${p.role ? ` · ${p.role}` : ""}${p.health ? ` · ${HEALTH_LABEL[p.health.level]}` : ""}`) : ["(nobody yet)"]),
    "",
    "## Meetings",
    ...(meetingsOf(d, "team", team.id).length ? meetingsOf(d, "team", team.id) : [team.noMeeting ? "Deliberately no meeting." : "None tracked."]),
  ].filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== ""));
  const notes = d.teamNotes.filter((n) => n.teamId === team.id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6);
  if (notes.length) lines.push("", "## Recent notes", ...notes.map((n) => `- [${n.id}] ${n.date} ${n.body.split("\n")[0]}`));
  return lines.join("\n");
}

export function formatManager(d: Doc, manager: Manager): string {
  const lines = [
    `# ${manager.name}${manager.role ? ` · ${manager.role}` : ""} [${manager.id}] — someone I report to`,
    ...prayerLines(d, manager, manager.id),
    ...leadUpLines(manager.leadUp),
    "",
    "## Meetings",
    ...(meetingsOf(d, "manager", manager.id).length ? meetingsOf(d, "manager", manager.id) : [manager.noMeeting ? "Deliberately no meeting." : "None tracked."]),
  ];
  const wins = d.wins.filter((w) => w.personId === manager.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (wins.length) lines.push("", "## Wins banked", ...wins.map((w) => `- [${w.id}] ${w.date} ${w.text}${w.impact ? ` — ${w.impact}` : ""}`));
  const notes = d.notes.filter((n) => n.personId === manager.id).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6);
  if (notes.length) lines.push("", "## Recent notes", ...notes.map((n) => `- [${n.id}] ${n.date} ${n.body.split("\n")[0]}`));
  return lines.join("\n");
}

export function formatOrg(d: Doc): string {
  const lines = [`# Org — ${d.me.name}`];
  if (d.managers.length) {
    lines.push("", "## I report to");
    for (const m of d.managers) lines.push(`- [${m.id}] ${m.name}${m.role ? ` · ${m.role}` : ""}`);
  }
  const teamBlock = (team: Team, depth: number) => {
    const pad = "  ".repeat(depth);
    const members = d.people.filter((p) => p.teamId === team.id);
    lines.push(
      `${pad}- [${team.id}] ${team.name}${team.health ? ` · ${HEALTH_LABEL[team.health.level]}` : ""}${team.direction === "up" ? " · (up)" : ""}`
    );
    for (const p of members) lines.push(`${pad}    · [${p.id}] ${p.name}${p.role ? ` — ${p.role}` : ""}`);
    for (const child of d.teams.filter((t) => t.parentId === team.id)) teamBlock(child, depth + 1);
  };
  for (const domain of [...d.domains, { id: undefined, name: "No domain", color: "" }]) {
    const roots = d.teams.filter((t) => t.domainId === domain.id && !t.parentId);
    if (!roots.length) continue;
    lines.push("", `## ${domain.name}${domain.id ? ` [${domain.id}]` : ""}`);
    for (const t of roots.sort((a, b) => a.order - b.order)) teamBlock(t, 0);
  }
  const directs = d.people.filter((p) => !p.teamId);
  if (directs.length) {
    lines.push("", "## Direct reports without a team");
    for (const p of directs) lines.push(`- [${p.id}] ${p.name}${p.role ? ` · ${p.role}` : ""}`);
  }
  return lines.join("\n");
}
