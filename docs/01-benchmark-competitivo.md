# Benchmark competitivo — software de trazabilidad / inocuidad alimentaria

Fecha: 2026-06-04. Toda feature listada fue verificada en la fuente citada; lo no verificable se marca "a confirmar".

---

## 1. Benchmark principal: Trazal (https://trazal.com.ar)

Software argentino de producción, stock y trazabilidad para PyMEs alimenticias. **Meta de Ninja Food: igualar y superar este set.**

### Features de Trazal (verificadas)

| Módulo | Features | Fuente |
|---|---|---|
| Elaboración | Trazabilidad proveedor→cliente, materias primas/semielaborados/terminados, puntos críticos (HACCP), rendimientos en tiempo real, vencimientos automáticos, costos por lote | [Home](https://trazal.com.ar/) · [Cómo funciona](https://trazal.com.ar/como-funciona-trazal-software-trazabilidad-alimentaria/) |
| Inventario | Stock en tiempo real, alarmas por mail, control por ubicación, pedidos a bodega (planes altos) | [FAQ](https://trazal.com.ar/preguntas-frecuentes/) |
| Gestión | Roles/permisos, usuarios concurrentes, planillas personalizadas, registros cumple/no-cumple, KPIs automáticos, no conformidades con mensajería, nube de documentos, adjuntos, export Excel, branding propio | [Home](https://trazal.com.ar/) |
| Plataforma | 100% online, backups, soporte 365, expediciones asociadas a lote (recall) | [Home](https://trazal.com.ar/) |
| PRO | Lectura por código de barras (exclusiva del tier más caro) | [Planes](https://trazal.com.ar/planes-licencia/) |
| Normas | ISO 22000, FSSC 22000, BRC, IFS, HACCP, BPM | [Home](https://trazal.com.ar/) |

### Planes Trazal (precios públicos en USD, [fuente](https://trazal.com.ar/planes-licencia/))

| Plan | Promo | Regular | Usuarios concurrentes | Diferenciador |
|---|---|---|---|---|
| Emprendedor | USD 29/mes | USD 59.99 | 1 | Base completa |
| PYME ("popular") | USD 66/mes | USD 79.99 | 3 | + KPIs, costos, permisos |
| FULL | USD 49/mes | USD 99.99 | Ilimitados | + Pedidos a bodega |
| PRO | USD 49/mes | USD 129.99 | Ilimitados | + Código de barras |

Notas: promo FULL (49) más barata que PYME (66) — inconsistencia en su propia página. Sin trial gratuito (solo garantía 30 días post-implementación). Corporativo a consultar.

### Debilidades de Trazal (oportunidades verificadas)

1. **Sin API ni integraciones** (ERP, facturación, delivery, e-commerce): no aparece en ninguna página.
2. **Sin app móvil nativa ni offline.**
3. Modelo de **usuarios concurrentes** (1-3 en planes bajos) = fricción en planta.
4. Código de barras solo en tier más caro; **sin QR, GS1, EPCIS**.
5. Sin free trial autoservicio.
6. Reportería básica (gráficos de producción/stock, sin BI configurable).
7. Calidad superficial: NC básica, **sin CAPA, sin auditorías internas, sin gestión documental con versionado, sin homologación de proveedores**.
8. **Sin generación de rótulos/etiquetado** (Ley 27.642) pese a explicarla en su FAQ.
9. Sin multi-planta explícito.
10. Sin gestión de habilitaciones (RNE/RNPA/SENASA) integrada a la trazabilidad.

---

## 2. Otros competidores

### Argentina / región

| Competidor | URL | Qué hace | Pricing | Segmento |
|---|---|---|---|---|
| QmFood (qmKey) | https://www.qmkey.ar/qmfood-software-gestion-calidad-inocuidad-alimentaria/ | HACCP, proveedores, calibración, NC, trazabilidad, gestión documental. Normas ISO 22000/IFS/BRC/FSSC. Software + consultoría | Consultar | Empresas reguladas, multipaís LATAM |
| Gesy | https://www.gesy.tech/ | Habilitaciones SENASA/ANMAT/RNPA/INV/RUCA, alertas de vencimiento 30 días, checklists regulatorios, facturación. En beta | Gratis → ARS 45.000 → ARS 90.000/mes | Consultoras de bromatología AR |
| Inoqua | https://gestioninoqua.com/ | SGC completo: HACCP, PRP (BPM/POES), CAPA, auditorías, documentación, laboratorio, proveedores, reclamos | Consultar (3/6/9 cuentas) | PyMEs en certificación |
| BRIX Bromatología | https://www.brixbromatologia.com.ar/ | Consultora (no software): RNE/RNPA, rótulos, sin TACC, auditorías | — | Competidor indirecto |

### Global (referentes)

| Competidor | URL | Distintivo | Pricing |
|---|---|---|---|
| FoodDocs | https://www.fooddocs.com/pricing | HACCP con IA en 1h, checklists, trazabilidad por lote (plan Pro), recall | USD 99 / 199 / 299 por mes por sitio. Trial 14 días |
| Safefood 360° (LGC) | https://safefood360.com/ | +35 módulos enterprise: HACCP, proveedores, CAPA, IoT, BI, multi-idioma | Consultar |
| SafetyCulture (iAuditor) | https://safetyculture.com/pricing/ | La mejor app móvil + **offline verificado**, checklists con IA | Free → USD 24/seat/mes |
| FoodLogiQ (Trustwell) | https://www.trustwell.com/foodlogiq/ | Trazabilidad farm-to-fork, FSMA 204, recall supply-chain | Consultar |
| Wherefour | https://wherefour.com/ | ERP + trazabilidad de lotes, recall <2 min, API | Consultar |
| Icicle | https://icicletechnologies.com/ | HACCP/HARPC/TACCP/VACCP + ERP 12 módulos, usuarios ilimitados por planta | Consultar (por planta) |
| Provision Analytics | https://provision.io/ | Formularios rápidos, aprobado por certificadoras (DNV, ASI, QIMA) para auditoría remota | Consultar |

### Tabla comparativa (✅ verificada · ➖ no ofrece · ❓ a confirmar)

| Feature | Trazal | QmFood | Gesy | Inoqua | FoodDocs | Safefood360 | SafetyCulture | **Ninja Food (objetivo)** |
|---|---|---|---|---|---|---|---|---|
| Trazabilidad de lotes | ✅ | ✅ | ➖ | ✅ | ✅ | ✅ | ➖ | ✅ MVP |
| Trazabilidad pública QR | ➖ | ❓ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ MVP (heredada Jamonera) |
| BPM/POES digital | ✅ básico | ❓ | ➖ | ✅ | ✅ | ✅ | ❓ | ✅ MVP |
| HACCP / PCC | ✅ | ✅ | ➖ | ✅ | ✅ IA | ✅ | ❓ | ✅ v1 |
| Planillas configurables | ✅ limitadas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ MVP (Excel-first) |
| Habilitaciones RNE/RNPA/RUCA | ➖ | ➖ | ✅ | ➖ | ➖ | ➖ | ➖ | ✅ MVP (heredada) |
| Informes bromatológicos | ➖ | ❓ | ➖ | ✅ | ➖ | ✅ | ➖ | ✅ MVP (heredada) |
| Análisis de laboratorio | ➖ | ❓ | ➖ | ✅ | ➖ | ✅ | ➖ | ✅ MVP (heredada) |
| Rótulo / octógonos Ley 27.642 | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ v1 (heredada parcial) |
| API pública | ➖ | ❓ | ❓ | ❓ | ✅ Ent. | ❓ | ✅ | ✅ v1 |
| Integraciones delivery | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ➖ | ✅ v2 |
| Multi-planta | ➖ | ❓ | ➖ | ❓ | ✅ | ✅ | ✅ | ✅ v1 (plan Industria) |
| Multi-idioma / world-ready | ➖ | ✅ | ➖ | ❓ | ❓ | ✅ | ✅ | ✅ v2 |
| Offline | ➖ | ❓ | ❓ | ➖ | ❓ | ❓ | ✅ | 🔮 futuro |
| Pricing público | ✅ USD | ➖ | ✅ ARS | ➖ | ✅ USD | ➖ | ✅ USD | ✅ ARS+USD |
| Aval de consultora bromatológica | ➖ | parcial (consultoría propia) | ➖ | parcial | ➖ | ➖ | ➖ | ✅ **sello ABR** |

---

## 3. Análisis de pricing del mercado

- **Tramo PyME transparente**: USD 29–129/mes por sitio (Trazal), USD 99–299 (FoodDocs), USD 24/seat (SafetyCulture), ARS 45k–90k (Gesy nicho).
- **Mid/enterprise**: opaco, cotización por planta con onboarding incluido.
- **Posicionamiento Ninja Food**: pricing público en ARS (Mercado Pago) y USD (internacional), tramo USD 25–150/mes equivalente, trial 14 días self-service (ventaja directa: Trazal no tiene trial). Detalle en doc 05.

## 4. Gaps del mercado que Ninja Food ataca

1. **Trazabilidad + compliance AR integrados**: nadie une lotes + planillas POES/BPM + RNE/RNPA/RUCA + informes bromatológicos en un solo producto con precio público.
2. **Trazabilidad pública con QR al consumidor**: inexistente en el segmento; La Jamonera ya lo tiene en producción.
3. **Aval técnico de consultora** (ABR): ningún software local lo comunica como sello.
4. **Excel-first real**: import/export pesado + planillas imprimibles masivas, donde los globales son app-first y los locales limitados.
5. **API pública** en el segmento PyME local: Trazal no la tiene.
6. **Trial self-service + onboarding sin fricción**: Trazal exige implementación previa.
7. **Usuarios nombrados ilimitados por plan** (vs concurrentes de Trazal): ventaja operativa en planta.
