import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Punto 5: el backend revalida al usuario contra ingem_users en cada request y
// usa el role ACTUAL de la base, ignorando el role del JWT. Mockeamos SOLO
// getIngemUserById (el resto de db queda real) con una "base" en memoria que
// cada test controla. NUNCA toca una base real.
const dbStore = vi.hoisted(() => ({
  byId: new Map<number, any>(),
  fail: false, // simula caída de DB (getIngemUserById lanza)
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserById: async (id: number) => {
      if (dbStore.fail) throw new Error("DB down");
      return dbStore.byId.get(id);
    },
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";
import { TOKEN_EXPIRY } from "./ingemAuth";

const UNAUTHED = "Sesión expirada. Por favor, inicie sesión nuevamente.";
const FORBIDDEN = "No tenés permisos para realizar esta acción.";
const ADMIN_ONLY = "No tienes permisos de administrador.";
const NO_DB = "DB not available";

function ctx(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}
function dbUser(id: number, role: string, isActive = true, email = `u${id}@ingem.com`) {
  return { id, name: `U${id}`, email, role, isActive, allowedModules: null };
}

let tokens: Record<string, string>;
beforeAll(async () => {
  tokens = {
    // El role en el TOKEN es intencionalmente el "viejo"; la base decide.
    tokAdmin: await generateIngemToken({ userId: 10, email: "u10@ingem.com", name: "U10", role: "admin" }),
    tokManager: await generateIngemToken({ userId: 20, email: "u20@ingem.com", name: "U20", role: "manager" }),
    tokViewer: await generateIngemToken({ userId: 30, email: "u30@ingem.com", name: "U30", role: "viewer" }),
  };
});
beforeEach(() => { dbStore.byId.clear(); dbStore.fail = false; });

describe("Punto 5 — revalidación de sesión contra la base", () => {
  it("usuario activo + JWT válido → opera normalmente (rol de la base)", async () => {
    dbStore.byId.set(20, dbUser(20, "manager"));
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokManager}`));
    // Manager puede crear cliente: pasa la autz y llega al resolver (sin DB real → NO_DB).
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(NO_DB);
  });

  it("usuario DESACTIVADO → sin acceso inmediato (UNAUTHORIZED) aunque el token sea válido", async () => {
    dbStore.byId.set(20, dbUser(20, "manager", /* isActive */ false));
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokManager}`));
    await expect(caller.customers.list()).rejects.toThrow(UNAUTHED);
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(UNAUTHED);
  });

  it("usuario ELIMINADO (no está en la base) → sin acceso inmediato (UNAUTHORIZED)", async () => {
    // dbStore vacío para el id 20
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokManager}`));
    await expect(caller.customers.list()).rejects.toThrow(UNAUTHED);
    await expect(caller.jobs.update({ id: 1, title: "x" })).rejects.toThrow(UNAUTHED);
  });

  it("DEGRADACIÓN Manager→Viewer: token dice manager, base dice viewer → pierde permisos de manager", async () => {
    dbStore.byId.set(20, dbUser(20, "viewer")); // la base manda
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokManager}`));
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(FORBIDDEN);
    await expect(caller.jobs.delete({ id: 1 })).rejects.toThrow(FORBIDDEN);
    // Como viewer, la lectura sigue permitida:
    await expect(caller.customers.list()).resolves.toEqual([]);
  });

  it("DEGRADACIÓN Admin→Manager: token dice admin, base dice manager → pierde acciones de admin", async () => {
    dbStore.byId.set(10, dbUser(10, "manager"));
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokAdmin}`));
    // exportAll es admin-only: ahora se le niega.
    await expect(caller.dataExport.exportAll()).rejects.toThrow(ADMIN_ONLY);
    await expect(caller.ingemAuth.createUser({
      name: "N", email: "n@x.com", password: "12345678", role: "viewer", isActive: true,
    })).rejects.toThrow(ADMIN_ONLY);
    // Pero conserva lo operativo de manager (crear cliente pasa la autz):
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(NO_DB);
  });

  it("PROMOCIÓN Viewer→Admin: token dice viewer, base dice admin → gana permisos de admin SIN re-login", async () => {
    dbStore.byId.set(30, dbUser(30, "admin"));
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokViewer}`));
    // exportAll admin-only: ahora autorizado (sin DB real → resuelve null).
    await expect(caller.dataExport.exportAll()).resolves.toBeNull();
    // Y puede crear cliente (autz pasa → NO_DB en el resolver):
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(NO_DB);
  });

  it("FAIL-CLOSED: si no se puede resolver al usuario (DB caída) → acceso denegado", async () => {
    dbStore.byId.set(20, dbUser(20, "manager"));
    dbStore.fail = true; // getIngemUserById lanza
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokManager}`));
    await expect(caller.customers.list()).rejects.toThrow(UNAUTHED);
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(UNAUTHED);
  });

  it("gestión de usuarios admin sigue funcionando cuando el usuario ES admin en la base", async () => {
    dbStore.byId.set(10, dbUser(10, "admin"));
    const caller = appRouter.createCaller(ctx(`Bearer ${tokens.tokAdmin}`));
    // createUser (admin) pasa la autz y llega al resolver (sin DB real → NO_DB).
    await expect(caller.ingemAuth.createUser({
      name: "N", email: "n@x.com", password: "12345678", role: "viewer", isActive: true,
    })).rejects.toThrow(NO_DB);
    await expect(caller.dataExport.exportAll()).resolves.toBeNull();
  });

  it("sin token → UNAUTHORIZED (no se puede saltar el frontend)", async () => {
    const caller = appRouter.createCaller(ctx());
    await expect(caller.customers.list()).rejects.toThrow(UNAUTHED);
    await expect(caller.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(UNAUTHED);
  });
});

describe("Punto 5 — expiración del token", () => {
  it("TOKEN_EXPIRY está configurado en 24h", () => {
    expect(TOKEN_EXPIRY).toBe("24h");
  });
});
