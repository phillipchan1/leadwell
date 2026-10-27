import { useEffect, useState } from "react";
import type { Arc, Session, TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { currentStep, liveArcs, arcsFor, takeawayId, takeawaysFor } from "../../lib/arcs";
import { shareFirstName } from "../../lib/shares";
import { Avatar } from "../Avatar";
import { ArcCover } from "./ArcCover";
import { Check, RefreshCw01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * The arc in the room, beside the write-up. The one moment you already know
 * whether you finished the chapter, so this is where it costs a tap: Done, or
 * Again next time. Then one line each — the takeaway the closing page is made
 * of.
 */
export function ArcRun({ meeting, session }: { meeting: TrackedMeeting; session: Session }) {
  const arcs = useStore((s) => s.arcs);
  // A finished arc still shows here if this is the meeting that finished it.
  const shown = arcsFor(arcs, meeting.id).filter(
    (a) =>
      (liveArcs(arcs, meeting.id).includes(a) && a.status === "active" && session.date >= a.startsOn) ||
      a.steps.some((s) => s.coveredIn.includes(session.id))
  );
  if (!shown.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="Arc">
      {shown.map((arc) => (
        <RunArc key={arc.id} arc={arc} session={session} />
      ))}
    </section>
  );
}

function RunArc({ arc, session }: { arc: Arc; session: Session }) {
  const markArcStep = useStore((s) => s.markArcStep);
  const unmarkArcStep = useStore((s) => s.unmarkArcStep);
  const covered = arc.steps.filter((s) => s.coveredIn.includes(session.id));
  const current = currentStep(arc);
  const steps = covered.length ? covered : current ? [current] : [];

  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/60">
      <div className="flex items-center gap-2.5">
        <ArcCover arc={arc} size="xs" />
        <span className="min-w-0 truncate font-serif text-[14px] font-bold text-primary">{arc.title}</span>
      </div>
      {steps.map((step) => {
        const here = step.coveredIn.includes(session.id);
        const done = here && step.status === "done";
        return (
          <div key={step.id} className="flex flex-col gap-2">
            <b className="text-[13.5px] leading-[18px] text-primary">{step.label}</b>
            {step.prompts.length > 0 && (
              <ul className="flex flex-col gap-1 border-l-2 border-teal-300 pl-2.5 text-[13px] leading-[18px] text-secondary dark:border-teal-700">
                {step.prompts.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {here ? (
              <div className="flex items-center gap-2">
                <span
                  className={cx(
                    "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold",
                    done ? "bg-cond-thriving-soft text-cond-thriving-ink" : "bg-cond-watch-soft text-cond-watch-ink"
                  )}
                >
                  {done ? <Check className="size-3.5" /> : <RefreshCw01 className="size-3.5" />}
                  {done ? "Done" : "Again next time"}
                </span>
                <button
                  type="button"
                  onClick={() => unmarkArcStep(arc.id, step.id, session.id)}
                  className="text-[12px] font-semibold text-tertiary hover:text-secondary"
                >
                  Undo
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => markArcStep(arc.id, step.id, session.id, "done")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-teal-600 px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
                >
                  <Check className="size-3.5" /> Done
                </button>
                <button
                  type="button"
                  onClick={() => markArcStep(arc.id, step.id, session.id, "again")}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-primary bg-primary px-3 text-[12.5px] font-semibold text-secondary hover:bg-secondary"
                >
                  <RefreshCw01 className="size-3.5" /> Again next time
                </button>
              </div>
            )}
            {done && step.practice && (
              <p className="text-[12px] text-tertiary">
                <span className="font-semibold text-teal-700 dark:text-teal-400">Try</span> {step.practice} — on next meeting's
                Since last time.
              </p>
            )}
            <Takeaways arc={arc} stepId={step.id} />
          </div>
        );
      })}
    </div>
  );
}

/** Mine is editable; theirs is read here and written on the shared page. */
export function Takeaways({ arc, stepId }: { arc: Arc; stepId: string }) {
  const me = useStore((s) => s.me);
  const takeaways = useStore((s) => s.takeaways);
  const shares = useStore((s) => s.shares);
  const setTakeaway = useStore((s) => s.setTakeaway);
  const mine = takeaways.find((t) => t.id === takeawayId(stepId, "owner"));
  const [draft, setDraft] = useState(mine?.text ?? "");
  useEffect(() => setDraft(mine?.text ?? ""), [mine?.text]);
  const theirs = takeawaysFor(takeaways, stepId).filter((t) => t.by !== "owner");

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-2">
        <Avatar name={me.name || "Me"} photo={me.photo} size={20} className="mt-1.5" />
        <textarea
          rows={1}
          value={draft}
          placeholder="Your takeaway, in a line"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setTakeaway(arc.id, stepId, draft)}
          className="min-h-8 flex-1 resize-none rounded-[8px] border border-transparent bg-primary px-2 py-1.5 text-[13px] leading-[18px] text-primary outline-none placeholder:text-placeholder focus:border-teal-300 dark:focus:border-teal-700"
        />
      </label>
      {theirs.map((t) => {
        const share = shares.find((s) => s.id === t.by);
        const name = share ? (share.name ?? shareFirstName(share)) : "Them";
        return (
          <p key={t.id} className="flex items-start gap-2 text-[13px] leading-[18px] text-primary">
            <Avatar name={name} size={20} className="mt-0.5" />
            <span className="py-0.5">{t.text}</span>
          </p>
        );
      })}
    </div>
  );
}
