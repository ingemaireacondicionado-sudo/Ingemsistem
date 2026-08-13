import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// 8B-5a — blindaje del ledger de cobros. Mock COMPLETO de ./db en memoria (sin
// funciones reales de escritura ni URL). Verifica que isJobPayment/legacyPaidBase
// son server-controlled y que los cobros marcados no pueden editarse/eliminarse
// por el CRUD genérico. registerPayment TODAVÍA no crea filas marcadas.
const store = vi.hoisted(() => ({
  transactions: new Map<number, any>(),
  jobs: new Map<number, any>(),
  nextTxId: 1,
  nextJobId: 1,
}));

vi.mock("./db", () => ({
  getIngemUserById: async (id: number) =>
    store.jobs.size >= 0 && (id === 1 || id === 2)
      ? { id, name: id === 1 ? "Admin" : "Manager", email: `u${id}@i.com`, role: id === 1 ? "admin" : "manager", isActive: true, allowedModules: null }
      : undefined,
  // Transactions
  createTransaction: async (data: any) => { const id = store.nextTxId++; store.transactions.set(id, { id, ...data }); return { id }; },
  getTransactionById: async (id: number) => store.transactions.get(id),
  updateTransaction: async (id: number, data: any) => { const t = store.transactions.get(id); if (t) Object.assign(t, data); },
  deleteTransaction: async (id: number) => { store.transactions.delete(id); },
  // Jobs
  getJobById: async (id: number) => store.jobs.get(id),
  createJobWithFileBindings: async (jobData: any, _b: any[], _u: number) => { const id = store.nextJobId++; store.jobs.set(id, { id, ...jobData }); return { id }; },
  updateJobWithFileBindings: async (jobId: number, jobData: any, _b: any[] | null, _u: number) => { const j = store.jobs.get(jobId); if (j) Object.assign(j, jobData); },
  // registerPayment: refleja 8B-5a — crea el cobro SIN isJobPayment (default false
  // en la DB real, cuyo insert omite el campo). NO marca en esta subetapa.
  registerJobPaymentAtomic: async (params: any) => {
    const id = store.nextTxId++;
    store.transactions.set(id, { id, type: "income", category: "Cobro de trabajo", relatedJobId: params.jobId, amount: params.amountCents / 100, isJobPayment: false });
    return {
      transactionId: id, isFullyPaid: false, newAmountPaid: params.amountCents / 100, totalAmount: 999999,
      jobNumber: "J", title: "T", customerName: null, oldStatus: "invoiced", newStatus: "invoiced",
    };
  },
}));
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

const PROTECTED = "Este movimiento es un cobro registrado del sistema y no puede editarse ni eliminarse manualmente.";

let tokens: Record<string, string>;
beforeAll(async () => {
  tokens = {
    admin: await generateIngemToken({ userId: 1, email: "u1@i.com", name: "Admin", role: "admin" }),
    manager: await generateIngemToken({ userId: 2, email: "u2@i.com", name: "Manager", role: "manager" }),
  };
});
beforeEach(() => { store.transactions.clear(); store.jobs.clear(); store.nextTxId = 1; store.nextJobId = 1; });

const caller = (role: keyof typeof tokens) => appRouter.createCaller(ctx(`Bearer ${tokens[role]}`));

describe("8B-5a — isJobPayment server-controlled (transactions)", () => {
  it("A) create manual con isJobPayment=true del cliente → se guarda false", async () => {
    const r = await caller("admin").transactions.create({
      type: "income", category: "Cobro de trabajo", amount: "1000", date: "2026-08-10",
      relatedJobId: 5, isJobPayment: true, // el cliente miente
    } as any);
    expect(store.transactions.get(r.id).isJobPayment).toBe(false);
  });

  it("B) update manual false→true → imposible (queda false)", async () => {
    store.transactions.set(10, { id: 10, type: "income", amount: "100", isJobPayment: false });
    await caller("admin").transactions.update({ id: 10, amount: "500", isJobPayment: true } as any);
    const t = store.transactions.get(10);
    expect(t.isJobPayment).toBe(false);
    expect(t.amount).toBe("500"); // el resto sí se edita (fila NO marcada)
  });

  it("C) update de un cobro marcado (isJobPayment=true) → RECHAZADO", async () => {
    store.transactions.set(20, { id: 20, type: "income", amount: "100", isJobPayment: true });
    await expect(caller("admin").transactions.update({ id: 20, amount: "999" } as any))
      .rejects.toThrow(PROTECTED);
    expect(store.transactions.get(20).amount).toBe("100"); // sin cambios
  });

  it("D) delete de un cobro marcado → RECHAZADO", async () => {
    store.transactions.set(30, { id: 30, type: "income", amount: "100", isJobPayment: true });
    await expect(caller("admin").transactions.delete({ id: 30 })).rejects.toThrow(PROTECTED);
    expect(store.transactions.has(30)).toBe(true); // sigue existiendo
  });

  it("una transaction manual NO marcada sí puede editarse/eliminarse", async () => {
    store.transactions.set(40, { id: 40, type: "expense", amount: "100", isJobPayment: false });
    await expect(caller("admin").transactions.update({ id: 40, amount: "200" } as any)).resolves.toEqual({ success: true });
    await expect(caller("admin").transactions.delete({ id: 40 })).resolves.toBeUndefined();
    expect(store.transactions.has(40)).toBe(false);
  });
});

describe("8B-5a — legacyPaidBase server-controlled (jobs)", () => {
  it("E) job create con legacyPaidBase del cliente → ignorado (no se setea)", async () => {
    const r = await caller("manager").jobs.create({
      jobNumber: "J1", title: "T", legacyPaidBase: 999999,
    } as any);
    expect("legacyPaidBase" in store.jobs.get(r.id)).toBe(false);
  });

  it("F) job update intentando modificar legacyPaidBase → preserva el valor real", async () => {
    store.jobs.set(50, { id: 50, jobNumber: "J50", title: "T", status: "invoiced", paymentStatus: "partial", legacyPaidBase: "50000.00", notes: JSON.stringify({ laborCost: "5000" }) });
    await caller("manager").jobs.update({ id: 50, title: "editado", legacyPaidBase: 999999 } as any);
    const j = store.jobs.get(50);
    expect(j.legacyPaidBase).toBe("50000.00"); // preservado (server-side)
    expect(j.title).toBe("editado");
  });
});

describe("8B-5a — registerPayment TODAVÍA no crea cobros marcados", () => {
  it("H) el cobro creado por registerPayment queda isJobPayment=false", async () => {
    const r = await caller("admin").jobs.registerPayment({ jobId: 7, amount: "1000", date: "2026-08-10", paymentMethod: "transfer", notes: "" });
    const tx = store.transactions.get(r.transactionId);
    expect(tx.isJobPayment).toBe(false);
    expect(tx.relatedJobId).toBe(7);
  });
});
