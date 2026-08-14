import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 8B-5 — CONTRATO de idempotencia de la migración 0011 (system_controls).
// No hay motor MySQL en Vitest; se verifica ESTÁTICAMENTE que el SQL es idempotente
// (CREATE TABLE IF NOT EXISTS + INSERT ... ON DUPLICATE KEY que no pisa el valor) y
// que el journal registra 0011 DESPUÉS de 0009/0010. El dry-run contra un motor
// real se ejecuta en staging de Manus (no en producción).

const root = resolve(__dirname, "..");
const sql = readFileSync(resolve(root, "drizzle/0011_system_controls.sql"), "utf8");
const journal = JSON.parse(readFileSync(resolve(root, "drizzle/meta/_journal.json"), "utf8"));

describe("8B-5 — 0011 system_controls: idempotencia (contrato estático)", () => {
  it("crea la tabla de forma idempotente (IF NOT EXISTS)", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS\s+`system_controls`/i);
  });

  it("siembra la fila del gate de forma idempotente (ON DUPLICATE KEY, sin pisar value)", () => {
    expect(sql).toMatch(/INSERT INTO\s+`system_controls`/i);
    expect(sql).toMatch(/VALUES\s*\('payments_locked',\s*'false'\)/i);
    expect(sql).toMatch(/ON DUPLICATE KEY UPDATE\s+`controlKey`\s*=\s*`controlKey`/i);
    // Clave: el ON DUPLICATE NO asigna value → nunca reabre un gate activo.
    expect(sql).not.toMatch(/ON DUPLICATE KEY UPDATE[^;]*`value`/i);
  });

  it("el journal registra 0011 después de 0009 y 0010 (orden obligatorio)", () => {
    const tags: string[] = journal.entries.map((e: any) => e.tag);
    const i9 = tags.indexOf("0009_serious_vapor");
    const i10 = tags.indexOf("0010_canonical_payment_index");
    const i11 = tags.indexOf("0011_system_controls");
    expect(i9).toBeGreaterThanOrEqual(0);
    expect(i10).toBeGreaterThan(i9);
    expect(i11).toBeGreaterThan(i10);
  });
});

// Simulación de la SEMÁNTICA de los dos statements sobre un "motor" en memoria,
// para demostrar el resultado de correr 0011 cuando la tabla/fila YA existen
// (incluso con value='true'): CREATE IF NOT EXISTS = no-op; seed = no pisa value.
type FakeEngine = { tables: Map<string, Map<string, { controlKey: string; value: string }>> };
function applyCreateIfNotExists(e: FakeEngine, table: string) {
  if (!e.tables.has(table)) e.tables.set(table, new Map());
}
function applySeedOnDuplicate(e: FakeEngine, table: string, key: string, value: string) {
  const t = e.tables.get(table)!;
  if (!t.has(key)) t.set(key, { controlKey: key, value }); // INSERT
  // else: ON DUPLICATE KEY UPDATE controlKey=controlKey → value INTACTO (no-op)
}

describe("8B-5 — 0011: dry-run simulado (idempotencia sobre estado preexistente)", () => {
  it("tabla y fila ausentes → crea y siembra 'false'", () => {
    const e: FakeEngine = { tables: new Map() };
    applyCreateIfNotExists(e, "system_controls");
    applySeedOnDuplicate(e, "system_controls", "payments_locked", "false");
    expect(e.tables.get("system_controls")!.get("payments_locked")!.value).toBe("false");
  });

  it("tabla ya existe con el gate ACTIVO ('true') → 0011 NO cambia value ni falla", () => {
    const e: FakeEngine = { tables: new Map([["system_controls", new Map([["payments_locked", { controlKey: "payments_locked", value: "true" }]])]]) };
    applyCreateIfNotExists(e, "system_controls");                       // no-op
    applySeedOnDuplicate(e, "system_controls", "payments_locked", "false"); // NO pisa
    expect(e.tables.get("system_controls")!.get("payments_locked")!.value).toBe("true"); // preservado
  });

  it("correr 0011 dos veces es idempotente (mismo resultado)", () => {
    const e: FakeEngine = { tables: new Map() };
    for (let i = 0; i < 2; i++) {
      applyCreateIfNotExists(e, "system_controls");
      applySeedOnDuplicate(e, "system_controls", "payments_locked", "false");
    }
    expect(e.tables.get("system_controls")!.size).toBe(1);
    expect(e.tables.get("system_controls")!.get("payments_locked")!.value).toBe("false");
  });
});
