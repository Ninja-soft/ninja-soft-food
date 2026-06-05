"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search } from "lucide-react";
import { Eyebrow, Display, Money } from "@/components/ui/Typography";
import { Button } from "@/components/ui/Button";
import { SpinnerBlock } from "@/components/ui/Spinner";
import { StatusBadge, TENANT_STATUS_LABELS } from "@/components/internal/StatusBadge";
import { useInternalTenants } from "@/modules/internal/hooks";
import { formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";

export default function InternalTenantsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const { data: tenants, isLoading } = useInternalTenants();

  const plans = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tenants ?? []) {
      if (t.planKey && t.planName) map.set(t.planKey, t.planName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tenants ?? []).filter((t) => {
      if (status && (t.subStatus ?? t.status) !== status) return false;
      if (plan && t.planKey !== plan) return false;
      if (!q) return true;
      return [t.name, t.slug, t.cuit]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [tenants, search, status, plan]);

  function handleExport() {
    void exportToExcel({
      filename: "negocios",
      sheetName: "Negocios",
      title: "Negocios · Panel Ninja-Soft",
      subtitle: `Emitido ${formatDate(new Date())} · ${filtered.length} registros`,
      columns: [
        { header: "Nombre", key: "name", width: 28 },
        { header: "Slug", key: "slug", width: 22 },
        { header: "CUIT", key: "cuit", width: 16 },
        { header: "Plan", key: "plan", width: 16 },
        { header: "Estado", key: "estado", width: 16 },
        { header: "Período hasta", key: "period", format: "date", width: 16 },
        { header: "Usuarios", key: "users", format: "number", width: 10 },
        { header: "Alta", key: "created", format: "date", width: 14 },
      ],
      rows: filtered.map((t) => ({
        name: t.name,
        slug: t.slug,
        cuit: t.cuit ?? "",
        plan: t.planName ?? "",
        estado:
          TENANT_STATUS_LABELS[t.subStatus ?? t.status] ?? t.subStatus ?? t.status,
        period: t.periodEnd,
        users: t.userCount,
        created: t.createdAt,
      })),
    });
  }

  const selectCls =
    "h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Operaciones</Eyebrow>
          <Display className="mt-3 text-3xl md:text-4xl">Negocios</Display>
          <p className="mt-2 text-muted-foreground">
            Todos los clientes del SaaS. Entrá a uno para gestionar su plan y
            suscripción.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={filtered.length === 0}
        >
          <Download size={16} /> Excel
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, slug o CUIT…"
            className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los estados</option>
          {Object.entries(TENANT_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos los planes</option>
          {plans.map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        {!isLoading && (
          <span className="text-xs text-muted-foreground">
            {filtered.length} de {tenants?.length ?? 0}
          </span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">CUIT</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Usuarios</th>
              <th className="px-4 py-3">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10">
                  <SpinnerBlock />
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {tenants?.length === 0
                    ? "No hay negocios todavía."
                    : "Sin resultados para los filtros elegidos."}
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="transition hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link
                    href={`/internal/tenants/${t.id}`}
                    className="font-medium text-foreground transition hover:text-primary"
                  >
                    {t.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{t.slug}</div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <Money>{t.cuit ?? "—"}</Money>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.planName ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={t.subStatus ?? t.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <Money>{t.userCount}</Money>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatDate(t.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
