import { describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";

// El backend revalida contra ingem_users; el test admin-only usa un token de
// viewer (id 2) que debe resolver a un viewer activo en la "base".
vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  const byId = new Map<number, any>([
    [1, { id: 1, name: "Admin", email: "admin@ingem.com", role: "admin", isActive: true, allowedModules: null }],
    [2, { id: 2, name: "Viewer", email: "viewer@ingem.com", role: "viewer", isActive: true, allowedModules: null }],
  ]);
  return { ...actual, getIngemUserById: async (id: number) => byId.get(id) };
});

import { generateIngemToken, verifyIngemToken, extractTokenFromHeader, assertJwtSecret } from "./ingemAuth";
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

  describe("JWT_SECRET obligatorio (sin fallback)", () => {
    it("con un secreto válido, firma y verificación funcionan", async () => {
      // El entorno de test provee JWT_SECRET; el flujo completo debe operar.
      const token = await generateIngemToken({ userId: 7, email: "a@b.com", name: "A", role: "admin" });
      const decoded = await verifyIngemToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded!.userId).toBe(7);
    });

    it("assertJwtSecret falla de forma segura si el secreto está vacío o ausente", () => {
      expect(() => assertJwtSecret(undefined)).toThrow("JWT_SECRET is required");
      expect(() => assertJwtSecret(null)).toThrow("JWT_SECRET is required");
      expect(() => assertJwtSecret("")).toThrow("JWT_SECRET is required");
      expect(() => assertJwtSecret("   ")).toThrow("JWT_SECRET is required");
    });

    it("assertJwtSecret acepta un secreto no vacío", () => {
      expect(() => assertJwtSecret("un-secreto-cualquiera")).not.toThrow();
    });

    it("el mensaje de error NO revela el valor del secreto", () => {
      try {
        assertJwtSecret("");
      } catch (e) {
        expect((e as Error).message).toBe("JWT_SECRET is required");
      }
    });

    it("un token firmado con el viejo fallback eliminado NO verifica", async () => {
      // Prueba explícita de que el fallback 'ingem-fallback-secret-key-2024' ya no sirve.
      const fallbackKey = new TextEncoder().encode("ingem-fallback-secret-key-2024");
      const forged = await new SignJWT({ userId: 1, email: "x@y.com", name: "X", role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(fallbackKey);
      const decoded = await verifyIngemToken(forged);
      expect(decoded).toBeNull();
    });

    it("un token firmado con un secreto incorrecto NO verifica", async () => {
      const wrongKey = new TextEncoder().encode("otro-secreto-distinto");
      const forged = await new SignJWT({ userId: 2, email: "z@z.com", name: "Z", role: "admin" })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("7d")
        .sign(wrongKey);
      const decoded = await verifyIngemToken(forged);
      expect(decoded).toBeNull();
    });
  });
});
