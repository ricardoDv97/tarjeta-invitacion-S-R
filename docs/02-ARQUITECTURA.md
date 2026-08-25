# Arquitectura

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
