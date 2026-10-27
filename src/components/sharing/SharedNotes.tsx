import { useEffect, useRef, useState } from "react";
import type { Session, TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { sharedNoteId } from "../../lib/arcs";
import { shareFirstName, sharedWithLabel, sharesFor } from "../../lib/shares";
import { Avatar } from "../Avatar";
import { Lock01, Users01 } from "@untitledui/icons";

/**
 * "Our notes": each chair's part of the write-up, side by side. Only on a
 * shared meeting — and the private write-up below stays exactly that.
 */
export function SharedNotes({ meeting, session }: { meeting: TrackedMeeting; session: Session }) {
  const me = useStore((s) => s.me);
  const shares = sharesFor(useStore((s) => s.shares), meeting.id);
  const notes = useStore((s) => s.sharedNotes);
  const setSharedNote = useStore((s) => s.setSharedNote);
  const mine = notes.find((n) => n.id === sharedNoteId(session.id, "owner"));
  const [draft, setDraft] = useState(mine?.body ?? "");
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setDraft(mine?.body ?? "");
  }, [mine?.body]);
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      setSharedNote(meeting.id, session.id, draft);
      dirty.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [draft, meeting.id, session.id, setSharedNote]);

  if (!shares.length) return null;
  const theirs = notes.filter((n) => n.sessionId === session.id && n.by !== "owner" && n.body.trim());

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border border-teal-200 bg-teal-50/50 p-4 dark:border-teal-900 dark:bg-teal-950/40">
      <div className="flex items-center gap-2">
        <Users01 aria-hidden className="size-4 text-teal-700 dark:text-teal-400" />
        <h3 className="text-[13px] font-semibold text-primary">Our notes</h3>
        <span className="text-[12px] text-tertiary">Visible to {sharedWithLabel(shares)}</span>
      </div>
      <label className="flex items-start gap-2.5">
        <Avatar name={me.name || "Me"} photo={me.photo} size={24} className="mt-1" />
        <textarea
          rows={3}
          value={draft}
          placeholder="What we agreed, in words you'd both sign"
          onChange={(e) => {
            dirty.current = true;
            setDraft(e.target.value);
          }}
          onBlur={() => {
            if (dirty.current) setSharedNote(meeting.id, session.id, draft);
            dirty.current = false;
          }}
          className="min-h-20 flex-1 resize-y rounded-[10px] border border-secondary bg-primary px-3 py-2 text-[14px] leading-[21px] text-primary outline-none placeholder:text-placeholder focus:border-teal-300 dark:focus:border-teal-700"
        />
      </label>
      {theirs.map((n) => {
        const share = shares.find((s) => s.id === n.by);
        const name = share ? (share.name ?? shareFirstName(share)) : "Them";
        return (
          <div key={n.id} className="flex items-start gap-2.5">
            <Avatar name={name} size={24} className="mt-0.5" />
            <p className="flex-1 rounded-[10px] bg-primary px-3 py-2 text-[14px] leading-[21px] whitespace-pre-wrap text-primary">
              {n.body}
            </p>
          </div>
        );
      })}
      <p className="flex items-center gap-1.5 text-[12px] text-tertiary">
        <Lock01 aria-hidden className="size-3.5" /> The write-up below is <b className="font-semibold">My notes</b> — only you.
      </p>
    </section>
  );
}
