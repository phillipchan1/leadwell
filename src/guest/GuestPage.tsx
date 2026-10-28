import { useCallback, useEffect, useMemo, useState } from "react";
import type { Arc, CurriculumSlot, Session, SharedNote, Takeaway, Topic, TrackedMeeting } from "../types";
import { daysBetween, todayISO } from "../lib/readiness";
import { plannedSlots, type Slot } from "../lib/topics";
import { arcPlan, currentStep, liveArcs, progressOf, shortLabel, type PlannedStep } from "../lib/arcs";
import { Avatar } from "../components/Avatar";
import { ArcCover, ArcRail } from "../components/arcs/ArcCover";
import { Check, Lock01, Plus, X } from "@untitledui/icons";
import { cx } from "@/utils/cx";

/**
 * The shared page: one meeting, as the other chair sees it.
 *
 * Built for a phone, because that's where a link gets opened. Adding comes
 * first — the point of a shared agenda is that both people bring things to it.
 * Everything here comes from `/api/with/:token`, which selects exactly what's
 * on this page and nothing else; this component never sees a private field
 * because the server never sends one.
 */

type FollowUpOut = {
  id: string;
  text: string;
  status: "open" | "done";
  owner?: string;
  openedOn: string;
  closedOn?: string;
};

type SharedDoc = {
  me: { id: string; name: string };
  owner: { name: string };
  meeting: TrackedMeeting & { subjectName: string; curriculum: CurriculumSlot[] };
  members: { id: string; name: string }[];
  sessions: Session[];
  topics: Topic[];
  followUps: FollowUpOut[];
  arcs: Arc[];
  takeaways: Takeaway[];
  sharedNotes: SharedNote[];
};

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
const weekday = (iso: string) => fmt(iso, { weekday: "long" });
const first = (name: string) => name.trim().split(/\s+/)[0] || name;

async function call(token: string, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`/api/with/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    credentials: "omit",
  });
  if (!res.ok) {
    let message = "Something went wrong. Try again.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not json */
    }
    throw new Error(message);
  }
  return res;
}

export function GuestPage({ token }: { token: string }) {
  const [doc, setDoc] = useState<SharedDoc | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await call(token, "");
      setDoc((await res.json()) as SharedDoc);
      setFailed(null);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "This link isn't working.");
    }
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 20_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", dark.matches);
    apply();
    dark.addEventListener("change", apply);
    return () => dark.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!doc) return;
    document.title = `${titleOf(doc)} — Polarch`;
  }, [doc]);

  if (!doc) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
          {failed ? (
            <>
              <p className="font-serif text-[22px] font-bold text-primary">This link isn't active.</p>
              <p className="max-w-xs text-[14px] text-tertiary">
                It may have been turned off, or replaced with a new one. Ask whoever shared it for a fresh link.
              </p>
            </>
          ) : (
            <p className="text-[14px] text-tertiary">Opening your agenda…</p>
          )}
        </div>
      </Shell>
    );
  }
  return <Shared doc={doc} token={token} reload={load} />;
}

function titleOf(doc: SharedDoc): string {
  const named = doc.meeting.name?.trim();
  if (named) return named;
  if (doc.meeting.subjectKind === "team") return doc.meeting.subjectName || "Team meeting";
  return `1:1 with ${doc.owner.name || "your leader"}`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-secondary text-primary">{children}</div>;
}

function Shared({ doc, token, reload }: { doc: SharedDoc; token: string; reload: () => Promise<void> }) {
  const today = todayISO();
  const { meeting } = doc;
  const slots = useMemo(
    () => plannedSlots(meeting, doc.sessions, doc.topics, today, 6),
    [meeting, doc.sessions, doc.topics, today]
  );
  const ahead = slots.filter((s) => !s.past);
  const next = ahead[0];
  const lastHeld = [...slots].reverse().find((s) => s.past && s.sessionId);
  const arcs = liveArcs(doc.arcs, meeting.id);
  const done = doc.arcs.filter((a) => a.status === "done");
  const nameOf = (by?: string) =>
    !by || by === "owner"
      ? doc.owner.name || "Owner"
      : by === doc.me.id
        ? doc.me.name
        : (doc.members.find((m) => m.id === by)?.name ?? "Someone");
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
  };

  const ownerFirst = first(doc.owner.name || "your leader");
  const heading =
    meeting.subjectKind === "team"
      ? titleOf(doc)
      : next
        ? `${weekday(next.date)} with ${ownerFirst}`
        : `With ${ownerFirst}`;

  return (
    <Shell>
      <div className="mx-auto flex w-full max-w-[560px] flex-col">
        <header className="flex flex-col gap-3 bg-leather px-5 pt-8 pb-6 text-leather-fg sm:mt-6 sm:rounded-t-[24px]">
          <div className="flex">
            <Avatar name={doc.owner.name || "Owner"} size={30} className="ring-2 ring-[var(--color-leather)]" />
            <Avatar name={doc.me.name} size={30} className="-ml-2 ring-2 ring-[var(--color-leather)]" />
          </div>
          <h1 className="font-serif text-[24px] leading-[1.15] font-extrabold tracking-[-0.02em]">{heading}</h1>
          {next ? (
            <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-leather-ink">
              <span>{fmt(next.date, { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="font-mono text-[12px] text-gilt">{countdown(today, next.date)}</span>
              {meeting.subjectKind === "team" && <span>with {ownerFirst}</span>}
            </p>
          ) : (
            <p className="text-[13px] text-leather-ink">Nothing booked yet.</p>
          )}
        </header>

        <main className="flex flex-col gap-5 bg-secondary px-4 py-5 sm:rounded-b-[24px] sm:bg-primary sm:px-5">
          <Composer
            slots={ahead}
            sessions={doc.sessions}
            curriculum={meeting.curriculum}
            onAdd={(input) => act(() => call(token, "/topics", { method: "POST", body: JSON.stringify(input) }))}
          />
          {error && <p className="rounded-[10px] bg-cond-critical-soft px-3 py-2 text-[13px] text-cond-critical-ink">{error}</p>}

          {next &&
            arcs.map((arc) => (
              <ArcThisWeek
                key={arc.id}
                arc={arc}
                plan={arcPlan(arc, slots).get(next.date) ?? []}
                followUps={doc.followUps}
                myId={doc.me.id}
                onTick={(id, d) => act(() => call(token, `/follow-ups/${id}`, { method: "PUT", body: JSON.stringify({ done: d }) }))}
              />
            ))}

          {next && (
            <Section title={`On ${fmt(next.date, { weekday: "long", month: "short", day: "numeric" })}`}>
              <RunningOrder
                slot={next}
                doc={doc}
                nameOf={nameOf}
                onRemove={(id) => act(() => call(token, `/topics/${id}`, { method: "DELETE" }))}
              />
            </Section>
          )}

          <FollowUps
            items={doc.followUps.filter((f) => !f.text.startsWith("Try: ") || f.status === "open")}
            myId={doc.me.id}
            nameOf={nameOf}
            onTick={(id, d) => act(() => call(token, `/follow-ups/${id}`, { method: "PUT", body: JSON.stringify({ done: d }) }))}
          />

          {ahead.length > 1 && (
            <Section title="Coming up">
              <ComingUp slots={slots} doc={doc} nameOf={nameOf} />
            </Section>
          )}

          <Ideas
            doc={doc}
            nameOf={nameOf}
            onRemove={(id) => act(() => call(token, `/topics/${id}`, { method: "DELETE" }))}
          />

          {lastHeld?.sessionId && (
            <AfterLast
              key={lastHeld.sessionId}
              session={doc.sessions.find((s) => s.id === lastHeld.sessionId)!}
              doc={doc}
              nameOf={nameOf}
              onNote={(body) =>
                act(() => call(token, `/notes/${lastHeld.sessionId}`, { method: "PUT", body: JSON.stringify({ body }) }))
              }
              onTakeaway={(stepId, text) =>
                act(() => call(token, `/takeaways/${stepId}`, { method: "PUT", body: JSON.stringify({ text }) }))
              }
            />
          )}

          {done.length > 0 && (
            <Section title="Finished together">
              <ul className="flex flex-col gap-2">
                {done.map((arc) => (
                  <li key={arc.id} className="flex items-center gap-3">
                    <ArcCover arc={arc} size="xs" />
                    <span className="font-serif text-[14px] font-semibold">{arc.title}</span>
                    <span className="text-[12px] text-tertiary">{arc.steps.length} steps</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <footer className="flex items-start gap-2 border-t border-secondary pt-4 text-[12px] leading-[17px] text-tertiary">
            <Lock01 aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {ownerFirst} shared this one meeting with you through Polarch. You can see its agenda and add to it — nothing
              else in their Polarch is visible here.
            </span>
          </footer>
        </main>
      </div>
    </Shell>
  );
}

function countdown(today: string, date: string): string {
  const d = daysBetween(today, date);
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="eyebrow pl-0.5">{title}</h2>
      {children}
    </section>
  );
}

function Composer({
  slots,
  sessions,
  curriculum,
  onAdd,
}: {
  slots: Slot[];
  sessions: Session[];
  curriculum: CurriculumSlot[];
  /** No date: an idea for later, not on any meeting yet. */
  onAdd: (input: { text: string; date?: string; slotId?: string }) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(slots[0]?.date ?? "");
  const [later, setLater] = useState(false);
  const [slotId, setSlotId] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const weeks = slots
    .filter((s) => !sessions.some((x) => x.kind === "skipped" && (x.seriesDate ?? x.date) === s.date))
    .slice(0, 4);
  const target = later ? undefined : (weeks.find((w) => w.date === date) ?? weeks[0]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await onAdd({ text: text.trim(), date: target?.date, slotId });
    setBusy(false);
    setText("");
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-2 rounded-[14px] border-[1.5px] border-teal-600 bg-primary py-1.5 pr-1.5 pl-3.5 dark:border-teal-500">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          aria-label="Something to raise"
          placeholder={
            !target
              ? "An idea for later…"
              : target.date === weeks[0]?.date
                ? `Add to ${weekday(target.date)}…`
                : `Add to ${fmt(target.date, { weekday: "short", month: "short", day: "numeric" })}…`
          }
          className="min-w-0 flex-1 bg-transparent text-[15px] text-primary outline-none placeholder:text-placeholder"
        />
        <button
          type="submit"
          disabled={!text.trim() || busy}
          className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-teal-600 px-3.5 text-[14px] font-semibold text-white disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
        >
          <Plus aria-hidden className="size-4" />
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-0.5">
        {curriculum.map((c) => (
          <Chip key={c.id} on={slotId === c.id} onClick={() => setSlotId(slotId === c.id ? undefined : c.id)}>
            {c.label}
          </Chip>
        ))}
        {curriculum.length > 0 && <span className="mx-0.5 w-px self-stretch bg-tertiary" />}
        {weeks.map((w) => (
          <Chip
            key={w.date}
            on={target?.date === w.date}
            onClick={() => {
              setDate(w.date);
              setLater(false);
            }}
          >
            {fmt(w.date, { weekday: "short", month: "short", day: "numeric" })}
          </Chip>
        ))}
        <Chip on={!target} onClick={() => setLater(true)}>
          Later
        </Chip>
      </div>
    </form>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "h-7 rounded-full border px-2.5 text-[12px] transition-colors",
        on
          ? "border-teal-600 bg-teal-50 font-semibold text-teal-700 dark:border-teal-500 dark:bg-teal-950 dark:text-teal-400"
          : "border-secondary bg-primary text-secondary"
      )}
    >
      {children}
    </button>
  );
}

function ArcThisWeek({
  arc,
  plan,
  followUps,
  myId,
  onTick,
}: {
  arc: Arc;
  plan: PlannedStep[];
  followUps: FollowUpOut[];
  myId: string;
  onTick: (id: string, done: boolean) => void;
}) {
  const p = progressOf(arc);
  const step = plan[0]?.step ?? currentStep(arc);
  const practices = followUps.filter((f) => f.text.startsWith("Try: ") && (f.owner === "both" || f.owner === myId));
  return (
    <section className="overflow-hidden rounded-[16px] border border-teal-200 bg-primary dark:border-teal-900">
      <div className="flex items-center gap-3 bg-gradient-to-b from-teal-50 to-transparent px-4 py-3 dark:from-teal-950">
        <ArcCover arc={arc} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="eyebrow">{plan.length ? "This week in the arc" : "Where we are"}</span>
          <span className="truncate font-serif text-[15px] font-bold">{arc.title}</span>
          <ArcRail arc={arc} />
        </div>
        <span className="self-start font-mono text-[11px] text-quaternary">
          {Math.min(p.at, p.total)}/{p.total}
        </span>
      </div>
      {step && (
        <div className="flex flex-col gap-2 border-t border-teal-200 px-4 py-3 dark:border-teal-900">
          <b className="font-serif text-[15px] leading-tight">{step.label}</b>
          {step.read && (
            <p className="text-[13.5px] text-secondary">
              <span className="mr-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-teal-700 uppercase dark:text-teal-400">Read</span>
              {step.read}
            </p>
          )}
          {step.prompts.length > 0 && (
            <ul className="flex flex-col gap-1 border-l-2 border-teal-300 pl-2.5 text-[13.5px] leading-[19px] text-secondary dark:border-teal-700">
              {step.prompts.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          )}
          {!plan.length && <p className="text-[12.5px] text-tertiary">Not on the next meeting — it picks up after.</p>}
        </div>
      )}
      {practices.length > 0 && (
        <ul className="flex flex-col border-t border-secondary">
          {practices.map((f) => (
            <li key={f.id} className="flex items-start gap-2.5 px-4 py-2.5">
              <Tick done={f.status === "done"} label={f.text} onChange={(d) => onTick(f.id, d)} />
              <span className={cx("text-[13.5px] leading-[19px]", f.status === "done" ? "text-quaternary line-through" : "text-secondary")}>
                {f.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RunningOrder({
  slot,
  doc,
  nameOf,
  onRemove,
}: {
  slot: Slot;
  doc: SharedDoc;
  nameOf: (by?: string) => string;
  onRemove: (id: string) => void;
}) {
  const items = slot.sessionId ? doc.topics.filter((t) => t.sessionId === slot.sessionId) : [];
  if (!items.length) {
    return (
      <p className="rounded-[12px] border border-dashed border-primary px-3.5 py-3 text-[13.5px] text-tertiary">
        Nothing on it yet. Anything you add shows up on {first(doc.owner.name || "their")}'s agenda straight away.
      </p>
    );
  }
  const groups = [
    ...doc.meeting.curriculum.map((c) => ({ id: c.id, label: c.label, items: items.filter((t) => t.slotId === c.id) })),
    {
      id: "_",
      label: doc.meeting.curriculum.length ? "Anything else" : "",
      items: items.filter((t) => !t.slotId || !doc.meeting.curriculum.some((c) => c.id === t.slotId)),
    },
  ].filter((g) => g.items.length);
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.id} className="flex flex-col gap-1.5">
          {g.label && <span className="pl-0.5 text-[12px] font-semibold text-tertiary">{g.label}</span>}
          <ul className="flex flex-col gap-1.5">
            {g.items.map((t) => (
              <li key={t.id} className="flex items-center gap-2.5 rounded-[12px] border border-secondary bg-primary px-3 py-2.5">
                <Avatar name={nameOf(t.raisedBy)} size={22} />
                <span className={cx("min-w-0 flex-1 text-[14px] leading-[19px]", t.status !== "open" && "text-quaternary line-through")}>
                  {t.text}
                </span>
                {t.raisedBy === doc.me.id && t.status === "open" && (
                  <button
                    type="button"
                    aria-label={`Take back “${t.text}”`}
                    onClick={() => onRemove(t.id)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-quaternary hover:bg-secondary hover:text-secondary"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FollowUps({
  items,
  myId,
  nameOf,
  onTick,
}: {
  items: FollowUpOut[];
  myId: string;
  nameOf: (by?: string) => string;
  onTick: (id: string, done: boolean) => void;
}) {
  const list = items.filter((f) => !f.text.startsWith("Try: "));
  if (!list.length) return null;
  return (
    <Section title="Follow-ups">
      <ul className="flex flex-col gap-1.5">
        {list.map((f) => {
          const mine = f.owner === myId || f.owner === "both";
          const done = f.status === "done";
          return (
            <li key={f.id} className="flex items-start gap-2.5 rounded-[12px] border border-secondary bg-primary px-3 py-2.5">
              {mine ? (
                <Tick done={done} label={f.text} onChange={(d) => onTick(f.id, d)} />
              ) : (
                <span
                  aria-hidden
                  className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", done ? "bg-cond-thriving" : "bg-quaternary")}
                />
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cx("text-[14px] leading-[19px]", done ? "text-quaternary line-through" : "text-primary")}>{f.text}</span>
                <span className="text-[11.5px] text-quaternary">
                  {f.owner === "both" ? "Both of you" : f.owner === myId ? "You" : first(nameOf(f.owner))}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function ComingUp({ slots, doc, nameOf }: { slots: Slot[]; doc: SharedDoc; nameOf: (by?: string) => string }) {
  const ahead = slots.filter((s) => !s.past).slice(1, 4);
  const skipped = doc.sessions.filter(
    (s) => s.kind === "skipped" && ahead.length && (s.seriesDate ?? s.date) > slots.filter((x) => !x.past)[0].date && (s.seriesDate ?? s.date) < ahead[ahead.length - 1].date
  );
  const rows = [
    ...ahead.map((s) => ({ date: s.date, slot: s as Slot | null })),
    ...skipped.map((s) => ({ date: s.seriesDate ?? s.date, slot: null as Slot | null })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const arcs = liveArcs(doc.arcs, doc.meeting.id);
  return (
    <ul className="flex flex-col overflow-hidden rounded-[12px] border border-secondary bg-primary">
      {rows.map(({ date, slot }, i) => {
        const steps = slot ? arcs.flatMap((a) => arcPlan(a, slots).get(date) ?? []) : [];
        const items = slot?.sessionId ? doc.topics.filter((t) => t.sessionId === slot.sessionId) : [];
        return (
          <li key={date} className={cx("grid grid-cols-[64px_1fr] gap-3 px-3.5 py-2.5 text-[13.5px]", i > 0 && "border-t border-secondary")}>
            <span className="font-mono text-[12px] text-tertiary">{fmt(date, { month: "short", day: "numeric" })}</span>
            {slot ? (
              <span className="flex min-w-0 flex-col gap-0.5">
                {steps.map((p) => (
                  <span key={p.step.id} className="font-semibold text-primary">
                    {p.step.label}
                  </span>
                ))}
                {items.map((t) => (
                  <span key={t.id} className="flex min-w-0 items-center gap-1.5 text-secondary">
                    <Avatar name={nameOf(t.raisedBy)} size={16} />
                    <span className="truncate">{t.text}</span>
                  </span>
                ))}
                {!steps.length && !items.length && <span className="text-quaternary">Nothing yet</span>}
              </span>
            ) : (
              <span className="text-quaternary italic">Skipped</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ideas not on a meeting yet: theirs, and the ones the owner chose to share.
 * The owner decides when each comes up; this is where both of you park them.
 */
function Ideas({
  doc,
  nameOf,
  onRemove,
}: {
  doc: SharedDoc;
  nameOf: (by?: string) => string;
  onRemove: (id: string) => void;
}) {
  const ideas = doc.topics.filter((t) => !t.sessionId);
  const owner = first(doc.owner.name || "they");
  return (
    <Section title="Ideas for later">
      {ideas.length ? (
        <ul className="flex flex-col gap-1.5">
          {ideas.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-[12px] border border-dashed border-primary bg-primary px-3 py-2.5">
              <Avatar name={nameOf(t.raisedBy)} size={22} />
              <span className="min-w-0 flex-1 text-[14px] leading-[19px]">{t.text}</span>
              {t.raisedBy === doc.me.id && (
                <button
                  type="button"
                  aria-label={`Take back “${t.text}”`}
                  onClick={() => onRemove(t.id)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-quaternary hover:bg-secondary hover:text-secondary"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[12px] border border-dashed border-primary px-3.5 py-3 text-[13.5px] text-tertiary">
          Nothing parked yet. Add something with Later and {owner} will find a meeting for it.
        </p>
      )}
    </Section>
  );
}

function AfterLast({
  session,
  doc,
  nameOf,
  onNote,
  onTakeaway,
}: {
  session: Session;
  doc: SharedDoc;
  nameOf: (by?: string) => string;
  onNote: (body: string) => Promise<void>;
  onTakeaway: (stepId: string, text: string) => Promise<void>;
}) {
  const notes = doc.sharedNotes.filter((n) => n.sessionId === session.id);
  const mine = notes.find((n) => n.by === doc.me.id);
  const others = notes.filter((n) => n.by !== doc.me.id && n.body.trim());
  const steps = doc.arcs.flatMap((a) => a.steps.filter((s) => s.coveredIn.includes(session.id)).map((s) => ({ arc: a, step: s })));
  const [body, setBody] = useState(mine?.body ?? "");
  const [saved, setSaved] = useState(false);
  return (
    <Section title={`From ${fmt(session.date, { weekday: "long", month: "short", day: "numeric" })}`}>
      <div className="flex flex-col gap-3 rounded-[14px] border border-secondary bg-primary p-3.5">
        {steps.map(({ arc, step }) => (
          <TakeawayField
            key={step.id}
            label={`${shortLabel(step)} · ${arc.title}`}
            mine={doc.takeaways.find((t) => t.stepId === step.id && t.by === doc.me.id)?.text ?? ""}
            others={doc.takeaways.filter((t) => t.stepId === step.id && t.by !== doc.me.id)}
            nameOf={nameOf}
            myName={doc.me.name}
            onSave={(text) => onTakeaway(step.id, text)}
          />
        ))}
        <span className="text-[12px] font-semibold text-tertiary">Our notes</span>
        {others.map((n) => (
          <div key={n.id} className="flex items-start gap-2.5">
            <Avatar name={nameOf(n.by)} size={22} className="mt-0.5" />
            <p className="flex-1 text-[14px] leading-[20px] whitespace-pre-wrap text-primary">{n.body}</p>
          </div>
        ))}
        <div className="flex items-start gap-2.5">
          <Avatar name={doc.me.name} size={22} className="mt-1.5" />
          <textarea
            rows={3}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSaved(false);
            }}
            onBlur={() => {
              if (body !== (mine?.body ?? "")) void onNote(body).then(() => setSaved(true));
            }}
            placeholder="Your notes from that meeting — both of you see these"
            className="min-h-20 flex-1 resize-y rounded-[10px] border border-secondary bg-secondary px-3 py-2 text-[14px] leading-[20px] outline-none placeholder:text-placeholder focus:border-teal-300"
          />
        </div>
        {saved && (
          <span className="flex items-center gap-1 self-end text-[12px] text-cond-thriving-ink">
            <Check className="size-3.5" /> Saved
          </span>
        )}
      </div>
    </Section>
  );
}

function TakeawayField({
  label,
  mine,
  others,
  nameOf,
  myName,
  onSave,
}: {
  label: string;
  mine: string;
  others: Takeaway[];
  nameOf: (by?: string) => string;
  myName: string;
  onSave: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState(mine);
  return (
    <div className="flex flex-col gap-1.5 border-b border-secondary pb-3">
      <span className="text-[12px] font-semibold text-tertiary">Takeaway · {label}</span>
      {others
        .filter((t) => t.text.trim())
        .map((t) => (
          <p key={t.id} className="flex items-start gap-2 text-[13.5px] leading-[19px]">
            <Avatar name={nameOf(t.by)} size={20} className="mt-px" />
            {t.text}
          </p>
        ))}
      <label className="flex items-start gap-2">
        <Avatar name={myName} size={20} className="mt-1.5" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== mine) void onSave(text);
          }}
          maxLength={1000}
          placeholder="Your one line from it"
          className="h-9 min-w-0 flex-1 rounded-[9px] border border-secondary bg-secondary px-2.5 text-[13.5px] outline-none placeholder:text-placeholder focus:border-teal-300"
        />
      </label>
    </div>
  );
}

function Tick({ done, label, onChange }: { done: boolean; label: string; onChange: (done: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark open: ${label}` : `Mark done: ${label}`}
      onClick={() => onChange(!done)}
      className="-m-1.5 flex shrink-0 items-center justify-center p-1.5"
    >
      <span
        className={cx(
          "flex size-[18px] items-center justify-center rounded-[5px] border-[1.5px]",
          done ? "border-cond-thriving bg-cond-thriving text-white" : "border-primary"
        )}
      >
        {done && <Check className="size-3" />}
      </span>
    </button>
  );
}
