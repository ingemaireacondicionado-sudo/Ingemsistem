import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

// Recorrido completo del módulo de agentes por el router tRPC: quién puede
// correrlos, qué ve cada rol, y qué pasa cuando dos personas aprueban la misma
// decisión. Store en memoria; nunca toca la base real.
const store = vi.hoisted(() => ({
  users: new Map<number, any>(),
  notes: new Map<number, any>(),
  runs: new Map<number, any>(),
  decisions: new Map<number, any>(),
  nextNoteId: 1,
  nextRunId: 1,
  nextDecisionId: 1,
}));

vi.mock("./db", () => ({
  getIngemUserById: async (id: number) => store.users.get(id) ?? null,
  getJobs: async () => [
    {
      id: 1,
      jobNumber: "TR-01",
      title: "Service anual",
      customerId: 7,
      customerName: "Frigorífico SA",
      status: "invoiced",
      invoiceNumber: "A-0001",
      endDate: "2025-11-01",
      legacyPaidBase: "0.00",
      notes: JSON.stringify({
        laborCost: 100000, materialsCost: 0, otherCosts: 0,
        ivaRate: 21, amountPaid: 0, currency: "ARS", productsUsed: [],
      }),
    },
  ],
  getTransactions: async () => [],
  getCustomers: async () => [],
  getProducts: async () => [],
  createNote: async (data: any) => {
    const id = store.nextNoteId++;
    store.notes.set(id, { id, ...data });
    return { id };
  },
  createAgentRun: async (data: any) => {
    const id = store.nextRunId++;
    store.runs.set(id, { id, status: "running", startedAt: new Date(), ...data });
    return { id };
  },
  finishAgentRun: async (id: number, data: any) => {
    const run = store.runs.get(id);
    if (run) Object.assign(run, data);
  },
  insertAgentDecisions: async (rows: any[]) => {
    for (const row of rows) {
      const id = store.nextDecisionId++;
      store.decisions.set(id, { id, createdAt: new Date(), ...row });
    }
  },
  getAgentRuns: async (agentKey?: string, limit = 20, agentKeys?: string[]) => {
    if (agentKeys && agentKeys.length === 0) return [];
    return Array.from(store.runs.values())
      .filter((r) => (!agentKey || r.agentKey === agentKey) && (!agentKeys || agentKeys.includes(r.agentKey)))
      .slice(0, limit);
  },
  getAgentDecisions: async (filter: any) => {
    if (filter.agentKeys && filter.agentKeys.length === 0) return [];
    return Array.from(store.decisions.values()).filter(
      (d) =>
        (!filter.agentKey || d.agentKey === filter.agentKey) &&
        (!filter.agentKeys || filter.agentKeys.includes(d.agentKey)) &&
        (!filter.status || d.status === filter.status),
    );
  },
  getAgentDecisionById: async (id: number) => store.decisions.get(id),
  claimAgentDecision: async (id: number, data: any) => {
    const decision = store.decisions.get(id);
    // Misma semántica que el UPDATE ... WHERE status='pending' de producción.
    if (!decision || decision.status !== "pending") return false;
    Object.assign(decision, data);
    return true;
  },
  recordAgentDecisionExecution: async (id: number, data: any) => {
    const decision = store.decisions.get(id);
    if (decision) Object.assign(decision, data);
  },
}));

vi.mock("./notifications", () => ({
  notifyJobCreated: async () => {},
  notifyJobStatusChanged: async () => {},
  notifyAppointmentCreated: async () => {},
  notifyAppointmentStatusChanged: async () => {},
  notifyUrgentNote: async () => {},
  notifyCustomerCreated: async () => {},
}));

// Sin clave de modelo configurada: la corrida usa el análisis determinista, que
// es justamente el camino que debe funcionar siempre.
vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiKey: "",
    forgeApiUrl: "",
    // El secreto de firma sigue siendo el de la config de tests: el mock sólo
    // apaga el proveedor de modelo, no la autenticación.
    cookieSecret: process.env.JWT_SECRET ?? "",
    databaseUrl: "",
    appId: "",
    oAuthServerUrl: "",
    ownerOpenId: "",
    isProduction: false,
  },
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { generateIngemToken } from "./ingemAuth";

function ctx(authHeader?: string): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: authHeader ? { authorization: authHeader } : {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

let tokens: Record<string, string>;

beforeAll(async () => {
  tokens = {
    admin: await generateIngemToken({ userId: 1, email: "maxi@ingem.com", name: "Maxi", role: "admin" }),
    manager: await generateIngemToken({ userId: 2, email: "ludmila@ingem.com", name: "Ludmila", role: "manager" }),
    technician: await generateIngemToken({ userId: 3, email: "tec@ingem.com", name: "Técnico", role: "technician" }),
    viewer: await generateIngemToken({ userId: 4, email: "visor@ingem.com", name: "Visor", role: "viewer" }),
  };
});

beforeEach(() => {
  store.users.clear(); store.notes.clear(); store.runs.clear(); store.decisions.clear();
  store.nextNoteId = 1; store.nextRunId = 1; store.nextDecisionId = 1;
  store.users.set(1, { id: 1, name: "Maxi", email: "maxi@ingem.com", role: "admin", isActive: true, allowedModules: null });
  store.users.set(2, { id: 2, name: "Ludmila", email: "ludmila@ingem.com", role: "manager", isActive: true, allowedModules: null });
  store.users.set(3, { id: 3, name: "Técnico", email: "tec@ingem.com", role: "technician", isActive: true, allowedModules: null });
  store.users.set(4, { id: 4, name: "Visor", email: "visor@ingem.com", role: "viewer", isActive: true, allowedModules: JSON.stringify(["agents", "jobs"]) });
});

function caller(role: keyof typeof tokens) {
  return appRouter.createCaller(ctx(`Bearer ${tokens[role]}`));
}

describe("acceso al módulo de agentes", () => {
  it("un técnico no entra al módulo", async () => {
    await expect(caller("technician").agents.list()).rejects.toThrow(/permisos/i);
  });

  it("sin sesión no se accede", async () => {
    await expect(appRouter.createCaller(ctx()).agents.list()).rejects.toThrow();
  });

  it("el admin ve los dos agentes y puede operarlos", async () => {
    const result = await caller("admin").agents.list();
    expect(result.canManage).toBe(true);
    expect(result.agents.map((a) => a.key).sort()).toEqual(["collections", "finance"]);
  });

  it("un visor habilitado ve sólo los agentes de sus módulos y no puede operarlos", async () => {
    const result = await caller("viewer").agents.list();
    // Tiene 'jobs' pero no 'finance': ve cobranzas, no rentabilidad.
    expect(result.agents.map((a) => a.key)).toEqual(["collections"]);
    expect(result.canManage).toBe(false);
  });

  it("un visor no puede correr un agente ni aprobar decisiones", async () => {
    await expect(caller("viewer").agents.run({ agentKey: "collections" })).rejects.toThrow(/permisos/i);
    await expect(caller("viewer").agents.approve({ id: 1, notes: "" })).rejects.toThrow(/permisos/i);
  });
});

describe("corrida de un agente", () => {
  it("rechaza una clave de agente desconocida", async () => {
    await expect(caller("admin").agents.run({ agentKey: "despidos" })).rejects.toThrow(/desconocido/i);
  });

  it("genera decisiones pendientes y registra la corrida con su evidencia", async () => {
    const result = await caller("admin").agents.run({ agentKey: "collections" });
    expect(result.decisionCount).toBeGreaterThan(0);

    const run = store.runs.get(result.runId);
    expect(run.status).toBe("completed");
    expect(run.triggeredByName).toBe("Maxi");
    expect(JSON.parse(run.factsJson).facts.candidates[0].ref).toBe("job:1");

    const decisions = Array.from(store.decisions.values());
    expect(decisions.every((d) => d.status === "pending")).toBe(true);
    expect(decisions[0].evidenceJson).toContain("TR-01");
  });

  it("la corrida no escribe nada del negocio: sólo propone", async () => {
    await caller("admin").agents.run({ agentKey: "collections" });
    expect(store.notes.size).toBe(0);
  });
});

describe("aprobación de decisiones", () => {
  async function seedDecision(over: Record<string, unknown> = {}) {
    const id = store.nextDecisionId++;
    store.decisions.set(id, {
      id,
      runId: 1,
      agentKey: "collections",
      title: "Cobrar TR-01",
      rationale: "Saldo viejo.",
      recommendation: "Llamar al cliente.",
      priority: "urgent",
      evidenceJson: "{}",
      entityType: "job",
      entityId: 1,
      actionType: "create_note",
      actionPayloadJson: JSON.stringify({ noteTitle: "Cobrar TR-01", noteContent: "Saldo $121.000" }),
      status: "pending",
      createdAt: new Date(),
      ...over,
    });
    return id;
  }

  it("aprobar ejecuta la acción y deja la decisión aplicada", async () => {
    const id = await seedDecision();
    const result = await caller("admin").agents.approve({ id, notes: "dale" });
    expect(result.status).toBe("executed");
    expect(store.decisions.get(id).status).toBe("executed");
    expect(store.decisions.get(id).decidedByName).toBe("Maxi");
    expect(Array.from(store.notes.values())[0]).toMatchObject({
      title: "Cobrar TR-01",
      priority: "urgent",
      createdBy: "Maxi",
    });
  });

  it("una segunda aprobación de la misma decisión no la ejecuta dos veces", async () => {
    const id = await seedDecision();
    await caller("admin").agents.approve({ id, notes: "" });
    await expect(caller("manager").agents.approve({ id, notes: "" })).rejects.toThrow(/ya fue resuelta/i);
    expect(store.notes.size).toBe(1);
  });

  it("descartar no ejecuta ninguna acción", async () => {
    const id = await seedDecision();
    const result = await caller("admin").agents.reject({ id, notes: "no corresponde" });
    expect(result.status).toBe("rejected");
    expect(store.decisions.get(id).status).toBe("rejected");
    expect(store.notes.size).toBe(0);
  });

  it("no se puede aprobar una decisión inexistente", async () => {
    await expect(caller("admin").agents.approve({ id: 999, notes: "" })).rejects.toThrow(/no existe/i);
  });

  it("una acción no permitida que hubiera quedado guardada no se ejecuta", async () => {
    const id = await seedDecision({
      actionType: "register_payment",
      actionPayloadJson: JSON.stringify({ amount: "999999" }),
    });
    const result = await caller("admin").agents.approve({ id, notes: "" });
    expect(result.status).toBe("failed");
    expect(store.notes.size).toBe(0);
    expect(store.decisions.get(id).status).toBe("failed");
  });

  it("un gerente no puede resolver decisiones de un agente cuyo módulo no ve", async () => {
    store.users.set(2, { ...store.users.get(2), role: "viewer", allowedModules: JSON.stringify(["agents", "jobs"]) });
    const id = await seedDecision({ agentKey: "finance" });
    await expect(caller("manager").agents.approve({ id, notes: "" })).rejects.toThrow(/permisos|acceso/i);
    expect(store.decisions.get(id).status).toBe("pending");
  });
});

describe("visibilidad de decisiones ya generadas", () => {
  it("un usuario sin acceso a Finanzas no ve las decisiones de rentabilidad", async () => {
    store.decisions.set(1, { id: 1, agentKey: "finance", status: "pending", title: "Margen" });
    store.decisions.set(2, { id: 2, agentKey: "collections", status: "pending", title: "Cobrar" });
    const visibles = await caller("viewer").agents.decisions({ limit: 100 });
    expect(visibles.map((d: any) => d.agentKey)).toEqual(["collections"]);
  });
});
