import { useEffect, useState } from "react";
import { FullScreenMarkdown } from "./FullScreenMarkdown";
import { NotionBlockEditor } from "./NotionBlockEditor";

export type EditorMode = "blocks" | "markdown";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  sessionId?: string;
};

function modeStorageKey(sessionId?: string) {
  return sessionId ? `leadwell:editor-mode:${sessionId}` : "leadwell:editor-mode";
}

function loadMode(sessionId?: string): EditorMode {
  try {
    const saved = localStorage.getItem(modeStorageKey(sessionId));
    if (saved === "blocks" || saved === "markdown") return saved;
  } catch {
    /* ignore */
  }
  return "blocks";
}

export function SessionEditor({
  value,
  onChange,
  placeholder,
  autoFocus,
  readOnly,
  mode: controlledMode,
  onModeChange,
  sessionId,
}: Props) {
  const [mode, setMode] = useState<EditorMode>(
    controlledMode ?? loadMode(sessionId)
  );

  useEffect(() => {
    if (controlledMode) setMode(controlledMode);
  }, [controlledMode]);

  useEffect(() => {
    if (sessionId) {
      try {
        localStorage.setItem(modeStorageKey(sessionId), mode);
      } catch {
        /* ignore */
      }
    }
  }, [mode, sessionId]);

  const switchMode = (next: EditorMode) => {
    setMode(next);
    onModeChange?.(next);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== "m") {
        return;
      }
      if (readOnly) return;
      e.preventDefault();
      switchMode(mode === "blocks" ? "markdown" : "blocks");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, readOnly]);

  return (
    <div className="session-editor">
      {!readOnly && (
        <div className="session-editor-mode-bar">
          <div className="session-editor-mode-toggle" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "blocks"}
              className={mode === "blocks" ? "is-active" : ""}
              onClick={() => switchMode("blocks")}
            >
              Blocks
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "markdown"}
              className={mode === "markdown" ? "is-active" : ""}
              onClick={() => switchMode("markdown")}
            >
              Markdown
            </button>
          </div>
          <span className="session-editor-mode-hint">⌘⇧M to toggle</span>
        </div>
      )}

      {mode === "blocks" ? (
        <NotionBlockEditor
          key={`blocks-${sessionId ?? "default"}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          readOnly={readOnly}
        />
      ) : (
        <FullScreenMarkdown
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoFocus={autoFocus}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
