import { describe, it, expect, beforeEach, afterEach } from "vitest";
// IMPORTANTE: este archivo NO mockea ./db. Importa el módulo REAL para demostrar
// que, incluso sin mocks, ninguna función puede abrir una conexión a producción
// durante los tests. Es la prueba de la propia barrera de aislamiento.
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

// Snapshot/restore de las variables de entorno sensibles.
const OLD = { DATABASE_URL: process.env.DATABASE_URL, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL };
beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
});
afterEach(() => {
  if (OLD.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = OLD.DATABASE_URL;
  if (OLD.TEST_DATABASE_URL === undefined) delete process.env.TEST_DATABASE_URL; else process.env.TEST_DATABASE_URL = OLD.TEST_DATABASE_URL;
});

describe("Barrera de aislamiento — resolveDbUrl()", () => {
  it("A) NODE_ENV=test + DATABASE_URL de 'producción' → se IGNORA (no se conecta)", () => {
    expect(process.env.NODE_ENV).toBe("test");
    process.env.DATABASE_URL = "mysql://prod-user:prod-pass@prod-host:3306/prod";
    // La URL real NO alcanza para resolver una conexión durante los tests.
    expect(resolveDbUrl()).toBeUndefined();
  });

  it("sin TEST_DATABASE_URL → undefined (fail-closed) aunque exista DATABASE_URL", () => {
    process.env.DATABASE_URL = "mysql://prod";
    expect(resolveDbUrl()).toBeUndefined();
  });

  it("TEST_DATABASE_URL explícita y DISTINTA → se permite (sólo esa)", () => {
    process.env.TEST_DATABASE_URL = "mysql://test-only-host/testdb";
    process.env.DATABASE_URL = "mysql://prod";
    expect(resolveDbUrl()).toBe("mysql://test-only-host/testdb");
  });

  it("TEST_DATABASE_URL == DATABASE_URL (real) → error explícito, sin conexión", () => {
    process.env.DATABASE_URL = "mysql://prod";
    process.env.TEST_DATABASE_URL = "mysql://prod";
    expect(() => resolveDbUrl()).toThrow("Real database access is disabled during tests");
  });
});

describe("Barrera de aislamiento — getDb() con el módulo REAL", () => {
  it("B) importar el db real y llamar getDb() → null (no abre conexión)", async () => {
    process.env.DATABASE_URL = "mysql://prod";
    expect(await getDb()).toBeNull();
  });

  it("D) las funciones de LECTURA devuelven vacío seguro (sin DB)", async () => {
    process.env.DATABASE_URL = "mysql://prod";
    expect(await getCustomers()).toEqual([]);
    expect(await getJobs()).toEqual([]);
  });

  it("C/E) las funciones de ESCRITURA fallan cerrado (no escriben nada real)", async () => {
    process.env.DATABASE_URL = "mysql://prod";
    // Aunque un mock parcial dejara estas funciones reales expuestas, en tests
    // no pueden crear usuarios/clientes/jobs/transactions: fallan con NO DB.
    await expect(createIngemUser({ name: "X", email: "leak@x.com", passwordHash: "h", role: "viewer", isActive: true }))
      .rejects.toThrow("DB not available");
    await expect(createCustomer({ firstName: "A", lastName: "B" })).rejects.toThrow("DB not available");
    await expect(createJob({ jobNumber: "J", title: "T" })).rejects.toThrow("DB not available");
    await expect(createTransaction({ type: "income", category: "x", amount: "1", date: "2026-08-10" }))
      .rejects.toThrow("DB not available");
  });
});
