import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveActiveEstablishmentId,
  useActiveEstablishmentStore,
} from "@/modules/establishments/store";

// Tests del store de planta activa (Zustand + persist). La selección es POR
// tenant: cada tenant conserva su propia planta sin pisar la de otro. Operamos
// sobre el store fuera de React (getState/setState), que es la API soportada.

const store = useActiveEstablishmentStore;

beforeEach(() => {
  // Estado limpio entre tests (el persist comparte instancia en el módulo).
  store.setState({ byTenant: {} });
});

afterEach(() => {
  store.setState({ byTenant: {} });
});

describe("useActiveEstablishmentStore", () => {
  it("guarda y lee la planta activa de un tenant", () => {
    store.getState().setActive("tenant-a", "est-1");
    expect(store.getState().getActive("tenant-a")).toBe("est-1");
  });

  it("aísla la selección por tenant (no se pisan entre sí)", () => {
    store.getState().setActive("tenant-a", "est-1");
    store.getState().setActive("tenant-b", "est-2");
    expect(store.getState().getActive("tenant-a")).toBe("est-1");
    expect(store.getState().getActive("tenant-b")).toBe("est-2");
  });

  it("permite 'Todas las plantas' guardando null explícito", () => {
    store.getState().setActive("tenant-a", "est-1");
    store.getState().setActive("tenant-a", null);
    expect(store.getState().getActive("tenant-a")).toBeNull();
  });

  it("devuelve undefined cuando el tenant nunca eligió planta", () => {
    expect(store.getState().getActive("tenant-nuevo")).toBeUndefined();
  });

  it("reset borra solo la selección del tenant indicado", () => {
    store.getState().setActive("tenant-a", "est-1");
    store.getState().setActive("tenant-b", "est-2");
    store.getState().reset("tenant-a");
    expect(store.getState().getActive("tenant-a")).toBeUndefined();
    expect(store.getState().getActive("tenant-b")).toBe("est-2");
  });

  it("setActive sobre el mismo tenant reemplaza el valor anterior", () => {
    store.getState().setActive("tenant-a", "est-1");
    store.getState().setActive("tenant-a", "est-9");
    expect(store.getState().getActive("tenant-a")).toBe("est-9");
  });
});

describe("resolveActiveEstablishmentId", () => {
  const ids = ["est-1", "est-2", "est-3"];

  it("nunca filtra con un solo establecimiento", () => {
    expect(resolveActiveEstablishmentId("est-1", ["est-1"])).toBeNull();
  });

  it("nunca filtra sin establecimientos", () => {
    expect(resolveActiveEstablishmentId("est-1", [])).toBeNull();
  });

  it("trata 'Todas' (null) como sin filtro", () => {
    expect(resolveActiveEstablishmentId(null, ids)).toBeNull();
  });

  it("trata 'nunca elegido' (undefined) como sin filtro", () => {
    expect(resolveActiveEstablishmentId(undefined, ids)).toBeNull();
  });

  it("devuelve la planta elegida si existe", () => {
    expect(resolveActiveEstablishmentId("est-2", ids)).toBe("est-2");
  });

  it("cae a 'Todas' si la planta elegida ya no existe (borrada)", () => {
    expect(resolveActiveEstablishmentId("est-borrada", ids)).toBeNull();
  });
});
