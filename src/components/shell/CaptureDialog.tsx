import { useMemo, useState } from "react";
import { useStore } from "@/store/useStore";
import { findMeeting, findTag, parseCapture, splitCaptureLines } from "@/lib/ideas";
import { meetingTitle, meetingSubjectName } from "@/lib/readiness";
import { toast } from "@/lib/toasts";
import { cx } from "@/utils/cx";
import { Modal } from "../ui";
import type { TrackedMeeting } from "@/types";

/**
 * Capture, from anywhere — `C` on a keyboard, the gilt + on a phone.
 *
 * A thought arrives in a hallway, not on the Ideas page. The grammar is the
 * Ideas board's own (`#tag @meeting !`), so a topic lands exactly where it
 * would have if you'd typed it there, and the line under the field says where
 * that is before you commit. People, teams and leaders hand off to the forms
 * that already exist for them.
 */
export function CaptureDialog({
  draft: initial = "",
  onClose,
}: {
  draft?: string;
  onClose: () => void;
}) {
  const meetings = useStore((s) => s.meetings);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const tags = useStore((s) => s.tags);
  const captureTopics = useStore((s) => s.captureTopics);
  const openModal = useStore((s) => s.openModal);
  const [draft, setDraft] = useState(initial);

  // What to call a meeting back to you: its own name, or who it's with.
  const labelOf = useMemo(() => {
    const src = { people, teams, managers };
    return (m: TrackedMeeting) => m.name?.trim() || meetingSubjectName(m, src) || meetingTitle(m);
  }, [people, teams, managers]);
  // `@sarah` should match what the board shows: the meeting's own name, or the
  // name of who it's with. Same rule the store applies when it files the topic.
  const matchLabel = useMemo(() => {
    const src = { people, teams, managers };
    return (m: TrackedMeeting) => m.name ?? meetingSubjectName(m, src) ?? "Meeting";
  }, [people, teams, managers]);

  const lines = splitCaptureLines(draft);
  const preview = lines.length === 1 ? parseCapture(lines[0]) : null;
  const meeting =
    preview?.meetingQuery != null
      ? findMeeting(preview.meetingQuery, meetings, matchLabel)
      : undefined;
  const tagHits = preview
    ? preview.tagLabels.map((l) => findTag(l, tags)?.label ?? `${l} (new)`)
    : [];

  const submit = () => {
    if (!lines.length) return;
    captureTopics(draft);
    toast({
      message:
        lines.length > 1
          ? `Captured ${lines.length} topics`
          : meeting
            ? `Captured for ${labelOf(meeting)}`
            : "Captured to Ideas",
    });
    onClose();
  };

  const handOff = (kind: "person" | "team" | "manager") => {
    onClose();
    if (kind === "person") openModal({ kind: "person", teamId: null });
    else openModal({ kind });
  };

  return (
    <Modal
      title="Capture"
      subtitle="Something to raise. It goes to Ideas, or to the meeting you @mention."
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="capture-field" className="text-[13px] font-medium text-secondary">
            Topic
          </label>
          <textarea
            id="capture-field"
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask about the volunteer pipeline #work @sarah"
            className="w-full resize-none rounded-xl border border-teal-200 bg-primary px-3.5 py-3 text-[16px] leading-6 shadow-[0_0_0_3px_var(--color-teal-50)] outline-none placeholder:text-placeholder focus:border-teal-300 dark:border-teal-800 dark:shadow-none"
          />
          <p className="min-h-5 text-[13px] text-tertiary" aria-live="polite">
            {lines.length > 1 ? (
              <>{lines.length} topics, one per line.</>
            ) : preview ? (
              <>
                Goes to{" "}
                <b className={cx("font-semibold", meeting ? "font-serif text-[15px] text-primary" : "text-primary")}>
                  {meeting ? labelOf(meeting) : "Ideas"}
                </b>
                {tagHits.length > 0 && <> · tagged {tagHits.join(", ")}</>}
                {preview.urgent && <> · urgent</>}
              </>
            ) : (
              <>
                Type <span className="font-mono text-[12px]">#</span> for a tag,{" "}
                <span className="font-mono text-[12px]">@</span> for a person or meeting,{" "}
                <span className="font-mono text-[12px]">!</span> for urgent.
              </>
            )}
          </p>
        </div>

        <button
          type="submit"
          disabled={!lines.length}
          className="h-11 rounded-xl bg-teal-600 text-[15px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-400 dark:text-stone-950 dark:hover:bg-teal-300"
        >
          {meeting ? `Add to ${labelOf(meeting)}` : "Capture"}
        </button>

        <div className="flex flex-col gap-2 border-t border-secondary pt-4">
          <span className="eyebrow">Or add someone</span>
          <div className="grid grid-cols-3 gap-2">
            <HandOff label="Person" hint="Someone you lead" onClick={() => handOff("person")} />
            <HandOff label="Team" hint="A group you lead" onClick={() => handOff("team")} />
            <HandOff label="Leader" hint="Someone above you" onClick={() => handOff("manager")} />
          </div>
        </div>
      </form>
    </Modal>
  );
}

function HandOff({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl border border-secondary px-3 py-2 text-left hover:bg-secondary"
    >
      <span className="text-[13.5px] font-semibold">{label}</span>
      <span className="text-caption text-quaternary">{hint}</span>
    </button>
  );
}
