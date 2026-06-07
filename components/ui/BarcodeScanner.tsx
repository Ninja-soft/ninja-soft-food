"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Keyboard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { SpinnerBlock } from "@/components/ui/Spinner";

// Escáner de códigos de barra (EAN-13/EAN-8/Code-128/QR) por cámara.
// La lógica de cámara (html5-qrcode) vive en BarcodeScannerEngine y se carga
// con dynamic(ssr:false): toca `navigator`/DOM y no debe ir al bundle de SSR.
// Este wrapper aporta el modal, el SIEMPRE-presente fallback a tipeo manual y
// la entrega del resultado.

const BarcodeScannerEngine = dynamic(
  () => import("@/components/ui/BarcodeScannerEngine"),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[240px] place-items-center rounded-ninjaMd border border-border bg-card/40">
        <SpinnerBlock />
      </div>
    ),
  },
);

export function BarcodeScanner({
  open,
  onOpenChange,
  onResult,
  title = "Escanear código",
  description = "Apuntá la cámara al código de barras o cargalo a mano.",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Recibe el código (escaneado o tipeado). El consumidor cierra el modal. */
  onResult: (code: string) => void;
  title?: string;
  description?: string;
}) {
  const [manual, setManual] = useState("");

  // Limpiar el input manual cada vez que se abre.
  useEffect(() => {
    if (open) setManual("");
  }, [open]);

  function handleDecoded(value: string) {
    const code = value.trim();
    if (!code) return;
    onResult(code);
  }

  function submitManual() {
    const code = manual.trim();
    if (!code) return;
    onResult(code);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="space-y-5">
        {/* Solo montamos el motor de cámara cuando el modal está abierto:
            así arranca/para el stream junto con el ciclo de vida del modal. */}
        {open && <BarcodeScannerEngine onDecoded={handleDecoded} />}

        {/* Fallback manual — SIEMPRE disponible (regla: nunca dejar al usuario sin salida). */}
        <div className="space-y-2 rounded-ninjaMd border border-dashed border-border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Keyboard size={15} className="text-muted-foreground" />
            Ingreso manual
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitManual();
                  }
                }}
                placeholder="Tipeá o pegá el código"
                inputMode="numeric"
                aria-label="Código de barras manual"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={submitManual}
              disabled={!manual.trim()}
            >
              Usar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
