import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";

/**
 * Pill badge tinted by an arbitrary runtime color (domain and capacity colors
 * are user data, so the token-based design-system Badge can't render them).
 * Geometry mirrors the system Badge's sm pill-with-dot.
 */
export function TintBadge({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
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
      <Button size="sm" color="link-gray" onClick={onEdit}>
        Edit
      </Button>
      <Button size="sm" color="link-destructive" onClick={onRemove}>
        Remove
      </Button>
    </div>
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
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={X}
            tooltip="Close"
            onClick={onClose}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

