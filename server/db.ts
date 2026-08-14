import { eq, desc, sql, like, and, inArray, lt, or, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { assertPaymentsGateOpen } from "./paymentsGate";
import {
  InsertUser, users,
  customers, suppliers, products, technicians,
  appointments, notes, transactions, jobs, ingemUsers, loginRateLimits,
  privateFiles
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { hashPassword } from './passwordUtils';
import { readStoredMoneyCents, readExactStoredMoneyCents, isAbsentMoneyValue, readStoredRate, centsToNumber, centsToDecimalString, MAX_AMOUNT_CENTS } from './money';

let _db: ReturnType<typeof drizzle> | null = null;

// ===== Barrera de aislamiento de tests (fail-closed) =====
// Un test NUNCA debe poder conectarse a la DATABASE_URL real (producción),
// aunque esté presente en el entorno y aunque un mock parcial deje funciones
// reales expuestas. Durante Vitest la DATABASE_URL de producción se IGNORA por
// completo; sólo se admite una TEST_DATABASE_URL explícita y distinta.
function isTestRuntime(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST_WORKER_ID !== undefined
  );
}

/**
 * Resuelve la URL de base a usar. Regla ESTRICTA fail-closed: durante Vitest
 * NUNCA se abre una conexión real — se ignoran por completo `DATABASE_URL` Y
 * `TEST_DATABASE_URL` (y cualquier otra). La suite unitaria siempre corre con
 * getDb()=null. Si en el futuro hicieran falta tests de integración con una DB
 * real, deberán usar OTRA configuración/comando explícito, separado de la suite
 * unitaria (no habilitado acá). Nunca loguea la URL. Exportada para testear la
 * propia barrera.
 */
export function resolveDbUrl(): string | undefined {
  if (isTestRuntime()) return undefined; // Vitest ⇒ CERO conexión real, sin excepción.
  return process.env.DATABASE_URL;
}

export async function getDb() {
  if (_db) return _db;
  const url = resolveDbUrl();
  if (!url) return null;
  try {
    // 8B-5 (INVARIANTE PESIMISTA): el gate de cobranzas depende de que
    // SELECT ... FOR UPDATE tome un lock PESIMISTA real (barrera de drenaje). El
    // driver drizzle/mysql2 emite un `BEGIN` plano cuyo modo lo decide la variable
    // de sesión tidb_txn_mode; no expone `BEGIN PESSIMISTIC`. Por eso se crea un
    // pool EXPLÍCITO y cada conexión nueva fija su sesión en modo pesimista ANTES
    // de usarse (queda encolado FIFO antes de cualquier BEGIN de esa conexión).
    // TiDB ya usa pesimista por defecto (v3.0.8+); esto lo hace explícito y
    // verificable. Verificación operacional obligatoria antes de activar el gate:
    //   SELECT @@tidb_txn_mode;  SELECT @@global.tidb_txn_mode;  → 'pessimistic'.
    const pool = mysql.createPool(url);
    pool.on("connection", (conn) => {
      // Fire-and-forget con callback que ignora el error (en TiDB no falla; en un
      // motor sin la variable, la comprobación operacional lo detectaría).
      (conn as any).query("SET SESSION tidb_txn_mode = 'pessimistic'", () => {});
    });
    _db = drizzle(pool);
  } catch {
    // Nunca se loguea la URL (podría contener credenciales).
    console.warn("[Database] connection init failed");
    _db = null;
  }
  return _db;
}

/**
 * Comprobación OPERACIONAL del modo de transacción efectivo (para Manus, antes de
 * activar el gate). Devuelve el tidb_txn_mode de sesión y global. La activación del
 * gate NO está autorizada hasta verificar que ambos son 'pessimistic'.
 */
export async function getTidbTxnMode(): Promise<{ session: string | null; global: string | null }> {
  const db = await getDb();
  if (!db) return { session: null, global: null };
  try {
    const res: any = await db.execute(
      sql`SELECT @@tidb_txn_mode AS sessionMode, @@global.tidb_txn_mode AS globalMode`,
    );
    const row = Array.isArray(res) ? res[0]?.[0] ?? res[0] : res;
    return {
      session: row?.sessionMode ?? null,
      global: row?.globalMode ?? null,
    };
  } catch {
    return { session: null, global: null };
  }
}

// ========== Manus OAuth Users ==========
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) { console.error("[Database] Failed to upsert user:", error); throw error; }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ========== INGEM Internal Users ==========
export async function getIngemUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingemUsers).orderBy(ingemUsers.name);
}

export async function getIngemUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(ingemUsers).where(eq(ingemUsers.email, email)).limit(1);
  return result[0];
}

// Busca un usuario por primary key. Devuelve SOLO los campos necesarios para
// autenticación/autorización (nunca password ni passwordHash). Solo lectura.
export async function getIngemUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: ingemUsers.id,
      name: ingemUsers.name,
      email: ingemUsers.email,
      role: ingemUsers.role,
      isActive: ingemUsers.isActive,
      allowedModules: ingemUsers.allowedModules,
    })
    .from(ingemUsers)
    .where(eq(ingemUsers.id, id))
    .limit(1);
  return result[0];
}

export async function createIngemUser(data: { name: string; email: string; passwordHash: string; role: "admin" | "manager" | "technician" | "viewer"; isActive: boolean; allowedModules?: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Usuarios nuevos: solo se guarda el hash. La columna password (legado)
  // queda en null; nunca se escribe la contraseña en claro.
  const result = await db.insert(ingemUsers).values({
    name: data.name, email: data.email,
    password: null, passwordHash: data.passwordHash,
    role: data.role, isActive: data.isActive,
    allowedModules: data.allowedModules ? JSON.stringify(data.allowedModules) : null,
  });
  return { id: result[0].insertId };
}

export async function updateIngemUser(id: number, data: Partial<{ name: string; email: string; password: string; passwordHash: string; role: "admin" | "manager" | "technician" | "viewer"; isActive: boolean; allowedModules?: string[] }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.password !== undefined) updateData.password = data.password;
  if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.allowedModules !== undefined) updateData.allowedModules = JSON.stringify(data.allowedModules);
  await db.update(ingemUsers).set(updateData).where(eq(ingemUsers.id, id));
}

/**
 * Migración perezosa: guarda el hash de un usuario que aún no lo tiene,
 * sin tocar su contraseña actual (columna password legado).
 */
export async function setIngemUserPasswordHash(id: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(ingemUsers).set({ passwordHash }).where(eq(ingemUsers.id, id));
}

export async function deleteIngemUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ingemUsers).where(eq(ingemUsers.id, id));
}

// ========== Login rate limiting (compartido vía TiDB) ==========

// ¿Alguna de las claves está bloqueada ahora mismo? (lectura simple)
export async function isLoginBlocked(rateKeys: string[]): Promise<boolean> {
  const db = await getDb();
  if (!db || rateKeys.length === 0) return false;
  const now = Date.now();
  const rows = await db
    .select({ blockedUntil: loginRateLimits.blockedUntil })
    .from(loginRateLimits)
    .where(inArray(loginRateLimits.rateKey, rateKeys));
  return rows.some(r => r.blockedUntil != null && r.blockedUntil.getTime() > now);
}

// Registra un intento fallido para una clave, de forma atómica (transacción con
// SELECT ... FOR UPDATE), segura ante requests simultáneos entre instancias.
export async function recordLoginFailure(
  rateKey: string,
  windowMs: number,
  maxAttempts: number,
  blockMs: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return; // sin DB no se registra; el login no debe romperse por esto
  const now = new Date();
  await db.transaction(async (tx) => {
    // 1) Garantizar que la fila existe (no-op si ya está) para poder bloquearla.
    await tx
      .insert(loginRateLimits)
      .values({ rateKey, attempts: 0, windowStart: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { updatedAt: now } });
    // 2) Bloquear la fila y leer su estado actual.
    const rows = await tx
      .select()
      .from(loginRateLimits)
      .where(eq(loginRateLimits.rateKey, rateKey))
      .for("update");
    const row = rows[0];
    const expired = row.windowStart.getTime() < now.getTime() - windowMs;
    const attempts = expired ? 1 : row.attempts + 1;
    const windowStart = expired ? now : row.windowStart;
    const blockedUntil =
      attempts >= maxAttempts
        ? new Date(now.getTime() + blockMs)
        : expired
          ? null
          : row.blockedUntil;
    // 3) Escribir el nuevo estado dentro de la misma transacción.
    await tx
      .update(loginRateLimits)
      .set({ attempts, windowStart, blockedUntil, updatedAt: now })
      .where(eq(loginRateLimits.rateKey, rateKey));
  });
}

// Limpia el contador de una clave (p. ej. IP+email tras un login exitoso).
export async function clearLoginRateKey(rateKey: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(loginRateLimits).where(eq(loginRateLimits.rateKey, rateKey));
}

// Limpieza oportunista de registros vencidos (ventana pasada y sin bloqueo
// vigente). Acotada por LIMIT para no hacer trabajo pesado en un request.
export async function cleanupExpiredLoginRateLimits(olderThanMs: number, limit = 100): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const cutoff = new Date(Date.now() - olderThanMs);
  const now = new Date();
  await db
    .delete(loginRateLimits)
    .where(
      and(
        lt(loginRateLimits.windowStart, cutoff),
        or(isNull(loginRateLimits.blockedUntil), lt(loginRateLimits.blockedUntil, now)),
      ),
    )
    .limit(limit);
}

// ========== Private files (almacenamiento privado) ==========

export type PrivateFileCategory = "purchase_order" | "invoice" | "technician_document";

/**
 * Inserta un archivo privado (bytes en la base). El buffer, el mime y el tamaño
 * ya vienen validados por el servidor (magic bytes + límites). Devuelve el id.
 */
export async function insertPrivateFile(data: {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  data: Buffer;
  category: PrivateFileCategory;
  entityType?: string | null;
  entityId?: number | null;
  createdBy?: number | null;
}): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(privateFiles).values({
    originalName: data.originalName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    data: data.data,
    category: data.category,
    entityType: data.entityType ?? null,
    entityId: data.entityId ?? null,
    createdBy: data.createdBy ?? null,
  });
  return { id: result[0].insertId };
}

/**
 * Obtiene un archivo privado por id (incluye los bytes). Devuelve null si no
 * existe. Sólo debe invocarse desde un endpoint que ya verificó permisos.
 */
export async function getPrivateFileById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(privateFiles).where(eq(privateFiles.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Asocia (server-side) un archivo privado a una entidad. Se usa al crear/editar
 * un trabajo para "sellar" la relación archivo→job, nunca desde el cliente.
 */
export async function setPrivateFileEntity(id: number, entityType: string, entityId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(privateFiles).set({ entityType, entityId }).where(eq(privateFiles.id, id));
}

/**
 * Metadatos de un archivo privado (sin los bytes) por id. Útil para chequear la
 * relación/entidad antes de servir el contenido.
 */
export async function getPrivateFileMetaById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({
      id: privateFiles.id,
      originalName: privateFiles.originalName,
      mimeType: privateFiles.mimeType,
      sizeBytes: privateFiles.sizeBytes,
      category: privateFiles.category,
      entityType: privateFiles.entityType,
      entityId: privateFiles.entityId,
      createdBy: privateFiles.createdBy,
      createdAt: privateFiles.createdAt,
    })
    .from(privateFiles)
    .where(eq(privateFiles.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Error de asociación archivo→entidad (capa db, desacoplada de tRPC). El router
// lo mapea a TRPCError con el código correcto.
export class FileAssocError extends Error {
  constructor(public code: "BAD_REQUEST" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "FileAssocError";
  }
}

export type JobFileBinding = { fileId: number; category: "purchase_order" | "invoice" };

// Valida (DENTRO de la transacción, con lock FOR UPDATE) que un archivo se pueda
// vincular a este job: categoría correcta, no pertenecer a otro job, y —si aún
// no está asociado— ser del propio usuario. Devuelve la fila bloqueada.
async function assertBindableInTx(tx: any, b: JobFileBinding, jobId: number, userId: number) {
  const rows = await tx
    .select({
      id: privateFiles.id, category: privateFiles.category,
      entityType: privateFiles.entityType, entityId: privateFiles.entityId,
      createdBy: privateFiles.createdBy,
    })
    .from(privateFiles)
    .where(eq(privateFiles.id, b.fileId))
    .for("update");
  const f = rows[0];
  if (!f || f.category !== b.category) {
    throw new FileAssocError("BAD_REQUEST", "Archivo adjunto inválido.");
  }
  const boundToThisJob = f.entityType === "job" && f.entityId === jobId;
  if (f.entityId != null && !boundToThisJob) {
    throw new FileAssocError("FORBIDDEN", "El archivo pertenece a otro trabajo.");
  }
  if (f.entityId == null && f.createdBy !== userId) {
    throw new FileAssocError("FORBIDDEN", "No podés adjuntar un archivo que no subiste.");
  }
  return f;
}

/**
 * Crea un job y ASOCIA sus archivos private:<id> en UNA sola transacción. Si la
 * validación de pertenencia o el sellado fallan, se hace rollback del job
 * completo (no quedan estados parciales). El sellado (entityType='job',
 * entityId=jobId) lo hace el servidor; el cliente nunca lo provee.
 */
export async function createJobWithFileBindings(
  jobData: any,
  bindings: JobFileBinding[],
  userId: number,
  injectedDb?: any,
): Promise<{ id: number }> {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx: any) => {
    // Defensa en profundidad (8B-5c): la base canónica se fija server-side a 0.00
    // en la creación, sin importar lo que traiga jobData (el cliente no la decide).
    const res = await tx.insert(jobs).values({ ...jobData, legacyPaidBase: "0.00" });
    const jobId = res[0].insertId;
    for (const b of bindings) {
      const f = await assertBindableInTx(tx, b, jobId, userId);
      if (f.entityId == null) {
        await tx.update(privateFiles).set({ entityType: "job", entityId: jobId }).where(eq(privateFiles.id, b.fileId));
      }
    }
    return { id: jobId };
  });
}

// Parseo seguro de un blob `notes` (JSON meta). Devuelve {} si no es objeto.
function parseMetaObject(notes: unknown): Record<string, unknown> {
  if (typeof notes !== "string" || !notes.trim().startsWith("{")) return {};
  try {
    const o = JSON.parse(notes);
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Actualiza un job y RECONCILIA sus archivos private:<id> en la misma
 * transacción. Cuando `bindings` es null (update sin `notes`) no se tocan las
 * asociaciones. Cuando es una lista:
 *  - se vinculan los archivos declarados (validando pertenencia);
 *  - se DESVINCULAN (se retiran a huérfano: entityType/entityId = NULL, SIN
 *    borrado físico) los archivos que seguían asociados a este job pero que ya
 *    NO están referenciados. Así un archivo reemplazado deja de ser descargable
 *    por acceso al job (queda accesible sólo para su autor, como huérfano).
 * Cualquier fallo => rollback completo (el job conserva su estado anterior).
 *
 * BLINDAJE FINANCIERO (8B-1): jobs.update NUNCA modifica los campos de cobranza.
 * Dentro de la MISMA transacción se BLOQUEA la fila del job (FOR UPDATE) y se
 * toma de ahí el estado financiero vigente para preservarlo, evitando que una
 * edición con datos viejos pise un cobro concurrente:
 *  - `paymentStatus` (columna): se conserva el valor de la DB (se ignora el del cliente);
 *  - `notes.amountPaid`: se conserva el valor real vigente (legacy sin amountPaid: se omite, equivale a 0).
 * El resto de `notes` (descriptivos, costos, autoría 8A, refs private:<id> del
 * punto 7, metadata desconocida) se preserva tal cual viene en jobData.
 */
export async function updateJobWithFileBindings(
  jobId: number,
  jobData: any,
  bindings: JobFileBinding[] | null,
  userId: number,
  injectedDb?: any,
): Promise<void> {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  await db.transaction(async (tx: any) => {
    // 1) Bloquear la fila y leer el estado financiero protegido VIGENTE.
    const lockedRows = await tx
      .select({ notes: jobs.notes, paymentStatus: jobs.paymentStatus, legacyPaidBase: jobs.legacyPaidBase })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .for("update");
    const locked = lockedRows[0];

    // 2) Construir el payload preservando amountPaid/paymentStatus desde la fila
    //    bloqueada (no desde una lectura previa fuera de la transacción).
    const finalData: any = { ...jobData };
    // Defensa en profundidad (8B-5c): legacyPaidBase NUNCA se modifica por el CRUD
    // genérico (sólo la congela el cutover). Se descarta lo que venga en jobData.
    delete finalData.legacyPaidBase;
    // paymentStatus: siempre el de la DB; el cliente nunca lo controla por acá.
    finalData.paymentStatus = locked ? locked.paymentStatus : undefined;
    if (finalData.paymentStatus === undefined) delete finalData.paymentStatus;
    // amountPaid dentro de notes: preservar el valor real vigente.
    if (finalData.notes !== undefined) {
      const lockedMeta = parseMetaObject(locked?.notes);
      const newMeta = parseMetaObject(finalData.notes);
      if ("amountPaid" in lockedMeta) newMeta.amountPaid = lockedMeta.amountPaid;
      else delete newMeta.amountPaid; // legacy sin amountPaid: no se inventa (equivale a 0)

      // BLINDAJE DE MONEDA (8B-5c): no se puede cambiar `currency` si el job ya
      // tiene historia financiera. legacyPaidBase es un DECIMAL SIN moneda: su
      // divisa es implícitamente `notes.currency` al momento de congelar. Un
      // cobro marcado tampoco guarda moneda propia. Por eso, con saldo/cobros ya
      // registrados, permitir ARS↔USD corrompería en silencio el significado del
      // dinero. Se bloquea, bajo el MISMO lock, comparando la moneda vigente.
      const oldCurrency = typeof lockedMeta.currency === "string" ? lockedMeta.currency : "ARS";
      const newCurrency = typeof newMeta.currency === "string" ? newMeta.currency : "ARS";
      if (newCurrency !== oldCurrency) {
        // ¿Hay historia financiera? base congelada > 0, cobro legacy > 0 (base aún
        // NULL), o algún cobro marcado. Ilegible/ambiguo ⇒ fail-closed (bloquear).
        let paidCents: number | null;
        if (locked?.legacyPaidBase !== null && locked?.legacyPaidBase !== undefined) {
          const b = readExactStoredMoneyCents(locked.legacyPaidBase);
          paidCents = b.ok ? b.cents : null;
        } else if (isAbsentMoneyValue(lockedMeta.amountPaid)) {
          // base NULL + amountPaid ausente: NO se puede probar "sin historia".
          // Se trata como desconocido (null) → bloquea el cambio de moneda.
          paidCents = null;
        } else {
          const legacy = readExactStoredMoneyCents(lockedMeta.amountPaid);
          paidCents = legacy.ok ? legacy.cents : null;
        }
        const marks = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(eq(transactions.relatedJobId, jobId), eq(transactions.isJobPayment, true)));
        const hasHistory = marks.length > 0 || paidCents === null || paidCents > 0;
        if (hasHistory) throw new PaymentError("FORBIDDEN", PAYMENT_ERR.CURRENCY_LOCKED);
      }

      finalData.notes = JSON.stringify(newMeta);
    }

    await tx.update(jobs).set(finalData).where(eq(jobs.id, jobId));
    if (bindings === null) return; // update sin `notes`: no reconciliar
    // 1) Vincular (validando) los archivos declarados.
    for (const b of bindings) {
      const f = await assertBindableInTx(tx, b, jobId, userId);
      if (f.entityId == null) {
        await tx.update(privateFiles).set({ entityType: "job", entityId: jobId }).where(eq(privateFiles.id, b.fileId));
      }
    }
    // 2) Desvincular los archivos de este job que ya no están referenciados.
    const keepIds = bindings.map((b) => b.fileId);
    const current = await tx
      .select({ id: privateFiles.id })
      .from(privateFiles)
      .where(and(eq(privateFiles.entityType, "job"), eq(privateFiles.entityId, jobId)))
      .for("update");
    for (const row of current) {
      if (!keepIds.includes(row.id)) {
        await tx.update(privateFiles).set({ entityType: null, entityId: null }).where(eq(privateFiles.id, row.id));
      }
    }
  });
}

// ========== Customers ==========
export async function getCustomers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customers).orderBy(desc(customers.createdAt));
}

export async function getCustomerById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return result[0];
}

export async function createCustomer(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(customers).values(data);
  return { id: result[0].insertId };
}

export async function updateCustomer(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(customers).set({ ...data, lastContact: new Date() }).where(eq(customers.id, id));
}

export async function deleteCustomer(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(customers).where(eq(customers.id, id));
}

// ========== Suppliers ==========
export async function getSuppliers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suppliers).orderBy(desc(suppliers.createdAt));
}

export async function getSupplierById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
  return result[0];
}

export async function createSupplier(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(suppliers).values(data);
  return { id: result[0].insertId };
}

export async function updateSupplier(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(suppliers).set(data).where(eq(suppliers.id, id));
}

export async function deleteSupplier(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(suppliers).where(eq(suppliers.id, id));
}

// ========== Products ==========
export async function getProducts() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products).orderBy(desc(products.createdAt));
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function createProduct(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(products).values(data);
  return { id: result[0].insertId };
}

export async function updateProduct(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(products).set(data).where(eq(products.id, id));
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(products).where(eq(products.id, id));
}

// ========== Technicians ==========
export async function getTechnicians() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(technicians).orderBy(technicians.firstName);
}

export async function getTechnicianById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(technicians).where(eq(technicians.id, id)).limit(1);
  return result[0];
}

export async function createTechnician(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(technicians).values(data);
  return { id: result[0].insertId };
}

export async function updateTechnician(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(technicians).set(data).where(eq(technicians.id, id));
}

export async function deleteTechnician(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(technicians).where(eq(technicians.id, id));
}

// ========== Appointments ==========
export async function getAppointments() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appointments).orderBy(desc(appointments.date));
}

export async function getAppointmentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return result[0];
}

export async function createAppointment(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(appointments).values(data);
  return { id: result[0].insertId };
}

export async function updateAppointment(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(appointments).set(data).where(eq(appointments.id, id));
}

export async function deleteAppointment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(appointments).where(eq(appointments.id, id));
}

export async function deleteRecurrenceGroup(recurrenceGroupId: string, fromDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  if (fromDate) {
    // Delete only future appointments in the group
    await db.delete(appointments).where(
      and(
        eq(appointments.recurrenceGroupId, recurrenceGroupId),
        sql`${appointments.date} >= ${fromDate}`
      )
    );
  } else {
    // Delete all appointments in the group
    await db.delete(appointments).where(eq(appointments.recurrenceGroupId, recurrenceGroupId));
  }
}

// ========== Notes ==========
export async function getNotes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notes).orderBy(desc(notes.createdAt));
}

export async function getNoteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return result[0];
}

export async function createNote(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(notes).values(data);
  return { id: result[0].insertId };
}

export async function updateNote(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(notes).set(data).where(eq(notes.id, id));
}

export async function deleteNote(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(notes).where(eq(notes.id, id));
}

// ========== Transactions ==========
export async function getTransactions() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transactions).orderBy(desc(transactions.date));
}

export async function getTransactionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
  return result[0];
}

export async function createTransaction(data: any, injectedDb?: any) {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  // Defensa en profundidad (8B-5c): el CRUD genérico NUNCA marca un cobro del
  // ledger. isJobPayment sólo lo pone registerJobPaymentAtomic (que inserta
  // directo, sin pasar por acá). Se fuerza a false aunque el llamador mande true.
  const { isJobPayment: _ignored, ...rest } = data ?? {};
  const result = await db.insert(transactions).values({ ...rest, isJobPayment: false });
  return { id: result[0].insertId };
}

export async function updateTransaction(id: number, data: any, injectedDb?: any) {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  // Defensa en profundidad (8B-5c): un cobro marcado del ledger es INMUTABLE por
  // el CRUD genérico, y isJobPayment nunca se modifica desde acá. La garantía no
  // depende sólo del router.
  const existing = await db
    .select({ isJobPayment: transactions.isJobPayment })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (existing[0]?.isJobPayment) throw new PaymentError("FORBIDDEN", PAYMENT_ERR.PROTECTED);
  const { isJobPayment: _ignored, ...rest } = data ?? {};
  await db.update(transactions).set(rest).where(eq(transactions.id, id));
}

export async function deleteTransaction(id: number, injectedDb?: any) {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  // Defensa en profundidad (8B-5c): un cobro marcado del ledger no puede borrarse
  // por el CRUD genérico (la reversión tendrá su propio procedure auditable).
  const existing = await db
    .select({ isJobPayment: transactions.isJobPayment })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (existing[0]?.isJobPayment) throw new PaymentError("FORBIDDEN", PAYMENT_ERR.PROTECTED);
  await db.delete(transactions).where(eq(transactions.id, id));
}

// ========== Jobs ==========
export async function getJobs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(jobs).orderBy(desc(jobs.createdAt));
}

export async function getJobById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return result[0];
}

export async function createJob(data: any, injectedDb?: any) {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  // Defensa en profundidad (8B-5c): todo job de negocio nace canónico con base
  // 0.00 server-side, cualquiera sea el llamador. El cliente nunca la decide.
  const result = await db.insert(jobs).values({ ...data, legacyPaidBase: "0.00" });
  return { id: result[0].insertId };
}

export async function updateJob(id: number, data: any, injectedDb?: any) {
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  // Defensa en profundidad (8B-5c): el CRUD genérico NUNCA modifica legacyPaidBase
  // (sólo el cutover dentro de registerJobPaymentAtomic la congela).
  const { legacyPaidBase: _ignored, ...rest } = data ?? {};
  await db.update(jobs).set(rest).where(eq(jobs.id, id));
}

export async function deleteJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(jobs).where(eq(jobs.id, id));
}

// ========== Cobranzas (8B-2/8B-3): registro de pago atómico y validado ==========

// Error funcional del flujo de cobro. El router lo mapea a TRPCError con el
// código correcto. Los mensajes son de negocio (nunca exponen SQL/stack).
export class PaymentError extends Error {
  constructor(public code: "BAD_REQUEST" | "NOT_FOUND" | "FORBIDDEN" | "PRECONDITION_FAILED", message: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export const PAYMENT_ERR = {
  INVALID_AMOUNT: "El monto del cobro no es válido.",
  OVER_BALANCE: "El cobro supera el saldo pendiente del trabajo.",
  ALREADY_PAID: "El trabajo ya está totalmente cobrado.",
  IVA_MISSING: "El trabajo no tiene una alícuota de IVA definida. Editalo antes de registrar el cobro.",
  INCOMPLETE: "El trabajo tiene datos financieros incompletos. Revisalo antes de registrar el cobro.",
  NOT_FOUND: "Trabajo no encontrado.",
  // 8B-5c fail-closed: el monto ya cobrado histórico no es inequívoco (precisión
  // inesperada o dato ilegible) y NO se congela automáticamente la base. Los casos
  // legítimos (p. ej. los históricos con exceso de precisión) se resuelven con la
  // migración controlada de legacyPaidBase (8B-5d), no por el cutover perezoso.
  CUTOVER_REVIEW: "El monto ya cobrado de este trabajo no puede migrarse automáticamente (precisión inesperada o dato ilegible). Requiere revisión y migración manual de la base antes de registrar cobros.",
  // 8B-5c fail-closed: el ledger canónico tiene un cobro marcado con importe
  // corrupto (0, negativo, ambiguo, ilegible o fuera de rango) o la suma acumulada
  // desborda el límite monetario. No se puede calcular el saldo con seguridad.
  LEDGER_CORRUPT: "El ledger de cobros del trabajo tiene un movimiento inválido o un total fuera de rango. Requiere revisión antes de registrar nuevos cobros.",
  // 8B-5a/5c: intento de editar/eliminar un cobro del ledger, o de cambiar la
  // moneda de un trabajo con historia financiera, por el CRUD genérico.
  PROTECTED: "Este movimiento es un cobro registrado del sistema y no puede editarse ni eliminarse manualmente.",
  CURRENCY_LOCKED: "No se puede cambiar la moneda de un trabajo que ya tiene cobros o saldo registrado.",
  // 8B-5 gate global de cobranzas: bloqueadas por mantenimiento/cutover. Mensaje
  // funcional sin filtrar detalles de DB. El router lo mapea a PRECONDITION_FAILED.
  MAINTENANCE: "Las cobranzas están temporalmente bloqueadas por mantenimiento. Intentá nuevamente más tarde.",
} as const;

export type RegisterPaymentResult = {
  transactionId: number;
  isFullyPaid: boolean;
  newAmountPaid: number;
  totalAmount: number;
  jobNumber: string;
  title: string;
  customerName: string | null;
  oldStatus: string;
  newStatus: string;
};

/**
 * SUM canónico de cobros MARCADOS de un job, en CENTAVOS enteros. Único criterio:
 * `relatedJobId = jobId AND isJobPayment = true`. NO usa category/type/description
 * ni transactionStatus como criterio: la identidad canónica es exclusivamente el
 * marcador server-controlled isJobPayment. Las transactions históricas quedan en
 * isJobPayment=false y NUNCA entran a este SUM (su importe ya vive en
 * legacyPaidBase vía el amountPaid legacy congelado en el cutover).
 *
 * Suma en la capa de aplicación (parseo exacto por fila con readStoredMoneyCents),
 * no con SUM() de SQL, para no depender de la aritmética DECIMAL del motor y
 * mantener toda la matemática de dinero en centavos enteros. Debe ejecutarse
 * DENTRO de la misma transacción/lock que registerJobPaymentAtomic.
 */
async function sumMarkedJobPaymentsCents(tx: any, jobId: number): Promise<number> {
  const rows = await tx
    .select({ amount: transactions.amount })
    .from(transactions)
    .where(and(eq(transactions.relatedJobId, jobId), eq(transactions.isJobPayment, true)));
  let total = 0;
  for (const r of rows) {
    // Todo cobro marcado DEBE tener un importe EXACTO y ESTRICTAMENTE > 0. Cualquier
    // corrupción (0, negativo, ambiguo/exceso de precisión, ilegible o fuera de
    // DECIMAL(12,2)) es un ledger inválido. Fail-closed: aborta el cobro (ROLLBACK)
    // en vez de sumar de más/menos o redondear. registerPayment sólo inserta
    // importes validados, así que esto sólo dispara ante datos corruptos.
    const c = readExactStoredMoneyCents(r.amount);
    if (!c.ok || c.cents <= 0) throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.LEDGER_CORRUPT);
    total += c.cents;
    // Overflow ACUMULADO: aunque cada fila sea válida, la suma no puede exceder el
    // límite monetario ni salir del rango de entero seguro.
    if (!Number.isSafeInteger(total) || total > MAX_AMOUNT_CENTS) {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.LEDGER_CORRUPT);
    }
  }
  return total;
}

/**
 * Registra un cobro de forma ATÓMICA y CANÓNICA (8B-5c: cutover perezoso).
 * Toda la operación ocurre en UNA transacción de DB con la fila del job BLOQUEADA
 * (FOR UPDATE). La verdad de "cuánto se cobró" ya NO es el cache amountPaid, sino:
 *
 *     paidCanónico(job) = legacyPaidBase + SUM(transactions con isJobPayment=true)
 *
 * Flujo:
 *  1) lock + lectura del job vigente; 2) parseo seguro de notes; 3) IVA
 *  obligatorio; 4) total en centavos; 5) RESOLVER legacyPaidBase (si es NULL,
 *  CUTOVER PEREZOSO: congelarla una única vez desde el amountPaid legacy, ANTES de
 *  marcar el primer cobro, bajo el mismo lock → nunca doble conteo); 6) SUM de
 *  cobros marcados; 7) paidBefore = base + marcados; saldo y validación (no
 *  overpay), sin confiar en el cache; 8) UPDATE del job (congela legacyPaidBase si
 *  corresponde + status/paymentStatus + refresca el cache amountPaid = paidAfter);
 *  9) INSERT del cobro con isJobPayment=true en la MISMA transacción, DESPUÉS de
 *  congelada la base. Cualquier fallo => ROLLBACK completo (base sin congelar,
 *  sin cobro). `amountCents` ya viene validado (estricto) por el router.
 */
export async function registerJobPaymentAtomic(params: {
  jobId: number;
  amountCents: number;
  date: string;
  paymentMethod: string;
  notes: string;
}, injectedDb?: any): Promise<RegisterPaymentResult> {
  // `injectedDb` es sólo para tests (inyección del mismo patrón DI que
  // exportAllData/seedIngemUsers). En producción SIEMPRE se usa getDb() real; en
  // Vitest getDb() es fail-closed (nunca abre una conexión), así que los tests
  // ejercen la lógica real de cutover pasando un fake in-memory transaccional.
  const db = injectedDb ?? await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx: any) => {
    // 0) GATE GLOBAL DE COBRANZAS (8B-5). PRIMERA operación material: lee
    //    system_controls[payments_locked] con SELECT ... FOR UPDATE (fail-closed).
    //    Si el gate no está inequívocamente abierto ('false') ⇒ PaymentError
    //    MAINTENANCE y ROLLBACK, ANTES de tocar el job, el ledger o el cache.
    await assertPaymentsGateOpen(tx);

    // 1) Lock del job.
    const rows = await tx.select().from(jobs).where(eq(jobs.id, params.jobId)).for("update");
    const job = rows[0];
    if (!job) throw new PaymentError("NOT_FOUND", PAYMENT_ERR.NOT_FOUND);

    // 2) Parsear notes del job BLOQUEADO. Vacío/ inválido → incompleto (no repara).
    const raw = job.notes;
    if (typeof raw !== "string" || !raw.trim().startsWith("{")) {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.INCOMPLETE);
    }
    let meta: Record<string, unknown>;
    try {
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("meta");
      meta = o as Record<string, unknown>;
    } catch {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.INCOMPLETE);
    }

    // 3) IVA obligatorio: sin default silencioso (ni 0 ni 21).
    if (meta.ivaRate === undefined || meta.ivaRate === null || meta.ivaRate === "") {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.IVA_MISSING);
    }
    const rate = readStoredRate(meta.ivaRate);
    if (rate === null) throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.INCOMPLETE);

    // 4) Total en centavos desde la fila bloqueada.
    const labor = readStoredMoneyCents(meta.laborCost);
    const materials = readStoredMoneyCents(meta.materialsCost);
    const other = readStoredMoneyCents(meta.otherCosts);
    if (labor === null || materials === null || other === null) {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.INCOMPLETE);
    }
    const subtotalCents = labor + materials + other;
    const ivaCents = Math.round((subtotalCents * rate) / 100);
    const totalCents = subtotalCents + ivaCents;

    // 5) RESOLVER la base legacy (CUTOVER PEREZOSO). El cache amountPaid ya NO es
    //    fuente de verdad para el saldo. La base congelada + los cobros marcados sí.
    //    - legacyPaidBase NOT NULL → el job ya fue migrado: parsear ese valor exacto.
    //    - legacyPaidBase NULL     → primer cobro post-8B-5c: congelar UNA vez desde
    //      el amountPaid legacy (fila bloqueada), FAIL-CLOSED: SOLO si el monto es
    //      inequívoco (≤2 decimales exactos). Si tiene precisión inesperada o es
    //      ilegible → ROLLBACK con CUTOVER_REVIEW (no se redondea ni se inventa una
    //      base; esos casos se migran con el backfill controlado 8B-5d).
    //    La base se congela ANTES de insertar el primer cobro marcado (paso 9),
    //    todo bajo el mismo FOR UPDATE → jamás doble conteo.
    let baseCents: number;
    let freezeBase = false;
    if (job.legacyPaidBase !== null && job.legacyPaidBase !== undefined) {
      // Base ya migrada: DECIMAL(12,2) siempre trae ≤2 decimales. Si viniera
      // ambigua/ilegible es una corrupción del dato migrado → fail-closed.
      const b = readExactStoredMoneyCents(job.legacyPaidBase);
      if (!b.ok) throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.INCOMPLETE);
      baseCents = b.cents;
    } else {
      // CUTOVER LEGACY: la AUSENCIA de amountPaid (clave faltante, null, "" o sólo
      // whitespace) NO se interpreta como 0 — no prueba que el job nunca cobró.
      // Fail-closed: hay que exigir un valor legacy EXPLÍCITO y determinable. Sólo
      // un 0 explícito (0 / "0" / "0.00") congela base 0.00. Todo lo demás →
      // CUTOVER_REVIEW (se resuelve por backfill controlado 8B-5d).
      if (isAbsentMoneyValue(meta.amountPaid)) {
        throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.CUTOVER_REVIEW);
      }
      const legacy = readExactStoredMoneyCents(meta.amountPaid);
      if (!legacy.ok) throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.CUTOVER_REVIEW);
      baseCents = legacy.cents;
      freezeBase = true;
    }

    // 6) SUM canónico de cobros ya MARCADOS (isJobPayment=true) de este job. En el
    //    cutover perezoso esto es 0 (aún no hay marcados); en cobros posteriores
    //    acumula los registrados por este mismo flujo.
    const markedCents = await sumMarkedJobPaymentsCents(tx, params.jobId);

    // 7) paidBefore CANÓNICO. NUNCA se usa el cache amountPaid para validar el saldo.
    //    Overflow ACUMULADO: base + marcados debe seguir dentro del rango monetario
    //    y de entero seguro, aunque cada componente sea individualmente válido.
    const paidBeforeCents = baseCents + markedCents;
    if (!Number.isSafeInteger(paidBeforeCents) || paidBeforeCents > MAX_AMOUNT_CENTS) {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.LEDGER_CORRUPT);
    }
    const balanceCents = totalCents - paidBeforeCents;
    if (balanceCents <= 0) throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.ALREADY_PAID);
    if (params.amountCents > balanceCents) throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.OVER_BALANCE);

    // paidBefore + nuevo cobro: defensa adicional de overflow (con no-overpay ya
    // queda acotado por total, pero se verifica explícitamente igual, fail-closed).
    const paidAfterCents = paidBeforeCents + params.amountCents;
    if (!Number.isSafeInteger(paidAfterCents) || paidAfterCents > MAX_AMOUNT_CENTS) {
      throw new PaymentError("BAD_REQUEST", PAYMENT_ERR.LEDGER_CORRUPT);
    }
    const isFullyPaid = paidAfterCents >= totalCents; // con no-overpay ⇒ === total
    const newStatus = isFullyPaid ? "collected" : job.status;
    const newPaymentStatus = isFullyPaid ? "completed" : "partial";

    // 8) Actualizar el job preservando el resto del meta (autoría, refs, costos…).
    //    - amountPaid pasa a ser un CACHE/PROYECCIÓN del paidCanónico (== paidAfter).
    //    - legacyPaidBase se CONGELA acá si es el primer cobro (freezeBase), en
    //      DECIMAL exacto desde centavos (sin float), ANTES del insert marcado.
    const newMeta = { ...meta, amountPaid: centsToNumber(paidAfterCents) };
    const jobUpdate: Record<string, unknown> = {
      status: newStatus,
      paymentStatus: newPaymentStatus,
      notes: JSON.stringify(newMeta),
    };
    if (freezeBase) jobUpdate.legacyPaidBase = centsToDecimalString(baseCents);
    await tx.update(jobs).set(jobUpdate).where(eq(jobs.id, params.jobId));

    // 9) Crear la transaction de cobro MARCADA (isJobPayment=true) en la MISMA
    //    transacción, DESPUÉS de congelada la base. Campos sensibles
    //    (type/category/relatedJobId/isJobPayment) fijados server-side.
    const amountNum = centsToNumber(params.amountCents);
    const ivaAmountNum = Math.round(((amountNum * rate) / (100 + rate)) * 100) / 100; // IVA incluido (semántica actual)
    const insertRes = await tx.insert(transactions).values({
      type: "income",
      category: "Cobro de trabajo",
      description: `Cobro ${job.jobNumber} - ${job.title} (${job.customerName ?? "Sin cliente"})`,
      amount: String(amountNum),
      date: params.date,
      paymentMethod: params.paymentMethod,
      status: "completed",
      reference: job.jobNumber ?? "",
      customerId: job.customerId ?? null,
      customerName: job.customerName ?? "",
      supplierId: null,
      supplierName: "",
      invoiceType: typeof meta.invoiceType === "string" ? meta.invoiceType : "",
      invoiceNumber: job.invoiceNumber ?? "",
      ivaRate: String(rate),
      ivaAmount: String(ivaAmountNum),
      totalWithIva: String(amountNum),
      cuitComprador: "",
      cuitVendedor: job.customerCuit ?? "",
      relatedJobId: params.jobId,
      isJobPayment: true,
      notes: params.notes || `Cobro registrado desde Cobranzas - ${job.jobNumber}`,
    });

    return {
      transactionId: insertRes[0].insertId,
      isFullyPaid,
      newAmountPaid: centsToNumber(paidAfterCents),
      totalAmount: centsToNumber(totalCents),
      jobNumber: job.jobNumber ?? "",
      title: job.title ?? "",
      customerName: job.customerName ?? null,
      oldStatus: job.status ?? "invoiced",
      newStatus: newStatus ?? "invoiced",
    };
  });
}

export async function getNextBudgetNumber(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  // Find the highest PR-XXXX number in the database
  const result = await db
    .select({ budgetNumber: jobs.budgetNumber })
    .from(jobs)
    .where(like(jobs.budgetNumber, 'PR-%'));
  
  let maxNum = 0;
  for (const row of result) {
    const bn = row.budgetNumber ?? '';
    // Match PR-XXXX format (correlative)
    const correlativeMatch = bn.match(/^PR-(\d{4,})$/);
    if (correlativeMatch) {
      const num = parseInt(correlativeMatch[1], 10);
      if (num > maxNum) maxNum = num;
    }
    // Also match old PR-YYMM-XXX format to not collide
    const oldMatch = bn.match(/^PR-\d{4}-(\d+)$/);
    if (oldMatch) {
      // These are old format, just count them
      maxNum = Math.max(maxNum, result.indexOf(row) + 1);
    }
  }
  
  // Count total PR- entries to ensure we're always above existing count
  const totalPrEntries = result.length;
  const nextNum = Math.max(maxNum + 1, totalPrEntries + 1);
  
  return `PR-${String(nextNum).padStart(4, '0')}`;
}

// ========== Seed initial INGEM users ==========
// Crea un único administrador inicial SOLO si la tabla está vacía y si se
// proveen las credenciales por variables de entorno. Nunca guarda contraseñas
// en texto plano ni usa credenciales hardcodeadas. Si falta la contraseña, el
// seed se deshabilita de forma segura (no crea ningún usuario).
// `dbClient` es una inyección SOLO para tests (permite ejercitar la lógica real
// con un doble en memoria, sin URL ni conexión). En producción se llama sin
// argumentos y usa getDb() como siempre: comportamiento idéntico.
export async function seedIngemUsers(dbClient?: any) {
  const db = dbClient ?? await getDb();
  if (!db) return;

  const email = process.env.INGEM_SEED_ADMIN_EMAIL;
  const password = process.env.INGEM_SEED_ADMIN_PASSWORD;
  const name = process.env.INGEM_SEED_ADMIN_NAME || "Administrador";

  if (!email || !password) {
    console.warn(
      "[Seed] Deshabilitado: definí INGEM_SEED_ADMIN_EMAIL e INGEM_SEED_ADMIN_PASSWORD para crear el admin inicial."
    );
    return;
  }

  const existing = await db.select().from(ingemUsers).limit(1);
  if (existing.length > 0) return;

  const passwordHash = await hashPassword(password);
  await db.insert(ingemUsers).values([
    { name, email, password: null, passwordHash, role: "admin", isActive: true },
  ]);
  console.log("[Seed] Administrador inicial creado (con hash).");
}

// ========== Export all data (for Google Drive backup) ==========
// `dbClient` es una inyección SOLO para tests (misma semántica que seedIngemUsers).
// En producción se llama sin argumentos: comportamiento idéntico.
export async function exportAllData(dbClient?: any) {
  const db = dbClient ?? await getDb();
  if (!db) return null;
  const [allCustomers, allSuppliers, allProducts, allTechnicians, allAppointments, allNotes, allTransactions, allJobs, allIngemUsers] = await Promise.all([
    db.select().from(customers),
    db.select().from(suppliers),
    db.select().from(products),
    db.select().from(technicians),
    db.select().from(appointments),
    db.select().from(notes),
    db.select().from(transactions),
    db.select().from(jobs),
    db.select().from(ingemUsers),
  ]);
  // Nunca exportar datos de autenticación (password/passwordHash/tokens/secretos).
  // Solo se incluye información administrativa necesaria de cada usuario.
  const safeIngemUsers = allIngemUsers.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    allowedModules: u.allowedModules,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  return {
    exportDate: new Date().toISOString(),
    customers: allCustomers,
    suppliers: allSuppliers,
    products: allProducts,
    technicians: allTechnicians,
    appointments: allAppointments,
    notes: allNotes,
    transactions: allTransactions,
    jobs: allJobs,
    ingemUsers: safeIngemUsers,
  };
}
