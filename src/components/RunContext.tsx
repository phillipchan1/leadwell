import { useStore } from "../store/useStore";
import type { MeetingSubjectKind } from "../types";
import { HEALTH_LABEL, formatRatedOn } from "../lib/health";
import { formatLastPrayed } from "../lib/prayer";
import { DOMAIN_COLOR, THEME_DOMAIN } from "../data/frameworks";
import { HEALTH_PILL, HealthMeter, PrayerFlame } from "./brand/glyphs";
import { cx } from "@/utils/cx";
import { KnownList } from "./knowledge/KnownList";
import { FixturesList } from "./knowledge/FixturesList";

/*
 * What you want in your peripheral vision while you're in the room: your read
 * on them, how they're best led, what earlier meetings settled, the standing
 * work that should come up, what was promised, and — for your eyes only —
 * what you're carrying for them. Read-only on purpose. The room is for them.
 */
export function RunContext({
  kind,
  id,
}: {
  kind: MeetingSubjectKind;
  id: string;
}) {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const followUps = useStore((s) => s.followUps);
  const toggleFollowUp = useStore((s) => s.toggleFollowUp);

  const person = kind === "person" ? people.find((p) => p.id === id) : undefined;
  const team = kind === "team" ? teams.find((t) => t.id === id) : undefined;
  const manager = kind === "manager" ? managers.find((m) => m.id === id) : undefined;
  const health = person?.health ?? team?.health;
  const prayer = person?.prayer ?? team?.prayer ?? manager?.prayer;
  const top5 = person?.assessments.cliftonTop5 ?? [];
  const howTo = person?.howToLead ?? manager?.leadUp?.winsLike;
  const watchOut = person?.watchOuts?.[0];
  const promised = followUps
    .filter((f) => f.subjectKind === kind && f.subjectId === id && f.status === "open")
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col gap-6">
      {health && (
        <section className="flex flex-col gap-2.5">
          <span className="eyebrow">Your read</span>
          <span className={cx("inline-flex h-7 items-center gap-2 self-start rounded-full pr-2.5 pl-2 text-[13px] font-semibold", HEALTH_PILL[health.level])}>
            <HealthMeter level={health.level} />
            {HEALTH_LABEL[health.level]}
          </span>
          {health.note && <p className="text-[14px] leading-5 text-secondary">{health.note}</p>}
          <span className="text-[12px] text-quaternary">{capitalize(formatRatedOn(health) ?? "")}</span>
        </section>
      )}

      {(howTo || top5.length > 0 || watchOut) && (
        <section className="flex flex-col gap-2.5 border-t border-secondary pt-5">
          <span className="eyebrow">Remember</span>
          {howTo && <p className="font-serif text-[17px] leading-[25px]">{howTo}</p>}
          {top5.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {top5.slice(0, 5).map((t) => (
                <span key={t} className="inline-flex h-6 items-center gap-1.5 rounded-md border border-secondary bg-primary px-2 text-[12px] text-secondary">
                  <i className="size-2 rounded-[2px]" style={{ backgroundColor: DOMAIN_COLOR[THEME_DOMAIN[t]] }} aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
          )}
          {watchOut && (
            <p className="text-[13px] leading-[19px] text-secondary">
              <b className="font-semibold text-cond-watch-ink">Watch for:</b> {watchOut.charAt(0).toLowerCase() + watchOut.slice(1)}.
            </p>
          )}
        </section>
      )}

      {/* What earlier meetings settled, and the standing work that should
          come up — so nobody has to ask twice. */}
      <KnownList subjectKind={kind} subjectId={id} compact className="border-t border-secondary pt-5" />
      <FixturesList subjectKind={kind} subjectId={id} compact className="border-t border-secondary pt-5" />

      {promised.length > 0 && (
        <section className="flex flex-col gap-2.5 border-t border-secondary pt-5">
          <span className="eyebrow">Promised, still open</span>
          <ul className="flex flex-col gap-2">
            {promised.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-[19px]">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => toggleFollowUp(f.id)}
                    className="mt-0.5 size-4 shrink-0 accent-teal-600"
                  />
                  <span>{f.text}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prayer && (
        <section className="flex flex-col gap-2.5 rounded-xl bg-vesper-soft p-4">
          <span className="flex items-center gap-2">
            <PrayerFlame state="fresh" size={14} />
            <span className="eyebrow !text-vesper">Carrying · only you see this</span>
          </span>
          {prayer.focus ? (
            <p className="font-serif text-[16px] leading-[23px] italic">{prayer.focus}</p>
          ) : (
            <p className="text-[13px] text-secondary">On your prayer list.</p>
          )}
          <span className="text-[12px] text-quaternary">{capitalize(formatLastPrayed(prayer) ?? "")}</span>
        </section>
      )}
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
