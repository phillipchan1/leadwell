import { useState } from "react";
import { Plus, Trash01 } from "@untitledui/icons";
import type { FixtureCadence, MeetingSubjectKind } from "../../types";
import { useStore } from "../../store/useStore";
import { CADENCE_LABEL, fixtureStatus, fixturesFor } from "../../lib/knowledge";
import { todayISO } from "../../lib/readiness";
import { SectionTitle } from "../ui";
import { cx } from "@/utils/cx";

const CADENCES = Object.keys(CADENCE_LABEL) as FixtureCadence[];

/**
 * The standing things a team does — Sunday setup, the monthly budget — with
 * who carries each and when it last came up. The wrap-up keeps "last talked
 * about" current; one gone quiet for longer than its cadence is flagged,
 * because that's the one to raise.
 *
 * `compact` is Run's version: read at a glance, nothing to edit mid-meeting.
 */
export function FixturesList({
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
  const fixtures = useStore((s) => s.fixtures);
  const people = useStore((s) => s.people);
  const addFixture = useStore((s) => s.addFixture);
  const updateFixture = useStore((s) => s.updateFixture);
  const deleteFixture = useStore((s) => s.deleteFixture);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [cadence, setCadence] = useState<FixtureCadence>("monthly");
  const today = todayISO();
  const mine = fixturesFor(fixtures, subjectKind, subjectId, people);

  if (compact && !mine.length) return null;

  return (
    <section className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        {compact ? <h3 className="eyebrow">Fixtures</h3> : <SectionTitle>Fixtures</SectionTitle>}
        {!compact && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
          >
            <Plus aria-hidden className="size-3.5" />
            Add
          </button>
        )}
      </div>
      {!compact && !mine.length && !adding && (
        <p className="text-[13px] text-tertiary">
          The standing things you do — Sunday setup, the monthly budget, vision night. The wrap-up
          after each meeting keeps track of when each last came up.
        </p>
      )}
      {mine.length > 0 && (
        <ul className={cx("flex flex-col", !compact && "divide-y divide-secondary rounded-[12px] border border-secondary")}>
          {mine.map((f) => {
            const status = fixtureStatus(f, today);
            const borrowed = f.subjectKind !== subjectKind || f.subjectId !== subjectId;
            return (
              <li key={f.id} className={cx("group/fx flex items-start gap-3", compact ? "py-1.5" : "px-3 py-2.5")}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={cx("font-medium", compact ? "text-[13.5px]" : "text-[14px]")}>{f.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-tertiary">
                    {f.owner && <span>{f.owner}</span>}
                    <span>{CADENCE_LABEL[f.cadence]}</span>
                    <span className={cx(status.quiet && "font-semibold text-cond-watch-ink")}>{status.label}</span>
                    {borrowed && <span className="text-quaternary">· on their team</span>}
                  </span>
                  {!compact && f.notes && <span className="text-[12.5px] text-secondary">{f.notes}</span>}
                </span>
                {!compact && (
                  <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/fx:opacity-100 focus-within:opacity-100 touch:opacity-100">
                    <button
                      type="button"
                      onClick={() => updateFixture(f.id, { lastTouchedOn: today })}
                      className="h-7 rounded-md px-2 text-[12px] font-semibold text-tertiary hover:bg-secondary hover:text-secondary"
                    >
                      Came up today
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${f.title}`}
                      onClick={() => deleteFixture(f.id)}
                      className="flex size-7 items-center justify-center rounded-md text-quaternary hover:bg-secondary hover:text-secondary"
                    >
                      <Trash01 className="size-3.5" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            addFixture(subjectKind, subjectId, title, { owner, cadence });
            setTitle("");
            setOwner("");
          }}
        >
          <input
            autoFocus
            aria-label="Fixture"
            placeholder="Sunday setup"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
            className="h-9 min-w-[12rem] flex-[2_1_12rem] rounded-[9px] border border-primary bg-primary px-3 text-[13.5px] outline-none focus:border-teal-400"
          />
          <input
            aria-label="Who carries it"
            placeholder="Who carries it"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="h-9 min-w-[8rem] flex-[1_1_8rem] rounded-[9px] border border-primary bg-primary px-3 text-[13.5px] outline-none focus:border-teal-400"
          />
          <select
            aria-label="How often"
            value={cadence}
            onChange={(e) => setCadence(e.target.value as FixtureCadence)}
            className="h-9 rounded-[9px] border border-primary bg-primary px-2.5 text-[13.5px]"
          >
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!title.trim()}
            className="h-9 rounded-[9px] bg-teal-600 px-3.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-teal-500 dark:text-stone-950"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="h-9 rounded-[9px] px-2.5 text-[13px] font-semibold text-tertiary hover:text-secondary"
          >
            Done
          </button>
        </form>
      )}
    </section>
  );
}
