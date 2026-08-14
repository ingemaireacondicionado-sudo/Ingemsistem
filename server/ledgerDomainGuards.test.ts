import { describe, it, expect, beforeEach } from "vitest";
import {
  createTransaction, updateTransaction, deleteTransaction,
  createJob, updateJob, createJobWithFileBindings, updateJobWithFileBindings,
  PAYMENT_ERR,
} from "./db";
import { jobs as jobsTable, transactions as txTable, privateFiles as pfTable } from "../drizzle/schema";

// 8B-5c — GUARDS EN LA CAPA DB/DOMAIN (no sólo en routers.ts).
//
// Se ejercita la lógica REAL de las funciones de db inyectando un fake in-memory
// (patrón DI). Garantiza que las invariantes se mantienen aunque un llamador
// evite el router:
//   A) createTransaction genérico NO puede crear isJobPayment=true.
//   B) updateTransaction genérico NO puede modificar una transaction marcada
//      (ni cambiar isJobPayment de una no marcada).
//   C) deleteTransaction genérico NO puede borrar una transaction marcada.
//   D) sólo registerJobPaymentAtomic crea isJobPayment=true (createTransaction
//      lo fuerza a false).
//   E) createJob(+WithFileBindings) nace con legacyPaidBase=0.00; updateJob
//      (+WithFileBindings) NO puede modificar legacyPaidBase.
//   + Blindaje de MONEDA en updateJobWithFileBindings.

type Store = {
  jobs: Map<number, any>;
  transactions: Map<number, any>;
  privateFiles: Map<number, any>;
  nextJobId: number;
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
  const num = params.find((p) => typeof p === "number");
  if (table === jobsTable) {
    const j = store.jobs.get(num);
    return j ? [{ ...j }] : [];
  }
  if (table === txTable) {
    // La query del SUM/currency filtra isJobPayment=true (aparece un bool true en
    // los params); la del guard busca por id (sólo un número).
    if (params.some((p) => p === true)) {
      return [...store.transactions.values()]
        .filter((t) => t.relatedJobId === num && t.isJobPayment === true)
        .map((t) => ({ id: t.id, amount: t.amount }));
    }
    const t = store.transactions.get(num);
    return t ? [{ ...t }] : [];
  }
  if (table === pfTable) return []; // sin archivos en estos tests
  return [];
}

function builders(store: Store) {
  return {
    select: (_proj?: any) => {
      const b: any = {
        _table: null, _pred: null,
        from(t: any) { b._table = t; return b; },
        where(p: any) { b._pred = p; return b; },
        limit(_n: number) { return b; },
        for() { return b; },
        then(res: any, rej: any) { try { res(execSelect(store, b._table, b._pred)); } catch (e) { rej(e); } },
      };
      return b;
    },
    insert: (table: any) => {
      const b: any = {
        _vals: null,
        values(o: any) { b._vals = o; return b; },
        then(res: any, rej: any) {
          try {
            if (table === jobsTable) { const id = store.nextJobId++; store.jobs.set(id, { id, ...b._vals }); res([{ insertId: id }]); }
            else { const id = store.nextTxId++; store.transactions.set(id, { id, ...b._vals }); res([{ insertId: id }]); }
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
    update: (table: any) => {
      const b: any = {
        _set: null, _pred: null,
        set(o: any) { b._set = o; return b; },
        where(p: any) { b._pred = p; return b; },
        then(res: any, rej: any) {
          try {
            const id = boundParams(b._pred).find((p) => typeof p === "number");
            const map = table === jobsTable ? store.jobs : table === txTable ? store.transactions : store.privateFiles;
            const row = map.get(id);
            if (row) Object.assign(row, b._set);
            res(undefined);
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
    delete: (table: any) => {
      const b: any = {
        _pred: null,
        where(p: any) { b._pred = p; return b; },
        then(res: any, rej: any) {
          try {
            const id = boundParams(b._pred).find((p) => typeof p === "number");
            const map = table === txTable ? store.transactions : store.jobs;
            map.delete(id);
            res(undefined);
          } catch (e) { rej(e); }
        },
      };
      return b;
    },
  };
}

function makeFakeDb(store: Store) {
  const flat = builders(store);
  return {
    ...flat,
    transaction: async (cb: (tx: any) => Promise<any>) => {
      const snapJobs = new Map([...store.jobs].map(([k, v]) => [k, { ...v }]));
      const snapTx = new Map([...store.transactions].map(([k, v]) => [k, { ...v }]));
      const snapPf = new Map([...store.privateFiles].map(([k, v]) => [k, { ...v }]));
      try {
        return await cb(builders(store));
      } catch (e) {
        store.jobs = snapJobs; store.transactions = snapTx; store.privateFiles = snapPf;
        throw e;
      }
    },
  };
}

function seedMarked(store: Store, jobId: number, amount: unknown) {
  const id = store.nextTxId++;
  store.transactions.set(id, { id, type: "income", category: "Cobro de trabajo", relatedJobId: jobId, amount, isJobPayment: true });
  return id;
}

let store: Store;
let fake: any;
beforeEach(() => {
  store = { jobs: new Map(), transactions: new Map(), privateFiles: new Map(), nextJobId: 1, nextTxId: 1 };
  fake = makeFakeDb(store);
});

describe("8B-5c — guards DB/domain: transactions", () => {
  it("A) createTransaction fuerza isJobPayment=false aunque el llamador mande true", async () => {
    const r = await createTransaction({ type: "income", amount: "100", relatedJobId: 9, isJobPayment: true } as any, fake);
    expect(store.transactions.get(r.id).isJobPayment).toBe(false);
  });

  it("B) updateTransaction rechaza modificar un cobro marcado", async () => {
    store.transactions.set(1, { id: 1, amount: "100", isJobPayment: true });
    await expect(updateTransaction(1, { amount: "999" }, fake)).rejects.toThrow(PAYMENT_ERR.PROTECTED);
    expect(store.transactions.get(1).amount).toBe("100");
  });

  it("B') updateTransaction nunca cambia isJobPayment de una fila NO marcada", async () => {
    store.transactions.set(2, { id: 2, amount: "100", isJobPayment: false });
    await updateTransaction(2, { amount: "200", isJobPayment: true } as any, fake);
    expect(store.transactions.get(2).amount).toBe("200"); // el resto sí se edita
    expect(store.transactions.get(2).isJobPayment).toBe(false); // jamás se marca desde acá
  });

  it("C) deleteTransaction rechaza borrar un cobro marcado; una no marcada sí se borra", async () => {
    store.transactions.set(3, { id: 3, isJobPayment: true });
    await expect(deleteTransaction(3, fake)).rejects.toThrow(PAYMENT_ERR.PROTECTED);
    expect(store.transactions.has(3)).toBe(true);

    store.transactions.set(4, { id: 4, isJobPayment: false });
    await deleteTransaction(4, fake);
    expect(store.transactions.has(4)).toBe(false);
  });

  it("D) el CRUD genérico nunca produce un cobro marcado (sólo registerJobPaymentAtomic)", async () => {
    const r = await createTransaction({ type: "income", amount: "500", isJobPayment: true } as any, fake);
    expect(store.transactions.get(r.id).isJobPayment).toBe(false);
    // No hay ninguna otra vía en el CRUD que ponga true.
    expect([...store.transactions.values()].some((t) => t.isJobPayment === true)).toBe(false);
  });

  it("el mensaje PROTECTED de db coincide con el del router (fuente única de texto)", () => {
    expect(PAYMENT_ERR.PROTECTED).toBe(
      "Este movimiento es un cobro registrado del sistema y no puede editarse ni eliminarse manualmente.",
    );
  });
});

describe("8B-5c — guards DB/domain: legacyPaidBase en jobs", () => {
  it("E) createJob fuerza legacyPaidBase=0.00 aunque el llamador mande otro valor", async () => {
    const r = await createJob({ jobNumber: "J1", title: "T", legacyPaidBase: "999999.00" } as any, fake);
    expect(store.jobs.get(r.id).legacyPaidBase).toBe("0.00");
  });

  it("E') createJobWithFileBindings también nace con legacyPaidBase=0.00", async () => {
    const r = await createJobWithFileBindings({ jobNumber: "J2", title: "T", legacyPaidBase: "5.55" } as any, [], 1, fake);
    expect(store.jobs.get(r.id).legacyPaidBase).toBe("0.00");
  });

  it("E'') updateJob NO puede modificar legacyPaidBase (se preserva el real)", async () => {
    store.jobs.set(10, { id: 10, title: "T", legacyPaidBase: "5000.00" });
    await updateJob(10, { title: "editado", legacyPaidBase: "999999.00" } as any, fake);
    expect(store.jobs.get(10).legacyPaidBase).toBe("5000.00");
    expect(store.jobs.get(10).title).toBe("editado");
  });

  it("E''') updateJobWithFileBindings tampoco puede modificar legacyPaidBase", async () => {
    store.jobs.set(11, { id: 11, title: "T", paymentStatus: "partial", legacyPaidBase: "5000.00", notes: JSON.stringify({ currency: "ARS" }) });
    await updateJobWithFileBindings(11, { title: "editado", legacyPaidBase: "999999.00", notes: JSON.stringify({ currency: "ARS" }) } as any, null, 1, fake);
    expect(store.jobs.get(11).legacyPaidBase).toBe("5000.00");
    expect(store.jobs.get(11).title).toBe("editado");
  });
});

describe("8B-5c — blindaje de MONEDA en jobs.update (DB/domain)", () => {
  const notes = (o: Record<string, unknown>) => JSON.stringify(o);
  const seedJobCur = (id: number, opts: { base: string | null; currency: string; amountPaid?: unknown }) =>
    store.jobs.set(id, {
      id, title: "T", paymentStatus: "partial", legacyPaidBase: opts.base,
      notes: notes({ currency: opts.currency, laborCost: "10000", amountPaid: opts.amountPaid ?? 0 }),
    });
  const currencyOf = (id: number) => JSON.parse(store.jobs.get(id).notes).currency;

  it("bloquea ARS→USD si hay un cobro marcado", async () => {
    seedJobCur(60, { base: "0.00", currency: "ARS" });
    seedMarked(store, 60, "1000");
    await expect(updateJobWithFileBindings(60, { notes: notes({ currency: "USD", laborCost: "10000" }) }, null, 1, fake))
      .rejects.toThrow(PAYMENT_ERR.CURRENCY_LOCKED);
    expect(currencyOf(60)).toBe("ARS");
  });

  it("bloquea USD→ARS si legacyPaidBase > 0 (aunque no haya marcados)", async () => {
    seedJobCur(61, { base: "5000.00", currency: "USD" });
    await expect(updateJobWithFileBindings(61, { notes: notes({ currency: "ARS", laborCost: "10000" }) }, null, 1, fake))
      .rejects.toThrow(PAYMENT_ERR.CURRENCY_LOCKED);
    expect(currencyOf(61)).toBe("USD");
  });

  it("bloquea el cambio si la base aún es NULL pero el amountPaid legacy > 0", async () => {
    seedJobCur(62, { base: null, currency: "ARS", amountPaid: 3000 });
    await expect(updateJobWithFileBindings(62, { notes: notes({ currency: "USD", laborCost: "10000", amountPaid: 3000 }) }, null, 1, fake))
      .rejects.toThrow(PAYMENT_ERR.CURRENCY_LOCKED);
    expect(currencyOf(62)).toBe("ARS");
  });

  it("PERMITE el cambio en un job sin historia financiera (base 0.00, sin marcados, sin cobros)", async () => {
    seedJobCur(63, { base: "0.00", currency: "ARS", amountPaid: 0 });
    await updateJobWithFileBindings(63, { notes: notes({ currency: "USD", laborCost: "10000", amountPaid: 0 }) }, null, 1, fake);
    expect(currencyOf(63)).toBe("USD");
  });

  it("no interfiere cuando la moneda NO cambia, aunque haya historia", async () => {
    seedJobCur(64, { base: "5000.00", currency: "ARS" });
    seedMarked(store, 64, "1000");
    await updateJobWithFileBindings(64, { title: "editado", notes: notes({ currency: "ARS", laborCost: "10000" }) }, null, 1, fake);
    expect(currencyOf(64)).toBe("ARS");
    expect(store.jobs.get(64).title).toBe("editado");
  });
});
