"use client";

import { useEffect, useState } from "react";
import { Factory, Plus, Search, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ImportModal } from "@/components/imports/ImportModal";
import { useCreateSupplier, useSuppliers } from "@/modules/stock/hooks";
import { supplierSchema, type SupplierInput } from "@/modules/stock/schemas";

// Gestión de proveedores: listado + alta + importación masiva desde Excel.
// (El RNE/permiso por país se administra desde el módulo de permisos.)
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

  const { data: suppliers, isLoading } = useSuppliers();

  useEffect(() => {
    if (!open) {
      setCreating(false);
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
        description="Origen de tus ingredientes (con RNE para trazabilidad)."
        className="max-w-2xl"
      >
        {creating ? (
          <SupplierForm
            onDone={() => setCreating(false)}
            onCancel={() => setCreating(false)}
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
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.rne_number
                          ? `RNE ${s.rne_number}`
                          : "Sin RNE registrado"}
                      </p>
                    </div>
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
  onDone,
  onCancel,
}: {
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
    defaultValues: { name: "", rne_number: null },
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
        label="RNE"
        placeholder="Opcional"
        error={errors.rne_number?.message}
        {...register("rne_number", { setValueAs: (v) => (v === "" ? null : v) })}
      />
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
