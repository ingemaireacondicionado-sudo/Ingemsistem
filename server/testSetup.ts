// Setup global de Vitest (setupFiles). Capa EXTRA de aislamiento además de la
// barrera fail-closed de getDb(): elimina cualquier DATABASE_URL de producción
// heredada del entorno (p. ej. inyectada por Manus) antes de que corra cualquier
// test. Los tests que necesitan una DB (mockeada) usan TEST_DATABASE_URL, que
// jamás hace fallback a DATABASE_URL.
//
// No es la única defensa: aunque este archivo no corriera, getDb() ignora
// DATABASE_URL cuando NODE_ENV=test / VITEST. Es defensa en profundidad.
if (process.env.NODE_ENV === "test" || process.env.VITEST) {
  delete process.env.DATABASE_URL;
}
