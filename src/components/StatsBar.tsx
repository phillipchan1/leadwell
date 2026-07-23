import type { Person } from "../types";
import { DOMAINS, DOMAIN_COLOR } from "../data/frameworks";
import {
  blindSpots,
  domainCounts,
  isAssessed,
  personalityMix,
} from "../lib/derive";
import { SectionTitle } from "./ui";
import { StrengthsDonut } from "./StrengthsDonut";

export function StatsBar({ people }: { people: Person[] }) {
  const counts = domainCounts(people);
  const totalThemes = DOMAINS.reduce((sum, d) => sum + counts[d], 0);
  const assessed = people.filter(isAssessed).length;
  const mix = personalityMix(people);
  const spots = blindSpots(people);

  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-line bg-surface-2/60 p-4 md:grid-cols-3">
      {/* Strengths balance donut */}
      <div className="flex items-center gap-4">
        <StrengthsDonut counts={counts} size={96} />
        <div className="space-y-1">
          <SectionTitle>Strengths balance</SectionTitle>
          {DOMAINS.map((d) => (
            <div key={d} className="flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: DOMAIN_COLOR[d] }}
              />
              <span className="text-ink-2">{d}</span>
              <span className="tabular-nums text-ink-3">
                {totalThemes ? Math.round((counts[d] / totalThemes) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage */}
      <div className="space-y-2">
        <SectionTitle>Coverage</SectionTitle>
        <div className="font-display text-3xl font-semibold tracking-tight">
          {assessed}
          <span className="text-lg font-normal text-ink-3">
            /{people.length} assessed
          </span>
        </div>
        {spots.length > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Blind spot: no {spots.join(", no ")} strengths in anyone's Top 5.
          </p>
        ) : totalThemes > 0 ? (
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            All four domains represented.
          </p>
        ) : (
          <p className="text-xs text-ink-3">
            Add CliftonStrengths results to see the balance.
          </p>
        )}
      </div>

      {/* Personality mix */}
      <div className="space-y-2">
        <SectionTitle>Personality mix</SectionTitle>
        <MixRow label="Enneagram" mix={mix.enneagram} />
        <MixRow label="MBTI" mix={mix.mbti} />
      </div>
    </div>
  );
}

function MixRow({ label, mix }: { label: string; mix: Record<string, number> }) {
  const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  return (
    <div className="text-xs">
      <span className="text-ink-3">{label}: </span>
      {entries.length === 0 ? (
        <span className="text-ink-3/60">none recorded</span>
      ) : (
        <span className="text-ink-2">
          {entries.map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(" · ")}
        </span>
      )}
    </div>
  );
}
