import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

// ===== Emulación en memoria de la capa de rate limiting de db.ts =====
// Reproduce la semántica de las funciones SQL (atómicas, con ventana/bloqueo)
// SIN tocar ninguna base real. recordLoginFailure se serializa con una cadena de
// promesas para emular el SELECT ... FOR UPDATE (sin updates perdidos).
const rateStore = vi.hoisted(() => ({
  map: new Map<string, { attempts: number; windowStart: number; blockedUntil: number | null }>(),
  chain: Promise.resolve(),
  // Flags para forzar errores de DB y verificar el comportamiento fail-open.
  fail: { block: false, record: false, clear: false },
}));
// Usuarios "en la base" para el login (con passwordHash).
const userStore = vi.hoisted(() => ({ byEmail: new Map<string, any>() }));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserByEmail: async (email: string) => userStore.byEmail.get(email.trim().toLowerCase()),
    setIngemUserPasswordHash: async () => {},
    isLoginBlocked: async (keys: string[]) => {
      if (rateStore.fail.block) throw new Error("DB error (isLoginBlocked)");
      const now = Date.now();
      return keys.some((k) => {
        const r = rateStore.map.get(k);
        return !!r && r.blockedUntil != null && r.blockedUntil > now;
      });
    },
    recordLoginFailure: async (key: string, windowMs: number, max: number, blockMs: number) => {
      if (rateStore.fail.record) throw new Error("DB error (recordLoginFailure)");
      rateStore.chain = rateStore.chain.then(() => {
        const now = Date.now();
        const r = rateStore.map.get(key) ?? { attempts: 0, windowStart: now, blockedUntil: null };
        const expired = r.windowStart < now - windowMs;
        const attempts = expired ? 1 : r.attempts + 1;
        const windowStart = expired ? now : r.windowStart;
        const blockedUntil = attempts >= max ? now + blockMs : expired ? null : r.blockedUntil;
        rateStore.map.set(key, { attempts, windowStart, blockedUntil });
      });
      await rateStore.chain;
    },
    clearLoginRateKey: async (key: string) => {
      if (rateStore.fail.clear) throw new Error("DB error (clearLoginRateKey)");
      rateStore.map.delete(key);
    },
    cleanupExpiredLoginRateLimits: async () => {},
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { hashPassword } from "./passwordUtils";
import {
  ipRateKey, ipEmailRateKey, registerFailedLogin,
  IP_MAX_ATTEMPTS, IP_EMAIL_MAX_ATTEMPTS, RATE_LIMIT_MESSAGE,
} from "./rateLimit";

function ctx(ip: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", ip, headers: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}
const call = (ip: string) => appRouter.createCaller(ctx(ip));

let goodHash: string;
beforeAll(async () => { goodHash = await hashPassword("correcta"); });
beforeEach(() => {
  rateStore.map.clear();
  rateStore.chain = Promise.resolve();
  rateStore.fail = { block: false, record: false, clear: false };
  userStore.byEmail.clear();
  userStore.byEmail.set("real@ingem.com", {
    id: 1, name: "Real", email: "real@ingem.com", role: "admin",
    isActive: true, password: null, passwordHash: goodHash, allowedModules: null,
  });
});
afterEach(() => { vi.useRealTimers(); });

describe("Punto 6 — rate limiting de login (TiDB compartido)", () => {
  it("login válido funciona (no bloqueado)", async () => {
    const res = await call("1.1.1.1").ingemAuth.login({ email: "real@ingem.com", password: "correcta" });
    expect(res.success).toBe(true);
  });

  it("credenciales incorrectas incrementan el contador IP+email", async () => {
    const res = await call("1.1.1.2").ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    expect(res.success).toBe(false);
    const r = rateStore.map.get(ipEmailRateKey("1.1.1.2", "real@ingem.com"));
    expect(r?.attempts).toBe(1);
  });

  it("5 fallos IP+email bloquean (429 genérico)", async () => {
    const ip = "1.1.1.3";
    for (let i = 0; i < IP_EMAIL_MAX_ATTEMPTS; i++) {
      await call(ip).ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    }
    // Incluso con la contraseña correcta, ahora está bloqueado.
    await expect(call(ip).ingemAuth.login({ email: "real@ingem.com", password: "correcta" }))
      .rejects.toThrow(RATE_LIMIT_MESSAGE);
  });

  it("10 fallos de la misma IP bloquean (con emails distintos, sin tocar el límite IP+email)", async () => {
    const ip = "1.1.1.4";
    for (let i = 0; i < IP_MAX_ATTEMPTS; i++) {
      await call(ip).ingemAuth.login({ email: `noexiste${i}@x.com`, password: "mal" });
    }
    // La IP quedó bloqueada; un email nuevo desde esa IP también se corta.
    await expect(call(ip).ingemAuth.login({ email: "otro@x.com", password: "mal" }))
      .rejects.toThrow(RATE_LIMIT_MESSAGE);
  });

  it("otro email desde la misma IP respeta el límite por IP", async () => {
    const ip = "1.1.1.5";
    for (let i = 0; i < IP_MAX_ATTEMPTS; i++) {
      await call(ip).ingemAuth.login({ email: `a${i}@x.com`, password: "mal" });
    }
    await expect(call(ip).ingemAuth.login({ email: "real@ingem.com", password: "correcta" }))
      .rejects.toThrow(RATE_LIMIT_MESSAGE);
  });

  it("el mismo email desde OTRA IP no queda bloqueado por el límite IP+email", async () => {
    for (let i = 0; i < IP_EMAIL_MAX_ATTEMPTS; i++) {
      await call("1.1.1.6").ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    }
    // Otra IP, mismo email: no está bloqueada y el login correcto funciona.
    const res = await call("9.9.9.9").ingemAuth.login({ email: "real@ingem.com", password: "correcta" });
    expect(res.success).toBe(true);
  });

  it("después de 15 minutos vuelve a permitir intentos", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T10:00:00Z"));
    const ip = "1.1.1.7";
    for (let i = 0; i < IP_EMAIL_MAX_ATTEMPTS; i++) {
      await registerFailedLogin(ip, "real@ingem.com");
    }
    const key = ipEmailRateKey(ip, "real@ingem.com");
    expect(rateStore.map.get(key)!.blockedUntil).toBeGreaterThan(Date.now());
    // Avanzar 16 minutos: el bloqueo venció.
    vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
    const r = rateStore.map.get(key)!;
    expect(r.blockedUntil! <= Date.now()).toBe(true);
  });

  it("login exitoso resetea el contador IP+email", async () => {
    const ip = "1.1.1.8";
    await call(ip).ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    expect(rateStore.map.has(ipEmailRateKey(ip, "real@ingem.com"))).toBe(true);
    await call(ip).ingemAuth.login({ email: "real@ingem.com", password: "correcta" });
    expect(rateStore.map.has(ipEmailRateKey(ip, "real@ingem.com"))).toBe(false);
  });

  it("respuesta genérica para email existente e inexistente (no enumeración)", async () => {
    const r1 = await call("2.0.0.1").ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    const r2 = await call("2.0.0.2").ingemAuth.login({ email: "nadie@ingem.com", password: "mal" });
    expect(r1).toEqual({ success: false, error: "Credenciales inválidas" });
    expect(r2).toEqual({ success: false, error: "Credenciales inválidas" });
  });

  it("ninguna contraseña aparece en logs ni en la tabla de rate limiting", async () => {
    const spies = [
      vi.spyOn(console, "log").mockImplementation(() => {}),
      vi.spyOn(console, "warn").mockImplementation(() => {}),
      vi.spyOn(console, "error").mockImplementation(() => {}),
    ];
    await call("3.0.0.1").ingemAuth.login({ email: "real@ingem.com", password: "secreta-xyz" });
    for (const s of spies) {
      for (const c of s.mock.calls) {
        expect(JSON.stringify(c)).not.toContain("secreta-xyz");
      }
    }
    // La tabla solo guarda attempts/windowStart/blockedUntil; nunca la contraseña.
    for (const v of rateStore.map.values()) {
      expect(JSON.stringify(v)).not.toContain("secreta-xyz");
      expect(Object.keys(v).sort()).toEqual(["attempts", "blockedUntil", "windowStart"]);
    }
    spies.forEach((s) => s.mockRestore());
  });

  it("la clave (rateKey) es un hash: no contiene la IP ni el email en claro", () => {
    const k1 = ipRateKey("200.100.50.25");
    const k2 = ipEmailRateKey("200.100.50.25", "Persona@Ingem.com");
    expect(k1).not.toContain("200.100.50.25");
    expect(k2).not.toContain("200.100.50.25");
    expect(k2.toLowerCase()).not.toContain("persona@ingem.com");
    expect(k1).toMatch(/^[a-f0-9]{64}$/); // HMAC-SHA256 hex
    // Determinístico y sensible a la normalización del email.
    expect(ipEmailRateKey("1.2.3.4", "A@B.com")).toBe(ipEmailRateKey("1.2.3.4", "a@b.com"));
  });

  it("FAIL-OPEN: si falla la consulta de bloqueo, el login sigue verificando la contraseña", async () => {
    rateStore.fail.block = true;
    // Contraseña correcta → entra igual (el error del limitador no bloquea).
    const ok = await call("5.0.0.1").ingemAuth.login({ email: "real@ingem.com", password: "correcta" });
    expect(ok.success).toBe(true);
    // Contraseña incorrecta → rechazo normal (no bypass, no error inesperado).
    const bad = await call("5.0.0.1").ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    expect(bad).toEqual({ success: false, error: "Credenciales inválidas" });
  });

  it("FAIL-OPEN: si falla el registro del fallo, el login responde normalmente", async () => {
    rateStore.fail.record = true;
    const bad = await call("5.0.0.2").ingemAuth.login({ email: "real@ingem.com", password: "mal" });
    expect(bad).toEqual({ success: false, error: "Credenciales inválidas" });
  });

  it("FAIL-OPEN: si falla la limpieza tras un login correcto, el usuario igual entra", async () => {
    rateStore.fail.clear = true;
    const ok = await call("5.0.0.3").ingemAuth.login({ email: "real@ingem.com", password: "correcta" });
    expect(ok.success).toBe(true);
  });

  it("concurrencia: ráfaga de fallos no pierde incrementos y termina bloqueando", async () => {
    const ip = "4.0.0.1";
    const N = 20;
    await Promise.all(Array.from({ length: N }, () => registerFailedLogin(ip, "real@ingem.com")));
    const ipEmail = rateStore.map.get(ipEmailRateKey(ip, "real@ingem.com"))!;
    const ipOnly = rateStore.map.get(ipRateKey(ip))!;
    // Todos los intentos concurrentes se contaron (sin updates perdidos).
    expect(ipEmail.attempts).toBe(N);
    expect(ipOnly.attempts).toBe(N);
    // Y quedó bloqueado (superó ambos umbrales).
    expect(ipEmail.blockedUntil).toBeGreaterThan(Date.now());
    expect(ipOnly.blockedUntil).toBeGreaterThan(Date.now());
  });
});
