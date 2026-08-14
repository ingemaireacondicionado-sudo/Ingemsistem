import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { assertPaymentsGateOpen, runPessimisticPaymentTx, PAYMENTS_LOCKED_KEY } from "./paymentsGate";
import { PAYMENT_ERR } from "./db";
import { systemControls, jobs as jobsTable } from "../drizzle/schema";

// 8B-5 — DRENAJE REAL (modelo de concurrencia). Modela el lock de fila del gate
// como un MUTEX async: el SELECT ... FOR UPDATE sobre payments_locked lo adquiere y
// lo retiene hasta COMMIT/ROLLBACK. Demuestra que la activación no puede cruzar el
// lock mientras un pago lo posee, y que tras activar 'true' un pago nuevo falla
// ANTES de tocar el job. Usa el runner y assertPaymentsGateOpen REALES.

// Mutex async FIFO: modela el lock exclusivo de la fila (FOR UPDATE).
class RowLock {
  private locked = false;
  private queue: Array<() => void> = [];
  async acquire(): Promise<() => void> {
    while (this.locked) await new Promise<void>((r) => this.queue.push(r));
    this.locked = true;
    return () => {
      this.locked = false;
      const next = this.queue.shift();
      if (next) next();
    };
  }
}

type Shared = { row: { value: string }; lock: RowLock; jobTouched: boolean };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Conexión física fake que modela el lock de fila: el FOR UPDATE sobre
// system_controls adquiere el mutex; COMMIT/ROLLBACK lo libera.
function lockingConn(shared: Shared) {
  let heldRelease: (() => void) | null = null;
  const conn = {
    query: async (sql: string) => {
      if (sql === "COMMIT" || sql === "ROLLBACK") { if (heldRelease) { heldRelease(); heldRelease = null; } }
    },
    release: () => {},
  };
  const select = () => {
    const b: any = {
      _t: null, from(t: any) { b._t = t; return b; }, where() { return b; }, for() { return b; },
      then(res: (v: any) => void, rej: (e: any) => void) {
        (async () => {
          try {
            if (b._t === systemControls) {
              heldRelease = await shared.lock.acquire(); // FOR UPDATE: adquiere/espera el lock de fila
              res([{ value: shared.row.value }]);
            } else if (b._t === jobsTable) {
              shared.jobTouched = true;                  // marca que se pasó al lock del job
              res([{ id: 1, notes: "{}" }]);
            } else res([]);
          } catch (e) { rej(e); }
        })();
      },
    };
    return b;
  };
  const tx = {
    select,
    update: () => ({ set() { return this; }, where() { return this; }, then(res: any) { res(undefined); } }),
    insert: () => ({ values() { return this; }, then(res: any) { res([{ insertId: 1 }]); } }),
  };
  return { conn, tx };
}

describe("8B-5 — drenaje real: la activación no cruza el lock hasta que el pago termina", () => {
  it("T1 pago retiene el lock → T2 activación espera → T1 commit → T2 activa → T3 pago ve true y falla antes del job", async () => {
    const shared: Shared = { row: { value: "false" }, lock: new RowLock(), jobTouched: false };

    // T1: pago que abre el gate y queda EN VUELO reteniendo el lock (barrera).
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((r) => (releaseBarrier = r));
    const lc1 = lockingConn(shared);
    const t1 = runPessimisticPaymentTx(async () => lc1, async (tx) => {
      await assertPaymentsGateOpen(tx); // adquiere el lock de la fila del gate
      await barrier;                    // sigue "en vuelo" reteniendo el lock
      return "t1";
    });
    await tick(); // T1 adquiere el lock

    // T2: activación intenta el FOR UPDATE de la misma fila → debe BLOQUEAR.
    let t2Crossed = false;
    const lc2 = lockingConn(shared);
    const t2 = runPessimisticPaymentTx(async () => lc2, async (tx) => {
      await tx.select().from(systemControls).where(eq(systemControls.controlKey, PAYMENTS_LOCKED_KEY)).for("update");
      t2Crossed = true;          // sólo llega acá tras adquirir el lock
      shared.row.value = "true"; // UPDATE value='true'
      return "t2";
    });
    await tick();

    // Mientras T1 retiene el lock, T2 NO cruzó y el valor sigue 'false'.
    expect(t2Crossed).toBe(false);
    expect(shared.row.value).toBe("false");

    // T1 COMMIT (libera el lock).
    releaseBarrier();
    expect(await t1).toBe("t1");

    // Ahora T2 adquiere, pone 'true' y COMMIT.
    expect(await t2).toBe("t2");
    expect(t2Crossed).toBe(true);
    expect(shared.row.value).toBe("true");

    // T3: pago nuevo ve 'true' → MAINTENANCE ANTES de tocar el job.
    shared.jobTouched = false;
    const lc3 = lockingConn(shared);
    await expect(
      runPessimisticPaymentTx(async () => lc3, async (tx) => {
        await assertPaymentsGateOpen(tx); // lee 'true' → lanza
        await tx.select().from(jobsTable).where(eq(jobsTable.id, 1)).for("update"); // NO debe ejecutarse
        return "t3";
      }),
    ).rejects.toThrow(PAYMENT_ERR.MAINTENANCE);
    expect(shared.jobTouched).toBe(false); // el job nunca se lockeó
  });
});
