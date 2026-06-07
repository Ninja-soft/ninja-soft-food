"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import {
  useFlagActions,
  useTenantFlags,
} from "@/modules/internal-billing/hooks";

// Sugerencias de flags (string libre, normalizadas a snake_case por el handler).
const SUGGESTIONS = ["ai_enabled", "beta_features"];

export function TenantFlagsCard({ tenantId }: { tenantId: string }) {
  const { toast } = useToast();
  const { data: flags } = useTenantFlags(tenantId);
  const actions = useFlagActions(tenantId);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  function setFlag(flag: string, enabled: boolean, noteVal?: string) {
    actions.set.mutate(
      { flag, enabled, note: noteVal },
      {
        onSuccess: () => toast({ title: "Flag actualizado", variant: "success" }),
        onError: (e) =>
          toast({
            title: "No se pudo actualizar el flag",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  function onAdd() {
    const flag = name.trim();
    if (!flag) return;
    setFlag(flag, true, note.trim() || undefined);
    setName("");
    setNote("");
  }

  return (
    <Card className="mt-3">
      <CardContent className="space-y-4 p-5">
        {flags && flags.length > 0 ? (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-foreground">{f.flag}</p>
                  {f.note && (
                    <p className="text-xs text-muted-foreground">{f.note}</p>
                  )}
                </div>
                <Switch
                  checked={f.enabled}
                  onCheckedChange={(v) => setFlag(f.flag, v, f.note ?? undefined)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag size={15} /> Sin flags para este negocio.
          </div>
        )}

        <div className="border-t border-border pt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px] flex-1">
              <Input
                label="Nuevo flag"
                value={name}
                placeholder="ej. ai_enabled"
                onChange={(e) => setName(e.target.value)}
                list="flag-suggestions"
              />
              <datalist id="flag-suggestions">
                {SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="min-w-[180px] flex-1">
              <Input
                label="Nota (opcional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button
              loading={actions.set.isPending}
              disabled={!name.trim()}
              onClick={onAdd}
            >
              Agregar flag
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
