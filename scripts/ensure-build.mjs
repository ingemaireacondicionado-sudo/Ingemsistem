// 8B-5 PACKAGING — garantía de build versionada en Git.
//
// PROBLEMA: la plataforma (Manus) publica con el flujo `install → start`, NO corre
// `pnpm build`, y `dist/` está gitignored (no versionado). Resultado observado:
//   node dist/index.js → archivo inexistente (MODULE_NOT_FOUND).
//
// SOLUCIÓN: este script es el lifecycle `prepare` de package.json. pnpm lo ejecuta
// durante `pnpm install` (verificado: en un install limpio corre preinstall→install
// →postinstall→prepare; sólo se omite si node_modules ya está "up to date"). En ese
// punto YA están instaladas las devDependencies (vite/esbuild), así que se genera
// el `dist/` COMPLETO (server dist/index.js + frontend dist/public) ANTES de `start`.
//
// GARANTÍAS:
//  - Fuente única del comando: lee `scripts.build` de package.json (no se duplica).
//  - Si el build falla → exit != 0 → el `pnpm install` FALLA (nunca arranca un
//    runtime roto; no se permite "build falla → install continúa").
//  - Verifica el artefacto principal (dist/index.js) tras el build.
//  - No toca la DB (sólo vite + esbuild).
//  - Guard: sólo construye en el árbol de fuentes de la app (vite.config.ts +
//    client/). En cualquier otro contexto se omite silenciosamente (no rompe).
//  - Idempotente: se puede correr las veces que haga falta.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, delimiter } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Guard: sólo en el árbol de fuentes de la app.
const hasSources = existsSync(join(root, "vite.config.ts")) && existsSync(join(root, "client"));
if (!hasSources) {
  console.log("[ensure-build] sin árbol de fuentes (vite.config.ts/client): se omite el build.");
  process.exit(0);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const buildCmd = pkg?.scripts?.build;
if (!buildCmd) {
  console.error("[ensure-build] no hay script `build` en package.json: se aborta.");
  process.exit(1);
}

// PATH con node_modules/.bin para resolver vite/esbuild sin depender del PM.
const env = { ...process.env };
env.PATH = join(root, "node_modules", ".bin") + delimiter + (env.PATH ?? "");

console.log("[ensure-build] generando dist/ (vite build + esbuild)…");
const res = spawnSync(buildCmd, { cwd: root, env, stdio: "inherit", shell: true });
if (res.status !== 0) {
  console.error(`[ensure-build] el build FALLÓ (exit ${res.status}) — se aborta la instalación.`);
  process.exit(res.status ?? 1);
}

const serverBundle = join(root, "dist", "index.js");
const clientDir = join(root, "dist", "public");
if (!existsSync(serverBundle)) {
  console.error("[ensure-build] build OK pero falta dist/index.js — se aborta.");
  process.exit(1);
}
if (!existsSync(clientDir)) {
  console.error("[ensure-build] build OK pero falta dist/public (frontend) — se aborta.");
  process.exit(1);
}
console.log("[ensure-build] dist/ listo (dist/index.js + dist/public).");
