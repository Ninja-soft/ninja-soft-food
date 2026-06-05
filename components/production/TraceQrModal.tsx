"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Money } from "@/components/ui/Typography";

// QR de la traza pública de una producción (heredado de La Jamonera).
export function TraceQrModal({
  slug,
  code,
  onClose,
}: {
  slug: string | null;
  code: string | null;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const traceUrl = slug
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin}/t/${slug}`
    : null;

  useEffect(() => {
    if (!traceUrl) {
      setDataUrl(null);
      return;
    }
    QRCode.toDataURL(traceUrl, {
      width: 480,
      margin: 2,
      color: { dark: "#04140A", light: "#FFFFFF" },
    }).then(setDataUrl);
  }, [traceUrl]);

  return (
    <Modal
      open={!!slug}
      onOpenChange={(o) => !o && onClose()}
      title={`Traza pública · ${code ?? ""}`}
      description="Escaneable desde el punto de venta. La traza es un snapshot inmutable."
      className="max-w-sm"
    >
      <div className="flex flex-col items-center gap-4">
        {dataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="QR de trazabilidad"
            className="w-56 rounded-lg border border-border bg-white p-2"
          />
        )}
        {traceUrl && (
          <Money className="break-all text-center text-xs text-muted-foreground">
            {traceUrl}
          </Money>
        )}
        <div className="flex gap-2">
          {dataUrl && (
            <a download={`qr-${code ?? "traza"}.png`} href={dataUrl}>
              <Button variant="secondary" size="sm">
                <Download size={14} />
                PNG
              </Button>
            </a>
          )}
          {traceUrl && (
            <a href={traceUrl} target="_blank" rel="noreferrer">
              <Button size="sm">
                <ExternalLink size={14} />
                Ver traza
              </Button>
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
