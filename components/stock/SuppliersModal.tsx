"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Factory, Plus, Search, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ImportModal } from "@/components/imports/ImportModal";
import { PermitsSection } from "@/components/permits/PermitsSection";
import { useCreateSupplier, useSuppliers } from "@/modules/stock/hooks";
import type { Supplier } from "@/modules/stock/api";
import { supplierSchema, type SupplierInput } from "@/modules/stock/schemas";
import { useOperatingProfile } from "@/modules/tenant-profile/hooks";

// Gestión de proveedores: listado + alta + importación masiva desde Excel +
// detalle con permisos/habilitaciones por país (PermitsSection, entityType
// "supplier"). El identificador fiscal usa la etiqueta del país (CUIT/RFC/...).
export function SuppliersModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);

  const { data: suppliers, isLoading } = useSuppliers();
  const { data: profile } = useOperatingProfile();
  const taxIdLabel = profile?.taxIdLabel ?? "CUIT";

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setSelected(null);
      setSearch("");
    }
  }, [open]);

  const filtered = (suppliers ?? []).filter((s) =>
    search.trim()
      ? s.name.toLowerCase().includes(search.trim().toLowerCase())
      : true,
  );

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Proveedores"
        description="Origen de tus ingredientes, con permisos y habilitaciones para trazabilidad."
        className="max-w-2xl"
      >
        {creating ? (
          <SupplierForm
            taxIdLabel={taxIdLabel}
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <SupplierDetail
            supplier={selected}
            taxIdLabel={taxIdLabel}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar proveedor…"
                  className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
                />
              </div>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload size={16} />
                Importar
              </Button>
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} />
                Nuevo
              </Button>
            </div>

            {isLoading ? (
              <SpinnerBlock />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="bg-primary/15 grid h-12 w-12 place-items-center rounded-lg text-primary">
                  <Factory size={22} />
                </span>
                <p className="text-sm text-muted-foreground">
                  {search ? "Sin resultados." : "Todavía no hay proveedores."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(s)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {s.tax_id
                            ? `${taxIdLabel} ${s.tax_id}`
                            : `Sin ${taxIdLabel}`}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Permisos
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        moduleId="suppliers"
      />
    </>
  );
}

function SupplierForm({
  taxIdLabel,
  onDone,
  onCancel,
}: {
  taxIdLabel: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const createMut = useCreateSupplier();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", tax_id: null },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createMut.mutateAsync(values);
      toast({ title: "Proveedor creado", variant: "success" });
      onDone();
    } catch (e) {
      toast({
        title: "Error al guardar proveedor",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input
        label="Nombre / Razón social"
        error={errors.name?.message}
        {...register("name")}
      />
      <Input
        label={taxIdLabel}
        placeholder="Opcional"
        error={errors.tax_id?.message}
        {...register("tax_id", { setValueAs: (v) => (v === "" ? null : v) })}
      />
      <p className="text-xs text-muted-foreground">
        Los permisos y habilitaciones (registros sanitarios) se cargan en el
        detalle del proveedor una vez creado.
      </p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Volver
        </Button>
        <Button type="submit" loading={createMut.isPending}>
          Crear proveedor
        </Button>
      </div>
    </form>
  );
}

// Detalle de proveedor: datos fiscales + permisos/habilitaciones por país.
// PermitsSection resuelve los tipos disponibles según el OperatingProfile
// (entityType "supplier") — un tenant AR ve RNE, uno MX ve COFEPRIS, etc.
function SupplierDetail({
  supplier,
  taxIdLabel,
  onBack,
}: {
  supplier: Supplier;
  taxIdLabel: string;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ChevronLeft size={16} />
        Proveedores
      </button>

      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="font-medium">{supplier.name}</p>
        <p className="text-xs text-muted-foreground">
          {supplier.tax_id
            ? `${taxIdLabel} ${supplier.tax_id}`
            : `Sin ${taxIdLabel}`}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Permisos y habilitaciones</p>
        <PermitsSection entityType="supplier" entityId={supplier.id} />
      </div>
    </div>
  );
}
