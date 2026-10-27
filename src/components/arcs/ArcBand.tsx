import { useState } from "react";
import type { Arc, TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import {
  arcPlan,
  currentStep,
  liveArcs,
  arcsFor,
  progressOf,
  stepTag,
  stepsOn,
  unmarkedSession,
  type PlannedStep,
} from "../../lib/arcs";
import { curriculumOf, slotDotClass, type Slot } from "../../lib/topics";
import { todayISO } from "../../lib/readiness";
import { confirmAction } from "../ConfirmDialog";
import { ArcCover, ArcRail } from "./ArcCover";
import { ArcSheet } from "./ArcSheet";
import { ArcClosing } from "./ArcClosing";
import { ArcStart } from "./ArcStart";
import { BookOpen01, DotsHorizontal, Plus } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });

/**
 * The arcs on a meeting, as they bear on one occurrence — the band above the
 * Agenda's running order. "This week we're doing Ch. 4" without anyone having
 * put Ch. 4 anywhere.
 */
export function ArcBand({
  meeting,
  date,
  slots,
  isNext,
}: {
  meeting: TrackedMeeting;
  /** The occurrence on screen. */
  date: string;
  /** The occurrences ahead, as the agenda pages through them. */
  slots: Slot[];
  isNext: boolean;
}) {
  const arcs = useStore((s) => s.arcs);
  const [sheet, setSheet] = useState<Arc | "new" | null>(null);
  const [closing, setClosing] = useState<Arc | null>(null);
  const live = liveArcs(arcs, meeting.id);
  const finished = arcsFor(arcs, meeting.id).filter((a) => a.status === "done");

  if (!live.length && !finished.length) {
    return (
      <section className="flex flex-col" aria-label="Arcs">
        <ArcStart meeting={meeting} variant="agenda" />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2.5" aria-label="Arcs">
      {live.map((arc) => (
        <ArcCard
          key={arc.id}
          arc={arc}
          meeting={meeting}
          date={date}
          slots={slots}
          isNext={isNext}
          onEdit={() => setSheet(arc)}
          onClosing={() => setClosing(arc)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {finished.map((arc) => (
          <button
            key={arc.id}
            type="button"
            onClick={() => setClosing(arc)}
            className="inline-flex items-center gap-2 text-[12.5px] text-tertiary hover:text-secondary"
          >
            <ArcCover arc={arc} size="xs" />
            Finished <span className="font-serif font-semibold text-secondary">{arc.title}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSheet("new")}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-tertiary hover:text-teal-700 dark:hover:text-teal-400"
        >
          {live.length === 0 ? <BookOpen01 aria-hidden className="size-4" /> : <Plus aria-hidden className="size-3.5" />}
          {live.length === 0 ? "Working through a book or a plan together? Start an arc" : "Another arc"}
        </button>
      </div>

      {sheet && (
        <ArcSheet meeting={meeting} arc={sheet === "new" ? undefined : sheet} onClose={() => setSheet(null)} />
      )}
      {closing && <ArcClosing arc={closing} onClose={() => setClosing(null)} />}
    </section>
  );
}

function ArcCard({
  arc,
  meeting,
  date,
  slots,
  isNext,
  onEdit,
  onClosing,
}: {
  arc: Arc;
  meeting: TrackedMeeting;
  date: string;
  slots: Slot[];
  isNext: boolean;
  onEdit: () => void;
  onClosing: () => void;
}) {
  const sessions = useStore((s) => s.sessions);
  const tags = useStore((s) => s.tags);
  const markArcStep = useStore((s) => s.markArcStep);
  const passArc = useStore((s) => s.passArc);
  const updateArc = useStore((s) => s.updateArc);
  const deleteArc = useStore((s) => s.deleteArc);
  const [menu, setMenu] = useState(false);

  const p = progressOf(arc);
  const here = stepsOn(arc, slots, date);
  const plan = arcPlan(arc, slots);
  const nextOn = [...plan.entries()].find(([d]) => d > date)?.[0];
  const slot = curriculumOf(meeting).find((s) => s.id === arc.slotId);
  const current = currentStep(arc);
  const unmarked = isNext ? unmarkedSession(arc, sessions, todayISO()) : null;

  return (
    <div className="overflow-hidden rounded-[14px] border border-teal-200 bg-gradient-to-b from-teal-50 to-transparent dark:border-teal-900 dark:from-teal-950">
      <div className="flex items-center gap-3.5 px-4 py-3">
        <ArcCover arc={arc} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate font-serif text-[15.5px] leading-tight font-bold text-primary">{arc.title}</span>
          <span className="text-[12.5px] text-tertiary">
            {current ? `${stepTag(arc, current)} of ${p.total}` : `All ${p.total} done`}
            {arc.author ? ` · ${arc.author}` : ""}
            {arc.every > 1 ? " · every other meeting" : ""}
            {arc.status === "paused" ? " · paused" : ""}
          </span>
          <ArcRail arc={arc} />
        </div>
        <div className="relative">
          <button
            type="button"
            aria-label={`${arc.title} options`}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
            className="flex size-8 items-center justify-center rounded-lg text-tertiary hover:bg-secondary"
          >
            <DotsHorizontal className="size-4" />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 flex w-44 flex-col rounded-[10px] border border-secondary bg-primary p-1 shadow-lg"
              onMouseLeave={() => setMenu(false)}
            >
              <MenuItem onClick={() => (setMenu(false), onEdit())}>Edit steps</MenuItem>
              <MenuItem onClick={() => (setMenu(false), onClosing())}>Takeaways so far</MenuItem>
              <MenuItem
                onClick={() => {
                  setMenu(false);
                  updateArc(arc.id, { status: arc.status === "paused" ? "active" : "paused" });
                }}
              >
                {arc.status === "paused" ? "Resume" : "Pause"}
              </MenuItem>
              <MenuItem
                danger
                onClick={async () => {
                  setMenu(false);
                  if (
                    await confirmAction({
                      title: `Delete “${arc.title}”?`,
                      body: "Its steps and takeaways go with it. Follow-ups it opened stay.",
                      confirmLabel: "Delete",
                    })
                  )
                    deleteArc(arc.id);
                }}
              >
                Delete
              </MenuItem>
            </div>
          )}
        </div>
      </div>

      {unmarked && current && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-teal-200 bg-cond-watch-soft px-4 py-2.5 dark:border-teal-900">
          <span className="min-w-0 flex-1 text-[13px] text-cond-watch-ink">
            Did you get to <b>{current.label}</b> on {fmt(unmarked.date, { weekday: "short", month: "short", day: "numeric" })}?
          </span>
          <span className="flex flex-wrap gap-1.5">
            <Pill onClick={() => markArcStep(arc.id, current.id, unmarked.id, "done")}>Yes, done</Pill>
            <Pill onClick={() => markArcStep(arc.id, current.id, unmarked.id, "again")}>Partly</Pill>
            <Pill onClick={() => passArc(arc.id, unmarked.id)}>Didn't touch it</Pill>
          </span>
        </div>
      )}

      {here.length > 0 ? (
        here.map((planned) => <StepCard key={planned.step.id} planned={planned} slotLabel={slot?.label} slotDot={slot ? slotDotClass(curriculumOf(meeting), slot.id, tags) : undefined} />)
      ) : arc.status === "active" && current ? (
        <p className="border-t border-teal-200 px-4 py-2.5 text-[12.5px] text-tertiary dark:border-teal-900">
          No step this meeting.
          {nextOn ? ` ${current.label} is next, on ${fmt(nextOn, { month: "short", day: "numeric" })}.` : ""}
        </p>
      ) : null}
    </div>
  );
}

const STATE_CHIP: Record<PlannedStep["state"], string> = {
  now: "This meeting",
  later: "Planned",
  again: "Carried on",
  done: "Done here",
};

function StepCard({
  planned,
  slotLabel,
  slotDot,
}: {
  planned: PlannedStep;
  slotLabel?: string;
  slotDot?: string;
}) {
  const { step, state } = planned;
  return (
    <div className="border-t border-teal-200 bg-primary dark:border-teal-900">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <b className="font-serif text-[15px] leading-tight text-primary">{step.label}</b>
        <span
          className={cx(
            "inline-flex h-5 items-center rounded-[5px] px-1.5 text-[11px] font-semibold",
            state === "done"
              ? "bg-cond-thriving-soft text-cond-thriving-ink"
              : state === "again"
                ? "bg-cond-watch-soft text-cond-watch-ink"
                : "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-400"
          )}
        >
          {STATE_CHIP[state]}
        </span>
        {slotLabel && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-tertiary">
            <span className={cx("size-2 rounded-[2px]", slotDot)} />
            in {slotLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 border-t border-secondary sm:grid-cols-3">
        <Part k="Read" empty="Nothing to read">
          {step.read}
        </Part>
        <Part k="Talk" empty="Talk it through" className="sm:border-l">
          {step.prompts.length ? (
            <ul className="flex flex-col gap-1.5">
              {step.prompts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : undefined}
        </Part>
        <Part k="Try" empty="—" className="sm:border-l" fine={step.practice ? "Opens next meeting" : undefined}>
          {step.practice}
        </Part>
      </div>
    </div>
  );
}

function Part({
  k,
  children,
  empty,
  className,
  fine,
}: {
  k: string;
  children?: React.ReactNode;
  empty: string;
  className?: string;
  fine?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1 border-secondary px-4 py-3 max-sm:border-t max-sm:first:border-t-0", className)}>
      <span className="text-[10.5px] font-semibold tracking-[0.14em] text-teal-700 uppercase dark:text-teal-400">{k}</span>
      <div className={cx("text-[13.5px] leading-[19px]", children ? "text-primary" : "text-quaternary")}>{children || empty}</div>
      {fine && <span className="text-[11.5px] text-quaternary">{fine}</span>}
    </div>
  );
}

function Pill({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 rounded-full border border-cond-watch bg-primary px-2.5 text-[12px] font-semibold text-cond-watch-ink hover:brightness-95"
    >
      {children}
    </button>
  );
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cx(
        "rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-secondary",
        danger ? "text-cond-critical-ink" : "text-secondary"
      )}
    >
      {children}
    </button>
  );
}
