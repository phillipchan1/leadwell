import { cx } from "@/utils/cx";
import type { CoverageStat } from "./slots";
import { tagDotClass } from "./TagChip";
import type { LabTag } from "./types";

export function CoverageBar({
  stats,
  tags,
}: {
  stats: CoverageStat[];
  tags: LabTag[];
}) {
  if (!stats.length) return null;
  const byId = new Map(tags.map((t) => [t.id, t]));
  /*
   * One line, not four tiles. Coverage is a background check — "am I training
   * this team often enough" — and it was taking as much vertical space and
   * colour as the plan it was commenting on.
   */
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5">
      <span className="text-caption font-medium tracking-wide text-quaternary uppercase">
        Coverage
      </span>
      {stats.map((s) => {
        const tag = byId.get(s.tagId);
        return (
          <span
            key={s.tagId}
            className="inline-flex items-center gap-1.5 text-caption"
            title={`Target: at least 1 every ${s.everyN} occurrences`}
          >
            <span
              className={cx("size-1.5 shrink-0 rounded-full", tagDotClass(tag))}
              aria-hidden
            />
            <span className="text-quaternary">{s.label}</span>
            <span
              className={cx(
                "tabular-nums",
                s.thin
                  ? "font-medium text-amber-700 dark:text-amber-500"
                  : "text-quaternary opacity-70"
              )}
            >
              {s.filled}/{s.total}
            </span>
          </span>
        );
      })}
    </div>
  );
}
