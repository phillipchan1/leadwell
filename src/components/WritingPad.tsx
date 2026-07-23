import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { MarkdownBody } from "./MarkdownBody";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> & {
  value: string;
  /** Extra class on the outer quiet frame. */
  frameClassName?: string;
  /**
   * Dual-mode: preview rendered markdown when not focused.
   * Defaults to true.
   */
  dualMode?: boolean;
  /** Start in edit mode even if dualMode would prefer preview. */
  startEditing?: boolean;
};

/**
 * Day One–inspired writing surface — serif journal type, auto-grow,
 * and optional click-to-edit / blur-to-preview markdown.
 */
export function WritingPad({
  value,
  frameClassName = "",
  className = "",
  dualMode = true,
  startEditing,
  autoFocus,
  readOnly,
  onBlur,
  onFocus,
  onChange,
  onKeyDown,
  placeholder,
  ...rest
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingFocus = useRef(false);
  const preferEdit =
    startEditing ?? (Boolean(autoFocus) || !String(value ?? "").trim());
  const [editing, setEditing] = useState(preferEdit || !dualMode);

  const text = String(value ?? "");
  const showPreview =
    dualMode && !editing && !readOnly && Boolean(text.trim());

  useEffect(() => {
    if (!dualMode || readOnly) return;
    if (!text.trim() && !editing) setEditing(true);
  }, [text, dualMode, readOnly, editing]);

  useEffect(() => {
    if (showPreview || !editing) return;
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
  }, [value, editing, showPreview]);

  useEffect(() => {
    if (!editing || showPreview) return;
    if (!pendingFocus.current && !autoFocus) return;
    const el = ref.current;
    if (!el) return;
    pendingFocus.current = false;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editing, showPreview, autoFocus]);

  if (readOnly && text.trim()) {
    return (
      <div className={`journal-paper ${frameClassName}`}>
        <div className="journal-pad-inner">
          <MarkdownBody>{text}</MarkdownBody>
        </div>
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className={`journal-paper ${frameClassName}`}>
        <div className="journal-pad-inner">
          <p className="journal-placeholder">{placeholder}</p>
        </div>
      </div>
    );
  }

  if (showPreview) {
    return (
      <div className={`journal-paper ${frameClassName}`}>
        <button
          type="button"
          className="journal-pad-inner w-full cursor-text text-left"
          onClick={() => {
            pendingFocus.current = true;
            setEditing(true);
          }}
        >
          <MarkdownBody>{text}</MarkdownBody>
          <span className="journal-hint">Click to edit · Markdown</span>
        </button>
      </div>
    );
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape" && dualMode && text.trim()) {
      e.preventDefault();
      setEditing(false);
      ref.current?.blur();
    }
  };

  return (
    <div className={`journal-paper ${frameClassName}`}>
      <div className="journal-pad-inner">
        <textarea
          ref={ref}
          value={value}
          className={`journal-textarea ${className}`}
          spellCheck
          placeholder={placeholder}
          onChange={onChange}
          onFocus={(e) => {
            setEditing(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            onBlur?.(e);
            if (dualMode && text.trim()) {
              requestAnimationFrame(() => setEditing(false));
            }
          }}
          onKeyDown={handleKeyDown}
          {...rest}
        />
        {dualMode && (
          <span className="journal-hint">
            Esc to preview · Markdown supported
          </span>
        )}
      </div>
    </div>
  );
}
