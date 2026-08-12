import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { cx } from "@/utils/cx";

export type SlashItem = {
  title: string;
  description: string;
  command: () => void;
};

type Props = {
  editor: Editor;
  items: SlashItem[];
  query: string;
  position: { top: number; left: number } | null;
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
};

const MARGIN = 8;
/** Gap between the caret and the menu when it flips above. */
const CARET_GAP = 24;

/**
 * The `/` block menu.
 *
 * It used to be reachable only by mouse: typing `/` opened a `role="listbox"`
 * whose options were `<button>`s, with no arrow keys, no Enter and no active
 * option — a menu that told assistive tech it was a listbox and behaved like a
 * row of links. In a note editor, of all places, that meant taking your hands
 * off the keyboard mid-sentence to insert a heading.
 *
 * It now works the way an inline autocomplete has to: focus stays in the
 * document (moving it into the menu would collapse the caret and lose the `/`),
 * ↑/↓ move the highlight, ↵ and Tab insert, Esc dismisses. The active option is
 * named through `aria-activedescendant` on the editor, which is the pattern
 * that exists precisely for "the focus is over there, the selection is here".
 */
export function SlashMenu({
  editor,
  items,
  query,
  position,
  onSelect,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(
    null
  );
  const [active, setActive] = useState(0);

  const filtered = items.filter(
    (item) =>
      !query ||
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  );

  // Typing narrows the list; the highlight has to come back to the top or ↵
  // inserts whatever used to be at that index.
  useEffect(() => setActive(0), [query]);

  /**
   * Keys are taken on the ProseMirror DOM node during capture, ahead of the
   * editor's own handlers — otherwise ↵ inserts a paragraph before the menu
   * ever sees it, and ↑/↓ move the caret out of the block.
   */
  useEffect(() => {
    if (!position || filtered.length === 0) return;
    const dom = editor.view.dom;

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setActive((i) => (i + 1) % filtered.length);
          return;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setActive((i) => (i - 1 + filtered.length) % filtered.length);
          return;
        case "Home":
          e.preventDefault();
          e.stopPropagation();
          setActive(0);
          return;
        case "End":
          e.preventDefault();
          e.stopPropagation();
          setActive(filtered.length - 1);
          return;
        case "Enter":
        case "Tab": {
          const item = filtered[active];
          if (!item) return;
          e.preventDefault();
          e.stopPropagation();
          onSelect(item);
          return;
        }
        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
      }
    };

    dom.addEventListener("keydown", onKeyDown, true);
    return () => dom.removeEventListener("keydown", onKeyDown, true);
  }, [editor, position, filtered, active, onSelect, onClose]);

  /** Point the editor at the highlighted option so a reader announces it. */
  useEffect(() => {
    const dom = editor.view.dom;
    const item = filtered[active];
    if (!position || !item) {
      dom.removeAttribute("aria-activedescendant");
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-expanded");
      return;
    }
    dom.setAttribute("aria-controls", listId);
    dom.setAttribute("aria-expanded", "true");
    dom.setAttribute("aria-activedescendant", `${listId}-${active}`);
    return () => {
      dom.removeAttribute("aria-activedescendant");
      dom.removeAttribute("aria-controls");
      dom.removeAttribute("aria-expanded");
    };
  }, [editor, listId, active, position, filtered]);

  useEffect(() => {
    menuRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  /**
   * The raw caret coordinates put the menu under the on-screen keyboard and
   * off the right edge near the margin. `visualViewport` excludes the keyboard,
   * so clamp to it and flip above the caret when there is no room below.
   */
  useLayoutEffect(() => {
    if (!position || filtered.length === 0) {
      setPlaced(null);
      return;
    }
    const el = menuRef.current;
    if (!el) return;

    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewW = vv?.width ?? window.innerWidth;
    const viewH = vv?.height ?? window.innerHeight;

    const { width, height } = el.getBoundingClientRect();

    const spaceBelow = viewTop + viewH - position.top;
    const top =
      spaceBelow < height + MARGIN
        ? Math.max(viewTop + MARGIN, position.top - height - CARET_GAP)
        : position.top;

    const left = Math.min(
      Math.max(viewLeft + MARGIN, position.left),
      viewLeft + viewW - width - MARGIN
    );

    setPlaced({ top, left });
  }, [position, filtered.length, query]);

  if (!position || filtered.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="slash-menu-backdrop"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        id={listId}
        className="slash-menu scroll-contain"
        style={{
          top: placed?.top ?? position.top,
          left: placed?.left ?? position.left,
          // Never wider than the screen, never taller than the space left over
          // once the keyboard is up.
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "min(60vh, 20rem)",
          overflowY: "auto",
          // Avoid a visible jump between the raw and the clamped position.
          visibility: placed ? "visible" : "hidden",
        }}
        role="listbox"
        aria-label="Insert a block"
      >
        {filtered.map((item, i) => (
          /* A `<div role="option">`, not a `<button>`: an option is not a
             button, and making it one put a second tab stop between the writer
             and their sentence. The caret never leaves the document. */
          <div
            key={item.title}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            data-active={i === active}
            className={cx("slash-menu-item touch:min-h-11", i === active && "is-active")}
            onMouseMove={() => setActive(i)}
            // `mousedown`, not `click`: clicking blurs the editor first, and a
            // blurred editor has no selection to insert into.
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function buildSlashItems(editor: Editor): SlashItem[] {
  return [
    {
      title: "Text",
      description: "Plain paragraph",
      command: () => editor.chain().focus().setParagraph().run(),
    },
    {
      title: "Heading 1",
      description: "Large section heading",
      command: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      title: "Heading 2",
      description: "Medium section heading",
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      title: "Heading 3",
      description: "Small section heading",
      command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      title: "Bullet list",
      description: "Unordered list",
      command: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      title: "Numbered list",
      description: "Ordered list",
      command: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      title: "To-do list",
      description: "Task checklist",
      command: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      title: "Quote",
      description: "Blockquote",
      command: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      title: "Divider",
      description: "Horizontal rule",
      command: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];
}
