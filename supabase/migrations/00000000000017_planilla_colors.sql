-- ============================================================
-- Ninja Food — 0017 planilla colors
-- Colores configurables de las planillas PDF por tenant (regla dura 10:
-- nada hardcodeado al cliente). El header/banda usa el color primario y los
-- títulos de sección + headers de tabla + acentos usan el secundario. Ambos
-- son opcionales (null): cuando faltan, los generadores PDF caen al fallback
-- de marca Ninja Food (#08120A primario / #2E7D32 secundario) vía
-- resolvePalette() en lib/utils/pdf.ts.
--
-- Aditivo y no destructivo: no toca columnas existentes ni RLS (tenant_branding
-- ya está protegida por current_tenant_id() desde 0001/0006). Hex strings
-- '#RRGGBB'; la validación de formato vive en la app (hexToRgb tolera inválidos).
-- ============================================================

alter table public.tenant_branding
  add column if not exists pdf_primary_color text null,
  add column if not exists pdf_secondary_color text null;

comment on column public.tenant_branding.pdf_primary_color is
  'Color primario de las planillas PDF (hex #RRGGBB): banda del header. NULL = fallback Ninja Food (#08120A). Regla 10: configurable por tenant.';

comment on column public.tenant_branding.pdf_secondary_color is
  'Color secundario/acento de las planillas PDF (hex #RRGGBB): títulos de sección, headers de tabla y acentos. NULL = fallback Ninja Food (#2E7D32). Regla 10: configurable por tenant.';
