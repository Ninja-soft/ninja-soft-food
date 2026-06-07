-- ============================================================
-- Ninja Food — 0018 ingredient barcode
-- Código de barras opcional del ingrediente (EAN-13/EAN-8/Code-128/QR)
-- para escaneo por cámara en ingreso de stock y búsqueda del catálogo
-- (roadmap Fase 6 — barcode). Es un dato de conveniencia operativa, NO
-- regulatorio: identifica el producto comercial, no el lote.
--
-- Índice parcial (tenant_id, barcode) para resolver el lookup "buscar
-- ingrediente por código escaneado" en O(log n) por tenant. NO es unique:
-- en datos sucios distintos proveedores pueden compartir un mismo EAN, y
-- el alta por Excel/migración no debe romperse por un duplicado. La
-- unicidad por tenant queda para una migración futura, cuando los datos
-- estén saneados.
-- ============================================================

alter table public.ingredients
  add column if not exists barcode text null;

comment on column public.ingredients.barcode is
  'Código de barras comercial del ingrediente (EAN-13/EAN-8/Code-128/QR). Opcional, de conveniencia para escaneo en ingreso de stock y búsqueda; NO es trazabilidad de lote ni dato regulatorio. No unique a propósito: datos sucios pueden compartir EAN entre proveedores.';

-- Lookup por código escaneado, acotado al tenant. Parcial: solo filas vivas
-- con código cargado (la inmensa mayoría no tendrá barcode).
create index if not exists ingredients_tenant_barcode_idx
  on public.ingredients (tenant_id, barcode)
  where deleted_at is null and barcode is not null;
