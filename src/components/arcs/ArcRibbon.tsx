import { useMemo } from "react";
import type { TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { arcPlan, liveArcs, shortLabel, tookLonger } from "../../lib/arcs";
import { heldSessions, sessionsFor, todayISO } from "../../lib/readiness";
import { plannedSlots, type Slot } from "../../lib/topics";
import { ArcCover } from "./ArcCover";
import { ArcStart } from "./ArcStart";
import { cx } from "@/utils/cx";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

type Column = { kind: "slot"; slot: Slot } | { kind: "skipped"; date: string };

/**
 * Plan ahead, for arcs: one ribbon per arc across the weeks — the last few
 * meetings, then the ones coming. It's projected from the arc's position and
 * pace, so a skipped week is a gap the ribbon steps over rather than a
 * chapter lost.
 */
export function ArcRibbon({ meeting }: { meeting: TrackedMeeting }) {
  const arcs = useStore((s) => s.arcs);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const today = todayISO();
  const live = liveArcs(arcs, meeting.id);

  const columns = useMemo<Column[]>(() => {
    const all = sessionsFor(meeting.id, sessions);
    const ahead = plannedSlots(meeting, sessions, topics, today, 8);
    const byDate = new Map<string, Column>();
    for (const s of heldSessions(all).filter((s) => s.date < today).slice(-3)) {
      byDate.set(s.date, { kind: "slot", slot: { sessionId: s.id, date: s.date, projected: false, past: true } });
    }
    for (const slot of ahead) byDate.set(slot.date, { kind: "slot", slot });
    const dates = [...byDate.keys()].sort();
    const [lo, hi] = [dates[0], dates[dates.length - 1]];
    for (const s of all) {
      const d = s.seriesDate ?? s.date;
      if (s.kind === "skipped" && lo && hi && d >= lo && d <= hi && !byDate.has(d)) {
        byDate.set(d, { kind: "skipped", date: d });
      }
    }
    return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, c]) => c);
  }, [meeting, sessions, topics, today]);

  if (!live.length) return <ArcStart meeting={meeting} variant="board" />;
  const slots = columns.flatMap((c) => (c.kind === "slot" ? [c.slot] : []));
  const nextDate = slots.find((s) => !s.past)?.date;
  const template = columns.map((c) => (c.kind === "skipped" ? "34px" : "minmax(112px,1fr)")).join(" ");

  return (
    <section aria-label="Arcs ahead" className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="eyebrow">Arcs</h3>
        <span className="text-[12px] text-quaternary">Drawn from where you are and your pace — skip a week and it slides.</span>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-secondary bg-primary p-3">
        <div className="grid min-w-max gap-x-2 gap-y-2" style={{ gridTemplateColumns: `150px ${template}` }}>
          <span className="sticky left-0 z-10 bg-primary" />
          {columns.map((c) =>
            c.kind === "skipped" ? (
              <span
                key={c.date}
                className="row-span-1 self-end justify-self-center pb-1 font-mono text-[10.5px] text-quaternary [writing-mode:vertical-rl] rotate-180"
              >
                {fmt(c.date)} · skipped
              </span>
            ) : (
              <span key={c.slot.date} className="flex flex-col gap-0.5 px-1 pb-1">
                <span
                  className={cx(
                    "text-[13px] font-semibold",
                    c.slot.date === nextDate ? "text-teal-700 dark:text-teal-400" : c.slot.past ? "text-tertiary" : "text-primary"
                  )}
                >
                  {fmt(c.slot.date)}
                </span>
                <span className="text-[11px] text-quaternary">
                  {c.slot.date === nextDate
                    ? "Next"
                    : c.slot.past
                      ? c.slot.projected
                        ? "Not logged"
                        : "Held"
                      : c.slot.projected
                        ? "Expected"
                        : "Booked"}
                </span>
              </span>
            )
          )}

          {live.map((arc) => {
            const plan = arcPlan(arc, slots);
            return [
              <span key={`${arc.id}-label`} className="sticky left-0 z-10 flex items-center gap-2 bg-primary pr-2">
                <ArcCover arc={arc} size="xs" />
                <span className="min-w-0 truncate font-serif text-[13px] font-semibold text-primary">{arc.title}</span>
              </span>,
              ...columns.map((c) => {
                if (c.kind === "skipped") {
                  return (
                    <span
                      key={`${arc.id}-${c.date}`}
                      aria-hidden
                      className="rounded-md bg-[repeating-linear-gradient(180deg,transparent_0_5px,var(--color-border-secondary)_5px_6px)]"
                    />
                  );
                }
                const here = plan.get(c.slot.date) ?? [];
                if (!here.length) {
                  return <span key={`${arc.id}-${c.slot.date}`} className="min-h-[50px] rounded-[9px] border border-dashed border-secondary" />;
                }
                return (
                  <span key={`${arc.id}-${c.slot.date}`} className="flex flex-col gap-1">
                    {here.map(({ step, state }) => (
                      <span
                        key={step.id}
                        title={step.label}
                        className={cx(
                          "flex min-h-[50px] flex-col gap-0.5 rounded-[9px] px-2.5 py-2 text-[12px] leading-[15px]",
                          state === "done" && "bg-secondary text-tertiary",
                          state === "again" && "bg-cond-watch-soft text-cond-watch-ink",
                          state === "now" && "bg-teal-600 text-white shadow-[0_6px_16px_-8px_var(--color-teal-600)] dark:bg-teal-500 dark:text-stone-950",
                          state === "later" && "border-[1.5px] border-dashed border-teal-200 text-secondary dark:border-teal-800"
                        )}
                      >
                        <b className={cx("font-semibold", state === "done" && "line-through decoration-stone-300")}>{shortLabel(step)}</b>
                        <span className="line-clamp-1 opacity-85">
                          {step.label.replace(shortLabel(step), "").replace(/^\s*[·—–:-]\s*/, "") ||
                            (state === "again" ? "carried on" : "")}
                        </span>
                        {state === "done" && tookLonger(step) && (
                          <span className="self-start rounded-[4px] bg-cond-watch-soft px-1 font-mono text-[10px] font-bold text-cond-watch-ink">
                            ½
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                );
              }),
            ];
          })}
        </div>
      </div>
    </section>
  );
}
