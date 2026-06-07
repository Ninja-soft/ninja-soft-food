# modules/tenant-profile

Contexto operativo del tenant resuelto por país. Fuente de verdad única para que
toda la UI muestre el compliance correcto según `tenants.country` +
`tenant_operating_profiles`. Un tenant MX no debe ver octógonos/RNE/RNPA/ABR.

- `api.ts` — `getOperatingProfile()` (cliente), `buildOperatingProfile()` (puro,
  combina operating profile + catálogo `lib/globalization` como fallback).
- `hooks.ts` — `useOperatingProfile()` (TanStack Query) para componentes cliente.
- `server.ts` — `getOperatingProfileServer()` para Server Components / PDFs /
  route handlers.

`OperatingProfile`: `{ country, locale, currency, timezone, taxIdLabel,
complianceFrameworks, labelSystem, countryProfile }`.

El sistema de rotulado (`labelSystem`) sale de `getLabelSystemForCountry`; los
tipos de permiso por entidad, de `lib/globalization/permitTypes`.
