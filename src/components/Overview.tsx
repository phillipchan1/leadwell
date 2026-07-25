import { useState } from "react";
import { useStore } from "../store/useStore";
import { DOMAINS } from "../data/frameworks";
import {
  blindSpots,
  domainCounts,
  isAssessed,
} from "../lib/derive";
import { hasApiKey, orgSystemPrompt, streamChat } from "../lib/ai";
import { Card, SectionTitle, buttonPrimaryCls } from "./ui";
import { Avatar } from "./Avatar";

export function Overview() {
  const {
    people,
    teams,
    oneOnOnes,
    actions,
    selectPerson,
    setTab,
  } = useStore();
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyed = hasApiKey();

  const unassessed = people.filter((p) => !isAssessed(p));
  const spots = blindSpots(people);
  const counts = domainCounts(people);
  const openActions = actions.filter((a) => !a.done);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = oneOnOnes
    .filter((o) => o.nextDate && o.nextDate >= today)
    .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!));
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 30);
  const staleCutoff = staleThreshold.toISOString().slice(0, 10);
  const needAttention = people.filter((p) => {
    const last = oneOnOnes
      .filter((o) => o.personId === p.id)
      .map((o) => o.date)
      .sort()
      .pop();
    return !last || last < staleCutoff;
  });

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
            <button
              className={buttonPrimaryCls}
              onClick={generateBrief}
              disabled={loading}
            >
              {loading ? "Thinking…" : brief ? "Regenerate" : "✦ Generate with AI"}
            </button>
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
                ? "Everyone is assessed."
                : `${unassessed.length} still need assessments: ${unassessed
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
        <Card className="p-5">
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="mt-3 space-y-2">
            {needAttention.length === 0 && (
              <li className="text-sm text-stone-400">
                Everyone has had a recent 1:1. 🎉
              </li>
            )}
            {needAttention.map((p) => (
              <li key={p.id}>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  onClick={() => {
                    selectPerson(p.id);
                    setTab("tree");
                  }}
                >
                  <Avatar name={p.name} photo={p.photo} size={30} />
                  <div>
                    <div className="text-sm">{p.name}</div>
                    <div className="text-[11px] text-stone-400">
                      No 1:1 in the last 30 days
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
              <li className="text-sm text-stone-400">Fully assessed. ✓</li>
            )}
            {unassessed.map((p) => (
              <li key={p.id}>
                <button
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-800/50"
                  onClick={() => {
                    selectPerson(p.id);
                    setTab("tree");
                  }}
                >
                  <Avatar name={p.name} photo={p.photo} size={30} dimmed />
                  <div>
                    <div className="text-sm">{p.name}</div>
                    <div className="text-[11px] text-stone-400">
                      No assessments yet
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
