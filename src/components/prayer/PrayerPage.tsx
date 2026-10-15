import { useMemo, useState } from "react";
import { useStore } from "@/store/useStore";
import type { PrayerEntryKind, PrayerSubjectKind } from "@/types";
import {
  carriedDays,
  daysSincePrayed,
  entriesFor,
  openEntries,
  prayerState,
  answeredEntries,
  todayISO,
  type PrayerState,
} from "@/lib/prayer";
import { subjectsOf, type Subject } from "@/lib/today";
import { Avatar } from "../Avatar";
import { PrayerFlame } from "../brand/glyphs";
import { confirmAction } from "../ConfirmDialog";
import { cx } from "@/utils/cx";

/*
 * Prayer — who am I carrying.
 *
 * It was a mode on the canvas; now it is a place you go on purpose, usually at
 * night. Nothing here is scored and nothing is counted against you: the only
 * state that asks for anything is "gone quiet", so it comes first. Entries are
 * read in the serif and written in the same quick field the rest of the app
 * uses — Enter saves.
 */

type Carried = Subject & { state: PrayerState; silence: number | null; held: number | null };

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();

const monthYear = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
  });

export function PrayerPage() {
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const meetings = useStore((s) => s.meetings);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const entries = useStore((s) => s.prayers);
  const scopeId = useStore((s) => s.treeDomainId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectTeam = useStore((s) => s.selectTeam);
  const selectManager = useStore((s) => s.selectManager);

  const all = useMemo(
    () => subjectsOf({ people, teams, managers, meetings, sessions, topics }),
    [people, teams, managers, meetings, sessions, topics]
  );
  const scoped = all.filter((s) => !scopeId || s.domainId === scopeId);
  const carried: Carried[] = scoped
    .filter((s) => s.prayer)
    .map((s) => ({
      ...s,
      state: prayerState(s.prayer),
      silence: daysSincePrayed(s.prayer),
      held: carriedDays(s.prayer),
    }))
    .sort((a, b) => (b.silence ?? b.held ?? 0) - (a.silence ?? a.held ?? 0));
  const quiet = carried.filter((c) => c.state === "cold");
  const holding = carried.filter((c) => c.state !== "cold");
  const night = useNight();

  const answered = answeredEntries(entries)
    .filter((e) => {
      const subject = all.find((s) => s.kind === e.subjectKind && s.id === e.subjectId);
      return subject && (!scopeId || subject.domainId === scopeId);
    })
    .slice(0, 3);

  const open = (s: Pick<Subject, "kind" | "id">) =>
    s.kind === "person"
      ? selectPerson(s.id, "prayer")
      : s.kind === "team"
        ? selectTeam(s.id, "prayer")
        : selectManager(s.id, "prayer");

  const now = new Date();
  const timeLine = `${now
    .toLocaleDateString(undefined, { weekday: "long" })
    .toUpperCase()} · ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toUpperCase()}`;

  return (
    // Prayer keeps its own hours: it opens at night whatever the app's theme,
    // because that is when it's usually done. One tap brings the day back.
    <div className={cx("min-h-full bg-secondary px-4 pt-8 pb-16 text-primary sm:px-8 lg:px-12 lg:pt-[52px]", night.on && "dark")}>
      <div className="mx-auto flex max-w-[1080px] flex-col gap-10">
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <span className="font-mono text-[12px] tracking-[0.04em] text-quaternary">{timeLine}</span>
            <button
              type="button"
              onClick={night.toggle}
              aria-pressed={night.on}
              className="h-8 rounded-full border border-primary px-3 text-[12.5px] font-medium text-tertiary hover:bg-tertiary"
            >
              {night.on ? "Day" : "Night"}
            </button>
          </div>
          <h1 className="font-serif text-[40px] leading-[46px] font-normal tracking-[-0.01em] italic sm:text-[52px] sm:leading-[58px]">
            Who am I carrying?
          </h1>
          <p className="max-w-[540px] text-[15.5px] leading-[23px] text-secondary">
            {carried.length === 0
              ? "No one yet. Take someone up below, or from any profile."
              : `${carried.length === 1 ? "One" : carried.length} on your list${quiet.length ? `, ${quiet.length === 1 ? "one has" : `${quiet.length} have`} gone quiet` : ""}. Carrying ${carried.length} of the ${scoped.length} people and teams you lead is a true answer, and nothing here counts against you.`}
          </p>
        </header>

        <div className="flex flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[1.7_1_480px] flex-col gap-[18px]">
            {quiet.length > 0 && (
              <>
                <SectionHead title="Gone quiet" hint="nothing marked in over three weeks" />
                {quiet.map((c) => (
                  <CarriedCard key={`${c.kind}:${c.id}`} c={c} entries={entries} onOpen={() => open(c)} emphasis />
                ))}
              </>
            )}
            {holding.length > 0 && (
              <>
                <SectionHead title="Carrying" hint="longest silence first" />
                {holding.map((c) => (
                  <CarriedCard key={`${c.kind}:${c.id}`} c={c} entries={entries} onOpen={() => open(c)} />
                ))}
              </>
            )}
          </div>

          <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-[22px]">
            {answered.length > 0 && (
              <section className="flex flex-col gap-3.5 rounded-2xl border border-gilt-line bg-gilt-soft p-[22px]">
                <div className="flex items-center gap-2">
                  <PrayerFlame state="answered" size={16} />
                  <h2 className="text-[11px] font-semibold tracking-[0.1em] text-gilt-ink uppercase">Answered</h2>
                </div>
                {answered.map((e) => {
                  const who = all.find((s) => s.kind === e.subjectKind && s.id === e.subjectId);
                  return (
                    <div key={e.id} className="flex flex-col gap-1.5">
                      <span className="font-mono text-[11px] text-gilt-ink">
                        {who?.name.toUpperCase()} · {shortDate(e.answeredOn!)}
                      </span>
                      <p className="font-serif text-[17px] leading-[25px]">{e.text}</p>
                      {e.answerNote && (
                        <p className="font-serif text-[16px] leading-6 text-secondary italic">{e.answerNote}</p>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
            <TakeUp candidates={scoped.filter((s) => !s.prayer)} />
          </aside>
        </div>
      </div>
    </div>
  );
}

const NIGHT_KEY = "leadwell:prayer-night";

/** Night by default; remembered per device, like the app's own theme. */
function useNight() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(NIGHT_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(NIGHT_KEY, v ? "0" : "1");
      } catch {
        // Blocked storage just means it won't be remembered.
      }
      return !v;
    });
  return { on, toggle };
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex items-baseline gap-2.5 pt-1">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="text-[13px] text-quaternary">{hint}</span>
    </div>
  );
}

function CarriedCard({
  c,
  entries,
  onOpen,
  emphasis,
}: {
  c: Carried;
  entries: ReturnType<typeof useStore.getState>["prayers"];
  onOpen: () => void;
  emphasis?: boolean;
}) {
  const markPrayed = useStore((s) => s.markPrayed);
  const addPrayerEntry = useStore((s) => s.addPrayerEntry);
  const setPrayer = useStore((s) => s.setPrayer);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<PrayerEntryKind>("burden");

  const kindKey = c.kind as PrayerSubjectKind;
  const latest = openEntries(entriesFor(entries, kindKey, c.id))[0];
  const prayedToday = c.prayer?.lastPrayedOn === todayISO();
  const since = c.prayer?.since ? monthYear(c.prayer.since) : null;
  const meta = [
    c.kind === "team" ? "Team" : c.role,
    c.prayer?.times ? `${c.prayer.times} ${c.prayer.times === 1 ? "time" : "times"}` : null,
    since ? `since ${since}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={cx(
        "relative flex flex-col gap-4 rounded-2xl border bg-primary px-5 py-[22px] sm:px-[26px]",
        emphasis ? "border-vesper-line" : "border-secondary"
      )}
    >
      {emphasis && (
        <svg className="absolute -top-0.5 right-[26px]" width="14" height="30" viewBox="0 0 14 30" aria-hidden="true">
          <path d="M0 0h14v30l-7-6-7 6z" className="fill-vesper opacity-50" />
        </svg>
      )}
      <div className="flex items-center gap-3.5">
        <button type="button" onClick={onOpen} className="shrink-0 rounded-full" aria-label={`Open ${c.name}`}>
          <Avatar name={c.name} photo={c.photo} size={44} className={c.kind === "team" ? "!rounded-xl" : undefined} />
        </button>
        <div className="flex min-w-0 flex-col gap-0.5">
          <button type="button" onClick={onOpen} className="truncate text-left font-serif text-[22px] leading-7 font-medium hover:underline hover:decoration-1 hover:underline-offset-4 sm:text-[24px] sm:leading-8">
            {c.name}
          </button>
          <span className="line-clamp-2 text-[13px] text-quaternary">{meta}</span>
        </div>
        <span className="ml-auto shrink-0">
          {prayedToday ? (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-vesper-soft px-2.5 text-[12.5px] font-semibold text-vesper">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className="stroke-vesper" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.2 4.2L19 7" />
              </svg>
              Prayed today
            </span>
          ) : (
            <span className={cx("inline-flex items-center gap-1.5 font-mono text-[12px]", c.state === "cold" ? "text-gilt-ink" : "text-quaternary")}>
              <PrayerFlame state={c.state} size={14} />
              {c.silence === null ? "NOT MARKED YET" : `${c.silence}D`}
            </span>
          )}
        </span>
      </div>

      {c.prayer?.focus && (
        <p className="font-serif text-[20px] leading-[29px] italic sm:text-[22px] sm:leading-[31px]">{c.prayer.focus}</p>
      )}

      {latest && (
        <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3.5 border-t border-secondary pt-3.5">
          <span className="pt-1 font-mono text-[11.5px] text-quaternary">{shortDate(latest.date)}</span>
          <p className={cx("font-serif text-[17px] leading-[26px] text-secondary", latest.kind === "scripture" && "italic")}>
            {latest.text}
          </p>
        </div>
      )}

      {writing && (
        <form
          className="flex flex-col gap-2 border-t border-secondary pt-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            addPrayerEntry(kindKey, c.id, draft.trim(), kind);
            setDraft("");
            setWriting(false);
          }}
        >
          <div className="flex gap-1" role="radiogroup" aria-label="Kind of entry">
            {(["burden", "scripture"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cx(
                  "h-7 rounded-md px-2.5 text-[12.5px] font-medium",
                  kind === k ? "bg-vesper-soft text-vesper" : "text-quaternary hover:bg-secondary"
                )}
              >
                {k === "burden" ? "Burden" : "Scripture"}
              </button>
            ))}
          </div>
          <label htmlFor={`pray-${c.kind}-${c.id}`} className="sr-only">
            What you're praying for {c.name}
          </label>
          <input
            id={`pray-${c.kind}-${c.id}`}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setWriting(false);
            }}
            placeholder={kind === "burden" ? "What are you asking for them? ↵" : "A verse you're praying over them… ↵"}
            className="h-11 rounded-lg border border-primary bg-primary px-3 font-serif text-[17px] outline-none placeholder:font-sans placeholder:text-[14px] placeholder:text-placeholder focus:border-vesper-line"
          />
        </form>
      )}

      <div className="flex flex-wrap gap-2.5">
        {!prayedToday && (
          <button
            type="button"
            onClick={() => markPrayed(kindKey, c.id)}
            className={cx(
              "h-[38px] rounded-[9px] px-3.5 text-[13.5px] font-semibold transition-colors",
              emphasis
                ? "bg-vesper text-on-vesper hover:opacity-90"
                : "border border-vesper-line text-vesper hover:bg-vesper-soft"
            )}
          >
            Mark prayed
          </button>
        )}
        {!writing && (
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="h-[38px] rounded-[9px] border border-primary px-3.5 text-[13.5px] font-medium hover:bg-secondary"
          >
            Write what you're praying
          </button>
        )}
        {emphasis && (
          <button
            type="button"
            onClick={async () => {
              if (
                await confirmAction({
                  title: `Lay ${c.name} down?`,
                  body: "They come off the prayer list. Everything you've written stays.",
                  confirmLabel: "Lay down",
                  destructive: false,
                })
              )
                setPrayer(kindKey, c.id, false);
            }}
            className="h-[38px] rounded-[9px] px-3 text-[13.5px] font-medium text-quaternary hover:bg-secondary"
          >
            Lay down
          </button>
        )}
      </div>
    </article>
  );
}

function TakeUp({ candidates }: { candidates: Subject[] }) {
  const setPrayer = useStore((s) => s.setPrayer);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const hits = query
    ? candidates.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 5)
    : [];

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-secondary bg-primary px-[22px] py-5">
      <h2 className="text-[15px] font-semibold">Take someone up</h2>
      <label htmlFor="take-up" className="sr-only">
        Find a person or team
      </label>
      <input
        id="take-up"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="A person or a team"
        className="h-10 rounded-[9px] bg-secondary px-3 text-[14px] outline-none placeholder:text-placeholder focus:ring-2 focus:ring-vesper-line"
      />
      {hits.length > 0 && (
        <ul className="flex flex-col">
          {hits.map((s) => (
            <li key={`${s.kind}:${s.id}`} className="flex items-center gap-2.5 border-t border-secondary py-2">
              <span className="min-w-0 flex-1 truncate font-serif text-[16px]">{s.name}</span>
              <button
                type="button"
                onClick={() => {
                  setPrayer(s.kind as PrayerSubjectKind, s.id, true);
                  setQ("");
                }}
                className="h-8 rounded-lg px-2.5 text-[13px] font-semibold text-vesper hover:bg-vesper-soft"
              >
                Take up
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] leading-[19px] text-quaternary">
        Taking someone up and laying them down are both deliberate. Laying someone down keeps
        everything you wrote, answers included.
      </p>
    </section>
  );
}
