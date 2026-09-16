import { describe, it, expect } from "vitest";
import {
  extractJsonObject,
  validateAgentOutput,
  MAX_DECISIONS_PER_RUN,
} from "./agents/validation";
import type { AgentFacts } from "./agents/types";

// Esta suite cubre la frontera de confianza con el modelo. Lo que se prueba acá
// es que ninguna salida del LLM —inventada, mal formada o maliciosa— pueda
// convertirse en una decisión ejecutable con datos que el servidor no calculó.

const facts: AgentFacts = {
  agentKey: "collections",
  today: "2026-03-31",
  summary: { trabajosConSaldo: 2 },
  candidates: [
    {
      ref: "job:1",
      entityType: "job",
      entityId: 1,
      label: "TR-01 — Service anual",
      evidence: { trabajo: "TR-01", cliente: "Frigorífico SA", saldo: "$ 121.000,00", telefono: "299555" },
    },
    {
      ref: "job:2",
      entityType: "job",
      entityId: 2,
      label: "TR-02 — Reparación",
      evidence: { trabajo: "TR-02", cliente: "Hotel Sur", saldo: "$ 50.000,00", telefono: "" },
    },
  ],
  warnings: [],
};

function decision(over: Record<string, unknown> = {}) {
  return {
    ref: "job:1",
    title: "Reclamar saldo",
    rationale: "Saldo de 121.000 a 60 días.",
    recommendation: "Llamar al cliente.",
    priority: "high",
    actionType: "review_only",
    ...over,
  };
}

describe("extracción del JSON de la respuesta", () => {
  it("acepta JSON plano, con cerco de markdown o con texto alrededor", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJsonObject('Claro, acá va:\n{"a":3}\nEspero que sirva.')).toEqual({ a: 3 });
  });

  it("devuelve null ante algo que no es un objeto", () => {
    expect(extractJsonObject("no soy json")).toBeNull();
    expect(extractJsonObject("[1,2,3]")).toBeNull();
    expect(extractJsonObject(null)).toBeNull();
  });
});

describe("validación de la salida del modelo", () => {
  it("conserva una decisión bien formada y le pega la evidencia del servidor", () => {
    const result = validateAgentOutput(
      JSON.stringify({ summary: "Dos deudas viejas.", decisions: [decision()] }),
      facts,
    );
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].entityId).toBe(1);
    // La evidencia es la del candidato, no la que el modelo pudiera repetir.
    expect(result.decisions[0].evidence).toEqual(facts.candidates[0].evidence);
  });

  it("descarta decisiones sobre entidades que el servidor no analizó", () => {
    const result = validateAgentOutput(
      JSON.stringify({
        summary: "",
        decisions: [decision({ ref: "job:9999" }), decision({ ref: "customer:1" }), decision({ ref: "" })],
      }),
      facts,
    );
    expect(result.decisions).toHaveLength(0);
    expect(result.warnings.length).toBe(3);
    expect(result.warnings[0]).toContain("job:9999");
  });

  it("degrada a informativa cualquier acción fuera de la allowlist", () => {
    const result = validateAgentOutput(
      JSON.stringify({
        summary: "",
        decisions: [
          decision({ actionType: "register_payment", amount: "999999" }),
          decision({ ref: "job:2", actionType: "delete_job" }),
        ],
      }),
      facts,
    );
    expect(result.decisions.map((d) => d.actionType)).toEqual(["review_only", "review_only"]);
    expect(result.decisions.every((d) => Object.keys(d.actionPayload).length === 0)).toBe(true);
    expect(result.warnings.some((w) => w.includes("register_payment"))).toBe(true);
  });

  it("conserva sólo los campos conocidos de una acción permitida", () => {
    const result = validateAgentOutput(
      JSON.stringify({
        summary: "",
        decisions: [
          decision({
            actionType: "create_note",
            noteTitle: "Facturar TR-01",
            noteContent: "Emitir factura A.",
            dueDate: "2026-04-05",
            jobStatus: "collected",
            amountPaid: 121000,
          }),
        ],
      }),
      facts,
    );
    expect(result.decisions[0].actionPayload).toEqual({
      noteTitle: "Facturar TR-01",
      noteContent: "Emitir factura A.",
      dueDate: "2026-04-05",
      customerName: "Frigorífico SA",
    });
  });

  it("ignora una fecha de vencimiento con formato inválido", () => {
    const result = validateAgentOutput(
      JSON.stringify({
        summary: "",
        decisions: [decision({ actionType: "create_note", noteTitle: "X", dueDate: "el viernes" })],
      }),
      facts,
    );
    expect(result.decisions[0].actionPayload.dueDate).toBe("");
  });

  it("degrada la acción si viene sin contenido para ejecutar", () => {
    const result = validateAgentOutput(
      JSON.stringify({
        summary: "",
        decisions: [
          decision({ actionType: "create_note", noteTitle: "", title: "", recommendation: "" }),
          decision({ ref: "job:2", actionType: "draft_message", messageText: "   " }),
        ],
      }),
      facts,
    );
    expect(result.decisions.map((d) => d.actionType)).toEqual(["review_only", "review_only"]);
  });

  it("descarta duplicados sobre la misma referencia", () => {
    const result = validateAgentOutput(
      JSON.stringify({ summary: "", decisions: [decision(), decision({ title: "Otra vez" })] }),
      facts,
    );
    expect(result.decisions).toHaveLength(1);
    expect(result.warnings.some((w) => w.includes("Decisión duplicada"))).toBe(true);
  });

  it("descarta decisiones sin fundamento ni recomendación", () => {
    const result = validateAgentOutput(
      JSON.stringify({ summary: "", decisions: [decision({ rationale: "", recommendation: "" })] }),
      facts,
    );
    expect(result.decisions).toHaveLength(0);
  });

  it("normaliza una prioridad inventada a un valor conocido", () => {
    const result = validateAgentOutput(
      JSON.stringify({ summary: "", decisions: [decision({ priority: "CRÍTICO MÁXIMO" })] }),
      facts,
    );
    expect(result.decisions[0].priority).toBe("medium");
  });

  it("recorta títulos larguísimos al límite de la columna", () => {
    const result = validateAgentOutput(
      JSON.stringify({ summary: "", decisions: [decision({ title: "x".repeat(500) })] }),
      facts,
    );
    expect(result.decisions[0].title.length).toBeLessThanOrEqual(200);
  });

  it("limita la cantidad de decisiones por corrida", () => {
    const many = Array.from({ length: MAX_DECISIONS_PER_RUN + 5 }, (_, i) =>
      decision({ ref: i % 2 === 0 ? "job:1" : "job:2" }),
    );
    const result = validateAgentOutput(JSON.stringify({ summary: "", decisions: many }), facts);
    expect(result.decisions.length).toBeLessThanOrEqual(MAX_DECISIONS_PER_RUN);
  });

  it("no guarda nada si la respuesta no es JSON interpretable", () => {
    const result = validateAgentOutput("perdón, no puedo ayudarte con eso", facts);
    expect(result.decisions).toHaveLength(0);
    expect(result.warnings[0]).toContain("JSON");
  });

  it("tolera una respuesta sin lista de decisiones", () => {
    const result = validateAgentOutput(JSON.stringify({ summary: "Todo tranquilo." }), facts);
    expect(result.summary).toBe("Todo tranquilo.");
    expect(result.decisions).toHaveLength(0);
  });
});
