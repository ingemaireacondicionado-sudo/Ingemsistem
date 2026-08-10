import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// ===== Store en memoria (aislado de producción) =====
// Modela ingem_users, private_files, jobs y technicians para ejercitar el flujo
// completo: upload -> asociación server-side al crear/editar job -> download.
const store = vi.hoisted(() => ({
  users: new Map<number, any>(),
  files: new Map<number, any>(),
  jobs: new Map<number, any>(),
  technicians: new Map<number, any>(),
  nextFileId: 1,
  nextJobId: 1,
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserById: async (id: number) => store.users.get(id) ?? null,
    insertPrivateFile: async (data: any) => {
      const id = store.nextFileId++;
      store.files.set(id, {
        id, createdAt: new Date(),
        entityType: null, entityId: null, createdBy: null,
        ...data,
      });
      return { id };
    },
    getPrivateFileById: async (id: number) => store.files.get(id) ?? null,
    getPrivateFileMetaById: async (id: number) => {
      const f = store.files.get(id);
      if (!f) return null;
      const { data, ...meta } = f;
      return meta;
    },
    setPrivateFileEntity: async (id: number, entityType: string, entityId: number) => {
      const f = store.files.get(id);
      if (f) { f.entityType = entityType; f.entityId = entityId; }
    },
    createJob: async (data: any) => {
      const id = store.nextJobId++;
      store.jobs.set(id, { id, ...data });
      return { id };
    },
    updateJob: async (id: number, data: any) => {
      const j = store.jobs.get(id);
      if (j) Object.assign(j, data);
    },
    getJobById: async (id: number) => store.jobs.get(id),
    getTechnicianById: async (id: number) => store.technicians.get(id),
  };
});

// Notificaciones: no-op (aislado; evita webhooks/DB).
vi.mock("./notifications", () => ({
  notifyJobCreated: async () => {},
  notifyJobStatusChanged: async () => {},
  notifyAppointmentCreated: async () => {},
  notifyAppointmentStatusChanged: async () => {},
  notifyUrgentNote: async () => {},
  notifyCustomerCreated: async () => {},
}));

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
const NOT_MINE = "No podés adjuntar un archivo que no subiste.";
const OTHER_JOB = "El archivo pertenece a otro trabajo.";
const BAD_ATTACH = "Archivo adjunto inválido.";

let tokens: Record<string, string>;

beforeAll(async () => {
  tokens = {
    admin: await generateIngemToken({ userId: 1, email: "admin@ingem.com", name: "Admin", role: "admin" }),
    manager: await generateIngemToken({ userId: 2, email: "manager@ingem.com", name: "Manager", role: "manager" }),
    technician: await generateIngemToken({ userId: 3, email: "tec@ingem.com", name: "Tec", role: "technician" }),
    viewer: await generateIngemToken({ userId: 4, email: "viewer@ingem.com", name: "Viewer", role: "viewer" }),
    viewerJobs: await generateIngemToken({ userId: 5, email: "vj@ingem.com", name: "VJobs", role: "viewer" }),
    managerB: await generateIngemToken({ userId: 6, email: "mb@ingem.com", name: "ManagerB", role: "manager" }),
  };
});

beforeEach(() => {
  store.users.clear();
  store.files.clear();
  store.jobs.clear();
  store.technicians.clear();
  store.nextFileId = 1;
  store.nextJobId = 1;
  store.users.set(1, { id: 1, name: "Admin", email: "admin@ingem.com", role: "admin", isActive: true, allowedModules: null });
  store.users.set(2, { id: 2, name: "Manager", email: "manager@ingem.com", role: "manager", isActive: true, allowedModules: null });
  store.users.set(3, { id: 3, name: "Tec", email: "tec@ingem.com", role: "technician", isActive: true, allowedModules: null });
  store.users.set(4, { id: 4, name: "Viewer", email: "viewer@ingem.com", role: "viewer", isActive: true, allowedModules: null });
  store.users.set(5, { id: 5, name: "VJobs", email: "vj@ingem.com", role: "viewer", isActive: true, allowedModules: JSON.stringify(["dashboard", "jobs"]) });
  store.users.set(6, { id: 6, name: "ManagerB", email: "mb@ingem.com", role: "manager", isActive: true, allowedModules: null });
});

function caller(role?: keyof typeof tokens) {
  return appRouter.createCaller(ctx(role ? `Bearer ${tokens[role]}` : undefined));
}

async function upload(role: keyof typeof tokens, category: "purchase_order" | "invoice" | "technician_document", buf = pdfBuf()) {
  const res = await caller(role).privateFiles.upload({ fileName: "x.pdf", fileData: b64(buf), category });
  return res.privateFileId;
}

const notes = (o: Record<string, unknown>) => JSON.stringify(o);
const jobInput = (extra: Record<string, unknown> = {}) => ({ jobNumber: "J1", title: "Trabajo", ...extra });

// ============================================================
describe("UPLOAD — endurecimiento (createdBy servidor, sin asociación del cliente)", () => {
  it("createdBy se deriva del token; el archivo se guarda SIN asociar", async () => {
    const id = await upload("manager", "invoice");
    const f = store.files.get(id);
    expect(f.createdBy).toBe(2);      // del token, no del cliente
    expect(f.entityId).toBeNull();    // sin asociar
    expect(f.entityType).toBeNull();
    expect(f.mimeType).toBe("application/pdf"); // detectado
    expect(Buffer.isBuffer(f.data)).toBe(true);
    expect(f.sizeBytes).toBe(64);
  });

  it("permisos de subida por categoría (viewer no; technician no doc de técnico)", async () => {
    await expect(caller("viewer").privateFiles.upload({ fileName: "x.pdf", fileData: b64(pdfBuf()), category: "purchase_order" }))
      .rejects.toThrow(FORBIDDEN_UPLOAD);
    await expect(caller("technician").privateFiles.upload({ fileName: "x.pdf", fileData: b64(pdfBuf()), category: "technician_document" }))
      .rejects.toThrow(FORBIDDEN_UPLOAD);
  });

  it("rechaza contenido no permitido (exe disfrazado de pdf)", async () => {
    await expect(caller("manager").privateFiles.upload({ fileName: "f.pdf", fileData: b64(exeBuf()), category: "invoice" }))
      .rejects.toThrow(/no permitido/i);
  });

  it("sin token no se puede subir", async () => {
    await expect(caller().privateFiles.upload({ fileName: "x.pdf", fileData: b64(pdfBuf()), category: "purchase_order" }))
      .rejects.toThrow(UNAUTHED);
  });
});

// ============================================================
describe("ASOCIACIÓN server-side vía job.create/update (anti-forgería de private:<id>)", () => {
  it("al crear el job se sella entityId=job en el archivo propio", async () => {
    const id = await upload("manager", "purchase_order");
    const job = await caller("manager").jobs.create(jobInput({ notes: notes({ purchaseOrderFileUrl: `private:${id}` }) }));
    const f = store.files.get(id);
    expect(f.entityType).toBe("job");
    expect(f.entityId).toBe(job.id);
  });

  it("NO se puede adjuntar un archivo subido por OTRO usuario", async () => {
    const idB = await upload("managerB", "purchase_order"); // createdBy=6
    await expect(caller("manager").jobs.create(jobInput({ notes: notes({ purchaseOrderFileUrl: `private:${idB}` }) })))
      .rejects.toThrow(NOT_MINE);
    expect(store.files.get(idB).entityId).toBeNull(); // no se asoció
  });

  it("NO se puede robar/revincular un archivo ya asociado a otro job", async () => {
    const id = await upload("manager", "invoice");
    const jobA = await caller("manager").jobs.create(jobInput({ notes: notes({ invoiceFileUrl: `private:${id}` }) }));
    expect(store.files.get(id).entityId).toBe(jobA.id);
    // Otro job intenta referenciar el mismo archivo.
    const jobB = await caller("manager").jobs.create(jobInput());
    await expect(caller("manager").jobs.update({ id: jobB.id, notes: notes({ invoiceFileUrl: `private:${id}` }) }))
      .rejects.toThrow(OTHER_JOB);
  });

  it("categoría inconsistente (doc técnico en slot de OC) → rechazo", async () => {
    const techDoc = await upload("manager", "technician_document");
    await expect(caller("manager").jobs.create(jobInput({ notes: notes({ purchaseOrderFileUrl: `private:${techDoc}` }) })))
      .rejects.toThrow(BAD_ATTACH);
  });

  it("re-guardar el MISMO job con el MISMO archivo es idempotente (no falla)", async () => {
    const id = await upload("manager", "purchase_order");
    const job = await caller("manager").jobs.create(jobInput({ notes: notes({ purchaseOrderFileUrl: `private:${id}` }) }));
    await expect(caller("manager").jobs.update({ id: job.id, title: "editado", notes: notes({ purchaseOrderFileUrl: `private:${id}` }) }))
      .resolves.toEqual({ success: true });
  });

  it("referencia a archivo inexistente → rechazo seguro", async () => {
    await expect(caller("manager").jobs.create(jobInput({ notes: notes({ purchaseOrderFileUrl: "private:9999" }) })))
      .rejects.toThrow(BAD_ATTACH);
  });
});

// ============================================================
describe("DOWNLOAD — IDOR", () => {
  // Sube un archivo y lo asocia a un job creado por `owner`.
  async function seedBoundOc(owner: keyof typeof tokens = "manager") {
    const id = await upload(owner, "purchase_order");
    const job = await caller(owner).jobs.create(jobInput({ notes: notes({ purchaseOrderFileUrl: `private:${id}` }) }));
    return { id, jobId: job.id };
  }

  it("autor descarga su propio archivo AÚN SIN asociar (ventana temporal) → OK", async () => {
    const id = await upload("manager", "purchase_order");
    await expect(caller("manager").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
  });

  it("NO-autor NO puede descargar un archivo sin asociar aunque tenga el módulo (enumeración bloqueada)", async () => {
    const id = await upload("manager", "purchase_order"); // createdBy=2, sin asociar
    // admin tiene módulo jobs pero NO es el autor y el archivo no está asociado.
    await expect(caller("admin").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
  });

  it("archivo asociado a job: usuarios con acceso a jobs pueden; viewer sin jobs no", async () => {
    const { id } = await seedBoundOc();
    for (const role of ["admin", "manager", "technician", "viewerJobs"] as const) {
      const res = await caller(role).privateFiles.download({ id });
      expect(Buffer.from(res.dataBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    }
    await expect(caller("viewer").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
  });

  it("si la entidad asociada NO existe (job borrado), un no-autor no puede descargar", async () => {
    const { id, jobId } = await seedBoundOc();
    store.jobs.delete(jobId); // el job ya no existe
    await expect(caller("admin").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
    // el autor todavía puede (createdBy)
    await expect(caller("manager").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
  });

  it("technician_document NO se descarga con permisos de jobs; sí admin/manager", async () => {
    // Sembramos un doc de técnico asociado a un técnico existente.
    const id = await upload("manager", "technician_document");
    store.technicians.set(50, { id: 50, firstName: "T" });
    await (await import("./db")).setPrivateFileEntity(id, "technician", 50);
    await expect(caller("admin").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
    await expect(caller("manager").privateFiles.download({ id })).resolves.toHaveProperty("dataBase64");
    await expect(caller("technician").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
    await expect(caller("viewerJobs").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
  });

  it("viewer no puede aprovechar el id para saltar permisos (categoría jobs sin módulo)", async () => {
    const { id } = await seedBoundOc();
    await expect(caller("viewer").privateFiles.download({ id })).rejects.toThrow(FORBIDDEN_DOWNLOAD);
  });

  it("id inexistente → NOT_FOUND (respuesta segura, sin filtrar)", async () => {
    await expect(caller("admin").privateFiles.download({ id: 9999 })).rejects.toThrow(NOT_FOUND);
  });

  it("sin token no se puede descargar", async () => {
    const { id } = await seedBoundOc();
    await expect(caller().privateFiles.download({ id })).rejects.toThrow(UNAUTHED);
  });
});
