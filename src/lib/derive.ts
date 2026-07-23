import type { StrengthDomain, Person } from "../types";
import {
  DOMAINS,
  ENNEAGRAM,
  parseEnneagram,
  THEME_DOMAIN,
} from "../data/frameworks";

/** A person counts as "assessed" once any framework result is recorded. */
export function isAssessed(p: Person): boolean {
  const a = p.assessments;
  return Boolean((a.cliftonTop5 && a.cliftonTop5.length > 0) || a.enneagram || a.mbti);
}

export function teamCoverage(people: Person[]): { assessed: number; total: number } {
  return {
    assessed: people.filter(isAssessed).length,
    total: people.length,
  };
}

/** Count Top-5 theme occurrences per domain across a set of people. */
export function domainCounts(people: Person[]): Record<StrengthDomain, number> {
  const counts = Object.fromEntries(DOMAINS.map((d) => [d, 0])) as Record<
    StrengthDomain,
    number
  >;
  for (const p of people) {
    for (const theme of p.assessments.cliftonTop5 ?? []) {
      const d = THEME_DOMAIN[theme];
      if (d) counts[d]++;
    }
  }
  return counts;
}

/** Domains with zero representation among people who have Top 5s recorded. */
export function blindSpots(people: Person[]): StrengthDomain[] {
  const withClifton = people.filter((p) => (p.assessments.cliftonTop5 ?? []).length > 0);
  if (withClifton.length === 0) return [];
  const counts = domainCounts(withClifton);
  return DOMAINS.filter((d) => counts[d] === 0);
}

/**
 * The "read on them": manual strengths/watch-outs plus chips derived from
 * the Enneagram type, deduped.
 */
export function derivedRead(p: Person): { strengths: string[]; watchOuts: string[] } {
  const enn = parseEnneagram(p.assessments.enneagram);
  const info = enn ? ENNEAGRAM[enn.type] : undefined;
  const dedupe = (xs: string[]) => [...new Set(xs)];
  return {
    strengths: dedupe([...p.strengths, ...(info?.strengths ?? [])]),
    watchOuts: dedupe([...p.watchOuts, ...(info?.watchOuts ?? [])]),
  };
}

/** Top domain for a person's Top 5, e.g. for the People table. */
export function topDomain(p: Person): StrengthDomain | null {
  const top5 = p.assessments.cliftonTop5 ?? [];
  if (top5.length === 0) return null;
  const counts = domainCounts([p]);
  return DOMAINS.reduce((best, d) => (counts[d] > counts[best] ? d : best), DOMAINS[0]);
}

/** Enneagram/MBTI spread, e.g. { "2w1": 1, "7w8": 1 } */
export function personalityMix(people: Person[]): {
  enneagram: Record<string, number>;
  mbti: Record<string, number>;
} {
  const enneagram: Record<string, number> = {};
  const mbti: Record<string, number> = {};
  for (const p of people) {
    if (p.assessments.enneagram)
      enneagram[p.assessments.enneagram] = (enneagram[p.assessments.enneagram] ?? 0) + 1;
    if (p.assessments.mbti)
      mbti[p.assessments.mbti] = (mbti[p.assessments.mbti] ?? 0) + 1;
  }
  return { enneagram, mbti };
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

/** Stable pastel-ish color for initials avatars, keyed off the name. */
export function avatarColor(name: string): string {
  const palette = [
    "#0D9488",
    "#8B5CF6",
    "#F59E0B",
    "#D4537E",
    "#1D9E75",
    "#7F77DD",
    "#EF9F27",
    "#3B82F6",
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
