import { describe, it, expect, beforeEach } from "vitest";
import { registerJobPaymentAtomic, PAYMENT_ERR } from "./db";
import { jobs as jobsTable, transactions as txTable, systemControls as sysCtrlTable } from "../drizzle/schema";
import { PAYMENTS_LOCKED_KEY } from "./paymentsGate";

// 8B-5 (RELEASE INTERMEDIO) — el gate a través del registerJobPaymentAtomic
// productivo 8B-2/8B-3 (basado en amountPaid, SIN legacyPaidBase/isJobPayment).
// Verifica la MISMA semántica de gate que el canónico: 'false' deja pasar; cerrado
// ⇒ MAINTENANCE + cero escrituras, ANTES de tocar el job.

type Store = {
  jobs: Map<number, any>;
  transactions: Map<number, any>;
  controls: Map<string, string>;
  nextTxId: number;
};

function boundParams(cond: any): any[] {
  const out: any[] = [];
  const seen = new Set<any>();
  const walk = (c: any) => {
    if (!c || typeof c !== "object" || seen.has(c)) return;
    seen.add(c);
    if (Array.isArray(c)) { c.forEach(walk); return; }
    if ("encoder" in c && "value" in c && typeof c.value !== "object") out.push(c.value);
    if (Array.isArray(c.queryChunks)) c.queryChunks.forEach(walk);
  };
  walk(cond);
  return out;
}

function execSelect(store: Store, table: any, pred: any): any[] {
  const params = boundParams(pred);
  if (table === sysCtrlTable) {
    const key = params.find((p) => typeof p === "string");
    return store.controls.has(key) ? [{ value: store.controls.get(key) }] : [];
  }
  if (table === jobsTable) {
    const id = params.find((p) => typeof p === "number");
    const j = store.jobs.get(id);
    return j ? [{ ...j }] : [];
  }
  return [];
}

function makeFakeDb(store: Store) {
  const selectB = () => {
    const b: any = {
      _t: null, _p: null,
      from(t: any) { b._t = t; return b; },
      where(p: any) { b._p = p; return b; },
      for() { return b; },
      then(res: any, rej: any) { try { res(execSelect(store, b._t, b._p)); } catch (e) { rej(e); } },
    };
    return b;
  };
  const updateB = () => {
    const b: any = {
      _s: null, _p: null,
      set(o: any) { b._s = o; return b; },
      where(p: any) { b._p = p; return b; },
      then(res: any, rej: any) {
        try { const id = boundParams(b._p).find((p) => typeof p === "number"); const r = store.jobs.get(id); if (r) Object.assign(r, b._s); res(undefined); }
        catch (e) { rej(e); }
      },
    };
    return b;
  };
  const insertB = () => {
    const b: any = {
      _v: null,
      values(o: any) { b._v = o; return b; },
      then(res: any, rej: any) { try { const id = store.nextTxId++; store.transactions.set(id, { id, ...b._v }); res([{ insertId: id }]); } catch (e) { rej(e); } },
    };
    return b;
  };
  return {
    transaction: async (cb: (tx: any) => Promise<any>) => {
      const snapJobs = new Map([...store.jobs].map(([k, v]) => [k, { ...v }]));
      const snapTx = new Map([...store.transactions].map(([k, v]) => [k, { ...v }]));
      const snapCtl = new Map([...store.controls]);
      const snapNext = store.nextTxId;
      try {
        return await cb({ select: () => selectB(), update: () => updateB(), insert: () => insertB() });
      } catch (e) {
        store.jobs = snapJobs; store.transactions = snapTx; store.controls = snapCtl; store.nextTxId = snapNext;
        throw e;
      }
    },
  };
}

const notes = () => JSON.stringify({ laborCost: "10000", materialsCost: "0", otherCosts: "0", ivaRate: 0, amountPaid: 0 });
const seedJob = (store: Store, id: number) =>
  store.jobs.set(id, {
    id, jobNumber: `J${id}`, title: "T", customerName: "C", customerId: null, customerCuit: "",
    invoiceNumber: "", status: "invoiced", paymentStatus: "partial", notes: notes(),
  });
const pay = (store: Store, jobId: number, cents: number) =>
  registerJobPaymentAtomic({ jobId, amountCents: cents, date: "2026-08-14", paymentMethod: "transfer", notes: "" }, makeFakeDb(store));

let store: Store;
beforeEach(() => {
  store = { jobs: new Map(), transactions: new Map(), controls: new Map(), nextTxId: 1 };
  store.controls.set(PAYMENTS_LOCKED_KEY, "false");
});

describe("8B-5 intermedio — gate vía registerJobPaymentAtomic (8B-2/8B-3)", () => {
  it("A) gate 'false' → el cobro funciona (inserta transaction, actualiza amountPaid)", async () => {
    seedJob(store, 1);
    const r = await pay(store, 1, 3000_00);
    expect(r.newAmountPaid).toBe(3000);
    expect(store.transactions.size).toBe(1);
    expect(JSON.parse(store.jobs.get(1).notes).amountPaid).toBe(3000);
  });

  it("B) gate 'true' → PAYMENTS_MAINTENANCE y CERO escrituras", async () => {
    store.controls.set(PAYMENTS_LOCKED_KEY, "true");
    seedJob(store, 2);
    const notesBefore = store.jobs.get(2).notes;
    await expect(pay(store, 2, 3000_00)).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    expect(store.transactions.size).toBe(0);
    expect(store.jobs.get(2).notes).toBe(notesBefore); // job intacto (gate antes del job)
  });

  it("C) fila del gate AUSENTE → fail-closed", async () => {
    store.controls.delete(PAYMENTS_LOCKED_KEY);
    seedJob(store, 3);
    await expect(pay(store, 3, 1000_00)).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    expect(store.transactions.size).toBe(0);
  });

  it("D/E) vacío y corrupto → fail-closed", async () => {
    for (const [id, v] of [[4, ""], [5, "1"], [6, "TRUE"], [7, "0"]] as Array<[number, string]>) {
      store.controls.set(PAYMENTS_LOCKED_KEY, v);
      seedJob(store, id);
      await expect(pay(store, id, 1000_00)).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    }
    expect(store.transactions.size).toBe(0);
  });
});
