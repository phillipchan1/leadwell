import { useEffect, useMemo, useState } from "react";
import type { Arc, ArcStep, TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { Modal } from "../ui";
import { ARC_COVERS } from "../../lib/arcs";
import { draftArc } from "../../lib/arcDraft";
import { searchBooks, type BookHit } from "../../lib/books";
import { curriculumOf, plannedSlots } from "../../lib/topics";
import { meetingSubjectName, meetingTitle, todayISO } from "../../lib/readiness";
import { ArcCover } from "./ArcCover";
import { ArrowDown, ArrowUp, Plus, Stars02, Trash01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const uid = () => Math.random().toString(36).slice(2, 10);

const field =
  "h-10 w-full min-w-0 rounded-[10px] border border-primary bg-primary px-3 text-[14px] text-primary outline-none placeholder:text-placeholder focus:border-teal-400 dark:focus:border-teal-600";
const label = "text-[12px] font-semibold text-tertiary";

type DraftStep = Pick<ArcStep, "id" | "label" | "read" | "prompts" | "practice"> &
  Partial<Pick<ArcStep, "status" | "coveredIn" | "doneOn">>;

const TEMPLATES: { title: string; steps: string[] }[] = [
  {
    title: "30-60-90 onboarding",
    steps: [
      "Week 1 · Meet the team",
      "Week 2 · How we work",
      "Day 30 · What you've noticed",
      "Week 6 · First ownership",
      "Day 60 · What's working",
      "Week 10 · Stretch",
      "Day 90 · Look back, look ahead",
    ],
  },
  {
    title: "A new leader's first 8 weeks",
    steps: [
      "Your why",
      "Knowing your people",
      "Running a good meeting",
      "Delegation",
      "Hard conversations",
      "Feedback",
      "Your rhythm",
      "Where next",
    ],
  },
];

/**
 * Start or edit an arc. Type a title, let AI draft the steps, edit the draft,
 * then choose pace, section and start. Nothing is saved until "Start".
 */
export function ArcSheet({
  meeting,
  arc,
  onClose,
}: {
  meeting: TrackedMeeting;
  /** Present = editing. */
  arc?: Arc;
  onClose: () => void;
}) {
  const addArc = useStore((s) => s.addArc);
  const updateArc = useStore((s) => s.updateArc);
  const sessions = useStore((s) => s.sessions);
  const topics = useStore((s) => s.topics);
  const people = useStore((s) => s.people);
  const teams = useStore((s) => s.teams);
  const managers = useStore((s) => s.managers);
  const curriculum = curriculumOf(meeting);

  const nextDate = useMemo(
    () => plannedSlots(meeting, sessions, topics, todayISO(), 2).find((s) => !s.past)?.date ?? todayISO(),
    [meeting, sessions, topics]
  );

  const [title, setTitle] = useState(arc?.title ?? "");
  const [author, setAuthor] = useState(arc?.author ?? "");
  const [cover, setCover] = useState<number>(arc?.cover ?? Math.floor(Math.random() * ARC_COVERS.length));
  const [coverUrl, setCoverUrl] = useState<string | undefined>(arc?.coverUrl);
  const [books, setBooks] = useState<BookHit[]>([]);
  // "Not a book": no more cover suggestions while this sheet is open.
  const [notBook, setNotBook] = useState(false);
  const [steps, setSteps] = useState<DraftStep[]>(arc?.steps ?? []);
  const [every, setEvery] = useState(arc?.every ?? 1);
  const [slotId, setSlotId] = useState<string>(
    arc ? (arc.slotId ?? "") : (curriculum.find((s) => /growth|training|learn|develop/i.test(s.label))?.id ?? "")
  );
  const [startsOn, setStartsOn] = useState(arc?.startsOn ?? nextDate);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const context = meetingTitle(meeting, meetingSubjectName(meeting, { people, teams, managers }));

  // Looks like a book? Offer its cover. Quietly: nothing shows unless Open
  // Library has a match with a cover, and a failed lookup just shows nothing.
  const query = title.trim();
  const lookup = !notBook && !coverUrl && query.length >= 3;
  useEffect(() => {
    if (!lookup) return;
    let live = true;
    const t = setTimeout(() => {
      searchBooks(query)
        .then((hits) => live && setBooks(hits))
        .catch(() => live && setBooks([]));
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [lookup, query]);
  const suggestions = lookup ? books : [];

  const pickBook = (b: BookHit) => {
    setCoverUrl(b.coverUrl);
    if (!author.trim() && b.author) setAuthor(b.author);
  };

  const draft = async () => {
    if (!title.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      const out = await draftArc({ title, author, context });
      if (out.author && !author.trim()) setAuthor(out.author);
      // Steps already talked about stay; the draft replaces only what hasn't happened.
      const kept = steps.filter((s) => s.coveredIn?.length);
      setSteps([...kept, ...out.steps.slice(kept.length).map((s) => ({ ...s, id: uid() }))]);
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft that.");
    } finally {
      setDrafting(false);
    }
  };

  const patchStep = (id: string, patch: Partial<DraftStep>) =>
    setSteps((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) =>
    setSteps((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addStep = () => {
    const id = uid();
    setSteps((list) => [...list, { id, label: `Step ${list.length + 1}`, prompts: [] }]);
    setOpenId(id);
  };

  const clean = steps
    .map((s) => ({ ...s, label: s.label.trim() }))
    .filter((s) => s.label);
  const canSave = title.trim().length > 0 && clean.length > 0;

  const save = () => {
    if (!canSave) return;
    const full: ArcStep[] = clean.map((s) => ({
      id: s.id,
      label: s.label,
      read: s.read?.trim() || undefined,
      prompts: s.prompts.map((p) => p.trim()).filter(Boolean),
      practice: s.practice?.trim() || undefined,
      status: s.status ?? "upcoming",
      coveredIn: s.coveredIn ?? [],
      doneOn: s.doneOn,
    }));
    const common = {
      title: title.trim(),
      author: author.trim() || undefined,
      cover,
      coverUrl,
      slotId: slotId || undefined,
      every,
      startsOn,
      steps: full,
    };
    if (arc) updateArc(arc.id, common);
    else addArc({ meetingId: meeting.id, ...common });
    onClose();
  };

  return (
    <Modal
      title={arc ? "Edit arc" : "Start an arc"}
      subtitle={`Worked through on ${context}, one step per meeting`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-[10px] px-4 text-[14px] font-semibold text-secondary hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="h-10 rounded-[10px] bg-teal-600 px-4 text-[14px] font-semibold text-white shadow-xs hover:bg-teal-700 disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
          >
            {arc ? "Save" : "Start the arc"}
          </button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={label}>What are you working through?</span>
            <input
              className={field}
              value={title}
              autoFocus={!arc}
              placeholder="Crucial Conversations"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !steps.length) {
                  e.preventDefault();
                  void draft();
                }
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Author, if it's a book</span>
            <input className={field} value={author} placeholder="Optional" onChange={(e) => setAuthor(e.target.value)} />
          </label>

          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2 rounded-[12px] border border-secondary p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className={label}>Is it one of these?</span>
                <button
                  type="button"
                  onClick={() => setNotBook(true)}
                  className="text-[12px] font-semibold text-tertiary hover:text-secondary"
                >
                  Not a book
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto">
                {suggestions.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => pickBook(b)}
                    title={[b.title, b.author, b.year].filter(Boolean).join(" · ")}
                    className="group flex w-[64px] shrink-0 flex-col gap-1 text-left"
                  >
                    <ArcCover
                      arc={{ id: b.key, cover, title: b.title, coverUrl: b.coverUrl }}
                      className="transition-transform group-hover:-translate-y-0.5"
                    />
                    <span className="line-clamp-2 text-[11px] leading-[13px] text-tertiary">
                      {b.author ?? b.title}
                      {b.year ? ` · ${b.year}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-[12px] bg-secondary p-3">
            <ArcCover arc={{ id: arc?.id ?? "new", cover, coverUrl, title: title || "Your arc" }} />
            <div className="flex min-w-0 flex-col gap-2">
              <span className="truncate font-serif text-[15px] font-bold text-primary">{title || "Your arc"}</span>
              {coverUrl ? (
                <button
                  type="button"
                  onClick={() => setCoverUrl(undefined)}
                  className="self-start text-[12.5px] font-semibold text-tertiary hover:text-secondary"
                >
                  Use a plain cover instead
                </button>
              ) : (
                <span className="flex gap-1.5" role="radiogroup" aria-label="Cover">
                  {ARC_COVERS.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={cover === i}
                      aria-label={`Cover ${i + 1}`}
                      onClick={() => setCover(i)}
                      style={{ background: c }}
                      className={cx(
                        "size-5 rounded-[4px] transition-shadow",
                        cover === i && "shadow-[0_0_0_2px_var(--color-bg-secondary),0_0_0_3.5px_var(--color-gilt)]"
                      )}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Row label="Pace">
              <Seg
                value={String(every)}
                options={[
                  { value: "1", label: "Every meeting" },
                  { value: "2", label: "Every other" },
                ]}
                onChange={(v) => setEvery(Number(v))}
              />
            </Row>
            <Row label="Section">
              <select
                className={cx(field, "h-9 w-auto max-w-[200px] py-0 text-[13px]")}
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
              >
                <option value="">Its own band, first</option>
                {curriculum.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Starts">
              <input
                type="date"
                className={cx(field, "h-9 w-auto py-0 text-[13px]")}
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value || nextDate)}
              />
            </Row>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="eyebrow">Steps</span>
            {steps.length > 0 && <span className="font-mono text-[11px] text-quaternary">{steps.length}</span>}
            <button
              type="button"
              disabled={!title.trim() || drafting}
              onClick={() => void draft()}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-primary px-2.5 text-[12.5px] font-semibold text-secondary hover:bg-secondary disabled:opacity-40"
            >
              <Stars02 aria-hidden className={cx("size-3.5 text-gilt", drafting && "animate-pulse")} />
              {drafting ? "Drafting…" : steps.length ? "Redraft" : "Draft the steps"}
            </button>
          </div>
          {error && <p className="text-[12.5px] text-cond-critical-ink">{error}</p>}
          {steps.length > 0 && (
            <p className="text-[12px] text-quaternary">A draft. Check chapter numbers and pages against your edition.</p>
          )}

          {steps.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-primary p-4">
              <p className="text-[13.5px] text-secondary">
                Type a book and press <b>Draft the steps</b>: one step per chapter, each with something to talk about and
                something to try. Or start from a template.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => {
                      if (!title.trim()) setTitle(t.title);
                      setSteps(t.steps.map((label) => ({ id: uid(), label, prompts: [] })));
                    }}
                    className="h-7 rounded-full border border-primary px-2.5 text-[12px] font-semibold text-secondary hover:bg-secondary"
                  >
                    {t.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addStep}
                  className="h-7 rounded-full border border-primary px-2.5 text-[12px] font-semibold text-secondary hover:bg-secondary"
                >
                  Blank
                </button>
              </div>
            </div>
          ) : (
            <ol className="flex flex-col overflow-hidden rounded-[12px] border border-secondary bg-primary">
              {steps.map((s, i) => {
                const open = openId === s.id;
                const done = s.status === "done";
                return (
                  <li key={s.id} className={cx("border-secondary", i > 0 && "border-t", open && "bg-teal-50 dark:bg-teal-950")}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="w-5 shrink-0 font-mono text-[11.5px] text-quaternary">{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : s.id)}
                        className={cx(
                          "min-w-0 flex-1 truncate text-left text-[13.5px]",
                          done ? "text-quaternary line-through" : "text-primary"
                        )}
                      >
                        {s.label || "Untitled step"}
                      </button>
                      {s.read && <span className="hidden shrink-0 font-mono text-[11px] text-quaternary sm:inline">{s.read}</span>}
                      <span className="flex shrink-0 opacity-60 hover:opacity-100">
                        <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                          <ArrowUp className="size-3.5" />
                        </IconBtn>
                        <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                          <ArrowDown className="size-3.5" />
                        </IconBtn>
                        <IconBtn
                          label={`Remove ${s.label}`}
                          disabled={Boolean(s.coveredIn?.length)}
                          onClick={() => setSteps((list) => list.filter((x) => x.id !== s.id))}
                        >
                          <Trash01 className="size-3.5" />
                        </IconBtn>
                      </span>
                    </div>
                    {open && (
                      <div className="flex flex-col gap-2.5 px-3 pb-3 pl-10">
                        <input
                          className={cx(field, "h-9 text-[13.5px]")}
                          value={s.label}
                          aria-label="Step"
                          onChange={(e) => patchStep(s.id, { label: e.target.value })}
                        />
                        <StepField k="Read" value={s.read ?? ""} placeholder="pp. 49–68" onChange={(v) => patchStep(s.id, { read: v })} />
                        <StepField
                          k="Talk"
                          multiline
                          value={s.prompts.join("\n")}
                          placeholder="One question per line"
                          onChange={(v) => patchStep(s.id, { prompts: v.split("\n") })}
                        />
                        <StepField
                          k="Try"
                          value={s.practice ?? ""}
                          placeholder="One thing to practise before next time"
                          onChange={(v) => patchStep(s.id, { practice: v })}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
              <li className="border-t border-secondary">
                <button
                  type="button"
                  onClick={addStep}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] font-semibold text-tertiary hover:bg-secondary"
                >
                  <Plus className="size-3.5" /> Add a step
                </button>
              </li>
            </ol>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Row({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13.5px] text-tertiary">{text}</span>
      {children}
    </div>
  );
}

export function Seg({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <span className="inline-flex rounded-[9px] bg-secondary p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-[7px] px-2.5 text-[12.5px] font-semibold transition-colors",
            value === o.value ? "bg-primary text-primary shadow-xs" : "text-tertiary hover:text-secondary"
          )}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

function StepField({
  k,
  value,
  placeholder,
  onChange,
  multiline,
}: {
  k: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="grid grid-cols-[44px_1fr] items-start gap-2">
      <span className="pt-2.5 text-[10.5px] font-semibold tracking-[0.14em] text-teal-700 uppercase dark:text-teal-400">{k}</span>
      {multiline ? (
        <textarea
          rows={2}
          className={cx(field, "h-auto py-2 text-[13px] leading-[18px]")}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={cx(field, "h-9 text-[13px]")} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

function IconBtn({
  label: text,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={text}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-tertiary hover:bg-secondary hover:text-secondary disabled:opacity-30"
    >
      {children}
    </button>
  );
}
