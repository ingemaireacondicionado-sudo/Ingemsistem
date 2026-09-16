import { describe, it, expect, vi } from "vitest";
import { executeDecisionAction, EXECUTABLE_ACTIONS, type ExecutableDecision } from "./agents/actions";
import { ACTION_TYPES } from "./agents/types";

// Lo que se prueba acá es el límite de lo que un agente puede llegar a hacer
// cuando un humano aprieta "Aprobar".

function decision(over: Partial<ExecutableDecision> = {}): ExecutableDecision {
  return {
    id: 1,
    agentKey: "collections",
    title: "Cobrar TR-01",
    recommendation: "Llamar al cliente y acordar fecha.",
    priority: "high",
    actionType: "review_only",
    actionPayload: {},
    entityType: "job",
    entityId: 1,
    ...over,
  };
}

const admin = { userId: 1, name: "Maxi", role: "admin" };
const viewer = { userId: 2, name: "Invitado", role: "viewer" };

describe("allowlist de acciones", () => {
  it("el catálogo no incluye ninguna acción monetaria", () => {
    const prohibidas = ["register_payment", "update_job", "create_transaction", "delete_job", "send_email"];
    for (const accion of prohibidas) {
      expect(ACTION_TYPES).not.toContain(accion);
    }
    expect(ACTION_TYPES).toEqual(["review_only", "create_note", "draft_message"]);
  });

  it("la única acción que escribe datos de negocio es crear una nota", () => {
    expect(EXECUTABLE_ACTIONS).toEqual(["create_note"]);
  });

  it("una acción desconocida persistida no se ejecuta ni se adivina", async () => {
    const createNote = vi.fn();
    const outcome = await executeDecisionAction(
      decision({ actionType: "register_payment" as never }),
      admin,
      { createNote },
    );
    expect(outcome.ok).toBe(false);
    expect(createNote).not.toHaveBeenCalled();
  });
});

describe("ejecución de decisiones aprobadas", () => {
  it("review_only no toca nada del sistema", async () => {
    const createNote = vi.fn();
    const outcome = await executeDecisionAction(decision(), admin, { createNote });
    expect(outcome).toEqual({ ok: true, result: expect.stringContaining("No modifica datos") });
    expect(createNote).not.toHaveBeenCalled();
  });

  it("draft_message deja el texto listo pero NO lo envía", async () => {
    const createNote = vi.fn();
    const outcome = await executeDecisionAction(
      decision({
        actionType: "draft_message",
        actionPayload: { channel: "whatsapp", messageText: "Hola, te recuerdo el saldo..." },
      }),
      admin,
      { createNote },
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.result).toContain("no lo envía");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("create_note crea la nota con la prioridad y el autor de quien aprobó", async () => {
    const createNote = vi.fn().mockResolvedValue({ id: 10 });
    const outcome = await executeDecisionAction(
      decision({
        actionType: "create_note",
        priority: "urgent",
        actionPayload: {
          noteTitle: "Facturar TR-01",
          noteContent: "Emitir factura A.",
          dueDate: "2026-04-05",
          customerName: "Frigorífico SA",
        },
      }),
      admin,
      { createNote },
    );
    expect(outcome.ok).toBe(true);
    expect(createNote).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Facturar TR-01",
        content: "Emitir factura A.",
        priority: "urgent",
        status: "pending",
        category: "agente",
        dueDate: "2026-04-05",
        createdBy: "Maxi",
        customerName: "Frigorífico SA",
      }),
    );
  });

  it("aprobar NO eleva privilegios: sin permiso para crear notas, no se crea nada", async () => {
    const createNote = vi.fn();
    const outcome = await executeDecisionAction(
      decision({ actionType: "create_note", actionPayload: { noteTitle: "Algo" } }),
      viewer,
      { createNote },
    );
    expect(outcome.ok).toBe(false);
    expect(createNote).not.toHaveBeenCalled();
  });

  it("una decisión sobre un cliente vincula la nota a ese cliente", async () => {
    const createNote = vi.fn().mockResolvedValue({ id: 11 });
    await executeDecisionAction(
      decision({
        actionType: "create_note",
        entityType: "customer",
        entityId: 7,
        actionPayload: { noteTitle: "Llamar" },
      }),
      admin,
      { createNote },
    );
    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ customerId: 7 }));
  });

  it("una decisión sobre un trabajo no cuelga la nota de un cliente inventado", async () => {
    const createNote = vi.fn().mockResolvedValue({ id: 12 });
    await executeDecisionAction(
      decision({ actionType: "create_note", entityType: "job", entityId: 5, actionPayload: { noteTitle: "Revisar" } }),
      admin,
      { createNote },
    );
    expect(createNote).toHaveBeenCalledWith(expect.objectContaining({ customerId: null }));
  });
});
