import { Eyebrow, Display } from "@/components/ui/Typography";
import { SystemEmailsTable } from "@/components/internal/SystemEmailsTable";
import { listSystemEmails } from "@/modules/internal/server";

export const dynamic = "force-dynamic";

// system_emails solo es legible con service_role: server component + admin client
// (modules/internal/server). Log de envíos del sistema (no es el editor de
// plantillas, que vive en el módulo emails del tenant).

export default async function InternalEmailsPage() {
  const emails = await listSystemEmails(200);

  return (
    <>
      <Eyebrow>Comunicaciones</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Emails del sistema</Display>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Bitácora de los emails que Ninja Food envía (verificación, alertas,
        billing). Estado de entrega y errores de SMTP.
      </p>

      <div className="mt-6">
        <SystemEmailsTable emails={emails} />
      </div>
    </>
  );
}
