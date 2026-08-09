import { describe, it, expect, beforeAll, vi } from "vitest";

// El backend revalida al usuario contra ingem_users en cada request. Mockeamos
// SOLO getIngemUserById para que cada token resuelva a un usuario activo cuyo
// role en la base coincide con el rol de prueba (token role == db role).
const roleStore = vi.hoisted(() => ({ byId: new Map<number, any>() }));
vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return { ...actual, getIngemUserById: async (id: number) => roleStore.byId.get(id) };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";

// Autorización por rol en el servidor. Sin base de datos:
//  - una acción PERMITIDA pasa la autorización y llega al resolver, que sin DB
//    falla con "DB not available" (o similar). Eso prueba que la autz pasó.
//  - una acción DENEGADA es cortada por el middleware con el mensaje de permisos
//    ANTES de tocar la DB.
//  - las lecturas de lista devuelven [] sin DB (no lanzan).

const FORBIDDEN = "No tenés permisos para realizar esta acción.";
const ADMIN_ONLY = "No tienes permisos de administrador.";
const UNAUTHED = "Sesión expirada. Por favor, inicie sesión nuevamente.";
const NO_DB = "DB not available";

function ctx(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

let tokens: Record<string, string>;

beforeAll(async () => {
  tokens = {
    admin: await generateIngemToken({ userId: 1, email: "admin@ingem.com", name: "Admin", role: "admin" }),
    manager: await generateIngemToken({ userId: 2, email: "manager@ingem.com", name: "Manager", role: "manager" }),
    technician: await generateIngemToken({ userId: 3, email: "tec@ingem.com", name: "Tec", role: "technician" }),
    viewer: await generateIngemToken({ userId: 4, email: "viewer@ingem.com", name: "Viewer", role: "viewer" }),
  };
  // Usuarios activos en la "base": id -> rol actual.
  roleStore.byId.set(1, { id: 1, name: "Admin", email: "admin@ingem.com", role: "admin", isActive: true, allowedModules: null });
  roleStore.byId.set(2, { id: 2, name: "Manager", email: "manager@ingem.com", role: "manager", isActive: true, allowedModules: null });
  roleStore.byId.set(3, { id: 3, name: "Tec", email: "tec@ingem.com", role: "technician", isActive: true, allowedModules: null });
  roleStore.byId.set(4, { id: 4, name: "Viewer", email: "viewer@ingem.com", role: "viewer", isActive: true, allowedModules: null });
});

function caller(role?: keyof typeof tokens) {
  return appRouter.createCaller(ctx(role ? `Bearer ${tokens[role]}` : undefined));
}

// Helpers de aserción
async function allowedWrite(promise: Promise<unknown>) {
  // Pasó la autorización si el fallo es por falta de DB (no por permisos).
  await expect(promise).rejects.toThrow(NO_DB);
}
async function denied(promise: Promise<unknown>) {
  await expect(promise).rejects.toThrow(FORBIDDEN);
}

describe("ADMIN — acceso completo", () => {
  it("puede crear/editar/eliminar en todas las entidades", async () => {
    const c = caller("admin");
    await allowedWrite(c.customers.create({ firstName: "A", lastName: "B" }));
    await allowedWrite(c.customers.update({ id: 1, firstName: "X" }));
    await allowedWrite(c.customers.delete({ id: 1 }));
    await allowedWrite(c.transactions.delete({ id: 1 }));
    await allowedWrite(c.technicians.delete({ id: 1 })); // solo admin
    await allowedWrite(c.jobs.delete({ id: 1 }));
  });
  it("puede exportar el respaldo (admin-only)", async () => {
    await expect(caller("admin").dataExport.exportAll()).resolves.toBeNull(); // null sin DB, pero autorizado
  });
  it("puede crear usuarios (admin-only)", async () => {
    await allowedWrite(caller("admin").ingemAuth.createUser({
      name: "N", email: "n@x.com", password: "12345678", role: "viewer", isActive: true,
    }));
  });
});

describe("MANAGER — permisos de la UI", () => {
  it("puede lo operativo: crear cliente, crear transacción, editar/eliminar trabajo, crear técnico", async () => {
    const c = caller("manager");
    await allowedWrite(c.customers.create({ firstName: "A", lastName: "B" }));
    await allowedWrite(c.transactions.create({ type: "expense", category: "x", amount: "100", date: "2026-08-08" }));
    await allowedWrite(c.jobs.update({ id: 1, title: "t" }));
    await allowedWrite(c.jobs.delete({ id: 1 }));
    await allowedWrite(c.technicians.create({ firstName: "T", lastName: "Z" }));
    await allowedWrite(c.customers.delete({ id: 1 }));
  });
  it("puede registrar cobros (editar jobs + crear transacciones)", async () => {
    // registerPayment permitido: llega al resolver y falla por 'Trabajo no encontrado' (sin DB), no por permisos.
    await expect(caller("manager").jobs.registerPayment({ jobId: 1, amount: "100", date: "2026-08-08" }))
      .rejects.toThrow("Trabajo no encontrado");
  });
  it("NO puede eliminar técnicos (reservado a admin)", async () => {
    await denied(caller("manager").technicians.delete({ id: 1 }));
  });
  it("NO puede exportar respaldo ni crear usuarios (admin-only)", async () => {
    await expect(caller("manager").dataExport.exportAll()).rejects.toThrow(ADMIN_ONLY);
    await expect(caller("manager").ingemAuth.createUser({
      name: "N", email: "n@x.com", password: "12345678", role: "viewer", isActive: true,
    })).rejects.toThrow(ADMIN_ONLY);
  });
});

describe("TECHNICIAN — solo sus acciones", () => {
  it("puede crear notas y editar trabajos", async () => {
    const c = caller("technician");
    await allowedWrite(c.notes.create({ title: "n" }));
    await allowedWrite(c.jobs.update({ id: 1, title: "t" }));
  });
  it("puede leer listas (lectura habilitada para autenticados)", async () => {
    await expect(caller("technician").customers.list()).resolves.toEqual([]);
    await expect(caller("technician").jobs.list()).resolves.toEqual([]);
  });
  it("NO puede editar/eliminar fuera de su alcance", async () => {
    const c = caller("technician");
    await denied(c.notes.update({ id: 1, title: "x" }));      // técnico no edita notas
    await denied(c.notes.delete({ id: 1 }));
    await denied(c.jobs.delete({ id: 1 }));                    // no elimina trabajos
    await denied(c.customers.create({ firstName: "A", lastName: "B" }));
    await denied(c.transactions.create({ type: "income", category: "x", amount: "1", date: "2026-08-08" }));
    await denied(c.appointments.complete({ id: 1, completionNotes: "x", completedBy: "y" }));
  });
  it("NO puede registrar cobros (falta crear transacciones)", async () => {
    await denied(caller("technician").jobs.registerPayment({ jobId: 1, amount: "1", date: "2026-08-08" }));
  });
});

describe("VIEWER — solo lectura", () => {
  it("puede leer listas permitidas", async () => {
    await expect(caller("viewer").customers.list()).resolves.toEqual([]);
    await expect(caller("viewer").products.list()).resolves.toEqual([]);
  });
  it("NO puede crear, editar ni eliminar nada", async () => {
    const c = caller("viewer");
    await denied(c.customers.create({ firstName: "A", lastName: "B" }));
    await denied(c.customers.update({ id: 1, firstName: "X" }));
    await denied(c.customers.delete({ id: 1 }));
    await denied(c.jobs.update({ id: 1, title: "t" }));
    await denied(c.notes.create({ title: "n" }));
    await denied(c.transactions.create({ type: "income", category: "x", amount: "1", date: "2026-08-08" }));
    await denied(c.appointments.create({ title: "t", date: "2026-08-08" }));
  });
});

describe("Llamadas directas SIN token (saltear el frontend)", () => {
  it("rechaza escrituras y lecturas sin autenticación", async () => {
    const c = caller();
    await expect(c.customers.create({ firstName: "A", lastName: "B" })).rejects.toThrow(UNAUTHED);
    await expect(c.customers.delete({ id: 1 })).rejects.toThrow(UNAUTHED);
    await expect(c.jobs.update({ id: 1, title: "t" })).rejects.toThrow(UNAUTHED);
    await expect(c.customers.list()).rejects.toThrow(UNAUTHED);
    await expect(c.dataExport.exportAll()).rejects.toThrow(UNAUTHED);
  });
});
