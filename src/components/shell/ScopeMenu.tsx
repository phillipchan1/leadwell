import { useState } from "react";
import { useStore } from "@/store/useStore";
import { useMenu } from "@/hooks/use-menu";
import { useShortcut } from "@/hooks/use-shortcut";
import { SHIFT_DIGIT_CHORDS } from "@/lib/keys";
import { cx } from "@/utils/cx";
import { ChevronDownIcon } from "./places";

/**
 * Life area scope: All of life, or one of Day job, Church, Family, Community.
 *
 * It used to be a row of chips on the canvas, so it only scoped the canvas.
 * Up here it scopes every place at once — Today, People, Meetings, Prayer —
 * which is what "I'm in church mode tonight" actually means.
 */
export function ScopeMenu({ tone }: { tone: "leather" | "paper" }) {
  const domains = useStore((s) => s.domains);
  const scopeId = useStore((s) => s.treeDomainId);
  const setScope = useStore((s) => s.setTreeDomainId);
  const openModal = useStore((s) => s.openModal);
  const [open, setOpen] = useState(false);
  const { triggerProps, menuProps, close } = useMenu(open, setOpen);

  const current = domains.find((d) => d.id === scopeId) ?? null;

  const pick = (id: string | null) => {
    setScope(id);
    close();
  };

  return (
    <div className="relative">
      <button
        {...triggerProps}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex w-full items-center gap-2 text-left text-[13px] font-medium transition-colors",
          tone === "leather"
            ? "h-9 rounded-[9px] border border-leather-line px-2.5 text-leather-fg hover:bg-leather-hi"
            : "h-9 rounded-full border border-secondary bg-primary px-3 text-primary"
        )}
      >
        {current ? (
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: current.color }}
            aria-hidden="true"
          />
        ) : (
          <span className="grid shrink-0 grid-cols-2 gap-[2px]" aria-hidden="true">
            {domains.slice(0, 4).map((d) => (
              <span
                key={d.id}
                className="size-1.5 rounded-[1.5px]"
                style={{ backgroundColor: d.color }}
              />
            ))}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="sr-only">Life area: </span>
          {current?.name ?? "All of life"}
        </span>
        <ChevronDownIcon
          className={cx(
            "size-3.5 shrink-0",
            tone === "leather" ? "text-leather-ink" : "text-quaternary"
          )}
        />
      </button>

      {open && (
        <div
          {...menuProps}
          role="menu"
          aria-label="Life area"
          className={cx(
            "absolute z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-secondary bg-primary py-1 text-primary shadow-xl",
            tone === "leather" ? "left-0" : "left-0"
          )}
        >
          <ScopeItem
            label="All of life"
            hint="⇧1"
            active={!scopeId}
            onSelect={() => pick(null)}
          />
          {domains.map((d, i) => (
            <ScopeItem
              key={d.id}
              label={d.name}
              color={d.color}
              hint={i < 8 ? `⇧${i + 2}` : undefined}
              active={scopeId === d.id}
              onSelect={() => pick(d.id)}
            />
          ))}
          <div className="my-1 border-t border-secondary" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              close(false);
              openModal({ kind: "domains" });
            }}
            className="flex min-h-10 w-full items-center px-3.5 text-left text-[13px] text-tertiary hover:bg-secondary touch:min-h-11"
          >
            Manage life areas
          </button>
        </div>
      )}
    </div>
  );
}

function ScopeItem({
  label,
  color,
  hint,
  active,
  onSelect,
}: {
  label: string;
  color?: string;
  hint?: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={cx(
        "flex min-h-10 w-full items-center gap-2.5 px-3.5 text-left text-[13.5px] hover:bg-secondary touch:min-h-11",
        active && "font-semibold"
      )}
    >
      <span
        className={cx("size-2.5 shrink-0 rounded-[2px]", !color && "border border-primary")}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden="true"
      />
      <span className="flex-1">{label}</span>
      {hint && <span className="font-mono text-caption text-quaternary">{hint}</span>}
    </button>
  );
}

/**
 * ⇧1 is All of life, ⇧2–⇧9 the life areas in order. Registered once, from the
 * shell, so the scope can change from any page — not just while the canvas is
 * mounted, which is where these used to live.
 */
export function useScopeShortcuts() {
  const domains = useStore((s) => s.domains);
  const setScope = useStore((s) => s.setTreeDomainId);
  useShortcut(
    (e) => {
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (!digit) return;
      const options: (string | null)[] = [null, ...domains.map((d) => d.id)];
      const id = options[Number(digit[1]) - 1];
      if (id !== undefined) setScope(id);
    },
    {
      chord: SHIFT_DIGIT_CHORDS,
      keysLabel: "⇧1–⇧9",
      label: "Scope to a life area — ⇧1 is All of life",
      group: "Global",
    }
  );
}
