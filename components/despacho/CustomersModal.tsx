"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import type { Customer } from "@/modules/dispatch/api";
import {
  useCreateCustomer,
  useCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
} from "@/modules/dispatch/hooks";
import { customerSchema, type CustomerInput } from "@/modules/dispatch/schemas";

// Gestión de clientes: listado + alta/edición + baja soft.
export function CustomersModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const { data: customers, isLoading } = useCustomers(search);
  const deleteMut = useDeleteCustomer();

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setCreating(false);
      setSearch("");
    }
  }, [open]);

  const showForm = creating || editing !== null;

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast({ title: "Cliente eliminado", variant: "success" });
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: "Error al eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title="Clientes"
        description="Destinatarios de tus despachos."
        className="max-w-2xl"
      >
        {showForm ? (
          <CustomerForm
            customer={editing}
            onDone={() => {
              setEditing(null);
              setCreating(false);
            }}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
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
                  placeholder="Buscar cliente…"
                  className="focus:ring-primary/20 h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2"
                />
              </div>
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} />
                Nuevo
              </Button>
            </div>

            {isLoading ? (
              <SpinnerBlock />
            ) : (customers ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="bg-primary/15 grid h-12 w-12 place-items-center rounded-ninjaMd text-primary">
                  <Users size={22} />
                </span>
                <p className="text-sm text-muted-foreground">
                  {search ? "Sin resultados." : "Todavía no hay clientes."}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-ninjaMd border border-border">
                {(customers ?? []).map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.locality, c.phone].filter(Boolean).join(" · ") ||
                          "Sin datos de contacto"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(c)}
                        aria-label={`Editar ${c.name}`}
                        className="rounded-md p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c)}
                        aria-label={`Eliminar ${c.name}`}
                        className="hover:bg-destructive/10 rounded-md p-2 text-muted-foreground transition hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar cliente"
        description={`¿Eliminar a ${deleteTarget?.name}? Los despachos existentes se conservan.`}
        confirmLabel="Eliminar"
        danger
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}

function CustomerForm({
  customer,
  onDone,
  onCancel,
}: {
  customer: Customer | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const createMut = useCreateCustomer();
  const updateMut = useUpdateCustomer();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: customer?.name ?? "",
      address: customer?.address ?? null,
      locality: customer?.locality ?? null,
      phone: customer?.phone ?? null,
      email: customer?.email ?? null,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (customer) {
        await updateMut.mutateAsync({ id: customer.id, input: values });
        toast({ title: "Cliente actualizado", variant: "success" });
      } else {
        await createMut.mutateAsync(values);
        toast({ title: "Cliente creado", variant: "success" });
      }
      onDone();
    } catch (e) {
      toast({
        title: "Error al guardar cliente",
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
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Localidad"
          error={errors.locality?.message}
          {...register("locality", {
            setValueAs: (v) => (v === "" ? null : v),
          })}
        />
        <Input
          label="Teléfono"
          error={errors.phone?.message}
          {...register("phone", { setValueAs: (v) => (v === "" ? null : v) })}
        />
      </div>
      <Input
        label="Domicilio"
        error={errors.address?.message}
        {...register("address", { setValueAs: (v) => (v === "" ? null : v) })}
      />
      <Input
        label="Email"
        type="email"
        placeholder="Opcional"
        error={errors.email?.message}
        {...register("email", { setValueAs: (v) => (v === "" ? null : v) })}
      />
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Volver
        </Button>
        <Button
          type="submit"
          loading={createMut.isPending || updateMut.isPending}
        >
          {customer ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
