"use client";

import { useMemo, useState } from "react";
import {
  Apple,
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Snowflake,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/Dropdown";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Eyebrow, Heading } from "@/components/ui/Typography";
import { FamilyFormModal } from "@/components/ingredients/FamilyFormModal";
import { IngredientFormModal } from "@/components/ingredients/IngredientFormModal";
import type { Family, Ingredient } from "@/modules/ingredients/api";
import {
  useDeleteFamily,
  useDeleteIngredient,
  useFamilies,
  useIngredients,
} from "@/modules/ingredients/hooks";
import { cn } from "@/lib/utils/cn";

// Catálogo de ingredientes: familias + búsqueda + CRUD (heredado de La Jamonera).
export default function IngredientesPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [familyId, setFamilyId] = useState<string | null>(null);

  const { data: families, isLoading: loadingFamilies } = useFamilies();
  const { data: ingredients, isLoading } = useIngredients(search, familyId);

  const [ingredientModal, setIngredientModal] = useState<{
    open: boolean;
    ingredient: Ingredient | null;
  }>({ open: false, ingredient: null });
  const [familyModal, setFamilyModal] = useState<{
    open: boolean;
    family: Family | null;
  }>({ open: false, family: null });
  const [deleteTarget, setDeleteTarget] = useState<Ingredient | null>(null);
  const [deleteFamilyTarget, setDeleteFamilyTarget] = useState<Family | null>(
    null,
  );

  const deleteIngredientMut = useDeleteIngredient();
  const deleteFamilyMut = useDeleteFamily();

  const activeFamily = useMemo(
    () => (families ?? []).find((f) => f.id === familyId) ?? null,
    [families, familyId],
  );

  async function confirmDeleteIngredient() {
    if (!deleteTarget) return;
    try {
      await deleteIngredientMut.mutateAsync(deleteTarget.id);
      toast({ title: "Ingrediente eliminado", variant: "success" });
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: "Error al eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function confirmDeleteFamily() {
    if (!deleteFamilyTarget) return;
    try {
      await deleteFamilyMut.mutateAsync(deleteFamilyTarget.id);
      if (familyId === deleteFamilyTarget.id) setFamilyId(null);
      toast({ title: "Familia eliminada", variant: "success" });
      setDeleteFamilyTarget(null);
    } catch (e) {
      toast({
        title: "Error al eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Catálogo</Eyebrow>
          <Heading as="h1" className="mt-3">
            Ingredientes
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Materias primas e insumos que alimentan tus recetas y tu stock.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => setFamilyModal({ open: true, family: null })}
          >
            <FolderPlus size={16} />
            Familia
          </Button>
          <Button
            onClick={() => setIngredientModal({ open: true, ingredient: null })}
          >
            <Plus size={16} />
            Nuevo ingrediente
          </Button>
        </div>
      </div>

      {/* Familias (chips) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFamilyId(null)}
          className={cn(
            "rounded-ninjaFull border px-4 py-1.5 text-sm transition",
            familyId === null
              ? "border-primary bg-primary/15 font-semibold text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Todas
        </button>
        {loadingFamilies && (
          <span className="text-xs text-muted-foreground">
            Cargando familias…
          </span>
        )}
        {(families ?? []).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFamilyId(f.id === familyId ? null : f.id)}
            className={cn(
              "rounded-ninjaFull border px-4 py-1.5 text-sm transition",
              familyId === f.id
                ? "border-primary bg-primary/15 font-semibold text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.name}
          </button>
        ))}
        {activeFamily && (
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                aria-label="Opciones de familia"
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem
                onSelect={() =>
                  setFamilyModal({ open: true, family: activeFamily })
                }
              >
                <Pencil size={14} />
                Renombrar familia
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                className="text-destructive"
                onSelect={() => setDeleteFamilyTarget(activeFamily)}
              >
                <Trash2 size={14} />
                Eliminar familia
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        )}
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ingrediente…"
          className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <SpinnerBlock />
      ) : (ingredients ?? []).length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-ninjaMd bg-primary/15 text-primary">
            <Apple size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {search || familyId
                ? "Sin resultados"
                : "Todavía no hay ingredientes"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || familyId
                ? "Probá con otra búsqueda u otra familia."
                : "Cargá tu primera materia prima para empezar a trazar."}
            </p>
          </div>
          {!search && !familyId && (
            <Button
              onClick={() =>
                setIngredientModal({ open: true, ingredient: null })
              }
            >
              <Plus size={16} />
              Nuevo ingrediente
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(ingredients ?? []).map((ing) => (
            <div
              key={ing.id}
              className="group glass-card flex items-center gap-3 p-3 transition hover:border-primary/40"
            >
              <button
                type="button"
                onClick={() => setIngredientModal({ open: true, ingredient: ing })}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-ninjaSm bg-muted/60 text-muted-foreground">
                  {ing.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ing.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Apple size={20} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {ing.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono">
                      {ing.unit}
                    </span>
                    {ing.family?.name && (
                      <span className="truncate">{ing.family.name}</span>
                    )}
                    {ing.is_perishable && (
                      <Snowflake
                        size={12}
                        className="shrink-0 text-primary"
                        aria-label="Perecedero"
                      />
                    )}
                  </span>
                </span>
              </button>
              <Dropdown>
                <DropdownTrigger asChild>
                  <button
                    type="button"
                    aria-label="Opciones"
                    className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <MoreVertical size={16} />
                  </button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem
                    onSelect={() =>
                      setIngredientModal({ open: true, ingredient: ing })
                    }
                  >
                    <Pencil size={14} />
                    Editar
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem
                    className="text-destructive"
                    onSelect={() => setDeleteTarget(ing)}
                  >
                    <Trash2 size={14} />
                    Eliminar
                  </DropdownItem>
                </DropdownContent>
              </Dropdown>
            </div>
          ))}
        </div>
      )}

      {/* Modales */}
      <IngredientFormModal
        open={ingredientModal.open}
        onOpenChange={(o) =>
          setIngredientModal((s) => ({ ...s, open: o }))
        }
        ingredient={ingredientModal.ingredient}
      />
      <FamilyFormModal
        open={familyModal.open}
        onOpenChange={(o) => setFamilyModal((s) => ({ ...s, open: o }))}
        family={familyModal.family}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar ingrediente"
        description={`"${deleteTarget?.name}" dejará de aparecer en el catálogo. El historial de stock y trazabilidad se conserva.`}
        confirmLabel="Eliminar"
        danger
        loading={deleteIngredientMut.isPending}
        onConfirm={confirmDeleteIngredient}
      />
      <ConfirmDialog
        open={!!deleteFamilyTarget}
        onOpenChange={(o) => !o && setDeleteFamilyTarget(null)}
        title="Eliminar familia"
        description={`Los ingredientes de "${deleteFamilyTarget?.name}" quedan sin familia (no se eliminan).`}
        confirmLabel="Eliminar"
        danger
        loading={deleteFamilyMut.isPending}
        onConfirm={confirmDeleteFamily}
      />
    </div>
  );
}
