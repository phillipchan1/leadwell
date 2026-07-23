import { useEffect, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { dateTone, fmtDate } from "../lib/oneOnOne";

/* ── Icons — inline SVG, stroke-based, inherit currentColor ── */

function icon(paths: ReactNode) {
  return function Icon({
    size = 16,
    strokeWidth = 1.75,
    ...rest
  }: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const IconSparkle = icon(
  <path d="M12 3l1.9 5.4a2 2 0 0 0 1.2 1.2L20.5 11.5l-5.4 1.9a2 2 0 0 0-1.2 1.2L12 20l-1.9-5.4a2 2 0 0 0-1.2-1.2L3.5 11.5l5.4-1.9a2 2 0 0 0 1.2-1.2L12 3z" />
);
export const IconGear = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10 4.09V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56h.08a1.7 1.7 0 0 0 1.79-.4l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08A1.7 1.7 0 0 0 20.91 10H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
  </>
);
export const IconSun = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </>
);
export const IconMoon = icon(
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
);
export const IconX = icon(<path d="M18 6L6 18M6 6l12 12" />);
export const IconPlus = icon(<path d="M12 5v14M5 12h14" />);
export const IconPencil = icon(
  <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
);
export const IconTrash = icon(
  <>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </>
);
export const IconChevronLeft = icon(<path d="M15 18l-6-6 6-6" />);
export const IconChevronRight = icon(<path d="M9 18l6-6-6-6" />);
export const IconChevronDown = icon(<path d="M6 9l6 6 6-6" />);
export const IconArrowLeft = icon(<path d="M19 12H5M12 19l-7-7 7-7" />);
export const IconBranch = icon(
  <path d="M6 3v12a3 3 0 0 0 3 3h9M14 14l4 4-4 4" />
);
export const IconMic = icon(
  <>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
  </>
);
export const IconSend = icon(<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />);
export const IconHelp = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </>
);

/* ── Keyboard + date primitives ── */

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/**
 * A next-1:1 (or any upcoming) date with urgency built in:
 * overdue = amber, today = accent, otherwise quiet.
 */
export function DueDate({
  iso,
  prefix = "",
  className = "",
}: {
  iso: string;
  prefix?: string;
  className?: string;
}) {
  const tone = dateTone(iso);
  const toneCls =
    tone === "overdue"
      ? "font-medium text-amber-700 dark:text-amber-400"
      : tone === "today"
        ? "font-medium text-accent-ink"
        : "";
  return (
    <span className={`${toneCls} ${className}`}>
      {prefix}
      {fmtDate(iso)}
      {tone === "overdue" ? " · overdue" : tone === "today" ? " · today" : ""}
    </span>
  );
}

/* ── Primitives ── */

export function Badge({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: color + "1a",
        color,
        boxShadow: `inset 0 0 0 1px ${color}2e`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "positive" | "warning" | "neutral";
}) {
  const cls =
    tone === "positive"
      ? "bg-emerald-600/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300"
      : tone === "warning"
        ? "bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300"
        : "bg-surface-2 text-ink-2 ring-line";
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  color,
  className = "",
}: {
  value: number; // 0–100
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-2 ${className}`}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{
          width: `${Math.round(value)}%`,
          backgroundColor: color ?? "var(--lw-accent)",
        }}
      />
    </div>
  );
}

export function Card({
  children,
  className = "",
  onClick,
  style,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  return (
    <div onClick={onClick} style={style} className={`card ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="label-caps">{children}</h3>;
}

export function IconButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`rounded-md p-1 text-ink-3 transition-colors ${
        danger
          ? "hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
          : "hover:bg-surface-2 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`anim-pop w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-line bg-surface p-5`}
        style={{ boxShadow: "var(--lw-shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Close" className="btn-icon">
            <IconX size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputCls = "input";

export const buttonPrimaryCls = "btn-primary";

export const buttonGhostCls = "btn-ghost";
