import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import type { Team } from "../types";
import { hasLeadershipRead } from "../lib/derive";
import { hasApiKey, refineTeamMandate } from "../lib/ai";
import { Avatar } from "./Avatar";
import type { Density } from "./EntitySurface";
import { TintBadge, ProgressBar, SectionTitle } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { X } from "@untitledui/icons";
import { AICoach } from "./AICoach";
import { HealthField } from "./Health";
import { StatsBar } from "./StatsBar";
import { PrepPanel } from "./PrepPanel";
import { SessionTable } from "./SessionTable";
import { meetingFor, type CheckFix } from "../lib/readiness";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Team panel — optimized for the leadership audit loop:
 * mandate → next steps → people → supporting detail.
 *
 * Renders at both densities. Breadcrumb, sibling pager, close and the
 * promotion to focus all live in EntityChrome, so this owns content only.
 */
export function TeamProfile({
  team,
  density: _density = "peek",
}: {
  team: Team;
  density?: Density;
}) {
  const {
    capacities,
    domains,
    teams,
    people,
    selectTeam,
    selectPerson,
    selectedPersonId,
    updateTeam,
    setHealth,
    setHealthNote,
    openModal,
    modal,
    askAIOpen,
    meetings,
    addSession,
    trackMeeting,
    openSession,
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (modal || askAIOpen) return;
      e.preventDefault();
      selectTeam(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, askAIOpen, selectTeam]);

  const capacity = capacities.find((c) => c.id === team.capacityId);
  const domain = domains.find((d) => d.id === team.domainId);
  const parent = teams.find((t) => t.id === team.parentId);
  // A direct report runs this team; I lead them, not it.
  const leader = people.find((p) => p.id === team.leaderId);
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

  const [name, setName] = useState(team.name);
  const [mandate, setMandate] = useState(team.purpose ?? "");
  const [refining, setRefining] = useState(false);

  const teamMeeting = meetingFor(meetings, "team", team.id);

  /**
   * Send a failing readiness check where it gets fixed. Teams have no topic
   * board, so agenda and commitments both land on Next steps below.
   */
  const goFix = (fix: CheckFix, sessionRowId?: string) => {
    if (fix === "writeUp" && sessionRowId) {
      openSession(sessionRowId);
      return;
    }
    if (fix === "book") {
      const meetingId =
        teamMeeting?.id ?? trackMeeting("team", team.id, "as_needed");
      openSession(addSession({ meetingId, date: today() }));
      return;
    }
    document
      .getElementById(`team-next-steps-${team.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const [refineError, setRefineError] = useState<string | null>(null);
  const [newAction, setNewAction] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newNote, setNewNote] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Keep local fields in sync when switching teams.
  useEffect(() => {
    setName(team.name);
    setMandate(team.purpose ?? "");
    setRefining(false);
    setRefineError(null);
    setNewAction("");
    setNewGoal("");
    setNewNote("");
    setShowDone(false);
    setShowMore(false);
  }, [team.id, team.name, team.purpose]);

  const saveName = () => {
    const next = name.trim();
    if (!next) {
      setName(team.name);
      return;
    }
    if (next === team.name) return;
    updateTeam(team.id, { name: next });
  };

  const saveMandate = () => {
    if (refining) return;
    const nextPurpose = mandate.trim() || undefined;
    if (nextPurpose === team.purpose) return;
    updateTeam(team.id, { purpose: nextPurpose });
  };

  const runRefineMandate = async () => {
    if (!hasApiKey()) {
      setRefineError("Sign in to refine with AI.");
      return;
    }
    setRefineError(null);
    setRefining(true);
    try {
      const result = await refineTeamMandate({
        teamId: team.id,
        purpose: mandate,
        onDelta: (text) => setMandate(text),
      });
      setMandate(result);
      updateTeam(team.id, { purpose: result || undefined });
    } catch (e) {
      setRefineError(
        e instanceof Error ? e.message : "Could not refine the mandate."
      );
    } finally {
      setRefining(false);
    }
  };

  return (
    <aside className="flex h-full min-h-0 flex-col bg-white dark:bg-stone-900">
      {/* Header — identity only */}
      <header
        className="entity-header shrink-0 border-b border-stone-200 px-8 py-4 dark:border-stone-800"
        style={{ borderTop: `3px solid ${accent}` }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <input
              className="w-full rounded-xl bg-stone-50 px-3 py-2 text-2xl font-semibold tracking-tight text-stone-900 outline-none transition-[background-color,box-shadow] duration-150 hover:bg-stone-100/90 focus:bg-stone-50 focus:shadow-[inset_0_0_0_1.5px_rgb(13_148_136/0.35)] dark:bg-stone-950/60 dark:text-stone-100 dark:hover:bg-stone-950 dark:focus:bg-stone-950/80"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  setName(team.name);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Team name"
            />
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {domain && <TintBadge color={domain.color}>{domain.name}</TintBadge>}
              {capacity && <TintBadge color={capacity.color}>{capacity.label}</TintBadge>}
              {team.direction === "up" && (
                <span className="text-[11px] text-stone-500 dark:text-stone-400">Reports up</span>
              )}
            </div>
            {parent && (
              <Button
                size="sm"
                color="link-gray"
                className="mt-2"
                onClick={() => selectTeam(parent.id)}
              >
                Under {parent.name}
              </Button>
            )}
            {leader && (
              <Button
                size="sm"
                color="link-gray"
                className="mt-2 flex"
                onClick={() => selectPerson(leader.id)}
                aria-label={`Led by ${leader.name}. They run this team — your job is leading them, not it`}
              >
                Led by {leader.name}
              </Button>
            )}
          </div>
        </div>

        {/* Pulse strip */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
          <span>
            {members.length} {members.length === 1 ? "person" : "people"}
          </span>
          <span className="text-stone-400 dark:text-stone-600">·</span>
          <span>
            {team.lastMet ? (
              <>
                Met{" "}
                <span className="font-medium text-stone-700 dark:text-stone-400">
                  {team.lastMet}
                </span>
              </>
            ) : (
              "Not met yet"
            )}
          </span>
          <Button
            size="sm"
            color="link-color"
            onClick={() => updateTeam(team.id, { lastMet: today() })}
          >
            Mark met today
          </Button>
          {/* "Delete" used to sit right beside "Settings" — a mis-tap
              destroyed the team and every member on it. Deleting now lives in
              the team's settings modal, next to the rest of its admin. */}
          <Button
            size="sm"
            color="link-gray"
            className="ml-auto"
            onClick={() => openModal({ kind: "team", team })}
          >
            Settings
          </Button>
        </div>
      </header>

      <div className="scroll-contain min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 px-8 py-5">
          {/* My read on the team. Not derived from anything below it — the
              whole point is that it's the call only I can make. */}
          <section className="max-w-sm">
            <HealthField
              key={team.id}
              health={team.health}
              onLevel={(level) => setHealth("team", team.id, level)}
              onNote={(note) => setHealthNote("team", team.id, note)}
              label="Health — my read"
            />
          </section>

          {/* Readiness for this team's own standing meeting — separate from
              the 1:1s with its members, which live on each person. */}
          <PrepPanel
            subjectKind="team"
            subjectId={team.id}
            subjectName={team.name}
            onFix={goFix}
          />

          {teamMeeting && (
            <section className="space-y-2">
              <SectionTitle>{teamMeeting.name ?? "Meetings"}</SectionTitle>
              <SessionTable
                meetingId={teamMeeting.id}
                onOpen={openSession}
              />
            </section>
          )}

          {/* Mandate — always editable, blur to save */}
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <SectionTitle>Mandate</SectionTitle>
              <Button
                size="sm"
                color="link-color"
                onClick={runRefineMandate}
                isLoading={refining}
                showTextWhileLoading
              >
                {refining ? "Refining…" : "✦ Refine"}
              </Button>
            </div>
            <TextArea
              size="md"
              aria-label="Mandate"
              textAreaClassName={`min-h-[88px] resize-y leading-relaxed ${
                refining ? "opacity-80" : ""
              }`}
              placeholder="What am I responsible to lead this team toward?"
              value={mandate}
              onChange={setMandate}
              onBlur={saveMandate}
              isReadOnly={refining}
            />
            {refineError && (
              <p className="mt-1.5 text-[11px] text-red-500">{refineError}</p>
            )}
          </section>

          {/* Sub-teams — broader purview → specific teams I lead */}
          {(subTeams.length > 0 || team.direction !== "up") && (
            <section>
              <div className="mb-2 flex items-baseline justify-between">
                <SectionTitle>Sub-teams</SectionTitle>
                {team.direction !== "up" && (
                  <Button
                    size="sm"
                    color="link-color"
                    onClick={() =>
                      openModal({ kind: "team", parentId: team.id })
                    }
                  >
                    + Add
                  </Button>
                )}
              </div>
              {subTeams.length === 0 ? (
                <p className="text-xs italic text-stone-500 dark:text-stone-400">
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
                          className="flex w-full items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-teal-400 dark:border-stone-800"
                        >
                          <span className="truncate font-medium">{st.name}</span>
                          <span className="shrink-0 text-[11px] text-stone-500 dark:text-stone-400">
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
          <section id={`team-next-steps-${team.id}`}>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>Next steps</SectionTitle>
              {doneActions.length > 0 && (
                <Button
                  size="sm"
                  color="link-gray"
                  onClick={() => setShowDone((v) => !v)}
                >
                  {showDone ? "Hide done" : `${doneActions.length} done`}
                </Button>
              )}
            </div>
            <ul className="space-y-2">
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
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/40 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-950/30">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-300 dark:border-stone-600"
                  aria-hidden
                />
                <input
                  className="min-w-0 flex-1 bg-transparent text-[0.95rem] leading-snug text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-200"
                  placeholder="Add a to-do…"
                  value={newAction}
                  onChange={(e) => setNewAction(e.target.value)}
                />
              </div>
            </form>
          </section>

          {/* People */}
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>People</SectionTitle>
              <Button
                size="sm"
                color="link-color"
                onClick={() => openModal({ kind: "person", teamId: team.id })}
              >
                + Add
              </Button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">No one on this team yet.</p>
            ) : (
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                {members.map((p) => {
                  const active = p.id === selectedPersonId;
                  return (
                    <li key={p.id}>
                      <button
                        className={`flex w-full items-center gap-3 py-2.5 text-left transition-colors ${
                          active
                            ? "bg-teal-50 dark:bg-teal-950/40"
                            : "hover:bg-stone-50 dark:hover:bg-stone-800/40"
                        }`}
                        onClick={() => selectPerson(p.id)}
                        aria-current={active ? "true" : undefined}
                      >
                        <Avatar
                          name={p.name}
                          photo={p.photo}
                          size={32}
                          dimmed={!hasLeadershipRead(p)}
                          ring={active ? accent : undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate text-sm font-medium ${
                              active ? "text-teal-800 dark:text-teal-200" : ""
                            }`}
                          >
                            {p.name}
                          </div>
                          {p.role && (
                            <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                              {p.role}
                            </div>
                          )}
                        </div>
                        <span
                          className={
                            active
                              ? "text-teal-600 dark:text-teal-400"
                              : "text-stone-400 dark:text-stone-500"
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
              <Input
                size="md"
                placeholder="Capture a team note…"
                value={newNote}
                onChange={setNewNote}
              />
            </form>
            {myNotes.length > 0 && (
              <ul className="mt-3 space-y-2">
                {myNotes.map((n) => (
                  <li
                    key={n.id}
                    className="group flex items-start gap-2 text-sm text-stone-600 dark:text-stone-400"
                  >
                    <span className="shrink-0 pt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                      {n.date}
                    </span>
                    <span className="flex-1 leading-relaxed">{n.body}</span>
                    <ButtonUtility
                      size="xs"
                      color="tertiary"
                      icon={X}
                      tooltip="Delete note"
                      className="opacity-0 touch:opacity-100 group-hover:opacity-100"
                      onClick={() => deleteTeamNote(n.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Secondary — goals, strengths, AI */}
          <section>
            <button
              className="flex w-full items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm dark:border-stone-800"
              onClick={() => setShowMore((v) => !v)}
            >
              <span className="font-medium text-stone-600 dark:text-stone-400">
                Goals, strengths & AI
              </span>
              <span className="text-stone-500 dark:text-stone-400">{showMore ? "▴" : "▾"}</span>
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
                          <span className="text-xs text-stone-500 dark:text-stone-400">
                            {Math.round(g.progress)}%
                          </span>
                          <ButtonUtility
                            size="xs"
                            color="tertiary"
                            icon={X}
                            tooltip="Delete goal"
                            className="opacity-0 touch:opacity-100 group-hover:opacity-100"
                            onClick={() => deleteTeamGoal(g.id)}
                          />
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
                          className="goal-range mb-0.5 w-full"
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
                    <Input
                      size="md"
                      placeholder="Add a team goal…"
                      value={newGoal}
                      onChange={setNewGoal}
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
    <li
      className={`group flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        done
          ? "border-stone-200/80 bg-stone-50/60 dark:border-stone-800 dark:bg-stone-950/40"
          : "border-stone-200 bg-white shadow-sm shadow-stone-900/3 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:shadow-none dark:hover:border-stone-600"
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? "Mark incomplete" : "Mark done"}
        onClick={onToggle}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
          done
            ? "border-teal-600 bg-teal-600 text-white"
            : "border-stone-300 bg-white hover:border-teal-500 dark:border-stone-600 dark:bg-stone-950 dark:hover:border-teal-500"
        }`}
      >
        {done && (
          <svg
            viewBox="0 0 12 12"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 6.5 5 9l4.5-6" />
          </svg>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <textarea
          rows={1}
          className={`w-full resize-none bg-transparent py-0.5 text-[0.95rem] leading-snug outline-none ${
            done
              ? "text-stone-500 dark:text-stone-400 line-through decoration-stone-300"
              : "text-stone-800 dark:text-stone-100"
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
          <div className="pt-0.5 text-[11px] text-stone-500 dark:text-stone-400">Due {dueDate}</div>
        )}
      </div>
      <button
        className="mt-0.5 rounded-md px-1.5 py-0.5 text-sm text-stone-400 dark:text-stone-500 opacity-0 touch:opacity-100 transition-opacity group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
        aria-label="Delete"
        onClick={onDelete}
      >
        ✕
      </button>
    </li>
  );
}
