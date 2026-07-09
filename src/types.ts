export type Capacity = { id: string; label: string; color: string };

export type Team = {
  id: string;
  name: string;
  capacityId: string;
  description?: string;
  order: number;
  /** "up" = a team/person I report to; renders above me in the tree. Default "down". */
  direction?: "up" | "down";
};

export type StrengthTheme = string;

export type Domain =
  | "Executing"
  | "Influencing"
  | "Relationship Building"
  | "Strategic Thinking";

export type Assessments = {
  cliftonTop5?: StrengthTheme[]; // ordered 1–5
  enneagram?: string; // e.g. "2w3"
  mbti?: string; // e.g. "ENFJ"
};

export type Person = {
  id: string;
  teamId: string;
  name: string;
  role?: string;
  photo?: string; // base64 data URL
  relationshipType?: string;
  assessments: Assessments;
  strengths: string[];
  watchOuts: string[];
  howToLead?: string;
};

export type Action = {
  id: string;
  personId: string;
  text: string;
  done: boolean;
  dueDate?: string;
};

export type OneOnOne = {
  id: string;
  personId: string;
  date: string;
  notes?: string;
  nextDate?: string;
};

export type Goal = {
  id: string;
  personId: string;
  title: string;
  progress: number; // 0–100
  targetDate?: string;
};

export type Note = {
  id: string;
  personId: string;
  date: string;
  body: string;
};

export type Me = { name: string; title?: string; photo?: string };

export type ChatMessage = { role: "user" | "assistant"; content: string };
