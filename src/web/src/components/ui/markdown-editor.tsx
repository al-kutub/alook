"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { cn } from "@/lib/utils";
import { isEmptyHtml } from "@alook/shared";
import type { Agent } from "@alook/shared";
import { createPortal } from "react-dom";
import { toast } from "sonner";

export { isEmptyHtml };

export type ImageUploadFn = (file: File) => Promise<string>;

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number | string;
  autoFocus?: boolean;
  variant?: "default" | "seamless";
  contentType?: "html" | "markdown";
  agents?: Agent[];
  onImageUpload?: ImageUploadFn;
}

function normalize(html: string | null | undefined): string {
  if (!html) return "";
  return isEmptyHtml(html) ? "" : html.trim();
}

type MentionSuggestionProps = {
  items: Agent[];
  command: (props: { id: string; label: string }) => void;
  decorationNode: Element | null;
};

interface PopupState {
  items: Agent[];
  selectedIndex: number;
  command: ((props: { id: string; label: string }) => void) | null;
}

function MentionList({
  state,
  anchorEl,
}: {
  state: PopupState;
  anchorEl: HTMLElement | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const { items, selectedIndex, command } = state;

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!anchorEl || items.length === 0 || !command) return null;

  const rect = anchorEl.getBoundingClientRect();

  return createPortal(
    <div
      className="fixed z-100 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
      style={{ top: rect.top - 4, left: rect.left, transform: "translateY(-100%)" }}
    >
      <div ref={listRef} className="max-h-50 overflow-y-auto py-1 thin-scrollbar">
        {items.map((agent, i) => (
          <button
            key={agent.id}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
              i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              command({ id: agent.id, label: agent.name });
            }}
          >
            <span className="truncate font-medium">{agent.name}</span>
            {agent.email_handle && (
              <span className="truncate text-xs text-muted-foreground">
                {agent.email_handle}@alook.ai
              </span>
            )}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function useMentionSuggestion(agents: Agent[] | undefined) {
  const [popup, setPopup] = useState<PopupState>({ items: [], selectedIndex: 0, command: null });
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popupRef = useRef(popup);
  useEffect(() => {
    popupRef.current = popup;
  }, [popup]);

  const mentionExt = agents && agents.length > 0
    ? Mention.configure({
        HTMLAttributes: { class: "mention-highlight" },
        renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
        suggestion: {
          char: "@",
          items: ({ query }: { query: string }) => {
            if (!agents) return [];
            if (!query) return agents.slice(0, 20);
            const q = query.toLowerCase();
            const sw: Agent[] = [];
            const inc: Agent[] = [];
            for (const a of agents) {
              const n = a.name.toLowerCase();
              if (n.startsWith(q)) sw.push(a);
              else if (n.includes(q)) inc.push(a);
            }
            return [...sw, ...inc].slice(0, 20);
          },
          render: () => ({
            onStart: (props: MentionSuggestionProps) => {
              setAnchorEl(props.decorationNode instanceof HTMLElement ? props.decorationNode : null);
              setPopup({ items: props.items ?? [], selectedIndex: 0, command: props.command });
            },
            onUpdate: (props: MentionSuggestionProps) => {
              setAnchorEl(props.decorationNode instanceof HTMLElement ? props.decorationNode : null);
              setPopup({ items: props.items ?? [], selectedIndex: 0, command: props.command });
            },
            onKeyDown: ({ event }: { event: KeyboardEvent }) => {
              const cur = popupRef.current;
              if (cur.items.length === 0) return false;

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setPopup({ ...cur, selectedIndex: (cur.selectedIndex + 1) % cur.items.length });
                return true;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setPopup({
                  ...cur,
                  selectedIndex: (cur.selectedIndex - 1 + cur.items.length) % cur.items.length,
                });
                return true;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const agent = cur.items[cur.selectedIndex];
                if (agent && cur.command) cur.command({ id: agent.id, label: agent.name });
                setPopup({ items: [], selectedIndex: 0, command: null });
                return true;
              }
              if (event.key === "Escape") {
                setPopup({ items: [], selectedIndex: 0, command: null });
                return true;
              }
              return false;
            },
            onExit: () => {
              setPopup({ items: [], selectedIndex: 0, command: null });
              setAnchorEl(null);
            },
          }),
        },
      })
    : null;

  return { mentionExt, popup, anchorEl };
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = "9rem",
  autoFocus,
  variant = "default",
  contentType = "html",
  agents,
  onImageUpload,
}: MarkdownEditorProps) {
  const isMd = contentType === "markdown";
  const uploadRef = useRef(onImageUpload);
  useEffect(() => { uploadRef.current = onImageUpload; }, [onImageUpload]);

  const minHeightStyle =
    typeof minHeight === "number" ? `${minHeight}px` : minHeight;

  const innerClass =
    variant === "seamless"
      ? "markdown text-sm max-w-none focus:outline-none px-0 py-1"
      : "markdown text-sm max-w-none focus:outline-none px-3 py-2";

  const { mentionExt, popup, anchorEl } = useMentionSuggestion(agents);

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const handleImageFiles = useCallback(async (files: File[]) => {
    const ed = editorRef.current;
    if (!ed || !uploadRef.current) return false;
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return false;

    for (const file of images) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Image "${file.name}" exceeds 10 MB limit`);
        continue;
      }
      try {
        const url = await uploadRef.current(file);
        ed.chain().focus().setImage({ src: url, alt: file.name }).run();
      } catch {
        toast.error(`Failed to upload image "${file.name}"`);
      }
    }
    return true;
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    content: value || undefined,
    ...(isMd ? { contentType: "markdown" } : {}),
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Image.configure({ inline: false, allowBase64: false }),
      ...(isMd ? [Markdown] : []),
      ...(mentionExt ? [mentionExt] : []),
    ],
    editorProps: {
      attributes: {
        class: innerClass,
        style: `min-height: ${minHeightStyle}`,
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items || !uploadRef.current) return false;
        const imageFiles: File[] = [];
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) imageFiles.push(file);
          }
        }
        if (imageFiles.length === 0) return false;
        // Fire-and-forget: return true synchronously to prevent default paste, upload runs in background
        handleImageFiles(imageFiles);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0 || !uploadRef.current) return false;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        // Fire-and-forget: return true synchronously to prevent default drop, upload runs in background
        handleImageFiles(imageFiles);
        return true;
      },
    },
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor }) => {
      onChange(isMd ? editor.getMarkdown() : editor.getHTML());
    },
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (isMd) {
      const incoming = (value || "").trim();
      const current = (editor.getMarkdown() || "").trim();
      if (incoming === current) return;
      editor.commands.setContent(value || "", { emitUpdate: false, contentType: "markdown" });
    } else {
      const incoming = normalize(value);
      const current = normalize(editor.getHTML());
      if (incoming === current) return;
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const containerClass =
    variant === "seamless"
      ? "w-full bg-transparent text-sm"
      : "w-full rounded-md border border-input bg-transparent text-sm transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50";

  return (
    <div className={cn(containerClass, className)}>
      <EditorContent editor={editor} />
      {agents && agents.length > 0 && (
        <MentionList state={popup} anchorEl={anchorEl} />
      )}
    </div>
  );
}
