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
import { Modal } from "./ui";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { NativeSelect } from "@/components/base/select/select-native";
import { TextArea } from "@/components/base/textarea/textarea";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { X } from "@untitledui/icons";

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
  const me = useStore((s) => s.me);
  const updatePerson = useStore((s) => s.updatePerson);
  const updateMe = useStore((s) => s.updateMe);
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
  // 34 themes in a 144px scroll box is the wrong control for a thumb no matter
  // how big the chips are. Typing three letters is how you find "Woo".
  const [themeQuery, setThemeQuery] = useState("");
  const visibleThemes = ALL_THEMES.filter(
    (t) =>
      !top5.includes(t) && t.toLowerCase().includes(themeQuery.trim().toLowerCase())
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
      footer={
        <>
          <Button size="md" color="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" onClick={save}>
            Save assessments
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* CliftonStrengths */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium">CliftonStrengths Top 5</span>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {top5.length}/5 selected, in rank order
            </span>
          </div>
          {top5.length > 0 && (
            <ol className="mb-2 flex flex-wrap gap-1.5">
              {top5.map((t, i) => (
                <li key={t}>
                  <button
                    onClick={() => toggleTheme(t)}
                    /* Tapping removes, so this one especially can't be a 22px
                       target sitting 4px from its neighbour. Padding grows on
                       touch; the type doesn't, so the desktop weight is
                       unchanged. */
                    className="outline-focus-ring touch:min-h-11 touch:px-3.5 rounded-full px-2 py-0.5 text-xs font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ backgroundColor: DOMAIN_COLOR[THEME_DOMAIN[t]] }}
                    title="Click to remove"
                    aria-label={`Remove ${t} from the top five`}
                  >
                    {i + 1}. {t} ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
          <Input
            size="sm"
            className="mb-1.5"
            placeholder="Find a theme…"
            aria-label="Find a CliftonStrengths theme"
            value={themeQuery}
            onChange={setThemeQuery}
            isDisabled={top5.length >= 5}
          />
          <div className="scroll-contain touch:max-h-72 flex max-h-36 flex-wrap gap-1 overflow-y-auto rounded-lg border border-stone-200 p-2 touch:gap-2 dark:border-stone-800">
            {visibleThemes.map((t) => (
              <button
                key={t}
                onClick={() => toggleTheme(t)}
                disabled={top5.length >= 5}
                className="outline-focus-ring touch:min-h-11 touch:px-3.5 rounded-full border px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
                style={{
                  borderColor: DOMAIN_COLOR[THEME_DOMAIN[t]] + "66",
                  color: DOMAIN_COLOR[THEME_DOMAIN[t]],
                }}
              >
                {t}
              </button>
            ))}
            {visibleThemes.length === 0 && (
              <p className="px-1 py-2 text-xs text-stone-500 dark:text-stone-400">
                No theme matches "{themeQuery}".
              </p>
            )}
          </div>
        </div>

        {/* Enneagram */}
        <div className="grid grid-cols-2 gap-3">
          <NativeSelect
            label="Enneagram type"
            size="md"
            value={enneagramType}
            onChange={(e) => {
              setEnneagramType(e.target.value);
              setWing("");
            }}
            options={[
              { label: "—", value: "" },
              ...Object.entries(ENNEAGRAM).map(([n, info]) => ({
                label: `${n} — ${info.name}`,
                value: n,
              })),
            ]}
          />
          <NativeSelect
            label="Wing"
            size="md"
            value={wing}
            onChange={(e) => setWing(e.target.value)}
            disabled={!enneagramType}
            options={[
              { label: "—", value: "" },
              ...wingOptions.map((w) => ({ label: `w${w}`, value: w })),
            ]}
          />
        </div>

        {/* MBTI */}
        <NativeSelect
          label="MBTI"
          size="md"
          value={mbti}
          onChange={(e) => setMbti(e.target.value)}
          options={[
            { label: "—", value: "" },
            ...ALL_MBTI.map((t) => ({
              label: `${t} — ${MBTI[t].split("—")[0].trim()}`,
              value: t,
            })),
          ]}
        />

        {/* Custom modalities */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium">Other modalities</span>
            <Button
              size="sm"
              color="link-color"
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
            </Button>
          </div>
          <p className="mb-2 text-[11px] text-stone-500 dark:text-stone-400">
            Working Genius, DISC, pastoral style — anything that isn’t Clifton /
            Enneagram / MBTI.
          </p>
          {modalities.length === 0 && (
            <p className="text-xs text-stone-500 dark:text-stone-400">None yet.</p>
          )}
          <div className="space-y-2">
            {modalities.map((m, i) => (
              <div
                key={m.id}
                className="rounded-lg border border-stone-200 p-2.5 dark:border-stone-800"
              >
                <div className="mb-1.5 flex gap-2">
                  <Input
                    size="sm"
                    placeholder="Name"
                    value={m.name}
                    onChange={(value) =>
                      setModalities((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, name: value } : r
                        )
                      )
                    }
                  />
                  <NativeSelect
                    size="sm"
                    className="w-28 shrink-0"
                    aria-label="Source"
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
                    options={[
                      { label: "Self-report", value: "self-report" },
                      { label: "Test", value: "test" },
                      { label: "Inferred", value: "inferred" },
                    ]}
                  />
                  <ButtonUtility
                    size="xs"
                    color="tertiary"
                    icon={X}
                    tooltip="Remove modality"
                    className="shrink-0"
                    onClick={() =>
                      setModalities((rows) => rows.filter((_, j) => j !== i))
                    }
                  />
                </div>
                <Input
                  size="sm"
                  className="mb-1.5"
                  placeholder="Result"
                  value={m.result}
                  onChange={(value) =>
                    setModalities((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, result: value } : r
                      )
                    )
                  }
                />
                <Input
                  size="sm"
                  placeholder="Notes (optional)"
                  value={m.notes}
                  onChange={(value) =>
                    setModalities((rows) =>
                      rows.map((r, j) =>
                        j === i ? { ...r, notes: value } : r
                      )
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Read on them */}
        <TextArea
          label="Strengths (one per line)"
          size="md"
          textAreaClassName="h-16 resize-none"
          value={strengths}
          onChange={setStrengths}
        />
        <TextArea
          label="Watch-outs (one per line)"
          size="md"
          textAreaClassName="h-16 resize-none"
          value={watchOuts}
          onChange={setWatchOuts}
        />
        <TextArea
          label={howToLeadLabel}
          size="md"
          textAreaClassName="h-20 resize-none"
          value={howToLead}
          onChange={setHowToLead}
          placeholder={howToLeadPlaceholder}
        />
      </div>
    </Modal>
  );
}
