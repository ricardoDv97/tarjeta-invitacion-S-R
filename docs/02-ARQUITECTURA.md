# Arquitectura

## Sprint 11

La autenticación administrativa usa `@supabase/ssr` con un cliente nuevo por request, la publishable key y cookies administradas por Astro. Las cookies de sesión son `HttpOnly`, `SameSite=Lax`, `Secure` en producción y se refrescan mediante `getAll`/`setAll`. No se guardan tokens en `localStorage` ni se devuelven en responses.

`src/middleware.js` protege `/admin` y sus futuras subrutas, excluye `/admin/login` y evita loops. Valida identidad mediante `auth.getUser()` y autoriza consultando `public.admin_users` con el cliente privilegiado server-only. La secret key no representa la sesión ni llega al navegador. Login y logout son `POST`; todas las rutas admin usan `Cache-Control: private, no-store`.

```text
Usuario → /admin/login → signInWithPassword → Supabase Auth
        → getUser server-side → admin_users → cookie SSR → /admin

/admin → POST /api/admin/logout → Supabase signOut → /admin/login
```

## Sprint 10

`POST /api/webhooks/mercadopago` procesa exclusivamente `type=payment`. Valida `x-signature`, `x-request-id` y `data.id` con `WebhookSignatureValidator` y `MERCADOPAGO_WEBHOOK_SECRET` antes de consultar `Payment.get`. El body y los redirects nunca son autoridad. La respuesta real se correlaciona en PostgreSQL por registration, provider, external reference, importe, moneda y preference cuando el proveedor la informa.

La RPC privada `apply_mercadopago_payment_result` bloquea registration y payment, aplica ambas actualizaciones atómicamente e impide degradar `approved`. El MVP conserva una fila MP por registration: acepta el primer `provider_payment_id` validado y luego sólo ese mismo ID. Un ID diferente no sobrescribe la asociación; soportar varios intentos requerirá ampliar el modelo en otro Sprint.

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
