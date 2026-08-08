import { describe, expect, it } from "vitest";
import { generateIngemToken, verifyIngemToken, extractTokenFromHeader } from "./ingemAuth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: authHeader ? { authorization: authHeader } : {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("INGEM JWT Auth", () => {
  describe("Token generation and verification", () => {
    it("generates a valid JWT token", async () => {
      const token = await generateIngemToken({
        userId: 1,
        email: "test@ingem.com",
        name: "Test User",
        role: "admin",
      });
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("verifies a valid token and returns payload", async () => {
      const payload = {
        userId: 42,
        email: "maxi@ingem.com",
        name: "Maxi",
        role: "admin",
      };
      const token = await generateIngemToken(payload);
      const decoded = await verifyIngemToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe(42);
      expect(decoded!.email).toBe("maxi@ingem.com");
      expect(decoded!.name).toBe("Maxi");
      expect(decoded!.role).toBe("admin");
    });

    it("returns null for an invalid token", async () => {
      const decoded = await verifyIngemToken("invalid.token.here");
      expect(decoded).toBeNull();
    });

    it("returns null for an empty token", async () => {
      const decoded = await verifyIngemToken("");
      expect(decoded).toBeNull();
    });
  });

  describe("extractTokenFromHeader", () => {
    it("extracts token from Bearer header", () => {
      const token = extractTokenFromHeader("Bearer abc123");
      expect(token).toBe("abc123");
    });

    it("returns raw token if no Bearer prefix", () => {
      const token = extractTokenFromHeader("abc123");
      expect(token).toBe("abc123");
    });

    it("returns null for undefined header", () => {
      const token = extractTokenFromHeader(undefined);
      expect(token).toBeNull();
    });
  });

  describe("Protected endpoints reject unauthenticated requests", () => {
    it("customers.list rejects without token", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.customers.list()).rejects.toThrow(
        "Sesión expirada. Por favor, inicie sesión nuevamente."
      );
    });

    it("jobs.list rejects without token", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.jobs.list()).rejects.toThrow(
        "Sesión expirada. Por favor, inicie sesión nuevamente."
      );
    });

    it("transactions.list rejects without token", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.transactions.list()).rejects.toThrow(
        "Sesión expirada. Por favor, inicie sesión nuevamente."
      );
    });

    it("rejects with invalid token", async () => {
      const ctx = createMockContext("Bearer invalid.token.value");
      const caller = appRouter.createCaller(ctx);

      await expect(caller.customers.list()).rejects.toThrow(
        "Sesión expirada. Por favor, inicie sesión nuevamente."
      );
    });
  });

  describe("Public endpoints work without token", () => {
    it("ingemAuth.login is accessible without token", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Should not throw UNAUTHORIZED - will fail with invalid credentials but not auth error
      const result = await caller.ingemAuth.login({
        email: "nonexistent@test.com",
        password: "wrong",
      });
      expect(result.success).toBe(false);
    });

    it("ingemAuth.getUsers requires authentication", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Should throw UNAUTHORIZED since getUsers is now protected
      await expect(caller.ingemAuth.getUsers()).rejects.toThrow(
        "Sesión expirada. Por favor, inicie sesión nuevamente."
      );
    });
  });

  describe("Admin-only endpoints reject non-admin users", () => {
    it("ingemAuth.createUser rejects non-admin token", async () => {
      // Generate a token for a non-admin user
      const token = await generateIngemToken({
        userId: 2,
        email: "viewer@ingem.com",
        name: "Viewer",
        role: "viewer",
      });
      const ctx = createMockContext(`Bearer ${token}`);
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.ingemAuth.createUser({
          name: "Test",
          email: "test@test.com",
          password: "test123",
          role: "viewer",
          isActive: true,
        })
      ).rejects.toThrow("No tienes permisos de administrador.");
    });
  });
});
