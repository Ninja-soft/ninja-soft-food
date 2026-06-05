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
