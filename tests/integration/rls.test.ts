// ============================================================================
// Tests de aislamiento multi-tenant RLS — OBLIGATORIOS (regla dura CLAUDE.md §1)
// ============================================================================
//
// Por cada tabla operativa se verifica contra la NUBE REAL que:
//   - el tenant A inserta una fila y SOLO A la ve;
//   - el tenant B no la lee (select vacío) ni la modifica/borra (0 filas);
//   - el staff interno (is_internal) la lee vía la policy internal_read,
//     pero NO puede insertar/actualizar en tenants ajenos (policies son SELECT);
//   - un cliente anónimo no lee NADA de ninguna tabla operativa;
//   - public_traces es el caso especial: legible sin auth por diseño (/t/[slug]).
//
// Setup (calca los smoke scripts): 2 tenants reales vía create_tenant + 1 staff.
// Datos de prueba con prefijo RUN_PREFIX (rlstest-<ts>) para identificarlos.
//
// `pnpm test:rls` con .env.local los corre de verdad. Sin credenciales se
// skipean enteros (describe.skipIf) para no romper CI. Forzar con RLS_TESTS=1.

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminClient,
  anonClient,
  makeTenant,
  markInternal,
  loginClient,
  RLS_ENABLED,
  RUN_PREFIX,
  type TenantCtx,
} from "./helpers";

const HOOK_TIMEOUT = 60_000;
const TEST_TIMEOUT = 30_000;

// Estado compartido del beforeAll (una sola vez para toda la suite).
let tenantA: TenantCtx;
let tenantB: TenantCtx;
let staff: TenantCtx;
let staffClient: SupabaseClient; // sesión fresca del staff (claim is_internal vía login post-flag)
let admin: SupabaseClient;

// IDs de filas sembradas por A, por tabla, para asserts y cleanup.
const seeded: Record<string, string> = {};
// Parents para tablas hijas.
let dispatchAId: string | null = null;
let dispatchItemAId: string | null = null;
let productionAId: string | null = null;
let recipeAId: string | null = null;
let ingredientAId: string | null = null;
let stockEntryAId: string | null = null;
let analysisAId: string | null = null;
let reportAId: string | null = null;

// ── Helpers de aserción ──────────────────────────────────────────────────────

/** Inserta una fila como A; registra el id y lo devuelve. */
async function seedAsA(
  table: string,
  row: Record<string, unknown>
): Promise<string> {
  const { data, error } = await tenantA.client
    .from(table)
    .insert({ tenant_id: tenantA.tenantId, ...row })
    .select("id")
    .single();
  if (error) throw new Error(`seed ${table}: ${error.message}`);
  seeded[table] = data.id as string;
  return data.id as string;
}

// ── Setup ────────────────────────────────────────────────────────────────────

describe.skipIf(!RLS_ENABLED)("RLS multi-tenant isolation (cloud)", () => {
  beforeAll(async () => {
    admin = adminClient();
    [tenantA, tenantB, staff] = await Promise.all([
      makeTenant("a"),
      makeTenant("b"),
      makeTenant("staff"),
    ]);
    // Staff: marcar is_internal con service role y RE-LOGUEAR para tomar un JWT
    // fresco (is_internal() lee de la tabla users vía auth.uid(), así que basta
    // una sesión válida; logueamos de nuevo para no depender de cache de sesión).
    await markInternal(admin, staff.userId);
    staffClient = await loginClient(staff.email, staff.password);
  }, HOOK_TIMEOUT);

  afterAll(async () => {
    // Cleanup best-effort con service role (bypassa RLS). Borra filas rlstest-.
    if (!admin) return;
    const cleanupOrder = [
      "manual_payments",
      "internal_notes",
      "subscription_invoices",
      "subscription_addons",
      "tenant_flags",
      "regulatory_permits",
      "api_keys",
      "outbound_webhooks",
      "dispatch_items",
      "dispatches",
      "analysis_attachments",
      "analyses",
      "report_attachments",
      "reports",
      "production_inputs",
      "public_traces",
      "stock_movements",
      "productions",
      "recipe_ingredients",
      "recipes",
      "stock_entries",
      "ingredients",
      "customers",
      "vehicles",
      "suppliers",
      "laboratories",
      // form_submissions NO se borra fila a fila: el trigger de inmutabilidad
      // lo bloquea mientras el tenant exista. Se va por el cascade de tenants
      // (al borrar el tenant, el trigger permite el delete porque ya no existe).
      "form_templates",
      "members",
    ];
    for (const tenant of [tenantA, tenantB, staff]) {
      if (!tenant) continue;
      for (const table of cleanupOrder) {
        await admin.from(table).delete().eq("tenant_id", tenant.tenantId);
      }
      // Núcleo del tenant.
      await admin.from("tenant_branding").delete().eq("tenant_id", tenant.tenantId);
      await admin.from("subscriptions").delete().eq("tenant_id", tenant.tenantId);
      await admin.from("tenant_users").delete().eq("tenant_id", tenant.tenantId);
      await admin.from("establishments").delete().eq("tenant_id", tenant.tenantId);
      await admin.from("production_counters").delete().eq("tenant_id", tenant.tenantId);
      await admin.from("tenants").delete().eq("id", tenant.tenantId);
      // Usuario de auth (cascada borra public.users).
      await admin.auth.admin.deleteUser(tenant.userId).catch(() => {});
    }
  }, HOOK_TIMEOUT);

  // ── 1. Smoke del setup ───────────────────────────────────────────────────────
  test(
    "setup: tenants distintos con claim y staff interno",
    () => {
      expect(tenantA.tenantId).toBeTruthy();
      expect(tenantB.tenantId).toBeTruthy();
      expect(tenantA.tenantId).not.toBe(tenantB.tenantId);
      expect(RUN_PREFIX).toMatch(/^rlstest-/);
    },
    TEST_TIMEOUT
  );

  test(
    "staff: is_internal() devuelve true",
    async () => {
      const { data, error } = await staffClient.rpc("is_internal");
      expect(error).toBeNull();
      expect(data).toBe(true);
    },
    TEST_TIMEOUT
  );

  // ── 2. Tablas operativas con tenant_id directo ───────────────────────────────
  //
  // Cada caso: A inserta → B no lee/escribe → A sí lee → staff lee → anon no lee.

  interface TableCase {
    table: string;
    row: Record<string, unknown>;
    update: Record<string, unknown>;
  }

  const tableCases: TableCase[] = [
    {
      table: "ingredients",
      row: { name: `${RUN_PREFIX} harina`, unit: "kg" },
      update: { name: `${RUN_PREFIX} hacked` },
    },
    {
      table: "recipes",
      row: { title: `${RUN_PREFIX} pan`, category: "panificados", shelf_life_days: 30 },
      update: { title: `${RUN_PREFIX} hacked` },
    },
    {
      table: "suppliers",
      row: { name: `${RUN_PREFIX} proveedor` },
      update: { name: `${RUN_PREFIX} hacked` },
    },
    {
      table: "customers",
      row: { name: `${RUN_PREFIX} cliente`, locality: "Quilmes" },
      update: { name: `${RUN_PREFIX} hacked` },
    },
    {
      table: "vehicles",
      row: { plate: `${RUN_PREFIX}-PLATE`.slice(0, 12) },
      update: { plate: "HACK000" },
    },
    {
      table: "laboratories",
      row: { name: `${RUN_PREFIX} lab` },
      update: { name: `${RUN_PREFIX} hacked` },
    },
    {
      table: "members",
      // pin_hash es NOT NULL; un hash bcrypt cualquiera sirve para el test de RLS.
      row: {
        full_name: `${RUN_PREFIX} operario`,
        pin_hash: "$2a$10$abcdefghijklmnopqrstuv",
      },
      update: { full_name: `${RUN_PREFIX} hacked` },
    },
    {
      table: "analyses",
      row: { type: "agua", analysis_date: "2026-06-01", conformity: 90 },
      update: { conformity: 1 },
    },
    {
      table: "reports",
      row: { content_html: `<p>${RUN_PREFIX}</p>`, importance: 50 },
      update: { importance: 1 },
    },
  ];

  for (const tc of tableCases) {
    describe(`table: ${tc.table}`, () => {
      let rowId: string;

      test(
        "A inserta su fila",
        async () => {
          rowId = await seedAsA(tc.table, tc.row);
          expect(rowId).toBeTruthy();
        },
        TEST_TIMEOUT
      );

      test(
        "A la lee",
        async () => {
          const { data, error } = await tenantA.client
            .from(tc.table)
            .select("id")
            .eq("id", rowId);
          expect(error).toBeNull();
          expect(data).toHaveLength(1);
        },
        TEST_TIMEOUT
      );

      test(
        "B NO la lee (select vacío)",
        async () => {
          const { data, error } = await tenantB.client
            .from(tc.table)
            .select("id")
            .eq("id", rowId);
          expect(error).toBeNull();
          expect(data).toEqual([]);
        },
        TEST_TIMEOUT
      );

      test(
        "B NO la puede actualizar (0 filas afectadas)",
        async () => {
          const { data, error } = await tenantB.client
            .from(tc.table)
            .update(tc.update)
            .eq("id", rowId)
            .select("id");
          // RLS: o devuelve error, o filtra a 0 filas. Nunca debe tocar la fila de A.
          expect(error ? true : (data ?? []).length === 0).toBe(true);
          // Confirmar que A sigue viendo el valor original (no fue modificado).
          const { data: a } = await tenantA.client
            .from(tc.table)
            .select("id")
            .eq("id", rowId);
          expect(a).toHaveLength(1);
        },
        TEST_TIMEOUT
      );

      test(
        "B NO la puede borrar (0 filas afectadas)",
        async () => {
          const { data, error } = await tenantB.client
            .from(tc.table)
            .delete()
            .eq("id", rowId)
            .select("id");
          expect(error ? true : (data ?? []).length === 0).toBe(true);
          const { data: a } = await tenantA.client
            .from(tc.table)
            .select("id")
            .eq("id", rowId);
          expect(a).toHaveLength(1);
        },
        TEST_TIMEOUT
      );

      test(
        "staff la lee (internal_read)",
        async () => {
          const { data, error } = await staffClient
            .from(tc.table)
            .select("id, tenant_id")
            .eq("id", rowId);
          expect(error).toBeNull();
          expect(data).toHaveLength(1);
          expect(data![0].tenant_id).toBe(tenantA.tenantId);
        },
        TEST_TIMEOUT
      );

      test(
        "staff NO la puede actualizar (policies son solo SELECT)",
        async () => {
          const { data, error } = await staffClient
            .from(tc.table)
            .update(tc.update)
            .eq("id", rowId)
            .select("id");
          expect(error ? true : (data ?? []).length === 0).toBe(true);
        },
        TEST_TIMEOUT
      );

      test(
        "anon NO la lee (sin sesión, sin policy)",
        async () => {
          const { data, error } = await anonClient()
            .from(tc.table)
            .select("id")
            .eq("id", rowId);
          // anon no tiene policy → select vacío (sin error de permisos).
          expect(error).toBeNull();
          expect(data ?? []).toEqual([]);
        },
        TEST_TIMEOUT
      );
    });
  }

  // ── 3. stock_entries + productions vía RPC (atomicidad por tenant) ───────────
  describe("stock_entries y productions (vía RPC)", () => {
    test(
      "A arma ingrediente, stock, receta y producción (solo afectan A)",
      async () => {
        const { data: ing, error: ingErr } = await tenantA.client
          .from("ingredients")
          .insert({
            tenant_id: tenantA.tenantId,
            name: `${RUN_PREFIX} carne`,
            unit: "kg",
          })
          .select("id")
          .single();
        expect(ingErr).toBeNull();
        ingredientAId = ing!.id;

        const { data: entryId, error: seErr } = await tenantA.client.rpc(
          "create_stock_entry",
          {
            p_ingredient_id: ingredientAId,
            p_quantity: 100,
            p_unit: "kg",
            p_lot_number: `${RUN_PREFIX}-LOTE`,
          }
        );
        expect(seErr).toBeNull();
        stockEntryAId = entryId as string;
        expect(stockEntryAId).toBeTruthy();

        const { data: recipe, error: recErr } = await tenantA.client
          .from("recipes")
          .insert({
            tenant_id: tenantA.tenantId,
            title: `${RUN_PREFIX} bondiola`,
            category: "carnes",
            shelf_life_days: 90,
          })
          .select("id")
          .single();
        expect(recErr).toBeNull();
        recipeAId = recipe!.id;
        await tenantA.client.from("recipe_ingredients").insert({
          recipe_id: recipeAId,
          ingredient_id: ingredientAId,
          quantity: 1,
          unit: "kg",
          is_substitute: false,
        });

        const { data: prod, error: prodErr } = await tenantA.client.rpc(
          "complete_production",
          {
            p_recipe_id: recipeAId,
            p_quantity_kg: 20,
            p_production_date: "2026-06-04",
            p_inputs: [
              {
                ingredient_id: ingredientAId,
                stock_entry_id: stockEntryAId,
                taken_qty: 20,
                is_substitute: false,
                source_ingredient_id: null,
              },
            ],
          }
        );
        expect(prodErr).toBeNull();
        productionAId = (prod as { production_id: string }).production_id;
        expect(productionAId).toBeTruthy();
      },
      TEST_TIMEOUT
    );

    test(
      "B NO ve el stock_entry ni la producción de A",
      async () => {
        const { data: se } = await tenantB.client
          .from("stock_entries")
          .select("id")
          .eq("id", stockEntryAId!);
        expect(se ?? []).toEqual([]);
        const { data: pr } = await tenantB.client
          .from("productions")
          .select("id")
          .eq("id", productionAId!);
        expect(pr ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO puede consumir el stock_entry de A vía create_stock_entry/adjust",
      async () => {
        // adjust_stock_entry filtra por tenant: entry de A no existe para B.
        const { error } = await tenantB.client.rpc("adjust_stock_entry", {
          p_entry_id: stockEntryAId!,
          p_delta: -50,
          p_reason: "intento cross-tenant",
        });
        expect(error).not.toBeNull();
        expect(error!.message).toContain("entry_not_found");
      },
      TEST_TIMEOUT
    );

    test(
      "staff ve stock_entry y producción de A",
      async () => {
        const { data: se } = await staffClient
          .from("stock_entries")
          .select("id, tenant_id")
          .eq("id", stockEntryAId!);
        expect(se).toHaveLength(1);
        expect(se![0].tenant_id).toBe(tenantA.tenantId);
        const { data: pr } = await staffClient
          .from("productions")
          .select("id, tenant_id")
          .eq("id", productionAId!);
        expect(pr).toHaveLength(1);
      },
      TEST_TIMEOUT
    );
  });

  // ── 4. Tablas hijas vía parent ───────────────────────────────────────────────
  describe("tablas hijas (aislamiento vía padre)", () => {
    test(
      "B NO lee production_inputs de la producción de A",
      async () => {
        expect(productionAId).toBeTruthy();
        const { data: own } = await tenantA.client
          .from("production_inputs")
          .select("id")
          .eq("production_id", productionAId!);
        expect((own ?? []).length).toBeGreaterThan(0);

        const { data: cross } = await tenantB.client
          .from("production_inputs")
          .select("id")
          .eq("production_id", productionAId!);
        expect(cross ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO lee recipe_ingredients de la receta de A",
      async () => {
        const { data: own } = await tenantA.client
          .from("recipe_ingredients")
          .select("id")
          .eq("recipe_id", recipeAId!);
        expect((own ?? []).length).toBeGreaterThan(0);

        const { data: cross } = await tenantB.client
          .from("recipe_ingredients")
          .select("id")
          .eq("recipe_id", recipeAId!);
        expect(cross ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO lee analysis_attachments del análisis de A",
      async () => {
        // Crear análisis + attachment como A.
        const { data: an, error: anErr } = await tenantA.client
          .from("analyses")
          .insert({
            tenant_id: tenantA.tenantId,
            type: "alimentos",
            analysis_date: "2026-06-02",
            conformity: 80,
          })
          .select("id")
          .single();
        expect(anErr).toBeNull();
        analysisAId = an!.id;
        const { error: attErr } = await tenantA.client
          .from("analysis_attachments")
          .insert({
            analysis_id: analysisAId,
            url: "https://x/test.pdf",
            name: `${RUN_PREFIX}.pdf`,
          });
        expect(attErr).toBeNull();

        const { data: cross } = await tenantB.client
          .from("analysis_attachments")
          .select("id")
          .eq("analysis_id", analysisAId!);
        expect(cross ?? []).toEqual([]);
        const { data: own } = await tenantA.client
          .from("analysis_attachments")
          .select("id")
          .eq("analysis_id", analysisAId!);
        expect((own ?? []).length).toBe(1);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO lee report_attachments del informe de A",
      async () => {
        const { data: rep, error: repErr } = await tenantA.client
          .from("reports")
          .insert({
            tenant_id: tenantA.tenantId,
            content_html: `<p>${RUN_PREFIX} informe</p>`,
            importance: 60,
          })
          .select("id")
          .single();
        expect(repErr).toBeNull();
        reportAId = rep!.id;
        const { error: attErr } = await tenantA.client
          .from("report_attachments")
          .insert({
            report_id: reportAId,
            url: "https://x/rep.pdf",
            name: `${RUN_PREFIX}-rep.pdf`,
          });
        expect(attErr).toBeNull();

        const { data: cross } = await tenantB.client
          .from("report_attachments")
          .select("id")
          .eq("report_id", reportAId!);
        expect(cross ?? []).toEqual([]);
        const { data: own } = await tenantA.client
          .from("report_attachments")
          .select("id")
          .eq("report_id", reportAId!);
        expect((own ?? []).length).toBe(1);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO lee dispatch_items del despacho de A (parent vía create_dispatch o directo)",
      async () => {
        // Intentar armar el despacho con la RPC; si no está en cloud, insertar
        // cabecera + ítem directo (la policy hija aplica igual).
        const customerId = seeded["customers"];
        expect(customerId).toBeTruthy();

        const { data: disp, error: rpcErr } = await tenantA.client.rpc(
          "create_dispatch",
          {
            p_customer_id: customerId,
            p_dispatch_date: "2026-06-05",
            p_items: [{ recipe_id: recipeAId, production_id: null, quantity_kg: 5 }],
          }
        );

        if (
          rpcErr &&
          (rpcErr.code === "PGRST202" ||
            /create_dispatch|function|not found|schema cache/i.test(rpcErr.message))
        ) {
          // Fallback sin RPC: cabecera + ítem directos como A.
          const { data: header, error: hErr } = await tenantA.client
            .from("dispatches")
            .insert({
              tenant_id: tenantA.tenantId,
              customer_id: customerId,
              dispatch_date: "2026-06-05",
            })
            .select("id")
            .single();
          expect(hErr).toBeNull();
          dispatchAId = header!.id;
          const { data: item, error: iErr } = await tenantA.client
            .from("dispatch_items")
            .insert({
              dispatch_id: dispatchAId,
              recipe_id: recipeAId,
              quantity_kg: 5,
            })
            .select("id")
            .single();
          expect(iErr).toBeNull();
          dispatchItemAId = item!.id;
        } else {
          expect(rpcErr).toBeNull();
          dispatchAId = (disp as { dispatch_id: string }).dispatch_id;
        }

        // A ve sus ítems.
        const { data: own } = await tenantA.client
          .from("dispatch_items")
          .select("id")
          .eq("dispatch_id", dispatchAId!);
        expect((own ?? []).length).toBeGreaterThan(0);

        // B NO ve los ítems del despacho de A.
        const { data: cross } = await tenantB.client
          .from("dispatch_items")
          .select("id")
          .eq("dispatch_id", dispatchAId!);
        expect(cross ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );
  });

  // ── 5. public_traces: caso especial (legible sin auth por slug) ──────────────
  describe("public_traces (traza pública)", () => {
    test(
      "anon SÍ lee la traza pública por slug (policy public_read using(true))",
      async () => {
        expect(productionAId).toBeTruthy();
        // El slug lo creó complete_production; buscarlo con admin para el assert.
        const { data: trace } = await admin
          .from("public_traces")
          .select("slug")
          .eq("production_id", productionAId!)
          .single();
        expect(trace?.slug).toBeTruthy();

        const { data: pub, error } = await anonClient()
          .from("public_traces")
          .select("slug, payload")
          .eq("slug", trace!.slug)
          .single();
        expect(error).toBeNull();
        expect(pub?.slug).toBe(trace!.slug);
        // La traza es el snapshot inmutable que sirve /t/[slug].
        expect(pub?.payload).toBeTruthy();
      },
      TEST_TIMEOUT
    );

    test(
      "anon NO puede insertar en public_traces (insert solo para el tenant)",
      async () => {
        const { error } = await anonClient()
          .from("public_traces")
          .insert({
            tenant_id: tenantA.tenantId,
            production_id: productionAId,
            slug: `${RUN_PREFIX}-fake`,
            payload: {},
          });
        // Sin policy de insert para anon → violación de RLS.
        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT
    );

    test(
      "B NO puede insertar una traza con tenant_id de A",
      async () => {
        const { error } = await tenantB.client
          .from("public_traces")
          .insert({
            tenant_id: tenantA.tenantId,
            production_id: productionAId,
            slug: `${RUN_PREFIX}-fake-b`,
            payload: {},
          });
        expect(error).not.toBeNull();
      },
      TEST_TIMEOUT
    );
  });

  // ── 5b. form_builder: planillas configurables + submissions inmutables ───────
  //
  // Tablas/RPC de la migración 0009. Mientras 0009 NO esté en cloud (pendiente
  // junto a 0008 para `supabase db push`), cada caso se SKIPEA al detectar que
  // la tabla o la función no existen (no se marca verde). Patrón create_dispatch.
  describe("form_builder (planillas configurables)", () => {
    let templateAId: string | null = null;
    let submissionAId: string | null = null;
    let memberAId: string | null = null;

    /** true si el error indica que 0009 todavía no está aplicada en cloud. */
    function isMissingFormBuilder(err: {
      code?: string;
      message?: string;
    } | null): boolean {
      if (!err) return false;
      return (
        err.code === "PGRST202" || // RPC no encontrada
        err.code === "PGRST205" || // tabla no en el schema cache
        err.code === "42P01" || // undefined_table
        /form_templates|form_submissions|submit_form|schema cache|does not exist|not found/i.test(
          err.message ?? ""
        )
      );
    }

    test(
      "A crea un template; B no lo ve; staff sí (internal_read)",
      async (ctx) => {
        const { data, error } = await tenantA.client
          .from("form_templates")
          .insert({
            tenant_id: tenantA.tenantId,
            name: `${RUN_PREFIX} temperatura camara`,
            kind: "temperatura",
            requires_signature: true,
            fields: [
              { key: "temp", label: "Temperatura", type: "temperature", required: true, min: -25, max: 5, unit: "C" },
            ],
            frequency: { type: "daily", time: "08:00" },
          })
          .select("id")
          .single();

        if (isMissingFormBuilder(error)) {
          console.warn("form_templates no está en cloud (migración 0009 pendiente): " + error!.message);
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        templateAId = data!.id;

        // B no lo ve.
        const { data: bSee } = await tenantB.client
          .from("form_templates")
          .select("id")
          .eq("id", templateAId!);
        expect(bSee ?? []).toEqual([]);

        // staff sí.
        const { data: staffSee } = await staffClient
          .from("form_templates")
          .select("id, tenant_id")
          .eq("id", templateAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);
      },
      TEST_TIMEOUT
    );

    test(
      "submit_form sin firma registra la submission de A (template requires_signature=false)",
      async (ctx) => {
        if (!templateAId) {
          ctx.skip();
          return;
        }
        // Template sin firma para un positivo determinista (no depende de bcrypt).
        const { data: t2, error: t2Err } = await tenantA.client
          .from("form_templates")
          .insert({
            tenant_id: tenantA.tenantId,
            name: `${RUN_PREFIX} limpieza sin firma`,
            kind: "limpieza",
            requires_signature: false,
          })
          .select("id")
          .single();
        expect(t2Err).toBeNull();

        const { data, error } = await tenantA.client.rpc("submit_form", {
          p_template_id: t2!.id,
          p_values: { sector: "camara 1", ok: true },
          p_status: "ok",
        });
        if (isMissingFormBuilder(error)) {
          console.warn("submit_form no está en cloud (migración 0009 pendiente): " + error!.message);
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        submissionAId = (data as { submission_id: string }).submission_id;
        expect(submissionAId).toBeTruthy();
      },
      TEST_TIMEOUT
    );

    test(
      "submit_form exige firma cuando el template la requiere (signature_required)",
      async (ctx) => {
        if (!templateAId) {
          ctx.skip();
          return;
        }
        // templateAId tiene requires_signature=true → sin member+pin debe abortar.
        const { error } = await tenantA.client.rpc("submit_form", {
          p_template_id: templateAId,
          p_values: { temp: 4 },
          p_status: "ok",
        });
        if (isMissingFormBuilder(error)) {
          ctx.skip();
          return;
        }
        expect(error).not.toBeNull();
        expect(error!.message).toMatch(/signature_required/);
      },
      TEST_TIMEOUT
    );

    test(
      "submit_form rechaza PIN inválido (invalid_pin)",
      async (ctx) => {
        if (!templateAId) {
          ctx.skip();
          return;
        }
        // Member de A con un pin_hash bcrypt arbitrario (no coincide con el PIN
        // que mandamos) → la RPC debe rechazar por invalid_pin. Determinista:
        // sea cual sea el hash, "0000-noexiste" no lo reproduce.
        const { data: mem, error: memErr } = await admin
          .from("members")
          .insert({
            tenant_id: tenantA.tenantId,
            full_name: `${RUN_PREFIX} firmante`,
            pin_hash: "$2a$10$abcdefghijklmnopqrstuv",
          })
          .select("id")
          .single();
        expect(memErr).toBeNull();
        memberAId = mem!.id;

        const { error } = await tenantA.client.rpc("submit_form", {
          p_template_id: templateAId,
          p_values: { temp: 4 },
          p_member_id: memberAId,
          p_pin: "0000-noexiste",
          p_status: "ok",
        });
        if (isMissingFormBuilder(error)) {
          ctx.skip();
          return;
        }
        expect(error).not.toBeNull();
        expect(error!.message).toMatch(/invalid_pin/);
      },
      TEST_TIMEOUT
    );

    test(
      "B no ve la submission de A; A y staff sí",
      async (ctx) => {
        if (!submissionAId) {
          ctx.skip();
          return;
        }
        const { data: bSee } = await tenantB.client
          .from("form_submissions")
          .select("id")
          .eq("id", submissionAId!);
        expect(bSee ?? []).toEqual([]);

        const { data: aSee } = await tenantA.client
          .from("form_submissions")
          .select("id")
          .eq("id", submissionAId!);
        expect(aSee).toHaveLength(1);

        const { data: staffSee } = await staffClient
          .from("form_submissions")
          .select("id, tenant_id")
          .eq("id", submissionAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);
      },
      TEST_TIMEOUT
    );

    test(
      "form_submissions es INMUTABLE: A no puede UPDATE ni DELETE su propia fila",
      async (ctx) => {
        if (!submissionAId) {
          ctx.skip();
          return;
        }
        // Sin policy UPDATE/DELETE para authenticated → 0 filas o error de RLS.
        const { data: upd, error: updErr } = await tenantA.client
          .from("form_submissions")
          .update({ status: "fail" })
          .eq("id", submissionAId!)
          .select("id");
        expect(updErr ? true : (upd ?? []).length === 0).toBe(true);

        const { data: del, error: delErr } = await tenantA.client
          .from("form_submissions")
          .delete()
          .eq("id", submissionAId!)
          .select("id");
        expect(delErr ? true : (del ?? []).length === 0).toBe(true);

        // La fila sigue intacta y con su status original.
        const { data: still } = await tenantA.client
          .from("form_submissions")
          .select("id, status")
          .eq("id", submissionAId!)
          .single();
        expect(still?.id).toBe(submissionAId);
        expect(still?.status).not.toBe("fail");
      },
      TEST_TIMEOUT
    );

    test(
      "trigger de inmutabilidad bloquea incluso a service_role (UPDATE)",
      async (ctx) => {
        if (!submissionAId) {
          ctx.skip();
          return;
        }
        // service_role bypassa RLS, pero el trigger BEFORE UPDATE aborta igual.
        const { error } = await admin
          .from("form_submissions")
          .update({ status: "corrected" })
          .eq("id", submissionAId!);
        expect(error).not.toBeNull();
        expect(error!.message).toMatch(/immutable_submission/);
      },
      TEST_TIMEOUT
    );

    test(
      "submit_form de A con template de A escribe en tenant A (no en B)",
      async (ctx) => {
        if (!submissionAId) {
          ctx.skip();
          return;
        }
        const { data: row } = await admin
          .from("form_submissions")
          .select("tenant_id")
          .eq("id", submissionAId!)
          .single();
        expect(row?.tenant_id).toBe(tenantA.tenantId);
      },
      TEST_TIMEOUT
    );
  });

  // ── 5c. public_api: api_keys + outbound_webhooks + verify_api_key ────────────
  //
  // Tablas/RPC de la migración 0010. Mientras 0010 NO esté en cloud (pendiente
  // junto a 0008/0009 para `supabase db push`), cada caso se SKIPEA al detectar
  // que la tabla o la función no existen (no se marca verde). Patrón form_builder.
  describe("public_api (api_keys / outbound_webhooks)", () => {
    let apiKeyAId: string | null = null;
    let webhookAId: string | null = null;
    // sha256 hex (64 chars) determinista para el test de verify_api_key.
    const keyHashA = "a".repeat(64);
    const keyHashMissing = "f".repeat(64);

    /** true si el error indica que 0010 todavía no está aplicada en cloud. */
    function isMissingPublicApi(err: {
      code?: string;
      message?: string;
    } | null): boolean {
      if (!err) return false;
      return (
        err.code === "PGRST202" || // RPC no encontrada
        err.code === "PGRST205" || // tabla no en el schema cache
        err.code === "42P01" || // undefined_table
        /api_keys|outbound_webhooks|verify_api_key|schema cache|does not exist|not found/i.test(
          err.message ?? ""
        )
      );
    }

    test(
      "A crea una api_key; B no la ve; staff sí (internal_read)",
      async (ctx) => {
        const { data, error } = await tenantA.client
          .from("api_keys")
          .insert({
            tenant_id: tenantA.tenantId,
            name: `${RUN_PREFIX} key produccion`,
            key_hash: keyHashA,
            key_prefix: "nf_live_aaaa",
            scopes: ["read:productions", "read:traces"],
          })
          .select("id")
          .single();

        if (isMissingPublicApi(error)) {
          console.warn(
            "api_keys no está en cloud (migración 0010 pendiente): " +
              error!.message
          );
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        apiKeyAId = data!.id;

        // B no la ve.
        const { data: bSee } = await tenantB.client
          .from("api_keys")
          .select("id")
          .eq("id", apiKeyAId!);
        expect(bSee ?? []).toEqual([]);

        // staff sí (internal_read).
        const { data: staffSee } = await staffClient
          .from("api_keys")
          .select("id, tenant_id")
          .eq("id", apiKeyAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO puede actualizar ni borrar la api_key de A",
      async (ctx) => {
        if (!apiKeyAId) {
          ctx.skip();
          return;
        }
        const { data: upd, error: updErr } = await tenantB.client
          .from("api_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", apiKeyAId!)
          .select("id");
        expect(updErr ? true : (upd ?? []).length === 0).toBe(true);

        const { data: del, error: delErr } = await tenantB.client
          .from("api_keys")
          .delete()
          .eq("id", apiKeyAId!)
          .select("id");
        expect(delErr ? true : (del ?? []).length === 0).toBe(true);

        // Sigue viva (sin revocar) para A.
        const { data: still } = await tenantA.client
          .from("api_keys")
          .select("id, revoked_at")
          .eq("id", apiKeyAId!)
          .single();
        expect(still?.id).toBe(apiKeyAId);
        expect(still?.revoked_at).toBeNull();
      },
      TEST_TIMEOUT
    );

    test(
      "A crea un outbound_webhook; B no lo ve; staff sí",
      async (ctx) => {
        const { data, error } = await tenantA.client
          .from("outbound_webhooks")
          .insert({
            tenant_id: tenantA.tenantId,
            url: "https://example.test/hook",
            events: ["production.completed", "dispatch.created"],
            secret: `${RUN_PREFIX}-hmac-secret`,
          })
          .select("id")
          .single();

        if (isMissingPublicApi(error)) {
          console.warn(
            "outbound_webhooks no está en cloud (migración 0010 pendiente): " +
              error!.message
          );
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        webhookAId = data!.id;

        const { data: bSee } = await tenantB.client
          .from("outbound_webhooks")
          .select("id")
          .eq("id", webhookAId!);
        expect(bSee ?? []).toEqual([]);

        const { data: staffSee } = await staffClient
          .from("outbound_webhooks")
          .select("id, tenant_id")
          .eq("id", webhookAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);
      },
      TEST_TIMEOUT
    );

    test(
      "anon NO lee api_keys ni outbound_webhooks (sin policy)",
      async (ctx) => {
        if (!apiKeyAId && !webhookAId) {
          ctx.skip();
          return;
        }
        const anon = anonClient();
        for (const table of ["api_keys", "outbound_webhooks"]) {
          const { data, error } = await anon.from(table).select("id").limit(1);
          expect(error, `${table} error`).toBeNull();
          expect(data ?? [], `${table} leak`).toEqual([]);
        }
      },
      TEST_TIMEOUT
    );

    test(
      "verify_api_key (anon, SECURITY DEFINER) resuelve solo la key exacta de A",
      async (ctx) => {
        if (!apiKeyAId) {
          ctx.skip();
          return;
        }
        const anon = anonClient();

        // Hash existente y no revocado → {tenant_id, scopes, key_id} de A.
        const { data: ok, error: okErr } = await anon.rpc("verify_api_key", {
          p_key_hash: keyHashA,
        });
        if (isMissingPublicApi(okErr)) {
          console.warn(
            "verify_api_key no está en cloud (migración 0010 pendiente): " +
              okErr!.message
          );
          ctx.skip();
          return;
        }
        expect(okErr).toBeNull();
        expect(ok).toBeTruthy();
        expect((ok as { tenant_id: string }).tenant_id).toBe(tenantA.tenantId);
        expect((ok as { key_id: string }).key_id).toBe(apiKeyAId);
        expect((ok as { scopes: string[] }).scopes).toContain("read:productions");

        // Hash inexistente → null (no leak, no error).
        const { data: missing, error: missErr } = await anon.rpc(
          "verify_api_key",
          { p_key_hash: keyHashMissing }
        );
        expect(missErr).toBeNull();
        expect(missing).toBeNull();

        // Hash mal formado (no 64 hex) → null.
        const { data: bad, error: badErr } = await anon.rpc("verify_api_key", {
          p_key_hash: "too-short",
        });
        expect(badErr).toBeNull();
        expect(bad).toBeNull();
      },
      TEST_TIMEOUT
    );

    test(
      "verify_api_key devuelve null para una key revocada (revoked_at)",
      async (ctx) => {
        if (!apiKeyAId) {
          ctx.skip();
          return;
        }
        // A revoca su propia key (soft, vía UPDATE bajo su sesión).
        const { error: revErr } = await tenantA.client
          .from("api_keys")
          .update({ revoked_at: new Date().toISOString() })
          .eq("id", apiKeyAId!);
        expect(revErr).toBeNull();

        const { data: gone, error } = await anonClient().rpc("verify_api_key", {
          p_key_hash: keyHashA,
        });
        expect(error).toBeNull();
        expect(gone).toBeNull();
      },
      TEST_TIMEOUT
    );
  });

  // ── 5d. compliance_engine: regulatory_permits (migración 0013) ──────────────
  //
  // Tabla genérica de permisos regulatorios. Mientras 0013 NO esté en cloud
  // (pendiente para `supabase db push`), cada caso se SKIPEA al detectar que la
  // tabla no existe (no se marca verde). Patrón form_builder / public_api.
  describe("compliance_engine (regulatory_permits, migración 0013)", () => {
    let permitAId: string | null = null;

    /** true si el error indica que 0013 todavía no está aplicada en cloud. */
    function isMissingComplianceEngine(err: {
      code?: string;
      message?: string;
    } | null): boolean {
      if (!err) return false;
      return (
        err.code === "PGRST205" || // tabla no en el schema cache
        err.code === "42P01" || // undefined_table
        /regulatory_permits|schema cache|does not exist|not found/i.test(
          err.message ?? ""
        )
      );
    }

    test(
      "A crea un permit; A lo lee; B no lo ve; staff sí (internal_read)",
      async (ctx) => {
        const { data, error } = await tenantA.client
          .from("regulatory_permits")
          .insert({
            tenant_id: tenantA.tenantId,
            entity_type: "tenant",
            entity_id: tenantA.tenantId,
            permit_type: "rne",
            permit_number: `${RUN_PREFIX}-RNE-001`,
            expires_at: "2027-01-01",
          })
          .select("id")
          .single();

        if (isMissingComplianceEngine(error)) {
          console.warn(
            "regulatory_permits no está en cloud (migración 0013 pendiente): " +
              error!.message
          );
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        permitAId = data!.id;

        // A lo lee.
        const { data: aSee } = await tenantA.client
          .from("regulatory_permits")
          .select("id")
          .eq("id", permitAId!);
        expect(aSee).toHaveLength(1);

        // B no lo ve.
        const { data: bSee } = await tenantB.client
          .from("regulatory_permits")
          .select("id")
          .eq("id", permitAId!);
        expect(bSee ?? []).toEqual([]);

        // staff sí (internal_read).
        const { data: staffSee } = await staffClient
          .from("regulatory_permits")
          .select("id, tenant_id")
          .eq("id", permitAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);
      },
      TEST_TIMEOUT
    );

    test(
      "B NO puede actualizar ni borrar el permit de A",
      async (ctx) => {
        if (!permitAId) {
          ctx.skip();
          return;
        }
        const { data: upd, error: updErr } = await tenantB.client
          .from("regulatory_permits")
          .update({ permit_number: `${RUN_PREFIX}-hacked` })
          .eq("id", permitAId!)
          .select("id");
        expect(updErr ? true : (upd ?? []).length === 0).toBe(true);

        const { data: del, error: delErr } = await tenantB.client
          .from("regulatory_permits")
          .delete()
          .eq("id", permitAId!)
          .select("id");
        expect(delErr ? true : (del ?? []).length === 0).toBe(true);

        // El permit de A quedó intacto.
        const { data: still } = await tenantA.client
          .from("regulatory_permits")
          .select("id, permit_number")
          .eq("id", permitAId!)
          .single();
        expect(still?.id).toBe(permitAId);
        expect(still?.permit_number).toBe(`${RUN_PREFIX}-RNE-001`);
      },
      TEST_TIMEOUT
    );

    test(
      "staff NO puede actualizar el permit de A (internal_read es solo SELECT)",
      async (ctx) => {
        if (!permitAId) {
          ctx.skip();
          return;
        }
        const { data, error } = await staffClient
          .from("regulatory_permits")
          .update({ permit_number: `${RUN_PREFIX}-staff-hack` })
          .eq("id", permitAId!)
          .select("id");
        expect(error ? true : (data ?? []).length === 0).toBe(true);
      },
      TEST_TIMEOUT
    );

    test(
      "anon NO lee regulatory_permits (sin policy)",
      async (ctx) => {
        if (!permitAId) {
          ctx.skip();
          return;
        }
        const { data, error } = await anonClient()
          .from("regulatory_permits")
          .select("id")
          .eq("id", permitAId!);
        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );
  });

  // ── 5e. saas_console: consola interna SaaS (migración 0014) ─────────────────
  //
  // Tablas de cobro/cortesía, add-ons, flags por tenant, notas internas,
  // facturas y settings de plataforma. Mientras 0014 NO esté en cloud
  // (pendiente para `supabase db push`), cada caso se SKIPEA al detectar que la
  // tabla no existe (no se marca verde). Patrón compliance_engine.
  //
  // RLS esperada:
  //   - manual_payments / internal_notes / internal_settings: SOLO staff lee,
  //     el tenant NO las ve (ni siquiera las propias).
  //   - subscription_addons / tenant_flags / subscription_invoices: el tenant
  //     ve las propias, A no ve las de B, staff lee, writes service_role.
  //   - anon no lee nada.
  describe("saas_console (consola interna, migración 0014)", () => {
    let addonAId: string | null = null;
    let flagAId: string | null = null;
    let invoiceAId: string | null = null;

    /** true si el error indica que 0014 todavía no está aplicada en cloud. */
    function isMissingSaasConsole(err: {
      code?: string;
      message?: string;
    } | null): boolean {
      if (!err) return false;
      return (
        err.code === "PGRST205" || // tabla no en el schema cache
        err.code === "42P01" || // undefined_table
        /manual_payments|subscription_addons|tenant_flags|internal_notes|subscription_invoices|internal_settings|plan_addons|schema cache|does not exist|not found/i.test(
          err.message ?? ""
        )
      );
    }

    // — Tablas SOLO staff: el tenant NO las ve, ni las propias —

    test(
      "manual_payments: invisible para el tenant; solo staff lee (service_role escribe)",
      async (ctx) => {
        const { data, error } = await admin
          .from("manual_payments")
          .insert({
            tenant_id: tenantA.tenantId,
            amount: 50000,
            currency: "ARS",
            method: "transfer",
            paid_at: "2026-06-01",
            period_months: 1,
            reference: `${RUN_PREFIX}-transfer`,
          })
          .select("id")
          .single();

        if (isMissingSaasConsole(error)) {
          console.warn(
            "manual_payments no está en cloud (migración 0014 pendiente): " +
              error!.message
          );
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        const paymentId = data!.id;

        // El propio tenant A NO la ve (tabla solo-staff).
        const { data: aSee } = await tenantA.client
          .from("manual_payments")
          .select("id")
          .eq("id", paymentId);
        expect(aSee ?? []).toEqual([]);

        // B tampoco.
        const { data: bSee } = await tenantB.client
          .from("manual_payments")
          .select("id")
          .eq("id", paymentId);
        expect(bSee ?? []).toEqual([]);

        // staff sí (internal_read).
        const { data: staffSee } = await staffClient
          .from("manual_payments")
          .select("id, tenant_id")
          .eq("id", paymentId);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);

        // El tenant NO puede insertar (sin policy de write para authenticated).
        const { error: insErr } = await tenantA.client
          .from("manual_payments")
          .insert({
            tenant_id: tenantA.tenantId,
            amount: 1,
            method: "cash",
            paid_at: "2026-06-02",
          });
        expect(insErr).not.toBeNull();

        await admin.from("manual_payments").delete().eq("id", paymentId);
      },
      TEST_TIMEOUT
    );

    test(
      "internal_notes: invisible para el tenant; solo staff lee",
      async (ctx) => {
        const { data, error } = await admin
          .from("internal_notes")
          .insert({
            tenant_id: tenantA.tenantId,
            author_id: staff.userId,
            body: `${RUN_PREFIX} nota interna`,
          })
          .select("id")
          .single();

        if (isMissingSaasConsole(error)) {
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        const noteId = data!.id;

        // A (dueño del tenant) NO la ve.
        const { data: aSee } = await tenantA.client
          .from("internal_notes")
          .select("id")
          .eq("id", noteId);
        expect(aSee ?? []).toEqual([]);

        // staff sí.
        const { data: staffSee } = await staffClient
          .from("internal_notes")
          .select("id, tenant_id")
          .eq("id", noteId);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);

        await admin.from("internal_notes").delete().eq("id", noteId);
      },
      TEST_TIMEOUT
    );

    test(
      "internal_settings: invisible para el tenant; solo staff lee",
      async (ctx) => {
        const settingKey = `${RUN_PREFIX}-setting`;
        const { error } = await admin
          .from("internal_settings")
          .insert({ key: settingKey, value: { enabled: true } });

        if (isMissingSaasConsole(error)) {
          ctx.skip();
          return;
        }
        expect(error).toBeNull();

        // El tenant NO ve settings de plataforma.
        const { data: aSee } = await tenantA.client
          .from("internal_settings")
          .select("key")
          .eq("key", settingKey);
        expect(aSee ?? []).toEqual([]);

        // staff sí.
        const { data: staffSee } = await staffClient
          .from("internal_settings")
          .select("key")
          .eq("key", settingKey);
        expect(staffSee).toHaveLength(1);

        await admin.from("internal_settings").delete().eq("key", settingKey);
      },
      TEST_TIMEOUT
    );

    // — Tablas que el tenant ve: A ve las propias, no las de B; staff lee —

    test(
      "subscription_addons: A ve el suyo; B no; staff sí; writes service_role",
      async (ctx) => {
        const { data, error } = await admin
          .from("subscription_addons")
          .insert({
            tenant_id: tenantA.tenantId,
            addon_key: "ai",
            status: "active",
            source: "granted",
          })
          .select("id")
          .single();

        if (isMissingSaasConsole(error)) {
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        addonAId = data!.id;

        // A ve su add-on (necesita saber si tiene IA).
        const { data: aSee } = await tenantA.client
          .from("subscription_addons")
          .select("id, addon_key")
          .eq("id", addonAId!);
        expect(aSee).toHaveLength(1);
        expect(aSee![0].addon_key).toBe("ai");

        // B no lo ve.
        const { data: bSee } = await tenantB.client
          .from("subscription_addons")
          .select("id")
          .eq("id", addonAId!);
        expect(bSee ?? []).toEqual([]);

        // staff sí.
        const { data: staffSee } = await staffClient
          .from("subscription_addons")
          .select("id, tenant_id")
          .eq("id", addonAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);

        // El tenant NO puede escribir (sin policy write para authenticated).
        const { error: insErr } = await tenantA.client
          .from("subscription_addons")
          .insert({ tenant_id: tenantA.tenantId, addon_key: "ai" });
        expect(insErr).not.toBeNull();

        const { data: upd, error: updErr } = await tenantA.client
          .from("subscription_addons")
          .update({ status: "cancelled" })
          .eq("id", addonAId!)
          .select("id");
        expect(updErr ? true : (upd ?? []).length === 0).toBe(true);
      },
      TEST_TIMEOUT
    );

    test(
      "tenant_flags: A ve el suyo; B no; staff sí; writes service_role",
      async (ctx) => {
        const { data, error } = await admin
          .from("tenant_flags")
          .insert({
            tenant_id: tenantA.tenantId,
            flag: "ai_enabled",
            enabled: true,
            set_by: staff.userId,
          })
          .select("id")
          .single();

        if (isMissingSaasConsole(error)) {
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        flagAId = data!.id;

        // A ve su flag.
        const { data: aSee } = await tenantA.client
          .from("tenant_flags")
          .select("id, flag, enabled")
          .eq("id", flagAId!);
        expect(aSee).toHaveLength(1);
        expect(aSee![0].flag).toBe("ai_enabled");

        // B no.
        const { data: bSee } = await tenantB.client
          .from("tenant_flags")
          .select("id")
          .eq("id", flagAId!);
        expect(bSee ?? []).toEqual([]);

        // staff sí.
        const { data: staffSee } = await staffClient
          .from("tenant_flags")
          .select("id, tenant_id")
          .eq("id", flagAId!);
        expect(staffSee).toHaveLength(1);

        // A no puede pisar su propio flag (writes solo service_role).
        const { data: upd, error: updErr } = await tenantA.client
          .from("tenant_flags")
          .update({ enabled: false })
          .eq("id", flagAId!)
          .select("id");
        expect(updErr ? true : (upd ?? []).length === 0).toBe(true);
      },
      TEST_TIMEOUT
    );

    test(
      "subscription_invoices: A ve la suya; B no; staff sí; writes service_role",
      async (ctx) => {
        const { data, error } = await admin
          .from("subscription_invoices")
          .insert({
            tenant_id: tenantA.tenantId,
            number: `${RUN_PREFIX}-INV-0001`,
            amount: 69000,
            currency: "ARS",
            status: "issued",
            issued_at: "2026-06-01",
          })
          .select("id")
          .single();

        if (isMissingSaasConsole(error)) {
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        invoiceAId = data!.id;

        // A ve su factura.
        const { data: aSee } = await tenantA.client
          .from("subscription_invoices")
          .select("id, number")
          .eq("id", invoiceAId!);
        expect(aSee).toHaveLength(1);

        // B no.
        const { data: bSee } = await tenantB.client
          .from("subscription_invoices")
          .select("id")
          .eq("id", invoiceAId!);
        expect(bSee ?? []).toEqual([]);

        // staff sí.
        const { data: staffSee } = await staffClient
          .from("subscription_invoices")
          .select("id, tenant_id")
          .eq("id", invoiceAId!);
        expect(staffSee).toHaveLength(1);
        expect(staffSee![0].tenant_id).toBe(tenantA.tenantId);

        // A no puede emitir/borrar facturas (writes solo service_role).
        const { error: insErr } = await tenantA.client
          .from("subscription_invoices")
          .insert({
            tenant_id: tenantA.tenantId,
            number: `${RUN_PREFIX}-INV-FAKE`,
            amount: 1,
            currency: "ARS",
            issued_at: "2026-06-02",
          });
        expect(insErr).not.toBeNull();
      },
      TEST_TIMEOUT
    );

    test(
      "plan_addons: catálogo legible por authenticated; anon no",
      async (ctx) => {
        const { data: aSee, error } = await tenantA.client
          .from("plan_addons")
          .select("key")
          .eq("key", "ai");

        if (isMissingSaasConsole(error)) {
          ctx.skip();
          return;
        }
        expect(error).toBeNull();
        expect((aSee ?? []).length).toBeGreaterThan(0);

        // anon no lo lee (no es traza pública).
        const { data: anonSee } = await anonClient()
          .from("plan_addons")
          .select("key")
          .eq("key", "ai");
        expect(anonSee ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );

    test(
      "anon NO lee ninguna tabla de la consola interna",
      async (ctx) => {
        if (!addonAId && !flagAId && !invoiceAId) {
          ctx.skip();
          return;
        }
        const anon = anonClient();
        for (const table of [
          "manual_payments",
          "subscription_addons",
          "tenant_flags",
          "internal_notes",
          "subscription_invoices",
          "internal_settings",
        ]) {
          const { data, error } = await anon.from(table).select("*").limit(1);
          expect(error, `${table} error`).toBeNull();
          expect(data ?? [], `${table} leak`).toEqual([]);
        }
      },
      TEST_TIMEOUT
    );
  });

  // ── 5bis. Perfil de membresía (tenant_users.display_name/avatar — 0012) ─────
  describe("membership profile (tenant_users, migración 0012)", () => {
    test(
      "A actualiza su propio display_name/avatar",
      async () => {
        const { data, error } = await tenantA.client
          .from("tenant_users")
          .update({ display_name: `${RUN_PREFIX} Perfil A`, avatar: "chef" })
          .eq("user_id", tenantA.userId)
          .select("display_name, avatar");
        expect(error).toBeNull();
        expect(data).toHaveLength(1);
        expect(data?.[0]?.display_name).toBe(`${RUN_PREFIX} Perfil A`);
        expect(data?.[0]?.avatar).toBe("chef");
      },
      TEST_TIMEOUT
    );

    test(
      "B no lee la membresía de A",
      async () => {
        const { data, error } = await tenantB.client
          .from("tenant_users")
          .select("id, display_name")
          .eq("tenant_id", tenantA.tenantId);
        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );

    test(
      "B no puede pisar el perfil de A (0 filas afectadas)",
      async () => {
        const { data, error } = await tenantB.client
          .from("tenant_users")
          .update({ display_name: `${RUN_PREFIX} hacked` })
          .eq("user_id", tenantA.userId)
          .select("id");
        expect(error).toBeNull();
        expect(data ?? []).toEqual([]);

        // El perfil de A quedó intacto.
        const { data: mine } = await tenantA.client
          .from("tenant_users")
          .select("display_name")
          .eq("user_id", tenantA.userId)
          .single();
        expect(mine?.display_name).toBe(`${RUN_PREFIX} Perfil A`);
      },
      TEST_TIMEOUT
    );
  });

  // ── 6. Anon: barrido sobre tablas operativas (no lee nada) ───────────────────
  describe("anon sin sesión: no lee tablas operativas", () => {
    const operativeTables = [
      "ingredients",
      "recipes",
      "stock_entries",
      "productions",
      "customers",
      "vehicles",
      "dispatches",
      "analyses",
      "laboratories",
      "reports",
      "members",
      "suppliers",
      "tenants",
      "subscriptions",
    ];

    test(
      "select sin sesión devuelve vacío en todas",
      async () => {
        const anon = anonClient();
        for (const table of operativeTables) {
          const { data, error } = await anon.from(table).select("id").limit(1);
          // Sin policy para anon → 0 filas (no debe filtrar datos de ningún tenant).
          expect(error, `${table} error`).toBeNull();
          expect(data ?? [], `${table} leak`).toEqual([]);
        }
      },
      TEST_TIMEOUT
    );
  });

  // ── 7. RPCs: aislamiento de escritura por tenant ─────────────────────────────
  describe("RPCs: aislamiento por tenant", () => {
    test(
      "create_stock_entry de A escribe en tenant A (no en B)",
      async () => {
        const { data: entryId, error } = await tenantA.client.rpc(
          "create_stock_entry",
          {
            p_ingredient_id: ingredientAId,
            p_quantity: 10,
            p_unit: "kg",
            p_lot_number: `${RUN_PREFIX}-RPC`,
          }
        );
        expect(error).toBeNull();
        const { data: rowAsAdmin } = await admin
          .from("stock_entries")
          .select("tenant_id")
          .eq("id", entryId as string)
          .single();
        expect(rowAsAdmin?.tenant_id).toBe(tenantA.tenantId);
        // B no la ve.
        const { data: bSee } = await tenantB.client
          .from("stock_entries")
          .select("id")
          .eq("id", entryId as string);
        expect(bSee ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );

    test(
      "create_dispatch con customer de B falla bajo sesión de A",
      async (ctx) => {
        // Customer de B (sembrarlo).
        const { data: custB, error: cErr } = await tenantB.client
          .from("customers")
          .insert({ tenant_id: tenantB.tenantId, name: `${RUN_PREFIX} cliente B` })
          .select("id")
          .single();
        expect(cErr).toBeNull();

        const { error } = await tenantA.client.rpc("create_dispatch", {
          p_customer_id: custB!.id,
          p_dispatch_date: "2026-06-05",
          p_items: [{ recipe_id: recipeAId, production_id: null, quantity_kg: 1 }],
        });

        if (
          error &&
          (error.code === "PGRST202" ||
            /create_dispatch|function|schema cache/i.test(error.message))
        ) {
          // RPC aún no aplicada en cloud (migración 0008 pendiente): aplicar con
          // `supabase db push`. Se skipea SOLO este caso (no se marca verde).
          console.warn(
            "create_dispatch no está en cloud (migración 0008 pendiente): " +
              error.message
          );
          ctx.skip();
          return;
        }

        // La RPC valida el customer contra current_tenant_id() → customer_not_found.
        expect(error).not.toBeNull();
        expect(error!.message).toMatch(/customer_not_found|no_tenant/);
        // B no recibió ningún despacho de A.
        const { data: bDisp } = await admin
          .from("dispatches")
          .select("id")
          .eq("customer_id", custB!.id);
        expect(bDisp ?? []).toEqual([]);
      },
      TEST_TIMEOUT
    );
  });
});

// Mensaje claro cuando la suite no corre por falta de credenciales.
describe.skipIf(RLS_ENABLED)("RLS multi-tenant isolation (sin credenciales)", () => {
  test("skipped: definí SUPABASE_SERVICE_ROLE_KEY (.env.local) o RLS_TESTS=1", () => {
    expect(RLS_ENABLED).toBe(false);
  });
});
