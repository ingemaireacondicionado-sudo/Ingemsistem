import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { assertPaymentsGateOpen, runPessimisticPaymentTx, PAYMENTS_LOCKED_KEY } from "./paymentsGate";
import { PaymentError, PAYMENT_ERR } from "./db";
import { systemControls, jobs as jobsTable, transactions as txTable } from "../drizzle/schema";

// 8B-5 — CONTRATO del helper compartido del gate. Al ser el MISMO módulo importado
// por el release intermedio y por el canónico, esta suite fija la semántica común
// de AMBAS versiones (test "N": misma semántica en las dos ramas).

// Fake mínimo de `tx` para el gate: registra que se pidió FOR UPDATE y sobre qué
// tabla/predicado, y permite inyectar filas o un error de lectura.
function gateTx(opts: { rows?: any[]; throwOnSelect?: boolean }) {
  const calls: any = { forUpdate: false, forMode: null, table: null, pred: null, selected: false };
  const tx = {
    calls,
    select(_proj?: any) {
      calls.selected = true;
      const b: any = {
        from(t: any) { calls.table = t; return b; },
        where(p: any) { calls.pred = p; return b; },
        for(mode: string) { calls.forUpdate = true; calls.forMode = mode; return b; },
        then(res: (v: any) => void, rej: (e: any) => void) {
          if (opts.throwOnSelect) rej(new Error("DB read error"));
          else res(opts.rows ?? []);
        },
      };
      return b;
    },
  };
  return tx;
}

describe("8B-5 — assertPaymentsGateOpen (contrato compartido, fail-closed)", () => {
  it("value === 'false' (exacto) → ABRE (no lanza)", async () => {
    await expect(assertPaymentsGateOpen(gateTx({ rows: [{ value: "false" }] }))).resolves.toBeUndefined();
  });

  it("value === 'true' → BLOQUEA con MAINTENANCE", async () => {
    await expect(assertPaymentsGateOpen(gateTx({ rows: [{ value: "true" }] }))).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
  });

  it("fila AUSENTE (0 filas) → fail-closed", async () => {
    await expect(assertPaymentsGateOpen(gateTx({ rows: [] }))).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
  });

  it("valor VACÍO / whitespace → fail-closed", async () => {
    for (const v of ["", "   "]) {
      await expect(assertPaymentsGateOpen(gateTx({ rows: [{ value: v }] }))).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    }
  });

  it("valor CORRUPTO (sólo 'false' exacto abre) → fail-closed", async () => {
    for (const v of ["1", "0", "t", "TRUE", "False", "FALSE", "falsee", " false", "false ", "yes", "null"]) {
      await expect(assertPaymentsGateOpen(gateTx({ rows: [{ value: v }] }))).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    }
  });

  it("valor null (columna) → fail-closed", async () => {
    await expect(assertPaymentsGateOpen(gateTx({ rows: [{ value: null }] }))).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
  });

  it("ERROR al leer system_controls → fail-closed (propaga, no continúa)", async () => {
    await expect(assertPaymentsGateOpen(gateTx({ throwOnSelect: true }))).rejects.toThrow();
  });

  it("lee con FOR UPDATE sobre system_controls filtrando el controlKey del gate", async () => {
    const tx = gateTx({ rows: [{ value: "false" }] });
    await assertPaymentsGateOpen(tx);
    expect(tx.calls.selected).toBe(true);
    expect(tx.calls.forUpdate).toBe(true);         // toma lock pesimista (barrera de drenaje)
    expect(tx.calls.forMode).toBe("update");
    expect(tx.calls.table).toBe(systemControls);    // sobre la tabla de controles
    // el predicado liga el controlKey correcto (extracción segura de bound params,
    // sin JSON.stringify: el AST de drizzle es circular).
    const params: any[] = [];
    const seen = new Set<any>();
    const walk = (c: any) => {
      if (!c || typeof c !== "object" || seen.has(c)) return;
      seen.add(c);
      if (Array.isArray(c)) { c.forEach(walk); return; }
      if ("encoder" in c && "value" in c && typeof c.value !== "object") params.push(c.value);
      if (Array.isArray(c.queryChunks)) c.queryChunks.forEach(walk);
    };
    walk(tx.calls.pred);
    expect(params).toContain(PAYMENTS_LOCKED_KEY);
  });

  it("el error es PaymentError con código PRECONDITION_FAILED (mapeado por el router)", async () => {
    try {
      await assertPaymentsGateOpen(gateTx({ rows: [{ value: "true" }] }));
      throw new Error("no lanzó");
    } catch (e) {
      expect(e).toBeInstanceOf(PaymentError);
      expect((e as PaymentError).code).toBe("PRECONDITION_FAILED");
    }
  });
});

// ---- CONNECTION AFFINITY del runner pesimista --------------------------------
// Modela una CONEXIÓN FÍSICA (con id) y prueba que BEGIN PESSIMISTIC, el gate
// FOR UPDATE, el job FOR UPDATE, las escrituras y el COMMIT ocurren TODOS sobre la
// MISMA conexión. Vitest no usa una conexión real: se inyecta el fake de conexión.

function affinityHarness(gateValue = "false") {
  const connId = Math.floor(Math.random() * 1e9);
  const log: any[] = [];
  const conn = {
    released: false,
    query: async (sql: string) => { log.push({ kind: "raw", sql, connId }); },
    release() { this.released = true; log.push({ kind: "release", connId }); },
  };
  const mkSelect = () => {
    const b: any = {
      _t: null, _for: false,
      from(t: any) { b._t = t; return b; },
      where() { return b; },
      for() { b._for = true; return b; },
      then(res: any, rej: any) {
        try {
          log.push({ kind: "select", table: b._t, forUpdate: b._for, connId });
          if (b._t === systemControls) res([{ value: gateValue }]);
          else if (b._t === jobsTable) res([{ id: 1, notes: "{}" }]);
          else res([]);
        } catch (e) { rej(e); }
      },
    };
    return b;
  };
  const mkUpdate = () => { const b: any = { set() { return b; }, where() { return b; }, then(res: any) { log.push({ kind: "update", connId }); res(undefined); } }; return b; };
  const mkInsert = () => { const b: any = { values() { return b; }, then(res: any) { log.push({ kind: "insert", connId }); res([{ insertId: 1 }]); } }; return b; };
  const tx = { select: () => mkSelect(), update: () => mkUpdate(), insert: () => mkInsert() };
  const acquire = async () => ({ conn, tx });
  return { acquire, log, conn, connId };
}

describe("8B-5 — runPessimisticPaymentTx: frontera pesimista + connection affinity", () => {
  it("BEGIN PESSIMISTIC → gate FOR UPDATE → job FOR UPDATE → writes → COMMIT, todo en la MISMA conexión", async () => {
    const h = affinityHarness("false");
    const body = async (tx: any) => {
      await assertPaymentsGateOpen(tx);                                            // gate FOR UPDATE
      await tx.select().from(jobsTable).where(eq(jobsTable.id, 1)).for("update");  // job FOR UPDATE
      await tx.insert(txTable).values({});                                         // write
      await tx.update(jobsTable).set({}).where(eq(jobsTable.id, 1));               // write
      return "ok";
    };
    const result = await runPessimisticPaymentTx(h.acquire, body);
    expect(result).toBe("ok");

    // Orden exacto observado en la conexión.
    const kinds = h.log.map((e) => e.kind === "raw" ? e.sql : e.kind === "select" ? `select:${e.table === systemControls ? "gate" : "jobs"}${e.forUpdate ? "/FU" : ""}` : e.kind);
    expect(kinds).toEqual([
      "BEGIN PESSIMISTIC",
      "select:gate/FU",
      "select:jobs/FU",
      "insert",
      "update",
      "COMMIT",
      "release",
    ]);
    // TODO ocurrió sobre la MISMA conexión física.
    const ids = new Set(h.log.map((e) => e.connId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe(h.connId);
    expect(h.conn.released).toBe(true);
    // El gate y el job se leyeron con FOR UPDATE.
    const forUpdates = h.log.filter((e) => e.kind === "select" && e.forUpdate);
    expect(forUpdates).toHaveLength(2);
  });

  it("error en el body → ROLLBACK (no COMMIT) en la misma conexión y release en finally", async () => {
    const h = affinityHarness("false");
    const body = async (tx: any) => {
      await assertPaymentsGateOpen(tx);
      throw new Error("fallo simulado");
    };
    await expect(runPessimisticPaymentTx(h.acquire, body)).rejects.toThrow("fallo simulado");
    const raws = h.log.filter((e) => e.kind === "raw").map((e) => e.sql);
    expect(raws).toEqual(["BEGIN PESSIMISTIC", "ROLLBACK"]); // ROLLBACK, nunca COMMIT
    expect(h.conn.released).toBe(true);
  });

  it("gate CERRADO ('true') → MAINTENANCE, ROLLBACK antes del job lock, misma conexión, release", async () => {
    const h = affinityHarness("true");
    const body = async (tx: any) => {
      await assertPaymentsGateOpen(tx);                                 // lanza MAINTENANCE
      await tx.select().from(jobsTable).where(eq(jobsTable.id, 1)).for("update"); // no debe ejecutarse
      return "ok";
    };
    await expect(runPessimisticPaymentTx(h.acquire, body)).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    const kinds = h.log.map((e) => e.kind === "raw" ? e.sql : e.kind === "select" ? (e.table === jobsTable ? "select:jobs" : "select:gate") : e.kind);
    expect(kinds).toEqual(["BEGIN PESSIMISTIC", "select:gate", "ROLLBACK", "release"]); // job NUNCA se lockeó
    expect(new Set(h.log.map((e) => e.connId)).size).toBe(1);
  });
});
