import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Assessments, Person } from "../types";
import {
  draftProfileFromBrainDump,
  hasApiKey,
  profileFieldsFor,
  type ProfileDraft,
} from "../lib/ai";
import { Chip, buttonGhostCls, buttonPrimaryCls } from "./ui";

type RowState = { accepted: boolean; text: string };

const CONFIDENCE_TONE = {
  high: "positive",
  medium: "warning",
  low: "neutral",
} as const;

export function ProfileFillModal({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) {
  const { teams, updatePerson, updateLeadUp } = useStore();
  const team = teams.find((t) => t.id === person.teamId);
  const direction: "up" | "down" = team?.direction === "up" ? "up" : "down";
  const fields = profileFieldsFor(direction);
  const defOf = (key: string) => fields.find((f) => f.key === key);

  const [brainDump, setBrainDump] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const noKey = !hasApiKey();

  const runDraft = async () => {
    if (!brainDump.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await draftProfileFromBrainDump(person.id, brainDump);
      setDraft(result);
      const initial: Record<string, RowState> = {};
      for (const sg of result.suggestions) {
        const def = defOf(sg.field);
        if (!def) continue;
        const text = Array.isArray(sg.value)
          ? sg.value.join("\n")
          : String(sg.value);
        // Confident fields are pre-accepted; low-confidence is opt-in.
        initial[sg.field] = { accepted: sg.confidence !== "low", text };
      }
      setRows(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const acceptedCount = Object.values(rows).filter((r) => r.accepted).length;

  const apply = () => {
    if (!draft) return;
    const personPatch: Partial<Person> = {};
    const assessmentsPatch: Assessments = { ...person.assessments };
    let touchedAssessments = false;
    const leadUpPatch: Record<string, string> = {};

    for (const sg of draft.suggestions) {
      const row = rows[sg.field];
      const def = defOf(sg.field);
      if (!row || !row.accepted || !def) continue;
      const raw = row.text.trim();
      if (!raw) continue;

      if (def.kind === "list") {
        const items = raw
          .split("\n")
          .map((x) => x.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
        const listKey = def.key === "watchOuts" ? "watchOuts" : "strengths";
        const existing = person[listKey] ?? [];
        const merged = [...existing];
        for (const item of items) {
          if (!merged.some((e) => e.toLowerCase() === item.toLowerCase())) {
            merged.push(item);
          }
        }
        personPatch[listKey] = merged;
      } else if (def.target === "leadUp") {
        leadUpPatch[def.key] = raw;
      } else if (def.target === "assessments") {
        if (def.key === "enneagram") assessmentsPatch.enneagram = raw;
        else if (def.key === "mbti") assessmentsPatch.mbti = raw;
        touchedAssessments = true;
      } else {
        // person text field (howToLead)
        personPatch.howToLead = raw;
      }
    }

    if (touchedAssessments) personPatch.assessments = assessmentsPatch;
    if (Object.keys(personPatch).length) updatePerson(person.id, personPatch);
    if (Object.keys(leadUpPatch).length) updateLeadUp(person.id, leadUpPatch);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`AI fill profile for ${person.name}`}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
          <div>
            <h2 className="text-base font-semibold">
              ✨ AI fill — {person.name}
            </h2>
            <p className="text-[11px] text-stone-400">
              {direction === "up"
                ? "Draft the operating manual from what you know."
                : "Draft their profile from what you know."}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {noKey && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Add your Anthropic API key in Settings to use AI fill.
            </div>
          )}

          {!draft && (
            <div className="space-y-3">
              <textarea
                className="h-56 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-stone-700 dark:bg-stone-950"
                placeholder={
                  direction === "up"
                    ? `Tell me everything about ${person.name.split(" ")[0]} — how they run things, what they reward, what stresses them, what their boss cares about, how they like updates…`
                    : `Tell me everything about ${person.name.split(" ")[0]} — how they work, what they're great at, where they struggle, what motivates them, how they take feedback…`
                }
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
                autoFocus
              />
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}
              <div className="flex justify-end">
                <button
                  className={buttonPrimaryCls}
                  onClick={runDraft}
                  disabled={loading || noKey || !brainDump.trim()}
                >
                  {loading ? "Reading…" : "Draft profile"}
                </button>
              </div>
            </div>
          )}

          {draft && (
            <div className="space-y-4">
              {draft.headline && (
                <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-sm text-stone-700 dark:bg-teal-950/20 dark:text-stone-200">
                  {draft.headline}
                </div>
              )}

              {draft.suggestions.length === 0 && (
                <p className="text-sm text-stone-500">
                  Couldn't pull structured fields from that. Try adding more
                  specifics and drafting again.
                </p>
              )}

              {draft.suggestions.map((sg) => {
                const def = defOf(sg.field);
                if (!def) return null;
                const row = rows[sg.field];
                if (!row) return null;
                return (
                  <div
                    key={sg.field}
                    className={`rounded-xl border p-3 transition-colors ${
                      row.accepted
                        ? "border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900"
                        : "border-dashed border-stone-200 bg-stone-50/60 opacity-70 dark:border-stone-800 dark:bg-stone-950/40"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-stone-700 dark:text-stone-200">
                        <input
                          type="checkbox"
                          className="accent-teal-600"
                          checked={row.accepted}
                          onChange={(e) =>
                            setRows((r) => ({
                              ...r,
                              [sg.field]: {
                                ...r[sg.field],
                                accepted: e.target.checked,
                              },
                            }))
                          }
                        />
                        {def.label}
                      </label>
                      <Chip tone={CONFIDENCE_TONE[sg.confidence]}>
                        {sg.confidence}
                      </Chip>
                    </div>
                    <textarea
                      className="w-full resize-none rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[0.8rem] leading-relaxed outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 dark:border-stone-700 dark:bg-stone-950"
                      rows={def.kind === "list" ? 3 : 2}
                      value={row.text}
                      onChange={(e) =>
                        setRows((r) => ({
                          ...r,
                          [sg.field]: { ...r[sg.field], text: e.target.value },
                        }))
                      }
                    />
                    {def.kind === "list" && (
                      <div className="mt-0.5 text-[10px] text-stone-400">
                        One per line.
                      </div>
                    )}
                    <div className="mt-1 text-[10px] text-stone-400">
                      Why: {sg.rationale}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {draft && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-800">
            <button
              className={buttonGhostCls}
              onClick={() => {
                setDraft(null);
                setRows({});
              }}
            >
              ← Start over
            </button>
            <button
              className={buttonPrimaryCls}
              onClick={apply}
              disabled={acceptedCount === 0}
            >
              Apply {acceptedCount} field{acceptedCount === 1 ? "" : "s"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
