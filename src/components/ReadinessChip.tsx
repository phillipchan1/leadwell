import type { Readiness } from "../lib/readiness";
import { STATE_COLOR, STATE_LABEL } from "../lib/readiness";

/**
 * The readiness state as a mono, tabular pill — tinted by the state's color
 * (a fixed app palette, rendered inline like TintBadge). The dot goes hollow
 * for "drifting": tracked, but the rhythm has slipped.
 */
export function ReadinessChip({
  state,
  text,
  title,
  dot = true,
}: {
  state: Readiness["state"];
  text: string;
  title?: string;
  dot?: boolean;
}) {
  const color = STATE_COLOR[state];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
      style={{ backgroundColor: color + "1f", color }}
      title={title ?? STATE_LABEL[state]}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: state === "drifting" ? "transparent" : color,
            boxShadow:
              state === "drifting" ? `inset 0 0 0 1.5px ${color}` : undefined,
          }}
        />
      )}
      {text}
    </span>
  );
}
