// IDENTIDAD DE RELEASE AUTORITATIVA (8B-5) — RELEASE INTERMEDIO.
//
// Constante EMBEBIDA en el código del release: es la fuente de verdad de la
// identidad de runtime que expone el backend (system.health). NO se deriva de
// client/public/__manus__/version.json, ni de un asset estático, ni del frontend,
// ni del navegador, ni de un valor heredado de un checkpoint viejo, ni depende de
// process.env.GIT_SHA (Manus no demostró inyectarlo). El SHA git final del commit
// que agrega esta identidad se reporta EXTERNAMENTE (sin autoreferencia).
//
// releaseBaseCommit = base git real y verificada sobre la que se construye este
// release intermedio (db9bf73, basado en 11b5110; SIN ledger canónico/0009/0010).
export const RELEASE_IDENTITY = {
  releaseRole: "8B5_GATE_INTERMEDIATE",
  releaseMarker: "INGEM_8B5_GATE_INTERMEDIATE_V1",
  releaseBaseCommit: "db9bf73333a62be019b476cc04b5e95b3653ac5c",
} as const;

export type ReleaseIdentity = typeof RELEASE_IDENTITY;
