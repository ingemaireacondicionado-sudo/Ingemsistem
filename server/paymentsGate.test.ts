import { describe, it, expect } from "vitest";
import { assertPaymentsGateOpen, PAYMENTS_LOCKED_KEY } from "./paymentsGate";
import { PaymentError, PAYMENT_ERR } from "./db";
import { systemControls } from "../drizzle/schema";

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
