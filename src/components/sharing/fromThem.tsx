import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { MeetingShare, Topic } from "../../types";
import { shareFirstName, sharedWithLabel } from "../../lib/shares";
import { Avatar } from "../Avatar";
import { cx } from "@/utils/cx";

/**
 * On a shared meeting, what the other chair brought: a way to see only their
 * items on the board, and a mark on anything that arrived since you last
 * looked. Their items are the topics with `raisedBy` set; nothing new is
 * stored for this but which ones you've seen, on this device.
 */

export type FromThem = {
  /** Only theirs at full strength; the rest of the board steps back. */
  theirs: boolean;
  /** Theirs, and new since you last opened this meeting. */
  fresh: ReadonlySet<string>;
};

const NONE: FromThem = { theirs: false, fresh: new Set() };
export const FromThemContext = createContext<FromThem>(NONE);
export const useFromThem = () => useContext(FromThemContext);

const seenKey = (meetingId: string) => `polarch.fromThem.seen.${meetingId}`;
/** Plenty for a meeting's history; the oldest fall off first. */
const SEEN_CAP = 600;

function readSeen(meetingId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(seenKey(meetingId));
    if (raw === null) return null;
    const ids = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return null;
  }
}

function writeSeen(meetingId: string, ids: Iterable<string>) {
  try {
    localStorage.setItem(seenKey(meetingId), JSON.stringify([...ids].slice(-SEEN_CAP)));
  } catch {
    /* private window: the marks just don't persist */
  }
}

/**
 * Their items you haven't seen. What was seen is fixed when the board opens,
 * so a mark stays put while you look, and anything arriving meanwhile gets
 * one too. Leaving the board counts all of it as seen. The very first look
 * marks nothing: everything already there isn't news.
 */
export function useFreshFromThem(meetingId: string, theirs: Topic[], shared: boolean): ReadonlySet<string> {
  const seenAtOpen = useRef<{ meetingId: string; ids: Set<string> } | null>(null);
  if (shared && seenAtOpen.current?.meetingId !== meetingId) {
    seenAtOpen.current = { meetingId, ids: readSeen(meetingId) ?? new Set(theirs.map((t) => t.id)) };
  }

  // Everything of theirs shown during this visit, so leaving marks it seen.
  const shown = useRef<{ meetingId: string; ids: Set<string> } | null>(null);
  if (shared) {
    if (shown.current?.meetingId !== meetingId) shown.current = { meetingId, ids: new Set() };
    for (const t of theirs) shown.current.ids.add(t.id);
  }
  useEffect(() => {
    if (!shared) return;
    // Held for this meeting: by the time a switch to another one cleans up,
    // the refs already describe the next.
    const seen = seenAtOpen.current?.ids ?? new Set<string>();
    const visit = shown.current?.ids ?? new Set<string>();
    const save = () => writeSeen(meetingId, new Set([...seen, ...visit]));
    const onHide = () => document.visibilityState === "hidden" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      save();
    };
  }, [meetingId, shared]);

  return useMemo(() => {
    const seen = seenAtOpen.current?.ids;
    if (!shared || !seen) return new Set<string>();
    return new Set(theirs.filter((t) => !seen.has(t.id)).map((t) => t.id));
  }, [theirs, shared, meetingId]);
}

/**
 * The line above a shared meeting's board: who brought what, what's new, and
 * the switch to see only theirs.
 */
export function FromThemBar({
  shares,
  theirs,
  fresh,
  showing,
  onShow,
}: {
  shares: MeetingShare[];
  theirs: Topic[];
  fresh: ReadonlySet<string>;
  showing: boolean;
  onShow: (on: boolean) => void;
}) {
  const open = theirs.filter((t) => t.status === "open");
  const ideas = open.filter((t) => !t.sessionId).length;
  const brought = shares.filter((s) => theirs.some((t) => t.raisedBy === s.id));
  const who = sharedWithLabel(brought.length ? brought : shares);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] bg-secondary px-3 py-2 text-[13px] text-secondary">
      <span className="flex">
        {(brought.length ? brought : shares).slice(0, 3).map((s, i) => (
          <Avatar key={s.id} name={s.name ?? s.email} size={20} className={cx(i > 0 && "-ml-1.5", "ring-2 ring-[var(--color-bg-secondary)]")} />
        ))}
      </span>
      <span className="min-w-0">
        {open.length ? (
          <>
            <b className="font-semibold text-primary">{who}</b> brought {open.length} {open.length === 1 ? "item" : "items"}
            {ideas > 0 && ` (${ideas} for later)`}
            {fresh.size > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-primary">
                <i aria-hidden className="size-1.5 rounded-full bg-current" />
                {fresh.size} new
              </span>
            )}
          </>
        ) : (
          <>
            Shared with <b className="font-semibold text-primary">{who}</b>. What they add shows here.
          </>
        )}
      </span>
      {open.length > 0 && (
        <button
          type="button"
          aria-pressed={showing}
          onClick={() => onShow(!showing)}
          className={cx(
            "ml-auto inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold transition-colors touch:min-h-11",
            showing
              ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
              : "bg-primary text-secondary shadow-xs hover:text-primary"
          )}
        >
          {showing ? "Show everything" : `Only ${brought.length === 1 ? shareFirstName(brought[0]) + "'s" : "theirs"}`}
        </button>
      )}
    </div>
  );
}
