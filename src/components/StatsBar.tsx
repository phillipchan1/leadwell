import type { Person } from "../types";
import { DOMAINS, DOMAIN_COLOR } from "../data/frameworks";
import { blindSpots, domainCounts, hasLeadershipRead, isAssessed, personalityMix } from "../lib/derive";
import { Card, SectionTitle } from "./ui";
import { StrengthsDonut } from "./StrengthsDonut";

export function StatsBar({ people }: { people: Person[] }) {
  const counts = domainCounts(people);
  const totalThemes = DOMAINS.reduce((sum, d) => sum + counts[d], 0);
  const withRead = people.filter(hasLeadershipRead).length;
  const formallyAssessed = people.filter(isAssessed).length;
  const mix = personalityMix(people);
  const spots = blindSpots(people);

  return (
    <Card className="grid grid-cols-1 gap-6 bg-stone-50/60 p-5 dark:bg-stone-950/40 md:grid-cols-3">
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
              <span className="text-tertiary">{d}</span>
              <span className="text-quaternary">
                {totalThemes ? Math.round((counts[d] / totalThemes) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage */}
      <div className="space-y-2">
        <SectionTitle>Coverage</SectionTitle>
        <div className="text-3xl font-semibold">
          {withRead}
          <span className="text-lg font-normal text-quaternary">
            /{people.length} with a read
          </span>
        </div>
        <p className="text-xs text-quaternary">
          {formallyAssessed} with Clifton / Enneagram / MBTI
        </p>
        {spots.length > 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠ Blind spot: no {spots.join(", no ")} strengths in anyone's Top 5.
          </p>
        ) : totalThemes > 0 ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            ✓ All four domains represented.
          </p>
        ) : (
          <p className="text-xs text-quaternary">
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
    </Card>
  );
}

function MixRow({ label, mix }: { label: string; mix: Record<string, number> }) {
  const entries = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  return (
    <div className="text-xs">
      <span className="text-quaternary">{label}: </span>
      {entries.length === 0 ? (
        <span className="text-stone-400 dark:text-stone-600">none recorded</span>
      ) : (
        <span className="text-tertiary">
          {entries
            .map(([k, n]) => (n > 1 ? `${k} ×${n}` : k))
            .join(" · ")}
        </span>
      )}
    </div>
  );
}
