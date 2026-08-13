import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { hashPassword, verifyPassword, looksLikeBcryptHash } from "./passwordUtils";

// Mock COMPLETO de ./db, en memoria (Maps). NO expone ninguna función real de
// escritura y NO usa ninguna URL de DB. Se prueba el comportamiento REAL del
// ROUTER (hashing al crear/cambiar, migración perezosa en login) contra el
// store. seedIngemUsers se ejercita con su lógica REAL vía inyección (DI) de un
// doble en memoria (sin getDb, sin drizzle, sin conexión).
const store = vi.hoisted(() => ({
  byId: new Map<number, any>(),
  byEmail: new Map<string, any>(),
  nextId: 1,
  seedUsers: [] as any[],
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  const put = (u: any) => { store.byId.set(u.id, u); store.byEmail.set(u.email, u); };
  // Doble drizzle-like SÓLO para seedIngemUsers(DI): select/insert sobre un array.
  const makeBuilder = (rows: any[]): any => ({
    where: () => makeBuilder(rows), limit: (n: number) => makeBuilder(rows.slice(0, n)), orderBy: () => makeBuilder(rows),
    then: (res: any, rej: any) => Promise.resolve(rows.map(r => ({ ...r }))).then(res, rej),
  });
  const seedFakeDb = {
    select: () => ({ from: () => makeBuilder(store.seedUsers) }),
    insert: () => ({ values: (v: any) => {
      for (const it of (Array.isArray(v) ? v : [v])) store.seedUsers.push({ id: store.nextId++, password: null, passwordHash: null, ...it });
      return Promise.resolve([{ insertId: 0 }]);
    } }),
  };
  return {
    getIngemUserByEmail: async (email: string) => store.byEmail.get(email),
    getIngemUserById: async (id: number) => store.byId.get(id),
    createIngemUser: async (data: any) => { const id = store.nextId++; put({ id, password: null, allowedModules: null, ...data }); return { id }; },
    updateIngemUser: async (id: number, data: any) => { const u = store.byId.get(id); if (u) { Object.assign(u, data); store.byEmail.set(u.email, u); } },
    setIngemUserPasswordHash: async (id: number, hash: string) => { const u = store.byId.get(id); if (u) u.passwordHash = hash; },
    // Rate limiting neutralizado (se testea en loginRateLimit.test.ts).
    isLoginBlocked: async () => false,
    recordLoginFailure: async () => {},
    clearLoginRateKey: async () => {},
    cleanupExpiredLoginRateLimits: async () => {},
    // Lógica REAL de seed vía inyección del doble en memoria.
    seedIngemUsers: (c?: any) => actual.seedIngemUsers(c ?? seedFakeDb),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";
import { seedIngemUsers } from "./db";

function ctxWith(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function seedUser(u: Partial<any> & { email: string }) {
  const row = {
    id: store.nextId++, name: u.name ?? "User", email: u.email,
    password: u.password ?? null, passwordHash: u.passwordHash ?? null,
    role: u.role ?? "admin", isActive: u.isActive ?? true, allowedModules: u.allowedModules ?? null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  store.byId.set(row.id, row); store.byEmail.set(row.email, row);
  return row;
}

let adminToken: string;
beforeAll(async () => {
  adminToken = await generateIngemToken({ userId: 1, email: "admin@ingem.com", name: "Admin", role: "admin" });
});
beforeEach(() => { store.byId.clear(); store.byEmail.clear(); store.nextId = 1; store.seedUsers = []; });

describe("passwordUtils", () => {
  it("el hash no es igual a la contraseña original y verifica correctamente", async () => {
    const hash = await hashPassword("secreta123");
    expect(hash).not.toBe("secreta123");
    expect(looksLikeBcryptHash(hash)).toBe(true);
    expect(await verifyPassword("secreta123", hash)).toBe(true);
    expect(await verifyPassword("otra", hash)).toBe(false);
  });
});

describe("login con hash", () => {
  it("login correcto contra passwordHash", async () => {
    const hash = await hashPassword("clave-correcta");
    seedUser({ email: "u1@ingem.com", passwordHash: hash });
    const res = await appRouter.createCaller(ctxWith()).ingemAuth.login({ email: "u1@ingem.com", password: "clave-correcta" });
    expect(res.success).toBe(true);
  });

  it("password incorrecta es rechazada", async () => {
    const hash = await hashPassword("clave-correcta");
    seedUser({ email: "u2@ingem.com", passwordHash: hash });
    const res = await appRouter.createCaller(ctxWith()).ingemAuth.login({ email: "u2@ingem.com", password: "incorrecta" });
    expect(res.success).toBe(false);
  });

  it("usuario con passwordHash vacío migra de forma compatible (login OK + hash generado, password intacta)", async () => {
    const u = seedUser({ email: "legacy@ingem.com", password: "plana", passwordHash: null });
    const res = await appRouter.createCaller(ctxWith()).ingemAuth.login({ email: "legacy@ingem.com", password: "plana" });
    expect(res.success).toBe(true);
    expect(u.passwordHash).toBeTruthy();
    expect(looksLikeBcryptHash(u.passwordHash)).toBe(true);
    expect(u.password).toBe("plana");
    expect(await verifyPassword("plana", u.passwordHash)).toBe(true);
  });

  it("tras migrar, una contraseña incorrecta sigue siendo rechazada", async () => {
    seedUser({ email: "legacy2@ingem.com", password: "plana", passwordHash: null });
    const caller = appRouter.createCaller(ctxWith());
    await caller.ingemAuth.login({ email: "legacy2@ingem.com", password: "plana" });
    const res = await caller.ingemAuth.login({ email: "legacy2@ingem.com", password: "mal" });
    expect(res.success).toBe(false);
  });
});

describe("creación y cambio de contraseña", () => {
  it("nuevo usuario guarda hash (no texto plano) y la respuesta no devuelve la contraseña", async () => {
    seedUser({ email: "admin@ingem.com", role: "admin" }); // id 1, coincide con adminToken
    const res = await appRouter.createCaller(ctxWith(`Bearer ${adminToken}`)).ingemAuth.createUser({
      name: "Nuevo", email: "nuevo@ingem.com", password: "mi-clave", role: "viewer", isActive: true,
    });
    expect(res).toHaveProperty("id");
    expect(res).not.toHaveProperty("password");
    expect(res).not.toHaveProperty("passwordHash");
    const stored = store.byEmail.get("nuevo@ingem.com");
    expect(stored.password).toBeNull();
    expect(looksLikeBcryptHash(stored.passwordHash)).toBe(true);
    expect(stored.passwordHash).not.toBe("mi-clave");
    expect(await verifyPassword("mi-clave", stored.passwordHash)).toBe(true);
  });

  it("cambio de contraseña propio actualiza el hash", async () => {
    const hash = await hashPassword("vieja");
    const u = seedUser({ email: "cambia@ingem.com", passwordHash: hash, role: "manager" });
    const userToken = await generateIngemToken({ userId: u.id, email: "cambia@ingem.com", name: "C", role: "manager" });
    const res = await appRouter.createCaller(ctxWith(`Bearer ${userToken}`)).ingemAuth.updateOwnPassword({ currentPassword: "vieja", newPassword: "nueva-clave" });
    expect(res.success).toBe(true);
    const stored = store.byEmail.get("cambia@ingem.com");
    expect(await verifyPassword("nueva-clave", stored.passwordHash)).toBe(true);
    expect(await verifyPassword("vieja", stored.passwordHash)).toBe(false);
  });

  it("cambio de contraseña con contraseña actual incorrecta es rechazado", async () => {
    const hash = await hashPassword("vieja");
    const u = seedUser({ email: "cambia2@ingem.com", passwordHash: hash, role: "manager" });
    const userToken = await generateIngemToken({ userId: u.id, email: "cambia2@ingem.com", name: "C", role: "manager" });
    const res = await appRouter.createCaller(ctxWith(`Bearer ${userToken}`)).ingemAuth.updateOwnPassword({ currentPassword: "mal", newPassword: "x" });
    expect(res.success).toBe(false);
  });
});

describe("seedIngemUsers — lógica real (nunca guarda texto plano)", () => {
  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    delete process.env.INGEM_SEED_ADMIN_EMAIL;
    delete process.env.INGEM_SEED_ADMIN_PASSWORD;
    delete process.env.INGEM_SEED_ADMIN_NAME;
  });
  afterAll(() => { process.env = { ...OLD_ENV }; });

  it("con credenciales por entorno crea el admin con hash (password null)", async () => {
    process.env.INGEM_SEED_ADMIN_EMAIL = "admin@empresa.com";
    process.env.INGEM_SEED_ADMIN_PASSWORD = "clave-de-entorno";
    await seedIngemUsers();
    const created = store.seedUsers.find(u => u.email === "admin@empresa.com");
    expect(created).toBeTruthy();
    expect(created.password).toBeNull();
    expect(looksLikeBcryptHash(created.passwordHash)).toBe(true);
    expect(created.passwordHash).not.toBe("clave-de-entorno");
    expect(created.role).toBe("admin");
  });

  it("sin variables de entorno NO crea ningún usuario (seed deshabilitado)", async () => {
    await seedIngemUsers();
    expect(store.seedUsers).toHaveLength(0);
  });

  it("no queda ninguna contraseña en texto plano tras el seed", async () => {
    process.env.INGEM_SEED_ADMIN_EMAIL = "admin2@empresa.com";
    process.env.INGEM_SEED_ADMIN_PASSWORD = "otra-clave";
    await seedIngemUsers();
    expect(JSON.stringify(store.seedUsers)).not.toContain("otra-clave");
  });
});
