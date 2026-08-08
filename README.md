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

## Seguridad

- Las credenciales reales (`.env`, `.project-config.json`) están excluidas
  del repositorio vía `.gitignore`.
- `.env.example` documenta las variables necesarias, sin valores.
