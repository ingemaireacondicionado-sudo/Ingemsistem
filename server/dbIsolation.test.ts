import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Spy del CONSTRUCTOR del driver (drizzle/mysql2): demuestra que NINGÚN test
// intenta abrir una conexión de red. Si getDb() estuviera mal, este spy se
// llamaría. Con la barrera fail-closed, nunca se invoca. (vi.hoisted para que el
// spy exista cuando vi.mock se eleva al tope del módulo.)
const { drizzleSpy } = vi.hoisted(() => ({ drizzleSpy: vi.fn(() => ({ __fakeConnection: true })) }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: drizzleSpy }));

// IMPORTANTE: este archivo NO mockea ./db. Importa el módulo REAL para demostrar
// que, incluso sin mocks, ninguna función puede abrir una conexión a producción
// durante los tests.
import {
  resolveDbUrl,
  getDb,
  createIngemUser,
  createCustomer,
  createJob,
  createTransaction,
  getCustomers,
  getJobs,
} from "./db";

const PROD = "mysql://prod-user:prod-pass@prod-host:3306/prod"; // URL ficticia de "producción"
const OLD = { d: process.env.DATABASE_URL, t: process.env.TEST_DATABASE_URL };

beforeEach(() => {
  drizzleSpy.mockClear();
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
});
afterEach(() => {
  if (OLD.d === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = OLD.d;
  if (OLD.t === undefined) delete process.env.TEST_DATABASE_URL; else process.env.TEST_DATABASE_URL = OLD.t;
});

describe("Barrera de aislamiento — resolveDbUrl() / getDb() en Vitest", () => {
  it("estamos en runtime de test", () => {
    expect(process.env.NODE_ENV).toBe("test");
  });

  it("A) DATABASE_URL de 'producción' → resolveDbUrl undefined y getDb null", async () => {
    process.env.DATABASE_URL = PROD;
    expect(resolveDbUrl()).toBeUndefined();
    expect(await getDb()).toBeNull();
  });

  it("B) TEST_DATABASE_URL de 'producción' → TAMBIÉN undefined / null (no la usa)", async () => {
    process.env.TEST_DATABASE_URL = PROD;
    expect(resolveDbUrl()).toBeUndefined();
    expect(await getDb()).toBeNull();
  });

  it("C) ambas definidas → undefined / null", async () => {
    process.env.DATABASE_URL = PROD;
    process.env.TEST_DATABASE_URL = PROD;
    expect(resolveDbUrl()).toBeUndefined();
    expect(await getDb()).toBeNull();
  });

  it("D) importar el db real y llamar getDb() → no abre conexión", async () => {
    process.env.DATABASE_URL = PROD;
    expect(await getDb()).toBeNull();
  });

  it("E) funciones reales de ESCRITURA fallan cerrado ANTES de conectar", async () => {
    process.env.DATABASE_URL = PROD;
    process.env.TEST_DATABASE_URL = PROD;
    await expect(createIngemUser({ name: "X", email: "leak@x.com", passwordHash: "h", role: "viewer", isActive: true }))
      .rejects.toThrow("DB not available");
    await expect(createCustomer({ firstName: "A", lastName: "B" })).rejects.toThrow("DB not available");
    await expect(createJob({ jobNumber: "J", title: "T" })).rejects.toThrow("DB not available");
    await expect(createTransaction({ type: "income", category: "x", amount: "1", date: "2026-08-10" }))
      .rejects.toThrow("DB not available");
    // Lecturas: vacío seguro (sin DB).
    expect(await getCustomers()).toEqual([]);
    expect(await getJobs()).toEqual([]);
  });

  it("F) el constructor del driver mysql/drizzle NUNCA fue invocado (cero conexión de red)", async () => {
    process.env.DATABASE_URL = PROD;
    process.env.TEST_DATABASE_URL = PROD;
    await getDb();
    await getCustomers();
    await createCustomer({ firstName: "A", lastName: "B" }).catch(() => {});
    expect(drizzleSpy).not.toHaveBeenCalled();
  });
});
