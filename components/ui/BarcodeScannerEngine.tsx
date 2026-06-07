"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera } from "lucide-react";
import { SpinnerBlock } from "@/components/ui/Spinner";

// Motor de cámara del escáner. Aislado de la UI del modal para poder cargarse
// con dynamic(ssr:false): la librería html5-qrcode toca `navigator`/DOM y NO
// debe entrar en el bundle de SSR ni evaluarse en el server.
//
// Maneja: enumeración de cámaras, permisos (con mensaje claro al denegar),
// arranque/parada del stream y callback de lectura. El fallback a tipeo manual
// vive en el wrapper (BarcodeScanner), no acá.

type CameraDevice = { id: string; label: string };

// Subconjunto de la API de Html5Qrcode que usamos (evita `any` y acoplar el
// typing completo de la lib, que se carga dinámicamente).
type ScannerInstance = {
  start: (
    cameraId: string,
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError: (message: string) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
};

export type BarcodeScannerEngineProps = {
  /** Se llama con el texto decodificado en la primera lectura válida. */
  onDecoded: (value: string) => void;
};

const VIEWPORT_ID = "ninja-barcode-viewport";

export default function BarcodeScannerEngine({
  onDecoded,
}: BarcodeScannerEngineProps) {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [activeCamera, setActiveCamera] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "loading" | "running" | "denied" | "no-camera" | "error"
  >("loading");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const scannerRef = useRef<ScannerInstance | null>(null);
  const decodedRef = useRef(false);

  // Enumerar cámaras al montar (dispara el prompt de permisos).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const devices = (await Html5Qrcode.getCameras()) as CameraDevice[];
        if (cancelled) return;
        if (!devices || devices.length === 0) {
          setStatus("no-camera");
          return;
        }
        setCameras(devices);
        // Preferir la cámara trasera ("back"/"rear"/"environment") si existe.
        const back = devices.find((d) =>
          /back|rear|environment|trasera/i.test(d.label),
        );
        setActiveCamera(back?.id ?? devices[devices.length - 1].id);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/permission|denied|notallowed/i.test(msg)) setStatus("denied");
        else setStatus("error");
        setErrorDetail(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Arrancar / reiniciar el stream cuando cambia la cámara elegida.
  useEffect(() => {
    if (!activeCamera) return;
    let stopped = false;
    decodedRef.current = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        // Parar instancia previa (cambio de cámara).
        if (scannerRef.current) {
          try {
            await scannerRef.current.stop();
            scannerRef.current.clear();
          } catch {
            // ignorar: ya estaba parada
          }
          scannerRef.current = null;
        }
        if (stopped) return;

        const scanner = new Html5Qrcode(VIEWPORT_ID, {
          verbose: false,
        }) as unknown as ScannerInstance;
        scannerRef.current = scanner;

        await scanner.start(
          activeCamera,
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded: string) => {
            if (decodedRef.current) return;
            decodedRef.current = true;
            onDecoded(decoded);
          },
          () => {
            // callback de "no se leyó este frame": silenciado a propósito.
          },
        );
        if (!stopped) setStatus("running");
      } catch (e) {
        if (stopped) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/permission|denied|notallowed/i.test(msg)) setStatus("denied");
        else setStatus("error");
        setErrorDetail(msg);
      }
    })();

    return () => {
      stopped = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* ya parada */
          });
      }
    };
  }, [activeCamera, onDecoded]);

  if (status === "denied" || status === "no-camera" || status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-ninjaMd border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle size={22} />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {status === "denied"
              ? "Sin acceso a la cámara"
              : status === "no-camera"
                ? "No se detectó ninguna cámara"
                : "No se pudo iniciar el escáner"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status === "denied"
              ? "Habilitá el permiso de cámara en el navegador y volvé a abrir el escáner, o cargá el código a mano abajo."
              : "Usá el ingreso manual abajo para cargar el código."}
          </p>
          {errorDetail && status === "error" && (
            <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground/70">
              {errorDetail}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-ninjaMd border border-border bg-black/80">
        {/* Viewport de la cámara (lo controla html5-qrcode). */}
        <div id={VIEWPORT_ID} className="min-h-[240px] w-full [&_video]:object-cover" />

        {/* Estado de carga sobre el viewport. */}
        {status === "loading" && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 backdrop-blur-[2px]">
            <SpinnerBlock />
          </div>
        )}

        {/* Overlay de targeting: marco con esquinas de acento + línea de barrido. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-[160px] w-[260px] max-w-[80%]">
            <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-ninjaMd border-l-2 border-t-2 border-primary" />
            <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-ninjaMd border-r-2 border-t-2 border-primary" />
            <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-ninjaMd border-b-2 border-l-2 border-primary" />
            <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-ninjaMd border-b-2 border-r-2 border-primary" />
            <span className="absolute inset-x-3 top-1/2 h-px animate-pulse bg-primary/70 shadow-[0_0_12px_2px_hsl(var(--primary)/0.6)]" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Camera size={14} className="shrink-0 text-primary" />
        <span>Apuntá al código de barras o QR. Se lee solo.</span>
      </div>

      {/* Selector de cámara si hay más de una. */}
      {cameras.length > 1 && (
        <select
          value={activeCamera ?? ""}
          onChange={(e) => {
            setStatus("loading");
            setActiveCamera(e.target.value);
          }}
          aria-label="Elegir cámara"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          {cameras.map((c, i) => (
            <option key={c.id} value={c.id}>
              {c.label || `Cámara ${i + 1}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
