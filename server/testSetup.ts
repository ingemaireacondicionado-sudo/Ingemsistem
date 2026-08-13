// Setup global de Vitest (setupFiles). Capa EXTRA de aislamiento — la seguridad
// PRINCIPAL vive en server/db.ts (resolveDbUrl es fail-closed en runtime de
// test). Aun así, se eliminan del entorno cualquier URL de base heredada
// (p. ej. inyectada por Manus) antes de correr cualquier test.
//
// No es la única defensa: aunque este archivo no corriera, getDb() devuelve
// null durante Vitest ignorando DATABASE_URL y TEST_DATABASE_URL. Defensa en
// profundidad.
if (process.env.NODE_ENV === "test" || process.env.VITEST) {
  delete process.env.DATABASE_URL;
  delete process.env.TEST_DATABASE_URL;
}
