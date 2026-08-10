import { eq, desc, sql, like, and, inArray, lt, or, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  customers, suppliers, products, technicians,
  appointments, notes, transactions, jobs, ingemUsers, loginRateLimits,
  privateFiles
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { hashPassword } from './passwordUtils';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  return db.transaction(async (tx) => {
    const res = await tx.insert(jobs).values(jobData);
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
 */
export async function updateJobWithFileBindings(
  jobId: number,
  jobData: any,
  bindings: JobFileBinding[] | null,
  userId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.transaction(async (tx) => {
    await tx.update(jobs).set(jobData).where(eq(jobs.id, jobId));
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

export async function createTransaction(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(transactions).values(data);
  return { id: result[0].insertId };
}

export async function updateTransaction(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(transactions).set(data).where(eq(transactions.id, id));
}

export async function deleteTransaction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
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

export async function createJob(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(jobs).values(data);
  return { id: result[0].insertId };
}

export async function updateJob(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(jobs).set(data).where(eq(jobs.id, id));
}

export async function deleteJob(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(jobs).where(eq(jobs.id, id));
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
export async function seedIngemUsers() {
  const db = await getDb();
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
export async function exportAllData() {
  const db = await getDb();
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
  const safeIngemUsers = allIngemUsers.map(u => ({
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
