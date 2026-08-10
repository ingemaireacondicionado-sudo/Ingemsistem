import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readStoredMoneyCents, readStoredRate } from "./money";

// 8B-2/8B-3 — registerPayment validado + atómico. La transacción/lock de DB se
// EMULA: registerJobPaymentAtomic lee el job VIGENTE del store (equivale a FOR
// UPDATE) y sólo "commitea" (muta el store + agrega la transaction) al final,
// tras pasar todas las validaciones y los checks de fallo — igual que un
// db.transaction real: cualquier throw ⇒ rollback (cero escrituras).
const store = vi.hoisted(() => ({
  users: new Map<number, any>(),
  jobs: new Map<number, any>(),
  transactions: [] as any[],
  nextTxId: 1,
  failJobUpdate: false,
  failTxInsert: false,
}));

vi.mock("./db", async (orig) => {
  const actual = await orig<typeof import("./db")>();
  return {
    ...actual,
    getIngemUserById: async (id: number) => store.users.get(id) ?? null,
    registerJobPaymentAtomic: async (params: any): Promise<import("./db").RegisterPaymentResult> => {
      const job = store.jobs.get(params.jobId);
      if (!job) throw new actual.PaymentError("NOT_FOUND", actual.PAYMENT_ERR.NOT_FOUND);
      const raw = job.notes;
      if (typeof raw !== "string" || !raw.trim().startsWith("{")) {
        throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.INCOMPLETE);
      }
      let meta: any;
      try { const o = JSON.parse(raw); if (!o || typeof o !== "object" || Array.isArray(o)) throw 0; meta = o; }
      catch { throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.INCOMPLETE); }
      if (meta.ivaRate === undefined || meta.ivaRate === null || meta.ivaRate === "") {
        throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.IVA_MISSING);
      }
      const rate = readStoredRate(meta.ivaRate);
      if (rate === null) throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.INCOMPLETE);
      const labor = readStoredMoneyCents(meta.laborCost);
      const materials = readStoredMoneyCents(meta.materialsCost);
      const other = readStoredMoneyCents(meta.otherCosts);
      if (labor === null || materials === null || other === null) {
        throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.INCOMPLETE);
      }
      const subtotal = labor + materials + other;
      const totalCents = subtotal + Math.round((subtotal * rate) / 100);
      const prevCents = readStoredMoneyCents(meta.amountPaid);
      if (prevCents === null) throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.INCOMPLETE);
      const balance = totalCents - prevCents;
      if (balance <= 0) throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.ALREADY_PAID);
      if (params.amountCents > balance) throw new actual.PaymentError("BAD_REQUEST", actual.PAYMENT_ERR.OVER_BALANCE);
      const newCents = prevCents + params.amountCents;
      const isFullyPaid = newCents >= totalCents;
      const oldStatus = job.status;
      const newStatus = isFullyPaid ? "collected" : job.status;
      // Emulación de fallos de escritura ANTES de commitear (atomicidad).
      if (store.failJobUpdate) throw new Error("job update failed");
      if (store.failTxInsert) throw new Error("tx insert failed");
      // COMMIT atómico.
      job.notes = JSON.stringify({ ...meta, amountPaid: newCents / 100 });
      job.status = newStatus;
      job.paymentStatus = isFullyPaid ? "completed" : "partial";
      const txId = store.nextTxId++;
      store.transactions.push({
        id: txId, type: "income", category: "Cobro de trabajo",
        relatedJobId: params.jobId, amount: params.amountCents / 100,
        paymentMethod: params.paymentMethod, date: params.date, notes: params.notes,
      });
      return {
        transactionId: txId, isFullyPaid, newAmountPaid: newCents / 100, totalAmount: totalCents / 100,
        jobNumber: job.jobNumber ?? "", title: job.title ?? "", customerName: job.customerName ?? null,
        oldStatus: oldStatus ?? "invoiced", newStatus: newStatus ?? "invoiced",
      };
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
import { PAYMENT_ERR } from "./db";

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
    admin: await generateIngemToken({ userId: 1, email: "a@i.com", name: "Admin", role: "admin" }),
    manager: await generateIngemToken({ userId: 2, email: "m@i.com", name: "Man", role: "manager" }),
    technician: await generateIngemToken({ userId: 3, email: "t@i.com", name: "Tec", role: "technician" }),
  };
});

beforeEach(() => {
  store.users.clear(); store.jobs.clear(); store.transactions = [];
  store.nextTxId = 1; store.failJobUpdate = false; store.failTxInsert = false;
  store.users.set(1, { id: 1, name: "Admin", email: "a@i.com", role: "admin", isActive: true, allowedModules: null });
  store.users.set(2, { id: 2, name: "Man", email: "m@i.com", role: "manager", isActive: true, allowedModules: null });
  store.users.set(3, { id: 3, name: "Tec", email: "t@i.com", role: "technician", isActive: true, allowedModules: null });
});

const caller = (role: keyof typeof tokens) => appRouter.createCaller(ctx(`Bearer ${tokens[role]}`));
const pay = (role: keyof typeof tokens, jobId: number, amount: string) =>
  caller(role).jobs.registerPayment({ jobId, amount, date: "2026-08-10", paymentMethod: "transfer", notes: "" });
const jobMeta = (id: number) => JSON.parse(store.jobs.get(id).notes);

// Job con total = laborCost + IVA. Con ivaRate 0 → total = laborCost.
function seedJob(id: number, metaOver: Record<string, unknown> = {}, over: Record<string, unknown> = {}) {
  store.jobs.set(id, {
    id, jobNumber: `J${id}`, title: "Trabajo", customerName: "Cliente", customerCuit: "", invoiceNumber: "",
    customerId: null, status: "invoiced", paymentStatus: "pending",
    notes: JSON.stringify({ laborCost: "100000", ivaRate: 0, amountPaid: 0, ...metaOver }),
    ...over,
  });
}

// ============================================================
describe("MONTO — validación estricta", () => {
  beforeEach(() => seedJob(1));
  it("pago válido → OK", async () => {
    const r = await pay("manager", 1, "50000");
    expect(r.success).toBe(true);
    expect(r.newAmountPaid).toBe(50000);
    expect(r.isFullyPaid).toBe(false);
    expect(store.transactions).toHaveLength(1);
  });
  it("rechaza 0 / negativo / NaN / Infinity / texto / basura / >2 decimales / vacío / overflow (cero escrituras)", async () => {
    for (const bad of ["0", "-100", "NaN", "Infinity", "abc", "100abc", "10.999", "", "10000000000000"]) {
      await expect(pay("manager", 1, bad)).rejects.toThrow(PAYMENT_ERR.INVALID_AMOUNT);
    }
    expect(jobMeta(1).amountPaid).toBe(0);
    expect(store.transactions).toHaveLength(0);
  });
});

// ============================================================
describe("SALDO", () => {
  it("pago menor al saldo → OK (partial)", async () => {
    seedJob(1);
    const r = await pay("manager", 1, "40000");
    expect(r.isFullyPaid).toBe(false);
    expect(store.jobs.get(1).paymentStatus).toBe("partial");
  });
  it("pago igual al saldo → OK + completed + status collected", async () => {
    seedJob(1);
    const r = await pay("manager", 1, "100000");
    expect(r.isFullyPaid).toBe(true);
    expect(store.jobs.get(1).paymentStatus).toBe("completed");
    expect(store.jobs.get(1).status).toBe("collected");
  });
  it("pago mayor al saldo → rechazo, sin escrituras", async () => {
    seedJob(1);
    await expect(pay("manager", 1, "100000.01")).rejects.toThrow(PAYMENT_ERR.OVER_BALANCE);
    expect(jobMeta(1).amountPaid).toBe(0);
    expect(store.transactions).toHaveLength(0);
  });
  it("segundo pago sobre trabajo ya totalmente cobrado → rechazo", async () => {
    seedJob(1, { amountPaid: 100000 });
    await expect(pay("manager", 1, "1")).rejects.toThrow(PAYMENT_ERR.ALREADY_PAID);
    expect(store.transactions).toHaveLength(0);
  });
});

// ============================================================
describe("IVA y notes legacy/inválido", () => {
  it("cobro con IVA 21% calcula total correctamente", async () => {
    seedJob(1, { laborCost: "1000", ivaRate: 21, amountPaid: 0 }); // total 1210
    const r = await pay("manager", 1, "1210");
    expect(r.totalAmount).toBe(1210);
    expect(r.isFullyPaid).toBe(true);
  });
  it("ivaRate faltante → rechazo sin escrituras", async () => {
    store.jobs.set(1, { id: 1, jobNumber: "J1", title: "T", status: "invoiced", paymentStatus: "pending", notes: JSON.stringify({ laborCost: "1000", amountPaid: 0 }) });
    await expect(pay("manager", 1, "100")).rejects.toThrow(PAYMENT_ERR.IVA_MISSING);
    expect(store.transactions).toHaveLength(0);
    expect(jobMeta(1).amountPaid).toBe(0);
  });
  it("notes inválido/vacío → rechazo sin escrituras (no repara ni sobrescribe)", async () => {
    store.jobs.set(1, { id: 1, jobNumber: "J1", title: "T", status: "invoiced", paymentStatus: "pending", notes: "" });
    await expect(pay("manager", 1, "100")).rejects.toThrow(PAYMENT_ERR.INCOMPLETE);
    store.jobs.set(2, { id: 2, jobNumber: "J2", title: "T", status: "invoiced", paymentStatus: "pending", notes: "{no-json" });
    await expect(pay("manager", 2, "100")).rejects.toThrow(PAYMENT_ERR.INCOMPLETE);
    expect(store.transactions).toHaveLength(0);
    expect(store.jobs.get(1).notes).toBe(""); // no se sobrescribió
  });
});

// ============================================================
describe("COBROS LEGACY (amountPaid previo sin transactions)", () => {
  it("nuevo pago preserva el legacy y crea SOLO una transaction nueva", async () => {
    seedJob(1, { laborCost: "100000", ivaRate: 0, amountPaid: 40000 }); // total 100000, saldo 60000
    const r = await pay("manager", 1, "20000");
    expect(jobMeta(1).amountPaid).toBe(60000);       // 40000 legacy + 20000
    expect(store.transactions).toHaveLength(1);        // NO backfill de los 40000
    expect(store.transactions[0].amount).toBe(20000);
  });
});

// ============================================================
describe("CONCURRENCIA — lock serializa, sin lost update ni doble cobro", () => {
  it("80k + 80k sobre 100k → uno OK, otro rechazo; una sola transaction", async () => {
    seedJob(1); // total 100000
    await pay("manager", 1, "80000");
    await expect(pay("manager", 1, "80000")).rejects.toThrow(PAYMENT_ERR.OVER_BALANCE);
    expect(jobMeta(1).amountPaid).toBe(80000);
    expect(store.transactions).toHaveLength(1);
  });
  it("80k + 80k despachados 'simultáneos' → exactamente uno cobra", async () => {
    seedJob(1);
    const results = await Promise.allSettled([pay("manager", 1, "80000"), pay("manager", 1, "80000")]);
    const ok = results.filter(r => r.status === "fulfilled").length;
    const rejected = results.filter(r => r.status === "rejected").length;
    expect(ok).toBe(1);
    expect(rejected).toBe(1);
    expect(jobMeta(1).amountPaid).toBe(80000);
    expect(store.transactions).toHaveLength(1);
  });
  it("50k + 50k sobre 100k → ambos serializados; dos transactions; completed", async () => {
    seedJob(1);
    const r1 = await pay("manager", 1, "50000");
    expect(r1.isFullyPaid).toBe(false);
    const r2 = await pay("manager", 1, "50000");
    expect(r2.isFullyPaid).toBe(true);
    expect(jobMeta(1).amountPaid).toBe(100000);
    expect(store.transactions).toHaveLength(2);
    expect(store.jobs.get(1).paymentStatus).toBe("completed");
  });
});

// ============================================================
describe("ATOMICIDAD — rollback total ante cualquier fallo", () => {
  it("fallo al insertar la transaction → rollback del job (amountPaid intacto, sin transaction)", async () => {
    seedJob(1, { amountPaid: 30000 });
    store.failTxInsert = true;
    await expect(pay("manager", 1, "10000")).rejects.toThrow();
    expect(jobMeta(1).amountPaid).toBe(30000);
    expect(store.jobs.get(1).paymentStatus).toBe("pending");
    expect(store.transactions).toHaveLength(0);
  });
  it("fallo al actualizar el job → no se crea transaction", async () => {
    seedJob(1, { amountPaid: 30000 });
    store.failJobUpdate = true;
    await expect(pay("manager", 1, "10000")).rejects.toThrow();
    expect(jobMeta(1).amountPaid).toBe(30000);
    expect(store.transactions).toHaveLength(0);
  });
  it("fallo de validación (overpay) → cero escrituras", async () => {
    seedJob(1);
    await expect(pay("manager", 1, "200000")).rejects.toThrow(PAYMENT_ERR.OVER_BALANCE);
    expect(jobMeta(1).amountPaid).toBe(0);
    expect(store.transactions).toHaveLength(0);
  });
});

// ============================================================
describe("SEGURIDAD — permisos y campos server-side de la transaction", () => {
  it("Técnico NO puede registrar cobros; Manager y Admin sí", async () => {
    seedJob(1);
    await expect(pay("technician", 1, "1000")).rejects.toThrow(/permiso/i);
    await expect(pay("manager", 1, "1000")).resolves.toHaveProperty("success", true);
    await expect(pay("admin", 1, "1000")).resolves.toHaveProperty("success", true);
  });
  it("type/category/relatedJobId/amount de la transaction son los server-side esperados", async () => {
    seedJob(7);
    await pay("manager", 7, "12345.67");
    const t = store.transactions[0];
    expect(t.type).toBe("income");
    expect(t.category).toBe("Cobro de trabajo");
    expect(t.relatedJobId).toBe(7);
    expect(t.amount).toBe(12345.67);
  });
  it("sin token → no autenticado", async () => {
    seedJob(1);
    await expect(appRouter.createCaller(ctx()).jobs.registerPayment({ jobId: 1, amount: "100", date: "2026-08-10", paymentMethod: "transfer", notes: "" }))
      .rejects.toThrow(/Sesión expirada/);
  });
});
