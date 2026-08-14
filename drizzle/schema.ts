import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean as mysqlBoolean, customType, index } from "drizzle-orm/mysql-core";

/**
 * Columna MEDIUMBLOB (hasta 16 MB) para almacenar bytes de archivos privados en
 * TiDB. Drizzle no expone un helper nativo para MEDIUMBLOB, así que se define
 * con customType. El valor viaja como Buffer en ambos sentidos.
 */
const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "mediumblob";
  },
});

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
  // Contraseña en texto plano (LEGADO). Se mantiene por compatibilidad durante
  // la transición a hash; ya no se escriben nuevas contraseñas en claro.
  password: varchar("password", { length: 255 }),
  // Hash seguro (bcrypt) de la contraseña. Fuente de verdad a partir de ahora.
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("ingemRole", ["admin", "manager", "technician", "viewer"]).default("viewer").notNull(),
  isActive: mysqlBoolean("isActive").default(true).notNull(),
  allowedModules: text("allowedModules"), // JSON array
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Rate limiting de login, compartido entre instancias vía TiDB.
 * NO almacena contraseñas, JWT ni secretos. La clave (rateKey) es un HMAC-SHA256
 * de "ip:<ip>" o "ipemail:<ip>|<email normalizado>", de modo que ni la IP ni el
 * email quedan en claro.
 */
export const loginRateLimits = mysqlTable("login_rate_limits", {
  rateKey: varchar("rateKey", { length: 64 }).primaryKey(), // HMAC-SHA256 hex
  attempts: int("attempts").default(0).notNull(),
  windowStart: timestamp("windowStart").defaultNow().notNull(),
  blockedUntil: timestamp("blockedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Almacenamiento PRIVADO de archivos (órdenes de compra, facturas, documentos de
 * técnicos). A diferencia del storage de Manus Forge (público), estos bytes viven
 * en la base y sólo se sirven a través de un endpoint autenticado que verifica
 * sesión, usuario activo y permisos por rol. La tabla NO guarda rutas ni URLs
 * públicas: el contenido real está en `data` (MEDIUMBLOB) y el tipo se detecta y
 * fija en el servidor (`mimeType`), nunca desde el cliente.
 */
export const privateFiles = mysqlTable("private_files", {
  id: int("id").autoincrement().primaryKey(),
  // Nombre "amigable" original (ya saneado en el servidor). Nunca se usa crudo en
  // headers HTTP; sirve sólo como sugerencia de descarga.
  originalName: varchar("originalName", { length: 255 }).notNull(),
  // MIME REAL detectado por magic bytes en el servidor (no el del cliente).
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  // Tamaño en bytes del contenido real (post-decodificación base64).
  sizeBytes: int("sizeBytes").notNull(),
  // Bytes del archivo. MEDIUMBLOB soporta hasta 16 MB; nuestros límites reales
  // son 8 MB (PDF) / 5 MB (imágenes).
  data: mediumblob("data").notNull(),
  // Categoría de negocio a la que pertenece el archivo.
  category: mysqlEnum("category", ["purchase_order", "invoice", "technician_document"]).notNull(),
  // Entidad asociada (p. ej. "job", "technician") y su id, para verificar la
  // relación en la descarga. Nullable para no forzar el vínculo en el alta.
  entityType: varchar("entityType", { length: 50 }),
  entityId: int("entityId"),
  // Usuario ingem que subió el archivo (auditoría).
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PrivateFile = typeof privateFiles.$inferSelect;
export type InsertPrivateFile = typeof privateFiles.$inferInsert;

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
  // 8B-5: marca SERVER-CONTROLLED de "cobro de trabajo" del ledger canónico.
  // Sólo registerPayment (8B-5c) podrá ponerla en true; el CRUD genérico la fuerza
  // a false y no puede editar/eliminar filas marcadas. Las transactions históricas
  // quedan en false (no se reinterpretan). Default false para no tocar filas
  // existentes al migrar.
  isJobPayment: mysqlBoolean("isJobPayment").default(false).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  // 8B-5c: índice compuesto para el SUM canónico de cobros marcados de un job
  // (WHERE relatedJobId = ? AND isJobPayment = true). El registro de cada cobro
  // hace este SUM bajo lock; sin índice sería un full scan de transactions que
  // crece con todo el histórico. Aditivo, no único (un job tiene varios cobros).
  relatedJobPaymentIdx: index("idx_tx_related_job_payment").on(t.relatedJobId, t.isJobPayment),
}));

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
  // 8B-5: base de cobro heredada, SERVER-CONTROLLED. NULL = job aún NO migrado al
  // modelo canónico (transición). Se congelará una única vez en el cutover (8B-5c)
  // = amountPaid válido actual. No la controla el cliente ni el CRUD genérico.
  // Nullable a propósito y sin default (todos los jobs existentes quedan NULL).
  legacyPaidBase: decimal("legacyPaidBase", { precision: 12, scale: 2 }),
  startDate: varchar("startDate", { length: 20 }).default(""),
  endDate: varchar("endDate", { length: 20 }).default(""),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * Controles globales de sistema (key/value) compartidos por TODOS los procesos y
 * versiones en TiDB. Primer uso (8B-5): el GATE de cobranzas.
 *   controlKey = 'payments_locked', value = 'false' | 'true'.
 * Semántica FAIL-CLOSED: SÓLO el literal exacto 'false' abre las cobranzas;
 * cualquier otro valor / fila ausente / error ⇒ cobranzas bloqueadas. El gate se
 * activa/desactiva por SQL controlado (no hay endpoint). La fila es además la
 * frontera lockeable (SELECT ... FOR UPDATE) del drenaje del cutover.
 */
export const systemControls = mysqlTable("system_controls", {
  controlKey: varchar("controlKey", { length: 64 }).primaryKey(),
  value: varchar("value", { length: 255 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
