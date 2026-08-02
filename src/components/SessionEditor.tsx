import { useEffect, useState } from "react";
import {
  Tab as TabItem,
  TabList,
  Tabs,
} from "@/components/application/tabs/tabs";
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
          <Tabs
            selectedKey={mode}
            onSelectionChange={(key) => switchMode(key as EditorMode)}
          >
            <TabList type="button-border" size="sm">
              <TabItem id="blocks" label="Blocks" />
              <TabItem id="markdown" label="Markdown" />
            </TabList>
          </Tabs>
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
