"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// Mutaciones de la consola de emails staff. Las lecturas (SMTP + overrides) son
// server components con admin client; las escrituras van por route handlers
// auditados (requireInternal + admin client). Patron identico a useUpdatePlan.

async function postAction<T>(
  path: string,
  body: unknown,
  method: "POST" | "DELETE" = "POST",
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "DELETE" ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((json as { error?: string })?.error ?? "internal_action_failed");
  }
  return json;
}

export interface SmtpPayload {
  hostname: string;
  port: number;
  username: string;
  password?: string;
  from_email: string;
  from_name: string;
  secure: boolean;
}

export function useSaveSmtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SmtpPayload) =>
      postAction<{ ok: boolean }>("/api/internal/email-smtp", payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["internal", "email-smtp"] }),
  });
}

export interface TemplatePayload {
  key: string;
  subject: string;
  html: string;
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TemplatePayload) =>
      postAction<{ ok: boolean }>("/api/internal/email-templates", payload),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["internal", "email-templates"] }),
  });
}

export function useResetTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      postAction<{ ok: boolean }>(
        `/api/internal/email-templates?key=${encodeURIComponent(key)}`,
        null,
        "DELETE",
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["internal", "email-templates"] }),
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (payload: { subject: string; html: string }) =>
      postAction<{ ok: boolean; to: string }>(
        "/api/internal/email-test",
        payload,
      ),
  });
}
