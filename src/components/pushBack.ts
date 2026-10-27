import { useStore } from "../store/useStore";
import { toast } from "../lib/toasts";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const items = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

/**
 * Push a week back (or skip it and push back), and say what happened with a
 * way to undo it. The one entry point the week panel and the Agenda share.
 */
export function pushBackWeek(meetingId: string, from: { sessionId: string | null; date: string }, skip: boolean) {
  const res = useStore.getState().pushBack(meetingId, from, { skip });
  if (!res) return;
  const day = fmt(from.date);
  const across = res.weeks > 1 ? ` across ${res.weeks} meetings` : "";
  const what = [res.moved ? items(res.moved) : "", res.arcs ? (res.arcs === 1 ? "the arc" : "the arcs") : ""]
    .filter(Boolean)
    .join(" and ");
  const message = skip
    ? res.moved
      ? `Skipped ${day}. ${items(res.moved)}${across} moved along one meeting.`
      : `Skipped ${day}.`
    : what
      ? `Pushed back from ${day}: ${what}${across} moved along one meeting.`
      : `Nothing open on ${day} to push back.`;
  toast({ message, action: what || skip ? { label: "Undo", onAction: res.undo } : undefined });
}
