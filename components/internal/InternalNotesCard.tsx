"use client";

import { useState } from "react";
import { StickyNote, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useInternalNotes,
  useNoteActions,
} from "@/modules/internal-billing/hooks";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function InternalNotesCard({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const { data: notes } = useInternalNotes(tenantId);
  const actions = useNoteActions(tenantId);
  const [draft, setDraft] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function onAdd() {
    const text = draft.trim();
    if (!text) return;
    actions.create.mutate(text, {
      onSuccess: () => {
        toast({ title: "Nota agregada", variant: "success" });
        setDraft("");
      },
      onError: (e) =>
        toast({
          title: "No se pudo agregar la nota",
          description: e instanceof Error ? e.message : undefined,
          variant: "error",
        }),
    });
  }

  return (
    <Card className="mt-3">
      <CardContent className="space-y-4 p-5">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Escribí una nota interna sobre este negocio…"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <Button
            className="self-end"
            loading={actions.create.isPending}
            disabled={!draft.trim()}
            onClick={onAdd}
          >
            Agregar
          </Button>
        </div>

        {notes && notes.length > 0 ? (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="group rounded-lg border border-border bg-muted/40 px-3 py-2.5"
              >
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {n.body}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {n.authorName ?? n.authorEmail ?? "Staff"} · {fmt(n.createdAt)}
                  </span>
                  <button
                    onClick={() => setDeleteId(n.id)}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 size={13} /> Borrar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <StickyNote size={15} /> Sin notas todavía.
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Borrar nota interna"
        description="Esta acción borra la nota (soft delete) y queda registrada en auditoría."
        confirmLabel="Borrar"
        danger
        loading={actions.remove.isPending}
        onConfirm={() => {
          if (!deleteId) return;
          actions.remove.mutate(deleteId, {
            onSuccess: () => {
              toast({ title: "Nota borrada", variant: "success" });
              setDeleteId(null);
            },
            onError: (e) =>
              toast({
                title: "No se pudo borrar",
                description: e instanceof Error ? e.message : undefined,
                variant: "error",
              }),
          });
        }}
      />
    </Card>
  );
}
