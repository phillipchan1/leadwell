import { useStore } from "@/store/useStore";
import { useMeetingsByNext } from "@/hooks/use-meetings-by-next";
import { STATE_COLOR, type Readiness } from "@/lib/readiness";
import { cx } from "@/utils/cx";

/** More than this and the sidebar stops being a sidebar and the Me row scrolls away. */
const LIMIT = 7;

/** "Today", "Tmrw", "Wed", "9d" — a countdown short enough to share a row with a name. */
function whenLabel(r: Readiness): string {
  const d = r.daysUntil;
  if (d === null) return "";
  if (d < 0) return "late";
  if (d === 0) return "Today";
  if (d === 1) return "Tmrw";
  if (d < 7 && r.nextDate) {
    return new Date(`${r.nextDate}T00:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      timeZone: "UTC",
    });
  }
  return `${d}d`;
}

/**
 * The meetings you run, soonest first, one click from each.
 *
 * Opening a specific meeting is the most common thing done here, so it
 * shouldn't need the Meetings place and a row first. This is the list kept in
 * view — and because it's ordered by what's next, today's meetings are on top
 * without anyone having to star them.
 *
 * No favorites on purpose: the set is already the meetings you chose to run,
 * and a second hand-kept list would let a drifting meeting fall out of sight,
 * which is the one thing the readiness dot beside each row is there to stop.
 */
export function MeetingsList({ onAll }: { onAll: () => void }) {
  const rows = useMeetingsByNext();
  const selectedMeetingId = useStore((s) => s.selectedMeetingId);
  const selectMeeting = useStore((s) => s.selectMeeting);

  if (!rows.length) return null;

  // The meeting you're in stays on the list even when it's far enough out to
  // fall past the limit — otherwise the sidebar would lose your place.
  const open = rows.find((r) => r.meeting.id === selectedMeetingId);
  const head = rows.slice(0, LIMIT);
  const shown = open && !head.includes(open) ? [...head.slice(0, LIMIT - 1), open] : head;

  return (
    <div className="flex flex-col gap-0.5 border-t border-leather-line pt-2">
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-leather-mute uppercase">
        Up next
      </div>
      {shown.map(({ meeting, title, name, readiness }) => {
        const active = meeting.id === selectedMeetingId;
        const color = STATE_COLOR[readiness.state];
        const when = whenLabel(readiness);
        return (
          <button
            key={meeting.id}
            type="button"
            title={title}
            aria-current={active ? "page" : undefined}
            onClick={() => selectMeeting(meeting.id)}
            className={cx(
              "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors",
              active
                ? "bg-leather-hi text-leather-fg"
                : "text-leather-ink hover:bg-leather-hi/60 hover:text-leather-fg"
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              aria-hidden="true"
              style={{
                // Drifting is drawn hollow so it reads as absence, not alarm —
                // the same treatment the Meetings table gives it.
                backgroundColor: readiness.state === "drifting" ? "transparent" : color,
                boxShadow:
                  readiness.state === "drifting" ? `inset 0 0 0 2px ${color}` : undefined,
              }}
            />
            <span className="min-w-0 flex-1 truncate font-serif text-[15px]">{name}</span>
            {when && (
              <span
                className={cx(
                  "shrink-0 font-mono text-[11px]",
                  when === "Today" ? "text-teal-400" : "text-leather-mute"
                )}
              >
                {when}
              </span>
            )}
          </button>
        );
      })}
      {rows.length > shown.length && (
        <button
          type="button"
          onClick={onAll}
          className="rounded-lg px-2.5 pt-1 pb-1.5 text-left text-[12px] text-leather-mute transition-colors hover:text-leather-fg"
        >
          All {rows.length} meetings
        </button>
      )}
    </div>
  );
}

/**
 * Meetings someone else runs and has shared with me — matched by my sign-in
 * email. Each opens that meeting's shared page: their agenda, which I can add
 * to, and nothing else of theirs.
 */
export function SharedWithMeList() {
  const shared = useStore((s) => s.sharedWithMe);
  if (!shared.length) return null;
  return (
    <div className="flex flex-col gap-0.5 border-t border-leather-line pt-2">
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-leather-mute uppercase">
        Shared with you
      </div>
      {shared.map((m) => (
        <a
          key={m.token}
          href={`/with/${m.token}`}
          title={`${m.meetingName} — shared by ${m.ownerName}`}
          className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-leather-ink transition-colors hover:bg-leather-hi/60 hover:text-leather-fg"
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full shadow-[inset_0_0_0_2px_var(--color-leather-mute)]" />
          <span className="min-w-0 flex-1 truncate font-serif text-[15px]">{m.meetingName}</span>
          <span className="shrink-0 truncate text-[11px] text-leather-mute">{m.ownerName.split(/\s+/)[0]}</span>
        </a>
      ))}
    </div>
  );
}
