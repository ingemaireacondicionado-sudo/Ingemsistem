# Ingemsistem

Sistema de gestión de INGEM (Especialistas en Termomecánica): clientes,
proveedores, productos, agenda de turnos, trabajos, presupuestos,
facturación/cobranzas, finanzas, notas y usuarios.

## Stack

- **Frontend:** React + TypeScript, Vite, Tailwind CSS, shadcn/ui, tRPC client
- **Backend:** Node.js + tRPC (Express), Drizzle ORM
- **Base de datos:** MySQL (TiDB Cloud)
- **Plataforma de origen:** Manus (template web-db-user)

## Estructura

```
client/          Frontend React
  src/pages/     32 páginas del sistema
  src/components/  Componentes (Layout, GlobalSearch, FileUpload, ui/...)
  src/contexts/  Contextos (AuthContext)
  src/lib/       Utilidades (fechas, contactos, PDF, presupuestos, tRPC)
  src/types/     Tipos de dominio (job, appointment, customer, user, ...)
server/          Backend tRPC (routers, auth, storage, notificaciones, tests)
  agents/        Agentes de gestión (análisis, validación, ejecución)
shared/          Tipos y constantes compartidas
drizzle/         Esquema de base de datos y migraciones SQL
patches/         Parches de dependencias (wouter)
references/      Documentación de integraciones de la plataforma
```

## Ejecutar el proyecto

1. Instalar dependencias: `pnpm install`
2. Copiar `.env.example` a `.env` y completar las variables (base de datos,
   JWT, claves de la plataforma). **Nunca subir `.env` al repositorio.**
3. Desarrollo: `pnpm run dev` — Build: `pnpm run build` — Tests: `pnpm test`

## Agentes de gestión

El módulo **Agentes** (`/agents`) analiza los datos reales del sistema y propone
decisiones al dueño. Hoy hay dos:

- **Cobranzas:** trabajos ejecutados con saldo pendiente, ordenados por
  antigüedad e importe; separa el reclamo al cliente del trabajo que todavía no
  se facturó, y redacta el mensaje.
- **Finanzas y rentabilidad:** margen real por trabajo (precio menos productos y
  gastos imputados), trabajos en pérdida o con margen flaco, e ingresos contra
  egresos de los últimos meses.

El reparto de responsabilidades es estricto y está sostenido por tests:

1. **Los números los calcula el servidor**, en centavos enteros y a partir de la
   base (`server/agents/facts.ts`). El modelo de lenguaje no aporta ni un
   importe: sólo prioriza y redacta sobre esa evidencia, que queda guardada con
   cada decisión y se muestra al lado del fundamento.
2. **Lo que devuelve el modelo se valida** (`server/agents/validation.ts`): una
   decisión que cita un trabajo inexistente se descarta, y cualquier acción
   fuera de la allowlist se degrada a informativa.
3. **Nada se ejecuta solo.** Toda decisión nace `pending` y sólo un
   administrador o gerente la aprueba. La aprobación no eleva privilegios y sólo
   puede crear una nota o dejar un mensaje redactado
   (`server/agents/actions.ts`): **ningún agente registra cobros, edita montos de
   trabajos ni envía mensajes**. El ledger canónico sigue siendo exclusivo de
   `registerPayment`.
4. **Si el modelo no está disponible**, la corrida igual produce decisiones con
   el análisis determinista y avisa que el texto lo redactó el sistema.

Requiere `BUILT_IN_FORGE_API_KEY` para la redacción; sin esa variable el módulo
funciona en modo determinista.

## Seguridad

- Las credenciales reales (`.env`, `.project-config.json`) están excluidas
  del repositorio vía `.gitignore`.
- `.env.example` documenta las variables necesarias, sin valores.
