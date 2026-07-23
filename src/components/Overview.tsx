import { useState } from "react";
import { useStore } from "../store/useStore";
import { DOMAINS, DOMAIN_COLOR } from "../data/frameworks";
import { blindSpots, domainCounts, isAssessed } from "../lib/derive";
import { hasApiKey, orgSystemPrompt, streamChat } from "../lib/ai";
import { Card, DueDate, IconSparkle, SectionTitle, buttonPrimaryCls } from "./ui";
import { Avatar } from "./Avatar";

export function Overview() {
  const {
    people,
    teams,
    oneOnOnes,
    actions,
    selectPerson,
    setTab,
    anthropicApiKey,
    setSettingsOpen,
  } = useStore();
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyed = hasApiKey();
  void anthropicApiKey;

  const unassessed = people.filter((p) => !isAssessed(p));
  const spots = blindSpots(people);
  const counts = domainCounts(people);
  const totalThemes = DOMAINS.reduce((sum, d) => sum + counts[d], 0);
  const openActions = actions.filter((a) => !a.done);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = oneOnOnes
    .filter((o) => o.nextDate && o.nextDate >= today)
    .sort((a, b) => a.nextDate!.localeCompare(b.nextDate!));

  // One row per person: their soonest scheduled next 1:1 (incl. overdue ones).
  const nextByPerson = new Map<string, string>();
  for (const o of oneOnOnes) {
    if (!o.nextDate) continue;
    const cur = nextByPerson.get(o.personId);
    if (!cur || o.nextDate < cur) nextByPerson.set(o.personId, o.nextDate);
  }
  const schedule = [...nextByPerson.entries()]
    .map(([personId, date]) => ({
      person: people.find((p) => p.id === personId),
      date,
    }))
    .filter((r) => r.person)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
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
    <div className="anim-fade-up mx-auto max-w-6xl">
      {/* Page heading — the app's quiet editorial voice */}
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Your leadership at a glance
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {people.length} people · {teams.length} teams ·{" "}
            {openActions.length} open action{openActions.length === 1 ? "" : "s"}
            {upcoming.length > 0 && ` · next 1:1 on ${upcoming[0].nextDate}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* AI executive brief */}
        <Card className="p-5 lg:col-span-2 lg:self-start">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Executive brief</SectionTitle>
            {keyed && (
              <button
                className={buttonPrimaryCls}
                onClick={generateBrief}
                disabled={loading}
              >
                <IconSparkle size={13} />
                {loading ? "Thinking…" : brief ? "Regenerate" : "Generate with AI"}
              </button>
            )}
          </div>
          {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
          {brief ? (
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-ink-2 dark:text-ink">
              {brief}
            </div>
          ) : (
            <div className="space-y-3 text-sm leading-relaxed text-ink-2">
              {/* Local (non-AI) brief so the tab is useful without a key */}
              <p>
                You lead{" "}
                <strong className="text-ink">{people.length} people</strong>{" "}
                across <strong className="text-ink">{teams.length} teams</strong>
                .{" "}
                {unassessed.length === 0
                  ? "Everyone is assessed."
                  : `${unassessed.length} still need assessments: ${unassessed
                      .map((p) => p.name)
                      .join(", ")}.`}
              </p>
              {spots.length > 0 && (
                <p className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-amber-800 ring-1 ring-amber-500/20 ring-inset dark:text-amber-200">
                  Strengths blind spot: no one's Top 5 includes{" "}
                  <strong>{spots.join(" or ")}</strong> themes — watch for gaps
                  in{" "}
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
              {!keyed && (
                <p className="text-xs text-ink-3">
                  Add an Anthropic key in{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-accent-ink"
                    onClick={() => setSettingsOpen(true)}
                  >
                    Settings
                  </button>{" "}
                  for an AI-generated brief.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Who needs attention */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle>Upcoming 1:1s</SectionTitle>
            <ul className="mt-3 space-y-1">
              {schedule.length === 0 && (
                <li className="text-sm text-ink-3">
                  Nothing scheduled — open someone and set a next 1:1.
                </li>
              )}
              {schedule.map(({ person: p, date }) => (
                <li key={p!.id}>
                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                    onClick={() => {
                      selectPerson(p!.id);
                      setTab("tree");
                    }}
                  >
                    <Avatar name={p!.name} photo={p!.photo} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {p!.name}
                      </div>
                    </div>
                    <DueDate iso={date} className="shrink-0 text-xs" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-5">
            <SectionTitle>Needs attention</SectionTitle>
            <ul className="mt-3 space-y-1">
              {needAttention.length === 0 && (
                <li className="text-sm text-ink-3">
                  Everyone has had a recent 1:1.
                </li>
              )}
              {needAttention.map((p) => (
                <li key={p.id}>
                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                    onClick={() => {
                      selectPerson(p.id);
                      setTab("tree");
                    }}
                  >
                    <Avatar name={p.name} photo={p.photo} size={30} />
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-ink-3">
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
            <ul className="mt-3 space-y-1">
              {unassessed.length === 0 && (
                <li className="text-sm text-ink-3">Fully assessed.</li>
              )}
              {unassessed.map((p) => (
                <li key={p.id}>
                  <button
                    className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                    onClick={() => {
                      selectPerson(p.id);
                      setTab("tree");
                    }}
                  >
                    <Avatar name={p.name} photo={p.photo} size={30} dimmed />
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-ink-3">
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
            <ul className="mt-3 space-y-2.5">
              {DOMAINS.map((d) => {
                const pct = totalThemes
                  ? Math.round((counts[d] / totalThemes) * 100)
                  : 0;
                return (
                  <li key={d} className="text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: DOMAIN_COLOR[d] }}
                        />
                        {d}
                      </span>
                      <span className="font-medium tabular-nums text-ink">
                        {counts[d]}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: DOMAIN_COLOR[d],
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
