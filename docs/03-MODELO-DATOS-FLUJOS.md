# Modelo de datos y flujos

## Aprobación administrativa de efectivo — Sprint 12

`approve_cash_payment(uuid)` bloquea primero la registration y luego su único payment cash. Valida método, relación, importe, moneda y transición desde `pending`; actualiza payment y registration dentro de la misma transacción. Una repetición sobre el estado final completo responde `already_applied`. Mercado Pago nunca entra en este flujo. La función es `security invoker`, fija `search_path` vacío y sólo concede ejecución a `service_role`.

Los importes del resumen se suman server-side en centavos enteros. Sólo se cuentan payments reales (`approved` para recaudado y `pending` para pendiente), sin inferir importes desde registrations.

## Autenticación administrativa de Sprint 11

`auth.users` conserva las identidades y los hashes de contraseñas gestionados por Supabase Auth. `public.admin_users` es una allowlist mínima: `user_id` es PK y FK a `auth.users(id)` con borrado en cascada, y `created_at` registra el alta. RLS está habilitado, no existen policies y se revocan privilegios a `public`, `anon` y `authenticated`.

La comprobación de la allowlist ocurre exclusivamente server-side. Estar autenticado no concede administración; si el usuario no pertenece a la tabla, su sesión se cierra inmediatamente. No se modifican las policies de `weddings`, `registrations`, `guests` o `payments`.

## Validación Mercado Pago de Sprint 10

```text
Mercado Pago → Webhook firmado → GET payment server-side
→ external_reference + amount + currency + preference/provider
→ RPC transaccional → payment + registration
```

El estado del body del Webhook y las back URLs no se utilizan. `approved` confirma asistencia y guarda `date_approved`; `rejected` y `cancelled` mantienen asistencia pendiente; los estados intermedios (`pending`, `in_process`, `in_mediation`, `authorized` y desconocidos) se conservan como `pending`. Un estado local `approved` es terminal.

El modelo MVP mantiene una sola fila Mercado Pago por registration. El primer payment ID verificado ocupa `provider_payment_id`; notificaciones duplicadas del mismo ID son idempotentes y un ID diferente se ignora para evitar sobrescribir un pago asociado. Esta decisión limita múltiples intentos reales y deberá revisarse antes de habilitarlos.

## Modelo etario de Sprint 07

- `adult`: 11 años o más; usa `weddings.price_per_guest` (ARS 35.000 en la configuración real).
- `child`: 6 a 10 años; usa `weddings.child_price` (ARS 10.000).
- `young_child`: 1 a 5 años; vale ARS 0 por regla de negocio.

`registrations` conserva `guest_count` y agrega `adult_count`, `child_count` y `young_child_count`, cuya suma debe coincidir mediante constraint. El backfill clasifica como adultos a los asistentes históricos, incluidas inscripciones canceladas, preservando filas y coherencia. El servidor calcula `guest_count` y `total_amount`; el navegador sólo muestra una estimación.

`/confirmar/invitados` genera exactamente un formulario por asistente. La lectura server-side expone sólo los counts y el método de pago; la escritura exige nombre, apellido, total y distribución exactos y estado `pending`. Un reintento con el mismo grupo se reconoce de forma idempotente; un grupo diferente se rechaza. `guests.registration_id` mantiene la relación N→1.

## Flujo efectivo de Sprint 08

Después de guardar los guests, `POST /api/registrations/[id]/cash` ejecuta una transición atómica en PostgreSQL:

```text
RSVP → guests → cash → payment row → attendance confirmed
                                      → payment pending → aprobación administrativa futura
```

La RPC bloquea la registration, exige `payment_method = cash`, estados iniciales `pending`, monto no negativo y coincidencia exacta entre counts declarados y guests reales. Inserta `provider = cash`, `amount = registrations.total_amount`, `currency = ARS`, `provider_payment_id = NULL`, `external_reference = NULL` y `paid_at = NULL`. Con monto mayor a cero, ambos estados de pago quedan `pending`; la asistencia queda `confirmed`.

Para total cero se conserva un payment auditable de ARS 0 con estado `approved`, `paid_at = NULL`, y la registration queda `confirmed`/`approved`. Así no se representa una deuda inexistente. El índice parcial `payments_one_cash_per_registration_idx` y el lock de la registration hacen seguros los reintentos; una fila existente sólo se acepta si coincide por completo con la transición esperada.

## Checkout Pro de Sprint 09

```text
RSVP → guests → payment_method=mercadopago → payment pending → preference
→ Checkout Pro → back_url → DB sigue pending → Sprint 10 webhook/verificación
```

`prepare_mercadopago_checkout` valida registration, wedding habilitada, guests y distribución bajo lock, y reserva un único payment MP. La preferencia usa un ítem por el total calculado en DB, moneda ARS y `external_reference = registration.id`. `provider_preference_id` conserva el ID de preferencia; `provider_payment_id` continúa NULL hasta que Sprint 10 valide un pago real.

Los índices parciales impiden más de un payment MP por registration y duplicar `provider_preference_id`. El UUID del payment es la clave idempotente de la creación remota. Crear o visitar `/pago/exitoso`, `/pago/pendiente` o `/pago/error` no confirma, rechaza ni cancela pagos. Para total cero, la RPC crea un payment MP de ARS 0 `approved`, confirma asistencia y no llama a Checkout Pro.

PostgreSQL/Supabase es la fuente de verdad para bodas, inscripciones, invitados y pagos. El contenido visual continúa en `src/config/wedding.js`.

## Relaciones

```text
weddings 1 ── N registrations
registrations 1 ── N guests
registrations 1 ── N payments
```

Todas las PK son UUID con `gen_random_uuid()`. Las tres relaciones usan `ON DELETE CASCADE`: eliminar una boda elimina sus inscripciones y, por cascada, invitados y pagos; eliminar una inscripción elimina sus invitados y pagos.

## `weddings`

Campos: `id` (PK), `slug` (requerido y único), `couple_name` (requerido), `wedding_date`, `timezone`, `price_per_guest`, `payment_enabled`, `is_active`, `created_at` y `updated_at`. `price_per_guest` es `numeric(12,2)`, default `0` y no admite negativos. Los booleanos tienen defaults `false` y `true`, respectivamente.

## `registrations`

Incluye `id`, `wedding_id`, datos de contacto opcionales (`contact_name`, `email`, `phone`), `guest_count`, estados, `total_amount` y timestamps. `guest_count` admite entre 1 y 20 para limitar abuso. `total_amount` es `numeric(12,2)` y no negativo.

- `attendance_status`: `pending`, `confirmed`, `cancelled`.
- `payment_method`: nullable; `mercadopago`, `cash`.
- `payment_status`: `pending`, `approved`, `rejected`, `cancelled`.

Índices: `wedding_id`, `payment_status`, `attendance_status` y `(wedding_id, payment_status)` para el futuro listado por boda y estado de pago.

## `guests`

Incluye `id`, `registration_id`, `first_name`, `last_name`, `document_number`, `age_category`, `notes` y timestamps. Los nombres son obligatorios. Tras el backfill, `age_category` es requerido y acepta exclusivamente `adult`, `child` o `young_child`. Se indexa `registration_id`.

## `payments`

Cada fila representa un intento. Incluye `id`, `registration_id`, `provider`, `provider_payment_id`, `provider_preference_id`, `external_reference`, `amount`, `currency`, `status`, `paid_at` y timestamps. `provider` acepta `mercadopago` o `cash`; `amount` es `numeric(12,2)` no negativo; `currency` tiene default `ARS`; `status` acepta `pending`, `approved`, `rejected` o `cancelled`.

No hay unicidad general sobre `registration_id`, permitiendo futuros intentos de otros proveedores. El índice único parcial `(provider, provider_payment_id)` cuando el identificador no es NULL evita duplicar un identificador de proveedor, y Sprint 08 agrega unicidad parcial sobre `registration_id` exclusivamente para `provider = cash`. `external_reference` se indexa, pero no es única. También se indexan `registration_id` y `status`.

`registrations.payment_status` es el resumen vigente de una inscripción. `payments.status` conserva el estado de cada intento individual; su sincronización corresponde al futuro flujo de pagos.

## Timestamps y seguridad

La función reutilizable `public.set_updated_at()` y cuatro triggers actualizan `updated_at`. No usa `SECURITY DEFINER` y fija un `search_path` vacío.

RLS está habilitado en las cuatro tablas. No hay políticas públicas: `anon` y `authenticated` quedan sin acceso mediante la API (fail closed). El RSVP usa `SUPABASE_SECRET_KEY` exclusivamente en una Astro API Route server-side; nunca se expone al navegador. Las políticas administrativas se definirán junto con autenticación.

## RSVP inicial

`POST /api/registrations` valida la asistencia, la cantidad y el método de contribución. El servidor selecciona una única boda activa, calcula el monto desde `price_per_guest` y crea una preinscripción sin filas en `guests` o `payments`. Una asistencia positiva queda `pending`; una respuesta negativa queda `cancelled` con método nulo y total cero.
