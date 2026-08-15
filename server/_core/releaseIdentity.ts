// IDENTIDAD DE RELEASE AUTORITATIVA (8B-5) — CANÓNICO.
//
// Constante EMBEBIDA en el código del release: es la fuente de verdad de la
// identidad de runtime que expone el backend (system.health). NO se deriva de
// client/public/__manus__/version.json, ni de un asset estático, ni del frontend,
// ni del navegador, ni de un valor heredado de un checkpoint viejo, ni depende de
// process.env.GIT_SHA (Manus no demostró inyectarlo). El SHA git final del commit
// que agrega esta identidad se reporta EXTERNAMENTE (sin autoreferencia).
//
// releaseBaseCommit = base git real y verificada sobre la que se construye este
// release (092e25f, ya integrado en main).
export const RELEASE_IDENTITY = {
  releaseRole: "8B5_CANONICAL",
  releaseMarker: "INGEM_8B5_CANONICAL_V1",
  releaseBaseCommit: "092e25f9bfba4a13b2b86031a680943fd50ce97f",
} as const;

export type ReleaseIdentity = typeof RELEASE_IDENTITY;
