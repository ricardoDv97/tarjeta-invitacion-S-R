# Arquitectura

## Sprint 09

La API calcula `total_amount` desde `weddings.price_per_guest` para adultos (11+) y `weddings.child_price` para niños (6–10); `young_child` (1–5) vale cero. `GET /api/registrations/[id]` devuelve únicamente counts y método de pago para construir el formulario dinámico. `POST /api/registrations/[id]/guests` valida y persiste el grupo completo. Todos los reads y writes usan el cliente privado server-side.

`POST /api/registrations/[id]/cash` no acepta payload de negocio y ejecuta la RPC privada `confirm_cash_payment`. La función bloquea la registration, valida método, estados, monto y distribución real de guests, y crea el payment junto con la actualización de registration en una única transacción. Un índice único parcial impide más de un payment cash por registration. `/pago/efectivo` vuelve a consultar Supabase server-side y sólo muestra transiciones completas y coherentes.

`POST /api/registrations/[id]/mercadopago` reserva un único payment mediante `prepare_mercadopago_checkout`, crea o recupera una preferencia con el SDK oficial y devuelve sólo una URL HTTPS validada. `src/lib/mercadopago.js` mantiene el Access Token server-side. El UUID del payment se usa como clave idempotente del proveedor; `provider_preference_id` almacena la preferencia y `provider_payment_id` queda reservado para el pago real del Sprint 10.

No existe una transacción distribuida entre PostgreSQL y Mercado Pago. La operación es recuperable: un payment sin preference ID puede reintentarse con la misma clave idempotente; una preferencia vinculada se consulta y reutiliza. Las back URLs sólo renderizan UX y nunca mutan estados.

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
- Checkout Pro está implementado sin webhook. La autoridad definitiva de pago, autenticación y administración continúan pendientes.
- La API determina la boda activa y calcula `total_amount` desde `weddings.price_per_guest`.
