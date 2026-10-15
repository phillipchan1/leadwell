import type { ReactNode } from "react";
import { useStore } from "../store/useStore";
import type { Health, MeetingSubjectKind, Prayer } from "../types";
import { HEALTH_LABEL, formatRatedOn, isStale } from "../lib/health";
import {
  RHYTHM_LABEL,
  STATE_LABEL,
  formatCountdown,
  meetingsFor,
  readinessFor,
} from "../lib/readiness";
import { formatLastPrayed, prayerState } from "../lib/prayer";
import type { EntityMode } from "../lib/entityModes";
import { Avatar } from "./Avatar";
import { HEALTH_PILL, HealthMeter, PrayerFlame, RhythmRing, STATE_TEXT } from "./brand/glyphs";
import type { Density } from "./EntitySurface";
import { cx } from "@/utils/cx";

/*
 * The header every person, team and leader wears.
 *
 * The name is set in the serif, because it is the one thing on the page that
 * is never just data. Under it, identity (role, life area, type), and then the
 * status trio — health, rhythm, prayer — the three questions the app exists
 * to answer about anyone, each one a door to the mode where it's changed.
 */


export function EntityHeader({
  kind,
  id,
  name,
  title,
  photo,
  square,
  meta,
  chips,
  health,
  showHealth = true,
  prayer,
  actions,
  onMode,
  density = "peek",
}: {
  kind: MeetingSubjectKind;
  id: string;
  name: string;
  /** Replaces the name heading — a team's name is edited in place. */
  title?: ReactNode;
  photo?: string;
  /** Teams wear a rounded square; people are round. */
  square?: boolean;
  meta?: ReactNode;
  chips?: ReactNode;
  health?: Health;
  /** Leaders above you aren't rated — you read them, they read you. */
  showHealth?: boolean;
  prayer?: Prayer;
  actions?: ReactNode;
  onMode: (mode: EntityMode) => void;
  density?: Density;
}) {
  const focus = density === "focus";
  return (
    <header className="entity-header @container shrink-0 border-b border-secondary px-4 pt-5 pb-5 sm:px-6">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className="entity-header-avatar relative shrink-0">
            <Avatar
              name={name}
              photo={photo}
              size={focus ? 72 : 56}
              className={square ? "!rounded-[14px]" : undefined}
            />
            {prayer && (
              <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-primary">
                <PrayerFlame
                  state={prayerState(prayer)}
                  size={15}
                  label={`Carrying in prayer, ${formatLastPrayed(prayer) ?? ""}`}
                />
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {title ?? (
              <h1
                className={cx(
                  "name truncate leading-tight",
                  focus ? "text-[34px] sm:text-[40px]" : "text-[28px]"
                )}
              >
                {name}
              </h1>
            )}
            {meta && <div className="text-[14px] text-secondary">{meta}</div>}
            {chips && (
              <div className="entity-header-secondary flex flex-wrap items-center gap-1.5 pt-0.5">
                {chips}
              </div>
            )}
          </div>
          {actions && (
            <div className="entity-header-secondary flex shrink-0 items-center gap-2 max-sm:hidden">
              {actions}
            </div>
          )}
        </div>

        <StatusTrio
          kind={kind}
          id={id}
          health={showHealth ? health : undefined}
          showHealth={showHealth}
          prayer={prayer}
          onMode={onMode}
        />
        {actions && <div className="entity-header-secondary flex gap-2 sm:hidden">{actions}</div>}
      </div>
    </header>
  );
}

function StatusTrio({
  kind,
  id,
  health,
  showHealth,
  prayer,
  onMode,
}: {
  kind: MeetingSubjectKind;
  id: string;
  health?: Health;
  showHealth: boolean;
  prayer?: Prayer;
  onMode: (mode: EntityMode) => void;
}) {
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const reading = readinessFor(kind, id, { meetings, sessions, topics });
  const meeting = meetingsFor(meetings, kind, id)[0];
  const rated = formatRatedOn(health);
  const pState = prayerState(prayer);

  const lastMet = reading?.lastMet
    ? new Date(`${reading.lastMet}T00:00:00Z`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <div
      className={cx(
        "entity-header-secondary grid overflow-hidden rounded-[14px] border border-secondary bg-secondary/40 dark:bg-transparent",
        // One per row in a narrow peek, side by side once there's room.
        showHealth ? "@xl:grid-cols-3" : "@xl:grid-cols-2"
      )}
    >
      {showHealth && (
        <Cell onClick={() => onMode("now")} label="My read" aside={rated ? (isStale(health) ? "stale" : rated) : undefined}>
          {health ? (
            <span className={cx("inline-flex h-7 items-center gap-2 self-start rounded-full pr-2.5 pl-2 text-[13px] font-semibold whitespace-nowrap", HEALTH_PILL[health.level])}>
              <HealthMeter level={health.level} />
              {HEALTH_LABEL[health.level]}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 text-[13px] text-quaternary">
              <HealthMeter />
              Not rated yet
            </span>
          )}
          {health?.note && <p className="line-clamp-2 text-[13.5px] leading-5 text-secondary">{health.note}</p>}
        </Cell>
      )}

      <Cell
        onClick={() => onMode("meetings")}
        label="Rhythm"
        aside={meeting ? RHYTHM_LABEL[meeting.rhythm].toUpperCase() : undefined}
      >
        {reading ? (
          <>
            <span className={cx("inline-flex flex-wrap items-center gap-x-2.5 gap-y-1", STATE_TEXT[reading.state])}>
              <RhythmRing reading={reading} size={24} />
              <span className="font-mono text-[13px] font-medium whitespace-nowrap uppercase">{formatCountdown(reading)}</span>
              <span className="text-[13px] font-semibold whitespace-nowrap">{STATE_LABEL[reading.state]}</span>
            </span>
            <p className="text-[13.5px] leading-5 text-secondary">
              {lastMet ? `Last met ${lastMet}.` : "Not met yet."}
            </p>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2.5 text-[13px] text-quaternary">
              <RhythmRing state="dormant" size={24} />
              No meeting tracked
            </span>
            <p className="text-[13.5px] leading-5 text-secondary">Decide whether you meet, and how often.</p>
          </>
        )}
      </Cell>

      <Cell
        onClick={() => onMode("prayer")}
        label={prayer ? "Carrying" : "Prayer"}
        tone="vesper"
        aside={prayer?.times ? `${prayer.times}×` : undefined}
      >
        {prayer ? (
          <>
            {prayer.focus ? (
              <p className="line-clamp-2 font-serif text-[16.5px] leading-6 italic">{prayer.focus}</p>
            ) : (
              <span className="inline-flex items-center gap-2 text-[13px] text-vesper">
                <PrayerFlame state={pState} size={16} />
                On your list
              </span>
            )}
            <p className="text-[13px] text-quaternary">{capitalize(formatLastPrayed(prayer) ?? "")}</p>
          </>
        ) : (
          <>
            <span className="text-[13px] text-quaternary">Not carrying</span>
            <p className="text-[13.5px] leading-5 text-secondary">Take them up from the Prayer tab.</p>
          </>
        )}
      </Cell>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Cell({
  label,
  aside,
  tone,
  onClick,
  children,
}: {
  label: string;
  aside?: string;
  tone?: "vesper";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col gap-2 border-secondary px-4 py-3.5 text-left transition-colors not-last:border-b hover:bg-primary @xl:not-last:border-r @xl:not-last:border-b-0 dark:hover:bg-secondary"
    >
      <span className="flex w-full items-center gap-2">
        <span className={cx("eyebrow", tone === "vesper" && "!text-vesper")}>{label}</span>
        {aside && <span className="ml-auto shrink-0 font-mono text-[11px] whitespace-nowrap text-quaternary">{aside}</span>}
      </span>
      {children}
    </button>
  );
}

/** A small identity chip: life area square, or a plain label (type, capacity). */
export function IdentityChip({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-secondary bg-primary px-2 text-[12px] whitespace-nowrap text-secondary">
      {color && <i className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden="true" />}
      {children}
    </span>
  );
}
