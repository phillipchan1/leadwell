import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import { confirmAction } from "./ConfirmDialog";
import { SectionTitle } from "./ui";
import { Input } from "@/components/base/input/input";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";

/**
 * Value banked with someone I report to, in *their* currency — recallable
 * evidence for reviews, asks, and comp conversations. Keyed by subject id, so
 * it serves both up-team people and manager nodes.
 */
export function WinsLedger({ subjectId }: { subjectId: string }) {
  // Select the stable slice and derive here — filtering inside the selector
  // hands zustand a fresh array every render, which it treats as a changed
  // snapshot and loops on.
  const allWins = useStore((s) => s.wins);
  const wins = useMemo(
    () =>
      allWins
        .filter((w) => w.personId === subjectId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [allWins, subjectId]
  );
  const addWin = useStore((s) => s.addWin);
  const deleteWin = useStore((s) => s.deleteWin);

  const [text, setText] = useState("");
  const [impact, setImpact] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addWin({
      personId: subjectId,
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
        <p className="mt-1 text-caption text-quaternary">
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
                <span className="text-caption tabular-nums text-quaternary">
                  {w.date}
                </span>
                <ButtonUtility
                  size="xs"
                  color="tertiary"
                  icon={X}
                  tooltip="Delete win"
                  className="opacity-0 touch:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                  onClick={async () => {
                    if (
                      await confirmAction({
                        title: "Remove this win?",
                        body: "It stops counting as evidence in your next review or ask.",
                        confirmLabel: "Remove",
                      })
                    )
                      deleteWin(w.id);
                  }}
                />
              </div>
            </div>
          </li>
        ))}
        {wins.length === 0 && (
          <li className="rounded-xl border border-dashed border-primary py-4 text-center text-xs text-quaternary">
            Nothing banked yet — log the next thing you deliver.
          </li>
        )}
      </ul>

      <form onSubmit={submit} className="space-y-2">
        <Input
          size="md"
          placeholder="Log a win…"
          value={text}
          onChange={setText}
        />
        {text.trim() && (
          <Input
            size="sm"
            placeholder="Impact in their language (optional)…"
            value={impact}
            onChange={setImpact}
          />
        )}
      </form>
    </section>
  );
}
