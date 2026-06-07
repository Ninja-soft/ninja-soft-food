import { Heading } from "@/components/ui/Typography";
import { EmailConsole } from "@/components/internal/EmailConsole";
import { SystemEmailsTable } from "@/components/internal/SystemEmailsTable";
import { listSystemEmails } from "@/modules/internal/server";
import {
  getSmtpConfig,
  getTemplateOverrides,
} from "@/modules/internal-emails/server";

export const dynamic = "force-dynamic";

// Consola de emails del panel staff Ninja-Soft (calcada del POS app/internal/
// emails). Server component: lee config SMTP y overrides de plantilla con admin
// client (ambas tablas son solo service_role) y baja todo al EmailConsole. La
// bitacora de envios (system_emails) queda debajo como historial.

export default async function InternalEmailsPage() {
  const [smtp, overrides, emails] = await Promise.all([
    getSmtpConfig(),
    getTemplateOverrides(),
    listSystemEmails(200),
  ]);

  return (
    <>
      <EmailConsole
        smtp={
          smtp
            ? {
                hostname: smtp.hostname,
                port: smtp.port,
                username: smtp.username,
                hasPassword: smtp.hasPassword,
                fromEmail: smtp.fromEmail,
                fromName: smtp.fromName,
                secure: smtp.secure,
              }
            : null
        }
        overrides={overrides}
      />

      <div className="mt-10">
        <Heading className="text-xl">Bitácora de envíos</Heading>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Últimos emails que Ninja Food envió (verificación, alertas, billing).
          Estado de entrega y errores de SMTP.
        </p>
        <div className="mt-4">
          <SystemEmailsTable emails={emails} />
        </div>
      </div>
    </>
  );
}
