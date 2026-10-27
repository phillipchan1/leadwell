import { useEffect, useMemo, useState } from "react";
import type { Arc, ArcStep, TrackedMeeting } from "../../types";
import { useStore } from "../../store/useStore";
import { Modal } from "../ui";
import { ARC_COVERS } from "../../lib/arcs";
import { draftArc } from "../../lib/arcDraft";
import { bookChapters, searchBooks, type BookHit } from "../../lib/books";
import { DEMO } from "../../lib/demo";
import { curriculumOf, plannedSlots } from "../../lib/topics";
import { meetingSubjectName, meetingTitle, todayISO } from "../../lib/readiness";
import { ArcCover } from "./ArcCover";
import { ArcStepList, newStep, type DraftStep } from "./ArcStepList";
import { Stars02 } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const uid = () => Math.random().toString(36).slice(2, 10);

const field =
  "h-10 w-full min-w-0 rounded-[10px] border border-primary bg-primary px-3 text-[14px] text-primary outline-none placeholder:text-placeholder focus:border-teal-400 dark:focus:border-teal-600";
const label = "text-[12px] font-semibold text-tertiary";

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
  initial,
  onClose,
}: {
  meeting: TrackedMeeting;
  /** Present = editing. */
  arc?: Arc;
  /** A new arc's starting point, e.g. a title spotted on the board. */
  initial?: { title?: string; startsOn?: string };
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

  const [title, setTitle] = useState(arc?.title ?? initial?.title ?? "");
  const [author, setAuthor] = useState(arc?.author ?? "");
  const [cover, setCover] = useState<number>(arc?.cover ?? Math.floor(Math.random() * ARC_COVERS.length));
  const [coverUrl, setCoverUrl] = useState<string | undefined>(arc?.coverUrl);
  // "Not a book": no more book suggestions while this sheet is open.
  const [notBook, setNotBook] = useState(false);
  const [steps, setSteps] = useState<DraftStep[]>(arc?.steps ?? []);
  const [every, setEvery] = useState(arc?.every ?? 1);
  const [slotId, setSlotId] = useState<string>(
    arc ? (arc.slotId ?? "") : (curriculum.find((s) => /growth|training|learn|develop/i.test(s.label))?.id ?? "")
  );
  const [startsOn, setStartsOn] = useState(arc?.startsOn ?? initial?.startsOn ?? nextDate);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blankFocus, setBlankFocus] = useState(false);

  const context = meetingTitle(meeting, meetingSubjectName(meeting, { people, teams, managers }));

  // ── Finding the book ──
  // Searches again on every pause in typing (title, plus the author when
  // given), cancelling the search before it, and always says what it's doing.
  type Search = { q: string; status: "searching" | "done" | "error"; hits: BookHit[] };
  const [search, setSearch] = useState<Search | null>(null);
  const [retry, setRetry] = useState(0);
  /** The book picked, and the text it was picked for: editing that text searches again. */
  const [picked, setPicked] = useState<{ key: string; title: string; query: string } | null>(null);
  const query = [title.trim(), author.trim()].filter(Boolean).join(" ");
  const untouched = Boolean(arc) && title === arc?.title && author === (arc?.author ?? "");
  // The offline demo has no Worker to ask.
  const lookup = !DEMO && !notBook && !untouched && title.trim().length >= 3 && picked?.query !== query;
  useEffect(() => {
    if (!lookup) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setSearch((prev) => ({ q: query, status: "searching", hits: prev?.hits ?? [] }));
      searchBooks(query, ctl.signal)
        .then((hits) => setSearch({ q: query, status: "done", hits }))
        .catch(() => {
          if (!ctl.signal.aborted) setSearch({ q: query, status: "error", hits: [] });
        });
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [lookup, query, retry]);

  // ── The book's chapters ──
  type ChapterState =
    | { status: "loading" }
    | { status: "found"; chapters: Pick<DraftStep, "label" | "read">[]; year?: string; applied: boolean }
    | { status: "none" | "error" };
  const [chapterState, setChapterState] = useState<ChapterState | null>(null);
  const hasHistory = steps.some((s) => s.coveredIn?.length);
  const hasSteps = steps.some((s) => s.label.trim());

  const applyChapters = (chapters: Pick<DraftStep, "label" | "read">[]) =>
    setSteps(chapters.map((c) => ({ ...newStep(c.label), read: c.read })));

  const pickBook = async (b: BookHit) => {
    const by = author.trim() || b.author || "";
    // "crucial conv" → "Crucial Conversations"; a title of their own ("… with Meghan") stays theirs.
    const typed = title.trim();
    const named = b.title.toLowerCase().startsWith(typed.toLowerCase()) ? b.title : typed;
    setTitle(named);
    setAuthor(by);
    setCoverUrl(b.coverUrl);
    setPicked({ key: b.key, title: b.title, query: [named, by].filter(Boolean).join(" ") });
    setSearch(null);
    if (hasHistory) return;
    setChapterState({ status: "loading" });
    try {
      const found = await bookChapters(b.key);
      if (!found) return setChapterState({ status: "none" });
      const apply = !hasSteps;
      if (apply) applyChapters(found.chapters);
      setChapterState({ status: "found", chapters: found.chapters, year: found.edition.year, applied: apply });
    } catch {
      setChapterState({ status: "error" });
    }
  };

  const fromBook = chapterState?.status === "found" && chapterState.applied;

  const draft = async () => {
    if (!title.trim()) return;
    setDrafting(true);
    setError(null);
    try {
      if (fromBook) {
        // The chapters are real; the draft only writes what to talk about and try.
        const out = await draftArc({ title, author, context, chapters: steps.map((s) => s.label) });
        setSteps(
          steps.map((s, i) =>
            s.coveredIn?.length
              ? s
              : { ...s, prompts: out.steps[i]?.prompts ?? s.prompts, practice: out.steps[i]?.practice ?? s.practice }
          )
        );
        return;
      }
      const out = await draftArc({ title, author, context });
      if (out.author && !author.trim()) setAuthor(out.author);
      // Steps already talked about stay; the draft replaces only what hasn't happened.
      const kept = steps.filter((s) => s.coveredIn?.length);
      setSteps([...kept, ...out.steps.slice(kept.length).map((s) => ({ ...s, id: uid() }))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft that.");
    } finally {
      setDrafting(false);
    }
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

          {lookup && search && (
            <div className="flex flex-col gap-2 rounded-[12px] border border-secondary p-3" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cx(label, "min-w-0 truncate")}>
                  {search.status === "searching"
                    ? `Looking for “${search.q}”…`
                    : search.status === "error"
                      ? "Book search isn't answering."
                      : search.hits.length
                        ? "Is it one of these?"
                        : `No book found for “${search.q}”.`}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {search.status === "error" && (
                    <button
                      type="button"
                      onClick={() => setRetry((n) => n + 1)}
                      className="text-[12px] font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setNotBook(true)}
                    className="text-[12px] font-semibold text-tertiary hover:text-secondary"
                  >
                    Not a book
                  </button>
                </span>
              </div>
              {search.status === "done" && !search.hits.length && (
                <p className="text-[12.5px] text-tertiary">Add the author to narrow it, or carry on without one.</p>
              )}
              {search.hits.length > 0 && (
                <div className={cx("flex gap-3 overflow-x-auto pb-0.5", search.status === "searching" && "opacity-50")}>
                  {search.hits.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => void pickBook(b)}
                      title={[b.title, b.author, b.year].filter(Boolean).join(" · ")}
                      className="group flex w-[72px] shrink-0 flex-col gap-1 rounded-[8px] text-left outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
                    >
                      <ArcCover
                        arc={{ id: b.key, cover, title: b.title, coverUrl: b.coverUrl }}
                        className="transition-transform group-hover:-translate-y-0.5"
                      />
                      <span className="line-clamp-2 text-[11px] leading-[13px] font-semibold text-secondary">{b.title}</span>
                      <span className="line-clamp-1 text-[10.5px] leading-[13px] text-tertiary">
                        {b.author ?? ""}
                        {b.year ? ` · ${b.year}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
              {drafting
                ? "Drafting…"
                : fromBook
                  ? "Add talk & try with AI"
                  : steps.length
                    ? "Redraft"
                    : "Draft the steps"}
            </button>
          </div>
          {error && <p className="text-[12.5px] text-cond-critical-ink">{error}</p>}
          {chapterState && (
            <p className="text-[12.5px] text-tertiary" aria-live="polite">
              {chapterState.status === "loading" && "Getting the chapters…"}
              {chapterState.status === "found" &&
                (chapterState.applied ? (
                  <>
                    {chapterState.chapters.length} chapters from Open Library
                    {chapterState.year ? ` (${chapterState.year} edition)` : ""}. Check them against your copy.
                  </>
                ) : (
                  <>
                    Open Library lists {chapterState.chapters.length} chapters for this book.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        applyChapters(chapterState.chapters);
                        setChapterState({ ...chapterState, applied: true });
                      }}
                      className="font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400"
                    >
                      Use them instead
                    </button>
                  </>
                ))}
              {chapterState.status === "none" &&
                "Open Library doesn't list this book's chapters. Draft them with AI, or type them in."}
              {chapterState.status === "error" && "Couldn't get the chapters just now. Draft them with AI, or type them in."}
            </p>
          )}
          {steps.length > 0 && !fromBook && (
            <p className="text-[12px] text-quaternary">A draft. Check chapter numbers and pages against your edition.</p>
          )}

          {steps.length === 0 ? (
            <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-primary p-4">
              <p className="text-[13.5px] text-secondary">
                Pick the book above to bring in its chapters, or press <b>Draft the steps</b> and AI lays them out with
                something to talk about and something to try. Or start from a template, or type them yourself.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => {
                      if (!title.trim()) setTitle(t.title);
                      setSteps(t.steps.map((label) => newStep(label)));
                    }}
                    className="h-7 rounded-full border border-primary px-2.5 text-[12px] font-semibold text-secondary hover:bg-secondary"
                  >
                    {t.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setBlankFocus(true);
                    setSteps([newStep()]);
                  }}
                  className="h-7 rounded-full border border-primary px-2.5 text-[12px] font-semibold text-secondary hover:bg-secondary"
                >
                  Type them
                </button>
              </div>
            </div>
          ) : (
            <ArcStepList steps={steps} onChange={setSteps} autoFocusLast={blankFocus} />
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
