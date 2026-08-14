import { describe, it, expect, beforeEach } from "vitest";
import { registerJobPaymentAtomic, PaymentError, PAYMENT_ERR } from "./db";
import { jobs as jobsTable, transactions as txTable } from "../drizzle/schema";

// 8B-5c — CUTOVER PEREZOSO + COBRO CANÓNICO.
//
// Ejercita la lógica REAL de registerJobPaymentAtomic (no una reimplementación):
// se le inyecta un fake TRANSACCIONAL in-memory (mismo patrón DI que
// exportAllData/seedIngemUsers). Vitest nunca abre una conexión real (getDb es
// fail-closed), así que el fake modela db.transaction + FOR UPDATE + SELECT/UPDATE/
// INSERT contra Maps en memoria, con ROLLBACK por restauración de snapshot.
//
// Invariante central verificado: paidCanónico(job) = legacyPaidBase +
// SUM(transactions con isJobPayment=true). El cache amountPaid NUNCA es fuente de
// verdad para el saldo. La base legacy se congela UNA vez, ANTES de insertar el
// primer cobro marcado, bajo el mismo lock → jamás doble conteo.

// ---- Fake transaccional in-memory --------------------------------------------

type Store = {
  jobs: Map<number, any>;
  transactions: Map<number, any>;
  nextTxId: number;
};

// Extrae los parámetros ligados (bound params) de una condición SQL de drizzle,
// recorriendo sus queryChunks. Sirve para saber a qué job apunta cada query sin
// depender de una conexión real. Un bound param es un chunk con `encoder` y un
// `value` primitivo (los StringChunk tienen value:string[] → se ignoran).
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
  const numId = params.find((p) => typeof p === "number");
  if (table === jobsTable) {
    const j = store.jobs.get(numId);
    return j ? [{ ...j }] : [];
  }
  if (table === txTable) {
    // SUM canónico: sólo cobros marcados de ese job.
    const rows: any[] = [];
    for (const t of store.transactions.values()) {
      if (t.relatedJobId === numId && t.isJobPayment === true) rows.push({ amount: t.amount });
    }
    return rows;
  }
  return [];
}

function selectBuilder(store: Store) {
  const b: any = {
    _table: null as any,
    _pred: null as any,
    from(table: any) { b._table = table; return b; },
    where(pred: any) { b._pred = pred; return b; },
    for() { return b; },
    then(resolve: (v: any) => void, reject: (e: any) => void) {
      try { resolve(execSelect(store, b._table, b._pred)); } catch (e) { reject(e); }
    },
  };
  return b;
}

function updateBuilder(store: Store) {
  const b: any = {
    _set: null as any,
    _pred: null as any,
    set(o: any) { b._set = o; return b; },
    where(pred: any) { b._pred = pred; return b; },
    then(resolve: (v: any) => void, reject: (e: any) => void) {
      try {
        const id = boundParams(b._pred).find((p) => typeof p === "number");
        const row = store.jobs.get(id);
        if (row) Object.assign(row, b._set);
        resolve(undefined);
      } catch (e) { reject(e); }
    },
  };
  return b;
}

function insertBuilder(store: Store) {
  const b: any = {
    _vals: null as any,
    values(o: any) { b._vals = o; return b; },
    then(resolve: (v: any) => void, reject: (e: any) => void) {
      try {
        const id = store.nextTxId++;
        store.transactions.set(id, { id, ...b._vals });
        resolve([{ insertId: id }]);
      } catch (e) { reject(e); }
    },
  };
  return b;
}

function makeFakeDb(store: Store) {
  return {
    transaction: async (cb: (tx: any) => Promise<any>) => {
      // Snapshot para ROLLBACK: si el callback lanza, se restaura el estado previo
      // (base sin congelar, sin cobro insertado) — modela el ROLLBACK atómico.
      const snapJobs = new Map([...store.jobs].map(([k, v]) => [k, { ...v }]));
      const snapTx = new Map([...store.transactions].map(([k, v]) => [k, { ...v }]));
      const snapNext = store.nextTxId;
      const tx = {
        select: (_proj?: any) => selectBuilder(store),
        update: (_table: any) => updateBuilder(store),
        insert: (_table: any) => insertBuilder(store),
      };
      try {
        return await cb(tx);
      } catch (e) {
        store.jobs = snapJobs;
        store.transactions = snapTx;
        store.nextTxId = snapNext;
        throw e;
      }
    },
  };
}

// ---- Helpers de escenario ----------------------------------------------------

// Construye el blob notes del job. ivaRate=0 → total = laborCost (aritmética simple
// y determinista). `paid` es el amountPaid legacy/cache (number|string|omitido).
function jobNotes(opts: { labor: number | string; iva?: number | string; paid?: number | string; noIva?: boolean }): string {
  const meta: Record<string, unknown> = {
    laborCost: String(opts.labor),
    materialsCost: "0",
    otherCosts: "0",
    amountPaid: opts.paid ?? 0,
  };
  if (!opts.noIva) meta.ivaRate = opts.iva ?? 0;
  return JSON.stringify(meta);
}

function seedJob(store: Store, id: number, opts: { notes: string; base?: string | null; status?: string }) {
  store.jobs.set(id, {
    id,
    jobNumber: `J${id}`,
    title: "Trabajo",
    customerName: "Cliente",
    customerId: null,
    customerCuit: "",
    invoiceNumber: "",
    invoiceType: "",
    status: opts.status ?? "invoiced",
    paymentStatus: "partial",
    legacyPaidBase: opts.base === undefined ? null : opts.base,
    notes: opts.notes,
  });
}

const pay = (store: Store, jobId: number, amountCents: number) =>
  registerJobPaymentAtomic(
    { jobId, amountCents, date: "2026-08-14", paymentMethod: "transfer", notes: "" },
    makeFakeDb(store),
  );

const cacheOf = (store: Store, id: number) => JSON.parse(store.jobs.get(id).notes).amountPaid;
const markedTxs = (store: Store, jobId: number) =>
  [...store.transactions.values()].filter((t) => t.relatedJobId === jobId && t.isJobPayment === true);

let store: Store;
beforeEach(() => { store = { jobs: new Map(), transactions: new Map(), nextTxId: 1 }; });

// ---- Cutover A–M -------------------------------------------------------------

describe("8B-5c — cutover perezoso (A–M)", () => {
  it("A) primer cobro congela legacyPaidBase desde el amountPaid legacy (no lo suma) y marca el cobro", async () => {
    seedJob(store, 1, { notes: jobNotes({ labor: 10000, paid: 4000 }), base: null });
    const r = await pay(store, 1, 3000_00);
    // base congelada == legacy (4000), NUNCA 4000+3000.
    expect(store.jobs.get(1).legacyPaidBase).toBe("4000.00");
    const marked = markedTxs(store, 1);
    expect(marked).toHaveLength(1);
    expect(marked[0].isJobPayment).toBe(true);
    expect(marked[0].amount).toBe("3000");
    expect(marked[0].relatedJobId).toBe(1);
    // cache = paidCanónico = 4000 + 3000.
    expect(cacheOf(store, 1)).toBe(7000);
    expect(r.newAmountPaid).toBe(7000);
    expect(r.isFullyPaid).toBe(false);
    expect(store.jobs.get(1).paymentStatus).toBe("partial");
  });

  it("B) el segundo cobro NO re-congela la base y usa el SUM de marcados (sin doble conteo)", async () => {
    seedJob(store, 1, { notes: jobNotes({ labor: 10000, paid: 4000 }), base: null });
    await pay(store, 1, 3000_00);
    const r2 = await pay(store, 1, 3000_00);
    expect(store.jobs.get(1).legacyPaidBase).toBe("4000.00"); // intacta
    expect(markedTxs(store, 1)).toHaveLength(2);
    // canónico = 4000 + (3000+3000) = 10000 = total → totalmente cobrado.
    expect(cacheOf(store, 1)).toBe(10000);
    expect(r2.isFullyPaid).toBe(true);
    expect(store.jobs.get(1).status).toBe("collected");
    expect(store.jobs.get(1).paymentStatus).toBe("completed");
  });

  it("C/D) job con legacyPaidBase ya seteada (0.00, jobs nuevos) → no congela, base=0", async () => {
    seedJob(store, 2, { notes: jobNotes({ labor: 10000, paid: 0 }), base: "0.00" });
    const r = await pay(store, 2, 2500_00);
    expect(store.jobs.get(2).legacyPaidBase).toBe("0.00"); // sin cambios
    expect(markedTxs(store, 2)).toHaveLength(1);
    expect(cacheOf(store, 2)).toBe(2500);
    expect(r.newAmountPaid).toBe(2500);
  });

  it("E) el saldo NO confía en el cache amountPaid: usa base+marcados aunque el cache esté corrupto", async () => {
    // Cache corrupto/enorme (999999) pero base congelada 5000. Si el saldo mirara
    // el cache, rechazaría por ALREADY_PAID; con base+marcados el saldo es 5000.
    seedJob(store, 3, { notes: jobNotes({ labor: 10000, paid: 999999 }), base: "5000.00" });
    const r = await pay(store, 3, 2000_00);
    expect(r.isFullyPaid).toBe(false);
    expect(cacheOf(store, 3)).toBe(7000); // cache reparado a paidCanónico
  });

  it("F) transactions históricas (isJobPayment=false) NUNCA entran al SUM canónico", async () => {
    seedJob(store, 4, { notes: jobNotes({ labor: 10000, paid: 0 }), base: "0.00" });
    // Histórica income / 'Cobro de trabajo' / completed, pero NO marcada. Importe
    // 9000: si contara, saldo=1000 y un cobro de 3000 sería OVER_BALANCE.
    store.transactions.set(900, {
      id: 900, type: "income", category: "Cobro de trabajo", status: "completed",
      relatedJobId: 4, amount: "9000", isJobPayment: false,
    });
    const r = await pay(store, 4, 3000_00); // no rechazado ⇒ la histórica se ignoró
    expect(r.newAmountPaid).toBe(3000);
    expect(markedTxs(store, 4)).toHaveLength(1); // sólo el cobro nuevo
  });

  it("G) overpay contra el saldo canónico → OVER_BALANCE, sin congelar ni insertar", async () => {
    seedJob(store, 5, { notes: jobNotes({ labor: 10000, paid: 0 }), base: "8000.00" });
    await expect(pay(store, 5, 3000_00)).rejects.toThrow(PAYMENT_ERR.OVER_BALANCE);
    expect(store.jobs.get(5).legacyPaidBase).toBe("8000.00");
    expect(markedTxs(store, 5)).toHaveLength(0);
  });

  it("H) job ya totalmente cobrado (base==total) → ALREADY_PAID", async () => {
    seedJob(store, 6, { notes: jobNotes({ labor: 10000, paid: 0 }), base: "10000.00" });
    await expect(pay(store, 6, 1_00)).rejects.toThrow(PAYMENT_ERR.ALREADY_PAID);
  });

  it("I) ROLLBACK: amountPaid legacy ilegible en base NULL → CUTOVER_REVIEW, base NO congelada", async () => {
    seedJob(store, 7, { notes: jobNotes({ labor: 10000, paid: "abc" }), base: null });
    await expect(pay(store, 7, 1000_00)).rejects.toThrow(PAYMENT_ERR.CUTOVER_REVIEW);
    expect(store.jobs.get(7).legacyPaidBase).toBeNull(); // no se congeló nada
    expect(markedTxs(store, 7)).toHaveLength(0);
    expect(store.nextTxId).toBe(1); // ningún insert
  });

  it("J) ROLLBACK crítico: overpay sobre job NULL-base → la base NO queda congelada", async () => {
    // El congelado y el cobro viven en la MISMA transacción; si el cobro es
    // inválido, el ROLLBACK deja la base sin congelar (no hay estado parcial).
    seedJob(store, 8, { notes: jobNotes({ labor: 10000, paid: 9000 }), base: null });
    await expect(pay(store, 8, 3000_00)).rejects.toThrow(PAYMENT_ERR.OVER_BALANCE);
    expect(store.jobs.get(8).legacyPaidBase).toBeNull();
    expect(markedTxs(store, 8)).toHaveLength(0);
  });

  it("K) ROLLBACK: IVA ausente → IVA_MISSING, sin congelar ni insertar", async () => {
    seedJob(store, 9, { notes: jobNotes({ labor: 10000, paid: 0, noIva: true }), base: null });
    await expect(pay(store, 9, 1000_00)).rejects.toThrow(PAYMENT_ERR.IVA_MISSING);
    expect(store.jobs.get(9).legacyPaidBase).toBeNull();
    expect(markedTxs(store, 9)).toHaveLength(0);
  });

  it("L) congelado EXACTO sólo para montos inequívocos (≤2 decimales); nunca se redondea", async () => {
    // Inequívoco (2 decimales exactos) → se congela tal cual, sin float.
    seedJob(store, 10, { notes: jobNotes({ labor: 100000, paid: 1234.5 }), base: null });
    await pay(store, 10, 1_00);
    expect(store.jobs.get(10).legacyPaidBase).toBe("1234.50");

    // Entero → base con 2 decimales exactos.
    seedJob(store, 13, { notes: jobNotes({ labor: 100000, paid: 4000 }), base: null });
    await pay(store, 13, 1_00);
    expect(store.jobs.get(13).legacyPaidBase).toBe("4000.00");

    // Ceros a la derecha NO cuentan como precisión → "1234.500" == 1234.50 se acepta.
    seedJob(store, 14, { notes: jobNotes({ labor: 100000, paid: "1234.500" }), base: null });
    await pay(store, 14, 1_00);
    expect(store.jobs.get(14).legacyPaidBase).toBe("1234.50");

    // amountPaid ausente → base 0.00 (inequívoco: nada cobrado).
    seedJob(store, 15, { notes: JSON.stringify({ laborCost: "100000", materialsCost: "0", otherCosts: "0", ivaRate: 0 }), base: null });
    await pay(store, 15, 1_00);
    expect(store.jobs.get(15).legacyPaidBase).toBe("0.00");
  });

  it("L2) FAIL-CLOSED: amountPaid con >2 decimales inesperados NO se congela (CUTOVER_REVIEW)", async () => {
    // El caso que antes se redondeaba silenciosamente (100.005). Ahora se rechaza:
    // los 7 históricos aprobados se migran por backfill controlado (8B-5d), no acá.
    seedJob(store, 16, { notes: jobNotes({ labor: 100000, paid: 100.005 }), base: null });
    await expect(pay(store, 16, 1_00)).rejects.toThrow(PAYMENT_ERR.CUTOVER_REVIEW);
    expect(store.jobs.get(16).legacyPaidBase).toBeNull(); // NO congelada
    expect(markedTxs(store, 16)).toHaveLength(0);

    // Idem con string con exceso de precisión.
    seedJob(store, 17, { notes: jobNotes({ labor: 100000, paid: "4000.999" }), base: null });
    await expect(pay(store, 17, 1_00)).rejects.toThrow(PAYMENT_ERR.CUTOVER_REVIEW);
    expect(store.jobs.get(17).legacyPaidBase).toBeNull();
    expect(markedTxs(store, 17)).toHaveLength(0);
  });

  it("M) transición de estados y refresco de cache: parcial mantiene status; total → collected/completed", async () => {
    seedJob(store, 12, { notes: jobNotes({ labor: 10000, paid: 0 }), base: "0.00", status: "invoiced" });
    const r1 = await pay(store, 12, 4000_00);
    expect(r1.oldStatus).toBe("invoiced");
    expect(r1.newStatus).toBe("invoiced"); // parcial no cambia status del job
    expect(store.jobs.get(12).paymentStatus).toBe("partial");
    expect(cacheOf(store, 12)).toBe(4000);

    const r2 = await pay(store, 12, 6000_00);
    expect(r2.isFullyPaid).toBe(true);
    expect(r2.newStatus).toBe("collected");
    expect(store.jobs.get(12).paymentStatus).toBe("completed");
    expect(cacheOf(store, 12)).toBe(10000);
  });
});

// ---- Concurrencia (serializada por FOR UPDATE) -------------------------------

describe("8B-5c — concurrencia bajo lock (serializada) sin doble conteo", () => {
  // FOR UPDATE serializa a los cobros concurrentes del mismo job: el orden real
  // garantizado es secuencial, así que se modela así. El invariante a probar es
  // que tras N cobros: cache == base + SUM(marcados) == suma exacta, base
  // congelada una sola vez.

  it("Caso 1 (base NULL): dos cobros → base congelada una vez, canónico exacto", async () => {
    seedJob(store, 20, { notes: jobNotes({ labor: 10000, paid: 2000 }), base: null });
    await pay(store, 20, 3000_00);
    await pay(store, 20, 1000_00);
    const base = store.jobs.get(20).legacyPaidBase;
    expect(base).toBe("2000.00"); // congelada una sola vez
    const sum = markedTxs(store, 20).reduce((a, t) => a + Number(t.amount), 0);
    expect(sum).toBe(4000); // 3000 + 1000
    expect(cacheOf(store, 20)).toBe(2000 + 4000); // base + marcados, sin doble conteo
  });

  it("Caso 2 (base seteada): dos cobros acumulan por SUM, base intacta", async () => {
    seedJob(store, 21, { notes: jobNotes({ labor: 10000, paid: 0 }), base: "0.00" });
    await pay(store, 21, 2500_00);
    await pay(store, 21, 2500_00);
    expect(store.jobs.get(21).legacyPaidBase).toBe("0.00");
    expect(markedTxs(store, 21)).toHaveLength(2);
    expect(cacheOf(store, 21)).toBe(5000);
  });

  it("Caso legacy: el 2º cobro ve la base ya congelada (no relee un cache stale)", async () => {
    // amountPaid legacy 6000; tras el 1er cobro la base queda "6000.00". Si el 2º
    // releyera el cache (ya 6000+pago) para la base, habría doble conteo; no ocurre.
    seedJob(store, 22, { notes: jobNotes({ labor: 20000, paid: 6000 }), base: null });
    await pay(store, 22, 4000_00); // cache pasa a 10000
    await pay(store, 22, 5000_00);
    expect(store.jobs.get(22).legacyPaidBase).toBe("6000.00");
    const sum = markedTxs(store, 22).reduce((a, t) => a + Number(t.amount), 0);
    expect(sum).toBe(9000);
    expect(cacheOf(store, 22)).toBe(6000 + 9000); // 15000, no 6000+10000+…
  });
});
