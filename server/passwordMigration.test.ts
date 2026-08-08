import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { ingemUsers } from "../drizzle/schema";
import { hashPassword, verifyPassword, looksLikeBcryptHash } from "./passwordUtils";

// Base de datos en memoria mockeada para ingem_users. Soporta el subconjunto
// de la API de drizzle que usan las funciones de db.ts:
//   db.select().from(ingemUsers)
//   db.insert(ingemUsers).values(v)  -> [{ insertId }]
//   db.update(ingemUsers).set(d).where(pred)
const store = vi.hoisted(() => ({ users: [] as any[], nextId: 1, ingemTable: null as unknown }));

vi.mock("drizzle-orm/mysql2", () => {
  // Query builder encadenable y "thenable": soporta where/limit/orderBy y se
  // puede await directamente. Solo la tabla ingem_users tiene datos.
  const makeBuilder = (rows: any[]): any => ({
    where: (pred: any) => makeBuilder(pred?.__match ? rows.filter(pred.__match) : rows),
    limit: (n: number) => makeBuilder(rows.slice(0, n)),
    orderBy: () => makeBuilder(rows),
    then: (resolve: any, reject: any) =>
      Promise.resolve(rows.map(r => ({ ...r }))).then(resolve, reject),
  });
  const datasetFor = (table: unknown) => (table === store.ingemTable ? store.users : []);
  const fakeDb = {
    select: () => ({ from: (table: unknown) => makeBuilder(datasetFor(table)) }),
    insert: (_t: unknown) => ({
      values: (v: any) => {
        const row = { id: store.nextId++, password: null, passwordHash: null, allowedModules: null, ...v };
        store.users.push(row);
        return Promise.resolve([{ insertId: row.id }]);
      },
    }),
    update: (_t: unknown) => ({
      set: (data: any) => ({
        where: (pred: any) => {
          const target = store.users.find(pred.__match);
          if (target) Object.assign(target, data);
          return Promise.resolve();
        },
      }),
    }),
  };
  return { drizzle: () => fakeDb };
});

// eq() se usa como predicado: construimos un matcher genérico por nombre de
// columna (col.name), para servir tanto eq(id, ...) como eq(email, ...).
vi.mock("drizzle-orm", async (orig) => {
  const actual = await orig<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: (col: any, val: any) => ({ __match: (row: any) => row[col?.name] === val, col, val }),
  };
});

process.env.DATABASE_URL = "mysql://test";
// El dataset del mock reconoce la tabla ingem_users por identidad de referencia.
store.ingemTable = ingemUsers;

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";
import { exportAllData } from "./db";

function ctxWith(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

async function seedUser(u: Partial<any> & { email: string }) {
  store.users.push({
    id: store.nextId++, name: u.name ?? "User", email: u.email,
    password: u.password ?? null, passwordHash: u.passwordHash ?? null,
    role: u.role ?? "admin", isActive: u.isActive ?? true, allowedModules: u.allowedModules ?? null,
    createdAt: new Date(), updatedAt: new Date(),
  });
  return store.users[store.users.length - 1];
}

let adminToken: string;
beforeAll(async () => {
  adminToken = await generateIngemToken({ userId: 1, email: "admin@ingem.com", name: "Admin", role: "admin" });
});
beforeEach(() => { store.users = []; store.nextId = 1; });

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
    await seedUser({ email: "u1@ingem.com", passwordHash: hash });
    const caller = appRouter.createCaller(ctxWith());
    const res = await caller.ingemAuth.login({ email: "u1@ingem.com", password: "clave-correcta" });
    expect(res.success).toBe(true);
  });

  it("password incorrecta es rechazada", async () => {
    const hash = await hashPassword("clave-correcta");
    await seedUser({ email: "u2@ingem.com", passwordHash: hash });
    const caller = appRouter.createCaller(ctxWith());
    const res = await caller.ingemAuth.login({ email: "u2@ingem.com", password: "incorrecta" });
    expect(res.success).toBe(false);
  });

  it("usuario con passwordHash vacío migra de forma compatible (login OK + hash generado, password intacta)", async () => {
    const u = await seedUser({ email: "legacy@ingem.com", password: "plana", passwordHash: null });
    const caller = appRouter.createCaller(ctxWith());
    const res = await caller.ingemAuth.login({ email: "legacy@ingem.com", password: "plana" });
    expect(res.success).toBe(true);
    // Tras el login, se generó el hash y la contraseña en claro NO cambió.
    expect(u.passwordHash).toBeTruthy();
    expect(looksLikeBcryptHash(u.passwordHash)).toBe(true);
    expect(u.password).toBe("plana");
    // Y ahora valida contra el hash recién creado.
    expect(await verifyPassword("plana", u.passwordHash)).toBe(true);
  });

  it("tras migrar, una contraseña incorrecta sigue siendo rechazada", async () => {
    await seedUser({ email: "legacy2@ingem.com", password: "plana", passwordHash: null });
    const caller = appRouter.createCaller(ctxWith());
    await caller.ingemAuth.login({ email: "legacy2@ingem.com", password: "plana" }); // migra
    const res = await caller.ingemAuth.login({ email: "legacy2@ingem.com", password: "mal" });
    expect(res.success).toBe(false);
  });
});

describe("creación y cambio de contraseña", () => {
  it("nuevo usuario guarda hash (no texto plano) y la respuesta no devuelve la contraseña", async () => {
    const caller = appRouter.createCaller(ctxWith(`Bearer ${adminToken}`));
    const res = await caller.ingemAuth.createUser({
      name: "Nuevo", email: "nuevo@ingem.com", password: "mi-clave",
      role: "viewer", isActive: true,
    });
    expect(res).toHaveProperty("id");
    expect(res).not.toHaveProperty("password");
    expect(res).not.toHaveProperty("passwordHash");
    const stored = store.users.find(u => u.email === "nuevo@ingem.com");
    expect(stored.password).toBeNull();
    expect(looksLikeBcryptHash(stored.passwordHash)).toBe(true);
    expect(stored.passwordHash).not.toBe("mi-clave");
    expect(await verifyPassword("mi-clave", stored.passwordHash)).toBe(true);
  });

  it("cambio de contraseña propio actualiza el hash", async () => {
    const hash = await hashPassword("vieja");
    await seedUser({ email: "cambia@ingem.com", passwordHash: hash, role: "manager" });
    const userToken = await generateIngemToken({ userId: 99, email: "cambia@ingem.com", name: "C", role: "manager" });
    const caller = appRouter.createCaller(ctxWith(`Bearer ${userToken}`));
    const res = await caller.ingemAuth.updateOwnPassword({ currentPassword: "vieja", newPassword: "nueva-clave" });
    expect(res.success).toBe(true);
    const stored = store.users.find(u => u.email === "cambia@ingem.com");
    expect(await verifyPassword("nueva-clave", stored.passwordHash)).toBe(true);
    expect(await verifyPassword("vieja", stored.passwordHash)).toBe(false);
  });

  it("cambio de contraseña con contraseña actual incorrecta es rechazado", async () => {
    const hash = await hashPassword("vieja");
    await seedUser({ email: "cambia2@ingem.com", passwordHash: hash, role: "manager" });
    const userToken = await generateIngemToken({ userId: 98, email: "cambia2@ingem.com", name: "C", role: "manager" });
    const caller = appRouter.createCaller(ctxWith(`Bearer ${userToken}`));
    const res = await caller.ingemAuth.updateOwnPassword({ currentPassword: "mal", newPassword: "x" });
    expect(res.success).toBe(false);
  });
});

describe("respaldo no incluye credenciales", () => {
  it("exportAllData no incluye password ni passwordHash", async () => {
    const hash = await hashPassword("algo");
    await seedUser({ email: "exp@ingem.com", password: "plana", passwordHash: hash });
    const data = await exportAllData();
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain("plana");
    expect(serialized).not.toContain(hash);
    const user = (data!.ingemUsers[0] ?? {}) as Record<string, unknown>;
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("passwordHash");
  });
});
