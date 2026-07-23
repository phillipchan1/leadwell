import { useEffect, useState, type CSSProperties } from "react";
import { useStore } from "../store/useStore";
import type { Team } from "../types";
import { isAssessed } from "../lib/derive";
import { Avatar } from "./Avatar";
import {
  Badge,
  IconChevronLeft,
  IconX,
  ProgressBar,
  SectionTitle,
  inputCls,
} from "./ui";
import { AICoach } from "./AICoach";
import { StatsBar } from "./StatsBar";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Team side panel — optimized for the leadership audit loop:
 * mandate → next steps → people → supporting detail.
 */
export function TeamProfile({
  team,
  nested = false,
}: {
  team: Team;
  /** True when a person panel is stacked on top of this team. */
  nested?: boolean;
}) {
  const {
    capacities,
    domains,
    teams,
    people,
    selectTeam,
    selectPerson,
    selectedPersonId,
    deleteTeam,
    updateTeam,
    openModal,
    modal,
    askAIOpen,
    teamActions,
    addTeamAction,
    updateTeamAction,
    toggleTeamAction,
    deleteTeamAction,
    teamGoals,
    addTeamGoal,
    updateTeamGoal,
    deleteTeamGoal,
    teamNotes,
    addTeamNote,
    deleteTeamNote,
  } = useStore();

  // Esc closes the team only when no person is drilled in (person pops first).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal || askAIOpen || selectedPersonId) return;
      e.preventDefault();
      selectTeam(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, askAIOpen, selectedPersonId, selectTeam]);

  const capacity = capacities.find((c) => c.id === team.capacityId);
  const domain = domains.find((d) => d.id === team.domainId);
  const parent = teams.find((t) => t.id === team.parentId);
  const subTeams = teams
    .filter((t) => t.parentId === team.id)
    .sort((a, b) => a.order - b.order);
  const members = people.filter((p) => p.teamId === team.id);
  const accent = domain?.color ?? capacity?.color ?? "#0D9488";

  const openActions = teamActions.filter((a) => a.teamId === team.id && !a.done);
  const doneActions = teamActions.filter((a) => a.teamId === team.id && a.done);
  const myGoals = teamGoals.filter((g) => g.teamId === team.id);
  const myNotes = teamNotes
    .filter((n) => n.teamId === team.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const [mandate, setMandate] = useState(team.purpose ?? "");
  const [cadence, setCadence] = useState(team.cadence ?? "");
  const [newAction, setNewAction] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newNote, setNewNote] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Keep local fields in sync when switching teams.
  useEffect(() => {
    setMandate(team.purpose ?? "");
    setCadence(team.cadence ?? "");
    setNewAction("");
    setNewGoal("");
    setNewNote("");
    setShowDone(false);
    setShowMore(false);
  }, [team.id, team.purpose, team.cadence]);

  const saveMandate = () => {
    const nextPurpose = mandate.trim() || undefined;
    const nextCadence = cadence.trim() || undefined;
    if (nextPurpose === team.purpose && nextCadence === team.cadence) return;
    updateTeam(team.id, { purpose: nextPurpose, cadence: nextCadence });
  };

  // Compact rail while a person is drilled in — just enough to switch members / go back.
  if (nested) {
    return (
      <aside
        className="flex h-full flex-col border-l border-line bg-surface-2/60"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <button
          className="flex flex-col items-center gap-2 border-b border-line px-1.5 py-3 text-center transition-colors hover:bg-surface"
          onClick={() => selectPerson(null)}
          title={`Back to ${team.name}`}
        >
          <IconChevronLeft size={14} className="text-ink-3" />
          <span
            className="max-h-28 overflow-hidden text-[11px] leading-tight font-semibold text-ink-2"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
            }}
          >
            {team.name}
          </span>
        </button>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1.5 py-3">
          {members.map((p) => {
            const active = p.id === selectedPersonId;
            return (
              <button
                key={p.id}
                onClick={() => selectPerson(p.id)}
                title={p.name}
                className={`rounded-full transition-transform ${
                  active
                    ? "scale-110 ring-2 ring-offset-1 ring-offset-paper"
                    : "opacity-70 hover:opacity-100"
                }`}
                style={
                  active
                    ? ({ ["--tw-ring-color"]: accent } as CSSProperties)
                    : undefined
                }
                aria-current={active ? "true" : undefined}
              >
                <Avatar
                  name={p.name}
                  photo={p.photo}
                  size={32}
                  dimmed={!isAssessed(p)}
                />
              </button>
            );
          })}
        </div>
        <button
          className="flex items-center justify-center border-t border-line py-2.5 text-ink-3 transition-colors hover:bg-surface hover:text-ink"
          onClick={() => selectTeam(null)}
          aria-label="Close"
          title="Close"
        >
          <IconX size={13} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col border-l border-line bg-surface">
      {/* Header — identity only */}
      <header
        className="shrink-0 border-b border-line px-5 py-4"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display truncate text-xl font-semibold tracking-tight">
              {team.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {domain && <Badge color={domain.color}>{domain.name}</Badge>}
              {capacity && <Badge color={capacity.color}>{capacity.label}</Badge>}
              {team.direction === "up" && (
                <span className="text-[11px] text-ink-3">Reports up</span>
              )}
            </div>
            {parent && (
              <button
                type="button"
                className="mt-2 text-left text-xs text-ink-3 hover:text-accent-ink"
                onClick={() => selectTeam(parent.id)}
              >
                Under {parent.name}
              </button>
            )}
          </div>
          <button
            className="btn-icon"
            aria-label="Close team"
            onClick={() => selectTeam(null)}
          >
            <IconX size={14} />
          </button>
        </div>

        {/* Pulse strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
          <span>
            {members.length} {members.length === 1 ? "person" : "people"}
          </span>
          <span className="text-ink-3/60">·</span>
          <span>
            {team.lastMet ? (
              <>
                Met <span className="font-medium text-ink">{team.lastMet}</span>
              </>
            ) : (
              "Not met yet"
            )}
          </span>
          <button
            type="button"
            className="font-medium text-accent-ink hover:underline"
            onClick={() => updateTeam(team.id, { lastMet: today() })}
          >
            Mark met today
          </button>
          <button
            type="button"
            className="ml-auto text-ink-3 hover:text-ink"
            onClick={() => openModal({ kind: "team", team })}
          >
            Settings
          </button>
          <button
            type="button"
            className="text-ink-3 hover:text-red-500"
            onClick={() => {
              const extra =
                subTeams.length > 0
                  ? ` Its ${subTeams.length} sub-team(s) will become top-level.`
                  : "";
              if (
                confirm(
                  `Delete "${team.name}" and its ${members.length} member(s)?${extra}`
                )
              ) {
                deleteTeam(team.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 px-5 py-5">
          {/* Mandate — always editable, blur to save */}
          <section>
            <SectionTitle>Mandate</SectionTitle>
            <textarea
              className={`${inputCls} mt-2 min-h-[88px] resize-y leading-relaxed`}
              placeholder="What am I responsible to lead this team toward?"
              value={mandate}
              onChange={(e) => setMandate(e.target.value)}
              onBlur={saveMandate}
            />
            <input
              className={`${inputCls} mt-2 bg-transparent text-xs text-ink-2`}
              placeholder="Cadence — e.g. Weekly Tuesdays"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              onBlur={saveMandate}
            />
          </section>

          {/* Sub-teams — broader purview → specific teams I lead */}
          {(subTeams.length > 0 || team.direction !== "up") && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <SectionTitle>Sub-teams</SectionTitle>
                {team.direction !== "up" && (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-accent-ink hover:underline"
                    onClick={() =>
                      openModal({ kind: "team", parentId: team.id })
                    }
                  >
                    + Add
                  </button>
                )}
              </div>
              {subTeams.length === 0 ? (
                <p className="text-xs text-ink-3 italic">
                  No sub-teams — nest a team you specifically lead under this
                  broader purview.
                </p>
              ) : (
                <ul className="space-y-1">
                  {subTeams.map((st) => {
                    const stCap = capacities.find((c) => c.id === st.capacityId);
                    const stMembers = people.filter((p) => p.teamId === st.id);
                    return (
                      <li key={st.id}>
                        <button
                          type="button"
                          onClick={() => selectTeam(st.id)}
                          className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2 text-left text-sm transition-colors hover:border-accent/50 hover:bg-surface-2/50"
                        >
                          <span className="truncate font-medium">{st.name}</span>
                          <span className="shrink-0 text-[11px] text-ink-3">
                            {stCap?.label}
                            {stMembers.length
                              ? ` · ${stMembers.length}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* Next steps — the reason you opened this panel */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>Next steps</SectionTitle>
              {doneActions.length > 0 && (
                <button
                  className="text-[11px] text-ink-3 hover:text-ink"
                  onClick={() => setShowDone((v) => !v)}
                >
                  {showDone ? "Hide done" : `${doneActions.length} done`}
                </button>
              )}
            </div>
            <ul className="space-y-1">
              {openActions.map((a) => (
                <ActionRow
                  key={a.id}
                  text={a.text}
                  done={false}
                  dueDate={a.dueDate}
                  onToggle={() => toggleTeamAction(a.id)}
                  onCommit={(text) => {
                    if (!text) deleteTeamAction(a.id);
                    else if (text !== a.text) updateTeamAction(a.id, { text });
                  }}
                  onDelete={() => deleteTeamAction(a.id)}
                />
              ))}
              {showDone &&
                doneActions.map((a) => (
                  <ActionRow
                    key={a.id}
                    text={a.text}
                    done
                    dueDate={a.dueDate}
                    onToggle={() => toggleTeamAction(a.id)}
                    onCommit={(text) => {
                      if (!text) deleteTeamAction(a.id);
                      else if (text !== a.text) updateTeamAction(a.id, { text });
                    }}
                    onDelete={() => deleteTeamAction(a.id)}
                  />
                ))}
            </ul>
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newAction.trim()) return;
                addTeamAction(team.id, newAction.trim());
                setNewAction("");
              }}
            >
              <input
                className={`${inputCls} border-dashed`}
                placeholder="Add a next step…"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
              />
            </form>
          </section>

          {/* People */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>People</SectionTitle>
              <button
                className="text-[11px] font-medium text-accent-ink hover:underline"
                onClick={() => openModal({ kind: "person", teamId: team.id })}
              >
                + Add
              </button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-ink-3">No one on this team yet.</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {members.map((p) => {
                  const active = p.id === selectedPersonId;
                  return (
                    <li key={p.id}>
                      <button
                        className={`flex w-full items-center gap-3 py-2.5 text-left transition-colors ${
                          active
                            ? "bg-accent/[0.08]"
                            : "hover:bg-surface-2/60"
                        }`}
                        onClick={() => selectPerson(p.id)}
                        aria-current={active ? "true" : undefined}
                      >
                        <Avatar
                          name={p.name}
                          photo={p.photo}
                          size={32}
                          dimmed={!isAssessed(p)}
                          ring={active ? accent : undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-sm font-medium ${
                              active ? "text-accent-ink" : ""
                            }`}
                          >
                            {p.name}
                          </div>
                          {p.role && (
                            <div className="truncate text-[11px] text-ink-3">
                              {p.role}
                            </div>
                          )}
                        </div>
                        <span
                          className={
                            active
                              ? "text-accent-ink"
                              : "text-ink-3/60"
                          }
                        >
                          ›
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Notes */}
          <section>
            <SectionTitle>Notes</SectionTitle>
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newNote.trim()) return;
                addTeamNote(team.id, newNote.trim());
                setNewNote("");
              }}
            >
              <input
                className={inputCls}
                placeholder="Capture a team note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
            </form>
            {myNotes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {myNotes.map((n) => (
                  <li
                    key={n.id}
                    className="group flex items-start gap-2 text-sm text-ink-2"
                  >
                    <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-ink-3">
                      {n.date}
                    </span>
                    <span className="flex-1 leading-relaxed">{n.body}</span>
                    <button
                      className="text-ink-3/70 opacity-0 group-hover:opacity-100 hover:text-red-500"
                      aria-label="Delete note"
                      onClick={() => deleteTeamNote(n.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Secondary — goals, strengths, AI */}
          <section>
            <button
              className="flex w-full items-center justify-between rounded-xl border border-line px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2/50"
              onClick={() => setShowMore((v) => !v)}
            >
              <span className="font-medium text-ink-2">
                Goals, strengths & AI
              </span>
              <span className="text-ink-3">{showMore ? "▴" : "▾"}</span>
            </button>
            {showMore && (
              <div className="mt-4 space-y-6">
                <div>
                  <SectionTitle>Goals</SectionTitle>
                  <div className="mt-2 space-y-2.5">
                    {myGoals.map((g) => (
                      <div key={g.id} className="group">
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="flex-1">{g.title}</span>
                          <span className="text-xs tabular-nums text-ink-3">
                            {Math.round(g.progress)}%
                          </span>
                          <button
                            className="text-ink-3/70 opacity-0 group-hover:opacity-100 hover:text-red-500"
                            aria-label="Delete goal"
                            onClick={() => deleteTeamGoal(g.id)}
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
                            updateTeamGoal(g.id, {
                              progress: Number(e.target.value),
                            })
                          }
                          className="mb-0.5 w-full"
                          style={{ height: 4, accentColor: "var(--lw-accent)" }}
                        />
                        <ProgressBar value={g.progress} />
                      </div>
                    ))}
                  </div>
                  <form
                    className="mt-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newGoal.trim()) return;
                      addTeamGoal(team.id, newGoal.trim());
                      setNewGoal("");
                    }}
                  >
                    <input
                      className={inputCls}
                      placeholder="Add a team goal…"
                      value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                    />
                  </form>
                </div>

                <StatsBar people={members} />

                <div>
                  <SectionTitle>AI coach</SectionTitle>
                  <div className="mt-2">
                    <AICoach team={team} />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}

function ActionRow({
  text,
  done,
  dueDate,
  onToggle,
  onCommit,
  onDelete,
}: {
  text: string;
  done: boolean;
  dueDate?: string;
  onToggle: () => void;
  onCommit: (text: string) => void;
  onDelete: () => void;
}) {
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);

  return (
    <li className="group flex items-start gap-2 rounded-lg px-1 py-1 hover:bg-surface-2/60">
      <input
        type="checkbox"
        checked={done}
        onChange={onToggle}
        className="mt-2"
        style={{ accentColor: "var(--lw-accent)" }}
      />
      <div className="min-w-0 flex-1">
        <textarea
          rows={1}
          className={`w-full resize-none bg-transparent py-1.5 text-sm outline-none ${
            done ? "text-ink-3 line-through" : "text-ink"
          }`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onCommit(value.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
        {dueDate && (
          <div className="pb-1 text-[10px] text-ink-3">due {dueDate}</div>
        )}
      </div>
      <button
        className="mt-1.5 text-ink-3/70 opacity-0 group-hover:opacity-100 hover:text-red-500"
        aria-label="Delete"
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  );
}
