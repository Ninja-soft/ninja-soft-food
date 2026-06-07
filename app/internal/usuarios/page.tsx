"use client";

import { useMemo, useState } from "react";
import { Ban, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { Eyebrow, Display } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  useGlobalUsers,
  useSetUserActive,
  type GlobalUserDTO,
} from "@/modules/internal-ops/hooks";
import { formatDate } from "@/lib/utils/format";

const ROLE_LABELS: Record<string, string> = {
  owner: "dueño",
  manager: "encargado",
  operator: "operario",
  viewer: "lector",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function InternalUsersPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [onlySuspended, setOnlySuspended] = useState(false);
  const [confirm, setConfirm] = useState<GlobalUserDTO | null>(null);
  const { data: users, isLoading } = useGlobalUsers(search);
  const setActive = useSetUserActive();

  const filtered = useMemo(
    () => (users ?? []).filter((u) => !onlySuspended || u.suspended),
    [users, onlySuspended],
  );

  function onToggle(u: GlobalUserDTO) {
    const activating = u.suspended;
    setActive.mutate(
      { userId: u.id, active: activating },
      {
        onSuccess: () => {
          toast({
            title: activating ? "Cuenta reactivada" : "Cuenta suspendida",
            variant: "success",
          });
          setConfirm(null);
        },
        onError: (e) =>
          toast({
            title: "No se pudo actualizar",
            description: e instanceof Error ? e.message : undefined,
            variant: "error",
          }),
      },
    );
  }

  return (
    <>
      <Eyebrow>Operaciones</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Usuarios</Display>
      <p className="mt-2 text-muted-foreground">
        Todas las cuentas de la plataforma con sus membresías por negocio. Podés
        suspender o reactivar cuentas; cada acción queda auditada.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlySuspended}
            onChange={(e) => setOnlySuspended(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Solo suspendidos
        </label>
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} de {users?.length ?? 0}
          </span>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">Negocios</th>
              <th className="px-4 py-3">Staff</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Alta</th>
              <th className="px-4 py-3">Último acceso</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10">
                  <SpinnerBlock />
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Sin resultados.
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="transition hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.fullName ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  {u.memberships.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.memberships.map((m, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
                        >
                          {m.tenantName}
                          <span className="ml-1 text-muted-foreground">
                            ({ROLE_LABELS[m.role] ?? m.role})
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.isInternal ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      <ShieldCheck size={12} /> Staff
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.suspended ? (
                    <span className="inline-flex rounded-full border border-red-400/40 bg-red-400/10 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                      Suspendido
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                      Activo
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(u.createdAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {fmtDateTime(u.lastSignInAt)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setConfirm(u)}
                      disabled={setActive.isPending}
                      title={u.suspended ? "Reactivar cuenta" : "Suspender cuenta"}
                      className={
                        u.suspended
                          ? "rounded-md p-2 text-muted-foreground transition hover:bg-emerald-500/15 hover:text-emerald-300"
                          : "rounded-md p-2 text-muted-foreground transition hover:bg-red-400/15 hover:text-red-300"
                      }
                    >
                      {u.suspended ? <RotateCcw size={16} /> : <Ban size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.suspended ? "Reactivar cuenta" : "Suspender cuenta"}
        description={
          confirm?.suspended
            ? `${confirm?.email} va a poder volver a iniciar sesión. La acción queda registrada en auditoría.`
            : `${confirm?.email} no va a poder iniciar sesión hasta reactivarla. La acción queda registrada en auditoría.`
        }
        confirmLabel={confirm?.suspended ? "Reactivar" : "Suspender"}
        danger={!confirm?.suspended}
        loading={setActive.isPending}
        onConfirm={() => confirm && onToggle(confirm)}
      />
    </>
  );
}
