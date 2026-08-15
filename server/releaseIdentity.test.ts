import { describe, it, expect, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { RELEASE_IDENTITY } from "./_core/releaseIdentity";

// 8B-5 — IDENTIDAD DE RELEASE AUTORITATIVA en el backend (system.health).
// Verifica que la respuesta la genera el runtime del servidor (constante embebida),
// no version.json ni el frontend, y que no expone secretos.

function ctx(setHeader: (k: string, v: string) => void): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { setHeader } as unknown as TrpcContext["res"],
  };
}

const call = async () => {
  const headers: Record<string, string> = {};
  const caller = appRouter.createCaller(ctx((k, v) => { headers[k] = v; }));
  const res = await caller.system.health({ timestamp: Date.now() });
  return { res, headers };
};

describe("8B-5 — system.health: identidad de release (canónico)", () => {
  it("devuelve EXACTAMENTE releaseRole=8B5_CANONICAL y releaseMarker=INGEM_8B5_CANONICAL_V1", async () => {
    const { res } = await call();
    expect(res.ok).toBe(true);
    expect(res.releaseRole).toBe("8B5_CANONICAL");
    expect(res.releaseMarker).toBe("INGEM_8B5_CANONICAL_V1");
    expect(res.releaseBaseCommit).toBe("092e25f9bfba4a13b2b86031a680943fd50ce97f");
  });

  it("la identidad proviene de la constante EMBEBIDA en el backend (no de un archivo/frontend)", async () => {
    const { res } = await call();
    // Igualdad estricta con la constante importada del módulo del servidor:
    // la fuente es el runtime Node, no version.json ni un asset del cliente.
    expect(res.releaseRole).toBe(RELEASE_IDENTITY.releaseRole);
    expect(res.releaseMarker).toBe(RELEASE_IDENTITY.releaseMarker);
    expect(res.releaseBaseCommit).toBe(RELEASE_IDENTITY.releaseBaseCommit);
  });

  it("no depende de version.json: el valor es el mismo aunque el env GIT_SHA cambie o falte", async () => {
    // La identidad autoritativa NO se deriva del env; sólo gitShaEnv (informativo)
    // lo refleja. Cambiar/limpiar GIT_SHA no altera role/marker/baseCommit.
    const prev = process.env.GIT_SHA;
    try {
      process.env.GIT_SHA = "deadbeefcexpectandnotauthoritative";
      const withEnv = await call();
      expect(withEnv.res.gitShaEnv).toBe("deadbeefcexpectandnotauthoritative");
      expect(withEnv.res.releaseMarker).toBe("INGEM_8B5_CANONICAL_V1"); // inalterado

      delete process.env.GIT_SHA;
      const noEnv = await call();
      expect(noEnv.res.gitShaEnv).toBeNull();
      expect(noEnv.res.releaseMarker).toBe("INGEM_8B5_CANONICAL_V1"); // inalterado
      expect(noEnv.res.releaseRole).toBe("8B5_CANONICAL");
    } finally {
      if (prev === undefined) delete process.env.GIT_SHA; else process.env.GIT_SHA = prev;
    }
  });

  it("fija Cache-Control: no-store (no cachear la identidad de runtime)", async () => {
    const { headers } = await call();
    expect(headers["Cache-Control"]).toBe("no-store");
  });

  it("NO expone secretos (DATABASE_URL, password, token, secret) en la respuesta", async () => {
    const { res } = await call();
    const keys = Object.keys(res);
    expect(keys.sort()).toEqual(["gitShaEnv", "ok", "releaseBaseCommit", "releaseMarker", "releaseRole"]);
    const flat = JSON.stringify(res).toLowerCase();
    for (const secret of ["database_url", "databaseurl", "password", "passwordhash", "token", "secret", "mysql://"]) {
      expect(flat).not.toContain(secret);
    }
  });
});
