import { describe, expect, it, beforeAll, vi } from "vitest";
import { hashPassword } from "./passwordUtils";

// Mock COMPLETO de ./db en memoria (sin funciones reales de escritura, sin URL,
// sin leer de producción). El login se valida contra un hash sembrado en el
// store, NO contra la base real.
const store = vi.hoisted(() => ({ users: new Map<number, any>(), customers: [] as any[], nextCustomerId: 1 }));
vi.mock("./db", () => ({
  getIngemUserById: async (id: number) => store.users.get(id),
  getIngemUserByEmail: async (email: string) => [...store.users.values()].find(u => u.email === email),
  getIngemUsers: async () => [...store.users.values()],
  setIngemUserPasswordHash: async (id: number, h: string) => { const u = store.users.get(id); if (u) u.passwordHash = h; },
  isLoginBlocked: async () => false,
  recordLoginFailure: async () => {},
  clearLoginRateKey: async () => {},
  cleanupExpiredLoginRateLimits: async () => {},
  createCustomer: async (data: any) => { const id = store.nextCustomerId++; store.customers.push({ id, ...data }); return { id }; },
  getCustomers: async () => store.customers.map(c => ({ ...c })),
  exportAllData: async () => ({
    exportDate: new Date().toISOString(),
    customers: [], suppliers: [], products: [], technicians: [],
    appointments: [], notes: [], transactions: [], jobs: [], ingemUsers: [],
  }),
}));
vi.mock("./notifications", () => ({
  notifyCustomerCreated: async () => {}, notifyJobCreated: async () => {},
  notifyJobStatusChanged: async () => {}, notifyAppointmentCreated: async () => {},
  notifyAppointmentStatusChanged: async () => {}, notifyUrgentNote: async () => {},
}));

import { appRouter } from "./routers";
import { generateIngemToken } from "./ingemAuth";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

let adminToken: string;

beforeAll(async () => {
  adminToken = await generateIngemToken({
    userId: 1,
    email: "maxi@ingem.com",
    name: "Maxi",
    role: "admin",
  });
  // Usuarios sembrados en el store en memoria (login se valida contra estos hashes).
  store.users.set(1, { id: 1, name: "Maxi", email: "maxi@ingem.com", role: "admin", isActive: true, allowedModules: null, password: null, passwordHash: await hashPassword("Sara2024") });
  store.users.set(2, { id: 2, name: "Viewer", email: "viewer@ingem.com", role: "viewer", isActive: true, allowedModules: null, password: null, passwordHash: await hashPassword("otra-clave") });
});

function createAuthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { authorization: `Bearer ${adminToken}` },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("INGEM Auth", () => {
  it("login returns user data for valid credentials", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.ingemAuth.login({
      email: "maxi@ingem.com",
      password: "Sara2024",
    });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    if (result.success && "user" in result) {
      expect(result.user.name).toBe("Maxi");
      expect(result.user.email).toBe("maxi@ingem.com");
      expect(result.user.role).toBe("admin");
      // Verify token is returned
      expect("token" in result).toBe(true);
      expect(typeof result.token).toBe("string");
    }
  });

  it("login returns error for invalid credentials", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.ingemAuth.login({
      email: "maxi@ingem.com",
      password: "wrongpassword",
    });
    expect(result.success).toBe(false);
  });

  it("getUsers requires authentication", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.ingemAuth.getUsers()).rejects.toThrow(
      "Sesión expirada. Por favor, inicie sesión nuevamente."
    );
  });

  it("getUsers returns all INGEM users when authenticated", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const users = await caller.ingemAuth.getUsers();
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBeGreaterThanOrEqual(2);
    const maxi = users.find((u: any) => u.email === "maxi@ingem.com");
    expect(maxi).toBeDefined();
    expect(maxi?.name).toBe("Maxi");
  });
});

describe("Customers CRUD (authenticated)", () => {
  it("list returns an array of customers", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const customers = await caller.customers.list();
    expect(Array.isArray(customers)).toBe(true);
  });

  it("create adds a new customer and returns the id", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.customers.create({
      firstName: "Test",
      lastName: "Customer",
      email: "test@test.com",
      phone: "+54 11 1234 5678",
      company: "Test Corp",
      customerType: "company",
      status: "prospect",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });
});

describe("Data Export (authenticated)", () => {
  it("exportAll returns all data tables", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const data = await caller.dataExport.exportAll();
    expect(data).toBeDefined();
    expect(data).toHaveProperty("exportDate");
    expect(data).toHaveProperty("customers");
    expect(data).toHaveProperty("suppliers");
    expect(data).toHaveProperty("products");
    expect(data).toHaveProperty("technicians");
    expect(data).toHaveProperty("appointments");
    expect(data).toHaveProperty("notes");
    expect(data).toHaveProperty("transactions");
    expect(data).toHaveProperty("jobs");
    expect(data).toHaveProperty("ingemUsers");
    expect(Array.isArray(data!.customers)).toBe(true);
  });
});
