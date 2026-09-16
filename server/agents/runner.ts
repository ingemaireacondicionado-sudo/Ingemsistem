import { invokeLLM, type InvokeParams, type InvokeResult } from "../_core/llm";
import { ENV } from "../_core/env";
import type { BusinessSnapshot } from "./facts";
import { buildUserPrompt, getAgent } from "./registry";
import { AGENT_OUTPUT_SCHEMA, validateAgentOutput } from "./validation";
import type { AgentFacts, AgentKey, Candidate, ValidatedDecision } from "./types";

/**
 * ORQUESTACIÓN de una corrida.
 *
 *   datos de la base → análisis determinista → (modelo) → validación → decisiones
 *
 * El modelo es la parte PRESCINDIBLE de la cadena, a propósito: si no hay clave
 * configurada, si el proveedor se cae o si devuelve cualquier cosa, la corrida
 * igual produce decisiones a partir del análisis determinista, con su texto
 * armado por el sistema y avisando que se generó sin redacción del modelo. Un
 * agente que se queda mudo porque falló una API externa no le sirve a nadie.
 */

export type LlmInvoker = (params: InvokeParams) => Promise<InvokeResult>;

export type AgentRunOutcome = {
  facts: AgentFacts;
  summary: string;
  decisions: ValidatedDecision[];
  warnings: string[];
  model: string;
  /** true si el texto lo redactó el sistema y no el modelo. */
  degraded: boolean;
};

/** Cuántas decisiones genera el análisis determinista cuando no hay modelo. */
const MAX_FALLBACK_DECISIONS = 5;

function evidenceString(candidate: Candidate, key: string): string {
  const value = candidate.evidence[key];
  return value === undefined || value === null ? "" : String(value);
}

function evidenceNumber(candidate: Candidate, key: string): number | null {
  const value = candidate.evidence[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Prioridad por antigüedad de la deuda, sin intervención del modelo. */
function collectionsPriority(days: number | null): ValidatedDecision["priority"] {
  if (days === null) return "medium";
  if (days > 90) return "urgent";
  if (days > 60) return "high";
  if (days > 30) return "medium";
  return "low";
}

function fallbackCollectionsDecision(candidate: Candidate): ValidatedDecision {
  const trabajo = evidenceString(candidate, "trabajo");
  const cliente = evidenceString(candidate, "cliente");
  const saldo = evidenceString(candidate, "saldo");
  const dias = evidenceNumber(candidate, "diasDesdeFacturaOCierre");
  const faltaFacturar = candidate.evidence.faltaFacturar === true;
  const ultimoCobro = evidenceString(candidate, "ultimoCobro");

  const antiguedad = dias === null ? "sin fecha de referencia" : `${dias} días`;

  if (faltaFacturar) {
    return {
      ref: candidate.ref,
      entityType: candidate.entityType,
      entityId: candidate.entityId,
      title: `Falta facturar ${trabajo} — ${cliente}`,
      rationale: `El trabajo figura terminado hace ${antiguedad} y todavía no tiene factura emitida. Saldo pendiente: ${saldo}. Mientras no se facture, el cliente no tiene qué pagar.`,
      recommendation: `Emitir la factura de ${trabajo} y recién después iniciar el reclamo de cobro.`,
      priority: collectionsPriority(dias),
      actionType: "create_note",
      actionPayload: {
        noteTitle: `Facturar ${trabajo} (${cliente})`,
        noteContent: `Trabajo terminado sin factura emitida. Saldo: ${saldo}. Antigüedad: ${antiguedad}.`,
        dueDate: "",
        customerName: cliente,
      },
      evidence: candidate.evidence,
    };
  }

  return {
    ref: candidate.ref,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    title: `Reclamar ${saldo} de ${trabajo} — ${cliente}`,
    rationale: `Saldo pendiente de ${saldo} con ${antiguedad} de antigüedad. Último cobro registrado: ${ultimoCobro}.`,
    recommendation: `Contactar a ${cliente} por el saldo de ${trabajo} y acordar una fecha concreta de pago.`,
    priority: collectionsPriority(dias),
    actionType: "create_note",
    actionPayload: {
      noteTitle: `Cobrar ${trabajo} — ${cliente}`,
      noteContent: `Saldo ${saldo}, ${antiguedad} de antigüedad. Último cobro: ${ultimoCobro}.`,
      dueDate: "",
      customerName: cliente,
    },
    evidence: candidate.evidence,
  };
}

function fallbackFinanceDecision(candidate: Candidate): ValidatedDecision {
  const trabajo = evidenceString(candidate, "trabajo");
  const cliente = evidenceString(candidate, "cliente");
  const margen = evidenceString(candidate, "margen");
  const pct = evidenceNumber(candidate, "margenPorcentaje");
  const mixtas = candidate.evidence.divisasMixtas === true;
  const negativo = (evidenceNumber(candidate, "margenNumerico") ?? 0) < 0;

  const detallePct = mixtas
    ? "facturado en dólares con gastos en pesos, así que el porcentaje no es comparable"
    : pct === null
      ? "sin porcentaje calculable"
      : `${pct}% sobre el subtotal`;

  return {
    ref: candidate.ref,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    title: `${negativo ? "Pérdida" : "Margen flaco"} en ${trabajo} — ${cliente}`,
    rationale: `Margen de ${margen} (${detallePct}). Costo de productos: ${evidenceString(candidate, "costoProductos")}. Gastos imputados: ${evidenceString(candidate, "gastosImputados")}.`,
    recommendation: negativo
      ? `Revisar por qué ${trabajo} terminó en pérdida y corregir el criterio antes de presupuestar un trabajo parecido.`
      : `Revisar el presupuesto de ${trabajo}: el margen quedó por debajo del umbral sano para el rubro.`,
    priority: negativo ? "urgent" : "medium",
    actionType: "create_note",
    actionPayload: {
      noteTitle: `Revisar rentabilidad de ${trabajo}`,
      noteContent: `Margen ${margen} (${detallePct}). Cliente: ${cliente}.`,
      dueDate: "",
      customerName: cliente,
    },
    evidence: candidate.evidence,
  };
}

/**
 * Decisiones armadas SÓLO con el análisis determinista. Es la red de seguridad
 * cuando el modelo no está disponible, y también lo que se guarda si el modelo
 * devuelve una respuesta inservible.
 */
export function buildFallbackDecisions(facts: AgentFacts): ValidatedDecision[] {
  const top = facts.candidates.slice(0, MAX_FALLBACK_DECISIONS);
  return top.map((candidate) =>
    facts.agentKey === "collections"
      ? fallbackCollectionsDecision(candidate)
      : fallbackFinanceDecision(candidate),
  );
}

function fallbackSummary(facts: AgentFacts, reason: string): string {
  const count = facts.candidates.length;
  const head =
    count === 0
      ? "No hay casos que ameriten una decisión con los datos de hoy."
      : `Se detectaron ${count} caso${count === 1 ? "" : "s"} para revisar; se priorizaron los más importantes.`;
  return `${head} ${reason}`.trim();
}

/** ¿Hay proveedor de modelo configurado? */
export function isLlmConfigured(): boolean {
  return Boolean(ENV.forgeApiKey);
}

export async function runAgent(params: {
  agentKey: AgentKey;
  snapshot: BusinessSnapshot;
  /** Inyectable para tests: por defecto, el proveedor real. */
  invoke?: LlmInvoker;
  /** Inyectable para tests: por defecto, según la configuración del entorno. */
  llmConfigured?: boolean;
}): Promise<AgentRunOutcome> {
  const agent = getAgent(params.agentKey);
  const facts = agent.buildFacts(params.snapshot);
  const warnings = [...facts.warnings];

  const configured = params.llmConfigured ?? isLlmConfigured();
  if (!configured) {
    warnings.push("No hay modelo configurado: el análisis y los textos los generó el sistema.");
    return {
      facts,
      summary: fallbackSummary(facts, "Redactado por el sistema, sin modelo de lenguaje."),
      decisions: buildFallbackDecisions(facts),
      warnings,
      model: "",
      degraded: true,
    };
  }

  const invoke = params.invoke ?? invokeLLM;
  let result: InvokeResult;
  try {
    result = await invoke({
      messages: [
        { role: "system", content: agent.systemPrompt },
        { role: "user", content: buildUserPrompt(facts) },
      ],
      outputSchema: AGENT_OUTPUT_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
    });
  } catch {
    // El detalle del error del proveedor no se expone: no aporta al dueño y
    // puede filtrar datos de infraestructura.
    warnings.push("El modelo no respondió: las decisiones se generaron con el análisis del sistema.");
    return {
      facts,
      summary: fallbackSummary(facts, "El modelo no estaba disponible en esta corrida."),
      decisions: buildFallbackDecisions(facts),
      warnings,
      model: "",
      degraded: true,
    };
  }

  const content = result?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : JSON.stringify(content ?? "");
  const validated = validateAgentOutput(raw, facts);
  warnings.push(...validated.warnings);

  // El modelo contestó pero no sobrevivió ninguna decisión, y sí había casos
  // concretos para tratar: se usa el análisis determinista en vez de devolver
  // una bandeja vacía que haría parecer que no hay nada que hacer.
  if (validated.decisions.length === 0 && facts.candidates.length > 0) {
    warnings.push("Ninguna decisión del modelo pasó la validación: se usó el análisis del sistema.");
    return {
      facts,
      summary: validated.summary || fallbackSummary(facts, "Redactado por el sistema."),
      decisions: buildFallbackDecisions(facts),
      warnings,
      model: result?.model ?? "",
      degraded: true,
    };
  }

  return {
    facts,
    summary: validated.summary || fallbackSummary(facts, ""),
    decisions: validated.decisions,
    warnings,
    model: result?.model ?? "",
    degraded: false,
  };
}
