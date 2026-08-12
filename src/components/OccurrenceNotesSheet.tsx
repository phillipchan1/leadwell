import type { ReactNode } from "react";
import {
  Dialog,
  Modal as SysModal,
  ModalOverlay,
} from "@/components/application/modals/modal";
import { useHistoryDismiss, useSwipeDismiss } from "@/hooks/use-sheet";
import { cx } from "@/utils/cx";

/**
 * Full-screen notes on phones; a right-side drawer on larger screens when
 * there is no board to split against (e.g. History tab).
 */
export function OccurrenceNotesSheet({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  useHistoryDismiss(onClose, open);
  const { offset, dragging, handleProps } = useSwipeDismiss(onClose);

  if (!open) return null;

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      className="!items-stretch !justify-end !bg-black/30 !p-0 sm:!items-stretch sm:!justify-end sm:!px-0 sm:!py-0"
    >
      <SysModal
        className={cx(
          "flex h-dvh max-h-dvh w-full flex-col overflow-hidden rounded-none sm:max-w-[min(42vw,28rem)] sm:rounded-none sm:shadow-2xl"
        )}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          transition: dragging
            ? "none"
            : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <Dialog aria-label={label} className="flex max-h-[inherit] flex-col">
          <div
            {...handleProps}
            className="flex shrink-0 cursor-grab touch-none justify-center pt-2.5 pb-1 active:cursor-grabbing sm:hidden"
            aria-hidden="true"
          >
            <span className="h-1 w-9 rounded-full bg-stone-300 dark:bg-stone-600" />
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </Dialog>
      </SysModal>
    </ModalOverlay>
  );
}
