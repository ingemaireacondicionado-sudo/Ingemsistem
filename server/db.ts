import { eq, desc, sql, like, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  customers, suppliers, products, technicians,
  appointments, notes, transactions, jobs, ingemUsers
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

export async function createIngemUser(data: { name: string; email: string; password: string; role: "admin" | "manager" | "technician" | "viewer"; isActive: boolean; allowedModules?: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(ingemUsers).values({
    name: data.name, email: data.email, password: data.password,
    role: data.role, isActive: data.isActive,
    allowedModules: data.allowedModules ? JSON.stringify(data.allowedModules) : null,
  });
  return { id: result[0].insertId };
}

export async function updateIngemUser(id: number, data: Partial<{ name: string; email: string; password: string; role: "admin" | "manager" | "technician" | "viewer"; isActive: boolean; allowedModules?: string[] }>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.password !== undefined) updateData.password = data.password;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.allowedModules !== undefined) updateData.allowedModules = JSON.stringify(data.allowedModules);
  await db.update(ingemUsers).set(updateData).where(eq(ingemUsers.id, id));
}

export async function deleteIngemUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(ingemUsers).where(eq(ingemUsers.id, id));
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
export async function seedIngemUsers() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(ingemUsers).limit(1);
  if (existing.length > 0) return;
  await db.insert(ingemUsers).values([
    { name: "Maxi", email: "maxi@ingem.com", password: "maxi", role: "admin", isActive: true },
    { name: "Ludmila", email: "ludmila@ingem.com", password: "ludmila", role: "manager", isActive: true },
  ]);
  console.log("[Seed] Initial INGEM users created");
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
