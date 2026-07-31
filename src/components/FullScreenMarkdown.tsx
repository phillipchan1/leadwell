import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { MarkdownBody } from "./MarkdownBody";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
};

/**
 * Full-screen markdown source editor with split preview — distraction-free
 * writing for power users and AI paste workflows.
 */
export function FullScreenMarkdown({
  value,
  onChange,
  placeholder,
  autoFocus,
  readOnly,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showPreview, setShowPreview] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  }, [value, showPreview]);

  useEffect(() => {
    if (!autoFocus || readOnly) return;
    ref.current?.focus();
  }, [autoFocus, readOnly]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  if (readOnly) {
    return (
      <div className="notion-markdown-readonly">
        <MarkdownBody>{value}</MarkdownBody>
      </div>
    );
  }

  return (
    <div className="notion-markdown">
      <div className="notion-markdown-toolbar">
        <button
          type="button"
          className={`notion-mode-btn ${showPreview ? "is-active" : ""}`}
          onClick={() => setShowPreview((v) => !v)}
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
        <span className="notion-markdown-hint">Markdown · Tab to indent</span>
      </div>
      <div
        className={`notion-markdown-split ${showPreview ? "has-preview" : ""}`}
      >
        <textarea
          ref={ref}
          value={value}
          readOnly={readOnly}
          spellCheck
          className="notion-markdown-source"
          placeholder={placeholder}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        {showPreview && (
          <div className="notion-markdown-preview">
            {value.trim() ? (
              <MarkdownBody>{value}</MarkdownBody>
            ) : (
              <p className="notion-markdown-empty">Preview appears here</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
