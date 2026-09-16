import { describe, it, expect, vi } from "vitest";
import { runAgent, buildFallbackDecisions } from "./agents/runner";
import { buildCollectionsFacts, type BusinessSnapshot } from "./agents/facts";
import { AGENTS, buildUserPrompt, listAgents } from "./agents/registry";

// La corrida completa, sin base y sin proveedor real: lo que importa es que el
// agente siga siendo útil aunque el modelo falle, y que nunca guarde una
// decisión que no pase por la validación.

function jobMeta(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    laborCost: 100000, materialsCost: 0, otherCosts: 0, ivaRate: 21,
    amountPaid: 0, currency: "ARS", productsUsed: [], ...over,
  });
}

const snapshot: BusinessSnapshot = {
  today: "2026-03-31",
  jobs: [
    { id: 1, jobNumber: "TR-01", title: "Service", customerId: 7, customerName: "Frigorífico SA", status: "invoiced", invoiceNumber: "A-1", notes: jobMeta(), endDate: "2025-11-01", legacyPaidBase: "0.00" },
    { id: 2, jobNumber: "TR-02", title: "Reparación", customerId: 8, customerName: "Hotel Sur", status: "completed", notes: jobMeta(), endDate: "2026-03-15", legacyPaidBase: "0.00" },
  ],
  transactions: [],
  customers: [],
  products: [],
};

const emptySnapshot: BusinessSnapshot = { today: "2026-03-31", jobs: [], transactions: [], customers: [], products: [] };

function llmResponse(payload: unknown) {
  return {
    id: "1", created: 0, model: "modelo-de-prueba",
    choices: [{ index: 0, message: { role: "assistant" as const, content: JSON.stringify(payload) }, finish_reason: "stop" }],
  };
}

describe("catálogo de agentes", () => {
  it("expone los agentes con el módulo de permisos que les corresponde", () => {
    expect(listAgents().map((a) => a.key)).toEqual(["collections", "finance"]);
    expect(AGENTS.collections.module).toBe("jobs");
    expect(AGENTS.finance.module).toBe("finance");
  });

  it("el prompt le pasa al modelo los hechos y las referencias citables", () => {
    const prompt = buildUserPrompt(buildCollectionsFacts(snapshot));
    expect(prompt).toContain("job:1");
    expect(prompt).toContain("2026-03-31");
  });

  it("cuando no hay casos, el prompt pide explícitamente una lista vacía", () => {
    expect(buildUserPrompt(buildCollectionsFacts(emptySnapshot))).toContain('"decisions": []');
  });
});

describe("corrida del agente", () => {
  it("sin modelo configurado, igual devuelve decisiones del análisis del sistema", async () => {
    const invoke = vi.fn();
    const outcome = await runAgent({ agentKey: "collections", snapshot, invoke, llmConfigured: false });
    expect(invoke).not.toHaveBeenCalled();
    expect(outcome.degraded).toBe(true);
    expect(outcome.decisions.length).toBeGreaterThan(0);
    expect(outcome.warnings.some((w) => w.includes("No hay modelo configurado"))).toBe(true);
  });

  it("si el proveedor falla, cae al análisis determinista sin filtrar el error", async () => {
    const invoke = vi.fn().mockRejectedValue(new Error("401 api key inválida en https://interno"));
    const outcome = await runAgent({ agentKey: "collections", snapshot, invoke, llmConfigured: true });
    expect(outcome.degraded).toBe(true);
    expect(outcome.decisions.length).toBeGreaterThan(0);
    expect(JSON.stringify(outcome.warnings)).not.toContain("api key");
    expect(JSON.stringify(outcome.warnings)).not.toContain("interno");
  });

  it("con el modelo respondiendo bien, guarda sus decisiones validadas", async () => {
    const invoke = vi.fn().mockResolvedValue(
      llmResponse({
        summary: "Hay una deuda vieja de Frigorífico SA.",
        decisions: [{
          ref: "job:1",
          title: "Reclamar TR-01",
          rationale: "Saldo a 150 días.",
          recommendation: "Llamar hoy.",
          priority: "urgent",
          actionType: "draft_message",
          channel: "whatsapp",
          messageText: "Hola, te escribo por el saldo de TR-01.",
        }],
      }),
    );
    const outcome = await runAgent({ agentKey: "collections", snapshot, invoke, llmConfigured: true });
    expect(outcome.degraded).toBe(false);
    expect(outcome.model).toBe("modelo-de-prueba");
    expect(outcome.decisions).toHaveLength(1);
    expect(outcome.decisions[0].actionType).toBe("draft_message");
    expect(outcome.summary).toContain("Frigorífico");
  });

  it("si el modelo alucina todo, usa el análisis del sistema en vez de vaciar la bandeja", async () => {
    const invoke = vi.fn().mockResolvedValue(
      llmResponse({
        summary: "Resumen.",
        decisions: [{ ref: "job:777", title: "Cobrar", rationale: "x", recommendation: "y", priority: "high", actionType: "create_note" }],
      }),
    );
    const outcome = await runAgent({ agentKey: "collections", snapshot, invoke, llmConfigured: true });
    expect(outcome.degraded).toBe(true);
    expect(outcome.decisions.length).toBeGreaterThan(0);
    expect(outcome.decisions.every((d) => ["job:1", "job:2"].includes(d.ref))).toBe(true);
  });

  it("si no hay nada que decidir, no inventa decisiones", async () => {
    const invoke = vi.fn().mockResolvedValue(llmResponse({ summary: "Todo cobrado.", decisions: [] }));
    const outcome = await runAgent({ agentKey: "collections", snapshot: emptySnapshot, invoke, llmConfigured: true });
    expect(outcome.decisions).toHaveLength(0);
    expect(outcome.degraded).toBe(false);
  });

  it("una respuesta basura del modelo no rompe la corrida", async () => {
    const invoke = vi.fn().mockResolvedValue(llmResponse("no puedo ayudarte"));
    const outcome = await runAgent({ agentKey: "finance", snapshot, invoke, llmConfigured: true });
    expect(outcome.decisions).toBeInstanceOf(Array);
  });
});

describe("decisiones del análisis determinista", () => {
  it("distingue el trabajo sin facturar del reclamo al cliente", () => {
    const decisions = buildFallbackDecisions(buildCollectionsFacts(snapshot));
    const sinFacturar = decisions.find((d) => d.ref === "job:2");
    const reclamo = decisions.find((d) => d.ref === "job:1");
    expect(sinFacturar?.title).toContain("Falta facturar");
    expect(reclamo?.title).toContain("Reclamar");
  });

  it("escala la prioridad con la antigüedad de la deuda", () => {
    const decisions = buildFallbackDecisions(buildCollectionsFacts(snapshot));
    // TR-01 está vencido desde noviembre: más de 90 días.
    expect(decisions.find((d) => d.ref === "job:1")?.priority).toBe("urgent");
  });

  it("propone sólo acciones de la allowlist", () => {
    const decisions = buildFallbackDecisions(buildCollectionsFacts(snapshot));
    expect(decisions.every((d) => ["review_only", "create_note", "draft_message"].includes(d.actionType))).toBe(true);
  });

  it("apoya cada decisión en la evidencia calculada por el servidor", () => {
    const facts = buildCollectionsFacts(snapshot);
    const decisions = buildFallbackDecisions(facts);
    for (const d of decisions) {
      const candidate = facts.candidates.find((c) => c.ref === d.ref);
      expect(d.evidence).toEqual(candidate?.evidence);
    }
  });
});
