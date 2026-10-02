import type { TrackedMeeting } from "../types";
import { useStore } from "../store/useStore";
import {
  meetingSubjectName,
  meetingTitle,
  todayISO,
} from "../lib/readiness";
import { topicsFor } from "../lib/topics";
import { openFollowUpsFor } from "../lib/week";
import { agendaText, copyText, recapText } from "../lib/agendaText";
import { toast } from "../lib/toasts";
import { Button } from "@/components/base/buttons/button";
import { Copy01 } from "@untitledui/icons";

/**
 * Send the agenda before, the recap after — the same occurrence, two texts.
 *
 * Which one is decided by the calendar: before the day it's the agenda, after
 * it the recap. On the day, the first ticked-off topic is the tell that the
 * meeting has started — by the time anyone wants to send something, it's the
 * recap they want.
 */
export function CopyAgendaButton({
  meeting,
  sessionId,
  date,
  size = "sm",
  color = "link-gray",
}: {
  meeting: TrackedMeeting;
  /** Null for a projected occurrence nobody has planned into yet. */
  sessionId: string | null;
  date: string;
  size?: "sm" | "md";
  color?: "link-gray" | "secondary" | "tertiary";
}) {
  const today = todayISO();
  // On the day itself it's still the agenda until something gets ticked off.
  const startedToday = useStore(
    (s) =>
      date === today &&
      sessionId !== null &&
      s.topics.some((t) => t.sessionId === sessionId && t.status === "covered")
  );
  const recap = date < today || startedToday;
  const label = recap ? "Copy recap" : "Copy agenda";

  const copy = async () => {
    // Read at click time: this is a one-shot export, not something to re-render on.
    const s = useStore.getState();
    const subjectName = meetingSubjectName(meeting, s);
    const title = meetingTitle(meeting, subjectName);
    const session = sessionId ? s.sessions.find((o) => o.id === sessionId) : undefined;
    const topics = sessionId
      ? topicsFor(s.topics, meeting.id).filter((t) => t.sessionId === sessionId)
      : [];
    const text = recap
      ? recapText({
          meeting,
          title,
          date,
          topics,
          followUps: s.followUps.filter(
            (f) =>
              f.subjectKind === meeting.subjectKind &&
              f.subjectId === meeting.subjectId &&
              (f.sourceSessionId === sessionId ||
                (sessionId !== null && f.status === "open"))
          ),
        })
      : agendaText({
          meeting,
          title,
          session,
          date,
          topics,
          followUps: openFollowUpsFor(s.followUps, meeting),
        });
    const ok = await copyText(text);
    toast(
      ok
        ? { message: recap ? "Recap copied — paste it where the team reads it." : "Agenda copied — paste it where the team reads it." }
        : { message: "Couldn't reach the clipboard.", tone: "error" }
    );
  };

  return (
    <Button size={size} color={color} iconLeading={Copy01} onClick={copy}>
      {label}
    </Button>
  );
}
