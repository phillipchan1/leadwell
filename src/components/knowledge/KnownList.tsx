import { useState } from "react";
import { Bookmark, Plus, Trash01 } from "@untitledui/icons";
import type { KnowledgeKind, MeetingSubjectKind } from "../../types";
import { useStore } from "../../store/useStore";
import { KIND_LABEL, knownFor } from "../../lib/knowledge";
import { SectionTitle } from "../ui";
import { cx } from "@/utils/cx";

const KINDS = Object.keys(KIND_LABEL) as KnowledgeKind[];
/** Run shows enough to jog the memory, not the archive. */
const COMPACT_LIMIT = 6;

function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * What's known about a person or team, built up meeting by meeting: the
 * decisions made, the themes that keep coming back, the facts you shouldn't
 * have to ask twice. Each links back to the meeting it came from. Pinned ones
 * stay on top, and those are what Run shows beside the next meeting.
 */
export function KnownList({
  subjectKind,
  subjectId,
  compact = false,
  className,
}: {
  subjectKind: MeetingSubjectKind;
  subjectId: string;
  compact?: boolean;
  className?: string;
}) {
  const knowledge = useStore((s) => s.knowledge);
  const sessions = useStore((s) => s.sessions);
  const openSession = useStore((s) => s.openSession);
  const addKnowledge = useStore((s) => s.addKnowledge);
  const updateKnowledge = useStore((s) => s.updateKnowledge);
  const deleteKnowledge = useStore((s) => s.deleteKnowledge);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<KnowledgeKind>("fact");
  const all = knownFor(knowledge, subjectKind, subjectId);
  const shown = compact ? all.slice(0, COMPACT_LIMIT) : all;

  if (compact && !all.length) return null;

  return (
    <section className={cx("flex flex-col gap-2", className)}>
      {compact ? <h3 className="eyebrow">What we know</h3> : <SectionTitle>What we know</SectionTitle>}
      {!compact && !all.length && (
        <p className="text-[13px] text-tertiary">
          Decisions, themes and things worth remembering. Wrapping up a meeting files them here, or add
          one yourself.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {shown.map((k) => {
            const from = k.sessionId ? sessions.find((o) => o.id === k.sessionId) : undefined;
            return (
              <li key={k.id} className="group/kn flex items-start gap-2.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cx("leading-[19px] text-primary", compact ? "text-[13.5px]" : "text-[14px]")}>
                    {k.text}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-quaternary uppercase">
                    <span className={cx(k.kind === "decision" && "text-teal-700 dark:text-teal-400")}>
                      {KIND_LABEL[k.kind]}
                    </span>
                    {from ? (
                      <button
                        type="button"
                        onClick={() => openSession(from.id)}
                        className="uppercase hover:text-secondary hover:underline"
                      >
                        {fmt(from.date)}
                      </button>
                    ) : (
                      k.notedOn && <span>{fmt(k.notedOn)}</span>
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  aria-pressed={Boolean(k.pinned)}
                  aria-label={k.pinned ? "Unpin" : "Pin — keep it in view in Run"}
                  title={k.pinned ? "Unpin" : "Pin — keep it in view in Run"}
                  onClick={() => updateKnowledge(k.id, { pinned: !k.pinned || undefined })}
                  className={cx(
                    "flex size-7 shrink-0 items-center justify-center rounded-md transition-opacity hover:bg-secondary",
                    k.pinned
                      ? "text-teal-700 dark:text-teal-400"
                      : "text-quaternary opacity-0 group-hover/kn:opacity-100 focus-visible:opacity-100 touch:opacity-100"
                  )}
                >
                  <Bookmark className="size-3.5" />
                </button>
                {!compact && (
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => deleteKnowledge(k.id)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-quaternary opacity-0 transition-opacity group-hover/kn:opacity-100 hover:bg-secondary hover:text-secondary focus-visible:opacity-100 touch:opacity-100"
                  >
                    <Trash01 className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {compact && all.length > COMPACT_LIMIT && (
        <span className="text-[12px] text-quaternary">{all.length - COMPACT_LIMIT} more on their Notes</span>
      )}
      {!compact && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            addKnowledge(subjectKind, subjectId, kind, draft);
            setDraft("");
          }}
        >
          <select
            aria-label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as KnowledgeKind)}
            className="h-9 rounded-[9px] border border-primary bg-primary px-2.5 text-[13px]"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <input
            aria-label="Something worth knowing"
            placeholder="Something worth knowing…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-[9px] border border-primary bg-primary px-3 text-[13.5px] outline-none placeholder:text-quaternary focus:border-teal-400"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Add"
            className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-teal-600 text-white disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
          >
            <Plus className="size-4" />
          </button>
        </form>
      )}
    </section>
  );
}
