import { useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

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

export function SlashMenu({
  items,
  query,
  position,
  onSelect,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(
    null
  );

  const filtered = items.filter(
    (item) =>
      !query ||
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  );

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
        onClick={onClose}
      />
      <div
        ref={menuRef}
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
      >
        {filtered.map((item) => (
          <button
            key={item.title}
            type="button"
            role="option"
            className="slash-menu-item touch:min-h-11"
            onClick={() => onSelect(item)}
          >
            <span className="slash-menu-title">{item.title}</span>
            <span className="slash-menu-desc">{item.description}</span>
          </button>
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
