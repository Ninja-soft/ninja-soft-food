-- ============================================================
-- Ninja Food — 0022 recipe labels (rótulo legal print-ready)
-- ------------------------------------------------------------
-- Fase 7: el rótulo imprimible vectorial de la receta (tabla nutricional del
-- país + sellos frontales + ingredientes + alérgenos + datos legales) se genera
-- en el cliente (modules/recipes/labelPdf.ts) y se sube al bucket público
-- `recipes` (0003_storage) en <tenant_id>/labels/<recipeId>/v<N>.pdf. NO se crea
-- tabla nueva: el versionado vive como un array jsonb ADITIVO en la propia receta.
--
-- Dos columnas, ambas ADITIVAS y nullable/default-vacío → recetas viejas siguen
-- validando sin backfill:
--
--  1) recipes.allergens text[]  — alérgenos declarados del producto (gluten,
--     leche, huevo, soja, maní, frutos secos, pescado, mariscos, sésamo,
--     sulfitos, ...). Lista configurable (chips CAA/ANVISA/FDA en la UI); se
--     resaltan en negrita en la lista de ingredientes del rótulo. NO se
--     hardcodea al país (regla dura 11): el catálogo de chips vive en
--     modules/recipes/schemas.ts y aplica el set común de los marcos AR/MX/US/EU.
--
--  2) recipes.label_versions jsonb — historial APPEND-ONLY de rótulos generados:
--     [{version int, path text, created_at timestamptz, created_by uuid}]. Cada
--     "Guardar versión" sube el PDF y agrega un elemento (version = N+1). El PDF
--     en sí es el artefacto inmutable en Storage; este array es el índice.
--     NO es regulatoriamente inmutable como form_submissions/public_traces
--     (regla dura 5): es un documento de trabajo del cliente, no un registro
--     firmado/atribuible — por eso vive en la receta (dato vivo) y no en una
--     tabla append-only con triple defensa.
--
-- INMUTABILIDAD: el array es append-only por convención del cliente
-- (appendLabelVersion en modules/recipes/labels.ts nunca pisa versiones
-- anteriores), no por trigger: estos rótulos son artefactos de impresión
-- reproducibles, no la traza pública firmada.
--
-- RLS: recipes ya tiene sus políticas tenant-scoped (0001 core). Agregar columnas
-- no cambia el aislamiento. El bucket `recipes` ya restringe escritura a la
-- carpeta del propio tenant (0003_storage: tenant_storage_insert/update/delete).
-- NO aplicar en esta sesión: correr `supabase db push` y luego `pnpm db:types`.
-- ============================================================

alter table public.recipes
  add column if not exists allergens text[] null;

alter table public.recipes
  add column if not exists label_versions jsonb not null default '[]'::jsonb;

comment on column public.recipes.allergens is
  'Alérgenos declarados del producto (gluten, leche, huevo, soja, mani, frutos_secos, pescado, mariscos, sesamo, sulfitos, ...). Se resaltan en negrita en el rotulo print-ready. Catalogo de chips en modules/recipes/schemas.ts (set comun CAA/ANVISA/FDA). NO hardcodeado al pais (regla 11).';

comment on column public.recipes.label_versions is
  'Historial append-only de rotulos print-ready: [{version int, path text (bucket recipes <tenant>/labels/<recipeId>/v<N>.pdf), created_at timestamptz, created_by uuid}]. Indice de los PDF guardados en Storage (el PDF es el artefacto inmutable). Dato vivo de trabajo, NO registro firmado (regla 5).';
