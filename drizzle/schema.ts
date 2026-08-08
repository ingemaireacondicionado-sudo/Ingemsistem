import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean as mysqlBoolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing Manus OAuth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Internal INGEM users (the original auth system: Maxi, Ludmila, etc.)
 */
export const ingemUsers = mysqlTable("ingem_users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: mysqlEnum("ingemRole", ["admin", "manager", "technician", "viewer"]).default("viewer").notNull(),
  isActive: mysqlBoolean("isActive").default(true).notNull(),
  allowedModules: text("allowedModules"), // JSON array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Customers
 */
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).default(""),
  phone: varchar("phone", { length: 50 }).default(""),
  cuit: varchar("cuit", { length: 20 }).default(""),
  company: varchar("company", { length: 200 }).default(""),
  position: varchar("position", { length: 100 }).default(""),
  status: mysqlEnum("status", ["active", "inactive", "prospect"]).default("prospect").notNull(),
  customerType: mysqlEnum("customerType", ["company", "individual"]).default("company").notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }).default(""),
  country: varchar("country", { length: 100 }).default("Argentina"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastContact: timestamp("lastContact").defaultNow().notNull(),
});

/**
 * Suppliers
 */
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contactName", { length: 100 }).default(""),
  email: varchar("email", { length: 320 }).default(""),
  phone: varchar("phone", { length: 50 }).default(""),
  cuit: varchar("cuit", { length: 20 }).default(""),
  category: varchar("category", { length: 100 }).default("general"),
  address: text("address"),
  city: varchar("city", { length: 100 }).default(""),
  country: varchar("country", { length: 100 }).default("Argentina"),
  website: varchar("website", { length: 500 }).default(""),
  notes: text("notes"),
  rating: int("rating").default(0),
  isActive: mysqlBoolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Products
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }).default("repuestos"),
  brand: varchar("brand", { length: 100 }).default(""),
  model: varchar("model", { length: 100 }).default(""),
  sku: varchar("sku", { length: 50 }).default(""),
  costPrice: decimal("costPrice", { precision: 12, scale: 2 }).default("0"),
  salePrice: decimal("salePrice", { precision: 12, scale: 2 }).default("0"),
  stock: int("stock").default(0),
  minStock: int("minStock").default(0),
  supplierId: int("supplierId"),
  unit: varchar("unit", { length: 20 }).default("unidad"),
  location: varchar("location", { length: 100 }).default(""),
  isActive: mysqlBoolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Technicians
 */
export const technicians = mysqlTable("technicians", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).default(""),
  phone: varchar("phone", { length: 50 }).default(""),
  specialty: varchar("specialty", { length: 200 }).default(""),
  isActive: mysqlBoolean("isActive").default(true).notNull(),
  hireDate: varchar("hireDate", { length: 20 }).default(""),
  address: text("address"),
  city: varchar("city", { length: 100 }).default(""),
  emergencyContact: varchar("emergencyContact", { length: 100 }).default(""),
  emergencyPhone: varchar("emergencyPhone", { length: 50 }).default(""),
  notes: text("notes"),
  documents: text("documents"), // JSON array of document objects
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Appointments (Agenda/Calendar)
 */
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  date: varchar("date", { length: 20 }).notNull(),
  time: varchar("time", { length: 10 }).default(""),
  endTime: varchar("endTime", { length: 10 }).default(""),
  status: mysqlEnum("appointmentStatus", ["pending", "confirmed", "completed", "cancelled"]).default("pending").notNull(),
  customerId: int("customerId"),
  clientName: varchar("clientName", { length: 200 }).default(""),
  clientPhone: varchar("clientPhone", { length: 50 }).default(""),
  technicianIds: text("technicianIds"), // JSON array
  technicianNames: text("technicianNames"), // JSON array
  productIds: text("productIds"), // JSON array
  productNames: text("productNames"), // JSON array
  address: text("address"),
  notes: text("notes"),
  // Recurrence fields
  recurrenceType: varchar("recurrenceType", { length: 20 }).default("none"), // none, weekly, biweekly, monthly, quarterly
  recurrenceEndDate: varchar("recurrenceEndDate", { length: 20 }), // YYYY-MM-DD
  parentAppointmentId: int("parentAppointmentId"), // ID del turno padre (null si es el original)
  recurrenceGroupId: varchar("recurrenceGroupId", { length: 50 }), // UUID para agrupar turnos recurrentes
  // Completion notes (post-visit)
  completionNotes: text("completionNotes"), // Notas de lo que se hizo en la visita
  completedBy: varchar("completedBy", { length: 100 }), // Quién completó el turno
  completedAt: timestamp("completedAt"), // Cuándo se completó
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Notes
 */
export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  status: mysqlEnum("noteStatus", ["pending", "in-progress", "completed"]).default("pending").notNull(),
  category: varchar("category", { length: 100 }).default("general"),
  dueDate: varchar("dueDate", { length: 20 }).default(""),
  assignedTo: varchar("assignedTo", { length: 100 }).default(""),
  createdBy: varchar("createdBy", { length: 100 }).default(""),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 200 }).default(""),
  documentType: mysqlEnum("documentType", ["none", "budget", "invoice"]).default("none").notNull(),
  documentNumber: varchar("documentNumber", { length: 100 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Financial Transactions
 */
export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("transactionType", ["income", "expense"]).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }).default(""),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  paymentMethod: varchar("paymentMethod", { length: 50 }).default("cash"),
  status: mysqlEnum("transactionStatus", ["pending", "completed", "cancelled"]).default("completed").notNull(),
  reference: varchar("reference", { length: 100 }).default(""),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 200 }).default(""),
  supplierId: int("supplierId"),
  supplierName: varchar("supplierName", { length: 200 }).default(""),
  invoiceType: varchar("invoiceType", { length: 10 }).default(""),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).default(""),
  ivaRate: decimal("ivaRate", { precision: 5, scale: 2 }).default("21"),
  ivaAmount: decimal("ivaAmount", { precision: 12, scale: 2 }).default("0"),
  totalWithIva: decimal("totalWithIva", { precision: 12, scale: 2 }).default("0"),
  cuitComprador: varchar("cuitComprador", { length: 20 }).default(""),
  cuitVendedor: varchar("cuitVendedor", { length: 20 }).default(""),
  relatedJobId: int("relatedJobId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Jobs (Trabajos)
 */
export const jobs = mysqlTable("jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobNumber: varchar("jobNumber", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: mysqlEnum("jobStatus", ["pending", "in-progress", "completed", "invoiced", "collected"]).default("pending").notNull(),
  customerId: int("customerId"),
  customerName: varchar("customerName", { length: 200 }).default(""),
  customerPhone: varchar("customerPhone", { length: 50 }).default(""),
  customerCuit: varchar("customerCuit", { length: 20 }).default(""),
  technicianIds: text("technicianIds"), // JSON array
  technicianNames: text("technicianNames"), // JSON array
  productIds: text("productIds"), // JSON array
  budgetNumber: varchar("budgetNumber", { length: 50 }).default(""),
  budgetAmount: decimal("budgetAmount", { precision: 12, scale: 2 }).default("0"),
  invoiceNumber: varchar("invoiceNumber", { length: 50 }).default(""),
  invoiceAmount: decimal("invoiceAmount", { precision: 12, scale: 2 }).default("0"),
  purchaseOrder: varchar("purchaseOrder", { length: 50 }).default(""),
  paymentStatus: varchar("paymentStatus", { length: 50 }).default("pending"),
  startDate: varchar("startDate", { length: 20 }).default(""),
  endDate: varchar("endDate", { length: 20 }).default(""),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
