import { createClient } from "@/lib/supabase/client";

// Recall / Trazabilidad (CAA Art. 1415): reconstrucción de la cadena completa
// supplier → stock_entry (lote MP) → production_input → production (lote PT) →
// dispatch_item → dispatch → customer, en segundos y con acta exportable.
//
// Toda la lógica de negocio vive acá (nunca en componentes).
//
// REGLA REGULATORIA — soft delete:
//   En un recall, la mercadería que YA SALIÓ importa aunque el despacho se haya
//   anulado (status='voided') o borrado lógicamente (deleted_at). Por eso las
//   queries de despachos NO filtran por deleted_at ni por status: traen TODO y
//   marcan cada resultado con flags `voided` / `deleted` para que el responsable
//   del recall decida. Para el resto de las tablas se respeta el soft delete
//   normal (.is("deleted_at", null)).

// ── Tipos compartidos ─────────────────────────────────────────────────────────

/** Contacto de proveedor: `suppliers.contact` es JSON libre, lo leemos defensivo. */
type SupplierContact = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

function parseSupplierContact(raw: unknown): SupplierContact {
  if (!raw || typeof raw !== "object") return {};
  const c = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  return {
    name: str(c.name),
    phone: str(c.phone),
    email: str(c.email),
    address: str(c.address),
  };
}

/** Resultado del buscador unificado de lotes. */
export type LotSearchResult = {
  /** MP = lote de materia prima (stock_entry); PT = lote de producto terminado. */
  type: "MP" | "PT";
  id: string;
  lotNumber: string;
  /** Ingrediente (MP) o producto/receta (PT). */
  label: string;
  /** Dato secundario para desambiguar (proveedor para MP, código para PT). */
  detail: string | null;
  date: string | null;
  expiryDate: string | null;
};

/** Despacho dentro de una traza, con flags regulatorios de recall. */
export type TraceDispatch = {
  dispatchId: string;
  dispatchItemId: string;
  dispatchDate: string;
  quantityKg: number;
  /** Despacho anulado (status='voided'): la mercadería igual salió. */
  voided: boolean;
  /** Despacho borrado lógicamente (deleted_at): la mercadería igual salió. */
  deleted: boolean;
  status: string;
  customer: {
    id: string;
    name: string;
    locality: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

/** Cliente afectado, agregado y único, con total de kg que recibió. */
export type AffectedCustomer = {
  id: string | null;
  name: string;
  locality: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  totalKg: number;
  /** Cantidad de despachos que llegaron a este cliente dentro de la traza. */
  dispatchCount: number;
  /** Algún despacho de este cliente está anulado o borrado (mercadería salida). */
  hasVoidedOrDeleted: boolean;
};

/** Producción que consumió un lote de MP (eslabón forward). */
export type TraceProduction = {
  productionId: string;
  code: string;
  productionDate: string;
  productLotNumber: string | null;
  productExpiryDate: string | null;
  recipeTitle: string;
  /** kg de este lote de MP consumidos por esta producción. */
  consumedQty: number;
  consumedUnit: string;
  /** kg producidos de PT en esta producción. */
  producedKg: number | null;
  isSubstitute: boolean;
  dispatches: TraceDispatch[];
};

/** Resultado completo de un trace forward desde un lote de MP. */
export type ForwardTrace = {
  origin: {
    stockEntryId: string;
    lotNumber: string;
    ingredientName: string;
    unit: string;
    quantity: number;
    remainingQuantity: number;
    expiryDate: string | null;
    noTraceability: boolean;
    supplier: {
      id: string;
      name: string;
      rneNumber: string | null;
      rneExpiry: string | null;
      contact: SupplierContact;
    } | null;
  };
  productions: TraceProduction[];
  affectedCustomers: AffectedCustomer[];
  /** Suma de kg despachados a clientes en toda la cadena. */
  totalDispatchedKg: number;
};

/** Insumo consumido por una producción (eslabón backward). */
export type TraceInput = {
  inputId: string;
  ingredientName: string;
  unit: string;
  takenQty: number;
  isSubstitute: boolean;
  /** Stock infinito / compra menor (sin trazabilidad de origen). */
  noOriginTrace: boolean;
  lotNumber: string | null;
  expiryDate: string | null;
  supplier: {
    id: string;
    name: string;
    rneNumber: string | null;
    rneExpiry: string | null;
    contact: SupplierContact;
  } | null;
};

/** Resultado completo de un trace backward desde un lote de PT. */
export type BackwardTrace = {
  production: {
    productionId: string;
    code: string;
    productionDate: string;
    packagingDate: string | null;
    productLotNumber: string | null;
    productExpiryDate: string | null;
    quantityKg: number | null;
    recipeTitle: string;
    rnpaNumber: string | null;
  };
  inputs: TraceInput[];
  dispatches: TraceDispatch[];
  affectedCustomers: AffectedCustomer[];
  totalDispatchedKg: number;
};

// ── Selects reutilizables ─────────────────────────────────────────────────────

const SUPPLIER_SELECT = "id, name, rne_number, rne_expiry, contact";

// dispatch_items con su cabecera de despacho y cliente. Nota: traemos status y
// deleted_at del despacho para el flag de recall (no se filtran).
const DISPATCH_ITEM_SELECT = `
  id, quantity_kg, production_id,
  dispatch:dispatches(
    id, dispatch_date, status, deleted_at,
    customer:customers(id, name, locality, address, phone, email)
  )
`;

// ── Helpers de mapeo ──────────────────────────────────────────────────────────

type RawDispatchHead = {
  id: string;
  dispatch_date: string;
  status: string;
  deleted_at: string | null;
  customer: {
    id: string;
    name: string;
    locality: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  } | null;
};

type RawDispatchItem = {
  id: string;
  quantity_kg: number;
  production_id: string | null;
  dispatch: RawDispatchHead | RawDispatchHead[] | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel ?? null;
}

function mapDispatchItem(item: RawDispatchItem): TraceDispatch | null {
  const head = one(item.dispatch);
  if (!head) return null;
  const customer = one(head.customer);
  return {
    dispatchId: head.id,
    dispatchItemId: item.id,
    dispatchDate: head.dispatch_date,
    quantityKg: item.quantity_kg,
    voided: head.status === "voided",
    deleted: head.deleted_at != null,
    status: head.status,
    customer: customer
      ? {
          id: customer.id,
          name: customer.name,
          locality: customer.locality,
          address: customer.address,
          phone: customer.phone,
          email: customer.email,
        }
      : null,
  };
}

/** Agrega despachos en clientes únicos con total de kg (resumen de recall). */
function aggregateAffected(dispatches: TraceDispatch[]): AffectedCustomer[] {
  const byCustomer = new Map<string, AffectedCustomer>();
  for (const d of dispatches) {
    const key = d.customer?.id ?? "__sin_cliente__";
    const existing = byCustomer.get(key);
    if (existing) {
      existing.totalKg += d.quantityKg;
      existing.dispatchCount += 1;
      existing.hasVoidedOrDeleted ||= d.voided || d.deleted;
    } else {
      byCustomer.set(key, {
        id: d.customer?.id ?? null,
        name: d.customer?.name ?? "(cliente sin datos)",
        locality: d.customer?.locality ?? null,
        address: d.customer?.address ?? null,
        phone: d.customer?.phone ?? null,
        email: d.customer?.email ?? null,
        totalKg: d.quantityKg,
        dispatchCount: 1,
        hasVoidedOrDeleted: d.voided || d.deleted,
      });
    }
  }
  return [...byCustomer.values()].sort((a, b) => b.totalKg - a.totalKg);
}

// ── Búsqueda unificada de lotes (MP y PT) ─────────────────────────────────────

export async function searchLots(query: string): Promise<LotSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = createClient();
  const like = `%${q}%`;

  // MP: stock_entries por lot_number (soft delete normal — un lote MP borrado no
  // es candidato de partida; si llegó a producción se ve igual en el backward).
  const mpPromise = supabase
    .from("stock_entries")
    .select(
      `id, lot_number, expiry_date, created_at,
       ingredient:ingredients(name),
       supplier:suppliers(name)`,
    )
    .is("deleted_at", null)
    .ilike("lot_number", like)
    .order("created_at", { ascending: false })
    .limit(25);

  // PT: productions por product_lot_number (soft delete normal en la búsqueda;
  // el recall sobre un PT borrado se inicia eligiendo su MP o por código directo).
  const ptPromise = supabase
    .from("productions")
    .select(
      `id, code, product_lot_number, product_expiry_date, production_date,
       recipe:recipes(title, commercial_name)`,
    )
    .is("deleted_at", null)
    .not("product_lot_number", "is", null)
    .ilike("product_lot_number", like)
    .order("production_date", { ascending: false })
    .limit(25);

  const [mpRes, ptRes] = await Promise.all([mpPromise, ptPromise]);
  if (mpRes.error) throw mpRes.error;
  if (ptRes.error) throw ptRes.error;

  const mp: LotSearchResult[] = (mpRes.data ?? []).map((r) => {
    const ingredient = one(r.ingredient as { name: string } | { name: string }[]);
    const supplier = one(r.supplier as { name: string } | { name: string }[]);
    return {
      type: "MP" as const,
      id: r.id,
      lotNumber: r.lot_number,
      label: ingredient?.name ?? "(ingrediente)",
      detail: supplier?.name ?? null,
      date: r.created_at,
      expiryDate: r.expiry_date,
    };
  });

  const pt: LotSearchResult[] = (ptRes.data ?? []).map((r) => {
    const recipe = one(
      r.recipe as
        | { title: string; commercial_name: string | null }
        | { title: string; commercial_name: string | null }[],
    );
    return {
      type: "PT" as const,
      id: r.id,
      lotNumber: r.product_lot_number as string,
      label: recipe?.commercial_name || recipe?.title || "(producto)",
      detail: r.code,
      date: r.production_date,
      expiryDate: r.product_expiry_date,
    };
  });

  return [...mp, ...pt];
}

// ── Trace FORWARD: desde un lote de MP hacia los clientes ──────────────────────

export async function traceForward(stockEntryId: string): Promise<ForwardTrace> {
  const supabase = createClient();

  // 1. Origen: el lote de MP + proveedor (RNE + contacto).
  const { data: entry, error: entryErr } = await supabase
    .from("stock_entries")
    .select(
      `id, lot_number, quantity, remaining_quantity, unit, expiry_date,
       no_traceability,
       ingredient:ingredients(name),
       supplier:suppliers(${SUPPLIER_SELECT})`,
    )
    .eq("id", stockEntryId)
    .single();
  if (entryErr) throw entryErr;

  const ingredient = one(
    entry.ingredient as { name: string } | { name: string }[],
  );
  const rawSupplier = one(
    entry.supplier as
      | {
          id: string;
          name: string;
          rne_number: string | null;
          rne_expiry: string | null;
          contact: unknown;
        }
      | {
          id: string;
          name: string;
          rne_number: string | null;
          rne_expiry: string | null;
          contact: unknown;
        }[],
  );

  // 2. production_inputs que consumieron este lote → producciones.
  const { data: inputs, error: inputsErr } = await supabase
    .from("production_inputs")
    .select(
      `id, taken_qty, is_substitute,
       production:productions(
         id, code, production_date, quantity_kg,
         product_lot_number, product_expiry_date, deleted_at,
         recipe:recipes(title, commercial_name)
       )`,
    )
    .eq("stock_entry_id", stockEntryId);
  if (inputsErr) throw inputsErr;

  type RawProd = {
    id: string;
    code: string;
    production_date: string;
    quantity_kg: number | null;
    product_lot_number: string | null;
    product_expiry_date: string | null;
    deleted_at: string | null;
    recipe:
      | { title: string; commercial_name: string | null }
      | { title: string; commercial_name: string | null }[]
      | null;
  };
  type RawInput = {
    id: string;
    taken_qty: number;
    is_substitute: boolean;
    production: RawProd | RawProd[] | null;
  };

  // Producción única por id (un lote MP puede aparecer 1 vez por producción).
  const prodMap = new Map<string, { input: RawInput; prod: RawProd }>();
  for (const ri of (inputs ?? []) as unknown as RawInput[]) {
    const prod = one(ri.production);
    // El input pertenece a una producción borrada: la producción salió igual,
    // pero la fuente del recall es el lote MP, así que la incluimos.
    if (!prod) continue;
    prodMap.set(prod.id, { input: ri, prod });
  }

  const productionIds = [...prodMap.keys()];

  // 3. dispatch_items de esas producciones → despachos → clientes.
  //    SIN filtro de deleted_at / status (regla de recall).
  const dispatchesByProduction = new Map<string, TraceDispatch[]>();
  const allDispatches: TraceDispatch[] = [];
  if (productionIds.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .from("dispatch_items")
      .select(DISPATCH_ITEM_SELECT)
      .in("production_id", productionIds);
    if (itemsErr) throw itemsErr;

    for (const it of (items ?? []) as unknown as RawDispatchItem[]) {
      const mapped = mapDispatchItem(it);
      if (!mapped || !it.production_id) continue;
      const list = dispatchesByProduction.get(it.production_id) ?? [];
      list.push(mapped);
      dispatchesByProduction.set(it.production_id, list);
      allDispatches.push(mapped);
    }
  }

  const productions: TraceProduction[] = [...prodMap.values()].map(
    ({ input, prod }) => {
      const recipe = one(prod.recipe);
      return {
        productionId: prod.id,
        code: prod.code,
        productionDate: prod.production_date,
        productLotNumber: prod.product_lot_number,
        productExpiryDate: prod.product_expiry_date,
        recipeTitle: recipe?.commercial_name || recipe?.title || "(producto)",
        consumedQty: input.taken_qty,
        consumedUnit: entry.unit,
        producedKg: prod.quantity_kg,
        isSubstitute: input.is_substitute,
        dispatches: dispatchesByProduction.get(prod.id) ?? [],
      };
    },
  );
  productions.sort((a, b) => b.productionDate.localeCompare(a.productionDate));

  return {
    origin: {
      stockEntryId: entry.id,
      lotNumber: entry.lot_number,
      ingredientName: ingredient?.name ?? "(ingrediente)",
      unit: entry.unit,
      quantity: entry.quantity,
      remainingQuantity: entry.remaining_quantity,
      expiryDate: entry.expiry_date,
      noTraceability: entry.no_traceability,
      supplier: rawSupplier
        ? {
            id: rawSupplier.id,
            name: rawSupplier.name,
            rneNumber: rawSupplier.rne_number,
            rneExpiry: rawSupplier.rne_expiry,
            contact: parseSupplierContact(rawSupplier.contact),
          }
        : null,
    },
    productions,
    affectedCustomers: aggregateAffected(allDispatches),
    totalDispatchedKg: allDispatches.reduce((s, d) => s + d.quantityKg, 0),
  };
}

// ── Trace BACKWARD: desde un lote de PT hacia insumos + clientes ───────────────

export async function traceBackward(
  productionId: string,
): Promise<BackwardTrace> {
  const supabase = createClient();

  // 1. La producción (lote PT) + receta.
  const { data: prod, error: prodErr } = await supabase
    .from("productions")
    .select(
      `id, code, production_date, packaging_date, quantity_kg,
       product_lot_number, product_expiry_date,
       recipe:recipes(title, commercial_name, rnpa_number)`,
    )
    .eq("id", productionId)
    .single();
  if (prodErr) throw prodErr;

  const recipe = one(
    prod.recipe as
      | { title: string; commercial_name: string | null; rnpa_number: string | null }
      | {
          title: string;
          commercial_name: string | null;
          rnpa_number: string | null;
        }[],
  );

  // 2. Insumos consumidos → stock_entries → proveedor (RNE + contacto).
  const { data: inputs, error: inputsErr } = await supabase
    .from("production_inputs")
    .select(
      `id, taken_qty, is_substitute,
       ingredient:ingredients!production_inputs_ingredient_id_fkey(name, unit),
       stock_entry:stock_entries(
         lot_number, expiry_date, unit,
         supplier:suppliers(${SUPPLIER_SELECT})
       )`,
    )
    .eq("production_id", productionId);
  if (inputsErr) throw inputsErr;

  type RawSupplier = {
    id: string;
    name: string;
    rne_number: string | null;
    rne_expiry: string | null;
    contact: unknown;
  };
  type RawBackInput = {
    id: string;
    taken_qty: number;
    is_substitute: boolean;
    ingredient: { name: string; unit: string } | { name: string; unit: string }[] | null;
    stock_entry:
      | {
          lot_number: string;
          expiry_date: string | null;
          unit: string;
          supplier: RawSupplier | RawSupplier[] | null;
        }
      | {
          lot_number: string;
          expiry_date: string | null;
          unit: string;
          supplier: RawSupplier | RawSupplier[] | null;
        }[]
      | null;
  };

  const mappedInputs: TraceInput[] = (
    (inputs ?? []) as unknown as RawBackInput[]
  ).map((ri) => {
    const ing = one(ri.ingredient);
    const se = one(ri.stock_entry);
    const sup = se ? one(se.supplier) : null;
    return {
      inputId: ri.id,
      ingredientName: ing?.name ?? "(ingrediente)",
      unit: se?.unit ?? ing?.unit ?? "",
      takenQty: ri.taken_qty,
      isSubstitute: ri.is_substitute,
      noOriginTrace: se == null, // stock infinito / compra menor
      lotNumber: se?.lot_number ?? null,
      expiryDate: se?.expiry_date ?? null,
      supplier: sup
        ? {
            id: sup.id,
            name: sup.name,
            rneNumber: sup.rne_number,
            rneExpiry: sup.rne_expiry,
            contact: parseSupplierContact(sup.contact),
          }
        : null,
    };
  });

  // 3. Despachos de esta producción → clientes (SIN filtro de recall).
  const { data: items, error: itemsErr } = await supabase
    .from("dispatch_items")
    .select(DISPATCH_ITEM_SELECT)
    .eq("production_id", productionId);
  if (itemsErr) throw itemsErr;

  const dispatches: TraceDispatch[] = [];
  for (const it of (items ?? []) as unknown as RawDispatchItem[]) {
    const mapped = mapDispatchItem(it);
    if (mapped) dispatches.push(mapped);
  }
  dispatches.sort((a, b) => b.dispatchDate.localeCompare(a.dispatchDate));

  return {
    production: {
      productionId: prod.id,
      code: prod.code,
      productionDate: prod.production_date,
      packagingDate: prod.packaging_date,
      productLotNumber: prod.product_lot_number,
      productExpiryDate: prod.product_expiry_date,
      quantityKg: prod.quantity_kg,
      recipeTitle: recipe?.commercial_name || recipe?.title || "(producto)",
      rnpaNumber: recipe?.rnpa_number ?? null,
    },
    inputs: mappedInputs,
    dispatches,
    affectedCustomers: aggregateAffected(dispatches),
    totalDispatchedKg: dispatches.reduce((s, d) => s + d.quantityKg, 0),
  };
}
