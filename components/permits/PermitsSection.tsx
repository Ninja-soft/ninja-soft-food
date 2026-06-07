"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileCheck2, Pencil, Plus, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { daysUntil, formatDate } from "@/lib/utils/format";
import {
  getPermitLabel,
  getPermitTypes,
} from "@/lib/globalization/permitTypes";
import { useOperatingProfile } from "@/modules/tenant-profile/hooks";
import {
  useCreatePermit,
  useDeletePermit,
  usePermits,
  useUpdatePermit,
} from "@/modules/permits/hooks";
import type { Permit } from "@/modules/permits/api";
import {
  permitSchema,
  type PermitEntityType,
  type PermitInput,
} from "@/modules/permits/schemas";

const selectCls =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

// Sección genérica "Permisos y habilitaciones": CRUD sobre regulatory_permits.
// Los tipos disponibles los resuelve getPermitTypes(country, entityType) según
// el OperatingProfile del tenant — un tenant MX ve COFEPRIS/SCT, no RNE/UTA/URA.
// Reemplaza los campos fijos RNE/RNPA/UTA/URA de los forms de entidad.
export function PermitsSection({
  entityType,
  entityId,
  /** Para recetas exentas: muestra el estado "exento" y deshabilita el alta. */
  exemptLabel,
}: {
  entityType: PermitEntityType;
  entityId: string | null;
  exemptLabel?: string | null;
}) {
  const { data: profile } = useOperatingProfile();
  const { data: permits, isLoading } = usePermits(entityType, entityId);
  const deleteMut = useDeletePermit(entityType, entityId);
  const { toast } = useToast();
  const [editing, setEditing] = useState<Permit | null>(null);
  const [adding, setAdding] = useState(false);

  const permitTypes = useMemo(
    () => getPermitTypes(profile?.country, entityType),
    [profile?.country, entityType],
  );

  // Sin entidad guardada todavía: el permiso necesita un entity_id real.
  if (!entityId) {
    return (
      <p className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
        Guardá primero para cargar permisos y habilitaciones.
      </p>
    );
  }

  async function handleDelete(id: string) {
    try {
      await deleteMut.mutateAsync(id);
      toast({ title: "Permiso eliminado", variant: "success" });
    } catch (e) {
      toast({
        title: "Error al eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  if (adding || editing) {
    return (
      <PermitForm
        entityType={entityType}
        entityId={entityId}
        permit={editing}
        permitTypes={permitTypes}
        onDone={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {exemptLabel && (
        <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {exemptLabel}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (permits ?? []).length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <FileCheck2 size={16} />
          Sin permisos cargados todavía.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(permits ?? []).map((permit) => {
            const d = daysUntil(permit.expires_at);
            const expired = d !== null && d < 0;
            const soon = d !== null && d >= 0 && d <= 60;
            return (
              <li
                key={permit.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                      {getPermitLabel(permit.permit_type)}
                    </span>
                    <span className="font-mono text-xs">
                      {permit.permit_number}
                    </span>
                    {expired && (
                      <span className="bg-destructive/15 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-destructive">
                        <AlertTriangle size={11} />
                        Vencido
                      </span>
                    )}
                    {soon && (
                      <span className="bg-accent/15 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-accent">
                        <AlertTriangle size={11} />
                        Vence en {d}d
                      </span>
                    )}
                  </p>
                  {permit.expires_at && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Vence {formatDate(permit.expires_at)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label="Editar permiso"
                    onClick={() => setEditing(permit)}
                    className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar permiso"
                    onClick={() => handleDelete(permit.id)}
                    className="hover:bg-destructive/10 rounded-md p-2 text-muted-foreground transition hover:text-destructive"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
        <Plus size={14} />
        Permiso
      </Button>
    </div>
  );
}

function PermitForm({
  entityType,
  entityId,
  permit,
  permitTypes,
  onDone,
}: {
  entityType: PermitEntityType;
  entityId: string;
  permit: Permit | null;
  permitTypes: ReturnType<typeof getPermitTypes>;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const createMut = useCreatePermit();
  const updateMut = useUpdatePermit();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PermitInput>({
    resolver: zodResolver(permitSchema),
    defaultValues: {
      entity_type: entityType,
      entity_id: entityId,
      permit_type: permit?.permit_type ?? permitTypes[0]?.id ?? "otro",
      permit_number: permit?.permit_number ?? "",
      issued_at: permit?.issued_at ?? null,
      expires_at: permit?.expires_at ?? null,
      attachment_url: permit?.attachment_url ?? null,
      notes: permit?.notes ?? null,
    },
  });

  const selectedType = watch("permit_type");
  const hasExpiry =
    permitTypes.find((t) => t.id === selectedType)?.hasExpiry ?? true;

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (permit) {
        await updateMut.mutateAsync({ id: permit.id, input: values });
        toast({ title: "Permiso actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Permiso agregado", variant: "success" });
      }
      onDone();
    } catch (e) {
      toast({
        title: "Error al guardar permiso",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-muted-foreground">
            Tipo de permiso
          </label>
          <select className={selectCls} {...register("permit_type")}>
            {permitTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Número"
          error={errors.permit_number?.message}
          {...register("permit_number")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Emitido"
          type="date"
          {...register("issued_at", { setValueAs: (v) => (v === "" ? null : v) })}
        />
        {hasExpiry && (
          <Input
            label="Vence"
            type="date"
            {...register("expires_at", {
              setValueAs: (v) => (v === "" ? null : v),
            })}
          />
        )}
      </div>

      <Input
        label="Notas"
        placeholder="Opcional"
        {...register("notes")}
      />

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          Volver
        </Button>
        <Button
          type="button"
          size="sm"
          loading={createMut.isPending || updateMut.isPending}
          onClick={onSubmit}
        >
          {permit ? "Guardar" : "Agregar"}
        </Button>
      </div>
    </div>
  );
}
