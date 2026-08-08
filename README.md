# Ingemsistem

Sistema de gestión de INGEM (Especialistas en Termomecánica): clientes,
proveedores, productos, agenda de turnos, trabajos, presupuestos,
facturación/cobranzas, finanzas, notas y usuarios.

## Contenido actual del repositorio

Este repositorio contiene por ahora un **respaldo parcial** del proyecto:

- `client/src/pages/` — las 32 páginas del frontend (React + TypeScript,
  Tailwind, shadcn/ui, tRPC).

## Pendiente de respaldar

Para que el respaldo quede completo faltan subir las siguientes partes del
proyecto (no incluidas en este commit porque no estaban disponibles):

- `client/src/App.tsx`, rutas y punto de entrada
- `client/src/contexts/` (p. ej. `AuthContext`)
- `client/src/lib/` (`dateUtils`, `contactUtils`, `generateBudgetPdf`,
  `budgetUtils`, `marginUtils`, `agendaMessage`, `trpc`, etc.)
- `client/src/types/` (`job`, `appointment`, `customer`, `user`, etc.)
- `client/src/components/` (componentes UI y `FileUpload`)
- `server/` (backend tRPC, esquema de base de datos)
- Archivos de configuración: `package.json`, `tsconfig.json`,
  `vite.config.ts`, `tailwind.config.*`, etc.

> Importante: no subir archivos `.env` ni credenciales; ya están excluidos
> por `.gitignore`.
