import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";

function createAuthenticatedContext(token: string): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: { authorization: `Bearer ${token}` },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Appointments - Recurrence & Completion", () => {
  let authToken: string;

  beforeAll(async () => {
    authToken = await generateIngemToken({
      userId: 1,
      email: "maxi@ingem.com",
      name: "Maxi",
      role: "admin",
    });
  });

  describe("Recurring appointments", () => {
    it("creates multiple appointments for weekly recurrence", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext(authToken));
      const result = await caller.appointments.create({
        title: "Test Recurrente Semanal",
        date: "2026-08-01",
        time: "10:00",
        endTime: "60",
        status: "pending",
        clientId: "1",
        clientName: "Test Client",
        clientPhone: "1155001234",
        address: "Test Address 123",
        notes: "Test recurrence",
        technicianIds: "",
        technicianNames: "",
        productIds: "",
        productNames: "",
        recurrenceType: "weekly",
        recurrenceEndDate: "2026-08-22",
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");

      // Verify recurring appointments were created
      const allAppointments = await caller.appointments.list();
      const recurringGroup = allAppointments.filter(
        (a: any) => a.title === "Test Recurrente Semanal" && a.recurrenceType === "weekly"
      );

      // 08/01, 08/08, 08/15, 08/22 = 4 appointments
      expect(recurringGroup.length).toBeGreaterThanOrEqual(3);
      expect(recurringGroup[0].recurrenceGroupId).toBeTruthy();
    });

    it("creates appointments for biweekly recurrence", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext(authToken));
      const result = await caller.appointments.create({
        title: "Test Recurrente Quincenal",
        date: "2026-09-01",
        time: "14:00",
        endTime: "90",
        status: "confirmed",
        clientId: "2",
        clientName: "Another Client",
        clientPhone: "1166002345",
        address: "Another Address 456",
        notes: "Biweekly test",
        technicianIds: "",
        technicianNames: "",
        productIds: "",
        productNames: "",
        recurrenceType: "biweekly",
        recurrenceEndDate: "2026-10-01",
      });

      expect(result).toHaveProperty("id");

      const allAppointments = await caller.appointments.list();
      const recurringGroup = allAppointments.filter(
        (a: any) => a.title === "Test Recurrente Quincenal" && a.recurrenceType === "biweekly"
      );

      // 09/01, 09/15, 09/29 = 3 appointments (biweekly within 30 days)
      expect(recurringGroup.length).toBeGreaterThanOrEqual(2);
    });

    it("creates appointment without recurrence when recurrenceType is none", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext(authToken));
      const uniqueTitle = `Test Sin Recurrencia ${Date.now()}`;
      const result = await caller.appointments.create({
        title: uniqueTitle,
        date: "2026-10-15",
        time: "08:00",
        endTime: "45",
        status: "pending",
        clientId: "1",
        clientName: "Test Client",
        clientPhone: "1155001234",
        address: "Test Address",
        notes: "",
        technicianIds: "",
        technicianNames: "",
        productIds: "",
        productNames: "",
        recurrenceType: "none",
        recurrenceEndDate: "",
      });

      expect(result).toHaveProperty("id");

      const allAppointments = await caller.appointments.list();
      const single = allAppointments.filter(
        (a: any) => a.title === uniqueTitle
      );

      expect(single.length).toBe(1);
      expect(single[0].recurrenceGroupId).toBeFalsy();
    });
  });

  describe("Completion notes", () => {
    it("completes an appointment with notes", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext(authToken));
      
      // First create an appointment
      const created = await caller.appointments.create({
        title: "Test Para Completar",
        date: "2026-11-01",
        time: "11:00",
        endTime: "60",
        status: "pending",
        clientId: "1",
        clientName: "Test Client",
        clientPhone: "1155001234",
        address: "Test Address",
        notes: "",
        technicianIds: "",
        technicianNames: "",
        productIds: "",
        productNames: "",
        recurrenceType: "none",
        recurrenceEndDate: "",
      });

      // Complete it with notes
      const result = await caller.appointments.complete({
        id: created.id,
        completionNotes: "Se instaló equipo correctamente. Cliente conforme.",
        completedBy: "Maxi",
      });

      expect(result).toEqual({ success: true });

      // Verify the appointment is now completed with notes
      const allAppointments = await caller.appointments.list();
      const completed = allAppointments.find((a: any) => a.id === created.id);

      expect(completed).toBeTruthy();
      expect(completed!.status).toBe("completed");
      expect(completed!.completionNotes).toBe("Se instaló equipo correctamente. Cliente conforme.");
      expect(completed!.completedBy).toBe("Maxi");
    });

    it("completes even with minimal notes", async () => {
      const caller = appRouter.createCaller(createAuthenticatedContext(authToken));
      
      const created = await caller.appointments.create({
        title: "Test Completar Notas Cortas",
        date: "2026-11-05",
        time: "15:00",
        endTime: "30",
        status: "pending",
        clientId: "1",
        clientName: "Test Client",
        clientPhone: "1155001234",
        address: "Test Address",
        notes: "",
        technicianIds: "",
        technicianNames: "",
        productIds: "",
        productNames: "",
        recurrenceType: "none",
        recurrenceEndDate: "",
      });

      // Complete with minimal notes
      const result = await caller.appointments.complete({
        id: created.id,
        completionNotes: "OK",
        completedBy: "Maxi",
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe("Authentication", () => {
    it("rejects appointment creation without auth token", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      
      await expect(
        caller.appointments.create({
          title: "Unauthorized Test",
          date: "2026-12-01",
          time: "09:00",
          endTime: "60",
          status: "pending",
          clientId: "1",
          clientName: "Test",
          clientPhone: "123",
          address: "Test",
          notes: "",
          technicianIds: "",
          technicianNames: "",
          productIds: "",
          productNames: "",
          recurrenceType: "none",
          recurrenceEndDate: "",
        })
      ).rejects.toThrow();
    });

    it("rejects appointment completion without auth token", async () => {
      const caller = appRouter.createCaller(createUnauthenticatedContext());
      
      await expect(
        caller.appointments.complete({
          id: 1,
          completionNotes: "Test notes",
          completedBy: "Test",
        })
      ).rejects.toThrow();
    });
  });
});
