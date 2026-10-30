import type { Arc, ArcStep, Session, Takeaway, Topic, TrackedMeeting } from "../types";
import { heldSessions, sessionsFor, todayISO } from "./readiness.ts";
import { plannedSlots, type Slot } from "./topics.ts";

/**
 * Arcs: something worked through across a meeting's occurrences, one step at
 * a time.
 *
 * An arc stores a position (the first step not yet done) and a pace (one step
 * every N meetings), never a schedule. Every plan you see is drawn here, from
 * those two and the occurrences the rhythm projects — so a skipped week slides
 * the arc, a rescheduled meeting takes its step with it, and a step that ran
 * long simply stays put. Nothing ever needs re-planning.
 *
 * Pure on purpose: the shared page runs this same file against the slice of
 * the meeting the guest is allowed to see.
 */

/** Book-cover grounds. The arc's one bit of identity; text is always light. */
export const ARC_COVERS = [
  "#1f3b4d",
  "#5b2a33",
  "#2f4a34",
  "#4a3a6a",
  "#6b4a1f",
  "#22201e",
] as const;

export function coverOf(arc: Pick<Arc, "cover" | "id">): string {
  const i =
    arc.cover ??
    [...arc.id].reduce((n, ch) => (n + ch.charCodeAt(0)) % ARC_COVERS.length, 0);
  return ARC_COVERS[((i % ARC_COVERS.length) + ARC_COVERS.length) % ARC_COVERS.length];
}

/** The arcs on a meeting, finished ones last. */
export function arcsFor(arcs: Arc[], meetingId: string): Arc[] {
  const rank = { active: 0, paused: 1, done: 2 } as const;
  return arcs
    .filter((a) => a.meetingId === meetingId)
    .sort((a, b) => rank[a.status] - rank[b.status] || a.order - b.order);
}

/** The ones still being worked through. */
export function liveArcs(arcs: Arc[], meetingId: string): Arc[] {
  return arcsFor(arcs, meetingId).filter((a) => a.status !== "done");
}

/** Index of the step we're on, or -1 once every step is done. */
export function currentIndex(arc: Arc): number {
  return arc.steps.findIndex((s) => s.status !== "done");
}

export function currentStep(arc: Arc): ArcStep | null {
  const i = currentIndex(arc);
  return i >= 0 ? arc.steps[i] : null;
}

export type ArcProgress = {
  done: number;
  total: number;
  /** 1-based position of the current step; total + 1 when finished. */
  at: number;
};

export function progressOf(arc: Arc): ArcProgress {
  const done = arc.steps.filter((s) => s.status === "done").length;
  const i = currentIndex(arc);
  return { done, total: arc.steps.length, at: i < 0 ? arc.steps.length + 1 : i + 1 };
}

/** It took more than one meeting — the ½ on the ribbon. */
export function tookLonger(step: ArcStep): boolean {
  return step.coveredIn.length > 1;
}

/**
 * How a step stands on one occurrence.
 *  - `done`  — finished in this meeting
 *  - `again` — talked about here, carried on next time
 *  - `now`   — the first occurrence ahead; what to prepare for
 *  - `later` — projected further out
 */
export type StepState = "done" | "again" | "now" | "later";

export type PlannedStep = {
  step: ArcStep;
  index: number;
  state: StepState;
};

/**
 * Lay an arc over a run of occurrences. Keyed by occurrence date.
 *
 * Occurrences that already hold a step — past ones, and today's once it's
 * been marked — show what happened there. Every other occurrence ahead, from
 * `startsOn`, takes the next step in turn at the arc's pace. A paused arc
 * shows its history and projects nothing.
 */
export function arcPlan(arc: Arc, slots: Slot[]): Map<string, PlannedStep[]> {
  const out = new Map<string, PlannedStep[]>();
  const bySession = new Map<string, PlannedStep[]>();
  arc.steps.forEach((step, index) => {
    step.coveredIn.forEach((sid, k) => {
      const last = k === step.coveredIn.length - 1;
      const state: StepState = step.status === "done" && last ? "done" : "again";
      const list = bySession.get(sid) ?? [];
      list.push({ step, index, state });
      bySession.set(sid, list);
    });
  });

  const start = currentIndex(arc);
  const every = Math.max(1, Math.round(arc.every || 1));
  let k = 0;
  for (const slot of [...slots].sort((a, b) => a.date.localeCompare(b.date))) {
    const covered = slot.sessionId ? bySession.get(slot.sessionId) : undefined;
    if (covered?.length) {
      out.set(slot.date, covered);
      continue;
    }
    if (slot.past || slot.date < arc.startsOn) continue;
    // A week pushed back holds no step: the arc waits for the next one.
    if (slot.sessionId && arc.passedIn?.includes(slot.sessionId)) continue;
    if (arc.status !== "active" || start < 0) continue;
    if (k % every === 0) {
      const index = start + k / every;
      const step = arc.steps[index];
      if (step) out.set(slot.date, [{ step, index, state: k === 0 ? "now" : "later" }]);
    }
    k += 1;
  }
  return out;
}

/** What the arc holds for one occurrence, if anything. */
export function stepsOn(arc: Arc, slots: Slot[], date: string): PlannedStep[] {
  return arcPlan(arc, slots).get(date) ?? [];
}

/**
 * The meeting that just happened without the arc being touched — "did you get
 * to Ch. 4 on the 22nd?" Only the most recent one: asking about a month of
 * history would be a chore, and the pace already carries on regardless.
 */
export function unmarkedSession(
  arc: Arc,
  sessions: Session[],
  today: string = todayISO()
): Session | null {
  if (arc.status !== "active" || currentIndex(arc) < 0) return null;
  const held = heldSessions(sessionsFor(arc.meetingId, sessions)).filter(
    (s) => s.date < today && s.date >= arc.startsOn
  );
  const sorted = held.sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  if (arc.passedIn?.includes(last.id)) return null;
  if (arc.steps.some((s) => s.coveredIn.includes(last.id))) return null;
  return last;
}

export type StepMark = "done" | "again";

/**
 * Record what happened to a step in one occurrence. Marking the last step done
 * closes the arc — the closing page is the reward, not another button.
 */
export function markStep(
  arc: Arc,
  stepId: string,
  sessionId: string,
  mark: StepMark,
  today: string = todayISO()
): Arc {
  const steps = arc.steps.map((s) => {
    if (s.id !== stepId) return s;
    const coveredIn = s.coveredIn.includes(sessionId)
      ? s.coveredIn
      : [...s.coveredIn, sessionId];
    return mark === "done"
      ? { ...s, coveredIn, status: "done" as const, doneOn: today }
      : { ...s, coveredIn, status: "upcoming" as const, doneOn: undefined };
  });
  const finished = steps.length > 0 && steps.every((s) => s.status === "done");
  return {
    ...arc,
    steps,
    passedIn: arc.passedIn?.filter((id) => id !== sessionId),
    status: finished ? "done" : arc.status === "done" ? "active" : arc.status,
    closedOn: finished ? (arc.closedOn ?? today) : undefined,
  };
}

/** Take back a mark made by mistake. */
export function unmarkStep(arc: Arc, stepId: string, sessionId: string): Arc {
  const steps = arc.steps.map((s) => {
    if (s.id !== stepId) return s;
    const coveredIn = s.coveredIn.filter((id) => id !== sessionId);
    return { ...s, coveredIn, status: "upcoming" as const, doneOn: undefined };
  });
  return {
    ...arc,
    steps,
    status: arc.status === "done" ? "active" : arc.status,
    closedOn: undefined,
  };
}

/** Dates the arc spans and how many meetings it took, for the closing page. */
export function arcSpan(
  arc: Arc,
  sessions: Session[]
): { from: string | null; to: string | null; meetings: number } {
  const ids = new Set(arc.steps.flatMap((s) => s.coveredIn));
  const held = sessions.filter((s) => ids.has(s.id)).map((s) => s.date).sort();
  return { from: held[0] ?? null, to: held[held.length - 1] ?? null, meetings: held.length };
}

/** The practices that came back ticked — "9 of 12 kept". */
export function practicesKept(
  arc: Arc,
  followUps: { status: string; text: string; meetingId?: string }[]
): { kept: number; total: number } {
  const withPractice = arc.steps.filter((s) => s.practice);
  const kept = withPractice.filter((s) =>
    followUps.some(
      (f) =>
        f.status === "done" &&
        f.text === practiceText(s) &&
        (!f.meetingId || f.meetingId === arc.meetingId)
    )
  ).length;
  return { kept, total: withPractice.length };
}

/** The follow-up a step's practice becomes once the step is done. */
export function practiceText(step: Pick<ArcStep, "practice">): string {
  return `Try: ${step.practice ?? ""}`.trim();
}

/** Takeaways for one step, mine first. */
export function takeawaysFor(takeaways: Takeaway[], stepId: string): Takeaway[] {
  return takeaways
    .filter((t) => t.stepId === stepId && t.text.trim())
    .sort((a, b) => (a.by === "owner" ? -1 : b.by === "owner" ? 1 : a.by.localeCompare(b.by)));
}

/** Stable row ids, so each chair only ever writes its own row. */
export const takeawayId = (stepId: string, by: string) => `${stepId}:${by}`;
export const sharedNoteId = (sessionId: string, by: string) => `${sessionId}:${by}`;

/**
 * How to say where a step sits: "Ch. 4" when its label leads with a short
 * marker, otherwise "Step 4" — "Salt and light of 8" reads as nonsense.
 */
export function stepTag(arc: Arc, step: Pick<ArcStep, "id" | "label">): string {
  const head = step.label.split(/\s[·—–]\s|:\s/)[0]?.trim();
  if (head && head !== step.label && head.length <= 14) return head;
  return `Step ${arc.steps.findIndex((s) => s.id === step.id) + 1}`;
}

/** "Ch. 4 · Start with Heart" → "Ch. 4" for tight places. */
export function shortLabel(step: Pick<ArcStep, "label">): string {
  const head = step.label.split(/\s[·—–-]\s|:\s/)[0]?.trim();
  return head && head.length <= 14 ? head : step.label;
}

/**
 * The step each live arc puts on a meeting's next occurrence — Today's
 * one-liner, "Crucial Conversations · Ch. 4".
 */
export function nextArcSteps(
  arcs: Arc[],
  meeting: TrackedMeeting,
  sessions: Session[],
  topics: Topic[],
  today: string = todayISO()
): { arc: Arc; step: ArcStep; date: string }[] {
  const live = liveArcs(arcs, meeting.id).filter((a) => a.status === "active");
  if (!live.length) return [];
  const next = plannedSlots(meeting, sessions, topics, today, 2).find((s) => !s.past);
  if (!next) return [];
  return live.flatMap((arc) =>
    stepsOn(arc, [next], next.date)
      .filter((p) => p.state !== "done")
      .map((p) => ({ arc, step: p.step, date: next.date }))
  );
}

// ── Seeing an edit land ────────────────────────────────────────────────────

/**
 * An arc with new steps, its status settled the way marking settles it: a
 * finished arc given a step it hasn't done opens again, and one left with
 * nothing to do closes.
 */
export function withSteps(arc: Arc, steps: ArcStep[], today: string = todayISO()): Arc {
  const finished = steps.length > 0 && steps.every((s) => s.status === "done");
  return {
    ...arc,
    steps,
    status: finished ? "done" : arc.status === "done" ? "active" : arc.status,
    closedOn: finished ? (arc.closedOn ?? today) : undefined,
  };
}

export type AheadRow = {
  date: string;
  /** What this meeting holds once saved, or null for a week the arc leaves free. */
  label: string | null;
  /** What it holds now, when that's different. Absent = unchanged. */
  was?: string | null;
};

export type AheadPreview = {
  rows: AheadRow[];
  /** The meeting the last step lands on, once every step has a week. */
  ends?: string;
  /** Where it ended before the edit, when that moved. */
  endedBefore?: string;
};

/**
 * The meetings ahead as an edit would leave them, beside how they stand now.
 * An edit that moves steps says which weeks it moves; one that doesn't (a
 * step's wording, its questions) shows nothing changed rather than leaving
 * you to wonder why the board looks the same. Rows run to the later of the
 * two last steps.
 */
export function aheadPreview(next: Arc, before: Arc | undefined, slots: Slot[]): AheadPreview {
  const ahead = slots.filter((s) => !s.past).sort((a, b) => a.date.localeCompare(b.date));
  const labelsOn = (arc: Arc) => {
    const plan = arcPlan(arc, ahead);
    return (date: string) => {
      const here = plan.get(date);
      return here?.length ? here.map((p) => p.step.label).join(" + ") : null;
    };
  };
  const lastOf = (arc: Arc): string | undefined => {
    const plan = arcPlan(arc, ahead);
    const last = arc.steps.length - 1;
    if (last < 0 || arc.status !== "active") return undefined;
    return ahead.find((s) => plan.get(s.date)?.some((p) => p.index === last && p.state !== "done"))?.date;
  };
  const now = labelsOn(next);
  const then = before ? labelsOn(before) : null;
  const ends = lastOf(next);
  const endedBefore = before ? lastOf(before) : undefined;
  const until = [ends, endedBefore].filter(Boolean).sort().pop();

  const rows: AheadRow[] = [];
  for (const s of ahead) {
    if (until && s.date > until) break;
    const label = now(s.date);
    const was = then ? then(s.date) : undefined;
    if (label === null && (was === null || was === undefined) && rows.length === 0) continue;
    rows.push(was === undefined || was === label ? { date: s.date, label } : { date: s.date, label, was });
  }
  // A plan that runs past the weeks in view ends nowhere we can name.
  while (rows.length && rows[rows.length - 1].label === null && rows[rows.length - 1].was == null) rows.pop();
  return { rows, ends, endedBefore: before && endedBefore !== ends ? endedBefore : undefined };
}

// ── Spotting an arc you're already running by hand ─────────────────────────

/** Words that say "this is part of a series" rather than what the series is. */
const SERIES_NOISE = new Set(
  (
    "go goes going over through discuss discussing review reviewing read reading finish start continue continued " +
    "check in pt part parts ch chap chapter chapters section session week wk day the a an and or of on with for " +
    "to our my your about re more next from at by into up out cont"
  ).split(" ")
);

/** "Pt 1", "Part 2", "Ch. 3", "week 4", "2 of 7", "#5". */
const SERIES_MARKER = /\b(pt|part|ch|chap|chapter|session|week|wk)\.?\s*\d+\b|\b\d+\s*(of|\/)\s*\d+\b|#\d+/i;

export type ArcSuggestion = {
  /** The repeated phrase, as first written. */
  title: string;
  /** How many weeks (or unplaced items) it turns up in. */
  weeks: number;
  /** The earliest week ahead that already has one, if any. */
  startsOn?: string;
};

const words = (text: string) => text.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
const isNoise = (w: string) => SERIES_NOISE.has(w.toLowerCase()) || /^\d+$/.test(w);
const titleCase = (s: string) =>
  s === s.toLowerCase() ? s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s;

/**
 * A book (or anything) you're already working through by hand: the same
 * phrase in two or more weeks' items, at least one of them numbered like a
 * series ("Pt 1", "Ch. 2"), or in three weeks or more. Phrases of two words
 * up, so a weekly "Budget" never qualifies on its own, and nothing an arc on
 * this meeting already covers, or that was waved off.
 */
export function arcSuggestion(
  meetingId: string,
  topics: Topic[],
  sessions: Session[],
  arcs: Arc[],
  today: string,
  dismissed: string[] = []
): ArcSuggestion | null {
  const mine = topics.filter((t) => t.meetingId === meetingId && t.status !== "dropped");
  const taken = arcs
    .filter((a) => a.meetingId === meetingId)
    .map((a) => a.title.toLowerCase())
    .concat(dismissed.map((d) => d.toLowerCase()));
  const dateOf = new Map(sessions.map((s) => [s.id, s.date]));

  type Hit = { title: string; places: Set<string>; marked: boolean; dates: string[]; n: number; first: number };
  const hits = new Map<string, Hit>();
  mine.forEach((t, order) => {
    const ws = words(t.text);
    const place = t.sessionId ?? `topic:${t.id}`;
    const marked = SERIES_MARKER.test(t.text);
    const seen = new Set<string>();
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < Math.min(ws.length, i + 6); j++) {
        const gram = ws.slice(i, j + 1);
        if (isNoise(gram[0]) || isNoise(gram[gram.length - 1])) continue;
        if (!gram.some((w) => !isNoise(w) && w.length >= 4)) continue;
        const key = gram.join(" ").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const hit = hits.get(key) ?? { title: gram.join(" "), places: new Set(), marked: false, dates: [], n: gram.length, first: order };
        hit.places.add(place);
        hit.marked ||= marked;
        const d = t.sessionId ? dateOf.get(t.sessionId) : undefined;
        if (d) hit.dates.push(d);
        hits.set(key, hit);
      }
    }
  });

  const best = [...hits.entries()]
    .filter(([, h]) => h.places.size >= 2 && (h.marked || h.places.size >= 3))
    .filter(([key]) => !taken.some((t) => t.includes(key) || key.includes(t)))
    .sort(([, a], [, b]) => b.places.size - a.places.size || b.n - a.n || a.first - b.first)[0];
  if (!best) return null;
  const [, h] = best;
  const ahead = h.dates.filter((d) => d >= today).sort();
  return { title: titleCase(h.title), weeks: h.places.size, startsOn: ahead[0] };
}

// ── Moving a step on the board ─────────────────────────────────────────────

export type ArcMove = {
  /** Weeks that will hold no step of this arc, so the step lands later. */
  wait: Slot[];
  /** Weeks that were waiting and will take a step again, so it lands earlier. */
  unwait: string[];
};

/**
 * Drag a step from one week to another. Later: every week from where it is up
 * to the target waits, so this step and everything after it slide along.
 * Earlier: only weeks that were waiting can be given back, because a step
 * never jumps the one before it. Null when there's nothing to change.
 */
export function arcMove(arc: Arc, slots: Slot[], fromDate: string, toDate: string): ArcMove | null {
  if (toDate === fromDate) return null;
  const ahead = [...slots].filter((s) => !s.past).sort((a, b) => a.date.localeCompare(b.date));
  const covered = new Set(arc.steps.flatMap((s) => s.coveredIn));
  const passed = new Set(arc.passedIn ?? []);
  if (toDate > fromDate) {
    const wait = ahead.filter(
      (s) =>
        s.date >= fromDate &&
        s.date < toDate &&
        !(s.sessionId && (covered.has(s.sessionId) || passed.has(s.sessionId)))
    );
    return wait.length ? { wait, unwait: [] } : null;
  }
  const unwait = ahead
    .filter((s) => s.date >= toDate && s.date < fromDate && s.sessionId && passed.has(s.sessionId))
    .map((s) => s.sessionId as string);
  return unwait.length ? { wait: [], unwait } : null;
}
