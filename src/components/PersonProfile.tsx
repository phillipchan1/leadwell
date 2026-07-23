import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { Person } from "../types";
import {
  DOMAIN_COLOR,
  DOMAINS,
  MBTI,
  parseEnneagram,
  THEME_DOMAIN,
} from "../data/frameworks";
import { derivedRead } from "../lib/derive";
import { Avatar } from "./Avatar";
import { Badge, Chip, ProgressBar, SectionTitle, inputCls } from "./ui";
import { AssessmentEditor } from "./AssessmentEditor";
import { PersonModal } from "./forms";
import { AICoach } from "./AICoach";
import { OneOnOneTable } from "./OneOnOneTable";
import { MeetingEditor } from "./MeetingEditor";
import { TopicKanban } from "./TopicKanban";
import { WritingPad } from "./WritingPad";
import { MarkdownBody } from "./MarkdownBody";
import { LeadUpManual } from "./LeadUpManual";
import { WinsLedger } from "./WinsLedger";

type PersonTab = "profile" | "oneOnOnes" | "topics" | "notes";

const PERSON_TABS: { id: PersonTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "oneOnOnes", label: "1:1s" },
  { id: "topics", label: "Topics" },
  { id: "notes", label: "Notes" },
];

export function PersonProfile({
  person,
  nested = false,
}: {
  person: Person;
  /** True when opened from a team — show back + teammate prev/next. */
  nested?: boolean;
}) {
  const {
    teams,
    capacities,
    people,
    selectPerson,
    deletePerson,
    modal,
    askAIOpen,
    settingsOpen,
    oneOnOnes,
    addOneOnOne,
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    notes,
    addNote,
    updateNote,
    deleteNote,
  } = useStore();

  const team = teams.find((t) => t.id === person.teamId);
  const capacity = capacities.find((c) => c.id === team?.capacityId);
  // People on an "up" team are those I report to — leading up, not down.
  const isLeadUp = team?.direction === "up";
  const read = derivedRead(person);
  const enn = parseEnneagram(person.assessments.enneagram);
  const top5 = person.assessments.cliftonTop5 ?? [];
  const mbtiKey = person.assessments.mbti?.toUpperCase();
  const hasAssessments = top5.length > 0 || enn || mbtiKey;

  const teammates = people.filter((p) => p.teamId === person.teamId);
  const teammateIndex = teammates.findIndex((p) => p.id === person.id);
  const prevTeammate = teammateIndex > 0 ? teammates[teammateIndex - 1] : null;
  const nextTeammate =
    teammateIndex >= 0 && teammateIndex < teammates.length - 1
      ? teammates[teammateIndex + 1]
      : null;

  const myOneOnOnes = oneOnOnes
    .filter((o) => o.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myGoals = goals.filter((g) => g.personId === person.id);
  const myNotes = notes
    .filter((n) => n.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastOneOnOne = myOneOnOnes.find((o) => o.notes?.trim());
  const nextOneOnOne = myOneOnOnes.find((o) => o.nextDate)?.nextDate;

  const [tab, setTab] = useState<PersonTab>("profile");
  const [editingAssessments, setEditingAssessments] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [openMeetingId, setOpenMeetingId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [composingNote, setComposingNote] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");

  // Reset tab/editor when switching people
  useEffect(() => {
    setTab("profile");
    setOpenMeetingId(null);
    setEditingNoteId(null);
    setComposingNote(false);
  }, [person.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (openMeetingId) {
        e.preventDefault();
        setOpenMeetingId(null);
        return;
      }
      if (
        modal ||
        askAIOpen ||
        settingsOpen ||
        editingAssessments ||
        editingPerson
      )
        return;
      e.preventDefault();
      selectPerson(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    modal,
    askAIOpen,
    settingsOpen,
    editingAssessments,
    editingPerson,
    openMeetingId,
    selectPerson,
  ]);

  useEffect(() => {
    if (!nested) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        modal ||
        askAIOpen ||
        settingsOpen ||
        editingAssessments ||
        editingPerson ||
        openMeetingId
      )
        return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevTeammate) {
        e.preventDefault();
        selectPerson(prevTeammate.id);
      } else if (e.key === "ArrowRight" && nextTeammate) {
        e.preventDefault();
        selectPerson(nextTeammate.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    nested,
    modal,
    askAIOpen,
    settingsOpen,
    editingAssessments,
    editingPerson,
    openMeetingId,
    prevTeammate,
    nextTeammate,
    selectPerson,
  ]);

  const startNewOneOnOne = () => {
    setTab("oneOnOnes");
    const id = addOneOnOne({
      personId: person.id,
      date: new Date().toISOString().slice(0, 10),
    });
    setOpenMeetingId(id);
  };

  const wideTab = tab === "oneOnOnes" || tab === "topics";

  return (
    <aside
      className={`relative flex h-full flex-col overflow-hidden border-l border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${
        wideTab ? "min-w-0" : ""
      }`}
      data-person-tab={tab}
    >
      {/* Nesting chrome: back to team + teammate pager */}
      {nested && team && (
        <div className="flex shrink-0 items-center gap-1 border-b border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-950/60">
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-medium text-stone-600 hover:bg-white hover:text-teal-700 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-teal-300"
            onClick={() => selectPerson(null)}
            title="Back to team"
          >
            <span aria-hidden>←</span>
            <span className="truncate">{team.name}</span>
          </button>
          <span className="shrink-0 text-[10px] tabular-nums text-stone-400">
            {teammateIndex + 1}/{teammates.length}
          </span>
          <button
            className="rounded-md px-2 py-1 text-sm text-stone-400 enabled:hover:bg-white enabled:hover:text-stone-700 disabled:opacity-30 dark:enabled:hover:bg-stone-800"
            disabled={!prevTeammate}
            onClick={() => prevTeammate && selectPerson(prevTeammate.id)}
            aria-label="Previous teammate"
            title={prevTeammate ? prevTeammate.name : undefined}
          >
            ‹
          </button>
          <button
            className="rounded-md px-2 py-1 text-sm text-stone-400 enabled:hover:bg-white enabled:hover:text-stone-700 disabled:opacity-30 dark:enabled:hover:bg-stone-800"
            disabled={!nextTeammate}
            onClick={() => nextTeammate && selectPerson(nextTeammate.id)}
            aria-label="Next teammate"
            title={nextTeammate ? nextTeammate.name : undefined}
          >
            ›
          </button>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 border-b border-stone-200 bg-white/90 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="flex items-start gap-3">
          <Avatar name={person.name} photo={person.photo} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{person.name}</h2>
            <div className="text-xs text-stone-500">
              {[person.role, !nested ? team?.name : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {capacity && (
              <div className="mt-1">
                <Badge color={capacity.color}>{capacity.label}</Badge>
              </div>
            )}
            <div className="mt-1 text-[11px] text-stone-400">
              {nextOneOnOne && `Next 1:1 ${nextOneOnOne}`}
              {nextOneOnOne && lastOneOnOne && " · "}
              {lastOneOnOne && `Last ${lastOneOnOne.date}`}
            </div>
          </div>
          <button
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
            aria-label={nested ? "Back to team" : "Close profile"}
            onClick={() => selectPerson(null)}
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <QuickAction onClick={startNewOneOnOne}>+ New 1:1</QuickAction>
          <QuickAction
            onClick={() => {
              setTab("topics");
            }}
          >
            + Add topic
          </QuickAction>
          <QuickAction onClick={() => setEditingAssessments(true)}>
            Assessments
          </QuickAction>
          <QuickAction onClick={() => setEditingPerson(true)}>Edit</QuickAction>
          <QuickAction
            danger
            onClick={() => {
              if (confirm(`Remove ${person.name}?`)) deletePerson(person.id);
            }}
          >
            Remove
          </QuickAction>
        </div>
      </div>

      {/* Internal tabs */}
      <nav className="flex shrink-0 gap-0.5 border-b border-stone-200 px-3 dark:border-stone-800">
        {PERSON_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-2.5 py-2 text-xs transition-colors ${
              tab === t.id
                ? "border-teal-600 font-medium text-teal-700 dark:text-teal-400"
                : "border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
            }`}
          >
            {t.label}
            {t.id === "oneOnOnes" && myOneOnOnes.length > 0 && (
              <span className="ml-1 text-[10px] text-stone-400">
                {myOneOnOnes.length}
              </span>
            )}
            {t.id === "notes" && myNotes.length > 0 && (
              <span className="ml-1 text-[10px] text-stone-400">
                {myNotes.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === "profile" && isLeadUp && (
          <div className="flex flex-col gap-6 p-4">
            <LeadUpManual key={person.id} person={person} />
            <WinsLedger person={person} />
            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach person={person} />
            </section>
          </div>
        )}

        {tab === "profile" && !isLeadUp && (
          <div className="flex flex-col gap-6 p-4">
            <section className="space-y-3">
              <SectionTitle>Assessment profile</SectionTitle>
              {!hasAssessments ? (
                <button
                  onClick={() => setEditingAssessments(true)}
                  className="w-full rounded-xl border border-dashed border-stone-300 py-6 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
                >
                  + Add assessments
                  <div className="mt-1 text-xs">
                    CliftonStrengths · Enneagram · MBTI
                  </div>
                </button>
              ) : (
                <>
                  {top5.length > 0 && (
                    <div>
                      <ol className="flex flex-wrap gap-1.5">
                        {top5.map((t, i) => (
                          <li
                            key={t}
                            className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
                            style={{
                              backgroundColor: DOMAIN_COLOR[THEME_DOMAIN[t]],
                            }}
                          >
                            {i + 1}. {t}
                          </li>
                        ))}
                      </ol>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {DOMAINS.map((d) => (
                          <span
                            key={d}
                            className="flex items-center gap-1 text-[10px] text-stone-400"
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: DOMAIN_COLOR[d] }}
                            />
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {enn && (
                      <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60">
                        <div className="text-[10px] tracking-wider text-stone-400 uppercase">
                          Enneagram
                        </div>
                        <div className="text-sm font-semibold">
                          {person.assessments.enneagram}
                        </div>
                        <div className="text-xs text-stone-500">{enn.name}</div>
                      </div>
                    )}
                    {mbtiKey && MBTI[mbtiKey] && (
                      <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60">
                        <div className="text-[10px] tracking-wider text-stone-400 uppercase">
                          MBTI
                        </div>
                        <div className="text-sm font-semibold">{mbtiKey}</div>
                        <div className="text-xs text-stone-500">
                          {MBTI[mbtiKey].split("—")[0].trim()}
                        </div>
                      </div>
                    )}
                  </div>
                  {(read.strengths.length > 0 || read.watchOuts.length > 0) && (
                    <div className="space-y-2">
                      {read.strengths.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {read.strengths.map((s) => (
                            <Chip key={s} tone="positive">
                              {s}
                            </Chip>
                          ))}
                        </div>
                      )}
                      {read.watchOuts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {read.watchOuts.map((s) => (
                            <Chip key={s} tone="warning">
                              ⚠ {s}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {person.howToLead && (
                    <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed text-stone-600 dark:bg-teal-950/20 dark:text-stone-300">
                      <span className="font-medium text-teal-700 dark:text-teal-400">
                        How to lead:{" "}
                      </span>
                      {person.howToLead}
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="space-y-2">
              <SectionTitle>Goals & progress</SectionTitle>
              <div className="space-y-2.5">
                {myGoals.map((g) => (
                  <div key={g.id} className="group">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex-1">{g.title}</span>
                      <span className="text-xs text-stone-400">
                        {Math.round(g.progress)}%
                      </span>
                      <button
                        className="text-stone-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                        aria-label="Delete goal"
                        onClick={() => deleteGoal(g.id)}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={g.progress}
                      onChange={(e) =>
                        updateGoal(g.id, { progress: Number(e.target.value) })
                      }
                      className="mb-0.5 w-full accent-teal-600"
                      style={{ height: 4 }}
                    />
                    <ProgressBar value={g.progress} />
                  </div>
                ))}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newGoal.trim()) return;
                  addGoal({
                    personId: person.id,
                    title: newGoal.trim(),
                    progress: 0,
                  });
                  setNewGoal("");
                }}
              >
                <input
                  className={inputCls}
                  placeholder="Add a goal…"
                  value={newGoal}
                  onChange={(e) => setNewGoal(e.target.value)}
                />
              </form>
            </section>

            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach person={person} />
            </section>
          </div>
        )}

        {tab === "oneOnOnes" && (
          <div className="p-4">
            <OneOnOneTable
              personId={person.id}
              onOpen={(id) => setOpenMeetingId(id)}
            />
          </div>
        )}

        {tab === "topics" && (
          <div className="space-y-3 p-4">
            <p className="text-xs text-stone-500">
              Park topics to talk about. Drag cards between columns — pull into
              This 1:1 before you meet.
            </p>
            <TopicKanban personId={person.id} />
          </div>
        )}

        {tab === "notes" && (
          <div className="flex flex-col gap-3 p-4">
            {!composingNote && (
              <button
                type="button"
                onClick={() => {
                  setComposingNote(true);
                  setNewNoteBody("");
                }}
                className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
              >
                + New note
              </button>
            )}
            {composingNote && (
              <div className="space-y-2">
                <WritingPad
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  placeholder="Quick note — context, observations, reminders…"
                  autoFocus
                  startEditing
                  dualMode={false}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs text-stone-400 hover:underline"
                    onClick={() => setComposingNote(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white"
                    onClick={() => {
                      if (!newNoteBody.trim()) return;
                      addNote(person.id, newNoteBody.trim());
                      setNewNoteBody("");
                      setComposingNote(false);
                    }}
                  >
                    Save note
                  </button>
                </div>
              </div>
            )}
            {myNotes.length === 0 && !composingNote && (
              <p className="text-center text-xs text-stone-400">
                No notes yet.
              </p>
            )}
            <ul className="space-y-3">
              {myNotes.map((n) => (
                <li key={n.id} className="group space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span>{n.date}</span>
                    <button
                      type="button"
                      className="opacity-0 hover:text-red-500 group-hover:opacity-100"
                      aria-label="Delete note"
                      onClick={() => deleteNote(n.id)}
                    >
                      ✕
                    </button>
                  </div>
                  {editingNoteId === n.id ? (
                    <WritingPad
                      value={n.body}
                      onChange={(e) =>
                        updateNote(n.id, { body: e.target.value })
                      }
                      onBlur={() => setEditingNoteId(null)}
                      autoFocus
                      startEditing
                      dualMode={false}
                    />
                  ) : (
                    <button
                      type="button"
                      className="journal-paper w-full text-left transition-opacity hover:opacity-90"
                      onClick={() => setEditingNoteId(n.id)}
                    >
                      <div className="journal-pad-inner py-4">
                        <MarkdownBody className="text-[0.95rem]">
                          {n.body}
                        </MarkdownBody>
                      </div>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {openMeetingId && (
          <MeetingEditor
            oneOnOneId={openMeetingId}
            onClose={() => setOpenMeetingId(null)}
          />
        )}
      </div>

      {editingAssessments && (
        <AssessmentEditor
          person={person}
          onClose={() => setEditingAssessments(false)}
        />
      )}
      {editingPerson && (
        <PersonModal person={person} onClose={() => setEditingPerson(false)} />
      )}
    </aside>
  );
}

function QuickAction({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 transition-colors ${
        danger
          ? "border-stone-200 text-stone-400 hover:border-red-300 hover:text-red-500 dark:border-stone-700"
          : "border-stone-200 text-stone-600 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:text-stone-300"
      }`}
    >
      {children}
    </button>
  );
}
