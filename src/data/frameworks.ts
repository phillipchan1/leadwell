import type { Domain } from "../types";

// ---------------------------------------------------------------------------
// CliftonStrengths: all 34 themes mapped to their Gallup domain.
// ---------------------------------------------------------------------------
export const THEME_DOMAIN: Record<string, Domain> = {
  // Executing (9)
  Achiever: "Executing",
  Arranger: "Executing",
  Belief: "Executing",
  Consistency: "Executing",
  Deliberative: "Executing",
  Discipline: "Executing",
  Focus: "Executing",
  Responsibility: "Executing",
  Restorative: "Executing",
  // Influencing (8)
  Activator: "Influencing",
  Command: "Influencing",
  Communication: "Influencing",
  Competition: "Influencing",
  Maximizer: "Influencing",
  "Self-Assurance": "Influencing",
  Significance: "Influencing",
  Woo: "Influencing",
  // Relationship Building (9)
  Adaptability: "Relationship Building",
  Connectedness: "Relationship Building",
  Developer: "Relationship Building",
  Empathy: "Relationship Building",
  Harmony: "Relationship Building",
  Includer: "Relationship Building",
  Individualization: "Relationship Building",
  Positivity: "Relationship Building",
  Relator: "Relationship Building",
  // Strategic Thinking (8)
  Analytical: "Strategic Thinking",
  Context: "Strategic Thinking",
  Futuristic: "Strategic Thinking",
  Ideation: "Strategic Thinking",
  Input: "Strategic Thinking",
  Intellection: "Strategic Thinking",
  Learner: "Strategic Thinking",
  Strategic: "Strategic Thinking",
};

export const ALL_THEMES = Object.keys(THEME_DOMAIN).sort();

export const DOMAINS: Domain[] = [
  "Executing",
  "Influencing",
  "Relationship Building",
  "Strategic Thinking",
];

export const DOMAIN_COLOR: Record<Domain, string> = {
  Executing: "#1D9E75",
  Influencing: "#EF9F27",
  "Relationship Building": "#D4537E",
  "Strategic Thinking": "#7F77DD",
};

// ---------------------------------------------------------------------------
// Enneagram: type number → name + derived read.
// ---------------------------------------------------------------------------
export type EnneagramInfo = {
  name: string;
  strengths: string[];
  watchOuts: string[];
};

export const ENNEAGRAM: Record<string, EnneagramInfo> = {
  "1": {
    name: "The Reformer",
    strengths: ["Principled", "Improves quality", "Reliable"],
    watchOuts: ["Perfectionism", "Hard on self & others"],
  },
  "2": {
    name: "The Helper",
    strengths: ["Warm", "Generous", "Reads needs quickly"],
    watchOuts: ["Overextends to please", "Struggles to ask for help"],
  },
  "3": {
    name: "The Achiever",
    strengths: ["Driven", "Adaptable", "Inspires performance"],
    watchOuts: ["Image over substance", "Burnout risk"],
  },
  "4": {
    name: "The Individualist",
    strengths: ["Creative", "Emotionally honest", "Depth"],
    watchOuts: ["Mood-driven output", "Feels overlooked"],
  },
  "5": {
    name: "The Investigator",
    strengths: ["Analytical", "Independent", "Calm in complexity"],
    watchOuts: ["Withdraws under pressure", "Hoards information"],
  },
  "6": {
    name: "The Loyalist",
    strengths: ["Committed", "Spots risks early", "Team-first"],
    watchOuts: ["Worst-case thinking", "Needs reassurance"],
  },
  "7": {
    name: "The Enthusiast",
    strengths: ["Energizing", "Idea generator", "Optimistic"],
    watchOuts: ["Scattered focus", "Avoids hard conversations"],
  },
  "8": {
    name: "The Challenger",
    strengths: ["Decisive", "Protects the team", "Takes charge"],
    watchOuts: ["Steamrolls quieter voices", "Control battles"],
  },
  "9": {
    name: "The Peacemaker",
    strengths: ["Steady", "Mediates conflict", "Inclusive"],
    watchOuts: ["Avoids conflict", "Slow to voice opinions"],
  },
};

/** Parse "2w3" → { type: "2", wing: "3" }; returns null if unparseable. */
export function parseEnneagram(
  value: string | undefined
): { type: string; wing?: string; name: string } | null {
  if (!value) return null;
  const m = value.trim().match(/^([1-9])(?:w([1-9]))?$/i);
  if (!m) return null;
  const info = ENNEAGRAM[m[1]];
  if (!info) return null;
  return { type: m[1], wing: m[2], name: info.name };
}

// ---------------------------------------------------------------------------
// MBTI: 16 types with one-line descriptors.
// ---------------------------------------------------------------------------
export const MBTI: Record<string, string> = {
  ISTJ: "The Inspector — dependable, methodical, duty-driven",
  ISFJ: "The Protector — devoted, practical, service-hearted",
  INFJ: "The Advocate — insightful, principled, quietly determined",
  INTJ: "The Architect — strategic, independent, long-range thinker",
  ISTP: "The Craftsman — hands-on, cool-headed problem solver",
  ISFP: "The Composer — gentle, aesthetic, present-focused",
  INFP: "The Mediator — idealistic, empathetic, values-led",
  INTP: "The Thinker — analytical, curious, precision-minded",
  ESTP: "The Dynamo — energetic, pragmatic, acts in the moment",
  ESFP: "The Performer — spontaneous, warm, people-energizing",
  ENFP: "The Campaigner — enthusiastic, imaginative, possibility-seeker",
  ENTP: "The Debater — quick, inventive, loves the counterargument",
  ESTJ: "The Executive — organized, direct, gets things shipped",
  ESFJ: "The Consul — sociable, loyal, keeps the group cared for",
  ENFJ: "The Protagonist — charismatic, developing others comes naturally",
  ENTJ: "The Commander — bold, decisive, born to mobilize",
};

export const ALL_MBTI = Object.keys(MBTI);
