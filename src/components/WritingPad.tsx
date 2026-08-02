import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { MarkdownBody } from "./MarkdownBody";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

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
  const coarse = useCoarsePointer();
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
    // Cap the growth and let the textarea scroll internally instead of pushing
    // the caret past the bottom of the visual viewport.
    const max = Math.max(240, (window.visualViewport?.height ?? window.innerHeight) * 0.55);
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 200), max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
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
    const startEditingNow = () => {
      pendingFocus.current = true;
      setEditing(true);
    };
    return (
      <div className={`journal-paper ${frameClassName}`}>
        <div className="journal-pad-inner">
          <MarkdownBody>{text}</MarkdownBody>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="journal-hint !mt-0">Markdown supported</span>
            <button
              type="button"
              onClick={startEditingNow}
              className="touch:min-h-11 rounded-md px-2 py-1 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 active:bg-teal-100 dark:text-teal-400 dark:hover:bg-teal-950/40"
            >
              Edit
            </button>
          </div>
        </div>
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
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="journal-hint !mt-0">
              {coarse ? "Markdown supported" : "Esc to preview · Markdown supported"}
            </span>
            {coarse && text.trim() && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setEditing(false);
                  ref.current?.blur();
                }}
                className="min-h-11 rounded-md px-2 py-1 text-xs font-medium text-teal-700 dark:text-teal-400"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
