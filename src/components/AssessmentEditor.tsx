import { useState } from "react";
import { useStore } from "../store/useStore";
import type { CustomModality, Person } from "../types";
import {
  ALL_MBTI,
  ALL_THEMES,
  DOMAIN_COLOR,
  ENNEAGRAM,
  MBTI,
  THEME_DOMAIN,
} from "../data/frameworks";
import {
  Modal,
  inputCls,
  fieldLabelCls,
  buttonPrimaryCls,
  buttonGhostCls,
} from "./ui";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

type ModalityDraft = {
  id: string;
  name: string;
  result: string;
  notes: string;
  source: CustomModality["source"];
};

export function AssessmentEditor({
  person,
  self = false,
  onClose,
}: {
  person?: Person;
  /** Edit the signed-in leader's self-assessment instead of a Person. */
  self?: boolean;
  onClose: () => void;
}) {
  const { me, updatePerson, updateMe } = useStore();
  const subject = self ? me : person;
  if (!subject) {
    throw new Error("AssessmentEditor requires person or self");
  }
  const displayName = self ? me.name : person!.name;
  const howToLeadLabel = self ? "How I work best" : "How to lead them";
  const howToLeadPlaceholder = self
    ? "What brings out your best? What should others know?"
    : "What brings out their best? What to avoid?";

  const [top5, setTop5] = useState<string[]>(
    subject.assessments.cliftonTop5 ?? []
  );
  const [enneagramType, setEnneagramType] = useState(() => {
    const m = subject.assessments.enneagram?.match(/^([1-9])/);
    return m ? m[1] : "";
  });
  const [wing, setWing] = useState(() => {
    const m = subject.assessments.enneagram?.match(/w([1-9])/);
    return m ? m[1] : "";
  });
  const [mbti, setMbti] = useState(subject.assessments.mbti ?? "");
  const [strengths, setStrengths] = useState(subject.strengths.join("\n"));
  const [watchOuts, setWatchOuts] = useState(subject.watchOuts.join("\n"));
  const [howToLead, setHowToLead] = useState(subject.howToLead ?? "");
  const [modalities, setModalities] = useState<ModalityDraft[]>(() =>
    (subject.customModalities ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      result: m.result,
      notes: m.notes ?? "",
      source: m.source,
    }))
  );

  const toggleTheme = (theme: string) => {
    setTop5((cur) =>
      cur.includes(theme)
        ? cur.filter((t) => t !== theme)
        : cur.length < 5
          ? [...cur, theme]
          : cur
    );
  };

  const wingOptions = enneagramType
    ? [
        String(((Number(enneagramType) + 7) % 9) + 1), // type - 1
        String((Number(enneagramType) % 9) + 1), // type + 1
      ]
    : [];

  const save = () => {
    const existingById = Object.fromEntries(
      (subject.customModalities ?? []).map((m) => [m.id, m])
    );
    const customModalities: CustomModality[] = modalities
      .map((m) => {
        const prev = existingById[m.id];
        return {
          id: m.id || uid(),
          name: m.name.trim(),
          result: m.result.trim(),
          source: m.source,
          ...(prev?.confidence ? { confidence: prev.confidence } : {}),
          ...(m.notes.trim() ? { notes: m.notes.trim() } : {}),
        };
      })
      .filter((m) => m.name && m.result);

    const patch = {
      assessments: {
        cliftonTop5: top5.length ? top5 : undefined,
        enneagram: enneagramType
          ? `${enneagramType}${wing ? `w${wing}` : ""}`
          : undefined,
        mbti: mbti || undefined,
      },
      strengths: strengths.split("\n").map((s) => s.trim()).filter(Boolean),
      watchOuts: watchOuts.split("\n").map((s) => s.trim()).filter(Boolean),
      howToLead: howToLead.trim() || undefined,
      customModalities,
    };

    if (self) updateMe(patch);
    else updatePerson(person!.id, patch);
    onClose();
  };

  return (
    <Modal
      title={`${self ? "My assessments" : "Assessments"} — ${displayName}`}
      onClose={onClose}
    >      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {/* CliftonStrengths */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium">CliftonStrengths Top 5</span>
            <span className="text-xs text-stone-400">
              {top5.length}/5 selected, in rank order
            </span>
          </div>
          {top5.length > 0 && (
            <ol className="mb-2 flex flex-wrap gap-1.5">
              {top5.map((t, i) => (
                <li key={t}>
                  <button
                    onClick={() => toggleTheme(t)}
                    className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: DOMAIN_COLOR[THEME_DOMAIN[t]] }}
                    title="Click to remove"
                  >
                    {i + 1}. {t} ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 dark:border-stone-800">
            {ALL_THEMES.filter((t) => !top5.includes(t)).map((t) => (
              <button
                key={t}
                onClick={() => toggleTheme(t)}
                disabled={top5.length >= 5}
                className="rounded-full border px-2 py-0.5 text-xs disabled:opacity-40"
                style={{
                  borderColor: DOMAIN_COLOR[THEME_DOMAIN[t]] + "66",
                  color: DOMAIN_COLOR[THEME_DOMAIN[t]],
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Enneagram */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={fieldLabelCls}>Enneagram type</span>
            <select
              className={inputCls}
              value={enneagramType}
              onChange={(e) => {
                setEnneagramType(e.target.value);
                setWing("");
              }}
            >
              <option value="">—</option>
              {Object.entries(ENNEAGRAM).map(([n, info]) => (
                <option key={n} value={n}>
                  {n} — {info.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={fieldLabelCls}>Wing</span>
            <select
              className={inputCls}
              value={wing}
              onChange={(e) => setWing(e.target.value)}
              disabled={!enneagramType}
            >
              <option value="">—</option>
              {wingOptions.map((w) => (
                <option key={w} value={w}>
                  w{w}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* MBTI */}
        <label className="block">
          <span className={fieldLabelCls}>MBTI</span>
          <select
            className={inputCls}
            value={mbti}
            onChange={(e) => setMbti(e.target.value)}
          >
            <option value="">—</option>
            {ALL_MBTI.map((t) => (
              <option key={t} value={t}>
                {t} — {MBTI[t].split("—")[0].trim()}
              </option>
            ))}
          </select>
        </label>

        {/* Custom modalities */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium">Other modalities</span>
            <button
              type="button"
              className="text-xs text-teal-600 hover:underline"
              onClick={() =>
                setModalities((m) => [
                  ...m,
                  {
                    id: uid(),
                    name: "",
                    result: "",
                    notes: "",
                    source: "self-report",
                  },
                ])
              }
            >
              + Add modality
            </button>
          </div>
          <p className="mb-2 text-[11px] text-stone-400">
            Working Genius, DISC, pastoral style — anything that isn’t Clifton /
            Enneagram / MBTI.
          </p>
          {modalities.length === 0 && (
            <p className="text-xs text-stone-400">None yet.</p>
          )}
          <div className="space-y-2">
            {modalities.map((m, i) => (
              <div
                key={m.id}
                className="rounded-lg border border-stone-200 p-2.5 dark:border-stone-800"
              >
                <div className="mb-1.5 flex gap-2">
                  <input
                    className={inputCls}
                    placeholder="Name"
                    value={m.name}
                    onChange={(e) =>
                      setModalities((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, name: e.target.value } : r
                        )
                      )
                    }
                  />
                  <select
                    className={`${inputCls} w-28 shrink-0`}
                    value={m.source}
                    onChange={(e) =>
                      setModalities((rows) =>
                        rows.map((r, j) =>
                          j === i
                            ? {
                                ...r,
                                source: e.target.value as CustomModality["source"],
                              }
                            : r
                        )
                      )
                    }
                  >
                    <option value="self-report">Self-report</option>
                    <option value="test">Test</option>
                    <option value="inferred">Inferred</option>
                  </select>
                  <button
                    type="button"
                    className="shrink-0 px-1 text-stone-400 hover:text-red-500"
                    aria-label="Remove modality"
                    onClick={() =>
                      setModalities((rows) => rows.filter((_, j) => j !== i))
                    }
                  >
                    ✕
                  </button>
                </div>
                <input
                  className={`${inputCls} mb-1.5`}
                  placeholder="Result"
                  value={m.result}
                  onChange={(e) =>
                    setModalities((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, result: e.target.value } : r
                      )
                    )
                  }
                />
                <input
                  className={inputCls}
                  placeholder="Notes (optional)"
                  value={m.notes}
                  onChange={(e) =>
                    setModalities((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, notes: e.target.value } : r
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Read on them */}
        <label className="block">
          <span className={fieldLabelCls}>Strengths (one per line)</span>
          <textarea
            className={`${inputCls} h-16 resize-none`}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={fieldLabelCls}>Watch-outs (one per line)</span>
          <textarea
            className={`${inputCls} h-16 resize-none`}
            value={watchOuts}
            onChange={(e) => setWatchOuts(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={fieldLabelCls}>{howToLeadLabel}</span>
          <textarea
            className={`${inputCls} h-20 resize-none`}
            value={howToLead}
            onChange={(e) => setHowToLead(e.target.value)}
            placeholder={howToLeadPlaceholder}
          />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className={buttonGhostCls} onClick={onClose}>
          Cancel
        </button>
        <button className={buttonPrimaryCls} onClick={save}>
          Save assessments
        </button>
      </div>
    </Modal>
  );
}
