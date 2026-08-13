import { useMemo, useState } from "react";
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
  readinessFor,
  todayISO,
} from "../lib/readiness";
import { allLooseTopics } from "../lib/topics";
import {
  HEALTH_COLOR,
  HEALTH_LABEL,
  HEALTH_LEVELS,
  needsAttention,
  rollUpHealth,
} from "../lib/health";
import {
  PRAYER_COLOR,
  daysSincePrayed,
  formatCarried,
  formatLastPrayed,
  prayerState,
  recentAnswers,
  rollUpPrayer,
} from "../lib/prayer";
import { hasApiKey, orgSystemPrompt, streamChat } from "../lib/ai";
import { Card, SectionTitle } from "./ui";
import { SkeletonLines } from "./Skeleton";
import { Button } from "@/components/base/buttons/button";
import { Avatar } from "./Avatar";
import { HealthBar } from "./Health";
import { PrayerIcon, PrayerMark } from "./Prayer";

export function Overview() {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const managers = useStore((s) => s.managers);
  const prayers = useStore((s) => s.prayers);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);
  const setTab = useStore((s) => s.setTab);
  const setHealthScan = useStore((s) => s.setHealthScan);
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyed = hasApiKey();

  /**
   * ── Why everything below is memoized ──────────────────────────────────────
   *
   * This file had no `useMemo` at all, and it is now the tab the app opens on.
   * Every value here is a scan over the whole org — `needAttention` calls
   * `readinessFor` per person — and they were all recomputed on any render,
   * including one caused by typing in the AI brief box.
   *
   * The dependency arrays are the collections each value genuinely reads, so
   * setting a health level redraws the health card without re-deriving the
   * prayer roll beside it.
   */
  const unassessed = useMemo(
    () => people.filter((p) => !hasLeadershipRead(p)),
    [people]
  );
  const spots = useMemo(() => blindSpots(people), [people]);
  const counts = useMemo(() => domainCounts(people), [people]);
  const openTopics = useMemo(
    () => topics.filter((t) => t.status === "open"),
    [topics]
  );

  const today = todayISO();
  // Planned into a meeting that's already been and gone. The one number worth
  // putting on the dashboard, because nothing else surfaces it.
  const loose = useMemo(
    () => allLooseTopics(topics, sessions, today),
    [topics, sessions, today]
  );
  const upcoming = useMemo(
    () =>
      sessions
        .filter((o) => o.nextDate && o.nextDate >= today)
        .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!)),
    [sessions, today]
  );
  // Readiness, not a blanket 30-day rule: someone on a quarterly rhythm isn't
  // neglected at day 31, and someone weekly is already behind by then.
  const needAttention = useMemo(
    () =>
      people
        .flatMap((p) => {
          // Worst-of when they have more than one meeting — one row per person,
          // showing the one that's actually in trouble.
          const readiness = readinessFor("person", p.id, {
            meetings,
            sessions,
            topics,
          });
          if (!readiness) return [];
          return isBehind(readiness.state) ? [{ person: p, readiness }] : [];
        })
        .sort(
          (a, b) =>
            STATE_ORDER.indexOf(a.readiness.state) -
            STATE_ORDER.indexOf(b.readiness.state)
        ),
    [people, meetings, sessions, topics]
  );

  // The health scan, boiled down to the one question worth a card: what am I
  // carrying that I've already told myself is in trouble?
  const healthRoll = useMemo(
    () =>
      rollUpHealth([...teams.map((t) => t.health), ...people.map((p) => p.health)]),
    [teams, people]
  );
  const weakest = useMemo(
    () =>
      [
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
          HEALTH_LEVELS.indexOf(b.health.level) -
          HEALTH_LEVELS.indexOf(a.health.level)
      ),
    [teams, people]
  );

  /**
   * The prayer list, boiled down to the two things worth surfacing on a
   * dashboard: who I'm carrying, and who I've quietly stopped praying for.
   * Sorted by silence, longest first — that's the whole point of the card.
   */
  const carried = useMemo(
    () =>
      [
        ...teams.flatMap((t) =>
          t.prayer
            ? [{ kind: "team" as const, id: t.id, name: t.name, prayer: t.prayer }]
            : []
        ),
        ...people.flatMap((p) =>
          p.prayer
            ? [
                {
                  kind: "person" as const,
                  id: p.id,
                  name: p.name,
                  photo: p.photo,
                  prayer: p.prayer,
                },
              ]
            : []
        ),
        ...managers.flatMap((m) =>
          m.prayer
            ? [
                {
                  kind: "manager" as const,
                  id: m.id,
                  name: m.name,
                  photo: m.photo,
                  prayer: m.prayer,
                },
              ]
            : []
        ),
      ].sort(
        (a, b) =>
          (daysSincePrayed(b.prayer) ?? 1e6) - (daysSincePrayed(a.prayer) ?? 1e6)
      ),
    [teams, people, managers]
  );
  const prayerRoll = useMemo(
    () =>
      rollUpPrayer([
        ...teams.map((t) => t.prayer),
        ...people.map((p) => p.prayer),
        ...managers.map((m) => m.prayer),
      ]),
    [teams, people, managers]
  );
  const answers = useMemo(() => recentAnswers(prayers), [prayers]);

  const openPrayer = (kind: "team" | "person" | "manager", id: string) => {
    if (kind === "person") selectPerson(id, "prayer");
    else if (kind === "team") selectTeam(id, "prayer");
    else selectManager(id, "prayer");
  };

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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* AI executive brief */}
      <Card className="order-last p-6 lg:order-first lg:col-span-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
        {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {loading && !brief ? (
          /* Reserve the height the answer will occupy so the card doesn't
             reflow on every streamed token. */
          <SkeletonLines count={3} className="min-h-[7rem]" />
        ) : brief ? (
          <div className="min-h-[7rem] text-sm leading-relaxed whitespace-pre-wrap text-stone-700 dark:text-stone-200">
            {brief}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-stone-600 dark:text-stone-400">
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
              {openTopics.length} open topic{openTopics.length === 1 ? "" : "s"}
              {loose.length > 0 &&
                ` · ${loose.length} planned and never covered`}
              {upcoming.length > 0 &&
                ` · next 1:1 on ${upcoming[0].nextDate}`}
              .
            </p>
            {!keyed && (
              <p className="text-xs text-stone-500 dark:text-stone-400">
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
        <Card className="p-6">
          <div className="flex items-baseline justify-between gap-2">
            <SectionTitle>Health scan</SectionTitle>
            <Button
              size="sm"
              color="link-gray"
              onClick={() => {
                setHealthScan(["strained", "critical"]);
                setTab("table");
              }}
            >
              Open in table
            </Button>
          </div>
          {healthRoll.rated === 0 ? (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
              Nothing rated yet. Set a health on any team or person and it shows
              up here, on the canvas, and in the table.
            </p>
          ) : (
            <>
              <div className="mt-3 space-y-1">
                <HealthBar roll={healthRoll} />
                <div className="text-[11px] text-stone-500 dark:text-stone-400">
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
                  <li className="text-sm text-stone-500 dark:text-stone-400">
                    Nothing strained or critical. ✓
                  </li>
                )}
                {weakest.map((w) => (
                  <li key={`${w.kind}-${w.id}`}>
                    <button
                      className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
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
                        <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
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

        {/* The prayer list. No score, no percentage — the only number here
            that asks for anything is how long it's been. */}
        <Card className="p-6">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-center gap-2">
              <PrayerIcon className="size-3.5 text-violet-500 dark:text-violet-300" />
              <SectionTitle>Prayer list</SectionTitle>
            </div>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {prayerRoll.carried > 0 && (
                <>
                  carrying{" "}
                  <span className="tabular-nums">{prayerRoll.carried}</span>
                  {prayerRoll.cold > 0 && (
                    <span style={{ color: PRAYER_COLOR.cold }}>
                      {" · "}
                      {prayerRoll.cold} gone quiet
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
          {carried.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
              Nobody on the list yet. Open anyone — or a whole team — and take
              them up in prayer; they'll show up here and on the canvas.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {carried.map((c) => (
                <li key={`${c.kind}-${c.id}`}>
                  <button
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
                    onClick={() => openPrayer(c.kind, c.id)}
                  >
                    {c.kind === "team" ? (
                      <span
                        className="h-[30px] w-[30px] shrink-0 rounded-lg"
                        style={{
                          backgroundColor:
                            PRAYER_COLOR[prayerState(c.prayer)] + "24",
                        }}
                        aria-hidden
                      />
                    ) : (
                      <Avatar name={c.name} photo={c.photo} size={30} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.name}</div>
                      <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                        {c.prayer.focus ??
                          [formatCarried(c.prayer), formatLastPrayed(c.prayer)]
                            .filter(Boolean)
                            .join(" · ")}
                      </div>
                    </div>
                    <PrayerMark prayer={c.prayer} size="sm" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {answers.length > 0 && (
            /* Answered in the last month. The one thing on this page worth
               reading twice. */
            <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
              <div className="text-[10px] font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
                Answered lately
              </div>
              <ul className="mt-2 space-y-1.5">
                {answers.slice(0, 3).map((a) => (
                  <li key={a.id} className="prayer-text !text-[13px]">
                    {a.answerNote ?? a.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="mt-3 space-y-2">
            {needAttention.length === 0 && (
              <li className="text-sm text-stone-500 dark:text-stone-400">
                Every tracked 1:1 is on track. 🎉
              </li>
            )}
            {needAttention.map(({ person: p, readiness }) => (
              <li key={p.id}>
                <button
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
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
                    <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                      {readiness.headline}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
          <SectionTitle>Coverage gaps</SectionTitle>
          <ul className="mt-3 space-y-2">
            {unassessed.length === 0 && (
              <li className="text-sm text-stone-500 dark:text-stone-400">Everyone has a read. ✓</li>
            )}
            {unassessed.map((p) => (
              <li key={p.id}>
                <button
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-stone-50 active:bg-stone-100 dark:hover:bg-stone-800/50 dark:active:bg-stone-800"
                  onClick={() => {
                    selectPerson(p.id);
                  }}
                >
                  <Avatar name={p.name} photo={p.photo} size={30} dimmed />
                  <div>
                    <div className="text-sm">{p.name}</div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-400">
                      No profile read yet
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-6">
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
