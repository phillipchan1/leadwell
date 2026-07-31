import { useEffect, type CSSProperties, type ReactNode } from "react";

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
      style={{ backgroundColor: color + "1f", color }}
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
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
        : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300";
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs ${cls}`}>
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  color = "#0D9488",
  className = "",
}: {
  value: number; // 0–100
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800 ${className}`}
    >
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.round(value)}%`, backgroundColor: color }}
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
    <div
      onClick={onClick}
      style={style}
      className={`rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
      {children}
    </h3>
  );
}

/** De-emphasized Edit / Remove links for entity profile tabs. */
export function ProfileAdminLinks({
  onEdit,
  onRemove,
}: {
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-4 text-xs dark:border-stone-800">
      <button
        type="button"
        onClick={onEdit}
        className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-stone-400 hover:text-red-500"
      >
        Remove
      </button>
    </div>
  );
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
      className={`rounded-md p-1 text-stone-400 transition-colors ${
        danger
          ? "hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          : "hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
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
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="max-h-[min(90vh,720px)] w-full max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl dark:border-stone-800 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Default form control — soft fill, teal focus glow (see `.field-input` in CSS). */
export const inputCls = "field-input";

/** Dense filters / inline editors. */
export const inputSmCls = "field-input field-input--sm";

/** Borderless table / inline cells. */
export const inputGhostCls = "field-input field-input--ghost";

export const fieldLabelCls = "field-label";

export const buttonPrimaryCls =
  "rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-teal-600/20 transition-[transform,background-color,box-shadow] duration-150 ease-out hover:bg-teal-700 hover:shadow-md hover:shadow-teal-600/25 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:active:scale-100";

export const buttonGhostCls =
  "rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-600 transition-[transform,background-color,border-color] duration-150 ease-out hover:border-stone-400 hover:bg-stone-100 active:scale-[0.98] dark:border-stone-700 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:bg-stone-800 disabled:opacity-50 disabled:active:scale-100";
