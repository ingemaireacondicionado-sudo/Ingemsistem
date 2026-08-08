import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { extractTokenFromHeader, verifyIngemToken, type IngemTokenPayload } from "../ingemAuth";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ========== Manus OAuth protected procedure (original) ==========
const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ========== INGEM Internal Auth protected procedure ==========
const INGEM_UNAUTHED_MSG = "Sesión expirada. Por favor, inicie sesión nuevamente.";

const requireIngemUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  const authHeader = ctx.req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  const ingemUser = await verifyIngemToken(token);
  if (!ingemUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      ingemUser,
    },
  });
});

export const ingemProtectedProcedure = t.procedure.use(requireIngemUser);

// INGEM admin-only procedure
const requireIngemAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  const authHeader = ctx.req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  const ingemUser = await verifyIngemToken(token);
  if (!ingemUser) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: INGEM_UNAUTHED_MSG });
  }

  if (ingemUser.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: "No tienes permisos de administrador." });
  }

  return next({
    ctx: {
      ...ctx,
      ingemUser,
    },
  });
});

export const ingemAdminProcedure = t.procedure.use(requireIngemAdmin);
