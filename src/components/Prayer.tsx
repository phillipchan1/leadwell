/**
 * The prayer dimension, in every density it's needed at.
 *
 * Two deliberate departures from the rest of the app:
 *
 * 1. **It doesn't read like a task list.** No checkboxes, no add row, no
 *    hover-X on every line. Entries are written down, and the only motion out
 *    of the list is *answered* — a transition that keeps the words and adds a
 *    date. Controls sit behind a click on the entry itself, so the resting
 *    state of the panel is just the things you're carrying, in your own words.
 * 2. **One anchor icon and a muted violet.** The open hand (`HeartHand`) marks
 *    this mode everywhere it appears — the tab, the canvas layer, the scan bar,
 *    the chip on a card — so switching into it is felt before it's read. The
 *    palette stays outside the traffic-light colors health and readiness share:
 *    nothing here is a warning, and none of it is scored.
 */
import { useEffect, useState, type ReactNode } from "react";
import { HeartHand } from "@untitledui/icons";
import { useStore } from "../store/useStore";
import type { PrayerEntry, PrayerEntryKind, PrayerSubjectKind } from "../types";
import type { Prayer } from "../types";
import {
  PRAYER_COLOR,
  PRAYER_HINT,
  PRAYER_LABEL,
  answeredEntries,
  entriesFor,
  formatCarried,
  formatLastPrayed,
  openEntries,
  prayerState,
  shortSincePrayed,
  todayISO,
} from "../lib/prayer";
import { Button } from "@/components/base/buttons/button";
import { WritingPad } from "./WritingPad";
import { Explain } from "./Explain";
import { SectionTitle } from "./ui";
import { confirmAction } from "./ConfirmDialog";
import { autoFocusUnlessTouch } from "../lib/pointer";

/** The one anchor. Imported from here so the mode has a single icon. */
export { HeartHand as PrayerIcon };

// --- glanceable reads -------------------------------------------------------

/**
 * The canvas chip: hand, and how long since I last prayed. Nothing about the
 * person — everything about me — which is why it says "6w" rather than a level.
 */
export function PrayerMark({
  prayer,
  size = "md",
}: {
  prayer?: Prayer;
  size?: "sm" | "md";
}) {
  if (!prayer) return null;
  const state = prayerState(prayer);
  const color = PRAYER_COLOR[state];
  const title = [
    PRAYER_HINT[state],
    prayer.focus,
    formatCarried(prayer),
    formatLastPrayed(prayer),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs"
      }`}
      style={{ backgroundColor: color + "1f", color }}
      title={title}
    >
      <HeartHand className={size === "sm" ? "size-3" : "size-3.5"} />
      {shortSincePrayed(prayer)}
    </span>
  );
}

/** The smallest read there is — the hand alone, for dense person rows. */
export function PrayerDot({ prayer }: { prayer?: Prayer }) {
  if (!prayer) return null;
  const state = prayerState(prayer);
  return (
    <Explain
      text={`${PRAYER_LABEL[state]}${prayer.focus ? ` — ${prayer.focus}` : ""}`}
    >
      <HeartHand
        className="size-3 shrink-0"
        style={{ color: PRAYER_COLOR[state] }}
      />
    </Explain>
  );
}

/**
 * The mode's own action button. The design-system primary is the app's teal,
 * which is the color of *doing* something here — and marking a prayer isn't
 * that. Violet keeps the whole mode in one register.
 */
function PrayerButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-colors touch:min-h-11 hover:bg-violet-700 disabled:bg-violet-100 disabled:text-violet-500 dark:bg-violet-600 dark:hover:bg-violet-500 dark:disabled:bg-violet-950/60 dark:disabled:text-violet-300"
    >
      <HeartHand className="size-4" />
      {children}
    </button>
  );
}

// --- the panel --------------------------------------------------------------

const KINDS: { id: PrayerEntryKind; label: string; placeholder: string }[] = [
  {
    id: "burden",
    label: "Burden",
    placeholder: "What are you asking for them?",
  },
  {
    id: "scripture",
    label: "Scripture",
    placeholder: "A verse you're praying over them…",
  },
];

/**
 * The prayer tab for one subject — a person, a team, or the leader I report to.
 * Keyed by subject kind and id, so all three share one panel the way notes and
 * topics already share one board.
 */
export function PrayerPanel({
  subjectKind,
  subjectId,
  subjectName,
  padded = true,
}: {
  subjectKind: PrayerSubjectKind;
  subjectId: string;
  subjectName: string;
  /** False when embedded in a profile that already owns its gutters. */
  padded?: boolean;
}) {
  const prayers = useStore((s) => s.prayers);
  const setPrayer = useStore((s) => s.setPrayer);
  const setPrayerFocus = useStore((s) => s.setPrayerFocus);
  const markPrayed = useStore((s) => s.markPrayed);
  const addPrayerEntry = useStore((s) => s.addPrayerEntry);

  // The mark lives on the subject's own row, so read it from the collection
  // the subject is in rather than threading it down as a prop.
  const prayer = useStore((s) => {
    if (subjectKind === "team")
      return s.teams.find((t) => t.id === subjectId)?.prayer;
    if (subjectKind === "manager")
      return s.managers.find((m) => m.id === subjectId)?.prayer;
    return s.people.find((p) => p.id === subjectId)?.prayer;
  });

  const mine = entriesFor(prayers, subjectKind, subjectId);
  const open = openEntries(mine);
  const answered = answeredEntries(mine);

  const [composing, setComposing] = useState<PrayerEntryKind | null>(null);
  const [draft, setDraft] = useState("");
  const [focusDraft, setFocusDraft] = useState(prayer?.focus ?? "");
  const [editingFocus, setEditingFocus] = useState(false);

  // Everything here is per-subject; switching subjects must not carry a draft.
  useEffect(() => {
    setComposing(null);
    setDraft("");
    setEditingFocus(false);
  }, [subjectKind, subjectId]);

  useEffect(() => {
    setFocusDraft(prayer?.focus ?? "");
  }, [prayer?.focus]);

  const state = prayerState(prayer);
  const prayedToday = prayer?.lastPrayedOn === todayISO();

  const write = () => {
    const text = draft.trim();
    if (!text || !composing) return;
    addPrayerEntry(subjectKind, subjectId, text, composing);
    setDraft("");
    setComposing(null);
  };

  const commitFocus = () => {
    setEditingFocus(false);
    if ((prayer?.focus ?? "") !== focusDraft.trim())
      setPrayerFocus(subjectKind, subjectId, focusDraft);
  };

  const layDown = async () => {
    if (
      await confirmAction({
        title: `Lay ${subjectName} down?`,
        body: "They come off the prayer list. Everything you've written stays — including what was answered.",
        confirmLabel: "Lay down",
        destructive: false,
      })
    )
      setPrayer(subjectKind, subjectId, false);
  };

  return (
    /* Capped at a reading measure: these are sentences you wrote, and a line
       of prose 1,400px wide is unreadable on a focus route. */
    <div className={`flex max-w-2xl flex-col gap-6 ${padded ? "p-4" : ""}`}>
      {/* The standing state. Not a form — a line about where this sits. */}
      <section
        className="prayer-panel rounded-2xl px-4 py-4"
        style={{ ["--prayer-accent" as string]: PRAYER_COLOR[state] }}
      >
        {prayer ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <HeartHand
                className="size-4 shrink-0 self-center"
                style={{ color: PRAYER_COLOR[state] }}
              />
              <span className="text-sm font-medium">
                Carrying {subjectName}
              </span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                {[formatCarried(prayer), formatLastPrayed(prayer)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>

            {/* The one line of what I'm holding, written in place. */}
            {editingFocus ? (
              <input
                className="prayer-focus-input mt-2 w-full bg-transparent outline-none"
                value={focusDraft}
                autoFocus={autoFocusUnlessTouch()}
                placeholder="What are you holding for them?"
                onChange={(e) => setFocusDraft(e.target.value)}
                onBlur={commitFocus}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setFocusDraft(prayer.focus ?? "");
                    setEditingFocus(false);
                  }
                }}
                aria-label="Prayer focus"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingFocus(true)}
                className="prayer-focus mt-2 block w-full text-left"
              >
                {prayer.focus || (
                  <span className="text-stone-500 dark:text-stone-400">
                    Name the one thing you're holding for them…
                  </span>
                )}
              </button>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* The whole interaction loop, in one button. */}
              <PrayerButton
                disabled={prayedToday}
                onClick={() => markPrayed(subjectKind, subjectId)}
              >
                {prayedToday ? "Prayed today" : "Mark prayed"}
              </PrayerButton>
              {prayer.times ? (
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  <span className="tabular-nums">{prayer.times}</span>{" "}
                  {prayer.times === 1 ? "day" : "days"} marked
                </span>
              ) : null}
              <Button
                size="sm"
                color="link-gray"
                className="ml-auto"
                onClick={layDown}
              >
                Lay down
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <HeartHand className="size-4 text-stone-400 dark:text-stone-500" />
              <span className="text-sm text-stone-600 dark:text-stone-300">
                {subjectName} isn't on your prayer list.
              </span>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Taking someone up is a decision, so it's yours to make — nothing
              here counts a gap at you. Writing anything down below takes them
              up too.
            </p>
            <PrayerButton
              onClick={() => setPrayer(subjectKind, subjectId, true)}
            >
              Take up in prayer
            </PrayerButton>
          </div>
        )}
      </section>

      {/* What I'm carrying, in the words I wrote it in. */}
      <section className="space-y-3">
        <SectionTitle>Carrying</SectionTitle>
        {open.length === 0 ? (
          <p className="prayer-empty">
            Nothing written down yet. What would you pray for {subjectName} if
            someone asked you right now?
          </p>
        ) : (
          <ul className="space-y-1">
            {open.map((entry) => (
              <PrayerLine key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {composing ? (
          <div className="space-y-2">
            <div
              className="flex gap-1"
              role="group"
              aria-label="What kind of entry"
            >
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={composing === k.id}
                  onClick={() => setComposing(k.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors touch:min-h-11 ${
                    composing === k.id
                      ? "border-transparent bg-violet-100 font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
                      : "border-stone-300 text-stone-500 hover:border-stone-400 dark:border-stone-700 dark:text-stone-400"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <WritingPad
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                KINDS.find((k) => k.id === composing)?.placeholder ?? ""
              }
              autoFocus={autoFocusUnlessTouch()}
              startEditing
              dualMode={false}
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                color="link-gray"
                onClick={() => {
                  setComposing(null);
                  setDraft("");
                }}
              >
                Cancel
              </Button>
              <PrayerButton disabled={!draft.trim()} onClick={write}>
                Write it down
              </PrayerButton>
            </div>
          </div>
        ) : (
          /* A quiet line rather than a "+ Add" row: writing a prayer down
             should feel like picking up a pen, not filing a ticket. */
          <button
            type="button"
            onClick={() => {
              setComposing("burden");
              setDraft("");
            }}
            className="prayer-write"
          >
            Write something down…
          </button>
        )}
      </section>

      {answered.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Answered</SectionTitle>
          <ul className="space-y-1">
            {answered.map((entry) => (
              <PrayerLine key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One written line. Clicking it opens its controls rather than parking them in
 * the margin — the resting state of this list is words, not affordances.
 */
function PrayerLine({ entry }: { entry: PrayerEntry }) {
  const answerPrayerEntry = useStore((s) => s.answerPrayerEntry);
  const reopenPrayerEntry = useStore((s) => s.reopenPrayerEntry);
  const deletePrayerEntry = useStore((s) => s.deletePrayerEntry);

  const [open, setOpen] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [note, setNote] = useState("");

  const answered = Boolean(entry.answeredOn);

  const remove = async () => {
    if (
      await confirmAction({
        title: "Remove this?",
        body: answered
          ? "An answered prayer is a record. Removing it is permanent."
          : "It comes off the list permanently.",
        confirmLabel: "Remove",
      })
    )
      deletePrayerEntry(entry.id);
  };

  return (
    <li className={`prayer-line ${answered ? "is-answered" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left"
      >
        <span
          className={
            entry.kind === "scripture" ? "prayer-text is-scripture" : "prayer-text"
          }
        >
          {entry.text}
        </span>
        {entry.answerNote && (
          <span className="prayer-answer">{entry.answerNote}</span>
        )}
      </button>

      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] tabular-nums text-stone-500 dark:text-stone-400">
            {answered ? `answered ${entry.answeredOn}` : `written ${entry.date}`}
          </span>
          {answered ? (
            <Button
              size="sm"
              color="link-gray"
              onClick={() => reopenPrayerEntry(entry.id)}
            >
              Still carrying it
            </Button>
          ) : (
            <button
              type="button"
              className="text-sm font-medium text-violet-700 touch:min-h-11 hover:underline dark:text-violet-300"
              onClick={() => setAnswering((v) => !v)}
            >
              Mark answered
            </button>
          )}
          <Button size="sm" color="link-gray" className="ml-auto" onClick={remove}>
            Remove
          </Button>
        </div>
      )}

      {answering && !answered && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="prayer-focus-input min-w-0 flex-1 bg-transparent outline-none"
            placeholder="What happened? (optional)"
            value={note}
            autoFocus={autoFocusUnlessTouch()}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                answerPrayerEntry(entry.id, note);
                setAnswering(false);
                setOpen(false);
              }
              if (e.key === "Escape") setAnswering(false);
            }}
            aria-label="What happened"
          />
          <PrayerButton
            onClick={() => {
              answerPrayerEntry(entry.id, note);
              setAnswering(false);
              setOpen(false);
            }}
          >
            Answered
          </PrayerButton>
        </div>
      )}
    </li>
  );
}
