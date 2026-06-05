"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { exportToExcel } from "@/lib/utils/xlsx";

export interface SystemEmailView {
  id: string;
  subject: string;
  recipient: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  tenantName: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  queued: "En cola",
  sent: "Enviado",
  failed: "Fallido",
};
const STATUS_STYLES: Record<string, string> = {
  sent: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  failed: "border-red-400/30 bg-red-400/10 text-red-300",
  pending: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
  queued: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function SystemEmailsTable({ emails }: { emails: SystemEmailView[] }) {
  function handleExport() {
    void exportToExcel({
      filename: "emails-del-sistema",
      sheetName: "Emails",
      title: "Emails del sistema · Panel Ninja-Soft",
      subtitle: `Emitido ${formatDate(new Date())} · ${emails.length} registros`,
      columns: [
        { header: "Fecha", key: "fecha", format: "datetime", width: 18 },
        { header: "Asunto", key: "subject", width: 36 },
        { header: "Destinatario", key: "recipient", width: 28 },
        { header: "Negocio", key: "tenant", width: 22 },
        { header: "Estado", key: "estado", width: 14 },
        { header: "Error", key: "error", width: 30 },
      ],
      rows: emails.map((e) => ({
        fecha: e.createdAt,
        subject: e.subject,
        recipient: e.recipient,
        tenant: e.tenantName ?? "",
        estado: STATUS_LABELS[e.status] ?? e.status,
        error: e.errorMessage ?? "",
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
          disabled={emails.length === 0}
        >
          <Download size={16} /> Excel
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-soft backdrop-blur-xl">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Asunto</th>
              <th className="px-4 py-3">Destinatario</th>
              <th className="px-4 py-3">Negocio</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-foreground">
            {emails.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No hay emails registrados todavía.
                </td>
              </tr>
            )}
            {emails.map((e) => (
              <tr key={e.id} className="transition hover:bg-muted/40">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {fmtDateTime(e.createdAt)}
                </td>
                <td className="px-4 py-3 font-medium">{e.subject}</td>
                <td className="px-4 py-3 text-muted-foreground">{e.recipient}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {e.tenantName ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      STATUS_STYLES[e.status] ??
                        "border-border bg-muted text-muted-foreground",
                    )}
                    title={e.errorMessage ?? undefined}
                  >
                    {STATUS_LABELS[e.status] ?? e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
