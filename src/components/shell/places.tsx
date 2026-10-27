import type { Tab } from "@/lib/routes";
import { FLAME_PATH } from "@/components/brand/glyphs";

/*
 * The five places, one question each. People is one place with several
 * views (the canvas and the list today), so it owns more than one tab id.
 */

type IconProps = { className?: string };

export function TodayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="9.5" strokeDasharray="3 3" />
    </svg>
  );
}

export function MeetingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function IdeasIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 13.5 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 13.5h4.5l1 2.5h5l1-2.5H20" />
    </svg>
  );
}

export function PrayerIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={FLAME_PATH} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10l5 5 5-5" />
    </svg>
  );
}

export type PlaceId = "today" | "people" | "meetings" | "ideas" | "prayer";

export type Place = {
  id: PlaceId;
  label: string;
  /** The question the place answers — shown as its page heading. */
  question: string;
  /** Where clicking it lands. People resolves to its last-used view. */
  tab: Tab;
  /** Every tab that counts as being in this place. */
  tabs: Tab[];
  /** Second key of the `g` sequence. */
  goKey: string;
  icon: (p: IconProps & { active?: boolean }) => React.ReactNode;
};

export const PLACES: Place[] = [
  {
    id: "today",
    label: "Today",
    question: "What needs me?",
    tab: "today",
    tabs: ["today"],
    goKey: "T",
    icon: ({ className }) => <TodayIcon className={className} />,
  },
  {
    id: "people",
    label: "People",
    question: "Who do I lead, and how are they?",
    tab: "circles",
    tabs: ["circles", "tree", "table"],
    goKey: "P",
    icon: ({ className }) => <PeopleIcon className={className} />,
  },
  {
    id: "meetings",
    label: "Meetings",
    question: "Am I ready to sit down?",
    tab: "meetings",
    tabs: ["meetings"],
    goKey: "M",
    icon: ({ className }) => <MeetingsIcon className={className} />,
  },
  {
    id: "ideas",
    label: "Ideas",
    question: "What do I want to raise?",
    tab: "ideas",
    tabs: ["ideas"],
    goKey: "I",
    icon: ({ className }) => <IdeasIcon className={className} />,
  },
  {
    id: "prayer",
    label: "Prayer",
    question: "Who am I carrying?",
    tab: "prayer",
    tabs: ["prayer"],
    goKey: "R",
    icon: ({ className, active }) => <PrayerIcon className={className} filled={active} />,
  },
];

export function placeOf(tab: Tab): Place {
  return PLACES.find((p) => p.tabs.includes(tab)) ?? PLACES[0];
}

// ── People remembers which view you were last in ──────────────────────────

const PEOPLE_VIEW_KEY = "polarch:people-view";

export function lastPeopleTab(): Tab {
  try {
    const v = localStorage.getItem(PEOPLE_VIEW_KEY);
    if (v === "circles" || v === "tree" || v === "table") return v;
  } catch {
    // Private mode or blocked storage: fall through to the default view.
  }
  // Circles needs room to read; a phone opens People on the outline instead.
  try {
    if (!window.matchMedia("(min-width: 1024px)").matches) return "tree";
  } catch {
    // No matchMedia (tests, old engines): fall through to Circles.
  }
  return "circles";
}

export function rememberPeopleTab(tab: Tab) {
  if (tab !== "circles" && tab !== "tree" && tab !== "table") return;
  try {
    localStorage.setItem(PEOPLE_VIEW_KEY, tab);
  } catch {
    // A preference that doesn't stick is not worth an error.
  }
}
