import { canCreate } from "@shared/permissions";
import type { ActionType, DecisionPriority } from "./types";

/**
 * EJECUCIÓN de una decisión aprobada.
 *
 * Éste es el único punto del módulo que escribe datos de negocio, y lo hace
 * sobre una lista cerrada de acciones inofensivas. Lo que NO está acá no existe
 * para un agente: no hay forma de que una decisión registre un cobro, edite el
 * monto de un trabajo, toque una transacción o mande un mail solo. El ledger
 * canónico de cobranzas sigue siendo exclusivo de registerPayment, con su gate,
 * su lock y su validación de importes.
 *
 * Además, la aprobación NO sube privilegios: la acción se ejecuta con los
 * permisos del humano que aprueba. Si un gerente no puede crear notas, aprobar
 * una decisión tampoco las crea.
 */

/** Acciones que efectivamente escriben algo. El resto sólo marca la decisión. */
export const EXECUTABLE_ACTIONS: readonly ActionType[] = ["create_note"] as const;

export type ExecutionActor = {
  userId: number;
  name: string;
  role: string;
};

export type ExecutionDeps = {
  createNote: (data: Record<string, unknown>) => Promise<unknown>;
};

export type ExecutionOutcome =
  | { ok: true; result: string }
  | { ok: false; reason: string };

export type ExecutableDecision = {
  id: number;
  agentKey: string;
  title: string;
  recommendation: string | null;
  priority: DecisionPriority;
  actionType: ActionType;
  actionPayload: Record<string, unknown>;
  entityType: string | null;
  entityId: number | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Ejecuta la acción de una decisión ya aprobada. No lanza: devuelve el
 * resultado funcional para que el llamador lo persista en la decisión.
 */
export async function executeDecisionAction(
  decision: ExecutableDecision,
  actor: ExecutionActor,
  deps: ExecutionDeps,
): Promise<ExecutionOutcome> {
  switch (decision.actionType) {
    case "review_only":
      return { ok: true, result: "Revisada y aprobada. No modifica datos del sistema." };

    case "draft_message":
      // El texto ya está guardado con la decisión. Aprobar significa "este
      // mensaje va": queda listo para copiar y enviar por el canal elegido.
      // El sistema NO lo manda: mandar en nombre de la empresa es una decisión
      // del dueño, no un efecto secundario de un clic de aprobación.
      return {
        ok: true,
        result: "Mensaje aprobado. Queda listo para copiar y enviar; el sistema no lo envía solo.",
      };

    case "create_note": {
      if (!canCreate(actor.role, "notes")) {
        return { ok: false, reason: "Tu rol no puede crear notas, así que esta acción no se ejecutó." };
      }
      const title = asString(decision.actionPayload.noteTitle) || decision.title;
      const content = asString(decision.actionPayload.noteContent) || asString(decision.recommendation);
      const dueDate = asString(decision.actionPayload.dueDate);
      const customerName = asString(decision.actionPayload.customerName);

      await deps.createNote({
        title: title.slice(0, 200),
        content,
        priority: decision.priority,
        status: "pending",
        category: "agente",
        dueDate,
        assignedTo: actor.name,
        createdBy: actor.name,
        customerId: decision.entityType === "customer" ? decision.entityId : null,
        customerName,
        documentType: "none",
        documentNumber: "",
      });
      return { ok: true, result: `Nota creada: "${title.slice(0, 120)}".` };
    }

    default: {
      // Defensa en profundidad: si alguna vez se persistiera un actionType que
      // este ejecutor no conoce, no se adivina nada.
      const unknownAction: string = decision.actionType;
      return {
        ok: false,
        reason: `La acción "${unknownAction}" no está habilitada para los agentes y no se ejecutó.`,
      };
    }
  }
}
