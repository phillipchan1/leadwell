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

export function SlashMenu({
  items,
  query,
  position,
  onSelect,
  onClose,
}: Props) {
  if (!position) return null;

  const filtered = items.filter(
    (item) =>
      !query ||
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="slash-menu-backdrop"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div
        className="slash-menu"
        style={{ top: position.top, left: position.left }}
        role="listbox"
      >
        {filtered.map((item) => (
          <button
            key={item.title}
            type="button"
            role="option"
            className="slash-menu-item"
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
