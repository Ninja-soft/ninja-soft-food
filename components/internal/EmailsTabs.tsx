"use client";

import { useState } from "react";
import { Eyebrow, Display, Heading } from "@/components/ui/Typography";
import { Segmented } from "@/components/ui/Segmented";
import { EmailConsole, type SmtpInitial } from "@/components/internal/EmailConsole";
import {
  SystemEmailsTable,
  type SystemEmailView,
} from "@/components/internal/SystemEmailsTable";
import { CampaignsConsole } from "@/components/internal/CampaignsConsole";
import {
  CampaignHistoryTable,
  type CampaignHistoryView,
} from "@/components/internal/CampaignHistoryTable";

// =============================================================================
// EmailsTabs — switcher de la consola de emails del panel staff. Dos pestañas:
//   - Plantillas: SMTP + editor de plantillas del sistema + bitácora de envíos.
//   - Campañas: segmentación de audiencia + composición + envío batch + historial.
// Los datos se cargan en el server component padre (admin client) y bajan acá.
// =============================================================================

type Tab = "templates" | "campaigns";

export interface EmailsTabsProps {
  smtp: SmtpInitial | null;
  overrides: Record<string, { subject: string; html: string }>;
  emails: SystemEmailView[];
  plans: { key: string; name: string }[];
  countries: string[];
  campaigns: CampaignHistoryView[];
}

export function EmailsTabs({
  smtp,
  overrides,
  emails,
  plans,
  countries,
  campaigns,
}: EmailsTabsProps) {
  const [tab, setTab] = useState<Tab>("templates");
  const smtpReady = Boolean(smtp?.hostname && smtp?.fromEmail);

  return (
    <>
      <Eyebrow>Comunicaciones</Eyebrow>
      <Display className="mt-3 text-3xl md:text-4xl">Consola de emails</Display>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Configurá el remitente y las plantillas del sistema, o lanzá una campaña
        a los suscriptores. Estilo de marca: sin emojis, sin guiones largos,
        separador punto medio (·).
      </p>

      <div className="mt-5">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "templates", label: "Plantillas" },
            { value: "campaigns", label: "Campañas" },
          ]}
        />
      </div>

      {tab === "templates" ? (
        <div className="mt-6">
          <EmailConsole smtp={smtp} overrides={overrides} bare />

          <div className="mt-10">
            <Heading className="text-xl">Bitácora de envíos</Heading>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Últimos emails que Ninja Food envió (verificación, alertas,
              billing, campañas). Estado de entrega y errores de SMTP.
            </p>
            <div className="mt-4">
              <SystemEmailsTable emails={emails} />
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <CampaignsConsole
            plans={plans}
            countries={countries}
            smtpReady={smtpReady}
          />

          <div className="mt-10">
            <Heading className="text-xl">Historial de campañas</Heading>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Campañas enviadas, agrupadas por asunto y día. Enviados y fallidos
              según la bitácora del sistema.
            </p>
            <div className="mt-4">
              <CampaignHistoryTable campaigns={campaigns} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
