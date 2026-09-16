import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Bot,
  Play,
  Loader2,
  Check,
  X,
  Clock,
  AlertTriangle,
  Copy,
  FileText,
  MessageSquare,
  Eye,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAgents } from '@/hooks/useAgents';

/**
 * Panel de AGENTES DE GESTIÓN.
 *
 * La pantalla está armada alrededor de una idea: el agente propone, el dueño
 * decide. Por eso cada decisión muestra, en este orden, qué propone, POR QUÉ
 * (con los números que calculó el servidor a la vista) y qué va a pasar si se
 * aprueba. Nada se ejecuta hasta que alguien aprieta Aprobar.
 */

const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  urgent: { label: 'Urgente', className: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: 'Alta', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: 'Media', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  low: { label: 'Baja', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const ACTION_INFO: Record<string, { label: string; icon: typeof FileText; effect: string }> = {
  create_note: {
    label: 'Crea una nota',
    icon: FileText,
    effect: 'Al aprobar se carga una tarea en el módulo de Notas.',
  },
  draft_message: {
    label: 'Mensaje redactado',
    icon: MessageSquare,
    effect: 'Al aprobar queda listo para copiar. El sistema no lo envía solo.',
  },
  review_only: {
    label: 'Sólo para mirar',
    icon: Eye,
    effect: 'Aprobar sólo la marca como revisada; no cambia ningún dato.',
  },
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendiente', className: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Aprobada', className: 'bg-emerald-100 text-emerald-700' },
  executed: { label: 'Aplicada', className: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Descartada', className: 'bg-slate-100 text-slate-600' },
  failed: { label: 'Falló', className: 'bg-red-100 text-red-700' },
};

type DecisionRow = {
  id: number;
  agentKey: string;
  title: string;
  rationale: string | null;
  recommendation: string | null;
  priority: string;
  evidenceJson: string | null;
  entityType: string | null;
  entityId: number | null;
  actionType: string;
  actionPayloadJson: string | null;
  status: string;
  decidedByName: string | null;
  executionResult: string | null;
  createdAt: string | Date;
};

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Etiquetas legibles para las claves de la evidencia que calcula el servidor. */
const EVIDENCE_LABELS: Record<string, string> = {
  trabajo: 'Trabajo',
  titulo: 'Detalle',
  cliente: 'Cliente',
  telefono: 'Teléfono',
  estado: 'Estado',
  total: 'Total',
  cobrado: 'Cobrado',
  saldo: 'Saldo',
  diasDesdeFacturaOCierre: 'Días sin cobrar',
  antiguedad: 'Antigüedad',
  factura: 'Factura',
  ultimoCobro: 'Último cobro',
  vencimientoComprometido: 'Vencimiento',
  subtotalSinIva: 'Subtotal sin IVA',
  costoProductos: 'Costo de productos',
  gastosImputados: 'Gastos imputados',
  margen: 'Margen',
  margenPorcentaje: 'Margen %',
  saldoPendiente: 'Saldo pendiente',
  fecha: 'Fecha',
  moneda: 'Moneda',
};

/** Claves que no aportan nada en pantalla (duplican otra o son internas). */
const HIDDEN_EVIDENCE_KEYS = new Set([
  'saldoNumerico',
  'margenNumerico',
  'faltaFacturar',
  'divisasMixtas',
]);

function EvidenceGrid({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).filter(
    ([key, value]) =>
      !HIDDEN_EVIDENCE_KEYS.has(key) && value !== null && value !== undefined && value !== '',
  );
  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Datos del sistema
      </p>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-[11px] text-slate-500 truncate">{EVIDENCE_LABELS[key] ?? key}</dt>
            <dd className="text-sm font-medium text-slate-800 break-words">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DecisionCard({
  decision,
  canManage,
  busy,
  onApprove,
  onReject,
}: {
  decision: DecisionRow;
  canManage: boolean;
  busy: boolean;
  onApprove: (id: number, notes: string) => void;
  onReject: (id: number, notes: string) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState('');

  const evidence = useMemo(() => parseJson(decision.evidenceJson), [decision.evidenceJson]);
  const payload = useMemo(() => parseJson(decision.actionPayloadJson), [decision.actionPayloadJson]);
  const priority = PRIORITY_STYLES[decision.priority] ?? PRIORITY_STYLES.medium;
  const action = ACTION_INFO[decision.actionType] ?? ACTION_INFO.review_only;
  const ActionIcon = action.icon;
  const status = STATUS_LABELS[decision.status] ?? STATUS_LABELS.pending;
  const isPending = decision.status === 'pending';
  const messageText = typeof payload.messageText === 'string' ? payload.messageText : '';

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      toast.success('Mensaje copiado');
    } catch {
      toast.error('No se pudo copiar. Seleccionalo y copialo a mano.');
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={priority.className}>
            {priority.label}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <ActionIcon className="h-3 w-3" />
            {action.label}
          </Badge>
          {!isPending && <Badge className={status.className}>{status.label}</Badge>}
        </div>
        <CardTitle className="text-base sm:text-lg leading-snug mt-2">{decision.title}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {decision.rationale && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Por qué</p>
            <p className="text-sm text-slate-700 whitespace-pre-line">{decision.rationale}</p>
          </div>
        )}

        {decision.recommendation && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Qué hacer</p>
            <p className="text-sm text-slate-700 whitespace-pre-line">{decision.recommendation}</p>
          </div>
        )}

        {messageText && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Mensaje para el cliente
              </p>
              <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={copyMessage}>
                <Copy className="h-3 w-3" />
                Copiar
              </Button>
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-line">{messageText}</p>
          </div>
        )}

        <button
          type="button"
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Ocultar los datos' : 'Ver los datos en que se basa'}
        </button>

        {expanded && <EvidenceGrid evidence={evidence} />}

        {decision.entityType === 'job' && decision.entityId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => navigate(`/jobs/${decision.entityId}/edit`)}
          >
            <ExternalLink className="h-3 w-3" />
            Abrir el trabajo
          </Button>
        )}

        {!isPending && decision.executionResult && (
          <p className="text-xs text-slate-500 border-t pt-2">
            {decision.executionResult}
            {decision.decidedByName ? ` — ${decision.decidedByName}` : ''}
          </p>
        )}

        {isPending && canManage && (
          <>
            <Separator />
            <p className="text-xs text-slate-500">{action.effect}</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Comentario (opcional): por qué aprobás o descartás"
              className="min-h-[60px] text-sm"
              maxLength={500}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                className="flex-1 gap-1"
                disabled={busy}
                onClick={() => onApprove(decision.id, notes)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Aprobar
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-1"
                disabled={busy}
                onClick={() => onReject(decision.id, notes)}
              >
                <X className="h-4 w-4" />
                Descartar
              </Button>
            </div>
          </>
        )}

        {isPending && !canManage && (
          <p className="text-xs text-slate-500 border-t pt-2">
            Sólo un administrador o gerente puede aprobar esta decisión.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentsPanel() {
  const {
    agents,
    canManage,
    isLoadingCatalog,
    decisions,
    isLoadingDecisions,
    runs,
    runAgent,
    isRunning,
    runningAgentKey,
    approveDecision,
    rejectDecision,
    isDeciding,
    decidingId,
  } = useAgents();

  const pending = decisions.filter((d: DecisionRow) => d.status === 'pending');
  const resolved = decisions.filter((d: DecisionRow) => d.status !== 'pending');

  const handleRun = async (agentKey: string, label: string) => {
    try {
      const result = await runAgent({ agentKey });
      if (result.decisionCount === 0) {
        toast.success(`${label}: no encontró nada que amerite una decisión hoy.`);
      } else {
        toast.success(
          `${label}: ${result.decisionCount} decisión${result.decisionCount === 1 ? '' : 'es'} para revisar.`,
        );
      }
      if (result.degraded) {
        toast.info('El análisis se generó con los cálculos del sistema, sin redacción del modelo.');
      }
    } catch (error: any) {
      toast.error(error?.message ?? 'No se pudo correr el agente.');
    }
  };

  const handleApprove = async (id: number, notes: string) => {
    try {
      const result = await approveDecision({ id, notes });
      if (result.status === 'executed') toast.success(result.message);
      else toast.error(result.message);
    } catch (error: any) {
      toast.error(error?.message ?? 'No se pudo aprobar la decisión.');
    }
  };

  const handleReject = async (id: number, notes: string) => {
    try {
      await rejectDecision({ id, notes });
      toast.success('Decisión descartada.');
    } catch (error: any) {
      toast.error(error?.message ?? 'No se pudo descartar la decisión.');
    }
  };

  const lastRunByAgent = useMemo(() => {
    const map = new Map<string, any>();
    for (const run of runs as any[]) {
      if (!map.has(run.agentKey)) map.set(run.agentKey, run);
    }
    return map;
  }, [runs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Bot className="h-6 w-6 text-blue-600" />
          Agentes de gestión
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Analizan los datos reales del sistema y proponen decisiones con su fundamento. Ninguna se
          aplica sola: vos aprobás o descartás una por una.
        </p>
      </div>

      {isLoadingCatalog ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando agentes…
        </div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-500">
            No tenés agentes disponibles con tu nivel de acceso.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((agent: any) => {
            const lastRun = lastRunByAgent.get(agent.key);
            const busy = isRunning && runningAgentKey === agent.key;
            return (
              <Card key={agent.key} className="flex flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{agent.label}</CardTitle>
                  <CardDescription className="text-sm">{agent.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  {lastRun?.summary && (
                    <p className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-200">
                      {lastRun.summary}
                    </p>
                  )}
                  {lastRun && (
                    <p className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Última consulta: {new Date(lastRun.startedAt).toLocaleString('es-AR')}
                    </p>
                  )}
                  {canManage ? (
                    <Button
                      className="w-full gap-2"
                      disabled={isRunning}
                      onClick={() => handleRun(agent.key, agent.label)}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {busy ? 'Analizando…' : 'Consultar al agente'}
                    </Button>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Sólo un administrador o gerente puede correr los agentes.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Para decidir{pending.length > 0 ? ` (${pending.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="resolved">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-4">
          {isLoadingDecisions ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando decisiones…
            </div>
          ) : pending.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-slate-600">No hay decisiones esperando tu respuesta.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Consultá a un agente para que analice la situación actual.
                </p>
              </CardContent>
            </Card>
          ) : (
            pending.map((decision: DecisionRow) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                canManage={canManage}
                busy={isDeciding && decidingId === decision.id}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="resolved" className="space-y-4 mt-4">
          {resolved.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-slate-500">
                Todavía no resolviste ninguna decisión.
              </CardContent>
            </Card>
          ) : (
            resolved.map((decision: DecisionRow) => (
              <DecisionCard
                key={decision.id}
                decision={decision}
                canManage={false}
                busy={false}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      <p className="text-[11px] text-slate-400 flex items-start gap-1">
        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
        Los agentes no registran cobros, no editan montos de trabajos ni envían mensajes por su
        cuenta. Los importes que muestran los calcula el sistema a partir de la base, no el modelo.
      </p>
    </div>
  );
}
