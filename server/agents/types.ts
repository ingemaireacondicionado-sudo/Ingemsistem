/**
 * Tipos del módulo de AGENTES DE GESTIÓN.
 *
 * Principio rector: el agente NO decide sobre plata ni escribe en el sistema por
 * su cuenta. El reparto de responsabilidades es estricto:
 *
 *   - El SERVIDOR calcula los NÚMEROS (saldos, antigüedad, márgenes, caja) de
 *     forma determinista, en centavos enteros, a partir de la base. Esos números
 *     son la "evidencia" y viajan tal cual a la decisión guardada.
 *   - El MODELO sólo ordena, prioriza y REDACTA (título, fundamento, mensaje al
 *     cliente) sobre esa evidencia. Nunca inventa importes ni entidades: toda
 *     decisión que cite una referencia inexistente se descarta (ver validation.ts).
 *   - El HUMANO aprueba. Nada se ejecuta sin aprobación, y sólo dentro de la
 *     allowlist de acciones de actions.ts.
 */

export type AgentKey = "collections" | "finance";

export const AGENT_KEYS: readonly AgentKey[] = ["collections", "finance"] as const;

export function isAgentKey(value: unknown): value is AgentKey {
  return typeof value === "string" && (AGENT_KEYS as readonly string[]).includes(value);
}

export type DecisionPriority = "low" | "medium" | "high" | "urgent";

export const DECISION_PRIORITIES: readonly DecisionPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
] as const;

/**
 * Acciones EJECUTABLES tras una aprobación. La lista es deliberadamente corta y
 * no monetaria:
 *   - review_only:   la decisión es informativa; aprobarla sólo la marca como
 *                    atendida (no toca ningún dato del sistema).
 *   - create_note:   crea una nota/tarea en el módulo de Notas (el canal natural
 *                    para "hay que hacer esto").
 *   - draft_message: deja redactado un mensaje para el cliente. NO envía nada:
 *                    el texto queda guardado para copiar y mandar por el canal
 *                    que el dueño elija.
 *
 * NO existe —ni debe agregarse sin revisión explícita— ninguna acción que
 * registre cobros, edite montos de trabajos o toque transacciones: el ledger
 * canónico sigue siendo exclusivo de registerPayment.
 */
export type ActionType = "review_only" | "create_note" | "draft_message";

export const ACTION_TYPES: readonly ActionType[] = [
  "review_only",
  "create_note",
  "draft_message",
] as const;

export function isActionType(value: unknown): value is ActionType {
  return typeof value === "string" && (ACTION_TYPES as readonly string[]).includes(value);
}

/** Referencia estable a una entidad del sistema, del estilo "job:12". */
export type EntityRef = {
  type: "job" | "customer";
  id: number;
};

export function formatRef(ref: EntityRef): string {
  return `${ref.type}:${ref.id}`;
}

export function parseRef(raw: unknown): EntityRef | null {
  if (typeof raw !== "string") return null;
  const [type, rawId] = raw.split(":");
  if (type !== "job" && type !== "customer") return null;
  if (!/^\d+$/.test(rawId ?? "")) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { type, id };
}

/**
 * Decisión YA VALIDADA, lista para persistirse. La evidencia es del servidor;
 * del modelo sólo sobreviven los campos de texto y la prioridad.
 */
export type ValidatedDecision = {
  ref: string;
  entityType: string;
  entityId: number | null;
  title: string;
  rationale: string;
  recommendation: string;
  priority: DecisionPriority;
  actionType: ActionType;
  actionPayload: Record<string, unknown>;
  evidence: Record<string, unknown>;
};

/** Un candidato es una fila de evidencia que el servidor consideró relevante. */
export type Candidate = {
  ref: string;
  entityType: "job" | "customer";
  entityId: number;
  /** Etiqueta legible para el prompt y para la UI. */
  label: string;
  /** Números y hechos duros. Se copian a la decisión sin pasar por el modelo. */
  evidence: Record<string, unknown>;
};

/** Paquete determinista que se le entrega al modelo. */
export type AgentFacts = {
  agentKey: AgentKey;
  /** Fecha de referencia (YYYY-MM-DD) usada para toda la aritmética temporal. */
  today: string;
  /** Agregados del negocio: totales, promedios, alertas globales. */
  summary: Record<string, unknown>;
  /** Filas sobre las que el agente puede opinar. */
  candidates: Candidate[];
  /** Cosas que el servidor NO pudo calcular con certeza (datos ambiguos). */
  warnings: string[];
};
