import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Punto 8A — autoría e identidad server-side. Se verifica que createdBy /
// createdByName / completedBy NO se puedan falsificar desde el cliente: la
// identidad se deriva SIEMPRE del usuario autenticado revalidado contra la DB
// (punto 5). Store en memoria; nunca toca producción.
const store = vi.hoisted(() => ({
  users: new Map<number, any>(),
  notes: new Map<number, any>(),
  appts: new Map<number, any>(),
  jobs: new Map<number, any>(),
  nextNoteId: 1,
  nextApptId: 1,
  nextJobId: 1,
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserById: async (id: number) => store.users.get(id) ?? null,
    createNote: async (data: any) => {
      const id = store.nextNoteId++;
      store.notes.set(id, { id, ...data });
      return { id };
    },
    updateNote: async (id: number, data: any) => {
      const n = store.notes.get(id); if (n) Object.assign(n, data);
    },
    getNoteById: async (id: number) => store.notes.get(id),
    createAppointment: async (data: any) => {
      const id = store.nextApptId++;
      store.appts.set(id, { id, ...data });
      return { id };
    },
    updateAppointment: async (id: number, data: any) => {
      const a = store.appts.get(id); if (a) Object.assign(a, data);
    },
    getAppointmentById: async (id: number) => store.appts.get(id),
    createJobWithFileBindings: async (jobData: any, _bindings: any[], _userId: number) => {
      const id = store.nextJobId++;
      store.jobs.set(id, { id, ...jobData });
      return { id };
    },
    updateJobWithFileBindings: async (jobId: number, jobData: any, _bindings: any[] | null, _userId: number) => {
      const j = store.jobs.get(jobId); if (j) Object.assign(j, jobData);
    },
    getJobById: async (id: number) => store.jobs.get(id),
  };
});

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

function ctx(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

let tokens: Record<string, string>;

beforeAll(async () => {
  tokens = {
    // Bob = admin (editor con todos los permisos).
    bob: await generateIngemToken({ userId: 1, email: "bob@ingem.com", name: "Bob", role: "admin" }),
    // Ana = manager (creadora en la mayoría de los casos).
    ana: await generateIngemToken({ userId: 2, email: "ana@ingem.com", name: "Ana", role: "manager" }),
    // Token "spoofeado": dice name="HACKER" y role="admin", pero en la DB el
    // usuario 2 es Ana/manager. Sirve para probar que la identidad sale de la DB.
    spoof: await generateIngemToken({ userId: 2, email: "ana@ingem.com", name: "HACKER", role: "admin" }),
  };
});

beforeEach(() => {
  store.users.clear(); store.notes.clear(); store.appts.clear(); store.jobs.clear();
  store.nextNoteId = 1; store.nextApptId = 1; store.nextJobId = 1;
  store.users.set(1, { id: 1, name: "Bob", email: "bob@ingem.com", role: "admin", isActive: true, allowedModules: null });
  store.users.set(2, { id: 2, name: "Ana", email: "ana@ingem.com", role: "manager", isActive: true, allowedModules: null });
});

function caller(role: keyof typeof tokens) {
  return appRouter.createCaller(ctx(`Bearer ${tokens[role]}`));
}

// ============================================================
describe("NOTES — createdBy server-side", () => {
  it("A crea nota enviando createdBy='Usuario B' → queda el nombre de A", async () => {
    const { id } = await caller("ana").notes.create({ title: "n", createdBy: "Usuario B" });
    expect(store.notes.get(Number(id)).createdBy).toBe("Ana");
  });

  it("B edita una nota creada por A → createdBy sigue siendo A", async () => {
    const { id } = await caller("ana").notes.create({ title: "n", createdBy: "x" });
    await caller("bob").notes.update({ id: Number(id), title: "editada", createdBy: "Bob-hack" });
    expect(store.notes.get(Number(id)).createdBy).toBe("Ana");
    expect(store.notes.get(Number(id)).title).toBe("editada"); // el resto sí cambia
  });

  it("un update no puede cambiar createdBy (inmutable)", async () => {
    const { id } = await caller("ana").notes.create({ title: "n" });
    await caller("ana").notes.update({ id: Number(id), createdBy: "otro" });
    expect(store.notes.get(Number(id)).createdBy).toBe("Ana");
  });
});

// ============================================================
describe("APPOINTMENTS — completedBy server-side", () => {
  beforeEach(() => {
    store.appts.set(1, { id: 1, title: "Visita", date: "2026-08-10", status: "pending", completedBy: null });
    store.appts.set(2, { id: 2, title: "Visita2", date: "2026-08-10", status: "completed", completedBy: "Ana" });
    store.nextApptId = 3;
  });

  it("A completa la cita enviando completedBy='Admin' → queda A y setea completedAt", async () => {
    await caller("ana").appointments.complete({ id: 1, completionNotes: "listo", completedBy: "Admin" });
    const a = store.appts.get(1);
    expect(a.completedBy).toBe("Ana");
    expect(a.status).toBe("completed");
    expect(a.completedAt instanceof Date).toBe(true);
  });

  it("un update genérico NO puede modificar completedBy", async () => {
    await caller("bob").appointments.update({ id: 2, title: "editada", completedBy: "Hacker" });
    expect(store.appts.get(2).completedBy).toBe("Ana"); // sin cambios
    expect(store.appts.get(2).title).toBe("editada");
  });

  it("completar correctamente registra al usuario autenticado (no el del cliente)", async () => {
    await caller("bob").appointments.complete({ id: 1, completionNotes: "ok", completedBy: "Ana" });
    expect(store.appts.get(1).completedBy).toBe("Bob");
  });
});

// ============================================================
describe("JOBS — createdBy/createdByName dentro de notes", () => {
  const meta = (o: Record<string, unknown>) => JSON.stringify(o);
  const parse = (id: number) => JSON.parse(store.jobs.get(id).notes);

  it("A crea job enviando createdBy de Admin → backend guarda el id de A y su nombre", async () => {
    const res = await caller("ana").jobs.create({
      jobNumber: "J1", title: "T",
      notes: meta({ createdBy: 1, createdByName: "Admin", laborCost: "100", amountPaid: "50", currency: "ARS" }),
    });
    const m = parse(res.id);
    expect(m.createdBy).toBe(2);          // id del usuario autenticado (Ana)
    expect(m.createdByName).toBe("Ana");  // nombre derivado server-side
  });

  it("el resto del JSON notes permanece intacto tras crear", async () => {
    const res = await caller("ana").jobs.create({
      jobNumber: "J1", title: "T",
      notes: meta({ createdBy: 9, createdByName: "X", laborCost: "100", materialsCost: "20", amountPaid: "50", currency: "USD", productsUsed: [{ productId: 7 }] }),
    });
    const m = parse(res.id);
    expect(m.laborCost).toBe("100");
    expect(m.materialsCost).toBe("20");
    expect(m.amountPaid).toBe("50");
    expect(m.currency).toBe("USD");
    expect(m.productsUsed).toEqual([{ productId: 7 }]);
  });

  it("B edita un job creado por A → createdBy/createdByName siguen siendo de A", async () => {
    const res = await caller("ana").jobs.create({ jobNumber: "J1", title: "T", notes: meta({ laborCost: "100" }) });
    await caller("bob").jobs.update({
      id: res.id,
      notes: meta({ createdBy: 1, createdByName: "Bob", laborCost: "200" }),
    });
    const m = parse(res.id);
    expect(m.createdBy).toBe(2);         // creador original (Ana)
    expect(m.createdByName).toBe("Ana");
    expect(m.laborCost).toBe("200");     // el resto del meta sí se actualiza
  });

  it("manipular createdBy/createdByName en el notes de un update no funciona", async () => {
    const res = await caller("ana").jobs.create({ jobNumber: "J1", title: "T", notes: meta({}) });
    await caller("ana").jobs.update({ id: res.id, notes: meta({ createdBy: 999, createdByName: "Falso" }) });
    const m = parse(res.id);
    expect(m.createdBy).toBe(2);
    expect(m.createdByName).toBe("Ana");
  });
});

// ============================================================
describe("JOBS — LEGACY sin autoría", () => {
  it("un job viejo sin createdBy se puede editar sin crash y NO se atribuye a nadie", async () => {
    // Job legacy: notes sin createdBy/createdByName.
    store.jobs.set(50, { id: 50, jobNumber: "J50", title: "Legacy", status: "pending", notes: JSON.stringify({ laborCost: "100" }) });
    store.nextJobId = 51;
    // El cliente intenta inyectar autoría en el update.
    await caller("ana").jobs.update({ id: 50, notes: JSON.stringify({ laborCost: "150", createdBy: 2, createdByName: "Ana" }) });
    const m = JSON.parse(store.jobs.get(50).notes);
    expect(m.laborCost).toBe("150");            // el update funciona
    expect("createdBy" in m).toBe(false);       // NO se inventa autoría
    expect("createdByName" in m).toBe(false);
  });
});

// ============================================================
describe("SEGURIDAD — identidad desde la DB, no desde el JWT/cliente", () => {
  it("un token con name/role falsos no altera la identidad (se usa la DB del punto 5)", async () => {
    // token spoof: name='HACKER', role='admin'; DB dice Ana/manager.
    const { id } = await caller("spoof").notes.create({ title: "n", createdBy: "HACKER" });
    expect(store.notes.get(Number(id)).createdBy).toBe("Ana");

    const res = await caller("spoof").jobs.create({ jobNumber: "J1", title: "T", notes: JSON.stringify({ createdByName: "HACKER" }) });
    const m = JSON.parse(store.jobs.get(res.id).notes);
    expect(m.createdBy).toBe(2);
    expect(m.createdByName).toBe("Ana");
  });
});
