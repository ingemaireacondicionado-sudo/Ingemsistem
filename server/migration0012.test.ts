import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// AGENTES — contrato ESTÁTICO de la migración 0012. No hay motor MySQL en
// Vitest, así que se verifica lo que se puede verificar sin base: que la
// migración es idempotente, que es puramente aditiva y —lo más importante— que
// no toca ninguna tabla del ledger de cobros.

const root = resolve(__dirname, "..");
const raw = readFileSync(resolve(root, "drizzle/0012_agents.sql"), "utf8");
// Las aserciones son sobre el DDL, no sobre los comentarios que lo explican.
const sql = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--") || line.includes("statement-breakpoint"))
  .join("\n");
const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8"));

describe("0012 agentes: contrato de la migración", () => {
  it("crea las dos tablas de forma idempotente", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+`agent_runs`/i);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+`agent_decisions`/i);
  });

  it("crea los índices de forma idempotente", () => {
    const indexStatements = sql.match(/CREATE INDEX[^;]*/gi) ?? [];
    expect(indexStatements.length).toBeGreaterThan(0);
    for (const statement of indexStatements) {
      expect(statement).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    }
  });

  it("es puramente aditiva: no altera ni borra nada existente", () => {
    expect(sql).not.toMatch(/\bALTER TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).not.toMatch(/\bUPDATE\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it("no toca ninguna tabla del ledger de cobros ni de dinero", () => {
    for (const tabla of ["transactions", "jobs", "system_controls"]) {
      expect(sql).not.toMatch(new RegExp(`\`${tabla}\``, "i"));
    }
  });

  it("el journal registra 0012 después de 0011", () => {
    const tags: string[] = journal.entries.map((e: any) => e.tag);
    const i11 = tags.indexOf("0011_system_controls");
    const i12 = tags.indexOf("0012_agents");
    expect(i11).toBeGreaterThanOrEqual(0);
    expect(i12).toBeGreaterThan(i11);
  });

  it("la decisión nace pendiente: ninguna acción puede quedar aplicada sola", () => {
    expect(sql).toMatch(
      /`agentDecisionStatus`\s+enum\('pending','approved','rejected','executed','failed'\)\s+NOT NULL DEFAULT 'pending'/i,
    );
  });
});
