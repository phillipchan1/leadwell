import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import {
  Dialog,
  Modal as SysModal,
  ModalOverlay,
} from "@/components/application/modals/modal";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";
import { useHistoryDismiss, useSwipeDismiss } from "@/hooks/use-sheet";
import { useDismiss } from "@/hooks/use-dismiss";
import { useOverlayGuard } from "@/hooks/use-shortcut";

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
  label,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  style?: CSSProperties;
  /** Accessible name when the card is clickable. */
  label?: string;
}) {
  /**
   * A clickable card is a button, and has to answer to a keyboard like one.
   *
   * Every node on the canvas is one of these. They had `onClick` and
   * `cursor-pointer` and nothing else — no role, no tabIndex, no key handler —
   * so on the app's most complex screen a keyboard user could move focus
   * around and select nothing. React Flow makes the *wrapper* focusable, but
   * Enter there never reached this div's handler.
   *
   * Space is preventDefault'd because on a `role="button"` it would otherwise
   * scroll the page as well as activate.
   */
  const interactive = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? label : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              // A key pressed inside a nested control (the hover-revealed X,
              // an inline field) belongs to that control, not to the card.
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              onClick?.();
            }
          : undefined
      }
      style={style}
      className={`rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${
        interactive
          ? "outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2 "
          : ""
      }${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-caption font-semibold tracking-widest text-stone-400 uppercase dark:text-stone-500">
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
  // "Remove" is destructive and used to sit 12px from "Edit". Push them to
  // opposite ends so a mis-tap lands on neither.
  return (
    <div className="flex items-center justify-between gap-6 border-t border-stone-100 pt-4 text-xs dark:border-stone-800">
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
  // Android's Back closes the sheet rather than leaving the app.
  useHistoryDismiss(onClose);
  /* Two different jobs, both needed.

     `useOverlayGuard` is a depth counter: page-level shortcuts stand down while
     a dialog has the screen, so `c` can't open a second "Add team" from inside
     the first one.

     `useDismiss` is the *ordering*. React Aria already handles Escape for a
     focused dialog and stops it propagating, so it rarely fires — but
     registering means an overlay is always the top of the dismiss stack while
     it's open, so the surface underneath can never take an Escape meant for
     this one. That is what the per-component guard lists used to be for. */
  useOverlayGuard();
  useDismiss(onClose);
  const { offset, dragging, handleProps } = useSwipeDismiss(onClose);

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SysModal
        className={size === "lg" ? "max-w-3xl" : "max-w-md"}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <Dialog aria-label={title} className="flex max-h-[inherit] flex-col">
          {/* Drag handle — the sheet presentation implies a swipe, so provide
              one. Hidden at sm and up where the modal is centred. */}
          <div
            {...handleProps}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing sm:hidden"
            aria-hidden="true"
          >
            <span className="h-1 w-9 rounded-full bg-stone-300 dark:bg-stone-600" />
          </div>
          <div className="flex items-start justify-between gap-3 px-6 pt-4 pb-4 sm:pt-6">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              {subtitle && (
                <p className="mt-0.5 text-xs text-quaternary">
                  {subtitle}
                </p>
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
          <div className="scroll-contain min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {children}
          </div>
          {footer && (
            /* Sticky so the keyboard can never push the primary action off
               screen, and padded past the home indicator. */
            <div className="pad-safe-bottom flex shrink-0 items-center justify-end gap-2 border-t border-secondary bg-primary px-6 py-4 [--pad-safe-bottom:1rem]">
              {footer}
            </div>
          )}
          {!footer && <div className="pad-safe-bottom shrink-0" />}
        </Dialog>
      </SysModal>
    </ModalOverlay>
  );
}

