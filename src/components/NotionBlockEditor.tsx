import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Markdown } from "tiptap-markdown";
import { buildSlashItems, SlashMenu, type SlashItem } from "./SlashMenu";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
};

function getMarkdown(editor: ReturnType<typeof useEditor>): string {
  if (!editor) return "";
  const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
  return storage.markdown?.getMarkdown?.() ?? editor.getText();
}

export function NotionBlockEditor({
  value,
  onChange,
  placeholder = "Start writing…",
  autoFocus,
  readOnly,
}: Props) {
  const lastExternal = useRef(value);
  const debounceRef = useRef<number | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(
    null
  );

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Underline,
      Markdown.configure({
        html: false,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "notion-editor-content",
      },
    },
    onUpdate: ({ editor: ed }) => {
      const md = getMarkdown(ed);
      lastExternal.current = md;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => onChange(md), 150);

      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(
        Math.max(0, from - 20),
        from,
        "\n"
      );
      const slashMatch = textBefore.match(/(?:^|\n)\/([^\n]*)$/);
      if (slashMatch) {
        setSlashQuery(slashMatch[1] ?? "");
        const coords = ed.view.coordsAtPos(from);
        setSlashPos({ top: coords.bottom + 6, left: coords.left });
      } else {
        setSlashQuery("");
        setSlashPos(null);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (value === lastExternal.current) return;
    lastExternal.current = value;
    editor.commands.setContent(value);
  }, [value, editor]);

  useEffect(() => {
    if (!editor || !autoFocus || readOnly) return;
    editor.commands.focus("end");
  }, [editor, autoFocus, readOnly]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const slashItems = useMemo(
    () => (editor ? buildSlashItems(editor) : []),
    [editor]
  );

  const applySlash = (item: SlashItem) => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(
      Math.max(0, from - 40),
      from,
      "\n"
    );
    const slashMatch = textBefore.match(/(?:^|\n)(\/[^\n]*)$/);
    if (slashMatch) {
      const deleteFrom = from - slashMatch[1].length;
      editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run();
    }
    item.command();
    setSlashPos(null);
    setSlashQuery("");
    onChange(getMarkdown(editor));
  };

  if (!editor) return null;

  return (
    <div className="notion-block-editor">
      {!readOnly && (
        <BubbleMenu editor={editor} className="notion-bubble-menu">
          <button
            type="button"
            className={editor.isActive("bold") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </button>
          <button
            type="button"
            className={editor.isActive("italic") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            I
          </button>
          <button
            type="button"
            className={editor.isActive("underline") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            U
          </button>
          <button
            type="button"
            className={editor.isActive("strike") ? "is-active" : ""}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            S
          </button>
          <button
            type="button"
            className={editor.isActive("link") ? "is-active" : ""}
            onClick={() => {
              const prev = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("Link URL", prev ?? "https://");
              if (url === null) return;
              if (!url) {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            }}
          >
            Link
          </button>
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {!readOnly && slashPos && (
        <SlashMenu
          editor={editor}
          items={slashItems}
          query={slashQuery}
          position={slashPos}
          onSelect={applySlash}
          onClose={() => {
            setSlashPos(null);
            setSlashQuery("");
          }}
        />
      )}
    </div>
  );
}
