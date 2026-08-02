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
import { meetingFor, type CheckFix } from "../lib/readiness";
import { teamsLedBy } from "../lib/teams";
import { Avatar } from "./Avatar";
import type { Density } from "./EntitySurface";
import {
  TintBadge,
  ProgressBar,
  ProfileAdminLinks,
  SectionTitle,
} from "./ui";
import { Input } from "@/components/base/input/input";
import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";

import { AssessmentEditor } from "./AssessmentEditor";
import { HealthField } from "./Health";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { PersonModal } from "./forms";
import { AICoach } from "./AICoach";
import { SessionTable } from "./SessionTable";
import { TopicKanban } from "./TopicKanban";
import { NotesPanel } from "./NotesPanel";
import { LeadUpManual } from "./LeadUpManual";
import { WinsLedger } from "./WinsLedger";
import { ProfileFillModal } from "./ProfileFillModal";
import { PrepPanel } from "./PrepPanel";

type PersonTab = "profile" | "sessions" | "topics" | "notes";

const PERSON_TAB_IDS: PersonTab[] = ["profile", "sessions", "topics", "notes"];

function isPersonTab(value: string | null): value is PersonTab {
  return PERSON_TAB_IDS.includes(value as PersonTab);
}

function personTabs(isLeadUp: boolean): { id: PersonTab; label: string }[] {
  return [
    { id: "profile", label: isLeadUp ? "Leading up" : "Profile" },
    { id: "sessions", label: isLeadUp ? "Check-ins" : "1:1s" },
    { id: "topics", label: "Topics" },
    { id: "notes", label: "Notes" },
  ];
}

/**
 * Person panel. Its tabs are sub-pages in the URL, so a teammate's 1:1 history
 * is a link you can send someone. Breadcrumb, teammate pager, close and the
 * promotion to focus live in EntityChrome.
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
    addSession,
    trackMeeting,
    openSession,
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    notes,
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
  const myNotes = notes
    .filter((n) => n.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const lastSession = mySessions.find((o) => o.notes?.trim());
  const nextSession = mySessions.find((o) => o.nextDate)?.nextDate;

  // The active tab is a URL sub-page, not local state — that's what makes it
  // linkable. An unknown section falls back to the profile.
  const tab: PersonTab = isPersonTab(section) ? section : "profile";
  const setTab = (next: PersonTab) =>
    setSection(next === "profile" ? null : next);

  const [editingAssessments, setEditingAssessments] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [fillingProfile, setFillingProfile] = useState(false);
  const [newGoal, setNewGoal] = useState("");

  // Editors are per-person; the tab resets itself via the route.
  useEffect(() => {
    setFillingProfile(false);
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
   * Logging a 1:1 for someone untracked starts tracking it as-needed rather
   * than refusing: you get the history without being measured, and setting a
   * rhythm stays the explicit opt-in.
   */
  const startNewSession = () => {
    setTab("sessions");
    const meetingId =
      meeting?.id ?? trackMeeting("person", person.id, "as_needed");
    const id = addSession({
      meetingId,
      date: new Date().toISOString().slice(0, 10),
    });
    openSession(id);
  };

  /** Send a failing readiness check to wherever it actually gets fixed. */
  const goFix = (fix: CheckFix, sessionRowId?: string) => {
    if (fix === "writeUp" && sessionRowId) {
      setTab("sessions");
      openSession(sessionRowId);
      return;
    }
    if (fix === "book") {
      startNewSession();
      return;
    }
    setTab("topics");
  };

  const pad = "p-6";

  return (
    <aside
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-stone-900"
      data-person-tab={tab}
    >
      {/* Header */}
      <div
        className={`shrink-0 border-b border-stone-200 bg-white/90 backdrop-blur dark:border-stone-800 dark:bg-stone-900/90 ${pad}`}
      >
        <div className="flex items-start gap-3">
          <Avatar name={person.name} photo={person.photo} size={52} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{person.name}</h2>
            <div className="text-xs text-stone-500">
              {[person.role, team?.name ?? "Reports directly to me"]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {led.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[11px] text-stone-400">Leads</span>
                {led.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTeam(t.id)}
                    className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {capacity && (
              <div className="mt-1">
                <TintBadge color={capacity.color}>{capacity.label}</TintBadge>
              </div>
            )}
            <div className="mt-1 text-[11px] text-stone-400">
              {nextSession &&
                `Next ${isLeadUp ? "check-in" : "1:1"} ${nextSession}`}
              {nextSession && lastSession && " · "}
              {lastSession && `Last ${lastSession.date}`}
            </div>
          </div>
        </div>
      </div>

      {/* Internal tabs — navigation only; sections render below */}
      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => setTab(key as ReturnType<typeof personTabs>[number]["id"])}
        className="shrink-0 border-b border-stone-200 px-3 dark:border-stone-800"
      >
        <TabList type="underline" size="sm" items={personTabs(isLeadUp)}>
          {(t) => (
            <TabItem
              id={t.id}
              label={t.label}
              badge={
                t.id === "sessions" && mySessions.length > 0
                  ? mySessions.length
                  : t.id === "notes" && myNotes.length > 0
                    ? myNotes.length
                    : undefined
              }
            />
          )}
        </TabList>
      </Tabs>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === "profile" && isLeadUp && (
          <div className="flex flex-col gap-6 p-4">
            {/* Upward, this rates the relationship rather than the person. */}
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
            <LeadUpManual
              key={person.id}
              subject={person}
              onChange={(patch) => updateLeadUp(person.id, patch)}
            />
            <WinsLedger subjectId={person.id} />
            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach person={person} />
            </section>
            <ProfileAdminLinks
              onEdit={() => setEditingPerson(true)}
              onRemove={() => {
                if (confirm(`Remove ${person.name}?`)) deletePerson(person.id);
              }}
            />
          </div>
        )}

        {tab === "profile" && !isLeadUp && (
          <div className="flex flex-col gap-6 p-4">
            {/* How they're doing — my call, not a read of their assessments. */}
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
                    className="w-full rounded-xl border border-dashed border-stone-300 py-6 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
                  >
                    ✨ AI fill from a brain dump
                    <div className="mt-1 text-xs">
                      Free text or guided mapping → traits & modalities
                    </div>
                  </button>
                  <button
                    onClick={() => setEditingAssessments(true)}
                    className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-xs text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
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
                  {customMods.length > 0 && (
                    <div className="space-y-2">
                      {customMods.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-xl bg-stone-50 p-3 dark:bg-stone-950/60"
                        >
                          <div className="text-[10px] tracking-wider text-stone-400 uppercase">
                            {m.name}
                            {m.source !== "self-report" && (
                              <span className="ml-1.5 font-normal normal-case tracking-normal">
                                · {m.source}
                              </span>
                            )}
                          </div>
                          <div className="text-sm font-semibold">{m.result}</div>
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
                    <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-xs leading-relaxed text-stone-600 dark:bg-teal-950/20 dark:text-stone-300">
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
                      <ButtonUtility
                        size="xs"
                        color="tertiary"
                        icon={X}
                        tooltip="Delete goal"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => deleteGoal(g.id)}
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
                <Input
                  size="md"
                  placeholder="Add a goal…"
                  value={newGoal}
                  onChange={setNewGoal}
                />
              </form>
            </section>

            <section className="space-y-2">
              <SectionTitle>AI coach</SectionTitle>
              <AICoach person={person} />
            </section>
            <ProfileAdminLinks
              onEdit={() => setEditingPerson(true)}
              onRemove={() => {
                if (confirm(`Remove ${person.name}?`)) deletePerson(person.id);
              }}
            />
          </div>
        )}

        {tab === "sessions" && (
          <div className="p-4">
            {meeting ? (
              <SessionTable
                meetingId={meeting.id}
                onOpen={openSession}
              />
            ) : (
              <button
                type="button"
                onClick={startNewSession}
                className="w-full rounded-xl border border-dashed border-stone-300 py-6 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
              >
                + Log a {isLeadUp ? "check-in" : "1:1"} with{" "}
                {person.name.split(" ")[0]}
                <div className="mt-1 text-xs">
                  Starts tracking it as-needed — set a rhythm when you want it
                  measured
                </div>
              </button>
            )}
          </div>
        )}

        {tab === "topics" && (
          <div className="space-y-3 p-4">
            <p className="text-xs text-stone-500">
              {isLeadUp
                ? "What you need from them — asks, escalations, decisions. Pull into This check-in before you sit down."
                : "Park topics to talk about. Drag cards between columns — pull into This 1:1 before you meet."}
            </p>
            <TopicKanban
              personId={person.id}
              direction={isLeadUp ? "up" : "down"}
            />
          </div>
        )}

        {tab === "notes" && (
          <div className="p-4">
            <NotesPanel subjectId={person.id} />
          </div>
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

