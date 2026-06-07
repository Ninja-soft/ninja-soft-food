import { EmailsTabs } from "@/components/internal/EmailsTabs";
import { listSystemEmails } from "@/modules/internal/server";
import {
  getSmtpConfig,
  getTemplateOverrides,
} from "@/modules/internal-emails/server";
import {
  listCampaignHistory,
  listCountryOptions,
  listPlanOptions,
} from "@/modules/internal-campaigns/server";

export const dynamic = "force-dynamic";

// Consola de emails del panel staff Ninja-Soft. Server component: lee config
// SMTP, overrides de plantilla, bitácora de envíos y los datos de campañas
// (planes, países de la audiencia, historial) con admin client, y baja todo a
// EmailsTabs (Plantillas | Campañas). Las tablas de config son solo service_role.

export default async function InternalEmailsPage() {
  const [smtp, overrides, emails, plans, countries, campaigns] =
    await Promise.all([
      getSmtpConfig(),
      getTemplateOverrides(),
      listSystemEmails(200),
      listPlanOptions(),
      listCountryOptions(),
      listCampaignHistory(),
    ]);

  return (
    <EmailsTabs
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
      emails={emails}
      plans={plans}
      countries={countries}
      campaigns={campaigns}
    />
  );
}
