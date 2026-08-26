# Arquitectura

## Sprint 07

La API calcula `total_amount` desde `weddings.price_per_guest` para adultos (11+) y `weddings.child_price` para niños (6–10); `young_child` (1–5) vale cero. `GET /api/registrations/[id]` devuelve únicamente counts y método de pago para construir el formulario dinámico. `POST /api/registrations/[id]/guests` valida y persiste el grupo completo. Todos los reads y writes usan el cliente privado server-side.

Stack actual:

- Astro y JavaScript para la invitación web.
- Tailwind CSS para estilos.
- Supabase SDK como acceso centralizado a datos.
- PostgreSQL/Supabase como fuente de verdad para bodas, inscripciones, invitados y pagos.
- Migraciones SQL versionadas en `supabase/migrations`.

Principios:

- El contenido visual permanece en `src/config/wedding.js`.
- `src/lib/supabase.js` centraliza el cliente público y solo consume variables `PUBLIC_*`.
- `src/lib/supabaseServer.js` centraliza el cliente privado usado exclusivamente por endpoints server-side.
- `SUPABASE_SECRET_KEY` nunca se importa ni utiliza en código cliente.
- El RSVP crea preinscripciones mediante `POST /api/registrations`; el navegador no escribe directamente en Supabase.
- RLS está habilitado y sin políticas en este Sprint: acceso denegado por defecto.
- El esquema relaciona las inscripciones con `wedding_id` y admite múltiples bodas sin implementar multi-tenancy SaaS.
- Mercado Pago y sus webhooks continúan previstos, pero no están implementados.
- La API determina la boda activa y calcula `total_amount` desde `weddings.price_per_guest`.
