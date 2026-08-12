import { useState } from "react";
import type { MeetingSubjectKind } from "../types";
import { useStore } from "../store/useStore";
import { MEETING_LABEL, meetingFor } from "../lib/readiness";
import {
  normalizeTrackerUrl,
  trackerHref,
  trackerLocation,
  trackerName,
} from "../lib/tracker";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { autoFocusUnlessTouch } from "../lib/pointer";
import { Link03, LinkExternal01 } from "@untitledui/icons";

/**
 * The tracker someone already had before LeadWell — a Notion page, a Word doc,
 * a shared Google Doc — pinned to the meeting it belongs to.
 *
 * Deliberately an *and*: linking a tracker doesn't switch anything off. The
 * rhythm, the topic board and the readiness clock stay here; the write-up
 * moves, and readiness stops claiming to know something it can't see (see
 * `meetingReadiness`). You can still log sessions here alongside it.
 *
 * Linking one on an untracked subject starts tracking it as-needed — the same
 * bargain as logging the first session. "I do these, they're in Notion" *is* a
 * decision, so it shouldn't leave them sitting in the undecided count.
 *
 * Takes a `meetingId` where the meeting already exists — a subject can have
 * several, and each keeps its notes somewhere different — or a subject, for
 * the opt-in surfaces where there's no meeting to point at yet.
 */
type TrackerLinkProps =
  | { meetingId: string; subjectKind?: never; subjectId?: never }
  | { meetingId?: never; subjectKind: MeetingSubjectKind; subjectId: string };

export function TrackerLink({
  meetingId,
  subjectKind,
  subjectId,
}: TrackerLinkProps) {
  const { meetings, trackMeeting, updateMeeting } = useStore();
  const meeting = meetingId
    ? meetings.find((m) => m.id === meetingId)
    : meetingFor(meetings, subjectKind!, subjectId!);
  const label = MEETING_LABEL[meeting?.subjectKind ?? subjectKind!];

  const url = meeting?.trackerUrl?.trim() ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);
  const [draftName, setDraftName] = useState(meeting?.trackerName ?? "");

  const open = () => {
    setDraft(url);
    setDraftName(meeting?.trackerName ?? "");
    setEditing(true);
  };

  const save = () => {
    const next = normalizeTrackerUrl(draft);
    // Creating the meeting only when there's something to hang on it keeps a
    // cancelled edit from quietly opting the subject into being tracked.
    if (!next && !meeting) {
      setEditing(false);
      return;
    }
    const id = meeting?.id ?? trackMeeting(subjectKind!, subjectId!, "as_needed");
    updateMeeting(id, {
      trackerUrl: next || undefined,
      trackerName: (next && draftName.trim()) || undefined,
    });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-2.5 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
        <Input
          size="md"
          label={`Where these ${label === "1:1" ? "1:1s" : `${label}s`} are kept`}
          placeholder="notion.so/… , a doc link, or a file path"
          hint="A link opens in a new tab. A path or a filename is kept as a reminder."
          value={draft}
          type="url"
          inputMode="url"
          enterKeyHint="done"
          autoFocus={autoFocusUnlessTouch()}
          onChange={setDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
        />
        <Input
          size="md"
          label="Call it"
          placeholder={draft.trim() ? trackerName(normalizeTrackerUrl(draft)) : "Notion, Word…"}
          value={draftName}
          enterKeyHint="done"
          onChange={setDraftName}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" onClick={save}>
            Save
          </Button>
          <Button size="sm" color="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          {url && (
            <Button
              size="sm"
              color="link-gray"
              onClick={() => {
                setDraft("");
                setDraftName("");
                if (meeting)
                  updateMeeting(meeting.id, {
                    trackerUrl: undefined,
                    trackerName: undefined,
                  });
                setEditing(false);
              }}
            >
              Remove link
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <Button
        size="sm"
        color="link-gray"
        iconLeading={Link03}
        onClick={open}
        className="max-w-full"
      >
        Kept somewhere else? Link the tracker
      </Button>
    );
  }

  const href = trackerHref(url);
  const name = meeting?.trackerName?.trim() || trackerName(url);

  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Link03 className="size-4 shrink-0 text-stone-400 dark:text-stone-500" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-stone-700 dark:text-stone-200">
            {name}
          </div>
          <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
            {trackerLocation(url)}
          </div>
        </div>
        {href && (
          <Button
            size="sm"
            color="secondary"
            className="shrink-0"
            iconTrailing={LinkExternal01}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
          >
            Open
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-3 py-1.5 dark:border-stone-800/80">
        <span className="min-w-0 flex-1 truncate text-[10px] text-stone-500 dark:text-stone-400">
          {href
            ? `Notes for this ${label} live there — rhythm and topics stay here`
            : "Not a link — kept as a pointer to the notes"}
        </span>
        <Button size="sm" color="link-gray" className="shrink-0" onClick={open}>
          Edit
        </Button>
      </div>
    </div>
  );
}
