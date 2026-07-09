import { useState } from "react";
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

export function PersonProfile({ person }: { person: Person }) {
  const {
    teams,
    capacities,
    selectPerson,
    deletePerson,
    actions,
    addAction,
    toggleAction,
    deleteAction,
    oneOnOnes,
    addOneOnOne,
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    notes,
    addNote,
    deleteNote,
  } = useStore();

  const team = teams.find((t) => t.id === person.teamId);
  const capacity = capacities.find((c) => c.id === team?.capacityId);
  const read = derivedRead(person);
  const enn = parseEnneagram(person.assessments.enneagram);
  const top5 = person.assessments.cliftonTop5 ?? [];
  const mbtiKey = person.assessments.mbti?.toUpperCase();
  const hasAssessments = top5.length > 0 || enn || mbtiKey;

  const myActions = actions.filter((a) => a.personId === person.id);
  const myOneOnOnes = oneOnOnes
    .filter((o) => o.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myGoals = goals.filter((g) => g.personId === person.id);
  const myNotes = notes
    .filter((n) => n.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastOneOnOne = myOneOnOnes[0];
  const nextOneOnOne = myOneOnOnes.find((o) => o.nextDate)?.nextDate;

  const [editingAssessments, setEditingAssessments] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [newAction, setNewAction] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newNote, setNewNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");

  return (
    <aside className="flex h-full flex-col overflow-y-auto border-l border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 p-4 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90">
        <div className="flex items-start gap-3">
          <Avatar name={person.name} photo={person.photo} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{person.name}</h2>
            <div className="text-xs text-stone-500">
              {[person.role, team?.name].filter(Boolean).join(" · ")}
            </div>
            {capacity && (
              <div className="mt-1">
                <Badge color={capacity.color}>{capacity.label}</Badge>
              </div>
            )}
          </div>
          <button
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
            aria-label="Close profile"
            onClick={() => selectPerson(null)}
          >
            ✕
          </button>
        </div>
        {/* Quick actions */}
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <QuickAction onClick={() => setShowScheduler((v) => !v)}>
            📅 Schedule 1:1
          </QuickAction>
          <QuickAction onClick={() => setShowNoteInput((v) => !v)}>
            📝 Add note
          </QuickAction>
          <QuickAction onClick={() => setEditingAssessments(true)}>
            🧭 Edit assessments
          </QuickAction>
          <QuickAction onClick={() => setEditingPerson(true)}>
            ✎ Edit
          </QuickAction>
          <QuickAction
            danger
            onClick={() => {
              if (confirm(`Remove ${person.name}?`)) deletePerson(person.id);
            }}
          >
            Remove
          </QuickAction>
        </div>
        {showScheduler && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!scheduleDate) return;
              addOneOnOne({
                personId: person.id,
                date: new Date().toISOString().slice(0, 10),
                nextDate: scheduleDate,
                notes: "Scheduled",
              });
              setShowScheduler(false);
              setScheduleDate("");
            }}
          >
            <input
              type="date"
              className={inputCls}
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
            <button className="rounded-lg bg-teal-600 px-3 text-xs font-medium text-white">
              Set
            </button>
          </form>
        )}
        {showNoteInput && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newNote.trim()) return;
              addNote(person.id, newNote.trim());
              setNewNote("");
              setShowNoteInput(false);
            }}
          >
            <input
              className={inputCls}
              placeholder="Quick note…"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              autoFocus
            />
            <button className="rounded-lg bg-teal-600 px-3 text-xs font-medium text-white">
              Add
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-6 p-4">
        {/* 1. Assessment profile */}
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
                  {/* Domain legend */}
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

        {/* 2. Next actions & 1:1 prep */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <SectionTitle>Next actions & 1:1 prep</SectionTitle>
            <span className="text-[11px] text-stone-400">
              {nextOneOnOne && `next 1:1 ${nextOneOnOne}`}
              {nextOneOnOne && lastOneOnOne && " · "}
              {lastOneOnOne && `last ${lastOneOnOne.date}`}
            </span>
          </div>
          <ul className="space-y-1">
            {myActions.map((a) => (
              <li key={a.id} className="group flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={a.done}
                  onChange={() => toggleAction(a.id)}
                  className="accent-teal-600"
                />
                <span
                  className={`flex-1 ${a.done ? "text-stone-400 line-through" : ""}`}
                >
                  {a.text}
                </span>
                {a.dueDate && (
                  <span className="text-[10px] text-stone-400">{a.dueDate}</span>
                )}
                <button
                  className="text-stone-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                  aria-label="Delete action"
                  onClick={() => deleteAction(a.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newAction.trim()) return;
              addAction(person.id, newAction.trim());
              setNewAction("");
            }}
          >
            <input
              className={inputCls}
              placeholder="Add action or 1:1 topic…"
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
            />
          </form>
        </section>

        {/* 3. Goals & progress */}
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
              addGoal({ personId: person.id, title: newGoal.trim(), progress: 0 });
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

        {/* Notes */}
        {myNotes.length > 0 && (
          <section className="space-y-2">
            <SectionTitle>Notes</SectionTitle>
            <ul className="space-y-1.5">
              {myNotes.map((n) => (
                <li
                  key={n.id}
                  className="group flex items-start gap-2 text-xs text-stone-600 dark:text-stone-300"
                >
                  <span className="shrink-0 text-stone-400">{n.date}</span>
                  <span className="flex-1">{n.body}</span>
                  <button
                    className="text-stone-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                    aria-label="Delete note"
                    onClick={() => deleteNote(n.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 4. AI coach */}
        <section className="space-y-2">
          <SectionTitle>AI coach</SectionTitle>
          <AICoach person={person} />
        </section>
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
