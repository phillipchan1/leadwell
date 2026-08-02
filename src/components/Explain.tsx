import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/utils/cx";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

/**
 * Makes an explanation reachable without a mouse.
 *
 * `title` only ever appears on hover, so on a phone roughly forty explanations
 * — what a health level means, why something is drifting, which domain a dot
 * stands for — were simply unreadable. On a fine pointer this keeps the native
 * tooltip; on a coarse one the element becomes a button that toggles a small
 * popover with the same text.
 */
export function Explain({
  text,
  children,
  className,
  as = "span",
}: {
  /** The explanation. Nothing renders as interactive when this is empty. */
  text?: string;
  children: React.ReactNode;
  className?: string;
  as?: "span" | "div";
}) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Wrapper = as;

  if (!text) {
    return <Wrapper className={className}>{children}</Wrapper>;
  }

  if (!coarse) {
    return (
      <Wrapper className={className} title={text}>
        {children}
      </Wrapper>
    );
  }

  return (
    <Wrapper
      ref={wrapRef as never}
      className={cx("relative inline-flex", className)}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          // These sit inside clickable rows and cards; explaining a value
          // should never also navigate.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex cursor-help items-center text-left"
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-full left-0 z-50 mt-1 w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs leading-snug font-normal text-white normal-case shadow-lg dark:bg-stone-700"
        >
          {text}
        </span>
      )}
    </Wrapper>
  );
}
