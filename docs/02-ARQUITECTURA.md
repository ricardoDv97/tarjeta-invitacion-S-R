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
- Las operaciones sensibles pertenecen a endpoints de servidor futuros.
- `SUPABASE_SERVICE_ROLE_KEY` es privada y no se importa ni utiliza en código cliente.
- RLS está habilitado y sin políticas en este Sprint: acceso denegado por defecto.
- El esquema relaciona las inscripciones con `wedding_id` y admite múltiples bodas sin implementar multi-tenancy SaaS.
- Mercado Pago y sus webhooks continúan previstos, pero no están implementados.
