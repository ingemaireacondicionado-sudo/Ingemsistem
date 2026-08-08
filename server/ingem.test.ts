import { describe, expect, it, beforeAll } from "vitest";
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
