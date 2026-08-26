# Modelo de datos y flujos

## Modelo etario de Sprint 07

- `adult`: 11 años o más; usa `weddings.price_per_guest` (ARS 35.000 en la configuración real).
- `child`: 6 a 10 años; usa `weddings.child_price` (ARS 10.000).
- `young_child`: 1 a 5 años; vale ARS 0 por regla de negocio.

`registrations` conserva `guest_count` y agrega `adult_count`, `child_count` y `young_child_count`, cuya suma debe coincidir mediante constraint. El backfill clasifica como adultos a los asistentes históricos, incluidas inscripciones canceladas, preservando filas y coherencia. El servidor calcula `guest_count` y `total_amount`; el navegador sólo muestra una estimación.

`/confirmar/invitados` genera exactamente un formulario por asistente. La lectura server-side expone sólo los counts y el método de pago; la escritura exige nombre, apellido, total y distribución exactos, estado `pending` y ausencia de invitados previos. `guests.registration_id` mantiene la relación N→1. No se crean pagos ni se confirma la asistencia en este Sprint.

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

Cada fila representa un intento. Incluye `id`, `registration_id`, `provider`, `provider_payment_id`, `external_reference`, `amount`, `currency`, `status`, `paid_at` y timestamps. `provider` acepta `mercadopago` o `cash`; `amount` es `numeric(12,2)` no negativo; `currency` tiene default `ARS` para el MVP argentino; `status` acepta `pending`, `approved`, `rejected` o `cancelled`.

No hay unicidad sobre `registration_id`, permitiendo reintentos. El índice único parcial `(provider, provider_payment_id)` cuando el identificador no es NULL evita duplicar un pago del mismo proveedor. `external_reference` se indexa, pero no es única porque varios intentos pueden correlacionarse con una inscripción. También se indexan `registration_id` y `status`.

`registrations.payment_status` es el resumen vigente de una inscripción. `payments.status` conserva el estado de cada intento individual; su sincronización corresponde al futuro flujo de pagos.

## Timestamps y seguridad

La función reutilizable `public.set_updated_at()` y cuatro triggers actualizan `updated_at`. No usa `SECURITY DEFINER` y fija un `search_path` vacío.

RLS está habilitado en las cuatro tablas. No hay políticas públicas: `anon` y `authenticated` quedan sin acceso mediante la API (fail closed). El RSVP usa `SUPABASE_SECRET_KEY` exclusivamente en una Astro API Route server-side; nunca se expone al navegador. Las políticas administrativas se definirán junto con autenticación.

## RSVP inicial

`POST /api/registrations` valida la asistencia, la cantidad y el método de contribución. El servidor selecciona una única boda activa, calcula el monto desde `price_per_guest` y crea una preinscripción sin filas en `guests` o `payments`. Una asistencia positiva queda `pending`; una respuesta negativa queda `cancelled` con método nulo y total cero.
