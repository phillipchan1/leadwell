import type { Arc, Fixture, GlossaryTerm, Manager, Me, MeetingShare, Person, Tag, Team, TrackedMeeting } from "../types";
import { meetingSubjectName, meetingTitle } from "./readiness";

export type VocabularySource = {
  me: Me;
  meetings: TrackedMeeting[];
  people: Person[];
  teams: Team[];
  managers: Manager[];
  arcs: Arc[];
  tags: Tag[];
  shares: MeetingShare[];
  glossary: GlossaryTerm[];
  fixtures: Fixture[];
};

/** Room for the words; the rest of the prompt is what was just said. */
const VOCAB_CHARS = 650;
const TAIL_CHARS = 350;

/**
 * What the transcriber should expect to hear in this meeting — the words that
 * make "Meghan" and "Crucial Conversations" come back spelled right.
 *
 * Closest first, because the prompt has a budget and the end of the list is
 * what gets cut: who is in the room, then the glossary (words you've already
 * had to correct once), the meeting's own words (its arcs and its standing
 * agenda), then everyone else you lead — a 1:1 is where other people get
 * talked about — and the workspace's tags last.
 */
export function meetingVocabulary(src: VocabularySource, meetingId: string): string[] {
  const meeting = src.meetings.find((m) => m.id === meetingId);
  const words: string[] = [];
  if (src.me.name) words.push(src.me.name);
  if (meeting) {
    const subject = meetingSubjectName(meeting, src);
    if (subject) words.push(subject);
    if (meeting.subjectKind === "team") {
      const team = src.teams.find((t) => t.id === meeting.subjectId);
      const leader = team?.leaderId ? src.people.find((p) => p.id === team.leaderId) : undefined;
      if (leader) words.push(leader.name);
      for (const p of src.people) if (p.teamId === meeting.subjectId) words.push(p.name);
    }
    for (const s of src.shares) if (s.meetingId === meeting.id && s.name) words.push(s.name);
  }
  for (const g of src.glossary) words.push(g.meant);
  if (meeting) {
    const subject = meetingSubjectName(meeting, src);
    words.push(meetingTitle(meeting, subject));
    for (const a of src.arcs) {
      if (a.meetingId !== meeting.id || a.status === "done") continue;
      words.push(a.title);
      if (a.author) words.push(a.author);
    }
    for (const slot of meeting.curriculum ?? []) words.push(slot.label);
    for (const f of src.fixtures) {
      if (f.subjectKind === meeting.subjectKind && f.subjectId === meeting.subjectId) words.push(f.title);
    }
  }
  for (const p of src.people) words.push(p.name);
  for (const t of src.teams) words.push(t.name);
  for (const m of src.managers) words.push(m.name);
  for (const t of src.tags) words.push(t.label);
  return dedupe(words);
}

/**
 * The prompt for one segment: the vocabulary, then the end of what's been
 * heard so far, so a sentence cut by the segment boundary carries on.
 */
export function transcriptionPrompt(
  src: VocabularySource,
  meetingId: string,
  heardSoFar = ""
): string {
  let list = "";
  for (const w of meetingVocabulary(src, meetingId)) {
    const next = list ? `${list}, ${w}` : w;
    if (next.length > VOCAB_CHARS) break;
    list = next;
  }
  const tail = tailAtWord(heardSoFar, TAIL_CHARS);
  return [list && `${list}.`, tail].filter(Boolean).join("\n\n");
}

function dedupe(words: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = raw.trim();
    const key = w.toLowerCase();
    if (!w || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

function tailAtWord(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(-max);
  const space = cut.indexOf(" ");
  return space > 0 ? cut.slice(space + 1) : cut;
}
