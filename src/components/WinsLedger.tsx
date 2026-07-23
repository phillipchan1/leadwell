import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Person } from "../types";
import { SectionTitle } from "./ui";

/**
 * Value banked with a person I report to, in *their* currency — recallable
 * evidence for reviews, asks, and comp conversations.
 */
export function WinsLedger({ person }: { person: Person }) {
  const wins = useStore((s) =>
    s.wins
      .filter((w) => w.personId === person.id)
      .sort((a, b) => b.date.localeCompare(a.date))
  );
  const addWin = useStore((s) => s.addWin);
  const deleteWin = useStore((s) => s.deleteWin);

  const [text, setText] = useState("");
  const [impact, setImpact] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addWin({
      personId: person.id,
      text: text.trim(),
      impact: impact.trim() || undefined,
    });
    setText("");
    setImpact("");
  };

  return (
    <section className="space-y-3">
      <div>
        <SectionTitle>Wins banked</SectionTitle>
        <p className="mt-1 text-[11px] text-stone-400">
          Value delivered, phrased in their currency. Pull these up at reviews
          and before you ask for anything.
        </p>
      </div>

      <ul className="space-y-2">
        {wins.map((w) => (
          <li
            key={w.id}
            className="group rounded-xl border-l-2 border-emerald-500 bg-emerald-50/50 p-3 dark:bg-emerald-950/20"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm text-stone-700 dark:text-stone-200">
                  {w.text}
                </div>
                {w.impact && (
                  <div className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                    {w.impact}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[10px] tabular-nums text-stone-400">
                  {w.date}
                </span>
                <button
                  type="button"
                  className="text-stone-300 opacity-0 group-hover:opacity-100 hover:text-red-500"
                  aria-label="Delete win"
                  onClick={() => deleteWin(w.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}
        {wins.length === 0 && (
          <li className="rounded-xl border border-dashed border-stone-300 py-4 text-center text-xs text-stone-400 dark:border-stone-700">
            Nothing banked yet — log the next thing you deliver.
          </li>
        )}
      </ul>

      <form onSubmit={submit} className="space-y-2">
        <input
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-stone-700 dark:bg-stone-950"
          placeholder="Log a win…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {text.trim() && (
          <input
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-stone-700 dark:bg-stone-950"
            placeholder="Impact in their language (optional)…"
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
          />
        )}
      </form>
    </section>
  );
}
