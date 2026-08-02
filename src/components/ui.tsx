import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import {
  Dialog,
  Modal as SysModal,
  ModalOverlay,
} from "@/components/application/modals/modal";
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

/**
 * App modal on the design system's React Aria overlay: focus trap, scroll
 * lock, Escape and backdrop dismissal all come from the primitives. Render
 * conditionally (`{open && <Modal …>}`); `onClose` unmounts it.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size = "md",
  footer,
}: {
  title: string;
  /** Muted line under the title. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** md = forms (max-w-md); lg = wide working surfaces (max-w-3xl). */
  size?: "md" | "lg";
  /** Pinned action bar below the scrolling body. */
  footer?: ReactNode;
}) {
  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SysModal className={size === "lg" ? "max-w-3xl" : "max-w-md"}>
        <Dialog aria-label={title} className="flex max-h-[inherit] flex-col">
          <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {subtitle && (
                <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>
              )}
            </div>
            <ButtonUtility
              size="sm"
              color="tertiary"
              icon={X}
              tooltip="Close"
              onClick={onClose}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {children}
          </div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-6 py-4 dark:border-stone-800">
              {footer}
            </div>
          )}
        </Dialog>
      </SysModal>
    </ModalOverlay>
  );
}

