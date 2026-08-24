import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { ArrowDown, ArrowUp, Trash01 } from "@untitledui/icons";
import { cx } from "@/utils/cx";
import { tagDotClass } from "./TagChip";
import type { LabApi } from "./store";
import type { LabMeeting } from "./types";

const selectClass =
  "rounded-md border border-secondary bg-primary px-1.5 py-1 text-caption text-stone-700 outline-none dark:text-stone-200";

/**
 * The running order, edited once and applied to every occurrence.
 *
 * This is the piece the old board was missing: it treated a meeting as a bag of
 * topics, so "what shape is this meeting" had to be re-decided every week. A
 * band moved here moves in all eight columns at once.
 */
export function TemplateEditor({
  api,
  meeting,
  onClose,
}: {
  api: LabApi;
  meeting: LabMeeting;
  onClose: () => void;
}) {
  const { state } = api;
  const [draft, setDraft] = useState("");
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  const total = meeting.template.reduce((n, s) => n + (s.minutes ?? 0), 0);

  return (
    <div className="rounded-xl border border-secondary bg-stone-50/60 p-3 dark:bg-stone-950/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-stone-700 dark:text-stone-200">
            Running order
          </h3>
          <p className="text-caption text-quaternary">
            Applies to every occurrence. Reorder here and all weeks follow.
            {total > 0 && ` · ${total} min planned`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            className={selectClass}
            value=""
            onChange={(e) => {
              if (e.target.value) api.applyPreset(meeting.id, e.target.value);
            }}
            aria-label="Apply a preset"
          >
            <option value="">Apply preset…</option>
            {state.presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {savingPreset ? (
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                api.savePreset(meeting.id, presetName);
                setPresetName("");
                setSavingPreset(false);
              }}
            >
              <input
                autoFocus
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name"
                aria-label="Preset name"
                className="w-28 rounded-md border border-teal-400 bg-primary px-1.5 py-1 text-caption outline-none"
              />
              <Button size="sm" color="secondary" type="submit">
                Save
              </Button>
            </form>
          ) : (
            <Button
              size="sm"
              color="tertiary"
              onClick={() => setSavingPreset(true)}
            >
              Save as preset
            </Button>
          )}
          <Button size="sm" color="tertiary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>

      <ul className="mt-2 space-y-1">
        {meeting.template.map((section, i) => {
          const tag = state.tags.find((t) => t.id === section.tagId);
          return (
            <li
              key={section.id}
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-secondary bg-primary px-2 py-1.5"
            >
              <span className="w-5 text-caption tabular-nums text-quaternary">
                {i + 1}.
              </span>
              <span
                className={cx("size-2 shrink-0 rounded-full", tagDotClass(tag))}
                aria-hidden
              />
              <input
                value={section.label}
                aria-label={`Section ${i + 1} name`}
                onChange={(e) =>
                  api.updateSection(meeting.id, section.id, {
                    label: e.target.value,
                  })
                }
                className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-xs font-medium text-stone-800 outline-none hover:bg-tertiary focus:bg-tertiary dark:text-stone-100"
              />
              <select
                className={selectClass}
                value={section.tagId ?? ""}
                aria-label={`Tag for ${section.label}`}
                onChange={(e) =>
                  api.updateSection(meeting.id, section.id, {
                    tagId: e.target.value || undefined,
                  })
                }
              >
                <option value="">No tag</option>
                {state.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                step={5}
                value={section.minutes ?? ""}
                placeholder="min"
                aria-label={`Minutes for ${section.label}`}
                onChange={(e) =>
                  api.updateSection(meeting.id, section.id, {
                    minutes: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="w-14 rounded-md border border-secondary bg-primary px-1.5 py-1 text-caption tabular-nums outline-none"
              />
              <div className="flex items-center gap-0.5">
                <ButtonUtility
                  size="xs"
                  color="tertiary"
                  icon={ArrowUp}
                  tooltip="Move up"
                  isDisabled={i === 0}
                  onClick={() => api.moveSection(meeting.id, section.id, -1)}
                />
                <ButtonUtility
                  size="xs"
                  color="tertiary"
                  icon={ArrowDown}
                  tooltip="Move down"
                  isDisabled={i === meeting.template.length - 1}
                  onClick={() => api.moveSection(meeting.id, section.id, 1)}
                />
                <ButtonUtility
                  size="xs"
                  color="tertiary"
                  icon={Trash01}
                  tooltip="Remove band — its topics stay in the week"
                  onClick={() => api.deleteSection(meeting.id, section.id)}
                />
              </div>
            </li>
          );
        })}
        {meeting.template.length === 0 && (
          <p className="px-1 py-2 text-caption text-quaternary">
            No running order yet — every week is one flat list. Add a band, or
            apply a preset.
          </p>
        )}
      </ul>

      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          api.addSection(meeting.id, draft);
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a band — Lowdown, Training, Prayer…"
          aria-label="New section name"
          className="min-w-0 flex-1 rounded-md border border-secondary bg-primary px-2 py-1 text-xs outline-none focus:border-teal-400"
        />
        <Button size="sm" color="secondary" type="submit" isDisabled={!draft.trim()}>
          Add band
        </Button>
      </form>
    </div>
  );
}
