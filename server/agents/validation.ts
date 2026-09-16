import {
  isActionType,
  type ActionType,
  type AgentFacts,
  type Candidate,
  type DecisionPriority,
  type ValidatedDecision,
} from "./types";

/**
 * FRONTERA DE CONFIANZA con el modelo.
 *
 * Todo lo que devuelve el LLM entra por acá y sale normalizado, recortado y
 * verificado contra la evidencia. Las tres garantías que este módulo sostiene:
 *
 *  1. ANTI-ALUCINACIÓN: una decisión sólo sobrevive si apunta a una referencia
 *     que el servidor le pasó como candidata. Si el modelo inventa un trabajo o
 *     un cliente, la decisión se descarta (no se "corrige").
 *  2. ALLOWLIST DE ACCIONES: cualquier acción fuera de la lista conocida se
 *     degrada a `review_only`, que no toca ningún dato. Nunca se guarda una
 *     acción ejecutable que el sistema no sepa ejecutar de forma segura.
 *  3. NÚMEROS DEL SERVIDOR: la evidencia guardada con la decisión es SIEMPRE la
 *     del candidato calculado por el servidor, no la que el modelo repita en su
 *     texto. La UI muestra esa evidencia al lado del fundamento, de modo que un
 *     número mal copiado en la prosa queda a la vista contra el dato real.
 */

export const MAX_DECISIONS_PER_RUN = 10;
const MAX_TITLE_LEN = 200;
const MAX_TEXT_LEN = 2000;
const MAX_SUMMARY_LEN = 2000;
const MAX_MESSAGE_LEN = 1500;

export type ValidationResult = {
  summary: string;
  decisions: ValidatedDecision[];
  /** Qué se descartó o degradó, para que quede registrado en la corrida. */
  warnings: string[];
};

/** Recorta y normaliza un texto del modelo. Nunca lanza. */
function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+\n/g, "\n").trim();
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1)}…` : normalized;
}

function cleanPriority(value: unknown): DecisionPriority {
  return value === "low" || value === "medium" || value === "high" || value === "urgent"
    ? value
    : "medium";
}

/**
 * Extrae el objeto JSON de la respuesta del modelo. Tolera texto alrededor y
 * bloques ```json, porque no todos los proveedores respetan response_format.
 */
export function extractJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  const direct = tryParseObject(text);
  if (direct) return direct;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) {
    const parsed = tryParseObject(fenced[1].trim());
    if (parsed) return parsed;
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return tryParseObject(text.slice(start, end + 1));
  }
  return null;
}

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Construye la carga de la acción a partir de lo que propuso el modelo,
 * quedándose SÓLO con los campos que el ejecutor conoce.
 */
function buildActionPayload(
  actionType: ActionType,
  raw: Record<string, unknown>,
  candidate: Candidate,
): Record<string, unknown> {
  if (actionType === "create_note") {
    return {
      noteTitle: cleanText(raw.noteTitle, MAX_TITLE_LEN) || cleanText(raw.title, MAX_TITLE_LEN),
      noteContent: cleanText(raw.noteContent, MAX_TEXT_LEN) || cleanText(raw.recommendation, MAX_TEXT_LEN),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.dueDate ?? "")) ? String(raw.dueDate) : "",
      customerName: String(candidate.evidence.cliente ?? ""),
    };
  }
  if (actionType === "draft_message") {
    return {
      channel: raw.channel === "email" ? "email" : "whatsapp",
      messageText: cleanText(raw.messageText, MAX_MESSAGE_LEN) || cleanText(raw.message, MAX_MESSAGE_LEN),
      customerName: String(candidate.evidence.cliente ?? ""),
      customerPhone: String(candidate.evidence.telefono ?? ""),
    };
  }
  return {};
}

/**
 * Valida la salida cruda del modelo contra los hechos de la corrida.
 * Devuelve sólo decisiones ejecutables o informativas bien formadas.
 */
export function validateAgentOutput(raw: unknown, facts: AgentFacts): ValidationResult {
  const warnings: string[] = [];
  const parsed = extractJsonObject(raw);

  if (!parsed) {
    return {
      summary: "",
      decisions: [],
      warnings: ["La respuesta del modelo no era un JSON interpretable; no se guardó ninguna decisión."],
    };
  }

  const byRef = new Map<string, Candidate>();
  for (const candidate of facts.candidates) byRef.set(candidate.ref, candidate);

  const rawDecisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
  if (!Array.isArray(parsed.decisions)) {
    warnings.push("El modelo no devolvió una lista de decisiones.");
  }

  const decisions: ValidatedDecision[] = [];
  const seenRefs = new Set<string>();

  for (const item of rawDecisions) {
    if (decisions.length >= MAX_DECISIONS_PER_RUN) {
      warnings.push(
        `Se recortó la salida a ${MAX_DECISIONS_PER_RUN} decisiones para mantener la bandeja accionable.`,
      );
      break;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const d = item as Record<string, unknown>;

    const ref = typeof d.ref === "string" ? d.ref.trim() : "";
    const candidate = byRef.get(ref);
    if (!candidate) {
      // Garantía 1: sin evidencia del servidor, no hay decisión.
      warnings.push(
        `Decisión descartada: hace referencia a "${ref || "(vacío)"}", que no está entre los datos analizados.`,
      );
      continue;
    }
    if (seenRefs.has(ref)) {
      warnings.push(`Decisión duplicada descartada para ${ref}.`);
      continue;
    }

    const title = cleanText(d.title, MAX_TITLE_LEN) || candidate.label.slice(0, MAX_TITLE_LEN);
    const rationale = cleanText(d.rationale, MAX_TEXT_LEN);
    const recommendation = cleanText(d.recommendation, MAX_TEXT_LEN);
    if (!rationale && !recommendation) {
      warnings.push(`Decisión descartada para ${ref}: no trae fundamento ni recomendación.`);
      continue;
    }

    // Garantía 2: acción desconocida ⇒ se degrada a informativa.
    let actionType: ActionType = "review_only";
    if (isActionType(d.actionType)) {
      actionType = d.actionType;
    } else if (d.actionType !== undefined) {
      warnings.push(
        `Acción "${String(d.actionType)}" no permitida en ${ref}: la decisión queda como informativa.`,
      );
    }

    const actionPayload = buildActionPayload(actionType, d, candidate);

    // Una acción que se quedó sin contenido no tiene nada que ejecutar.
    if (actionType === "create_note" && !actionPayload.noteTitle) {
      actionType = "review_only";
      warnings.push(`La nota propuesta en ${ref} venía sin título: la decisión queda como informativa.`);
    }
    if (actionType === "draft_message" && !actionPayload.messageText) {
      actionType = "review_only";
      warnings.push(`El mensaje propuesto en ${ref} venía vacío: la decisión queda como informativa.`);
    }

    seenRefs.add(ref);
    decisions.push({
      ref,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title,
      rationale,
      recommendation,
      priority: cleanPriority(d.priority),
      actionType,
      actionPayload: actionType === "review_only" ? {} : actionPayload,
      // Garantía 3: la evidencia es la del servidor, siempre.
      evidence: candidate.evidence,
    });
  }

  return {
    summary: cleanText(parsed.summary, MAX_SUMMARY_LEN),
    decisions,
    warnings,
  };
}

/**
 * Esquema JSON que se le pide al proveedor. Que el modelo lo respete es una
 * conveniencia, no una garantía: validateAgentOutput vuelve a verificar todo.
 */
export const AGENT_OUTPUT_SCHEMA = {
  name: "agent_decisions",
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Resumen en 2-4 oraciones de la situación analizada.",
      },
      decisions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "Referencia EXACTA de la lista de datos (ej. job:12)." },
            title: { type: "string" },
            rationale: { type: "string", description: "Por qué, citando los números de la evidencia." },
            recommendation: { type: "string", description: "Qué hacer, concreto y accionable." },
            priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
            actionType: { type: "string", enum: ["review_only", "create_note", "draft_message"] },
            noteTitle: { type: "string" },
            noteContent: { type: "string" },
            dueDate: { type: "string", description: "YYYY-MM-DD, opcional." },
            channel: { type: "string", enum: ["whatsapp", "email"] },
            messageText: { type: "string", description: "Mensaje listo para enviar al cliente." },
          },
          required: ["ref", "title", "rationale", "recommendation", "priority", "actionType"],
        },
      },
    },
    required: ["summary", "decisions"],
  },
} as const;
