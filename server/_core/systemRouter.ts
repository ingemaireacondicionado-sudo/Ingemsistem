import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { RELEASE_IDENTITY } from "./releaseIdentity";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(({ ctx }) => {
      // La identidad de runtime la genera el BACKEND en ejecución (constante
      // embebida en el release), no version.json ni el frontend. NO debe cachearse
      // en CDN/navegador para no devolver una versión vieja. El `timestamp` de
      // entrada ya rompe el cache del GET; además se fuerza no-store si hay `res`.
      ctx.res?.setHeader?.("Cache-Control", "no-store");
      return {
        ok: true,
        releaseRole: RELEASE_IDENTITY.releaseRole,
        releaseMarker: RELEASE_IDENTITY.releaseMarker,
        releaseBaseCommit: RELEASE_IDENTITY.releaseBaseCommit,
        // Informativo, NO autoritativo: permite verificar si Manus inyecta el SHA.
        gitShaEnv: process.env.GIT_SHA ?? null,
      };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
