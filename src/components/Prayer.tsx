/**
 * The prayer dimension, in every density it's needed at.
 *
 * It keeps exactly one thing of its own: **the open hand and a muted violet**.
 * The hand (`HeartHand`) marks this mode everywhere it appears — the tab, the
 * canvas layer, the scan bar, the chip on a card — and the violet stays outside
 * the traffic-light colors health and readiness share, because nothing here is
 * a warning and none of it is scored.
 *
 * Everything else is the app's ordinary language. This used to be set in a
 * serif with italic placeholders and a bespoke violet button, and writing a
 * line cost four interactions through a full journal pad. A different typeface
 * doesn't make a prayer more sincere; it just made this the one screen you
 * couldn't type into quickly. Now every field is the same quick-add the rest of
 * the app uses: it's always open, and Enter saves it.
 */
import { useEffect, useRef, useState, type MouseEvent } from "react";
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
import { Input } from "@/components/base/input/input";
import { Explain } from "./Explain";
import { SectionTitle } from "./ui";
import { confirmAction } from "./ConfirmDialog";
import { autoFocusUnlessTouch } from "../lib/pointer";

/** The one anchor. Imported from here so the mode has a single icon. */
export { HeartHand as PrayerIcon };

/** Burden is the default; scripture is the one variation worth a toggle. */
const KIND_LABEL: Record<PrayerEntryKind, string> = {
  burden: "Burden",
  scripture: "Scripture",
};

const ADD_PLACEHOLDER: Record<PrayerEntryKind, string> = {
  burden: "What are you asking for them? ↵",
  scripture: "A verse you're praying over them… ↵",
};

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
        size === "sm" ? "px-1.5 py-0.5 text-caption" : "px-2 py-0.5 text-xs"
      }`}
      style={{ backgroundColor: color + "1f", color }}
      title={title}
    >
      <HeartHand className={size === "sm" ? "size-3" : "size-3.5"} />
      {shortSincePrayed(prayer)}
    </span>
  );
}

/**
 * Inline prayer block for org-tree cards.
 *
 * The canvas is where you actually pray through the org — one pass down the
 * chart, a line each. So this carries the whole loop, not a link to it: the
 * focus is a live field, there's a box to write a burden into, and marking is
 * one tap. Nothing here opens a panel first.
 */
export function CardPrayer({
  subjectKind,
  subjectId,
  subjectName,
}: {
  subjectKind: PrayerSubjectKind;
  subjectId: string;
  subjectName: string;
}) {
  const setPrayer = useStore((s) => s.setPrayer);
  const setPrayerFocus = useStore((s) => s.setPrayerFocus);
  const markPrayed = useStore((s) => s.markPrayed);
  const addPrayerEntry = useStore((s) => s.addPrayerEntry);
  const prayers = useStore((s) => s.prayers);
  const prayer = useStore((s) => {
    if (subjectKind === "team")
      return s.teams.find((t) => t.id === subjectId)?.prayer;
    if (subjectKind === "manager")
      return s.managers.find((m) => m.id === subjectId)?.prayer;
    return s.people.find((p) => p.id === subjectId)?.prayer;
  });

  const [focusDraft, setFocusDraft] = useState(prayer?.focus ?? "");
  const [entryDraft, setEntryDraft] = useState("");

  useEffect(() => {
    setFocusDraft(prayer?.focus ?? "");
    setEntryDraft("");
  }, [subjectKind, subjectId, prayer?.focus]);

  const state = prayerState(prayer);
  const prayedToday = prayer?.lastPrayedOn === todayISO();
  const openCount = openEntries(
    entriesFor(prayers, subjectKind, subjectId)
  ).length;

  const commitFocus = () => {
    if ((prayer?.focus ?? "") !== focusDraft.trim())
      setPrayerFocus(subjectKind, subjectId, focusDraft);
  };

  const writeEntry = () => {
    const text = entryDraft.trim();
    if (!text) return;
    // Writing a burden for someone is the decision — no need to take them up
    // first, the store does it.
    addPrayerEntry(subjectKind, subjectId, text);
    setEntryDraft("");
  };

  const layDown = async () => {
    if (
      await confirmAction({
        title: `Lay ${subjectName} down?`,
        body: "They come off the prayer list. Everything you've written stays.",
        confirmLabel: "Lay down",
        destructive: false,
      })
    )
      setPrayer(subjectKind, subjectId, false);
  };

  return (
    <div
      className={`rounded-lg px-2 py-1.5 transition-colors ${
        prayer
          ? "bg-violet-50/80 dark:bg-violet-950/30"
          : "bg-stone-50 dark:bg-stone-950/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-medium tracking-wide text-violet-700/70 uppercase dark:text-violet-300/70">
          Prayer
        </span>
        {openCount > 0 && (
          <span className="text-caption tabular-nums text-quaternary">
            {openCount} written
          </span>
        )}
      </div>

      {prayer ? (
        <div className="mt-1 space-y-1.5">
          {/* Live, not click-to-edit: on the canvas the whole point is to jot
              and move on, and a reveal click is a click you shouldn't need. */}
          <input
            className="prayer-card-field w-full"
            value={focusDraft}
            placeholder="What are you holding for them?"
            onChange={(e) => setFocusDraft(e.target.value)}
            onBlur={commitFocus}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setFocusDraft(prayer.focus ?? "");
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label={`Prayer focus for ${subjectName}`}
          />

          <input
            className="prayer-card-field w-full"
            value={entryDraft}
            placeholder="Write a burden… ↵"
            onChange={(e) => setEntryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                writeEntry();
              }
              if (e.key === "Escape") setEntryDraft("");
            }}
            aria-label={`Write a prayer for ${subjectName}`}
          />

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              disabled={prayedToday}
              onClick={() => markPrayed(subjectKind, subjectId)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption font-medium text-violet-700 transition-colors touch:min-h-11 hover:bg-violet-100/80 disabled:text-violet-400 disabled:hover:bg-transparent dark:text-violet-300 dark:hover:bg-violet-950/60 dark:disabled:text-violet-500"
              title={PRAYER_HINT[state]}
            >
              <HeartHand
                className="size-3"
                style={{ color: PRAYER_COLOR[state] }}
              />
              {prayedToday ? "Prayed today" : "Mark prayed"}
            </button>
            {prayer.times ? (
              <span className="text-caption tabular-nums text-quaternary">
                {prayer.times}d marked
              </span>
            ) : null}
            <button
              type="button"
              onClick={layDown}
              className="ml-auto text-caption text-quaternary touch:min-h-11 hover:text-stone-700 dark:hover:text-stone-300"
            >
              Lay down
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPrayer(subjectKind, subjectId, true)}
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 touch:min-h-11 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200"
        >
          <HeartHand className="size-3.5 text-stone-400 dark:text-stone-500" />
          Take up in prayer
        </button>
      )}
    </div>
  );
}

/**
 * The lightest add/remove there is — one hand on a person row. Carrying opens
 * the prayer tab; not carrying takes them up in one tap.
 */
export function PrayerCarryToggle({
  subjectKind,
  subjectId,
  subjectName,
  prayer,
  onOpen,
}: {
  subjectKind: PrayerSubjectKind;
  subjectId: string;
  subjectName: string;
  prayer?: Prayer;
  onOpen: () => void;
}) {
  const setPrayer = useStore((s) => s.setPrayer);

  const layDown = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (
      await confirmAction({
        title: `Lay ${subjectName} down?`,
        body: "They come off the prayer list. Everything you've written stays.",
        confirmLabel: "Lay down",
        destructive: false,
      })
    )
      setPrayer(subjectKind, subjectId, false);
  };

  if (prayer) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          className="shrink-0"
          aria-label={`Prayer for ${subjectName}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <PrayerDot prayer={prayer} />
        </button>
        <button
          type="button"
          aria-label={`Lay ${subjectName} down`}
          onClick={layDown}
          className="rounded px-1 text-caption text-stone-400 opacity-0 transition-opacity touch:opacity-100 group-hover/person:opacity-100 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-400"
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Take ${subjectName} up in prayer`}
      onClick={(e) => {
        e.stopPropagation();
        setPrayer(subjectKind, subjectId, true);
      }}
      className="shrink-0 rounded px-1.5 py-0.5 text-caption font-medium text-violet-600 opacity-0 transition-opacity touch:opacity-100 group-hover/person:opacity-100 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40"
    >
      Take up
    </button>
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

// --- the panel --------------------------------------------------------------

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

  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<PrayerEntryKind>("burden");
  const [focusDraft, setFocusDraft] = useState(prayer?.focus ?? "");

  // Everything here is per-subject; switching subjects must not carry a draft.
  useEffect(() => {
    setDraft("");
    setKind("burden");
  }, [subjectKind, subjectId]);

  useEffect(() => {
    setFocusDraft(prayer?.focus ?? "");
  }, [prayer?.focus]);

  const state = prayerState(prayer);
  const prayedToday = prayer?.lastPrayedOn === todayISO();

  const write = () => {
    const text = draft.trim();
    if (!text) return;
    addPrayerEntry(subjectKind, subjectId, text, kind);
    setDraft("");
  };

  const commitFocus = () => {
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
              <span className="text-caption text-quaternary">
                {[formatCarried(prayer), formatLastPrayed(prayer)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>

            {/* The one line of what I'm holding — always a field. */}
            <div className="mt-2">
              <Input
                size="md"
                aria-label="Prayer focus"
                placeholder="Name the one thing you're holding for them…"
                value={focusDraft}
                onChange={setFocusDraft}
                onBlur={commitFocus}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setFocusDraft(prayer.focus ?? "");
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* The whole interaction loop, in one button. */}
              <Button
                size="sm"
                color="secondary"
                iconLeading={HeartHand}
                isDisabled={prayedToday}
                onClick={() => markPrayed(subjectKind, subjectId)}
              >
                {prayedToday ? "Prayed today" : "Mark prayed"}
              </Button>
              {prayer.times ? (
                <span className="text-caption text-quaternary">
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
            <p className="text-caption text-quaternary">
              Taking someone up is a decision, so it's yours to make — nothing
              here counts a gap at you. Writing anything down below takes them up
              too.
            </p>
            <Button
              size="sm"
              iconLeading={HeartHand}
              onClick={() => setPrayer(subjectKind, subjectId, true)}
            >
              Take up in prayer
            </Button>
          </div>
        )}
      </section>

      {/* What I'm carrying, in the words I wrote it in. */}
      <section className="space-y-3">
        <SectionTitle>Carrying</SectionTitle>

        {/* Always open, Enter saves — the same quick-add as topics, to-dos and
            goals. Writing one down should cost exactly one thought. */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            write();
          }}
        >
          {/* Focused on arrival. Praying through the org is a pass: click the
              hand on a card, type, Enter, next person — and a cursor you have
              to place yourself is the thing that breaks that rhythm. */}
          <Input
            size="md"
            className="flex-1"
            aria-label="Write something down"
            placeholder={ADD_PLACEHOLDER[kind]}
            value={draft}
            onChange={setDraft}
            enterKeyHint="done"
            autoFocus={autoFocusUnlessTouch()}
          />
          <KindToggle kind={kind} onKind={setKind} />
        </form>

        {open.length === 0 ? (
          <p className="text-sm text-quaternary">
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

/** Burden or scripture, as two small pills beside the field it applies to. */
function KindToggle({
  kind,
  onKind,
}: {
  kind: PrayerEntryKind;
  onKind: (kind: PrayerEntryKind) => void;
}) {
  return (
    <div
      className="flex shrink-0 gap-1 touch:gap-2"
      role="group"
      aria-label="What kind of entry"
    >
      {(Object.keys(KIND_LABEL) as PrayerEntryKind[]).map((k) => (
        <button
          key={k}
          type="button"
          aria-pressed={kind === k}
          onClick={() => onKind(k)}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors touch:min-h-11 ${
            kind === k
              ? "border-transparent bg-violet-100 font-medium text-violet-800 dark:bg-violet-950/60 dark:text-violet-200"
              : "border-primary text-quaternary hover:border-stone-400"
          }`}
        >
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

/**
 * One written line. The text edits in place — the same as a topic card or a
 * to-do — and the controls that aren't typing stay out of the way until you
 * hover or focus the line.
 */
function PrayerLine({ entry }: { entry: PrayerEntry }) {
  const updatePrayerEntry = useStore((s) => s.updatePrayerEntry);
  const answerPrayerEntry = useStore((s) => s.answerPrayerEntry);
  const reopenPrayerEntry = useStore((s) => s.reopenPrayerEntry);
  const deletePrayerEntry = useStore((s) => s.deletePrayerEntry);

  const [text, setText] = useState(entry.text);
  const [answering, setAnswering] = useState(false);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setText(entry.text), [entry.text]);

  // Auto-grow rather than clipping at one line.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const answered = Boolean(entry.answeredOn);

  const commit = () => {
    const next = text.trim();
    if (!next) {
      setText(entry.text);
      return;
    }
    if (next !== entry.text) updatePrayerEntry(entry.id, { text: next });
  };

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
    <li className={`prayer-line group ${answered ? "is-answered" : ""}`}>
      <textarea
        ref={ref}
        rows={1}
        className={`prayer-text w-full resize-none bg-transparent outline-none ${
          entry.kind === "scripture" ? "is-scripture" : ""
        }`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        aria-label="Prayer"
      />
      {entry.answerNote && (
        <span className="prayer-answer">{entry.answerNote}</span>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 opacity-0 transition-opacity touch:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100">
        <span className="text-caption tabular-nums text-quaternary">
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
          <Button
            size="sm"
            color="link-color"
            onClick={() => setAnswering((v) => !v)}
          >
            Mark answered
          </Button>
        )}
        <Button size="sm" color="link-gray" className="ml-auto" onClick={remove}>
          Remove
        </Button>
      </div>

      {answering && !answered && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            size="sm"
            className="min-w-0 flex-1"
            aria-label="What happened"
            placeholder="What happened? (optional) ↵"
            value={note}
            onChange={setNote}
            autoFocus={autoFocusUnlessTouch()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                answerPrayerEntry(entry.id, note);
                setAnswering(false);
              }
              if (e.key === "Escape") setAnswering(false);
            }}
          />
          <Button
            size="sm"
            color="secondary"
            className="shrink-0"
            onClick={() => {
              answerPrayerEntry(entry.id, note);
              setAnswering(false);
            }}
          >
            Answered
          </Button>
        </div>
      )}
    </li>
  );
}
