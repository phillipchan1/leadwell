/**
 * Live, client-side profile signal extraction — Fantastical-style.
 * As the user types, we surface frameworks, traits, and confidence without
 * waiting for a full AI draft. AI drafts later refine the same canvas.
 */
import type { StrengthDomain } from "../types";
import type { ProfileDirection } from "./ai";
import {
  ALL_MBTI,
  ALL_THEMES,
  DOMAIN_COLOR,
  ENNEAGRAM,
  MBTI,
  THEME_DOMAIN,
} from "../data/frameworks";

export type SignalConfidence = "high" | "medium" | "low";

export type ProfileSignal = {
  id: string;
  kind:
    | "clifton"
    | "enneagram"
    | "mbti"
    | "modality"
    | "strength"
    | "watchOut"
    | "howToLead"
    | "leadUp";
  label: string;
  detail?: string;
  confidence: SignalConfidence;
  /** Clifton domain when kind === clifton */
  domain?: StrengthDomain;
  color?: string;
};

export type LiveProfileRead = {
  signals: ProfileSignal[];
  /** 0–100: how much of a usable profile we can see forming */
  completeness: number;
  /** 0–100: how sure we are about what's been detected */
  confidence: number;
  domains: Record<StrengthDomain, number>;
  headline: string;
};

const CONFIDENCE_SCORE: Record<SignalConfidence, number> = {
  high: 92,
  medium: 68,
  low: 42,
};

const MODALITY_PATTERNS: { re: RegExp; name: string }[] = [
  { re: /\bworking\s*genius\b/i, name: "Working Genius" },
  { re: /\bdisc\b/i, name: "DISC" },
  { re: /\bstrengths?\s*finder\b/i, name: "StrengthsFinder" },
  { re: /\bclifton\b/i, name: "CliftonStrengths" },
  { re: /\benneagram\b/i, name: "Enneagram" },
  { re: /\bmbti\b|\bmyers[- ]?briggs\b/i, name: "MBTI" },
  { re: /\bpastoral\s+style\b/i, name: "Pastoral style" },
  { re: /\bvia\s+character\b/i, name: "VIA" },
  { re: /\bbig\s*five\b|\bocean\b/i, name: "Big Five" },
];

/** Soft behavioral cues — not frameworks, just trait hints while typing. */
const STRENGTH_CUES: { re: RegExp; label: string }[] = [
  { re: /\bcreative\b/i, label: "Creative" },
  { re: /\brelational\b/i, label: "Relational" },
  { re: /\banalytical\b/i, label: "Analytical" },
  { re: /\bdecisive\b/i, label: "Decisive" },
  { re: /\bempath(y|etic)\b/i, label: "Empathetic" },
  { re: /\bvisionar(y|ies)\b/i, label: "Visionary" },
  { re: /\bdetail[- ]oriented\b/i, label: "Detail-oriented" },
  { re: /\bcollaborat(ive|or|es)\b/i, label: "Collaborative" },
  { re: /\bindependent\b/i, label: "Independent" },
  { re: /\bsteady\b|\breliable\b/i, label: "Steady" },
  { re: /\benergetic\b|\bhigh[- ]energy\b/i, label: "Energetic" },
  { re: /\bpresence\b/i, label: "Leads with presence" },
  { re: /\bprocess[- ]driven\b|\bsystems?\b/i, label: "Process-minded" },
  { re: /\bwarm\b/i, label: "Warm" },
  { re: /\bdirect\b/i, label: "Direct" },
];

const WATCH_CUES: { re: RegExp; label: string }[] = [
  { re: /\bperfectionis(t|m)\b/i, label: "Perfectionism" },
  { re: /\bburnout\b/i, label: "Burnout risk" },
  { re: /\bovercommits?\b|\bsays yes too (often|much)\b/i, label: "Overcommits" },
  { re: /\bavoids?\s+conflict\b/i, label: "Avoids conflict" },
  { re: /\bscattered\b/i, label: "Scattered focus" },
  { re: /\bwithdraws?\b/i, label: "Withdraws under pressure" },
  { re: /\bmicromanag/i, label: "Micromanages" },
  { re: /\bimpatient\b/i, label: "Impatient" },
];

const LEADUP_CUES: { key: string; re: RegExp; label: string }[] = [
  { key: "currency", re: /\bcurrency\b|\brewards?\b|\bcares about\b|\bimpress/i, label: "Currency signal" },
  { key: "anxieties", re: /\banxious\b|\bstress(es|ed)?\b|\bworr(y|ies)\b|\btrigger/i, label: "Anxiety signal" },
  { key: "comms", re: /\bupdate(s)?\b|\bslack\b|\bemail\b|\bcadence\b|\bbrief/i, label: "Comms signal" },
  { key: "scorecard", re: /\bmeasured\b|\bscorecard\b|\bboss\b|\bupward\b|\bkpi\b/i, label: "Scorecard signal" },
  { key: "wins", re: /\bgood looks like\b|\bwins?\b|\bstrong report\b/i, label: "What good looks like" },
];

function wordBoundaryTheme(theme: string): RegExp {
  const escaped = theme.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function uniqById(signals: ProfileSignal[]): ProfileSignal[] {
  const seen = new Set<string>();
  const out: ProfileSignal[] = [];
  for (const s of signals) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export function extractProfileSignals(
  text: string,
  direction: ProfileDirection
): LiveProfileRead {
  const raw = text.trim();
  const signals: ProfileSignal[] = [];
  const domains: Record<StrengthDomain, number> = {
    Executing: 0,
    Influencing: 0,
    "Relationship Building": 0,
    "Strategic Thinking": 0,
  };

  if (!raw) {
    return {
      signals: [],
      completeness: 0,
      confidence: 0,
      domains,
      headline: "Start typing — the profile builds as you go.",
    };
  }

  // Clifton themes (exact catalog names)
  for (const theme of ALL_THEMES) {
    if (!wordBoundaryTheme(theme).test(raw)) continue;
    const domain = THEME_DOMAIN[theme];
    domains[domain] += 1;
    signals.push({
      id: `clifton:${theme}`,
      kind: "clifton",
      label: theme,
      detail: domain,
      confidence: "high",
      domain,
      color: DOMAIN_COLOR[domain],
    });
  }

  // Enneagram — "3w2", "type 4", "enneagram 7"
  const ennWing = raw.match(/\b([1-9])\s*w\s*([1-9])\b/i);
  const ennType =
    ennWing?.[1] ??
    raw.match(/\b(?:enneagram|type)\s*([1-9])\b/i)?.[1] ??
    raw.match(/\b([1-9])\s*\(\s*the\s+\w+/i)?.[1];
  if (ennType && ENNEAGRAM[ennType]) {
    const wing = ennWing?.[2];
    const info = ENNEAGRAM[ennType];
    signals.push({
      id: `enneagram:${ennType}${wing ? `w${wing}` : ""}`,
      kind: "enneagram",
      label: wing ? `${ennType}w${wing}` : ennType,
      detail: info.name,
      confidence: ennWing || /\benneagram\b/i.test(raw) ? "high" : "medium",
    });
  }

  // MBTI
  for (const t of ALL_MBTI) {
    if (!new RegExp(`\\b${t}\\b`, "i").test(raw)) continue;
    signals.push({
      id: `mbti:${t}`,
      kind: "mbti",
      label: t.toUpperCase(),
      detail: MBTI[t].split("—")[0].trim(),
      confidence: "high",
    });
  }

  // Named modalities
  for (const m of MODALITY_PATTERNS) {
    if (!m.re.test(raw)) continue;
    // Pull a short result snippet after the name when possible
    const match = raw.match(
      new RegExp(`${m.re.source}[^\\n.,;]{0,40}`, "i")
    );
    signals.push({
      id: `modality:${m.name.toLowerCase()}`,
      kind: "modality",
      label: m.name,
      detail: match?.[0]?.replace(m.re, "").trim() || "mentioned",
      confidence: "medium",
    });
  }

  // Soft trait cues
  for (const c of STRENGTH_CUES) {
    if (!c.re.test(raw)) continue;
    signals.push({
      id: `strength:${c.label.toLowerCase()}`,
      kind: "strength",
      label: c.label,
      confidence: "medium",
    });
  }
  for (const c of WATCH_CUES) {
    if (!c.re.test(raw)) continue;
    signals.push({
      id: `watch:${c.label.toLowerCase()}`,
      kind: "watchOut",
      label: c.label,
      confidence: "medium",
    });
  }

  // How-to-lead / work-best cues
  if (
    /\bhow to lead\b|\bbring out (their|my) best\b|\bworks? best\b|\bmotivate/i.test(
      raw
    ) ||
    (direction === "self" &&
      /\bi (need|prefer|work best|thrive)\b/i.test(raw))
  ) {
    signals.push({
      id: "howto:lead",
      kind: "howToLead",
      label: direction === "self" ? "How I work best" : "How to lead",
      confidence: "medium",
    });
  }

  if (direction === "up") {
    for (const c of LEADUP_CUES) {
      if (!c.re.test(raw)) continue;
      signals.push({
        id: `leadup:${c.key}`,
        kind: "leadUp",
        label: c.label,
        confidence: "medium",
      });
    }
  }

  const unique = uniqById(signals);

  // Completeness: weighted buckets for this direction
  const buckets =
    direction === "up"
      ? [
          unique.some((s) => s.kind === "leadUp"),
          unique.some((s) => s.kind === "strength" || s.kind === "clifton"),
          unique.some((s) => s.kind === "watchOut"),
          unique.some((s) => s.kind === "howToLead"),
          unique.some(
            (s) =>
              s.kind === "enneagram" ||
              s.kind === "mbti" ||
              s.kind === "modality"
          ),
        ]
      : [
          unique.some((s) => s.kind === "strength" || s.kind === "clifton"),
          unique.some((s) => s.kind === "watchOut"),
          unique.some((s) => s.kind === "howToLead"),
          unique.some((s) => s.kind === "clifton"),
          unique.some(
            (s) =>
              s.kind === "enneagram" ||
              s.kind === "mbti" ||
              s.kind === "modality"
          ),
        ];

  const filled = buckets.filter(Boolean).length;
  // Word volume soft-boosts completeness (more text → more of a read forming)
  const words = raw.split(/\s+/).filter(Boolean).length;
  const volumeBoost = Math.min(18, Math.floor(words / 12));
  const completeness = Math.min(
    100,
    Math.round((filled / buckets.length) * 82 + volumeBoost)
  );

  const confScores = unique.map((s) => CONFIDENCE_SCORE[s.confidence]);
  const confidence =
    confScores.length === 0
      ? Math.min(35, 10 + words)
      : Math.round(
          confScores.reduce((a, b) => a + b, 0) / confScores.length
        );

  const headline = buildHeadline(unique, direction, words);

  return { signals: unique, completeness, confidence, domains, headline };
}

function buildHeadline(
  signals: ProfileSignal[],
  direction: ProfileDirection,
  words: number
): string {
  if (signals.length === 0) {
    return words < 8
      ? "Listening…"
      : "Hearing texture — keep going for frameworks & traits.";
  }
  const clifton = signals.filter((s) => s.kind === "clifton").map((s) => s.label);
  const traits = signals.filter((s) => s.kind === "strength").map((s) => s.label);
  const enn = signals.find((s) => s.kind === "enneagram");
  const mbti = signals.find((s) => s.kind === "mbti");
  const mod = signals.find((s) => s.kind === "modality");

  const bits: string[] = [];
  if (clifton.length) bits.push(`Top themes: ${clifton.slice(0, 3).join(", ")}`);
  if (traits.length) bits.push(traits.slice(0, 3).join(" · "));
  if (enn) bits.push(`Enneagram ${enn.label}`);
  if (mbti) bits.push(mbti.label);
  if (mod) bits.push(mod.label);
  if (direction === "up" && signals.some((s) => s.kind === "leadUp")) {
    bits.push("operating manual forming");
  }
  return bits.slice(0, 3).join(" · ") || "Profile forming…";
}

/** Merge a finished AI draft into the live read for a richer canvas reveal. */
export function liveReadFromDraft(
  draft: {
    headline: string;
    suggestions: {
      field: string;
      value: string | string[];
      confidence: SignalConfidence;
    }[];
    modalities: {
      name: string;
      result: string;
      confidence: SignalConfidence;
    }[];
  },
  direction: ProfileDirection
): LiveProfileRead {
  const signals: ProfileSignal[] = [];
  const domains: Record<StrengthDomain, number> = {
    Executing: 0,
    Influencing: 0,
    "Relationship Building": 0,
    "Strategic Thinking": 0,
  };

  for (const sg of draft.suggestions) {
    const conf = sg.confidence;
    if (sg.field === "cliftonTop5" && Array.isArray(sg.value)) {
      for (const theme of sg.value) {
        const domain = THEME_DOMAIN[theme];
        if (domain) domains[domain] += 1;
        signals.push({
          id: `clifton:${theme}`,
          kind: "clifton",
          label: theme,
          detail: domain,
          confidence: conf,
          domain,
          color: domain ? DOMAIN_COLOR[domain] : undefined,
        });
      }
    } else if (sg.field === "enneagram") {
      signals.push({
        id: `enneagram:${String(sg.value)}`,
        kind: "enneagram",
        label: String(sg.value),
        confidence: conf,
      });
    } else if (sg.field === "mbti") {
      signals.push({
        id: `mbti:${String(sg.value)}`,
        kind: "mbti",
        label: String(sg.value).toUpperCase(),
        confidence: conf,
      });
    } else if (sg.field === "strengths" && Array.isArray(sg.value)) {
      for (const t of sg.value) {
        signals.push({
          id: `strength:${t.toLowerCase()}`,
          kind: "strength",
          label: t,
          confidence: conf,
        });
      }
    } else if (sg.field === "watchOuts" && Array.isArray(sg.value)) {
      for (const t of sg.value) {
        signals.push({
          id: `watch:${t.toLowerCase()}`,
          kind: "watchOut",
          label: t,
          confidence: conf,
        });
      }
    } else if (sg.field === "howToLead") {
      signals.push({
        id: "howto:lead",
        kind: "howToLead",
        label: direction === "self" ? "How I work best" : "How to lead",
        detail: String(sg.value).slice(0, 80),
        confidence: conf,
      });
    } else if (
      ["archetype", "winsLike", "anxieties", "currency", "comms", "theirScorecard"].includes(
        sg.field
      )
    ) {
      signals.push({
        id: `leadup:${sg.field}`,
        kind: "leadUp",
        label: sg.field,
        detail: String(sg.value).slice(0, 60),
        confidence: conf,
      });
    }
  }

  for (const m of draft.modalities) {
    signals.push({
      id: `modality:${m.name.toLowerCase()}`,
      kind: "modality",
      label: m.name,
      detail: m.result,
      confidence: m.confidence,
    });
  }

  const unique = uniqById(signals);
  const confScores = unique.map((s) => CONFIDENCE_SCORE[s.confidence]);
  const confidence =
    confScores.length === 0
      ? 50
      : Math.round(confScores.reduce((a, b) => a + b, 0) / confScores.length);

  const hasTraits = unique.some((s) => s.kind === "strength" || s.kind === "clifton");
  const hasWatch = unique.some((s) => s.kind === "watchOut");
  const hasHow = unique.some((s) => s.kind === "howToLead");
  const hasKnown = unique.some(
    (s) => s.kind === "enneagram" || s.kind === "mbti" || s.kind === "clifton"
  );
  const hasMod = unique.some((s) => s.kind === "modality");
  const hasLead = unique.some((s) => s.kind === "leadUp");
  const checks =
    direction === "up"
      ? [hasLead, hasTraits, hasWatch || hasHow, hasKnown || hasMod]
      : [hasTraits, hasWatch, hasHow, hasKnown || hasMod];
  const completeness = Math.min(
    100,
    Math.round((checks.filter(Boolean).length / checks.length) * 100)
  );

  return {
    signals: unique,
    completeness,
    confidence,
    domains,
    headline: draft.headline || buildHeadline(unique, direction, 40),
  };
}
