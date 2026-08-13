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
import { derivedRead, hasLeadershipRead } from "../lib/derive";
import { meetingFor, todayISO, type CheckFix } from "../lib/readiness";
import { teamsLedBy } from "../lib/teams";
import { entityMode, modeSection, type EntityMode } from "../lib/entityModes";
import { Avatar } from "./Avatar";
import type { Density } from "./EntitySurface";
import { TintBadge, ProgressBar, ProfileAdminLinks, SectionTitle } from "./ui";
import { Input } from "@/components/base/input/input";
import { EntityModeTabs } from "./EntityModeTabs";

import { AssessmentEditor } from "./AssessmentEditor";
import { HealthField } from "./Health";
import { PrayerPanel } from "./Prayer";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { PersonModal } from "./forms";
import { AICoach } from "./AICoach";
import { SubjectMeetings } from "./SubjectMeetings";
import { NotesPanel } from "./NotesPanel";
import { LeadUpManual } from "./LeadUpManual";
import { WinsLedger } from "./WinsLedger";
import { ProfileFillModal } from "./ProfileFillModal";
import { PrepPanel } from "./PrepPanel";
import { confirmAction } from "./ConfirmDialog";
import { deleteWithUndo } from "../lib/toasts";

/**
 * Person panel, in the five modes every entity shares (see lib/entityModes).
 *
 * Now is where you stand with them, Meetings is the recurring rhythm itself,
 * Profile is who they are, Notes is your record and Prayer is your posture.
 *
 * Breadcrumb, teammate pager, close and the promotion to focus live in
 * EntityChrome; this owns content only.
 */
export function PersonProfile({
  person,
  density: _density = "peek",
}: {
  person: Person;
  density?: Density;
}) {
  const {
    teams,
    capacities,
    section,
    setSection,
    selectPerson,
    selectTeam,
    deletePerson,
    updateLeadUp,
    setHealth,
    setHealthNote,
    modal,
    askAIOpen,
    settingsOpen,
    meetings,
    sessions,
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    restoreGoal,
    notes,
    trackMeeting,
    addSession,
  } = useStore();

  const team = teams.find((t) => t.id === person.teamId);
  const capacity = capacities.find((c) => c.id === team?.capacityId);
  // Teams that are theirs to run, not mine.
  const led = teamsLedBy(teams, person.id);
  // People on an "up" team are those I report to — leading up, not down.
  const isLeadUp = team?.direction === "up";
  const read = derivedRead(person);
  const enn = parseEnneagram(person.assessments.enneagram);
  const top5 = person.assessments.cliftonTop5 ?? [];
  const mbtiKey = person.assessments.mbti?.toUpperCase();
  const hasAssessments = top5.length > 0 || enn || mbtiKey;
  const customMods = person.customModalities ?? [];
  const hasRead = hasLeadershipRead(person);

  const meeting = meetingFor(meetings, "person", person.id);
  const mySessions = sessions
    .filter((o) => meeting && o.meetingId === meeting.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const myGoals = goals.filter((g) => g.personId === person.id);
  const myNotes = notes.filter((n) => n.personId === person.id);

  const lastSession = mySessions.find((o) => o.notes?.trim());
  const nextSession = mySessions.find((o) => o.nextDate)?.nextDate;

  const mode = entityMode(section);
  const setMode = (next: EntityMode) => setSection(modeSection(next));

  const [editingAssessments, setEditingAssessments] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [fillingProfile, setFillingProfile] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  // Set when a readiness check sends you to Meetings for a specific write-up.
  const [focusSessionId, setFocusSessionId] = useState<string | undefined>();

  // Editors are per-person; the mode resets itself via the route.
  useEffect(() => {
    setFillingProfile(false);
    setFocusSessionId(undefined);
  }, [person.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        modal ||
        askAIOpen ||
        settingsOpen ||
        editingAssessments ||
        editingPerson ||
        fillingProfile
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
    fillingProfile,
    selectPerson,
  ]);

  /**
   * Send a failing readiness check where it gets fixed. Every fix now lands in
   * Meetings rather than on a full-page editor — the write-up, the agenda and
   * the commitments are all one mode away, and none of them costs a route.
   */
  const goFix = (fix: CheckFix, sessionRowId?: string) => {
    if (fix === "book") {
      // Logging for someone untracked starts tracking it as-needed rather than
      // refusing: you get the history without being measured, and setting a
      // rhythm stays the explicit opt-in.
      const meetingId =
        meeting?.id ?? trackMeeting("person", person.id, "as_needed");
      setFocusSessionId(addSession({ meetingId, date: todayISO() }));
    } else {
      setFocusSessionId(fix === "writeUp" ? sessionRowId : undefined);
    }
    setMode("meetings");
  };

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-stone-900"
      data-person-mode={mode}
    >
      {/* Header */}
      <div className="entity-header shrink-0 border-b border-stone-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 dark:border-stone-800 dark:bg-stone-900/90">
        <div className="flex items-start gap-3">
          <Avatar
            name={person.name}
            photo={person.photo}
            size={52}
            className="entity-header-avatar"
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{person.name}</h2>
            <div className="text-xs text-stone-500">
              {[person.role, team?.name ?? "Reports directly to me"]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {led.length > 0 && (
              <div className="entity-header-secondary mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  Leads
                </span>
                {led.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTeam(t.id)}
                    className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {capacity && (
              <div className="entity-header-secondary mt-1">
                <TintBadge color={capacity.color}>{capacity.label}</TintBadge>
              </div>
            )}
            <div className="entity-header-secondary mt-1 text-[11px] text-stone-500 dark:text-stone-400">
              {nextSession &&
                `Next ${isLeadUp ? "check-in" : "1:1"} ${nextSession}`}
              {nextSession && lastSession && " · "}
              {lastSession && `Last ${lastSession.date}`}
            </div>
          </div>
        </div>
      </div>

      <EntityModeTabs
        subject={isLeadUp ? "leadUpPerson" : "person"}
        mode={mode}
        onMode={setMode}
        counts={{
          meetings: mySessions.length,
          notes: myNotes.length,
        }}
      />

      {/* A container query, not a viewport one: the panel is resizable, so the
          layout has to answer to how wide *it* is. */}
      <div className="scroll-contain @container relative min-h-0 flex-1 overflow-y-auto">
        {/* ── Now: where we stand, and what I owe them ──────────────────── */}
        {mode === "now" && (
          <div className="grid gap-6 p-4 sm:p-6 @3xl:grid-cols-2 @3xl:items-start">
            <div className="flex min-w-0 flex-col gap-6">
              {/* My call, not a read of their assessments. */}
              <section className="max-w-sm">
                <HealthField
                  key={person.id}
                  health={person.health}
                  onLevel={(level) => setHealth("person", person.id, level)}
                  onNote={(note) => setHealthNote("person", person.id, note)}
                  label="Health — my read"
                />
              </section>

              <PrepPanel
                subjectKind="person"
                subjectId={person.id}
                subjectName={person.name}
                onFix={goFix}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-6">
            {!isLeadUp && (
              <section className="space-y-2">
                <SectionTitle>Goals & progress</SectionTitle>
                <div className="space-y-2.5">
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
                          onClick={() =>
                            deleteWithUndo(
                              "Goal deleted.",
                              () => deleteGoal(g.id),
                              () => restoreGoal(g)
                            )
                          }
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={g.progress}
                        onChange={(e) =>
                          updateGoal(g.id, { progress: Number(e.target.value) })
                        }
                        className="goal-range mb-0.5 w-full"
                      />
                      <ProgressBar value={g.progress} />
                    </div>
                  ))}
                </div>
                <form
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
                  <Input
                    size="md"
                    placeholder="Add a goal… ↵"
                    value={newGoal}
                    onChange={setNewGoal}
                    enterKeyHint="done"
                  />
                </form>
              </section>
            )}

            {isLeadUp && <WinsLedger subjectId={person.id} />}
            </div>
          </div>
        )}

        {/* ── Meetings: plan and history, together ──────────────────────── */}
        {mode === "meetings" && (
          <div className="p-4 sm:p-6">
            <SubjectMeetings
              subjectKind="person"
              subjectId={person.id}
              subjectName={person.name}
              direction={isLeadUp ? "up" : "down"}
              focusSessionId={focusSessionId}
            />
          </div>
        )}

        {/* ── Profile: who they are, and how to lead them ───────────────── */}
        {mode === "profile" && (
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            {isLeadUp ? (
              <LeadUpManual
                key={person.id}
                subject={person}
                onChange={(patch) => updateLeadUp(person.id, patch)}
              />
            ) : (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                  <SectionTitle>Assessment profile</SectionTitle>
                  {hasRead && (
                    <Button
                      size="sm"
                      color="link-color"
                      onClick={() => setEditingAssessments(true)}
                    >
                      Edit assessments
                    </Button>
                  )}
                </div>
                {!hasRead ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => setFillingProfile(true)}
                      className="w-full rounded-xl border border-dashed border-stone-300 py-6 text-sm text-stone-500 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:text-stone-400"
                    >
                      ✨ AI fill from a brain dump
                      <div className="mt-1 text-xs">
                        Free text or guided mapping → traits & modalities
                      </div>
                    </button>
                    <button
                      onClick={() => setEditingAssessments(true)}
                      className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-xs text-stone-500 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700 dark:text-stone-400"
                    >
                      Or enter assessments manually
                    </button>
                  </div>
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
                              className="flex items-center gap-1 text-[10px] text-stone-500 dark:text-stone-400"
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
                          <div className="text-[10px] tracking-wider text-stone-500 uppercase dark:text-stone-400">
                            Enneagram
                          </div>
                          <div className="text-sm font-semibold">
                            {person.assessments.enneagram}
                          </div>
                          <div className="text-xs text-stone-500">
                            {enn.name}
                          </div>
                        </div>
                      )}
                      {mbtiKey && MBTI[mbtiKey] && (
                        <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60">
                          <div className="text-[10px] tracking-wider text-stone-500 uppercase dark:text-stone-400">
                            MBTI
                          </div>
                          <div className="text-sm font-semibold">{mbtiKey}</div>
                          <div className="text-xs text-stone-500">
                            {MBTI[mbtiKey].split("—")[0].trim()}
                          </div>
                        </div>
                      )}
                    </div>
                    {customMods.length > 0 && (
                      <div className="space-y-2">
                        {customMods.map((m) => (
                          <div
                            key={m.id}
                            className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60"
                          >
                            <div className="text-[10px] tracking-wider text-stone-500 uppercase dark:text-stone-400">
                              {m.name}
                              {m.source !== "self-report" && (
                                <span className="ml-1.5 font-normal tracking-normal normal-case">
                                  · {m.source}
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-semibold">
                              {m.result}
                            </div>
                            {m.notes && (
                              <div className="mt-0.5 text-xs text-stone-500">
                                {m.notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(read.strengths.length > 0 || read.watchOuts.length > 0) && (
                      <div className="space-y-2">
                        {read.strengths.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {read.strengths.map((s) => (
                              <Badge key={s} size="sm" color="success">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {read.watchOuts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {read.watchOuts.map((s) => (
                              <Badge key={s} size="sm" color="warning">
                                ⚠ {s}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {person.howToLead && (
                      <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed text-stone-600 dark:bg-teal-950/20 dark:text-stone-400">
                        <span className="font-medium text-teal-700 dark:text-teal-400">
                          How to lead:{" "}
                        </span>
                        {person.howToLead}
                      </div>
                    )}
                    {!hasAssessments &&
                      customMods.length === 0 &&
                      (read.strengths.length > 0 ||
                        read.watchOuts.length > 0 ||
                        person.howToLead) && (
                        <Button
                          size="sm"
                          color="link-color"
                          onClick={() => setEditingAssessments(true)}
                        >
                          + Add formal assessments or other modalities
                        </Button>
                      )}
                  </>
                )}
              </section>
            )}

            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach person={person} />
            </section>

            <ProfileAdminLinks
              onEdit={() => setEditingPerson(true)}
              onRemove={async () => {
                if (
                  await confirmAction({
                    title: `Remove ${person.name}?`,
                    body: "Their profile, notes and 1:1 history are removed.",
                    confirmLabel: "Remove",
                  })
                )
                  deletePerson(person.id);
              }}
            />
          </div>
        )}

        {/* ── Notes: my running record ──────────────────────────────────── */}
        {mode === "notes" && (
          <div className="flex flex-col gap-6 p-4 sm:p-6">
            <NotesPanel subjectId={person.id} />
            {isLeadUp && <WinsLedger subjectId={person.id} />}
          </div>
        )}

        {mode === "prayer" && (
          <PrayerPanel
            subjectKind="person"
            subjectId={person.id}
            subjectName={person.name}
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
      {fillingProfile && (
        <ProfileFillModal
          person={person}
          onClose={() => setFillingProfile(false)}
        />
      )}
    </aside>
  );
}
