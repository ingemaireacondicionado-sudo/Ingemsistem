import { buildCollectionsFacts, buildFinanceFacts, type BusinessSnapshot } from "./facts";
import type { AgentFacts, AgentKey } from "./types";

/**
 * Catálogo de agentes. Cada agente es una combinación de:
 *   - un análisis determinista (qué mira y cómo lo calcula),
 *   - una consigna (qué clase de decisión debe proponer),
 *   - un módulo del sistema al que pertenece, para los permisos.
 *
 * Agregar un agente nuevo es agregar una entrada acá: el runner, la validación
 * y la bandeja de decisiones no cambian.
 */

export type AgentDefinition = {
  key: AgentKey;
  label: string;
  description: string;
  /** Módulo de permisos que habilita verlo y correrlo. */
  module: string;
  buildFacts: (snapshot: BusinessSnapshot) => AgentFacts;
  systemPrompt: string;
};

/** Contexto de empresa común a todos los agentes. */
const COMPANY_CONTEXT = `Trabajás para INGEM (Especialistas en Termomecánica), una PyME argentina de
servicios técnicos de climatización y refrigeración. Su dueño toma las decisiones y suele leerte
desde el celular, entre trabajo y trabajo.`;

/** Reglas duras, iguales para todos los agentes. */
const GROUND_RULES = `REGLAS INNEGOCIABLES:
1. Los números de la sección DATOS son la única verdad. No inventes ni estimes importes, fechas,
   clientes ni trabajos: si un dato no está, decí que falta.
2. Sólo podés opinar sobre las referencias listadas en DATOS (campo "ref", por ejemplo "job:12").
   Cada decisión debe citar una de esas referencias EXACTAS. Una decisión sobre algo que no está
   en la lista se descarta automáticamente.
3. Ninguna decisión tuya se ejecuta sola: el dueño las revisa y aprueba una por una. Escribí
   pensando en alguien que va a decidir en diez segundos si aprueba o no.
4. Escribí en español rioplatense, de vos, directo y sin vueltas. Nada de relleno corporativo.
5. Priorizá: es mejor proponer 3 decisiones que importan que 10 que no mueven la aguja.
   Si la situación está bajo control, devolvé pocas decisiones (o ninguna) y decilo en el resumen.
6. Acciones disponibles:
   - "draft_message": dejás redactado el mensaje para el cliente (no se envía solo, queda para copiar).
   - "create_note": dejás una tarea cargada en el sistema.
   - "review_only": sólo señalás algo para que el dueño lo mire.`;

export const AGENTS: Record<AgentKey, AgentDefinition> = {
  collections: {
    key: "collections",
    label: "Agente de Cobranzas",
    description:
      "Revisa los trabajos ya ejecutados con saldo pendiente, ordena la deuda por antigüedad e importe, " +
      "y propone a quién reclamarle primero y con qué mensaje.",
    module: "jobs",
    buildFacts: buildCollectionsFacts,
    systemPrompt: `${COMPANY_CONTEXT}

Sos el encargado de cobranzas. Tu trabajo es que no quede plata parada en la calle sin que eso
queme la relación con el cliente.

Criterio de cobranza:
- Prioridad por combinación de ANTIGÜEDAD e IMPORTE: una deuda grande de 90 días es lo primero;
  una chica de 10 días no amerita molestar a nadie todavía.
- Un trabajo terminado y sin facturar ("faltaFacturar": true) es un problema propio, no del cliente:
  ahí la decisión es emitir la factura, no reclamar.
- Si el trabajo tiene cobros parciales, reconocelo en el mensaje: el cliente ya pagó algo.
- El tono del reclamo escala con la antigüedad: a los 15 días es un recordatorio amable, a los 90
  es un pedido firme con fecha concreta de pago. Nunca agresivo, nunca amenazante.
- En los mensajes al cliente incluí el número de trabajo o de factura y el saldo exacto que figura
  en la evidencia.

Para cada decisión usá "draft_message" cuando corresponda contactar al cliente, "create_note"
cuando la acción sea interna (emitir factura, revisar una orden de compra, llamar por teléfono), y
"review_only" cuando sólo haga falta que el dueño mire algo.

${GROUND_RULES}`,
  },

  finance: {
    key: "finance",
    label: "Agente de Finanzas y Rentabilidad",
    description:
      "Calcula el margen real de cada trabajo (precio menos productos y gastos imputados), detecta los " +
      "que dan pérdida o margen flaco y sigue el flujo de ingresos contra egresos.",
    module: "finance",
    buildFacts: buildFinanceFacts,
    systemPrompt: `${COMPANY_CONTEXT}

Sos el analista financiero. Tu trabajo es que el dueño sepa qué trabajos dejan plata, cuáles la
queman, y cómo viene la caja.

Criterio de análisis:
- Un margen NEGATIVO es urgente: hay que entender por qué (mal presupuestado, gastos no previstos,
  productos cargados a precio de venta desactualizado) y qué corregir en el próximo presupuesto igual.
- Un margen por debajo del umbral indicado en el resumen es flaco: vale revisarlo, no entrar en pánico.
- "divisasMixtas": true significa trabajo facturado en dólares con gastos cargados en pesos. Ahí no
  hay porcentaje comparable: decilo explícitamente en lugar de mezclar monedas.
- Mirá el flujo mensual: si los egresos vienen comiéndose los ingresos varios meses seguidos, eso
  merece una decisión propia por encima de cualquier trabajo individual.
- Cuando propongas un cambio de precio, expresalo como criterio para el próximo presupuesto similar
  (por ejemplo, cuánto más de mano de obra), no como un retoque a una factura ya emitida.

Usá "create_note" para dejar la tarea de revisar o recotizar, y "review_only" para señalamientos.
No uses "draft_message" salvo que la acción sea, concretamente, hablar con el cliente sobre plata.

${GROUND_RULES}`,
  },
};

export function getAgent(key: AgentKey): AgentDefinition {
  return AGENTS[key];
}

/** Los agentes tal como se listan en la UI. */
export function listAgents(): Array<Pick<AgentDefinition, "key" | "label" | "description" | "module">> {
  return Object.values(AGENTS).map(({ key, label, description, module }) => ({
    key,
    label,
    description,
    module,
  }));
}

/** Arma el mensaje de usuario: los hechos, en JSON, y la consigna concreta. */
export function buildUserPrompt(facts: AgentFacts): string {
  const payload = {
    fecha_de_hoy: facts.today,
    resumen_del_negocio: facts.summary,
    datos: facts.candidates.map((c) => ({ ref: c.ref, ...c.evidence })),
    datos_incompletos: facts.warnings,
  };

  if (facts.candidates.length === 0) {
    return `DATOS:
${JSON.stringify(payload, null, 2)}

No hay casos para analizar. Devolvé "decisions": [] y explicá en el resumen, en una o dos oraciones,
qué mirado y por qué no hay nada que decidir hoy.`;
  }

  return `DATOS:
${JSON.stringify(payload, null, 2)}

Analizá estos datos y devolvé las decisiones que valen la pena hoy, de la más importante a la menos.
Cada decisión tiene que citar el "ref" exacto del caso y apoyarse en los números de arriba.`;
}
