# Invitacion-Nuestra-Boda

## Invitación (Sprint 13)

Contenido real y refinamiento visual para Sabri & Ri. Fotos originales en src/assets/boda; selección centralizada en src/config/wedding.js y variantes WebP generadas con Astro Image. Hero: imagen-10.jpg. Galería: imagen-8, imagen-3, imagen-14, imagen-11, imagen-13 e imagen-4. Se conservaron los 16 originales.

La invitación reúne sobre, Hero, aviso, fecha/contador, galería, ubicación, confirmación y footer. Historia, ceremonia/celebración de demostración y dress code genérico fueron retirados. No se modificaron pagos, APIs ni administración.

Node requerido: 22.x. Informe y validaciones: [Sprint 13](docs/13-SPRINT-INFORME.md). Pendiente de auditoría; sin staging, commit ni push.

## Administración (Sprint 12)

`/admin` es un dashboard SSR con resumen, inscripciones, invitados, pagos, filtros y aprobación atómica de efectivo. Resuelve únicamente la boda `ricardo-sabrina-2026` y consulta las tablas privadas con `SUPABASE_SECRET_KEY` sólo en el servidor. Para el MVP se carga el conjunto completo (volumen esperado menor a 200 invitados); la paginación se revisará si el volumen aumenta.

## Administración (Sprint 11)

`/admin/login` autentica con Supabase Auth y conserva la sesión en cookies SSR. El middleware valida la identidad con `getUser()` y comprueba server-side la allowlist `public.admin_users`. `/admin` es una pantalla privada mínima; no carga invitados ni pagos.

Para habilitar el primer administrador, después de auditar y aplicar manualmente la migración:

1. Crear el usuario desde Supabase Dashboard > Authentication > Users. Supabase Auth gestiona la contraseña; no se guarda en tablas del proyecto.
2. Copiar solamente el UUID del usuario.
3. Ejecutar de forma controlada en SQL Editor, reemplazando el UUID:

```sql
insert into public.admin_users (user_id)
values ('00000000-0000-0000-0000-000000000000');
```

No colocar emails ni contraseñas en migraciones o variables versionadas. La migración permanece local hasta su auditoría; no ejecutar `db push` antes de aprobarla.

> Estado funcional: Sprint 10 — Webhook firmado y validación server-side de pagos Mercado Pago, preparado localmente para auditoría.

El navegador crea la inscripción y guarda el grupo completo. Efectivo conserva su transición transaccional; Mercado Pago solicita server-side una preferencia de Checkout Pro mediante `POST /api/registrations/[id]/mercadopago`. La base es autoridad de monto y estados. Los redirects son informativos; sólo el Webhook firmado, tras consultar Mercado Pago server-side, puede aplicar el resultado definitivo.

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
5. Configurá `MERCADOPAGO_WEBHOOK_SECRET` exclusivamente server-side con la clave generada en Mercado Pago Developers > Webhooks. No reutilices el Access Token.
6. No versiones `.env`. Las migraciones SQL están en `supabase/migrations`.

El build funciona sin credenciales. Los clientes sólo se crean al solicitarlos y, si falta configuración, informan un error controlado. El RSVP escribe mediante `POST /api/registrations`; el navegador no inserta directamente en Supabase.

## Arquitectura

El endpoint `POST /api/webhooks/mercadopago` valida firma, consulta el payment real a Mercado Pago y ejecuta una RPC atómica. El body y los redirects nunca son autoridad de pago.

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

Sprint 13 — contenido real, galería y refinamiento visual. Sprints 01–12 aprobados según el contexto recibido. Sprint 14 no iniciado.
