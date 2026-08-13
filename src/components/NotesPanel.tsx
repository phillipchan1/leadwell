import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { confirmAction } from "./ConfirmDialog";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { MarkdownBody } from "./MarkdownBody";
import { WritingPad } from "./WritingPad";
import { autoFocusUnlessTouch } from "../lib/pointer";

/**
 * Dated notes about one subject. Keyed by subject id, so it serves people I
 * lead and leaders I report to alike — the notes table has no foreign key,
 * the same seam the wins ledger already rides on.
 *
 * @see WinsLedger — the leading-up counterpart, banked value rather than context.
 */
export function NotesPanel({
  subjectId,
  placeholder = "Quick note — context, observations, reminders…",
}: {
  subjectId: string;
  /** Prompt in the composer; the job of a note differs up vs down. */
  placeholder?: string;
}) {
  const notes = useStore((s) => s.notes);
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const mine = notes
    .filter((n) => n.personId === subjectId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // Editors are per-subject — switching subjects must not carry a draft over.
  useEffect(() => {
    setEditingId(null);
    setDraft("");
  }, [subjectId]);

  const save = () => {
    if (!draft.trim()) return;
    addNote(subjectId, draft.trim());
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-3">
      {/* The composer is always here rather than behind a "+ New note" button.
          Capturing a thought is the whole job of this panel, and a click that
          only reveals a textarea is a click that stops you having the thought. */}
      <div className="space-y-2">
        <WritingPad
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          startEditing
          dualMode={false}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            }
          }}
        />
        {draft.trim() && (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" color="link-gray" onClick={() => setDraft("")}>
              Clear
            </Button>
            <Button
              size="sm"
              onClick={save}
              iconTrailing={
                <kbd className="rounded bg-white/20 px-1 font-mono text-caption font-normal text-white/90">
                  ⌘↵
                </kbd>
              }
            >
              Save note
            </Button>
          </div>
        )}
      </div>
      {mine.length === 0 && (
        <p className="text-center text-xs text-quaternary">
          No notes yet.
        </p>
      )}
      <ul className="space-y-3">
        {mine.map((n) => (
          <li key={n.id} className="group space-y-1">
            <div className="flex items-center justify-between text-caption text-quaternary">
              <span>{n.date}</span>
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={X}
                tooltip="Delete note"
                className="opacity-0 touch:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                onClick={async () => {
                  if (
                    await confirmAction({
                      title: "Delete this note?",
                      body: `What you wrote on ${n.date} goes with it.`,
                    })
                  )
                    deleteNote(n.id);
                }}
              />
            </div>
            {editingId === n.id ? (
              /* Exiting on blur meant tapping "Done" collapsed the editor
                 before the tap resolved; the edit now ends on an explicit
                 action. Changes are already saved on every keystroke. */
              <div className="space-y-2">
                <WritingPad
                  value={n.body}
                  onChange={(e) => updateNote(n.id, { body: e.target.value })}
                  autoFocus={autoFocusUnlessTouch()}
                  startEditing
                  dualMode={false}
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setEditingId(null)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              /* Rendered markdown contains links and checkboxes, so it cannot
                 live inside a <button>: that is invalid HTML, and on touch a
                 tap on a link both followed it and entered edit mode. */
              <div className="journal-paper relative">
                <div className="journal-pad-inner py-4">
                  <MarkdownBody className="text-[0.95rem]">
                    {n.body}
                  </MarkdownBody>
                </div>
                <div className="flex justify-end px-4 pb-3">
                  <Button
                    size="sm"
                    color="link-gray"
                    onClick={() => setEditingId(n.id)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
