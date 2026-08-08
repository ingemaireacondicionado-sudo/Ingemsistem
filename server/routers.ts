import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, ingemProtectedProcedure, ingemAdminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import * as notify from "./notifications";
import { storagePut } from "./storage";
import { generateIngemToken } from "./ingemAuth";

// Helper to generate recurring appointment dates
function generateRecurringDates(startDate: string, endDate: string, type: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + "T12:00:00");
  const end = new Date(endDate + "T12:00:00");
  let current = new Date(start);

  const addInterval = (d: Date): Date => {
    const next = new Date(d);
    switch (type) {
      case "weekly": next.setDate(next.getDate() + 7); break;
      case "biweekly": next.setDate(next.getDate() + 14); break;
      case "monthly": next.setMonth(next.getMonth() + 1); break;
      case "quarterly": next.setMonth(next.getMonth() + 3); break;
      default: return end; // no recurrence
    }
    return next;
  };

  current = addInterval(current); // Skip the first date (already created)
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current = addInterval(current);
  }
  return dates;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ========== INGEM Internal Auth ==========
  ingemAuth: router({
    login: publicProcedure
      .input(z.object({ email: z.string(), password: z.string() }))
      .mutation(async ({ input }) => {
        const user = await db.getIngemUserByEmail(input.email);
        if (!user || user.password !== input.password || !user.isActive) {
          return { success: false as const, error: "Credenciales inválidas" };
        }
        // Generate JWT token for authenticated session
        const token = await generateIngemToken({
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        });
        return {
          success: true as const,
          token,
          user: {
            id: user.id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            allowedModules: user.allowedModules ? JSON.parse(user.allowedModules) : undefined,
          },
        };
      }),
    // getUsers is protected - only authenticated users can see the user list
    getUsers: ingemProtectedProcedure.query(async () => {
      const users = await db.getIngemUsers();
      return users.map(u => ({
        id: u.id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        allowedModules: u.allowedModules ? JSON.parse(u.allowedModules) : undefined,
        createdAt: u.createdAt?.toISOString?.() ?? "",
        updatedAt: u.updatedAt?.toISOString?.() ?? "",
      }));
    }),
    createUser: ingemAdminProcedure
      .input(z.object({
        name: z.string(), email: z.string(), password: z.string(),
        role: z.enum(["admin", "manager", "technician", "viewer"]),
        isActive: z.boolean(), allowedModules: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createIngemUser(input);
        return { id: result.id.toString() };
      }),
    updateUser: ingemAdminProcedure
      .input(z.object({
        id: z.number(), name: z.string().optional(), email: z.string().optional(),
        password: z.string().optional(), role: z.enum(["admin", "manager", "technician", "viewer"]).optional(),
        isActive: z.boolean().optional(), allowedModules: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await db.updateIngemUser(id, data);
        return { success: true };
      }),
    deleteUser: ingemAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteIngemUser(input.id);
        return { success: true };
      }),
    // Allow authenticated users to update their own password
    updateOwnPassword: ingemProtectedProcedure
      .input(z.object({
        currentPassword: z.string(),
        newPassword: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const ingemUser = (ctx as any).ingemUser;
        const user = await db.getIngemUserByEmail(ingemUser.email);
        if (!user || user.password !== input.currentPassword) {
          return { success: false, error: "Contraseña actual incorrecta" };
        }
        await db.updateIngemUser(user.id, { password: input.newPassword });
        return { success: true };
      }),
  }),

  // ========== Customers ==========
  customers: router({
    list: ingemProtectedProcedure.query(() => db.getCustomers()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getCustomerById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        firstName: z.string(), lastName: z.string(), email: z.string().default(""),
        phone: z.string().default(""), cuit: z.string().default(""), company: z.string().default(""),
        position: z.string().default(""), status: z.enum(["active", "inactive", "prospect"]).default("prospect"),
        customerType: z.enum(["company", "individual"]).default("company"),
        address: z.string().default(""), city: z.string().default(""), country: z.string().default("Argentina"),
        notes: z.string().default(""),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createCustomer(input);
        notify.notifyCustomerCreated(input).catch(() => {});
        return result;
      }),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), firstName: z.string().optional(), lastName: z.string().optional(),
        email: z.string().optional(), phone: z.string().optional(), cuit: z.string().optional(),
        company: z.string().optional(), position: z.string().optional(),
        status: z.enum(["active", "inactive", "prospect"]).optional(),
        customerType: z.enum(["company", "individual"]).optional(),
        address: z.string().optional(), city: z.string().optional(), country: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await db.updateCustomer(id, data); return { success: true }; }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteCustomer(input.id)),
  }),

  // ========== Suppliers ==========
  suppliers: router({
    list: ingemProtectedProcedure.query(() => db.getSuppliers()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getSupplierById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        name: z.string(), contactName: z.string().default(""), email: z.string().default(""),
        phone: z.string().default(""), cuit: z.string().default(""), category: z.string().default("general"),
        address: z.string().default(""), city: z.string().default(""), country: z.string().default("Argentina"),
        website: z.string().default(""), notes: z.string().default(""), rating: z.number().default(0),
        isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => db.createSupplier(input)),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), name: z.string().optional(), contactName: z.string().optional(),
        email: z.string().optional(), phone: z.string().optional(), cuit: z.string().optional(),
        category: z.string().optional(), address: z.string().optional(), city: z.string().optional(),
        country: z.string().optional(), website: z.string().optional(), notes: z.string().optional(),
        rating: z.number().optional(), isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await db.updateSupplier(id, data); return { success: true }; }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteSupplier(input.id)),
  }),

  // ========== Products ==========
  products: router({
    list: ingemProtectedProcedure.query(() => db.getProducts()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getProductById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        name: z.string(), description: z.string().default(""), category: z.string().default("repuestos"),
        brand: z.string().default(""), model: z.string().default(""), sku: z.string().default(""),
        costPrice: z.string().default("0"), salePrice: z.string().default("0"),
        stock: z.number().default(0), minStock: z.number().default(0),
        supplierId: z.number().nullable().default(null), unit: z.string().default("unidad"),
        location: z.string().default(""), isActive: z.boolean().default(true),
      }))
      .mutation(async ({ input }) => db.createProduct(input)),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), name: z.string().optional(), description: z.string().optional(),
        category: z.string().optional(), brand: z.string().optional(), model: z.string().optional(),
        sku: z.string().optional(), costPrice: z.string().optional(), salePrice: z.string().optional(),
        stock: z.number().optional(), minStock: z.number().optional(),
        supplierId: z.number().nullable().optional(), unit: z.string().optional(),
        location: z.string().optional(), isActive: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await db.updateProduct(id, data); return { success: true }; }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteProduct(input.id)),
  }),

  // ========== Technicians ==========
  technicians: router({
    list: ingemProtectedProcedure.query(() => db.getTechnicians()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getTechnicianById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        firstName: z.string(), lastName: z.string(), email: z.string().default(""),
        phone: z.string().default(""), specialty: z.string().default(""),
        isActive: z.boolean().default(true), hireDate: z.string().default(""),
        address: z.string().default(""), city: z.string().default(""),
        emergencyContact: z.string().default(""), emergencyPhone: z.string().default(""),
        notes: z.string().default(""), documents: z.string().default("[]"),
      }))
      .mutation(async ({ input }) => db.createTechnician(input)),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), firstName: z.string().optional(), lastName: z.string().optional(),
        email: z.string().optional(), phone: z.string().optional(), specialty: z.string().optional(),
        isActive: z.boolean().optional(), hireDate: z.string().optional(),
        address: z.string().optional(), city: z.string().optional(),
        emergencyContact: z.string().optional(), emergencyPhone: z.string().optional(),
        notes: z.string().optional(), documents: z.string().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await db.updateTechnician(id, data); return { success: true }; }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTechnician(input.id)),
  }),

  // ========== Appointments ==========
  appointments: router({
    list: ingemProtectedProcedure.query(() => db.getAppointments()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getAppointmentById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        title: z.string(), description: z.string().default(""), date: z.string(),
        time: z.string().default(""), endTime: z.string().default(""),
        status: z.enum(["pending", "confirmed", "completed", "cancelled"]).default("pending"),
        customerId: z.number().nullable().default(null), clientName: z.string().default(""),
        clientPhone: z.string().default(""), technicianIds: z.string().default("[]"),
        technicianNames: z.string().default("[]"), productIds: z.string().default("[]"),
        productNames: z.string().default("[]"), address: z.string().default(""),
        notes: z.string().default(""),
        recurrenceType: z.enum(["none", "weekly", "biweekly", "monthly", "quarterly"]).default("none"),
        recurrenceEndDate: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { recurrenceType, recurrenceEndDate, ...appointmentData } = input;
        const recurrenceGroupId = recurrenceType !== "none" ? crypto.randomUUID() : undefined;
        
        // Create the first appointment
        const result = await db.createAppointment({
          ...appointmentData,
          recurrenceType,
          recurrenceEndDate: recurrenceEndDate || null,
          recurrenceGroupId: recurrenceGroupId || null,
          parentAppointmentId: null,
        });

        // Generate recurring appointments
        if (recurrenceType !== "none" && recurrenceEndDate) {
          const parentId = result.id;
          const dates = generateRecurringDates(input.date, recurrenceEndDate, recurrenceType);
          for (const recurDate of dates) {
            await db.createAppointment({
              ...appointmentData,
              date: recurDate,
              recurrenceType,
              recurrenceEndDate: recurrenceEndDate || null,
              recurrenceGroupId: recurrenceGroupId || null,
              parentAppointmentId: parentId,
            });
          }
        }

        notify.notifyAppointmentCreated({
          title: input.title,
          date: input.date,
          time: input.time,
          clientName: input.clientName,
          address: input.address,
        }).catch(() => {});
        return result;
      }),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), title: z.string().optional(), description: z.string().optional(),
        date: z.string().optional(), time: z.string().optional(), endTime: z.string().optional(),
        status: z.enum(["pending", "confirmed", "completed", "cancelled"]).optional(),
        customerId: z.number().nullable().optional(), clientName: z.string().optional(),
        clientPhone: z.string().optional(), technicianIds: z.string().optional(),
        technicianNames: z.string().optional(), productIds: z.string().optional(),
        productNames: z.string().optional(), address: z.string().optional(),
        notes: z.string().optional(),
        completionNotes: z.string().optional(),
        completedBy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        // If marking as completed, set completedAt timestamp
        const updateData: any = { ...data };
        if (data.status === "completed" && !data.completedBy) {
          updateData.completedAt = new Date();
        }
        if (data.completionNotes || data.completedBy) {
          updateData.completedAt = new Date();
        }
        if (data.status) {
          const old = await db.getAppointmentById(id);
          if (old && old.status !== data.status) {
            notify.notifyAppointmentStatusChanged({
              title: old.title,
              date: old.date,
              oldStatus: old.status,
              newStatus: data.status,
            }).catch(() => {});
          }
        }
        await db.updateAppointment(id, updateData);
        return { success: true };
      }),
    // Complete appointment with post-visit notes
    complete: ingemProtectedProcedure
      .input(z.object({
        id: z.number(),
        completionNotes: z.string(),
        completedBy: z.string(),
      }))
      .mutation(async ({ input }) => {
        const old = await db.getAppointmentById(input.id);
        await db.updateAppointment(input.id, {
          status: "completed",
          completionNotes: input.completionNotes,
          completedBy: input.completedBy,
          completedAt: new Date(),
        });
        if (old && old.status !== "completed") {
          notify.notifyAppointmentStatusChanged({
            title: old.title,
            date: old.date,
            oldStatus: old.status,
            newStatus: "completed",
          }).catch(() => {});
        }
        return { success: true };
      }),
    // Delete all future recurring appointments in a group
    deleteRecurrenceGroup: ingemProtectedProcedure
      .input(z.object({ recurrenceGroupId: z.string(), fromDate: z.string().optional() }))
      .mutation(async ({ input }) => {
        await db.deleteRecurrenceGroup(input.recurrenceGroupId, input.fromDate);
        return { success: true };
      }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteAppointment(input.id)),
  }),

  // ========== Notes ==========
  notes: router({
    list: ingemProtectedProcedure.query(() => db.getNotes()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getNoteById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        title: z.string(), content: z.string().default(""),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        status: z.enum(["pending", "in-progress", "completed"]).default("pending"),
        category: z.string().default("general"), dueDate: z.string().default(""),
        assignedTo: z.string().default(""), createdBy: z.string().default(""),
        customerId: z.number().nullable().default(null),
        customerName: z.string().default(""),
        documentType: z.enum(["none", "budget", "invoice"]).default("none"),
        documentNumber: z.string().default(""),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createNote(input);
        if (input.priority === "urgent") {
          notify.notifyUrgentNote({
            title: input.title,
            content: input.content,
            assignedTo: input.assignedTo,
          }).catch(() => {});
        }
        return result;
      }),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), title: z.string().optional(), content: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z.enum(["pending", "in-progress", "completed"]).optional(),
        category: z.string().optional(), dueDate: z.string().optional(),
        assignedTo: z.string().optional(), createdBy: z.string().optional(),
        customerId: z.number().nullable().optional(),
        customerName: z.string().optional(),
        documentType: z.enum(["none", "budget", "invoice"]).optional(),
        documentNumber: z.string().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await db.updateNote(id, data); return { success: true }; }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteNote(input.id)),
  }),

  // ========== Transactions ==========
  transactions: router({
    list: ingemProtectedProcedure.query(() => db.getTransactions()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getTransactionById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        type: z.enum(["income", "expense"]), category: z.string(), description: z.string().default(""),
        amount: z.string(), date: z.string(), paymentMethod: z.string().default("cash"),
        status: z.enum(["pending", "completed", "cancelled"]).default("completed"),
        reference: z.string().default(""), customerId: z.number().nullable().default(null),
        customerName: z.string().default(""), supplierId: z.number().nullable().default(null),
        supplierName: z.string().default(""), invoiceType: z.string().default(""),
        invoiceNumber: z.string().default(""), ivaRate: z.string().default("21"),
        ivaAmount: z.string().default("0"), totalWithIva: z.string().default("0"),
        cuitComprador: z.string().default(""), cuitVendedor: z.string().default(""),
        relatedJobId: z.number().nullable().default(null),
        notes: z.string().default(""),
      }))
      .mutation(async ({ input }) => db.createTransaction(input)),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), type: z.enum(["income", "expense"]).optional(), category: z.string().optional(),
        description: z.string().optional(), amount: z.string().optional(), date: z.string().optional(),
        paymentMethod: z.string().optional(), status: z.enum(["pending", "completed", "cancelled"]).optional(),
        reference: z.string().optional(), customerId: z.number().nullable().optional(),
        customerName: z.string().optional(), supplierId: z.number().nullable().optional(),
        supplierName: z.string().optional(), invoiceType: z.string().optional(),
        invoiceNumber: z.string().optional(), ivaRate: z.string().optional(),
        ivaAmount: z.string().optional(), totalWithIva: z.string().optional(),
        cuitComprador: z.string().optional(), cuitVendedor: z.string().optional(),
        relatedJobId: z.number().nullable().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => { const { id, ...data } = input; await db.updateTransaction(id, data); return { success: true }; }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteTransaction(input.id)),
  }),

  // ========== Jobs ==========
  jobs: router({
    list: ingemProtectedProcedure.query(() => db.getJobs()),
    nextBudgetNumber: ingemProtectedProcedure.query(() => db.getNextBudgetNumber()),
    getById: ingemProtectedProcedure.input(z.object({ id: z.number() })).query(({ input }) => db.getJobById(input.id)),
    create: ingemProtectedProcedure
      .input(z.object({
        jobNumber: z.string(), title: z.string(), description: z.string().default(""),
        status: z.enum(["pending", "in-progress", "completed", "invoiced", "collected"]).default("pending"),
        customerId: z.number().nullable().default(null), customerName: z.string().default(""),
        customerPhone: z.string().default(""), customerCuit: z.string().default(""),
        technicianIds: z.string().default("[]"), technicianNames: z.string().default("[]"),
        productIds: z.string().default("[]"), budgetNumber: z.string().default(""),
        budgetAmount: z.string().default("0"), invoiceNumber: z.string().default(""),
        invoiceAmount: z.string().default("0"), purchaseOrder: z.string().default(""),
        paymentStatus: z.string().default("pending"), startDate: z.string().default(""),
        endDate: z.string().default(""), notes: z.string().default(""),
      }))
      .mutation(async ({ input }) => {
        const result = await db.createJob(input);
        notify.notifyJobCreated({
          jobNumber: input.jobNumber,
          title: input.title,
          customerName: input.customerName,
          status: input.status ?? "pending",
        }).catch(() => {});
        return result;
      }),
    update: ingemProtectedProcedure
      .input(z.object({
        id: z.number(), jobNumber: z.string().optional(), title: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["pending", "in-progress", "completed", "invoiced", "collected"]).optional(),
        customerId: z.number().nullable().optional(), customerName: z.string().optional(),
        customerPhone: z.string().optional(), customerCuit: z.string().optional(),
        technicianIds: z.string().optional(), technicianNames: z.string().optional(),
        productIds: z.string().optional(), budgetNumber: z.string().optional(),
        budgetAmount: z.string().optional(), invoiceNumber: z.string().optional(),
        invoiceAmount: z.string().optional(), purchaseOrder: z.string().optional(),
        paymentStatus: z.string().optional(), startDate: z.string().optional(),
        endDate: z.string().optional(), notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        if (data.status) {
          const old = await db.getJobById(id);
          if (old && old.status !== data.status) {
            notify.notifyJobStatusChanged({
              jobNumber: old.jobNumber,
              title: old.title,
              customerName: old.customerName ?? undefined,
              oldStatus: old.status,
              newStatus: data.status,
            }).catch(() => {});
          }
        }
        await db.updateJob(id, data);
        return { success: true };
      }),
    delete: ingemProtectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => db.deleteJob(input.id)),
    registerPayment: ingemProtectedProcedure
      .input(z.object({
        jobId: z.number(),
        amount: z.string(),
        date: z.string(),
        paymentMethod: z.string().default("transfer"),
        notes: z.string().default(""),
      }))
      .mutation(async ({ input }) => {
        const job = await db.getJobById(input.jobId);
        if (!job) throw new Error("Trabajo no encontrado");

        let meta: any = {};
        try { meta = (job.notes ?? '').startsWith('{') ? JSON.parse(job.notes ?? '') : {}; } catch { meta = {}; }
        const prevAmountPaid = parseFloat(meta.amountPaid ?? '0');
        const newAmountPaid = prevAmountPaid + parseFloat(input.amount);
        meta.amountPaid = newAmountPaid;

        const laborCost = parseFloat(meta.laborCost ?? '0');
        const materialsCost = parseFloat(meta.materialsCost ?? '0');
        const otherCosts = parseFloat(meta.otherCosts ?? '0');
        const ivaRate = parseFloat(meta.ivaRate ?? '0');
        const subtotal = laborCost + materialsCost + otherCosts;
        const ivaAmount = (subtotal * ivaRate) / 100;
        const totalAmount = subtotal + ivaAmount;
        const isFullyPaid = newAmountPaid >= totalAmount;

        await db.updateJob(input.jobId, {
          status: isFullyPaid ? 'collected' : job.status,
          paymentStatus: isFullyPaid ? 'completed' : 'partial',
          notes: JSON.stringify(meta),
        });

        const txResult = await db.createTransaction({
          type: 'income',
          category: 'Cobro de trabajo',
          description: `Cobro ${job.jobNumber} - ${job.title} (${job.customerName ?? 'Sin cliente'})`,
          amount: input.amount,
          date: input.date,
          paymentMethod: input.paymentMethod,
          status: 'completed',
          reference: job.jobNumber ?? '',
          customerId: job.customerId ?? null,
          customerName: job.customerName ?? '',
          supplierId: null,
          supplierName: '',
          invoiceType: meta.invoiceType ?? '',
          invoiceNumber: job.invoiceNumber ?? '',
          ivaRate: String(ivaRate),
          ivaAmount: String((parseFloat(input.amount) * ivaRate) / (100 + ivaRate)),
          totalWithIva: input.amount,
          cuitComprador: '',
          cuitVendedor: job.customerCuit ?? '',
          relatedJobId: input.jobId,
          notes: input.notes || `Cobro registrado desde Cobranzas - ${job.jobNumber}`,
        });

        notify.notifyJobStatusChanged({
          jobNumber: job.jobNumber ?? '',
          title: job.title ?? '',
          customerName: job.customerName ?? undefined,
          oldStatus: job.status ?? 'invoiced',
          newStatus: isFullyPaid ? 'collected' : job.status ?? 'invoiced',
        }).catch(() => {});

        return { success: true, transactionId: txResult.id, isFullyPaid, newAmountPaid, totalAmount };
      }),
  }),

  // ========== File Upload ==========
  files: router({
    upload: ingemProtectedProcedure
      .input(z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded
        contentType: z.string().default("application/pdf"),
        folder: z.string().default("documents"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.fileData, "base64");
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const safeFileName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `${input.folder}/${timestamp}-${randomSuffix}-${safeFileName}`;
        const { url } = await storagePut(fileKey, buffer, input.contentType);
        return { url, fileKey };
      }),
  }),

  // ========== Data Export (for Google Drive backup) ==========
  // Solo Administrador: el respaldo incluye datos de toda la empresa.
  dataExport: router({
    exportAll: ingemAdminProcedure.query(() => db.exportAllData()),
  }),
});

export type AppRouter = typeof appRouter;
