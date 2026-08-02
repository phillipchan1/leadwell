import { useMemo, useState } from "react";
import { useStore } from "../store/useStore";
import type { Assessments, CustomModality, Person } from "../types";
import {
  draftProfileFromBrainDump,
  hasApiKey,
  nextProfileProbeQuestion,
  probeTurnsToBrainDump,
  profileFieldsFor,
  type CustomModalitySuggestion,
  type ProbeTurn,
  type ProfileDirection,
  type ProfileDraft,
  type ProfileSuggestion,
  type ProfileTargetId,
} from "../lib/ai";
import {
  extractProfileSignals,
  liveReadFromDraft,
} from "../lib/profileSignals";
import { ProfileBuildCanvas } from "./ProfileBuildCanvas";
import { Badge } from "@/components/base/badges/badges";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { TextArea } from "@/components/base/textarea/textarea";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";

type RowState = { accepted: boolean; text: string };

const CONFIDENCE_COLOR = {
  high: "success",
  medium: "warning",
  low: "gray",
} as const;

const GROUP_ORDER = ["leadUp", "traits", "known", "custom"] as const;
const GROUP_LABEL: Record<(typeof GROUP_ORDER)[number], string> = {
  leadUp: "Operating manual",
  traits: "Traits",
  known: "Known assessments",
  custom: "Custom modalities",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type EntryMode = "choose" | "dump" | "probe";

export function ProfileFillModal({
  person,
  self = false,
  onClose,
}: {
  person?: Person;
  self?: boolean;
  onClose: () => void;
}) {
  const { me, teams, updatePerson, updateLeadUp, updateMe } = useStore();
  const targetId: ProfileTargetId = self ? "me" : person!.id;
  const displayName = self ? me.name : person!.name;
  const team = self ? undefined : teams.find((t) => t.id === person!.teamId);
  const direction: ProfileDirection = self
    ? "self"
    : team?.direction === "up"
      ? "up"
      : "down";
  const fields = profileFieldsFor(direction);
  const defOf = (key: string) => fields.find((f) => f.key === key);

  const [entry, setEntry] = useState<EntryMode>("choose");
  const [brainDump, setBrainDump] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [modalityRows, setModalityRows] = useState<
    Record<number, RowState & { name: string; result: string; notes: string }>
  >({});

  // Probe state
  const [probeTurns, setProbeTurns] = useState<ProbeTurn[]>([]);
  const [probeQuestion, setProbeQuestion] = useState<string | null>(null);
  const [probeAnswer, setProbeAnswer] = useState("");
  const [probeStarting, setProbeStarting] = useState(false);

  const noKey = !hasApiKey();

  const liveSourceText = useMemo(() => {
    if (draft) return "";
    if (entry === "dump") return brainDump;
    if (entry === "probe") {
      const answered = probeTurnsToBrainDump(probeTurns);
      const current =
        probeQuestion && probeAnswer.trim()
          ? `Q: ${probeQuestion}\nA: ${probeAnswer.trim()}`
          : "";
      return [answered, current].filter(Boolean).join("\n\n");
    }
    return "";
  }, [draft, entry, brainDump, probeTurns, probeQuestion, probeAnswer]);

  const liveRead = useMemo(() => {
    if (draft) return liveReadFromDraft(draft, direction);
    return extractProfileSignals(liveSourceText, direction);
  }, [draft, direction, liveSourceText]);

  const ingestDraft = (result: ProfileDraft) => {
    setDraft(result);
    const initial: Record<string, RowState> = {};
    for (const sg of result.suggestions) {
      const def = defOf(sg.field);
      if (!def) continue;
      const text = Array.isArray(sg.value)
        ? sg.value.join("\n")
        : String(sg.value);
      initial[sg.field] = { accepted: sg.confidence !== "low", text };
    }
    setRows(initial);
    const modInitial: Record<
      number,
      RowState & { name: string; result: string; notes: string }
    > = {};
    result.modalities.forEach((m, i) => {
      modInitial[i] = {
        accepted: m.confidence !== "low",
        text: "",
        name: m.name,
        result: m.result,
        notes: m.notes ?? "",
      };
    });
    setModalityRows(modInitial);
  };

  const runDraftFromText = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await draftProfileFromBrainDump(targetId, text);
      ingestDraft(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const startProbe = async () => {
    setEntry("probe");
    setProbeStarting(true);
    setError(null);
    setProbeTurns([]);
    setProbeAnswer("");
    try {
      const next = await nextProfileProbeQuestion(targetId, []);
      if (next.done) {
        setError("Couldn't start the interview. Try a brain dump instead.");
        setEntry("choose");
      } else {
        setProbeQuestion(next.question);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setEntry("choose");
    } finally {
      setProbeStarting(false);
    }
  };

  const submitProbeAnswer = async (draftNow = false) => {
    if (loading) return;
    const answer = probeAnswer.trim();
    if (!draftNow && (!answer || !probeQuestion)) return;

    const turns = [...probeTurns];
    if (probeQuestion && answer) {
      turns.push({ question: probeQuestion, answer });
      setProbeTurns(turns);
      setProbeAnswer("");
    }
    if (turns.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      if (draftNow) {
        const result = await draftProfileFromBrainDump(
          targetId,
          probeTurnsToBrainDump(turns)
        );
        ingestDraft(result);
        return;
      }
      const next = await nextProfileProbeQuestion(targetId, turns);
      if (next.done) {
        const result = await draftProfileFromBrainDump(
          targetId,
          probeTurnsToBrainDump(turns)
        );
        ingestDraft(result);
      } else {
        setProbeQuestion(next.question);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };
  const acceptedFieldCount = Object.values(rows).filter((r) => r.accepted).length;
  const acceptedModCount = Object.values(modalityRows).filter(
    (r) => r.accepted
  ).length;
  const acceptedCount = acceptedFieldCount + acceptedModCount;

  const apply = () => {
    if (!draft) return;
    const subject = self ? me : person!;
    const personPatch: Partial<Person> = {};
    const assessmentsPatch: Assessments = { ...subject.assessments };
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
        if (def.key === "cliftonTop5") {
          assessmentsPatch.cliftonTop5 = items.slice(0, 5);
          touchedAssessments = true;
        } else {
          const listKey = def.key === "watchOuts" ? "watchOuts" : "strengths";
          const existing = subject[listKey] ?? [];
          const merged = [...existing];
          for (const item of items) {
            if (!merged.some((e) => e.toLowerCase() === item.toLowerCase())) {
              merged.push(item);
            }
          }
          personPatch[listKey] = merged;
        }
      } else if (def.target === "leadUp") {
        leadUpPatch[def.key] = raw;
      } else if (def.target === "assessments") {
        if (def.key === "enneagram") assessmentsPatch.enneagram = raw;
        else if (def.key === "mbti") assessmentsPatch.mbti = raw;
        touchedAssessments = true;
      } else {
        personPatch.howToLead = raw;
      }
    }

    const existingMods = [...(subject.customModalities ?? [])];
    draft.modalities.forEach((m, i) => {
      const row = modalityRows[i];
      if (!row?.accepted) return;
      const name = row.name.trim();
      const result = row.result.trim();
      if (!name || !result) return;
      const next: CustomModality = {
        id: uid(),
        name,
        result,
        source: m.source,
        confidence: m.confidence,
        ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
      };
      const idx = existingMods.findIndex(
        (e) => e.name.toLowerCase() === name.toLowerCase()
      );
      if (idx >= 0) {
        existingMods[idx] = {
          ...existingMods[idx],
          ...next,
          id: existingMods[idx].id,
        };
      } else {
        existingMods.push(next);
      }
    });
    if (
      existingMods.length !== (subject.customModalities?.length ?? 0) ||
      acceptedModCount > 0
    ) {
      personPatch.customModalities = existingMods;
    }

    if (touchedAssessments) personPatch.assessments = assessmentsPatch;

    if (self) {
      updateMe(personPatch);
    } else {
      if (Object.keys(personPatch).length) updatePerson(person!.id, personPatch);
      if (Object.keys(leadUpPatch).length) updateLeadUp(person!.id, leadUpPatch);
    }
    onClose();
  };

  const suggestionsByGroup = (group: (typeof GROUP_ORDER)[number]) => {
    if (!draft) return [] as ProfileSuggestion[];
    return draft.suggestions.filter((sg) => defOf(sg.field)?.group === group);
  };

  const hasAnySuggestions =
    draft && (draft.suggestions.length > 0 || draft.modalities.length > 0);

  const resetAll = () => {
    setDraft(null);
    setRows({});
    setModalityRows({});
    setEntry("choose");
    setBrainDump("");
    setProbeTurns([]);
    setProbeQuestion(null);
    setProbeAnswer("");
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`AI fill profile for ${displayName}`}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone-200 px-5 py-3 dark:border-stone-800">
          <div>
            <h2 className="text-base font-semibold">
              ✨ AI fill — {self ? "me" : displayName}
            </h2>
            <p className="text-[11px] text-stone-400">
              {self
                ? "Watch the profile assemble as you type — then draft with AI."
                : "Live build as you type · or guided mapping if you’re still figuring them out."}
            </p>
          </div>
          <ButtonUtility
            size="sm"
            color="tertiary"
            icon={X}
            tooltip="Close"
            onClick={onClose}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {noKey && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Sign in with AI configured to use AI fill.
            </div>
          )}

          {!draft && entry === "choose" && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={noKey}
                onClick={() => setEntry("dump")}
                className="w-full rounded-xl border border-stone-200 p-4 text-left hover:border-teal-400 dark:border-stone-700 disabled:opacity-50"
              >
                <div className="text-sm font-medium">I can brain-dump</div>
                <div className="mt-0.5 text-xs text-stone-500">
                  Type freely — watch completeness & frameworks light up live.
                </div>
              </button>
              <button
                type="button"
                disabled={noKey || probeStarting}
                onClick={startProbe}
                className="w-full rounded-xl border border-stone-200 p-4 text-left hover:border-teal-400 dark:border-stone-700 disabled:opacity-50"
              >
                <div className="text-sm font-medium">
                  {probeStarting
                    ? "Starting…"
                    : self
                      ? "Help me map myself"
                      : "Help me map them"}
                </div>
                <div className="mt-0.5 text-xs text-stone-500">
                  Guided mapping — the canvas fills as you answer.
                </div>
              </button>
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>
          )}

          {!draft && entry === "dump" && (
            <div className="profile-fill-split">
              <div className="flex flex-col space-y-3">
                <TextArea
                  aria-label="Brain dump"
                  size="md"
                  className="flex-1"
                  textAreaClassName="min-h-[14rem] flex-1 resize-none leading-relaxed"
                  placeholder={
                    self
                      ? `Tell me about yourself — how you work, what you're great at, where you struggle, any Clifton / Working Genius / other results…`
                      : direction === "up"
                        ? `Tell me everything about ${displayName.split(" ")[0]} — how they run things, what they reward, what stresses them…`
                        : `Tell me everything about ${displayName.split(" ")[0]} — how they work, strengths, struggles, assessments…`
                  }
                  value={brainDump}
                  onChange={setBrainDump}
                  autoFocus
                />
                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </div>
                )}
                <div className="flex justify-between">
                  <Button
                    size="md"
                    color="secondary"
                    onClick={() => setEntry("choose")}
                  >
                    ← Back
                  </Button>
                  <Button
                    size="md"
                    onClick={() => runDraftFromText(brainDump)}
                    isDisabled={loading || noKey || !brainDump.trim()}
                    isLoading={loading}
                    showTextWhileLoading
                  >
                    {loading ? "Reading…" : "Draft with AI"}
                  </Button>
                </div>
              </div>
              <ProfileBuildCanvas
                read={liveRead}
                parsing={loading}
                emptyHint="Type a theme (Woo, Empathy…), a trait, or Working Genius — watch it land."
              />
            </div>
          )}

          {!draft && entry === "probe" && (
            <div className="profile-fill-split">
              <div className="flex flex-col space-y-3">
                {probeTurns.length > 0 && (
                  <div className="max-h-28 space-y-2 overflow-y-auto rounded-lg bg-stone-50 p-2 text-[11px] text-stone-500 dark:bg-stone-950/50">
                    {probeTurns.map((t, i) => (
                      <div key={i}>
                        <div className="font-medium text-stone-600 dark:text-stone-300">
                          Q{i + 1}. {t.question}
                        </div>
                        <div className="pl-2">{t.answer}</div>
                      </div>
                    ))}
                  </div>
                )}
                {probeQuestion && (
                  <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-sm text-stone-700 dark:bg-teal-950/20 dark:text-stone-200">
                    {probeQuestion}
                  </div>
                )}
                <TextArea
                  aria-label="Your answer"
                  size="md"
                  textAreaClassName="h-28 resize-none leading-relaxed"
                  placeholder="Your answer…"
                  value={probeAnswer}
                  onChange={setProbeAnswer}
                  autoFocus
                  isDisabled={loading || !probeQuestion}
                />
                {error && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button size="md" color="secondary" onClick={resetAll}>
                    ← Start over
                  </Button>
                  <div className="flex gap-2">
                    {probeTurns.length > 0 && (
                      <Button
                        size="md"
                        color="secondary"
                        onClick={() => submitProbeAnswer(true)}
                        isDisabled={loading}
                        isLoading={loading}
                        showTextWhileLoading
                      >
                        {loading ? "Drafting…" : "Draft now"}
                      </Button>
                    )}
                    <Button
                      size="md"
                      onClick={() => submitProbeAnswer(false)}
                      isDisabled={loading || !probeAnswer.trim()}
                      isLoading={loading}
                      showTextWhileLoading
                    >
                      {loading ? "…" : "Next"}
                    </Button>
                  </div>
                </div>
              </div>
              <ProfileBuildCanvas
                read={liveRead}
                parsing={loading}
                emptyHint="Answer as you go — guided mapping fills the canvas from each reply."
              />
            </div>
          )}

          {draft && (
            <div className="profile-fill-split">
              <div className="space-y-4">
              {draft.headline && (
                <div className="rounded-xl border-l-2 border-teal-500 bg-teal-50/50 p-3 text-sm text-stone-700 dark:bg-teal-950/20 dark:text-stone-200">
                  {draft.headline}
                </div>
              )}

              {!hasAnySuggestions && (
                <p className="text-sm text-stone-500">
                  Couldn't pull structured fields from that. Try adding more
                  specifics and drafting again.
                </p>
              )}

              {GROUP_ORDER.map((group) => {
                if (group === "custom") {
                  if (!draft.modalities.length) return null;
                  return (
                    <div key={group} className="space-y-2">
                      <div className="text-[10px] font-medium tracking-wider text-stone-400 uppercase">
                        {GROUP_LABEL.custom}
                      </div>
                      {draft.modalities.map((m, i) => (
                        <ModalityRow
                          key={i}
                          suggestion={m}
                          row={modalityRows[i]}
                          onChange={(patch) =>
                            setModalityRows((r) => ({
                              ...r,
                              [i]: { ...r[i], ...patch },
                            }))
                          }
                        />
                      ))}
                    </div>
                  );
                }

                const items = suggestionsByGroup(group);
                if (!items.length) return null;
                return (
                  <div key={group} className="space-y-2">
                    <div className="text-[10px] font-medium tracking-wider text-stone-400 uppercase">
                      {GROUP_LABEL[group]}
                    </div>
                    {items.map((sg) => {
                      const def = defOf(sg.field);
                      if (!def) return null;
                      const row = rows[sg.field];
                      if (!row) return null;
                      return (
                        <SuggestionRow
                          key={sg.field}
                          label={def.label}
                          kind={def.kind}
                          suggestion={sg}
                          row={row}
                          onChange={(patch) =>
                            setRows((r) => ({
                              ...r,
                              [sg.field]: { ...r[sg.field], ...patch },
                            }))
                          }
                        />
                      );
                    })}
                  </div>
                );
              })}
              </div>
              <div className="sticky top-0 self-start">
                <ProfileBuildCanvas
                  read={liveRead}
                  emptyHint="AI draft mapped onto the live canvas."
                />
              </div>
            </div>
          )}
        </div>

        {draft && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-800">
            <Button size="md" color="secondary" onClick={resetAll}>
              ← Start over
            </Button>
            <Button size="md" onClick={apply} isDisabled={acceptedCount === 0}>
              Apply {acceptedCount} field{acceptedCount === 1 ? "" : "s"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({
  label,
  kind,
  suggestion,
  row,
  onChange,
}: {
  label: string;
  kind: "text" | "list";
  suggestion: ProfileSuggestion;
  row: RowState;
  onChange: (patch: Partial<RowState>) => void;
}) {
  return (
    <div
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
            onChange={(e) => onChange({ accepted: e.target.checked })}
          />
          {label}
        </label>
        <Badge size="sm" color={CONFIDENCE_COLOR[suggestion.confidence]}>
          {suggestion.confidence}
        </Badge>
      </div>
      <TextArea
        aria-label={label}
        size="sm"
        textAreaClassName="resize-none leading-relaxed"
        rows={kind === "list" ? 3 : 2}
        value={row.text}
        onChange={(text) => onChange({ text })}
      />
      {kind === "list" && (
        <div className="mt-0.5 text-[10px] text-stone-400">One per line.</div>
      )}
      <div className="mt-1 text-[10px] text-stone-400">
        Why: {suggestion.rationale}
      </div>
    </div>
  );
}

function ModalityRow({
  suggestion,
  row,
  onChange,
}: {
  suggestion: CustomModalitySuggestion;
  row:
    | (RowState & { name: string; result: string; notes: string })
    | undefined;
  onChange: (
    patch: Partial<RowState & { name: string; result: string; notes: string }>
  ) => void;
}) {
  if (!row) return null;
  return (
    <div
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
            onChange={(e) => onChange({ accepted: e.target.checked })}
          />
          Custom modality
        </label>
        <Badge size="sm" color={CONFIDENCE_COLOR[suggestion.confidence]}>
          {suggestion.confidence}
        </Badge>
      </div>
      <Input
        size="sm"
        className="mb-1.5"
        value={row.name}
        onChange={(name) => onChange({ name })}
        placeholder="Name (e.g. Working Genius)"
      />
      <TextArea
        aria-label="Result"
        size="sm"
        textAreaClassName="resize-none leading-relaxed"
        rows={2}
        value={row.result}
        onChange={(result) => onChange({ result })}
        placeholder="Result"
      />
      <Input
        size="sm"
        className="mt-1.5"
        value={row.notes}
        onChange={(notes) => onChange({ notes })}
        placeholder="Notes (optional)"
      />
      <div className="mt-1 text-[10px] text-stone-400">
        {suggestion.source} · Why: {suggestion.rationale}
      </div>
    </div>
  );
}
