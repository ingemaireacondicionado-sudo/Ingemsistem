import { useCallback } from 'react';
import { trpc } from '@/lib/trpc';

/**
 * Acceso al módulo de agentes. La UI no calcula nada: muestra lo que el backend
 * decidió mostrar (qué agentes puede ver este usuario, si puede operarlos) y le
 * manda las aprobaciones. Todo dato numérico viene ya calculado del servidor.
 */
export function useAgents() {
  const catalog = trpc.agents.list.useQuery(undefined, { staleTime: 60_000 });
  const decisions = trpc.agents.decisions.useQuery({ limit: 100 }, { staleTime: 5_000 });
  const runs = trpc.agents.runs.useQuery({ limit: 10 }, { staleTime: 5_000 });

  const refetchAll = useCallback(async () => {
    await Promise.all([decisions.refetch(), runs.refetch()]);
  }, [decisions, runs]);

  const runMutation = trpc.agents.run.useMutation({ onSuccess: () => { void refetchAll(); } });
  const approveMutation = trpc.agents.approve.useMutation({ onSuccess: () => { void refetchAll(); } });
  const rejectMutation = trpc.agents.reject.useMutation({ onSuccess: () => { void refetchAll(); } });

  return {
    agents: catalog.data?.agents ?? [],
    canManage: catalog.data?.canManage ?? false,
    isLoadingCatalog: catalog.isLoading,
    decisions: decisions.data ?? [],
    isLoadingDecisions: decisions.isLoading,
    runs: runs.data ?? [],
    runAgent: runMutation.mutateAsync,
    isRunning: runMutation.isPending,
    runningAgentKey: runMutation.variables?.agentKey ?? null,
    approveDecision: approveMutation.mutateAsync,
    rejectDecision: rejectMutation.mutateAsync,
    isDeciding: approveMutation.isPending || rejectMutation.isPending,
    decidingId:
      (approveMutation.isPending ? approveMutation.variables?.id : undefined) ??
      (rejectMutation.isPending ? rejectMutation.variables?.id : undefined) ??
      null,
    refetchAll,
  };
}
