import { useEffect, useRef, useState } from "react";
import { BookOpen01, Plus, Trash01 } from "@untitledui/icons";
import { TextArea } from "@/components/base/textarea/textarea";
import { useStore } from "../store/useStore";
import { applyGlossary, countPhrase, findCorrections, type Correction } from "../lib/glossary";
import { storage } from "../lib/storage";
import { cx } from "@/utils/cx";

/** A pause in typing this long and the edit so far is read for corrections. */
const SETTLE_MS = 2500;
const DISMISSED_KEY = "glossary-dismissed";
const keyOf = (c: Correction) => `${c.heard.toLowerCase()}→${c.meant}`;

/**
 * The transcript, and what fixing it teaches.
 *
 * Whenever you stop editing it — a pause, or leaving the field — the edit is
 * read for corrections ("Alayna" → "Elena"), and each one is offered back
 * once: remember it, and every stretch heard from now on is fixed the same
 * way, the rest of this transcript included. "Not this" is remembered too,
 * so the same offer never comes twice.
 */
export function TranscriptField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const glossary = useStore((s) => s.glossary);
  const addGlossaryTerm = useStore((s) => s.addGlossaryTerm);
  const [offers, setOffers] = useState<Correction[]>([]);
  const [showGlossary, setShowGlossary] = useState(false);
  const snapshot = useRef<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const notice = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const before = snapshot.current;
    const now = valueRef.current;
    if (before === null || before === now) return;
    snapshot.current = now;
    const dismissed = new Set(storage.load<string[]>(DISMISSED_KEY) ?? []);
    const known = new Set(
      useStore.getState().glossary.filter((g) => g.heard).map((g) => keyOf({ heard: g.heard!, meant: g.meant }))
    );
    const found = findCorrections(before, now).filter((c) => !dismissed.has(keyOf(c)) && !known.has(keyOf(c)));
    if (!found.length) return;
    setOffers((prev) => [...prev, ...found.filter((c) => !prev.some((p) => keyOf(p) === keyOf(c)))]);
  };

  const remember = (c: Correction) => {
    addGlossaryTerm(c.meant, c.heard);
    const fixed = applyGlossary(valueRef.current, [{ id: "", heard: c.heard, meant: c.meant, createdOn: "" }]);
    if (fixed !== valueRef.current) {
      onChange(fixed);
      snapshot.current = fixed;
    }
    setOffers((prev) => prev.filter((p) => keyOf(p) !== keyOf(c)));
  };

  const dismiss = (c: Correction) => {
    const dismissed = storage.load<string[]>(DISMISSED_KEY) ?? [];
    storage.save(DISMISSED_KEY, [...dismissed, keyOf(c)].slice(-200));
    setOffers((prev) => prev.filter((p) => keyOf(p) !== keyOf(c)));
  };

  const offer = offers[0];
  const more = offer ? countPhrase(value, offer.heard) : 0;

  return (
    <div className="flex flex-col gap-2">
      <TextArea
        aria-label="Transcript"
        size="md"
        textAreaClassName="meeting-editor-transcript"
        placeholder={placeholder}
        value={value}
        onFocus={() => {
          snapshot.current ??= valueRef.current;
        }}
        onBlur={notice}
        onChange={(next) => {
          snapshot.current ??= valueRef.current;
          onChange(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(notice, SETTLE_MS);
        }}
      />

      {offer && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[10px] bg-teal-50 px-3 py-2 text-[13px] text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
        >
          <span className="min-w-0 flex-1">
            Heard “<s className="opacity-70">{offer.heard}</s>” — always write “<b>{offer.meant}</b>”?
            {more > 0 && <span className="text-teal-700 dark:text-teal-300"> Fixes {more} more here.</span>}
          </span>
          <button
            type="button"
            onClick={() => remember(offer)}
            className="h-8 rounded-[8px] bg-teal-600 px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-stone-950"
          >
            Remember
          </button>
          <button
            type="button"
            onClick={() => dismiss(offer)}
            className="h-8 rounded-[8px] px-2.5 text-[12.5px] font-semibold text-teal-800 hover:bg-teal-100 dark:text-teal-200 dark:hover:bg-teal-900/60"
          >
            Not this
          </button>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowGlossary((v) => !v)}
          aria-expanded={showGlossary}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-tertiary hover:text-secondary"
        >
          <BookOpen01 aria-hidden className="size-3.5" />
          Glossary{glossary.length ? ` · ${glossary.length}` : ""}
        </button>
        {showGlossary && <GlossaryPanel />}
      </div>
    </div>
  );
}

/**
 * Every word the transcriber has been taught, and a way to teach one by hand —
 * a name before anyone has said it, or a spelling it keeps getting wrong.
 */
function GlossaryPanel() {
  const glossary = useStore((s) => s.glossary);
  const addGlossaryTerm = useStore((s) => s.addGlossaryTerm);
  const deleteGlossaryTerm = useStore((s) => s.deleteGlossaryTerm);
  const [heard, setHeard] = useState("");
  const [meant, setMeant] = useState("");
  const field =
    "h-8 min-w-0 flex-1 rounded-[8px] border border-primary bg-primary px-2.5 text-[13px] outline-none placeholder:text-quaternary focus:border-teal-400";

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-[12px] border border-secondary bg-primary p-3">
      <p className="text-[12px] text-tertiary">
        Names and terms the transcriber gets right because you taught it. A misheard word is fixed in
        everything heard from now on.
      </p>
      {glossary.length > 0 && (
        <ul className="flex flex-col">
          {glossary.map((g) => (
            <li key={g.id} className="group/gl flex items-center gap-2 py-1 text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                {g.heard && (
                  <>
                    <s className="text-quaternary">{g.heard}</s>
                    <span className="mx-1.5 text-quaternary">→</span>
                  </>
                )}
                <b className="font-semibold">{g.meant}</b>
              </span>
              <button
                type="button"
                aria-label={`Forget ${g.meant}`}
                onClick={() => deleteGlossaryTerm(g.id)}
                className={cx(
                  "flex size-7 items-center justify-center rounded-md text-quaternary opacity-0 transition-opacity hover:bg-secondary hover:text-secondary",
                  "group-hover/gl:opacity-100 focus-visible:opacity-100 touch:opacity-100"
                )}
              >
                <Trash01 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!meant.trim()) return;
          addGlossaryTerm(meant, heard);
          setHeard("");
          setMeant("");
        }}
      >
        <input
          aria-label="Heard as (optional)"
          placeholder="Heard as (optional)"
          value={heard}
          onChange={(e) => setHeard(e.target.value)}
          className={field}
        />
        <span aria-hidden className="text-quaternary">→</span>
        <input
          aria-label="Should be"
          placeholder="Should be"
          value={meant}
          onChange={(e) => setMeant(e.target.value)}
          className={field}
        />
        <button
          type="submit"
          disabled={!meant.trim()}
          aria-label="Add to the glossary"
          className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-teal-600 text-white disabled:opacity-40 dark:bg-teal-500 dark:text-stone-950"
        >
          <Plus className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
