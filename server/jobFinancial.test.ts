import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// 8B-1 — Blindaje de campos de cobro (amountPaid / paymentStatus) en jobs.update
// y jobs.create. Store en memoria; nunca toca producción. La transacción/lock de
// updateJobWithFileBindings se EMULA: la preservación financiera se toma del job
// VIGENTE en el store al momento del "write" (equivale al FOR UPDATE real), no de
// una lectura previa fuera de la transacción.
const store = vi.hoisted(() => ({
  users: new Map<number, any>(),
  jobs: new Map<number, any>(),
  files: new Map<number, any>(),
  nextJobId: 1,
  nextFileId: 1,
  // Emulación de concurrencia: si está seteado, getJobById devuelve el valor
  // VIEJO (snapshot) y deja en el store un amountPaid MÁS RECIENTE (como si un
  // registerPayment concurrente impactara justo después de esa lectura).
  pendingConcurrentAmountPaid: null as number | null,
}));

const pm = (n: unknown): Record<string, any> => {
  if (typeof n !== "string" || !n.trim().startsWith("{")) return {};
  try { const o = JSON.parse(n); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
};
const snap = (m: Map<number, any>) => new Map([...m].map(([k, v]) => [k, { ...v }]));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserById: async (id: number) => store.users.get(id) ?? null,
    insertPrivateFile: async (data: any) => {
      const id = store.nextFileId++;
      store.files.set(id, { id, entityType: null, entityId: null, createdBy: null, ...data });
      return { id };
    },
    getPrivateFileMetaById: async (id: number) => {
      const f = store.files.get(id); if (!f) return null; const { data, ...meta } = f; return meta;
    },
    getJobById: async (id: number) => {
      const j = store.jobs.get(id);
      if (!j) return undefined;
      const snapshot = { ...j }; // el router recibe una copia (posible "vieja")
      if (store.pendingConcurrentAmountPaid != null) {
        const m = pm(j.notes); m.amountPaid = store.pendingConcurrentAmountPaid; j.notes = JSON.stringify(m);
        store.pendingConcurrentAmountPaid = null; // una sola vez
      }
      return snapshot;
    },
    createJobWithFileBindings: async (jobData: any, bindings: any[], _userId: number) => {
      const id = store.nextJobId++;
      store.jobs.set(id, { id, ...jobData });
      for (const b of bindings ?? []) {
        const f = store.files.get(b.fileId);
        if (f && f.entityId == null) { f.entityType = "job"; f.entityId = id; }
      }
      return { id };
    },
    updateJobWithFileBindings: async (jobId: number, jobData: any, bindings: any[] | null, _userId: number) => {
      const fSnap = snap(store.files); const jSnap = snap(store.jobs);
      try {
        // "Lock + read" del estado financiero VIGENTE (emula FOR UPDATE).
        const locked = store.jobs.get(jobId);
        const finalData: any = { ...jobData };
        if (locked) {
          finalData.paymentStatus = locked.paymentStatus; // se ignora el del cliente
          if (finalData.notes !== undefined) {
            const lockedMeta = pm(locked.notes);
            const newMeta = pm(finalData.notes);
            if ("amountPaid" in lockedMeta) newMeta.amountPaid = lockedMeta.amountPaid;
            else delete newMeta.amountPaid;
            finalData.notes = JSON.stringify(newMeta);
          }
          Object.assign(locked, finalData);
        }
        if (bindings === null) return;
        // Reconciliación de archivos (punto 7): asociar declarados, desvincular resto.
        const keep = new Set<number>();
        for (const b of bindings) {
          const f = store.files.get(b.fileId);
          if (f && f.entityId == null) { f.entityType = "job"; f.entityId = jobId; }
          keep.add(b.fileId);
        }
        for (const f of store.files.values()) {
          if (f.entityType === "job" && f.entityId === jobId && !keep.has(f.id)) { f.entityType = null; f.entityId = null; }
        }
      } catch (e) {
        store.files = fSnap; store.jobs = jSnap; throw e;
      }
    },
  };
});

vi.mock("./notifications", () => ({
  notifyJobCreated: async () => {}, notifyJobStatusChanged: async () => {},
  notifyAppointmentCreated: async () => {}, notifyAppointmentStatusChanged: async () => {},
  notifyUrgentNote: async () => {}, notifyCustomerCreated: async () => {},
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";

function ctx(auth?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: auth ? { authorization: auth } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

let tokens: Record<string, string>;
beforeAll(async () => {
  tokens = {
    ana: await generateIngemToken({ userId: 2, email: "ana@ingem.com", name: "Ana", role: "manager" }),
    bob: await generateIngemToken({ userId: 1, email: "bob@ingem.com", name: "Bob", role: "admin" }),
    tomas: await generateIngemToken({ userId: 3, email: "t@ingem.com", name: "Tomas", role: "technician" }),
  };
});

beforeEach(() => {
  store.users.clear(); store.jobs.clear(); store.files.clear();
  store.nextJobId = 1; store.nextFileId = 1; store.pendingConcurrentAmountPaid = null;
  store.users.set(1, { id: 1, name: "Bob", email: "bob@ingem.com", role: "admin", isActive: true, allowedModules: null });
  store.users.set(2, { id: 2, name: "Ana", email: "ana@ingem.com", role: "manager", isActive: true, allowedModules: null });
  store.users.set(3, { id: 3, name: "Tomas", email: "t@ingem.com", role: "technician", isActive: true, allowedModules: null });
});

const caller = (role: keyof typeof tokens) => appRouter.createCaller(ctx(`Bearer ${tokens[role]}`));
const meta = (o: Record<string, unknown>) => JSON.stringify(o);
const jobMeta = (id: number) => pm(store.jobs.get(id).notes);
// Job sembrado con estado de cobranza real (como si ya hubiera cobros).
function seedJob(id: number, over: Record<string, unknown> = {}, metaOver: Record<string, unknown> = {}) {
  store.jobs.set(id, {
    id, jobNumber: `J${id}`, title: "T", status: "invoiced", paymentStatus: "partial",
    notes: meta({ amountPaid: 10000, laborCost: "5000", createdBy: 2, createdByName: "Ana", ...metaOver }),
    ...over,
  });
  store.nextJobId = Math.max(store.nextJobId, id + 1);
}

// ============================================================
describe("CREATE — estado financiero inicial seguro", () => {
  it("cliente intenta amountPaid=500000 → queda 0", async () => {
    const res = await caller("ana").jobs.create({ jobNumber: "J", title: "T", notes: meta({ amountPaid: "500000", laborCost: "100" }) });
    expect(jobMeta(res.id).amountPaid).toBe(0);
    expect(jobMeta(res.id).laborCost).toBe("100"); // costos intactos
  });

  it("cliente intenta paymentStatus=completed → queda pending", async () => {
    const res = await caller("ana").jobs.create({ jobNumber: "J", title: "T", paymentStatus: "completed", notes: meta({}) });
    expect(store.jobs.get(res.id).paymentStatus).toBe("pending");
  });
});

// ============================================================
describe("UPDATE — amountPaid y paymentStatus blindados", () => {
  it("cliente manda amountPaid=999999 → sigue 10000", async () => {
    seedJob(1);
    await caller("ana").jobs.update({ id: 1, notes: meta({ amountPaid: 999999, laborCost: "5000", createdBy: 2, createdByName: "Ana" }) });
    expect(jobMeta(1).amountPaid).toBe(10000);
  });

  it("cliente manda amountPaid=-500 → sigue 10000", async () => {
    seedJob(1);
    await caller("ana").jobs.update({ id: 1, notes: meta({ amountPaid: -500, laborCost: "5000" }) });
    expect(jobMeta(1).amountPaid).toBe(10000);
  });

  it("cliente intenta paymentStatus=completed → se preserva el existente (partial)", async () => {
    seedJob(1);
    await caller("ana").jobs.update({ id: 1, paymentStatus: "completed", notes: meta({ amountPaid: 999999 }) });
    expect(store.jobs.get(1).paymentStatus).toBe("partial");
    expect(jobMeta(1).amountPaid).toBe(10000);
  });

  it("Técnico (canEdit jobs) NO puede modificar campos de cobranza", async () => {
    seedJob(1);
    await caller("tomas").jobs.update({ id: 1, paymentStatus: "completed", notes: meta({ amountPaid: 999999, laborCost: "5000" }) });
    expect(jobMeta(1).amountPaid).toBe(10000);
    expect(store.jobs.get(1).paymentStatus).toBe("partial");
  });

  it("editar details NO cambia amountPaid", async () => {
    seedJob(1);
    await caller("ana").jobs.update({ id: 1, description: "nuevo detalle", notes: meta({ amountPaid: 0, laborCost: "5000", userNotes: "editado" }) });
    expect(jobMeta(1).amountPaid).toBe(10000);
    expect(jobMeta(1).userNotes).toBe("editado");
  });

  it("editar costos NO cambia amountPaid", async () => {
    seedJob(1);
    await caller("ana").jobs.update({ id: 1, notes: meta({ amountPaid: 0, laborCost: "9999", materialsCost: "1000" }) });
    expect(jobMeta(1).amountPaid).toBe(10000);
    expect(jobMeta(1).laborCost).toBe("9999"); // costo sí cambia (F2/F3 aparte)
  });

  it("autoría 8A sigue intacta tras el blindaje financiero", async () => {
    seedJob(1);
    await caller("bob").jobs.update({ id: 1, notes: meta({ amountPaid: 999999, createdBy: 1, createdByName: "Bob" }) });
    expect(jobMeta(1).createdBy).toBe(2);          // creador original
    expect(jobMeta(1).createdByName).toBe("Ana");
    expect(jobMeta(1).amountPaid).toBe(10000);     // cobro preservado
  });
});

// ============================================================
describe("UPDATE — interacción con private_files (punto 7)", () => {
  it("editar archivos NO cambia amountPaid y respeta la reconciliación de refs", async () => {
    // Archivo subido por ana y job con OC asociada.
    const up = await caller("ana").jobs.create({ jobNumber: "J", title: "T", notes: meta({ laborCost: "5000" }) }); // amountPaid=0
    // Simular que ya se cobró (estado real en DB).
    const jm = pm(store.jobs.get(up.id).notes); jm.amountPaid = 7000; store.jobs.get(up.id).notes = JSON.stringify(jm);
    const f1 = await caller("ana").privateFiles.upload({ fileName: "oc.pdf", fileData: Buffer.from("%PDF-1.4\n").toString("base64"), category: "purchase_order" });
    // Adjuntar OC (edición de archivos) mientras el cliente intenta tocar amountPaid.
    await caller("ana").jobs.update({ id: up.id, notes: meta({ amountPaid: 999999, laborCost: "5000", purchaseOrderFileUrl: `private:${f1.privateFileId}` }) });
    expect(jobMeta(up.id).amountPaid).toBe(7000);                       // cobro intacto
    expect(store.files.get(f1.privateFileId).entityId).toBe(up.id);     // archivo asociado (punto 7 intacto)
    expect(jobMeta(up.id).purchaseOrderFileUrl).toBe(`private:${f1.privateFileId}`);
  });
});

// ============================================================
describe("LEGACY — job sin amountPaid", () => {
  it("se puede editar sin crash y se interpreta compatible con 0 (no se inventa)", async () => {
    store.jobs.set(50, { id: 50, jobNumber: "J50", title: "Legacy", status: "pending", paymentStatus: "pending", notes: meta({ laborCost: "100" }) });
    store.nextJobId = 51;
    await caller("ana").jobs.update({ id: 50, notes: meta({ amountPaid: 999999, laborCost: "150" }) });
    const m = jobMeta(50);
    expect("amountPaid" in m).toBe(false); // legacy: no se inventa cobro
    expect(m.laborCost).toBe("150");       // el resto se edita normal
  });
});

// ============================================================
describe("CONCURRENCIA — preservación desde el job bloqueado, no de una lectura vieja", () => {
  it("un cobro concurrente posterior a la lectura del router se conserva (no se pisa)", async () => {
    seedJob(1, {}, { amountPaid: 10000 });
    // Un registerPayment concurrente lleva amountPaid a 50000 JUSTO después de que
    // el router lea el job (emulado en getJobById).
    store.pendingConcurrentAmountPaid = 50000;
    // La edición genérica llega con un amountPaid viejo/manipulado.
    await caller("ana").jobs.update({ id: 1, title: "editado", notes: meta({ amountPaid: 999999, laborCost: "5000", createdBy: 2, createdByName: "Ana" }) });
    // Debe conservarse el amountPaid MÁS RECIENTE de la DB (50000), no el viejo
    // (10000) ni el del cliente (999999).
    expect(jobMeta(1).amountPaid).toBe(50000);
    expect(store.jobs.get(1).title).toBe("editado"); // el cambio no-financiero sí se aplica
  });
});
