import type { StrengthDomain } from "../types";
import { DOMAINS, DOMAIN_COLOR } from "../data/frameworks";

export function StrengthsDonut({
  counts,
  size = 110,
}: {
  counts: Record<StrengthDomain, number>;
  size?: number;
}) {
  const total = DOMAINS.reduce((sum, d) => sum + counts[d], 0);
  const stroke = size * 0.14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  let offset = 0;
  const segments = DOMAINS.map((d) => {
    const frac = total ? counts[d] / total : 0;
    const seg = { d, frac, dashOffset: -offset * c };
    offset += frac;
    return seg;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Strengths balance across domains"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-stone-200 dark:stroke-stone-800"
        />
        {segments.map(
          (s) =>
            s.frac > 0 && (
              <circle
                key={s.d}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={DOMAIN_COLOR[s.d]}
                strokeWidth={stroke}
                strokeDasharray={`${s.frac * c} ${c}`}
                strokeDashoffset={s.dashOffset}
                strokeLinecap="butt"
              />
            )
        )}
      </g>
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-stone-700 text-lg font-semibold dark:fill-stone-200"
      >
        {total}
      </text>
      <text
        x="50%"
        y="66%"
        textAnchor="middle"
        className="fill-stone-400 text-caption"
      >
        themes
      </text>
    </svg>
  );
}
