"use client";

import { cn } from "@/lib/utils/cn";

// =============================================================================
// CampaignHistoryTable — historial de campañas enviadas, derivado de
// system_emails (agrupado por asunto + dia via el prefijo de campaña). Solo
// lectura: fecha, asunto, enviados/fallidos. Tokens del design system only.
// =============================================================================

export interface CampaignHistoryView {
  key: string;
  subject: string;
  date: string;
  sent: number;
  failed: number;
  total: number;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function CampaignHistoryTable({
  campaigns,
}: {
  campaigns: CampaignHistoryView[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-soft backdrop-blur-xl">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Asunto</th>
            <th className="px-4 py-3">Enviados</th>
            <th className="px-4 py-3">Fallidos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-foreground">
          {campaigns.length === 0 && (
            <tr>
              <td
                colSpan={4}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                Todavía no enviaste ninguna campaña.
              </td>
            </tr>
          )}
          {campaigns.map((c) => (
            <tr key={c.key} className="transition hover:bg-muted/40">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                {fmtDateTime(c.date)}
              </td>
              <td className="px-4 py-3 font-medium">{c.subject}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-300">
                  {c.sent}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    c.failed > 0
                      ? "border-red-400/30 bg-red-400/10 text-red-300"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {c.failed}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
