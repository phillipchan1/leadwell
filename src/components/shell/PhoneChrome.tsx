import { useState } from "react";
import { Moon01, Settings01, Sun, User01 } from "@untitledui/icons";
import { useStore } from "@/store/useStore";
import { useMenu } from "@/hooks/use-menu";
import { Mark } from "@/components/brand/glyphs";
import { cx } from "@/utils/cx";
import { ScopeMenu } from "./ScopeMenu";
import { MenuItem } from "./Sidebar";
import { LivePill } from "../LivePill";
import { PLACES, PlusIcon, SearchIcon, lastPeopleTab, placeOf } from "./places";

/**
 * The phone's top row: the mark, the life-area scope and search. Everything
 * else that used to crowd a header lives behind your avatar.
 */
export function PhoneHeader() {
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const syncStatus = useStore((s) => s.syncStatus);
  const me = useStore((s) => s.me);
  const dark = useStore((s) => s.dark);
  const toggleDark = useStore((s) => s.toggleDark);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const openMe = useStore((s) => s.openMe);
  const [open, setOpen] = useState(false);
  const { triggerProps, menuProps, close } = useMenu(open, setOpen);

  const initials =
    me.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "Me";

  return (
    <header className="pad-safe-top pad-safe-x chrome-compact relative flex shrink-0 items-center gap-2.5 bg-secondary py-2 [--pad-safe-top:0.5rem] [--pad-safe-x:1rem] lg:hidden">
      <Mark size={30} />
      <div className="min-w-0 max-w-[12rem]">
        <ScopeMenu tone="paper" />
      </div>
      <span className="flex-1" />
      <button
        type="button"
        aria-label="Search"
        onClick={() => setPaletteOpen(true)}
        className="flex size-11 items-center justify-center rounded-full text-secondary active:bg-tertiary"
      >
        <SearchIcon className="size-5" />
      </button>
      <button
        {...triggerProps}
        type="button"
        aria-label="You, settings and theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-11 items-center justify-center rounded-full"
      >
        {me.photo ? (
          <img src={me.photo} alt="" className="size-8 rounded-full object-cover" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-leather font-serif text-[13px] text-leather-fg">
            {initials}
          </span>
        )}
        {syncStatus !== "idle" && (
          <span
            className={cx(
              "absolute top-1.5 right-1.5 size-2.5 rounded-full border-2 border-[var(--color-bg-secondary)]",
              syncStatus === "error" ? "bg-gilt" : "animate-pulse bg-stone-400"
            )}
            aria-hidden="true"
          />
        )}
      </button>
      {open && (
        <div
          {...menuProps}
          role="menu"
          aria-label="You, settings and theme"
          className="absolute top-full right-3 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-secondary bg-primary py-1 text-primary shadow-xl"
        >
          <MenuItem
            icon={User01}
            label="Your profile"
            onSelect={() => {
              close(false);
              openMe();
            }}
          />
          <MenuItem
            icon={dark ? Sun : Moon01}
            label={dark ? "Light mode" : "Dark mode"}
            onSelect={() => {
              close(false);
              toggleDark();
            }}
          />
          <MenuItem
            icon={Settings01}
            label="Settings"
            onSelect={() => {
              close(false);
              setSettingsOpen(true);
            }}
          />
        </div>
      )}
    </header>
  );
}

/**
 * The phone's tab bar, in leather like the sidebar it stands in for. Four
 * places and the gilt Capture in the thumb's resting spot. Ideas is reached
 * from Today and from Capture itself, which is how a thought gets there anyway.
 */
export function PhoneTabBar() {
  const tab = useStore((s) => s.tab);
  const focused = useStore((s) => s.focused);
  const go = useStore((s) => s.goToTab);
  const openModal = useStore((s) => s.openModal);
  const active = placeOf(tab);

  const places = PLACES.filter((p) => p.id !== "ideas");
  const left = places.slice(0, 2);
  const right = places.slice(2);

  const item = (p: (typeof PLACES)[number]) => {
    const isActive = active.id === p.id && !focused;
    const target = p.id === "people" ? lastPeopleTab() : p.tab;
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => go(target)}
        aria-current={isActive ? "page" : undefined}
        className={cx(
          "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
          isActive ? "font-semibold text-leather-fg" : "font-medium text-leather-ink"
        )}
      >
        <span
          className={cx(
            "size-[22px]",
            p.id === "prayer" ? "text-vesper-glow" : isActive ? "text-leather-fg" : ""
          )}
        >
          {p.icon({ className: "size-[22px]", active: isActive })}
        </span>
        <span className="chrome-compact-hide">{p.label}</span>
      </button>
    );
  };

  return (
    <>
      {/* Sits on the tab bar, so the meeting you stepped out of is a thumb away. */}
      <LivePill tone="phone" />
      <nav
        aria-label="Primary"
        className="pad-safe-bottom chrome-compact z-30 flex shrink-0 items-center bg-leather px-2 pt-1.5 [--pad-safe-bottom:0.375rem] lg:hidden"
      >
        {left.map(item)}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Capture"
            onClick={() => openModal({ kind: "capture" })}
            className="flex size-[52px] items-center justify-center rounded-[18px] bg-leather-fg text-stone-950 shadow-[0_8px_18px_-6px_rgba(0,0,0,0.45)] active:scale-95"
          >
            <PlusIcon className="size-6" />
          </button>
        </div>
        {right.map(item)}
      </nav>
    </>
  );
}
