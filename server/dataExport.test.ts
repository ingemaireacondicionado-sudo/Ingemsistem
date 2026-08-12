import { describe, it, expect, beforeAll, vi } from "vitest";
import {
  customers, suppliers, products, technicians,
  appointments, notes, transactions, jobs, ingemUsers,
} from "../drizzle/schema";

// Filas de prueba para cada tabla. La fila de usuario incluye deliberadamente
// campos sensibles (password/passwordHash/token/secret) para verificar que la
// exportación NUNCA los devuelve.
const rows = vi.hoisted(() => {
  return {
    customersRows: [{ id: 1, firstName: "Cliente", lastName: "Uno" }],
    suppliersRows: [{ id: 1, name: "Proveedor Uno" }],
    productsRows: [{ id: 1, name: "Producto Uno" }],
    techniciansRows: [{ id: 1, firstName: "Tecnico", lastName: "Uno" }],
    appointmentsRows: [{ id: 1, title: "Turno Uno", date: "2026-08-08" }],
    notesRows: [{ id: 1, title: "Nota Uno" }],
    transactionsRows: [{ id: 1, type: "income", amount: "100" }],
    jobsRows: [{ id: 1, jobNumber: "TR-1", title: "Trabajo Uno" }],
    ingemUsersRows: [{
      id: 1, name: "Maxi", email: "maxi@ingem.com", role: "admin",
      isActive: true, allowedModules: null,
      createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
      // Campos sensibles que NO deben exportarse:
      password: "supersecreto-en-claro",
      passwordHash: "$2b$hash-futuro",
      token: "token-secreto",
      secret: "secreto-secreto",
    }],
  };
});

// Mock de drizzle: getDb() en db.ts hace drizzle(process.env.DATABASE_URL).
// Devolvemos un db falso cuyo select().from(tabla) resuelve a las filas de prueba.
vi.mock("drizzle-orm/mysql2", () => {
  const rowsByTable = new Map<unknown, unknown[]>([
    [customers, rows.customersRows],
    [suppliers, rows.suppliersRows],
    [products, rows.productsRows],
    [technicians, rows.techniciansRows],
    [appointments, rows.appointmentsRows],
    [notes, rows.notesRows],
    [transactions, rows.transactionsRows],
    [jobs, rows.jobsRows],
    [ingemUsers, rows.ingemUsersRows],
  ]);
  return {
    drizzle: () => ({
      select: () => ({
        from: (table: unknown) => Promise.resolve(rowsByTable.get(table) ?? []),
      }),
    }),
  };
});

// getDb() usa una URL de test EXPLÍCITA (drizzle está mockeado, no hay conexión
// real). Se usa TEST_DATABASE_URL, no DATABASE_URL: la barrera de aislamiento
// ignora la DATABASE_URL real durante los tests.
process.env.TEST_DATABASE_URL = "mysql://test";

// El backend revalida contra ingem_users: mockeamos getIngemUserById para que
// los tokens resuelvan a usuarios activos con su rol. exportAllData sigue real
// (usa el mock de drizzle de arriba).
vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  const byId = new Map<number, any>([
    [1, { id: 1, name: "Maxi", email: "maxi@ingem.com", role: "admin", isActive: true, allowedModules: null }],
    [2, { id: 2, name: "Viewer", email: "viewer@ingem.com", role: "viewer", isActive: true, allowedModules: null }],
    [3, { id: 3, name: "Tec", email: "tec@ingem.com", role: "technician", isActive: true, allowedModules: null }],
  ]);
  return { ...actual, getIngemUserById: async (id: number) => byId.get(id) };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";
import { exportAllData } from "./db";

function ctxWith(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: authHeader ? { authorization: authHeader } : {},
    } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("dataExport.exportAll — autorización (solo Administrador)", () => {
  let adminToken: string;
  let viewerToken: string;
  let technicianToken: string;

  beforeAll(async () => {
    adminToken = await generateIngemToken({ userId: 1, email: "maxi@ingem.com", name: "Maxi", role: "admin" });
    viewerToken = await generateIngemToken({ userId: 2, email: "viewer@ingem.com", name: "Viewer", role: "viewer" });
    technicianToken = await generateIngemToken({ userId: 3, email: "tec@ingem.com", name: "Tec", role: "technician" });
  });

  it("Administrador PUEDE ejecutar exportAll", async () => {
    const caller = appRouter.createCaller(ctxWith(`Bearer ${adminToken}`));
    const result = await caller.dataExport.exportAll();
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("exportDate");
  });

  it("Visualizador NO puede ejecutar exportAll", async () => {
    const caller = appRouter.createCaller(ctxWith(`Bearer ${viewerToken}`));
    await expect(caller.dataExport.exportAll()).rejects.toThrow("No tienes permisos de administrador.");
  });

  it("Técnico NO puede ejecutar exportAll", async () => {
    const caller = appRouter.createCaller(ctxWith(`Bearer ${technicianToken}`));
    await expect(caller.dataExport.exportAll()).rejects.toThrow("No tienes permisos de administrador.");
  });

  it("Usuario no autenticado NO puede ejecutar exportAll", async () => {
    const caller = appRouter.createCaller(ctxWith());
    await expect(caller.dataExport.exportAll()).rejects.toThrow(
      "Sesión expirada. Por favor, inicie sesión nuevamente."
    );
  });
});

describe("exportAllData — contenido del respaldo", () => {
  it("NO incluye password ni credenciales de los usuarios", async () => {
    const data = await exportAllData();
    expect(data).not.toBeNull();
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("supersecreto-en-claro");
    expect(serialized).not.toContain("$2b$hash-futuro");
    expect(serialized).not.toContain("token-secreto");
    expect(serialized).not.toContain("secreto-secreto");

    const user = data!.ingemUsers[0] as Record<string, unknown>;
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("passwordHash");
    expect(user).not.toHaveProperty("token");
    expect(user).not.toHaveProperty("secret");
  });

  it("SÍ incluye la información administrativa necesaria del usuario", async () => {
    const data = await exportAllData();
    const user = data!.ingemUsers[0] as Record<string, unknown>;
    expect(user.id).toBe(1);
    expect(user.name).toBe("Maxi");
    expect(user.email).toBe("maxi@ingem.com");
    expect(user.role).toBe("admin");
    expect(user.isActive).toBe(true);
    expect(user).toHaveProperty("allowedModules");
  });

  it("SÍ incluye los datos normales del sistema", async () => {
    const data = await exportAllData();
    expect(data!.customers).toHaveLength(1);
    expect(data!.suppliers).toHaveLength(1);
    expect(data!.products).toHaveLength(1);
    expect(data!.technicians).toHaveLength(1);
    expect(data!.appointments).toHaveLength(1);
    expect(data!.notes).toHaveLength(1);
    expect(data!.transactions).toHaveLength(1);
    expect(data!.jobs).toHaveLength(1);
    expect(data!.ingemUsers).toHaveLength(1);
  });
});
