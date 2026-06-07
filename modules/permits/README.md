# modules/permits

CRUD sobre `regulatory_permits` (migración 0013): tabla genérica de
habilitaciones por entidad que reemplaza los campos fijos RNE/RNPA/RUCA/UTA/URA
y habilita permisos de cualquier país.

- `schemas.ts` — `permitSchema` (zod) + `PermitEntityType`
  (tenant/establishment/supplier/vehicle/recipe).
- `api.ts` — `listPermits(entityType, entityId)`, `createPermit`, `updatePermit`,
  `deletePermit`, `uploadPermitAttachment` (bucket privado `attachments`).
- `hooks.ts` — `usePermits`, `useCreatePermit`, `useUpdatePermit`,
  `useDeletePermit` (TanStack Query, invalidación por entidad).

El catálogo de tipos disponibles por país/entidad vive en
`lib/globalization/permitTypes` (`getPermitTypes(country, entityType)`); la UI
genérica es `components/permits/PermitsSection.tsx`, que resuelve el país desde
`modules/tenant-profile`.
