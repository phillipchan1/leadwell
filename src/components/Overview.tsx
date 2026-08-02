import { useState } from "react";
import { useStore } from "../store/useStore";
import { DOMAINS } from "../data/frameworks";
import {
  blindSpots,
  domainCounts,
  hasLeadershipRead,
} from "../lib/derive";
import {
  STATE_COLOR,
  STATE_ORDER,
  isBehind,
  meetingFor,
  meetingReadiness,
  personAgenda,
} from "../lib/readiness";
import {
  HEALTH_COLOR,
  HEALTH_LABEL,
  HEALTH_LEVELS,
  needsAttention,
  rollUpHealth,
} from "../lib/health";
import { hasApiKey, orgSystemPrompt, streamChat } from "../lib/ai";
import { Card, SectionTitle } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { Avatar } from "./Avatar";
import { HealthBar } from "./Health";

export function Overview() {
  const {
    people,
    teams,
    meetings,
    sessions,
    actions,
    selectPerson,
    selectTeam,
    setTab,
    setHealthScan,
  } = useStore();
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyed = hasApiKey();

  const unassessed = people.filter((p) => !hasLeadershipRead(p));
  const spots = blindSpots(people);
  const counts = domainCounts(people);
  const openActions = actions.filter((a) => !a.done);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sessions
    .filter((o) => o.nextDate && o.nextDate >= today)
    .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!));
  // Readiness, not a blanket 30-day rule: someone on a quarterly rhythm isn't
  // neglected at day 31, and someone weekly is already behind by then.
  const needAttention = people
    .flatMap((p) => {
      const meeting = meetingFor(meetings, "person", p.id);
      if (!meeting) return [];
      const readiness = meetingReadiness(
        meeting,
        sessions,
        personAgenda(actions, p.id)
      );
      return isBehind(readiness.state) ? [{ person: p, readiness }] : [];
    })
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.readiness.state) -
        STATE_ORDER.indexOf(b.readiness.state)
    );

  // The health scan, boiled down to the one question worth a card: what am I
  // carrying that I've already told myself is in trouble?
  const healthRoll = rollUpHealth([
    ...teams.map((t) => t.health),
    ...people.map((p) => p.health),
  ]);
  const weakest = [
    ...teams.flatMap((t) =>
      t.health && needsAttention(t.health.level)
        ? [{ kind: "team" as const, id: t.id, name: t.name, health: t.health }]
        : []
    ),
    ...people.flatMap((p) =>
      p.health && needsAttention(p.health.level)
        ? [{ kind: "person" as const, id: p.id, name: p.name, health: p.health, photo: p.photo }]
        : []
    ),
  ].sort(
    (a, b) =>
      HEALTH_LEVELS.indexOf(b.health.level) - HEALTH_LEVELS.indexOf(a.health.level)
  );

  const generateBrief = async () => {
    setLoading(true);
    setError(null);
    try {
      let acc = "";
      const text = await streamChat(
        orgSystemPrompt(),
        [
          {
            role: "user",
            content:
              "Give me an executive brief on my leadership right now: (1) assessment coverage gaps and who to assess next, (2) who needs attention and why, (3) team strengths blind spots and what they mean practically. Use short sections with headers. Be direct.",
          },
        ],
        (delta) => {
          acc += delta;
          setBrief(acc);
        }
      );
      setBrief(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate brief.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* AI executive brief */}
      <Card className="p-5 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Executive brief</SectionTitle>
          {keyed && (
            <Button
              size="md"
              onClick={generateBrief}
              isDisabled={loading}
              isLoading={loading}
              showTextWhileLoading
            >
              {loading ? "Thinking…" : brief ? "Regenerate" : "✦ Generate with AI"}
            </Button>
          )}
        </div>
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        {brief ? (
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-200">
            {brief}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-stone-600 dark:text-stone-300">
            {/* Local (non-AI) brief so the tab is useful without a key */}
            <p>
              You lead <strong>{people.length} people</strong> across{" "}
              <strong>{teams.length} teams</strong>.{" "}
              {unassessed.length === 0
                ? "Everyone has a leadership read."
                : `${unassessed.length} still need a profile read: ${unassessed
                    .map((p) => p.name)
                    .join(", ")}.`}
            </p>
            {spots.length > 0 && (
              <p>
                ⚠ Strengths blind spot: no one's Top 5 includes{" "}
                <strong>{spots.join(" or ")}</strong> themes
                {" — "}watch for gaps in{" "}
                {spots
                  .map((d) =>
                    d === "Executing"
                      ? "follow-through"
                      : d === "Influencing"
                        ? "selling the vision"
                        : d === "Relationship Building"
                          ? "team cohesion"
                          : "long-range planning"
                  )
                  .join(" and ")}
                .
              </p>
            )}
            <p>
              {openActions.length} open action{openActions.length === 1 ? "" : "s"}
              {upcoming.length > 0 &&
                ` · next 1:1 on ${upcoming[0].nextDate}`}
              .
            </p>
            {!keyed && (
              <p className="text-xs text-stone-400">
                AI brief needs a signed-in session and the server AI function.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Who needs attention */}
      <div className="space-y-4">
        {/* Health — my own calls, worst first. Readiness below is about prep;
            this is about the thing itself. */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <SectionTitle>Health scan</SectionTitle>
            <Button
              size="sm"
              color="link-color"
              onClick={() => {
                setHealthScan(["strained", "critical"]);
                setTab("table");
              }}
            >
              Open in table
            </Button>
          </div>
          {healthRoll.rated === 0 ? (
            <p className="mt-3 text-sm text-stone-400">
              Nothing rated yet. Set a health on any team or person and it shows
              up here, on the canvas, and in the table.
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-1">
                <HealthBar roll={healthRoll} />
                <div className="text-[11px] text-stone-400">
                  {healthRoll.rated} of {teams.length + people.length} rated
                  {healthRoll.level && (
                    <>
                      {" · overall "}
                      <span
                        className="font-medium"
                        style={{ color: HEALTH_COLOR[healthRoll.level] }}
                      >
                        {HEALTH_LABEL[healthRoll.level].toLowerCase()}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {weakest.length === 0 && (
                  <li className="text-sm text-stone-400">
                    Nothing strained or critical. ✓
                  </li>
                )}
                {weakest.map((w) => (
                  <li key={`${w.kind}-${w.id}`}>
                    <button
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      onClick={() =>
                        w.kind === "person" ? selectPerson(w.id) : selectTeam(w.id)
                      }
                    >
                      {w.kind === "person" ? (
                        <Avatar name={w.name} photo={w.photo} size={30} />
                      ) : (
                        <span
                          className="h-[30px] w-[30px] shrink-0 rounded-lg"
                          style={{
                            backgroundColor: HEALTH_COLOR[w.health.level] + "24",
                          }}
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: HEALTH_COLOR[w.health.level],
                            }}
                          />
                          {w.name}
                        </div>
                        <div className="truncate text-[11px] text-stone-400">
                          {w.health.note ?? HEALTH_LABEL[w.health.level]}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="mt-3 space-y-2">
            {needAttention.length === 0 && (
              <li className="text-sm text-stone-400">
                Every tracked 1:1 is on track. 🎉
              </li>
            )}
            {needAttention.map(({ person: p, readiness }) => (
              <li key={p.id}>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  onClick={() => {
                    selectPerson(p.id);
                  }}
                >
                  <Avatar name={p.name} photo={p.photo} size={30} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: STATE_COLOR[readiness.state] }}
                      />
                      {p.name}
                    </div>
                    <div className="truncate text-[11px] text-stone-400">
                      {readiness.headline}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle>Coverage gaps</SectionTitle>
          <ul className="mt-3 space-y-2">
            {unassessed.length === 0 && (
              <li className="text-sm text-stone-400">Everyone has a read. ✓</li>
            )}
            {unassessed.map((p) => (
              <li key={p.id}>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  onClick={() => {
                    selectPerson(p.id);
                  }}
                >
                  <Avatar name={p.name} photo={p.photo} size={30} dimmed />
                  <div>
                    <div className="text-sm">{p.name}</div>
                    <div className="text-[11px] text-stone-400">
                      No profile read yet
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <SectionTitle>Domain totals</SectionTitle>
          <ul className="mt-3 space-y-1 text-sm">
            {DOMAINS.map((d) => (
              <li key={d} className="flex justify-between">
                <span className="text-stone-500">{d}</span>
                <span className="font-medium">{counts[d]}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
