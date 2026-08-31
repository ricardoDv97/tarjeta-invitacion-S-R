# Invitacion-Nuestra-Boda

> Estado funcional: Sprint 09 — RSVP, efectivo y Checkout Pro de Mercado Pago.

El navegador crea la inscripción y guarda el grupo completo. Efectivo conserva su transición transaccional; Mercado Pago solicita server-side una preferencia de Checkout Pro mediante `POST /api/registrations/[id]/mercadopago`. La base es autoridad de monto y estados. Los redirects de Mercado Pago son únicamente informativos: `payment_status` y `attendance_status` permanecen `pending` hasta la validación server-side del Sprint 10.

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
3. Agregá manualmente `SUPABASE_SECRET_KEY` para la API server-side de RSVP. Nunca uses esta clave en el frontend.
4. Agregá `MERCADOPAGO_ACCESS_TOKEN` exclusivamente server-side, `MERCADOPAGO_ENVIRONMENT=test` para credenciales de prueba y `PUBLIC_SITE_URL` con el origen HTTPS público usado en las back URLs. Usá `MERCADOPAGO_ENVIRONMENT=production` sólo cuando se habiliten pagos reales.
5. No versiones `.env`. Las migraciones SQL están en `supabase/migrations`.

El build funciona sin credenciales. Los clientes sólo se crean al solicitarlos y, si falta configuración, informan un error controlado. El RSVP escribe mediante `POST /api/registrations`; el navegador no inserta directamente en Supabase.

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

Sprint 09 — Checkout Pro con preferencia server-side, payment pending, reintentos idempotentes y retornos sin autoridad de pago.
