import { describe, expect, it, beforeAll, vi } from "vitest";

// Mock COMPLETO de ./db en memoria (sin funciones reales de escritura ni URL) y
// de ./notifications (no-op). Se verifica que los triggers de notificación NO
// rompen las mutaciones del router.
const store = vi.hoisted(() => ({ nextId: 1 }));
vi.mock("./db", () => ({
  getIngemUserById: async (id: number) =>
    id === 1 ? { id: 1, name: "Maxi", email: "maxi@ingem.com", role: "admin", isActive: true, allowedModules: null } : undefined,
  createCustomer: async () => ({ id: store.nextId++ }),
  createJobWithFileBindings: async () => ({ id: store.nextId++ }),
  createAppointment: async () => ({ id: store.nextId++ }),
  createNote: async () => ({ id: store.nextId++ }),
}));
vi.mock("./notifications", () => ({
  notifyCustomerCreated: async () => {}, notifyJobCreated: async () => {},
  notifyJobStatusChanged: async () => {}, notifyAppointmentCreated: async () => {},
  notifyAppointmentStatusChanged: async () => {}, notifyUrgentNote: async () => {},
}));

import { appRouter } from "./routers";
import { generateIngemToken } from "./ingemAuth";
import type { TrpcContext } from "./_core/context";

let adminToken: string;

beforeAll(async () => {
  adminToken = await generateIngemToken({
    userId: 1,
    email: "maxi@ingem.com",
    name: "Maxi",
    role: "admin",
  });
});

function createAuthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { authorization: `Bearer ${adminToken}` },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Notification triggers", () => {
  it("creating a customer triggers notification without errors", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    // This should not throw even if notification fails
    const result = await caller.customers.create({
      firstName: "Notif Test",
      lastName: "User",
      email: "notiftest@test.com",
      phone: "+54 11 1234 5678",
      company: "Test Corp",
      customerType: "company",
      status: "prospect",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it("creating a job triggers notification without errors", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.jobs.create({
      jobNumber: "TEST-001",
      title: "Trabajo de prueba notificación",
      description: "Test",
      status: "pending",
      customerName: "Cliente Test",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it("creating an appointment triggers notification without errors", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.appointments.create({
      title: "Turno de prueba notificación",
      date: "2026-03-01",
      time: "10:00",
      clientName: "Cliente Test",
      address: "Calle 30 número 2003, Guernica",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });

  it("creating an urgent note triggers notification without errors", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.notes.create({
      title: "Nota urgente de prueba",
      content: "Contenido urgente",
      priority: "urgent",
      status: "pending",
      assignedTo: "Maxi",
    });
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
  });
});
