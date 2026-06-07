"use client";

import { useEffect } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// Editor enriquecido reutilizable (Tiptap). Output HTML. Estilado solo con
// tokens del design system; el contenido usa la clase `.rte-content` definida
// en globals.css (sin @tailwindcss/typography).

type ToolButton = {
  icon: typeof Bold;
  label: string;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
  canRun?: (e: Editor) => boolean;
};

const TOOLS: ToolButton[][] = [
  [
    {
      icon: Bold,
      label: "Negrita",
      isActive: (e) => e.isActive("bold"),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      icon: Italic,
      label: "Cursiva",
      isActive: (e) => e.isActive("italic"),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
  ],
  [
    {
      icon: Heading2,
      label: "Título",
      isActive: (e) => e.isActive("heading", { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      icon: Heading3,
      label: "Subtítulo",
      isActive: (e) => e.isActive("heading", { level: 3 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      icon: List,
      label: "Lista con viñetas",
      isActive: (e) => e.isActive("bulletList"),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      icon: ListOrdered,
      label: "Lista numerada",
      isActive: (e) => e.isActive("orderedList"),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      icon: Quote,
      label: "Cita",
      isActive: (e) => e.isActive("blockquote"),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
  ],
  [
    {
      icon: Undo2,
      label: "Deshacer",
      isActive: () => false,
      run: (e) => e.chain().focus().undo().run(),
      canRun: (e) => e.can().undo(),
    },
    {
      icon: Redo2,
      label: "Rehacer",
      isActive: () => false,
      run: (e) => e.chain().focus().redo().run(),
      canRun: (e) => e.can().redo(),
    },
  ],
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Escribí el informe…",
  className,
  toolbarExtra,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /**
   * Slot opcional al final de la toolbar (alineado a la derecha). Mantiene el
   * editor genérico: integraciones como el asistente de IA se inyectan por acá
   * en vez de hardcodearse adentro. El consumidor controla su propia lógica.
   */
  toolbarExtra?: React.ReactNode;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "rte-content min-h-[12rem] px-4 py-3 outline-none",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  // Sincroniza contenido externo (p. ej. al reabrir el modal con otro informe)
  // sin pisar lo que el usuario está escribiendo.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || "", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-card transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5">
        {TOOLS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-1">
            {gi > 0 && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
            {group.map((tool) => {
              const active = editor ? tool.isActive(editor) : false;
              const enabled = editor
                ? (tool.canRun?.(editor) ?? true)
                : false;
              const Icon = tool.icon;
              return (
                <button
                  key={tool.label}
                  type="button"
                  title={tool.label}
                  aria-label={tool.label}
                  aria-pressed={active}
                  disabled={!enabled}
                  onClick={() => editor && tool.run(editor)}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
                    active && "bg-primary/15 text-primary hover:bg-primary/20"
                  )}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        ))}
        {toolbarExtra && (
          <div className="ml-auto flex items-center">{toolbarExtra}</div>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
