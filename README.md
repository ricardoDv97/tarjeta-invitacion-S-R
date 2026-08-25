# Invitacion-Nuestra-Boda

Invitación web digital para la boda S&R desarrollada con Astro y Tailwind CSS.

## Stack

- Astro
- JavaScript
- Tailwind CSS
- Supabase

## Requisitos

- Node.js
- npm

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Preview

```bash
npm run preview
```

## Supabase

1. Copiá `.env.example` como `.env`.
2. Completá `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY` para el cliente público.
3. Reservá `SUPABASE_SERVICE_ROLE_KEY` exclusivamente para código de servidor; no se usa en el frontend.
4. No versiones `.env`. Las migraciones SQL están en `supabase/migrations`.

El build funciona sin credenciales. El cliente solo se crea al solicitarlo y, si falta configuración, informa un error controlado.

## Arquitectura

- `components`: UI y componentes reutilizables
- `layouts`: layouts de página
- `pages`: rutas y páginas
- `config`: configuración central de datos visuales
- `lib`: utilidades, helpers y cliente Supabase
- `styles`: estilos globales
- `public`: recursos estáticos
- `supabase`: migraciones de base de datos
- `docs`: documentación del proyecto

## Estado actual

Sprint 05 — capa de datos Supabase preparada localmente.
