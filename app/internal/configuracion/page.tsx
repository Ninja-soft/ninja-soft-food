import { AIConfigCard } from "@/components/internal/AIConfigCard";
import { PlatformMpCard } from "@/components/internal/PlatformMpCard";
import { requireInternal } from "@/modules/internal/server";
import { getAIConfigStatus, aiEncryptionAvailable } from "@/lib/ai/config";
import {
  getPlatformMpStatus,
  mpEncryptionAvailable,
} from "@/lib/billing/platform-config";

export const dynamic = "force-dynamic";

// Configuración de plataforma del panel staff Ninja-Soft. Server component:
// verifica staff y lee el estado (NO los secretos) de la config de IA y del
// medio de pago con admin client. Ningún secreto cruza la red: solo
// provider/model/configured. Las escrituras van por route handlers auditados
// (/api/internal/ai-config y /api/internal/mp-config), con secretos redactados.

export default async function InternalSettingsPage() {
  await requireInternal();
  const [aiStatus, aiReady, mpStatus, mpReady] = await Promise.all([
    getAIConfigStatus(),
    Promise.resolve(aiEncryptionAvailable()),
    getPlatformMpStatus(),
    Promise.resolve(mpEncryptionAvailable()),
  ]);

  return (
    <div className="space-y-12">
      <PlatformMpCard
        initial={
          mpStatus
            ? {
                accessTokenConfigured: mpStatus.accessTokenConfigured,
                webhookSecretConfigured: mpStatus.webhookSecretConfigured,
                publicKey: mpStatus.publicKey,
                updatedAt: mpStatus.updatedAt,
              }
            : null
        }
        encryptionReady={mpReady}
      />

      <div className="border-t border-border" />

      <AIConfigCard
        initial={
          aiStatus
            ? {
                provider: aiStatus.provider,
                model: aiStatus.model,
                configured: aiStatus.configured,
              }
            : null
        }
        encryptionReady={aiReady}
      />
    </div>
  );
}
