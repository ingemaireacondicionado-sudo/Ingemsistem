import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Aislamiento de tests: elimina cualquier DATABASE_URL de producción heredada
    // ANTES de correr los tests (capa extra sobre la barrera de getDb()).
    setupFiles: ["./server/testSetup.ts"],
    // NODE_ENV=test activa la barrera fail-closed de getDb() (ignora DATABASE_URL
    // real; sólo admite TEST_DATABASE_URL explícita). JWT_SECRET es obligatorio
    // en el código; se provee un valor SOLO para los tests. No se inyecta ninguna
    // DATABASE_URL real.
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-only-jwt-secret-not-a-real-secret",
    },
  },
});
