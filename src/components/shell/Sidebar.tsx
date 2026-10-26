import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Keyboard01, Moon01, Settings01, Sun } from "@untitledui/icons";
import { useStore } from "@/store/useStore";
import type { Tab } from "@/lib/routes";
import { routePath } from "@/lib/routes";
import { loadRecents, recordRecent } from "@/lib/recents";
import { MOD_LABEL } from "@/lib/keys";
import { useMenu } from "@/hooks/use-menu";
import { healthColorOf } from "./health-dot";
import { Mark, Wordmark } from "@/components/brand/glyphs";
import { cx } from "@/utils/cx";
import { MeetingsList } from "./MeetingsList";
import { ScopeMenu } from "./ScopeMenu";
import { PLACES, PlusIcon, SearchIcon, lastPeopleTab, placeOf } from "./places";

/**
 * The leather that frames the app on a desktop: the mark, life-area scope,
 * search and capture, the five places, the people you were just with, and
 * you. It replaces the header and the tab strip, which between them used to
 * spend two rows of every screen on navigation.
 */
export function Sidebar({
  badges,
}: {
  /** Counts that are waiting on you, keyed by place. Absent = nothing waiting. */
  badges: Partial<Record<string, number>>;
}) {
  const tab = useStore((s) => s.tab);
  const focused = useStore((s) => s.focused);
  const setTab = useStore((s) => s.setTab);
  const clearSelection = useStore((s) => s.clearSelection);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const openModal = useStore((s) => s.openModal);
  const active = placeOf(tab);

  const goPlace = (target: Tab) => {
    clearSelection();
    setTab(target);
  };

  return (
    <nav
      aria-label="Primary"
      className="pad-safe-top flex w-[232px] shrink-0 flex-col gap-3.5 overflow-y-auto bg-leather px-3 pb-3 text-leather-ink [--pad-safe-top:1.125rem] max-lg:hidden"
    >
      <a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          goPlace("today");
        }}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-0.5 text-[19px] text-leather-fg"
        aria-label="LeadWell, go to Today"
      >
        <Mark size={28} />
        <Wordmark />
      </a>

      <ScopeMenu tone="leather" />

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 flex-1 items-center gap-2 rounded-[9px] bg-leather-hi px-2.5 text-[13px] text-leather-ink transition-colors hover:text-leather-fg"
        >
          <SearchIcon className="size-[15px]" />
          Search
          <kbd className="ml-auto font-mono text-[11px]">{MOD_LABEL}K</kbd>
        </button>
        <button
          type="button"
          aria-label="Capture (C)"
          title="Capture (C)"
          onClick={() => openModal({ kind: "capture" })}
          className="flex size-9 items-center justify-center rounded-[9px] bg-gilt text-[#013133] transition-transform hover:brightness-105 active:scale-95"
        >
          <PlusIcon className="size-4" />
        </button>
      </div>

      <ul className="flex flex-col gap-0.5">
        {PLACES.map((p) => {
          const isActive = active.id === p.id && !focused;
          const count = badges[p.id];
          const target = p.id === "people" ? lastPeopleTab() : p.tab;
          return (
            <li key={p.id}>
              <a
                href={routePath({ view: "tab", tab: target, peek: null })}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  goPlace(target);
                }}
                className={cx(
                  "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
                  isActive
                    ? "bg-leather-hi font-semibold text-leather-fg"
                    : "font-medium text-leather-ink hover:bg-leather-hi/60 hover:text-leather-fg"
                )}
              >
                <span
                  className={cx(
                    "size-[17px] shrink-0",
                    isActive ? (p.id === "prayer" ? "text-vesper-glow" : "text-gilt") : p.id === "prayer" ? "text-vesper-glow" : ""
                  )}
                >
                  {p.icon({ className: "size-[17px]", active: isActive })}
                </span>
                {p.label}
                {count ? (
                  <span
                    className={cx(
                      "ml-auto font-mono text-[11px]",
                      p.id === "ideas" ? "text-leather-ink" : "text-gilt"
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>

      <MeetingsList onAll={() => goPlace("meetings")} />

      <RecentList />

      <MeRow />
    </nav>
  );
}

// ── Recent ─────────────────────────────────────────────────────────────────

const RECENT_KINDS = ["person", "team", "manager"] as const;
type RecentKind = (typeof RECENT_KINDS)[number];

/**
 * The people and teams you were just with, set in the serif like every name,
 * each with its health as a dot. Recorded as you open them from anywhere, so
 * the list is simply where you've been.
 */
function RecentList() {
  const userId = useStore((s) => s.userId);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const domains = useStore((s) => s.domains);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectedTeamId = useStore((s) => s.selectedTeamId);
  const selectedManagerId = useStore((s) => s.selectedManagerId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);
  const [ids, setIds] = useState<string[]>(() => loadRecents(userId));

  // A person outranks their team, the same rule the URL uses.
  const opened = selectedPersonId
    ? `person:${selectedPersonId}`
    : selectedManagerId
      ? `manager:${selectedManagerId}`
      : selectedTeamId
        ? `team:${selectedTeamId}`
        : null;

  useEffect(() => {
    if (opened) setIds(recordRecent(userId, opened));
  }, [opened, userId]);

  const rows = useMemo(() => {
    const out: {
      key: string;
      kind: RecentKind;
      id: string;
      name: string;
      dot: string | null;
      square: string | null;
    }[] = [];
    for (const key of ids) {
      const [kind, id] = key.split(":") as [RecentKind, string];
      if (!RECENT_KINDS.includes(kind)) continue;
      if (kind === "person") {
        const p = people.find((x) => x.id === id);
        if (p) out.push({ key, kind, id, name: p.name, dot: healthColorOf(p.health), square: null });
      } else if (kind === "team") {
        const t = teams.find((x) => x.id === id);
        if (t)
          out.push({
            key,
            kind,
            id,
            name: t.name,
            dot: null,
            square: domains.find((d) => d.id === t.domainId)?.color ?? null,
          });
      } else {
        const m = managers.find((x) => x.id === id);
        if (m) out.push({ key, kind, id, name: m.name, dot: null, square: null });
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [ids, people, teams, managers, domains]);

  if (!rows.length) return null;

  return (
    <div className="flex flex-col gap-0.5 border-t border-leather-line pt-2">
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.08em] text-leather-mute uppercase">
        Recent
      </div>
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() =>
            r.kind === "person"
              ? selectPerson(r.id)
              : r.kind === "team"
                ? selectTeam(r.id)
                : selectManager(r.id)
          }
          className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left font-serif text-[15px] text-leather-ink transition-colors hover:bg-leather-hi/60 hover:text-leather-fg"
        >
          <span
            className={cx("size-2 shrink-0", r.square ? "rounded-[2px]" : "rounded-full")}
            style={{ backgroundColor: r.square ?? r.dot ?? "transparent", boxShadow: !r.square && !r.dot ? "inset 0 0 0 1px #5d7674" : undefined }}
            aria-hidden="true"
          />
          <span className="truncate">{r.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── You ────────────────────────────────────────────────────────────────────

const SYNC_LABEL = {
  idle: "Synced",
  saving: "Saving…",
  error: "Not saved — retrying",
} as const;

/** Your profile, settings, theme and sync, in the one place they belong. */
function MeRow() {
  const me = useStore((s) => s.me);
  const syncStatus = useStore((s) => s.syncStatus);
  const dark = useStore((s) => s.dark);
  const toggleDark = useStore((s) => s.toggleDark);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const [open, setOpen] = useState(false);
  const { triggerProps, menuProps, close } = useMenu(open, setOpen);
  const navigate = useNavigate();

  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "Me";

  return (
    <div className="relative mt-auto flex items-center gap-2.5 border-t border-leather-line px-1.5 pt-2.5">
      <a
        href="/me"
        onClick={(e) => {
          e.preventDefault();
          navigate("/me");
        }}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1"
      >
        {me.photo ? (
          <img src={me.photo} alt="" className="size-[30px] shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-leather-hi font-serif text-[13px] text-leather-fg">
            {initialsOf(me.name)}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <b className="truncate text-[13px] font-semibold text-leather-fg">{me.name || "You"}</b>
          <span className="flex items-center gap-1.5 text-[11.5px]" aria-live="off">
            <i
              className={cx(
                "size-1.5 shrink-0 rounded-full",
                syncStatus === "error"
                  ? "bg-gilt"
                  : syncStatus === "saving"
                    ? "animate-pulse bg-leather-ink"
                    : "bg-[#5AC6BD]"
              )}
              aria-hidden="true"
            />
            {SYNC_LABEL[syncStatus]}
          </span>
        </span>
      </a>
      <button
        {...triggerProps}
        type="button"
        aria-label="Settings and theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-leather-ink hover:bg-leather-hi hover:text-leather-fg"
      >
        <Settings01 className="size-4" />
      </button>
      {open && (
        <div
          {...menuProps}
          role="menu"
          aria-label="Settings and theme"
          className="absolute inset-x-0 bottom-full z-50 mb-2 overflow-hidden rounded-xl border border-secondary bg-primary py-1 text-primary shadow-xl"
        >
          <MenuItem
            icon={dark ? Sun : Moon01}
            label={dark ? "Light mode" : "Dark mode"}
            onSelect={() => {
              close(false);
              toggleDark();
            }}
          />
          <MenuItem
            icon={Keyboard01}
            label="Keyboard shortcuts"
            hint="?"
            onSelect={() => {
              close(false);
              setHelpOpen(true);
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
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  label,
  hint,
  onSelect,
}: {
  icon: typeof Sun;
  label: string;
  hint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex min-h-10 w-full items-center gap-3 px-3.5 text-left text-[13.5px] hover:bg-secondary touch:min-h-11"
    >
      <Icon className="size-4 shrink-0 text-quaternary" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {hint && <span className="font-mono text-caption text-quaternary">{hint}</span>}
    </button>
  );
}
