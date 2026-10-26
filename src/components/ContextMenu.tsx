import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * A right-click menu.
 *
 * `useMenu` covers the anchored dropdowns that hang off a button; this is the
 * other kind — it opens where the pointer is, on something that has no button
 * to hang from. It keeps the same keyboard contract (↑/↓, Home/End, Esc, Tab
 * out) and adds the one a nested menu needs: → opens a submenu, ← goes back.
 *
 * It is a portal and positions itself in viewport coordinates, because the
 * things it opens on live inside scrollers that would otherwise clip it. It
 * flips up near the bottom edge and left near the right, like a native one.
 */

export type MenuEntry =
  | {
      type: "item";
      label: string;
      onSelect: () => void;
      icon?: ReactNode;
      /** Shortcut, shown at the right edge. */
      hint?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Turns the item into a radio: ticked when true, and says so to a screen reader. */
      checked?: boolean;
    }
  | { type: "submenu"; label: string; entries: MenuEntry[]; icon?: ReactNode }
  | { type: "heading"; label: string }
  | { type: "separator" };

export type ContextMenuProps = {
  /** Viewport coordinates of the click. */
  x: number;
  y: number;
  /** What the menu is for, spoken when it opens: `"Actions for 3 topics"`. */
  label: string;
  entries: MenuEntry[];
  /** Opened from the keyboard — land on the first item and give focus back on close. */
  fromKeyboard?: boolean;
  onClose: () => void;
};

const EDGE = 8;
const ITEM = "[data-menu-item]";

function itemsOf(panel: HTMLElement | null): HTMLElement[] {
  if (!panel) return [];
  return [...panel.querySelectorAll<HTMLElement>(ITEM)].filter(
    (el) => el.closest('[role="menu"]') === panel && !el.hasAttribute("disabled")
  );
}

export function ContextMenu({
  x,
  y,
  label,
  entries,
  fromKeyboard = false,
  onClose,
}: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: x, top: y });

  // Measure before paint so it never flashes at the raw click position.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE));
    const top =
      y + height + EDGE > window.innerHeight ? Math.max(EDGE, y - height) : y;
    setAt({ left, top });
  }, [x, y]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const root = rootRef.current;
    // A pointer-opened menu takes focus itself, so the arrow keys work without
    // painting a highlight on an item nobody pointed at.
    (fromKeyboard ? itemsOf(root)[0] : root)?.focus({ preventScroll: true });
    return () => {
      if (fromKeyboard && opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [fromKeyboard]);

  useEffect(() => {
    const inside = (target: EventTarget | null) =>
      Boolean(rootRef.current?.contains(target as Node));
    const onDown = (e: PointerEvent) => {
      if (!inside(e.target)) onClose();
    };
    // A menu left hanging over a page that has moved on is worse than none.
    const onScroll = (e: Event) => {
      if (!inside(e.target)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const active = document.activeElement as HTMLElement | null;
    const panel =
      (active?.closest('[role="menu"]') as HTMLElement | null) ?? rootRef.current;
    const list = itemsOf(panel);
    const index = active ? list.indexOf(active) : -1;
    const go = (el?: HTMLElement) => {
      e.preventDefault();
      el?.focus({ preventScroll: false });
    };

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      case "Tab":
        onClose();
        return;
      case "ArrowDown":
        return go(list[(index + 1) % list.length]);
      case "ArrowUp":
        return go(list[index <= 0 ? list.length - 1 : index - 1]);
      case "Home":
        return go(list[0]);
      case "End":
        return go(list[list.length - 1]);
      case "ArrowRight":
        if (active?.getAttribute("aria-haspopup") === "menu") {
          e.preventDefault();
          active.click();
        }
        return;
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      // Arrow keys belong to the menu while it is open, not to the page behind.
      data-keyboard-owner="true"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={at}
      className="fixed z-[60] w-60 rounded-xl border border-secondary bg-primary py-1 text-primary shadow-xl outline-none"
    >
      <Entries entries={entries} onClose={onClose} />
    </div>,
    document.body
  );
}

function Entries({
  entries,
  onClose,
}: {
  entries: MenuEntry[];
  onClose: () => void;
}) {
  // One flyout at a time; hovering anything else folds it away.
  const [openSub, setOpenSub] = useState<{ index: number; focus: boolean } | null>(null);

  return (
    <>
      {entries.map((entry, i) => {
        switch (entry.type) {
          case "separator":
            return <div key={i} role="separator" className="my-1 border-t border-secondary" />;
          case "heading":
            return (
              <div key={i} role="presentation" className="eyebrow px-3 pt-2 pb-1">
                {entry.label}
              </div>
            );
          case "submenu":
            return (
              <SubmenuRow
                key={i}
                entry={entry}
                open={openSub?.index === i}
                focusFirst={openSub?.index === i && openSub.focus}
                onOpen={(focus) => setOpenSub({ index: i, focus })}
                onFold={() => setOpenSub(null)}
                onClose={onClose}
              />
            );
          default:
            return (
              <ItemRow
                key={i}
                entry={entry}
                onHover={() => setOpenSub(null)}
                onClose={onClose}
              />
            );
        }
      })}
    </>
  );
}

const ROW =
  "flex min-h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] leading-5 outline-none";

function ItemRow({
  entry,
  onHover,
  onClose,
}: {
  entry: Extract<MenuEntry, { type: "item" }>;
  onHover: () => void;
  onClose: () => void;
}) {
  const radio = entry.checked !== undefined;
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitem"}
      aria-checked={radio ? entry.checked : undefined}
      data-menu-item
      disabled={entry.disabled}
      onPointerEnter={(e) => {
        onHover();
        // Hover and keyboard focus are one highlight, as in a native menu.
        e.currentTarget.focus({ preventScroll: true });
      }}
      onClick={() => {
        onClose();
        entry.onSelect();
      }}
      className={cx(
        ROW,
        "disabled:cursor-default disabled:opacity-50",
        entry.danger
          ? "text-cond-critical-ink focus:bg-cond-critical-soft"
          : "focus:bg-secondary"
      )}
    >
      <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-quaternary">
        {entry.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.checked ? (
        <Check aria-hidden className="size-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
      ) : entry.hint ? (
        <span aria-hidden className="shrink-0 font-mono text-[11px] text-quaternary">
          {entry.hint}
        </span>
      ) : null}
    </button>
  );
}

function SubmenuRow({
  entry,
  open,
  focusFirst,
  onOpen,
  onFold,
  onClose,
}: {
  entry: Extract<MenuEntry, { type: "submenu" }>;
  open: boolean;
  focusFirst: boolean;
  onOpen: (focus: boolean) => void;
  onFold: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        data-menu-item
        onPointerEnter={(e) => {
          e.currentTarget.focus({ preventScroll: true });
          onOpen(false);
        }}
        onClick={() => onOpen(true)}
        className={cx(ROW, "focus:bg-secondary", open && "bg-secondary")}
      >
        <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-quaternary">
          {entry.icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <ChevronRight aria-hidden className="size-3.5 shrink-0 text-quaternary" />
      </button>
      {open && (
        <Flyout
          anchor={ref}
          label={entry.label}
          entries={entry.entries}
          focusFirst={focusFirst}
          onBack={() => {
            onFold();
            ref.current?.focus();
          }}
          onClose={onClose}
        />
      )}
    </>
  );
}

function Flyout({
  anchor,
  label,
  entries,
  focusFirst,
  onBack,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>;
  label: string;
  entries: MenuEntry[];
  focusFirst: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const row = anchor.current;
    if (!el || !row) return;
    const r = row.getBoundingClientRect();
    const { width, height } = el.getBoundingClientRect();
    // Tucked 2px under the parent so the pointer never crosses a dead gap
    // on its way across, which would fold the flyout away.
    const right = r.right - 2;
    const left =
      right + width + EDGE <= window.innerWidth
        ? right
        : Math.max(EDGE, r.left - width + 2);
    const top = Math.max(EDGE, Math.min(r.top - 4, window.innerHeight - height - EDGE));
    setAt({ left, top });
  }, [anchor]);

  // Not before it has a position: until then it is `visibility: hidden`, and
  // a hidden element silently refuses focus.
  useEffect(() => {
    if (focusFirst && at) itemsOf(ref.current)[0]?.focus();
  }, [focusFirst, at]);

  // Scrolled back to the ticked item, so a long list opens where you are.
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[aria-checked="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft") return;
        e.preventDefault();
        e.stopPropagation();
        onBack();
      }}
      style={at ?? { left: 0, top: 0, visibility: "hidden" }}
      className="fixed z-[61] max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto overscroll-contain rounded-xl border border-secondary bg-primary py-1 shadow-xl"
    >
      <Entries entries={entries} onClose={onClose} />
    </div>
  );
}
