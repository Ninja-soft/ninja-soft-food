"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Typography";
import { formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";

export interface PaymentEventView {
  id: string;
  provider: string;
  providerEventId: string;
  tenantName: string | null;
  processedAt: string | null;
  createdAt: string;
  payload: unknown;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function PaymentEventsTable({ events }: { events: PaymentEventView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  function handleExport() {
    void exportToExcel({
      filename: "eventos-de-pago",
      sheetName: "Pagos",
      title: "Eventos de pago · Panel Ninja-Soft",
      subtitle: `Emitido ${formatDate(new Date())} · ${events.length} eventos`,
      columns: [
        { header: "Fecha", key: "fecha", format: "datetime", width: 18 },
        { header: "Pasarela", key: "provider", width: 14 },
        { header: "Event ID", key: "eventId", width: 28 },
        { header: "Negocio", key: "tenant", width: 24 },
        { header: "Procesado", key: "processed", width: 14 },
      ],
      rows: events.map((e) => ({
        fecha: e.createdAt,
        provider: e.provider,
        eventId: e.providerEventId,
        tenant: e.tenantName ?? "",
        processed: e.processedAt ? "Sí" : "No",
      })),
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={events.length === 0}
        >
          <Download size={16} /> Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-ninjaMd border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3" />
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Pasarela</th>
              <th className="px-4 py-3">Event ID</th>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Procesado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {events.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No hay eventos de pago todavía.
                </td>
              </tr>
            )}
            {events.map((e) => {
              const open = openId === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    className="cursor-pointer transition hover:bg-muted/40"
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    <td className="px-2 py-3 text-muted-foreground">
                      {open ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {fmtDateTime(e.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-xs">
                        {e.provider}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Money className="text-xs">{e.providerEventId}</Money>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.tenantName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.processedAt ? (
                        <span className="text-emerald-300">
                          Sí · {fmtDateTime(e.processedAt)}
                        </span>
                      ) : (
                        <span className="text-orange-300">No</span>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Payload
                        </div>
                        <pre className="max-h-72 overflow-auto rounded-ninjaSm border border-border bg-background p-3 font-mono text-xs text-foreground">
                          {JSON.stringify(e.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
