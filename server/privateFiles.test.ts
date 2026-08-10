import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// El backend revalida al usuario contra ingem_users en cada request. Mockeamos
// getIngemUserById para resolver la sesión, y las funciones de private_files
// contra un store en memoria (no se toca ninguna base real).
const store = vi.hoisted(() => ({
  users: new Map<number, any>(),
  files: new Map<number, any>(),
  nextId: 1,
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserById: async (id: number) => store.users.get(id) ?? null,
    insertPrivateFile: async (data: any) => {
      const id = store.nextId++;
      store.files.set(id, { id, createdAt: new Date(), ...data });
      return { id };
    },
    getPrivateFileById: async (id: number) => store.files.get(id) ?? null,
    getPrivateFileMetaById: async (id: number) => {
      const f = store.files.get(id);
      if (!f) return null;
      const { data, ...meta } = f;
      return meta;
    },
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";

// ===== Muestras con magic bytes reales =====
function pdfBuf(size = 64): Buffer {
  const b = Buffer.alloc(size, 0x20);
  Buffer.from("%PDF-1.4\n").copy(b, 0);
  return b;
}
function exeBuf(): Buffer {
  return Buffer.from("MZ\x90\x00ejecutable");
}
const b64 = (buf: Buffer) => buf.toString("base64");

function ctx(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const FORBIDDEN_UPLOAD = "No tenés permisos para subir este archivo.";
const FORBIDDEN_DOWNLOAD = "No tenés permisos para ver este archivo.";
const NOT_FOUND = "Archivo no encontrado.";
const UNAUTHED = "Sesión expirada. Por favor, inicie sesión nuevamente.";

let tokens: Record<string, string>;

beforeAll(async () => {
  tokens = {
    admin: await generateIngemToken({ userId: 1, email: "admin@ingem.com", name: "Admin", role: "admin" }),
    manager: await generateIngemToken({ userId: 2, email: "manager@ingem.com", name: "Manager", role: "manager" }),
    technician: await generateIngemToken({ userId: 3, email: "tec@ingem.com", name: "Tec", role: "technician" }),
    viewer: await generateIngemToken({ userId: 4, email: "viewer@ingem.com", name: "Viewer", role: "viewer" }),
    viewerJobs: await generateIngemToken({ userId: 5, email: "vj@ingem.com", name: "VJobs", role: "viewer" }),
  };
});

beforeEach(() => {
  store.users.clear();
  store.files.clear();
  store.nextId = 1;
  store.users.set(1, { id: 1, name: "Admin", email: "admin@ingem.com", role: "admin", isActive: true, allowedModules: null });
  store.users.set(2, { id: 2, name: "Manager", email: "manager@ingem.com", role: "manager", isActive: true, allowedModules: null });
  store.users.set(3, { id: 3, name: "Tec", email: "tec@ingem.com", role: "technician", isActive: true, allowedModules: null });
  store.users.set(4, { id: 4, name: "Viewer", email: "viewer@ingem.com", role: "viewer", isActive: true, allowedModules: null });
  // Viewer con módulo 'jobs' asignado explícitamente (override allowedModules).
  store.users.set(5, { id: 5, name: "VJobs", email: "vj@ingem.com", role: "viewer", isActive: true, allowedModules: JSON.stringify(["dashboard", "jobs"]) });
});

function caller(role?: keyof typeof tokens) {
  return appRouter.createCaller(ctx(role ? `Bearer ${tokens[role]}` : undefined));
}

describe("privateFiles.upload — permisos por categoría", () => {
  it("manager puede subir OC/factura y se guarda el MIME detectado + nombre seguro", async () => {
    const res = await caller("manager").privateFiles.upload({
      fileName: "factura.pdf.exe", fileData: b64(pdfBuf()), category: "invoice", entityType: "job", entityId: 7,
    });
    expect(res.privateFileId).toBeGreaterThan(0);
    const stored = store.files.get(res.privateFileId);
    expect(stored.mimeType).toBe("application/pdf"); // detectado, no el del cliente
    expect(stored.originalName).toBe("factura.pdf");   // extensión real, sin doble extensión
    expect(stored.category).toBe("invoice");
    expect(stored.entityType).toBe("job");
    expect(stored.entityId).toBe(7);
    expect(stored.createdBy).toBe(2);
    expect(Buffer.isBuffer(stored.data)).toBe(true);
  });

  it("technician puede subir OC (edita jobs) pero NO documento de técnico", async () => {
    await expect(caller("technician").privateFiles.upload({
      fileName: "oc.pdf", fileData: b64(pdfBuf()), category: "purchase_order",
    })).resolves.toHaveProperty("privateFileId");
    await expect(caller("technician").privateFiles.upload({
      fileName: "doc.pdf", fileData: b64(pdfBuf()), category: "technician_document",
    })).rejects.toThrow(FORBIDDEN_UPLOAD);
  });

  it("manager puede subir documento de técnico (edita technicians)", async () => {
    await expect(caller("manager").privateFiles.upload({
      fileName: "doc.pdf", fileData: b64(pdfBuf()), category: "technician_document",
    })).resolves.toHaveProperty("privateFileId");
  });

  it("viewer NO puede subir nada (no tiene canEdit)", async () => {
    await expect(caller("viewer").privateFiles.upload({
      fileName: "oc.pdf", fileData: b64(pdfBuf()), category: "purchase_order",
    })).rejects.toThrow(FORBIDDEN_UPLOAD);
  });

  it("rechaza contenido no permitido (exe disfrazado de pdf)", async () => {
    await expect(caller("manager").privateFiles.upload({
      fileName: "factura.pdf", fileData: b64(exeBuf()), category: "invoice",
    })).rejects.toThrow(/no permitido/i);
  });

  it("sin token no se puede subir", async () => {
    await expect(caller().privateFiles.upload({
      fileName: "oc.pdf", fileData: b64(pdfBuf()), category: "purchase_order",
    })).rejects.toThrow(UNAUTHED);
  });
});

describe("privateFiles.download — permisos por categoría y contenido", () => {
  async function seedOc() {
    const { privateFileId } = await caller("manager").privateFiles.upload({
      fileName: "oc.pdf", fileData: b64(pdfBuf()), category: "purchase_order", entityType: "job", entityId: 1,
    });
    return privateFileId;
  }
  async function seedTechDoc() {
    const { privateFileId } = await caller("manager").privateFiles.upload({
      fileName: "doc.pdf", fileData: b64(pdfBuf()), category: "technician_document",
    });
    return privateFileId;
  }

  it("admin/manager/technician pueden descargar una OC y reciben base64 + nombre/mime seguros", async () => {
    const id = await seedOc();
    for (const role of ["admin", "manager", "technician"] as const) {
      const res = await caller(role).privateFiles.download({ id });
      expect(res.fileName).toBe("oc.pdf");
      expect(res.mimeType).toBe("application/pdf");
      // El contenido round-trip coincide con el PDF original.
      expect(Buffer.from(res.dataBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    }
  });

  it("viewer (sin módulo jobs) NO puede descargar una OC", async () => {
    const id = await seedOc();
    await expect(caller("viewer").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
  });

  it("viewer CON allowedModules=['jobs'] SÍ puede descargar una OC", async () => {
    const id = await seedOc();
    await expect(caller("viewerJobs").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
  });

  it("documento de técnico: admin/manager pueden; technician y viewer no", async () => {
    const id = await seedTechDoc();
    await expect(caller("admin").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
    await expect(caller("manager").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
    await expect(caller("technician").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
    await expect(caller("viewer").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
    await expect(caller("viewerJobs").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
  });

  it("id inexistente devuelve NOT_FOUND", async () => {
    await expect(caller("admin").privateFiles.download({ id: 9999 })).rejects.toThrow(NOT_FOUND);
  });

  it("sin token no se puede descargar", async () => {
    const id = await seedOc();
    await expect(caller().privateFiles.download({ id })).rejects.toThrow(UNAUTHED);
  });
});
