import { eq } from "drizzle-orm";
import { systemControls } from "../drizzle/schema";
import { PaymentError, PAYMENT_ERR } from "./db";

// ============================================================================
// GATE GLOBAL DE COBRANZAS (8B-5) — LÓGICA COMPARTIDA, IDÉNTICA EN AMBOS RELEASES
// (release intermedio 8B-2/8B-3 y main canónico 8B-5a/5c).
//
// NO debe divergir entre versiones: ambas importan ESTE MISMO módulo. La lectura,
// los valores válidos, el error, el locking y la semántica fail-closed viven acá.
//
// Fila de control: system_controls[controlKey='payments_locked'].
//   value === 'false'  → cobranzas ABIERTAS (comportamiento normal).
//   cualquier otro caso → cobranzas BLOQUEADAS (fail-closed):
//     - value === 'true';
//     - value vacío / whitespace / basura / distinto de 'false';
//     - fila ausente;
//     - error de DB al leer (la excepción propaga → ROLLBACK, nunca continúa).
//
// LOCK: se lee con SELECT ... FOR UPDATE dentro de la MISMA transacción de
// registerJobPaymentAtomic. Requiere transacción PESIMISTA (ver getDb() en db.ts:
// SET SESSION tidb_txn_mode='pessimistic') para que el lock sea real y sirva como
// frontera de drenaje del cutover. Consecuencia aceptada: TODOS los registerPayment
// quedan serializados globalmente en esta fila mientras exista el gate (operación
// humana de baja frecuencia; se prioriza una frontera de cutover demostrable).
// ============================================================================

export const PAYMENTS_LOCKED_KEY = "payments_locked";

/**
 * Chequeo del gate. DEBE ser la PRIMERA operación material dentro de la
 * transacción de registerJobPaymentAtomic, ANTES del SELECT job FOR UPDATE, del
 * INSERT del cobro y de cualquier UPDATE de amountPaid/paymentStatus/legacyPaidBase.
 * Si el gate no está inequívocamente abierto ⇒ lanza PaymentError(MAINTENANCE) y la
 * transacción hace ROLLBACK completo (cero escrituras).
 *
 * `tx` es el handle transaccional (drizzle tx o el fake de tests). Lee bajo
 * FOR UPDATE, así que toma/queda a la espera del lock exclusivo de la fila.
 */
export async function assertPaymentsGateOpen(tx: any): Promise<void> {
  const rows = await tx
    .select({ value: systemControls.value })
    .from(systemControls)
    .where(eq(systemControls.controlKey, PAYMENTS_LOCKED_KEY))
    .for("update");
  // Fila ausente ⇒ fail-closed (la ausencia NO es "abierto").
  if (!rows || rows.length === 0) {
    throw new PaymentError("PRECONDITION_FAILED", PAYMENT_ERR.MAINTENANCE);
  }
  // SÓLO el literal exacto 'false' abre. Cualquier otro valor (true/''/basura) cierra.
  if (rows[0].value !== "false") {
    throw new PaymentError("PRECONDITION_FAILED", PAYMENT_ERR.MAINTENANCE);
  }
}

/** Conexión física mínima que el runner necesita: ejecutar SQL crudo y liberarse. */
export type PaymentConn = {
  query(sql: string): Promise<unknown>;
  release(): void;
};

/**
 * Runner de la transacción de cobro con FRONTERA PESIMISTA EXPLÍCITA. Garantiza
 * que TODO ocurre sobre UNA MISMA conexión física:
 *   BEGIN PESSIMISTIC → body(tx) [gate FOR UPDATE → job FOR UPDATE → writes] → COMMIT
 * (o ROLLBACK ante cualquier error), y libera la conexión en finally.
 *
 * `acquire` devuelve la conexión física y el contexto drizzle LIGADO A ESA misma
 * conexión (no al pool), de modo que el body no puede "saltar" a otra conexión. El
 * BEGIN PESSIMISTIC explícito hace la transacción pesimista sin depender de la
 * variable de sesión tidb_txn_mode ni de la afinidad del pool. En producción
 * `acquire` toma una conexión concreta del pool; en tests se inyecta un fake que
 * modela la conexión física para probar el contrato (misma conexión, orden, lock).
 */
export async function runPessimisticPaymentTx<T>(
  acquire: () => Promise<{ conn: PaymentConn; tx: any }>,
  body: (tx: any) => Promise<T>,
): Promise<T> {
  const { conn, tx } = await acquire();
  try {
    await conn.query("BEGIN PESSIMISTIC"); // frontera pesimista EXPLÍCITA
    try {
      const result = await body(tx);
      await conn.query("COMMIT");
      return result;
    } catch (e) {
      await conn.query("ROLLBACK");
      throw e;
    }
  } finally {
    conn.release(); // SIEMPRE libera la conexión física
  }
}
