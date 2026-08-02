import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { MarkdownBody } from "./MarkdownBody";
import { WritingPad } from "./WritingPad";

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
  const { notes, addNote, updateNote, deleteNote } = useStore();
  const mine = notes
    .filter((n) => n.personId === subjectId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");

  // Editors are per-subject — switching subjects must not carry a draft over.
  useEffect(() => {
    setEditingId(null);
    setComposing(false);
    setDraft("");
  }, [subjectId]);

  return (
    <div className="flex flex-col gap-3">
      {!composing && (
        <button
          type="button"
          onClick={() => {
            setComposing(true);
            setDraft("");
          }}
          className="w-full rounded-xl border border-dashed border-stone-300 py-3 text-sm text-stone-400 hover:border-teal-500 hover:text-teal-600 dark:border-stone-700"
        >
          + New note
        </button>
      )}
      {composing && (
        <div className="space-y-2">
          <WritingPad
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            autoFocus
            startEditing
            dualMode={false}
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              color="link-gray"
              onClick={() => setComposing(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!draft.trim()) return;
                addNote(subjectId, draft.trim());
                setDraft("");
                setComposing(false);
              }}
            >
              Save note
            </Button>
          </div>
        </div>
      )}
      {mine.length === 0 && !composing && (
        <p className="text-center text-xs text-stone-400">No notes yet.</p>
      )}
      <ul className="space-y-3">
        {mine.map((n) => (
          <li key={n.id} className="group space-y-1">
            <div className="flex items-center justify-between text-[11px] text-stone-400">
              <span>{n.date}</span>
              <ButtonUtility
                size="xs"
                color="tertiary"
                icon={X}
                tooltip="Delete note"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => deleteNote(n.id)}
              />
            </div>
            {editingId === n.id ? (
              <WritingPad
                value={n.body}
                onChange={(e) => updateNote(n.id, { body: e.target.value })}
                onBlur={() => setEditingId(null)}
                autoFocus
                startEditing
                dualMode={false}
              />
            ) : (
              <button
                type="button"
                className="journal-paper w-full text-left transition-opacity hover:opacity-90"
                onClick={() => setEditingId(n.id)}
              >
                <div className="journal-pad-inner py-4">
                  <MarkdownBody className="text-[0.95rem]">
                    {n.body}
                  </MarkdownBody>
                </div>
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
