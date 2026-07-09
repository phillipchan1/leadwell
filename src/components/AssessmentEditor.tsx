import { useState } from "react";
import { useStore } from "../store/useStore";
import type { Person } from "../types";
import {
  ALL_MBTI,
  ALL_THEMES,
  DOMAIN_COLOR,
  ENNEAGRAM,
  MBTI,
  THEME_DOMAIN,
} from "../data/frameworks";
import { Modal, inputCls, buttonPrimaryCls, buttonGhostCls } from "./ui";

export function AssessmentEditor({
  person,
  onClose,
}: {
  person: Person;
  onClose: () => void;
}) {
  const { updatePerson } = useStore();
  const [top5, setTop5] = useState<string[]>(
    person.assessments.cliftonTop5 ?? []
  );
  const [enneagramType, setEnneagramType] = useState(() => {
    const m = person.assessments.enneagram?.match(/^([1-9])/);
    return m ? m[1] : "";
  });
  const [wing, setWing] = useState(() => {
    const m = person.assessments.enneagram?.match(/w([1-9])/);
    return m ? m[1] : "";
  });
  const [mbti, setMbti] = useState(person.assessments.mbti ?? "");
  const [strengths, setStrengths] = useState(person.strengths.join("\n"));
  const [watchOuts, setWatchOuts] = useState(person.watchOuts.join("\n"));
  const [howToLead, setHowToLead] = useState(person.howToLead ?? "");

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
    updatePerson(person.id, {
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
    });
    onClose();
  };

  return (
    <Modal title={`Assessments — ${person.name}`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
          <label className="block text-sm">
            <span className="mb-1 block text-stone-500">Enneagram type</span>
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
          <label className="block text-sm">
            <span className="mb-1 block text-stone-500">Wing</span>
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
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">MBTI</span>
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

        {/* Read on them */}
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">
            Strengths (one per line)
          </span>
          <textarea
            className={`${inputCls} h-16 resize-none`}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">
            Watch-outs (one per line)
          </span>
          <textarea
            className={`${inputCls} h-16 resize-none`}
            value={watchOuts}
            onChange={(e) => setWatchOuts(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-stone-500">How to lead them</span>
          <textarea
            className={`${inputCls} h-20 resize-none`}
            value={howToLead}
            onChange={(e) => setHowToLead(e.target.value)}
            placeholder="What brings out their best? What to avoid?"
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
