import { AIConfigCard } from "@/components/internal/AIConfigCard";
import { requireInternal } from "@/modules/internal/server";
import { getAIConfigStatus, aiEncryptionAvailable } from "@/lib/ai/config";

export const dynamic = "force-dynamic";

// Configuración de plataforma del panel staff Ninja-Soft. Server component:
// verifica staff y lee el estado (NO la key) de la config de IA con admin
// client. La key nunca cruza la red: solo provider/model/configured. Las
// escrituras van por /api/internal/ai-config (auditado, key redactada).

export default async function InternalSettingsPage() {
  await requireInternal();
  const [status, encryptionReady] = await Promise.all([
    getAIConfigStatus(),
    Promise.resolve(aiEncryptionAvailable()),
  ]);

  return (
    <AIConfigCard
      initial={
        status
          ? {
              provider: status.provider,
              model: status.model,
              configured: status.configured,
            }
          : null
      }
      encryptionReady={encryptionReady}
    />
  );
}
