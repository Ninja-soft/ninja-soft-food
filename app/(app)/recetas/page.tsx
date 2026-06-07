"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
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
import { GroupFormModal } from "@/components/recipes/GroupFormModal";
import { RecipeFormModal } from "@/components/recipes/RecipeFormModal";
import { cn } from "@/lib/utils/cn";
import { daysUntil, formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";
import type { Recipe, RecipeGroup } from "@/modules/recipes/api";
import {
  useDeleteGroup,
  useDeleteRecipe,
  useRecipeGroups,
  useRecipes,
} from "@/modules/recipes/hooks";
import { type RnpaFilter } from "@/modules/recipes/schemas";

const RNPA_FILTERS: { value: RnpaFilter; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "sin_rnpa", label: "Sin RNPA" },
  { value: "vence_6m", label: "RNPA vence < 6 meses" },
  { value: "vence_60d", label: "RNPA vence < 60 días" },
];

function rnpaBadge(r: Recipe): { label: string; cls: string } | null {
  if (r.rnpa_exempt)
    return { label: "Exenta", cls: "bg-muted text-muted-foreground" };
  if (!r.rnpa_number)
    return { label: "Sin RNPA", cls: "bg-destructive/15 text-destructive" };
  const d = daysUntil(r.rnpa_expiry);
  if (d === null)
    return { label: `RNPA ${r.rnpa_number}`, cls: "bg-primary/15 text-primary" };
  if (d < 0)
    return { label: "RNPA vencido", cls: "bg-destructive/15 text-destructive" };
  if (d <= 60)
    return { label: `RNPA vence en ${d}d`, cls: "bg-accent/15 text-accent" };
  return { label: `RNPA ${r.rnpa_number}`, cls: "bg-primary/15 text-primary" };
}

// Cantidad de sellos de rotulado de la receta: lee regulatory_labels (sistema
// resuelto por país) con fallback a front_labels legacy (octógonos AR).
function labelCount(r: Recipe): number {
  if (r.regulatory_labels?.values) return r.regulatory_labels.values.length;
  return r.front_labels?.length ?? 0;
}

function matchesRnpaFilter(r: Recipe, f: RnpaFilter): boolean {
  if (f === "todos") return true;
  if (f === "sin_rnpa") return !r.rnpa_exempt && !r.rnpa_number;
  const d = daysUntil(r.rnpa_expiry);
  if (r.rnpa_exempt || !r.rnpa_number || d === null) return false;
  if (f === "vence_6m") return d <= 183;
  return d <= 60;
}

// Catálogo de recetas (heredado de La Jamonera): grupos + RNPA + fórmula.
export default function RecetasPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [rnpaFilter, setRnpaFilter] = useState<RnpaFilter>("todos");

  const { data: groups } = useRecipeGroups();
  const { data: recipes, isLoading } = useRecipes(search, groupId);

  const [recipeModal, setRecipeModal] = useState<{
    open: boolean;
    recipe: Recipe | null;
  }>({ open: false, recipe: null });
  const [groupModal, setGroupModal] = useState<{
    open: boolean;
    group: RecipeGroup | null;
  }>({ open: false, group: null });
  const [deleteTarget, setDeleteTarget] = useState<Recipe | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] =
    useState<RecipeGroup | null>(null);

  const deleteRecipeMut = useDeleteRecipe();
  const deleteGroupMut = useDeleteGroup();

  const activeGroup = useMemo(
    () => (groups ?? []).find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );

  const filtered = useMemo(
    () => (recipes ?? []).filter((r) => matchesRnpaFilter(r, rnpaFilter)),
    [recipes, rnpaFilter],
  );

  function rnpaCell(r: Recipe): string {
    if (r.rnpa_exempt) return "Exenta";
    return r.rnpa_number ?? "Sin RNPA";
  }

  function handleExport() {
    void exportToExcel({
      filename: "recetas",
      sheetName: "Recetas",
      title: "Catálogo de recetas",
      subtitle: activeGroup ? `Grupo: ${activeGroup.name}` : undefined,
      columns: [
        { header: "Receta", key: "title", width: 32 },
        { header: "Grupo", key: "group", width: 22 },
        { header: "RNPA", key: "rnpa", width: 20 },
        { header: "Vence RNPA", key: "rnpaExpiry", format: "date", width: 16 },
        { header: "Vida útil (días)", key: "shelf", format: "number", width: 16 },
        { header: "Ingredientes", key: "ingredients", format: "number", width: 14 },
      ],
      rows: filtered.map((r) => ({
        title: r.commercial_name ? `${r.title} (${r.commercial_name})` : r.title,
        group: r.group?.name ?? "",
        rnpa: rnpaCell(r),
        rnpaExpiry: r.rnpa_exempt ? null : r.rnpa_expiry,
        shelf: r.shelf_life_days,
        ingredients: r.recipe_ingredients.length,
      })),
    });
  }

  async function confirmDeleteRecipe() {
    if (!deleteTarget) return;
    try {
      await deleteRecipeMut.mutateAsync(deleteTarget.id);
      toast({ title: "Receta eliminada", variant: "success" });
      setDeleteTarget(null);
    } catch (e) {
      toast({
        title: "Error al eliminar",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    }
  }

  async function confirmDeleteGroup() {
    if (!deleteGroupTarget) return;
    try {
      await deleteGroupMut.mutateAsync(deleteGroupTarget.id);
      if (groupId === deleteGroupTarget.id) setGroupId(null);
      toast({ title: "Grupo eliminado", variant: "success" });
      setDeleteGroupTarget(null);
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
            Recetas
          </Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            Fichas técnicas de tus productos: fórmula, RNPA, vida útil y
            rotulado.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={filtered.length === 0}
          >
            <Download size={16} />
            Exportar Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() => setGroupModal({ open: true, group: null })}
          >
            <FolderPlus size={16} />
            Grupo
          </Button>
          <Button
            onClick={() => setRecipeModal({ open: true, recipe: null })}
          >
            <Plus size={16} />
            Nueva receta
          </Button>
        </div>
      </div>

      {/* Grupos */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setGroupId(null)}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm transition",
            groupId === null
              ? "border-primary bg-primary/15 font-semibold text-primary"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          Todos
        </button>
        {(groups ?? []).map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => setGroupId(g.id === groupId ? null : g.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition",
              groupId === g.id
                ? "border-primary bg-primary/15 font-semibold text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {g.name}
          </button>
        ))}
        {activeGroup && (
          <Dropdown>
            <DropdownTrigger asChild>
              <button
                type="button"
                aria-label="Opciones de grupo"
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <MoreVertical size={16} />
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem
                onSelect={() => setGroupModal({ open: true, group: activeGroup })}
              >
                <Pencil size={14} />
                Renombrar grupo
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                className="text-destructive"
                onSelect={() => setDeleteGroupTarget(activeGroup)}
              >
                <Trash2 size={14} />
                Eliminar grupo
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        )}
      </div>

      {/* Filtro RNPA + búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {RNPA_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setRnpaFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition",
                rnpaFilter === f.value
                  ? "bg-secondary font-semibold text-secondary-foreground ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar receta…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-10 pr-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <SpinnerBlock />
      ) : filtered.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-3 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-primary/15 text-primary">
            <UtensilsCrossed size={26} />
          </span>
          <div>
            <p className="font-semibold">
              {search || groupId || rnpaFilter !== "todos"
                ? "Sin resultados"
                : "Todavía no hay recetas"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {search || groupId || rnpaFilter !== "todos"
                ? "Probá con otros filtros."
                : "Creá la ficha técnica de tu primer producto."}
            </p>
          </div>
          {!search && !groupId && rnpaFilter === "todos" && (
            <Button onClick={() => setRecipeModal({ open: true, recipe: null })}>
              <Plus size={16} />
              Nueva receta
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => {
            const badge = rnpaBadge(r);
            return (
              <div
                key={r.id}
                className="group glass-card flex gap-3 p-4 transition hover:border-primary/40"
              >
                <button
                  type="button"
                  onClick={() => setRecipeModal({ open: true, recipe: r })}
                  className="flex min-w-0 flex-1 gap-3 text-left"
                >
                  <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-muted/60 text-muted-foreground">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UtensilsCrossed size={22} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {r.title}
                    </span>
                    {r.commercial_name && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.commercial_name}
                      </span>
                    )}
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {badge && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            badge.cls,
                          )}
                        >
                          {badge.label}
                        </span>
                      )}
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {r.recipe_ingredients.length} ingr.
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {r.shelf_life_days}d vida útil
                      </span>
                      {labelCount(r) > 0 && (
                        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground">
                          {labelCount(r)} sello{labelCount(r) > 1 ? "s" : ""}
                        </span>
                      )}
                    </span>
                    {r.rnpa_expiry && !r.rnpa_exempt && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        RNPA vence {formatDate(r.rnpa_expiry)}
                      </span>
                    )}
                  </span>
                </button>
                <Dropdown>
                  <DropdownTrigger asChild>
                    <button
                      type="button"
                      aria-label="Opciones"
                      className="h-fit rounded-lg p-1.5 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <MoreVertical size={16} />
                    </button>
                  </DropdownTrigger>
                  <DropdownContent>
                    <DropdownItem
                      onSelect={() => setRecipeModal({ open: true, recipe: r })}
                    >
                      <Pencil size={14} />
                      Editar
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem
                      className="text-destructive"
                      onSelect={() => setDeleteTarget(r)}
                    >
                      <Trash2 size={14} />
                      Eliminar
                    </DropdownItem>
                  </DropdownContent>
                </Dropdown>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      <RecipeFormModal
        open={recipeModal.open}
        onOpenChange={(o) => setRecipeModal((s) => ({ ...s, open: o }))}
        recipe={recipeModal.recipe}
      />
      <GroupFormModal
        open={groupModal.open}
        onOpenChange={(o) => setGroupModal((s) => ({ ...s, open: o }))}
        group={groupModal.group}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar receta"
        description={`"${deleteTarget?.title}" dejará de aparecer. Las producciones históricas conservan su trazabilidad.`}
        confirmLabel="Eliminar"
        danger
        loading={deleteRecipeMut.isPending}
        onConfirm={confirmDeleteRecipe}
      />
      <ConfirmDialog
        open={!!deleteGroupTarget}
        onOpenChange={(o) => !o && setDeleteGroupTarget(null)}
        title="Eliminar grupo"
        description={`Las recetas de "${deleteGroupTarget?.name}" quedan sin grupo (no se eliminan).`}
        confirmLabel="Eliminar"
        danger
        loading={deleteGroupMut.isPending}
        onConfirm={confirmDeleteGroup}
      />
    </div>
  );
}
