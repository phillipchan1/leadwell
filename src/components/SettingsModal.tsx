import { useState } from "react";
import { useStore } from "../store/useStore";
import { hasApiKey } from "../lib/ai";
import { Modal, buttonGhostCls, buttonPrimaryCls, inputCls } from "./ui";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { anthropicApiKey, setAnthropicApiKey } = useStore();
  const envFallback = Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);
  const [draft, setDraft] = useState(anthropicApiKey ?? "");
  const [saved, setSaved] = useState(false);

  const save = () => {
    setAnthropicApiKey(draft.trim() || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const clear = () => {
    setDraft("");
    setAnthropicApiKey(null);
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-4">
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-stone-800 dark:text-stone-100">
            Anthropic API key
          </h3>
          <p className="text-xs leading-relaxed text-stone-500">
            Used for AI coach and structuring 1:1 notes from transcripts. Stored
            only in this browser. Your key never leaves this machine except to
            call Anthropic.
          </p>
          <input
            type="password"
            className={inputCls}
            placeholder="sk-ant-…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonPrimaryCls} onClick={save}>
              {saved ? "Saved" : "Save key"}
            </button>
            <button type="button" className={buttonGhostCls} onClick={clear}>
              Clear
            </button>
            <span className="text-[11px] text-stone-400">
              {hasApiKey()
                ? anthropicApiKey
                  ? "Using saved key"
                  : envFallback
                    ? "Using .env key"
                    : "Key available"
                : "No key configured"}
            </span>
          </div>
          {envFallback && !anthropicApiKey && (
            <p className="text-[11px] text-stone-400">
              Fallback: <code className="text-stone-500">VITE_ANTHROPIC_API_KEY</code>{" "}
              from .env.local is available.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
