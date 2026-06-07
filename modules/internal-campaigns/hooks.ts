"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  AudienceFilter,
  SubscriptionStatus,
} from "./schemas";

// =============================================================================
// modules/internal-campaigns/hooks — mutaciones de la consola de campañas.
//
// Preview de audiencia (dry-run) y envio (prueba o batch). Patron identico a
// useSendTestEmail: route handlers auditados, requireInternal del lado server.
// =============================================================================

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const e = json as { error?: string; detail?: string };
    throw new Error(e.detail || e.error || "campaign_action_failed");
  }
  return json;
}

export interface AudienceMemberView {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  ownerName: string | null;
  status: SubscriptionStatus;
  planKey: string | null;
  billingMode: string | null;
  country: string | null;
}

export interface AudienceResult {
  total: number;
  members: AudienceMemberView[];
}

export function usePreviewAudience() {
  return useMutation({
    mutationFn: (filter: AudienceFilter) =>
      postJson<AudienceResult>("/api/internal/campaigns/audience", { filter }),
  });
}

export interface SendCampaignPayload {
  filter: AudienceFilter;
  subject: string;
  html: string;
  test?: boolean;
  confirmCount?: number;
}

export interface SendCampaignResult {
  ok: boolean;
  test?: boolean;
  to?: string;
  total?: number;
  sent?: number;
  failed?: number;
}

export function useSendCampaign() {
  return useMutation({
    mutationFn: (payload: SendCampaignPayload) =>
      postJson<SendCampaignResult>("/api/internal/campaigns/send", payload),
  });
}
