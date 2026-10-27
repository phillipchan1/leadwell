import type { Arc } from "../../types";
import { useStore } from "../../store/useStore";
import { Modal } from "../ui";
import { arcSpan, practicesKept, progressOf, stepTag, takeawaysFor } from "../../lib/arcs";
import { daysBetween } from "../../lib/readiness";
import { shareFirstName } from "../../lib/shares";
import { Avatar } from "../Avatar";
import { ArcCover } from "./ArcCover";
import { Printer } from "@untitledui/icons";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * What we learned together: the book, how long it took, and every takeaway in
 * order. The one page in Polarch worth printing — and the right thing to send
 * the person you read it with.
 */
export function ArcClosing({ arc, onClose }: { arc: Arc; onClose: () => void }) {
  const me = useStore((s) => s.me);
  const sessions = useStore((s) => s.sessions);
  const takeaways = useStore((s) => s.takeaways);
  const followUps = useStore((s) => s.followUps);
  const shares = useStore((s) => s.shares);

  const span = arcSpan(arc, sessions);
  const p = progressOf(arc);
  const kept = practicesKept(arc, followUps);
  const weeks = span.from && span.to ? Math.max(1, Math.round(daysBetween(span.from, span.to) / 7) + 1) : 0;
  const nameOf = (by: string) => {
    if (by === "owner") return me.name || "Me";
    const share = shares.find((s) => s.id === by);
    return share ? (share.name ?? shareFirstName(share)) : "Them";
  };
  const withNames = [...new Set(takeaways.filter((t) => t.arcId === arc.id && t.by !== "owner").map((t) => t.by))]
    .map((by) => nameOf(by).split(/\s+/)[0]);
  const who = [me.name?.split(/\s+/)[0] || "Me", ...withNames].join(" & ");
  const done = arc.status === "done";
  const withTakeaways = arc.steps.filter((s) => takeawaysFor(takeaways, s.id).length);

  return (
    <Modal title={done ? "The closing page" : "Takeaways so far"} onClose={onClose} size="lg">
      <article className="arc-closing flex flex-col gap-6 sm:flex-row sm:gap-8">
        <ArcCover arc={arc} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="eyebrow">
            {who} · {done && arc.closedOn ? `finished ${fmt(arc.closedOn)}` : `on step ${p.at} of ${p.total}`}
          </span>
          <h2 className="mt-2 font-serif text-[30px] leading-[1.1] font-bold tracking-[-0.02em] text-primary">{arc.title}</h2>
          {arc.author && <p className="mt-1 text-[14px] text-tertiary">{arc.author}</p>}

          <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-3">
            <Stat n={`${p.done}`} k={p.done === p.total ? "steps" : `of ${p.total} steps`} />
            <Stat n={`${span.meetings}`} k={span.meetings === 1 ? "meeting" : "meetings"} />
            {weeks > 0 && span.from && span.to && <Stat n={`${weeks} wk`} k={`${fmt(span.from)} – ${fmt(span.to)}`} />}
            {kept.total > 0 && <Stat n={`${kept.kept} / ${kept.total}`} k="practices kept" />}
          </dl>

          <div className="mt-6 flex flex-col">
            {withTakeaways.length === 0 ? (
              <p className="border-t border-secondary pt-4 text-[13.5px] text-tertiary">
                No takeaways yet. At the end of each step, you each write one line here.
              </p>
            ) : (
              withTakeaways.map((step) => (
                <div key={step.id} className="grid gap-1.5 border-t border-secondary py-3.5 sm:grid-cols-[96px_1fr] sm:gap-4">
                  <span className="font-mono text-[12px] text-quaternary">{stepTag(arc, step)}</span>
                  <div className="flex flex-col gap-2">
                    {takeawaysFor(takeaways, step.id).map((t) => (
                      <p key={t.id} className="flex items-baseline gap-2.5 text-[14.5px] leading-[21px] text-primary">
                        <Avatar name={nameOf(t.by)} size={20} className="translate-y-[3px]" />
                        <span>{t.text}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex justify-end print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-primary px-3 text-[13px] font-semibold text-secondary hover:bg-secondary"
            >
              <Printer aria-hidden className="size-4" /> Print
            </button>
          </div>
        </div>
      </article>
    </Modal>
  );
}

function Stat({ n, k }: { n: string; k: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="sr-only">{k}</dt>
      <dd className="font-serif text-[22px] leading-none font-bold text-primary">{n}</dd>
      <span className="text-[12px] text-tertiary">{k}</span>
    </div>
  );
}
