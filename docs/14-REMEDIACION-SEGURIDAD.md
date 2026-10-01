# SPRINT 14 — REMEDIACIÓN DE SEGURIDAD

> Actualización 2026-09-30: el dictamen vigente está en
> [14-REMEDIACION-FINAL-PRE-DB.md](14-REMEDIACION-FINAL-PRE-DB.md).
> El texto inferior conserva evidencia histórica: sus recuentos de tests/audit
> y su afirmación de grants mínimos fueron superados por la auditoría posterior.

Fecha: 2026-09-29. Estado: **COMPLETADO — fase local**.

**REMEDIATION COMPLETE — READY FOR REMOTE VALIDATION**

Producción NO aprobada. Hay migraciones sin aplicar remotamente y alertas de dependencias pendientes de una actualización incompatible. Este informe no reemplaza la auditoría de producción.

## Baseline y alcance

Rama `main`, sincronizada con `origin/main`; commit inicial `3364b53 feat: add RSVP deadline and improve guest form inputs`. Único archivo inicialmente sin seguimiento: `docs/14-AUDITORIA-PRE-PRODUCCION.md`, leído completo y conservado sin cambios. Ese informe fue la fuente principal de los defectos.

No se modificaron `.env`, secretos, Vercel, datos remotos, migraciones históricas, componentes visuales, deadline, fotos ni copy. No se ejecutó `supabase db push`, deploy, pago real, git add, commit ni push. Las pruebas SQL usan clusters PostgreSQL nuevos, temporales y locales con fixtures ficticios; no cargan `.env`.

## 1. Cookies admin

**Causa y reproducción:** `createServerClient` heredaba las opciones del SDK sin establecer HttpOnly/Secure. Las verificaciones sobre los encabezados de login y logout mostraban la ausencia de esos atributos antes del cambio.

**Solución:** opciones centralizadas en `supabaseAuthServer.js`: `httpOnly: true`, `secure: true` en producción o HTTPS, `sameSite: 'lax'`, `path: '/'`. El SDK conserva fragmentación, expiración, renovación y eliminación. La aplicación autentica en servidor y no usa un cliente Supabase de navegador que necesite leer estas cookies; HttpOnly es compatible con este flujo particular.

**Evidencia:** siete tests de Auth verifican login, sesión/refresh con el SDK SSR real y transporte simulado, logout, HTTP local, credenciales inválidas, allowlist y acceso válido. Dos pruebas adicionales cubren middleware. Chrome real recibió las cookies generadas con configuración productiva: `document.cookie` vacío, cookies enviadas al servidor, atributos correctos, refresh funcional y eliminación al salir. Esto no sustituye un login contra el Supabase remoto ni una prueba HTTPS en Vercel.

## 2. Concurrencia de invitados

**Reproducción:** dos ejecuciones simultáneas del endpoint original, conectadas al PostgreSQL temporal mediante un adaptador de prueba, pasaban el SELECT previo e insertaban dos invitados cuando correspondía uno.

**Causa:** separación entre lectura e inserción, sin transacción ni bloqueo compartido.

**Solución:** RPC `save_registration_guests`, transaccional y con `FOR UPDATE` sobre registration. Revalida estado, estructura, nombres y cantidades por edad bajo el bloqueo. El primer grupo se guarda completo; un reintento idéntico, incluso reordenado, es idempotente; un grupo diferente devuelve conflicto. Se conserva la semántica de guardar una vez: no hay reemplazo implícito ni borrado. Se permiten personas con nombres idénticos.

**Evidencia:** el mismo test concurrente ahora deja exactamente un grupo. También pasan guardado simple, reintento, conflicto, reordenamiento, homónimos, entradas inválidas, estado no permitido y rollback completo ante error. La garantía se aplica al flujo de escritura por RPC; un operador con privilegios de servicio que inserte directamente puede eludirla. El endpoint ya no hace INSERT directo.

## 3. Segundo intento Mercado Pago

**Reproducción:** con las funciones históricas, rejected/ID 1001 seguido por approved/ID 1002 devolvía `different_payment_id` y dejaba el registro rechazado. La preparación de checkout también impedía reutilizar la preferencia después de registrar un intento.

**Causa:** el primer ID externo quedaba tratado como identidad permanente del único pago contable.

**Solución:** tabla privada `mercadopago_payment_attempts` para conservar cada intento externo, manteniendo una sola fila contable en `payments`. La RPC bloquea registration y payment, valida correlación y actualiza ambos de manera atómica. Un intento aprobado gana; approved es terminal. El checkout permite reutilizar la preferencia tras pending/rejected/cancelled sin reiniciar estados ni borrar evidencias.

El ID externo es único globalmente en el historial y se verifica su pertenencia al payment. Cada intento debe coincidir en preferencia, monto y moneda. Un segundo cobro aprobado después de uno ya contabilizado se conserva con `requires_review = true`; no suma dos veces ni reemplaza el primer `paid_at`. Esa marca requiere conciliación operativa futura: no se agregó interfaz ni devolución automática.

**Evidencia:** pending→approved, rejected/cancelled→segundo approved, duplicados secuenciales y concurrentes, dos aprobaciones diferentes concurrentes, rejected antiguo después de approved, fecha original inmutable, rechazo de monto/moneda/preferencia/registro incorrectos y pago gratuito idempotente. Los índices contables existentes y las consultas de Admin se conservan.

## 4. live_mode

Se exige `payment.live_mode === true` en production y `=== false` en test, usando el Payment consultado al proveedor. Ausencia de campo o ambiente desconocido no se acepta. No se decide por prefijo del token.

Antes, un pago sandbox en production alcanzaba la RPC. Después pasan cinco casos explícitos: production/sandbox rechazado, production/live aceptado para continuar las validaciones, test/sandbox aceptado, test/live rechazado y campo ausente rechazado. En los casos rechazados no se aplica SQL.

## 5. Webhook

Se mantienen validación de `x-signature`, `x-request-id`, `data.id` y firma con el SDK; consulta `Payment.get` autenticada; comparación del ID remoto; normalización de estado y validación estricta del ambiente. La RPC verifica registration, método, external_reference, coherencia de estados, preferencia, monto y ARS.

Si Payment no incluye preference_id, se consulta la merchant order autenticada y se comprueban ID de orden, external_reference, pertenencia del pago y preferencia. Una orden incompleta o una indisponibilidad temporal devuelve 503 para permitir reintento, sin aplicar el pago. No se acepta una preferencia tomada del body del webhook. Una aprobación sin fecha del proveedor no inventa `paid_at`.

Firmas inválidas se rechazan antes de consultar al proveedor. Los errores de proveedor y SQL se traducen a respuestas genéricas. Redirect y body del navegador no pueden aprobar un pago. Las aprobaciones repetidas y notificaciones antiguas no duplican importes ni degradan approved. Los tests del webhook simulan respuestas del proveedor; no contactan Mercado Pago.

## 6. SQL entregado para auditoría

Aplicar en este orden, únicamente después de revisión y autorización para la fase remota:

1. [20260929000000_atomic_guest_registration.sql](../supabase/migrations/20260929000000_atomic_guest_registration.sql): RPC atómica de invitados, sin modificar invitados existentes.
2. [20260929000100_mercadopago_payment_attempts.sql](../supabase/migrations/20260929000100_mercadopago_payment_attempts.sql): historial privado, backfill de pagos con ID externo, reemplazo de apply/prepare RPC conservando firmas e índices contables.

**NO aplicadas remotamente.** Funciones `SECURITY INVOKER`, `search_path = ''`, referencias de esquema explícitas y EXECUTE sólo para service_role. Historial con RLS habilitado, sin políticas públicas; revocados public/anon/authenticated; service_role sólo SELECT/INSERT/UPDATE sobre esa tabla. Revisar también los grants de tablas existentes en el proyecto remoto.

La prueba de actualización parte de las migraciones históricas con pagos rechazados, aprobados y gratuitos; aplica las dos nuevas dentro de transacciones y verifica preservación exacta de los payments existentes, backfill y procesamiento posterior. Datos históricos inconsistentes fallan las constraints: no se inventan fechas ni se descartan filas. Antes de aplicar remotamente, revisar especialmente IDs, preferencias, ARS, montos y paid_at existentes. Ejecutar cada migración transaccionalmente.

Rollback conceptual documentado en SQL: detener escrituras afectadas, restaurar funciones anteriores y conservar/exportar el historial. Volver al modelo anterior después de múltiples intentos requiere conciliación; no es un DROP automático ni una reversión sin pérdida funcional. Para invitados, conservar los grupos ya guardados y coordinar restauración del endpoint con retirada de la RPC. El código nuevo depende de estas migraciones: no desplegarlo primero.

## 7. Dependencias

`npm audit --json` antes: **7 paquetes afectados: 1 critical, 5 high, 1 low**. Después de `npm install`: **4 paquetes afectados: 1 critical, 1 high, 1 moderate, 1 low**. El exit code 1 de audit representa alertas pendientes, no una instalación fallida. Son recuentos de paquetes, no de advisories únicos.

Cambios acotados mediante overrides por dependencia padre:

| Paquete | Relación y uso | Antes → después | Clasificación |
| --- | --- | --- | --- |
| path-to-regexp | Transitiva de @vercel/routing-utils; rutas del adaptador | 6.1.0 → 6.3.0 | A: minor compatible, elimina ReDoS |
| undici | Transitiva de unifont; solicitudes de fuentes/build | 8.10.0 → 8.10.2 | A: patch compatible con Node 22.23.2 |

No se ejecutó audit fix --force ni se cambiaron majors. El lockfile cambió sólo esas dos versiones y sus metadatos. Build y suites completas pasaron después de instalar.

Clasificación por advisory: A = fix compatible aplicado; B = requiere major del paquete directo; C = transitiva sin actualización segura dentro del rango actual; D = condición de explotación no presente en el código/configuración inspeccionados. D describe alcance observado, no elimina una alerta ni garantiza el entorno remoto.

| Paquete actual / advisory | Versión corregida mínima | Clase y alcance observado |
| --- | --- | --- |
| astro 6.4.8 — GHSA-f48w-9m4c-m7f5 | 7.0.6 | B/D: no se encontraron nombres de atributos spread controlados por usuario |
| astro 6.4.8 — GHSA-7pw4-f3q4-r2p2 | 7.0.4 | B/D: no se usan directivas transition con datos no confiables en islas hidratadas |
| astro 6.4.8 — GHSA-4g3v-8h47-v7g6 | 7.0.10 | B/D: no se usa View Transitions |
| astro 6.4.8 — GHSA-26w7-cxv4-gfx2 | 7.2.8 | B: RCE AVIF crítico; se inspeccionaron imágenes JPEG locales, sin uploads ni allowlist de imágenes remotas. Explotación no demostrada; pendiente revisar optimizador desplegado |
| astro 6.4.8 — GHSA-376h-93r7-7g6f | 7.2.4 | B/D: no hay base personalizada configurada |
| @astrojs/vercel 10.0.8 — GHSA-x27w-589x-frm2 | 11.0.3 | B/D: ISR no habilitado en la configuración actual |
| esbuild 0.27.7 — GHSA-g7r4-m6w7-qqqr | 0.28.1 | C: servidor de desarrollo Windows; no es el servidor productivo. Fuera del rango 0.27.x del árbol actual |
| sharp 0.34.5 — GHSA-f88m-g3jw-g9cj | 0.35.0 | C: libvips, procesamiento de imágenes; fuera del rango ^0.34 de Astro |
| sharp 0.34.5 — GHSA-rgj7-g3m4-5g8c | 0.35.4 | C: libheif; mismo límite de rango y revisión de alcance que el procesamiento AVIF |
| path-to-regexp — GHSA-9wv6-86v2-598j | 6.3.0 | A: corregido |

Undici: los siguientes once advisories del audit inicial quedan corregidos con 8.10.2 (A): `GHSA-3wwx-pv8p-q78v`, `GHSA-pmjh-fq2x-6v4x`, `GHSA-r53p-7pc4-xj5r`, `GHSA-rfgv-xxqx-mfg5`, `GHSA-3xpg-4rpp-hhhm`, `GHSA-2jfj-6hjv-fm6j`, `GHSA-2gqq-gqf2-x968`, `GHSA-w293-vg96-wgc3`, `GHSA-8436-99hf-9mmv`, `GHSA-vp8m-p9jh-q5pm`, `GHSA-rx4f-c7p8-82vq`. El proyecto no usa directamente sus interceptores de caché ni WebSockets; se actualizó igualmente. @vercel/routing-utils aparecía afectado por dependencia y desapareció del audit tras corregir path-to-regexp.

Astro es dependencia directa declarada en devDependencies, pero genera/participa del SSR: esa etiqueta no permite descartar impacto productivo. @astrojs/vercel es directa, build/adaptador servidor. Sharp es transitiva opcional, usada por imágenes en build/SSR. Esbuild es transitiva de tooling/build. No se forzaron cambios 0.x fuera de rangos compatibles: pueden ser incompatibles aunque se denominen minor.

El registro consultado no ofrecía un backport posterior a Astro 6.4.8 o Vercel 10.0.8. Audit propone Astro 7.3.5 y @astrojs/vercel 11.0.11: requieren otra fase explícita de actualización y QA. Las cuatro alertas restantes NO se consideran resueltas.

## 8. Regresión

**89 tests PASS, 0 FAIL, 0 omitidos:** `npm test` 88/88 y `npm run test:browser` 1/1.

Desglose de npm test: Auth 7, SQL/endpoint 32, actualización de migraciones 1, validadores/middleware 28, webhook 20. PostgreSQL 16.9 real para transacciones, bloqueos, carreras y backfill; SDK Supabase SSR real con transporte ficticio para cookies; Chrome real para aislamiento de cookies. Prerrequisitos y límites en [tests/README.md](../tests/README.md).

Los fallos iniciales de fixtures (token de refresh idéntico y formato horario) se corrigieron en el harness; no se contabilizaron como defectos del producto. Se reprodujeron por separado las cuatro causas funcionales descritas arriba.

## 9. Build

**PASS**, comando normal `npm run build` con Node 22.23.2/npm 10.9.8, salida 0 y adaptador Vercel generado. El NVM4306 inicial de la terminal restringida persistió tras un reintento limpio; se ejecutó npm con el permiso de entorno correspondiente. No se alteró `build: astro build` ni se reemplazó por una invocación interna.

## 10. Diff

`git diff --check`: **PASS**, sin errores de whitespace; advertencias de normalización LF/CRLF del checkout Windows no son fallos. Migraciones históricas y UX sin cambios.

## 11. Archivos

Modificados: `package.json`, `package-lock.json`, `src/lib/supabaseAuthServer.js`, `src/lib/mercadopago.js`, `src/lib/mercadopagoWebhook.js`, `src/pages/api/registrations/[id]/guests.js`, `src/pages/api/webhooks/mercadopago.js`.

Nuevos: las dos migraciones de la sección 6, este informe, `tests/README.md`, `tests/auth.test.mjs`, `tests/database.test.mjs`, `tests/migrations.test.mjs`, `tests/regression.test.mjs`, `tests/webhook.test.mjs`, `tests/browser/cookies.test.mjs`, `tests/helpers/modules.mjs`, `tests/helpers/postgres.mjs`. El informe de auditoría previo ya era un archivo sin seguimiento; no fue creado ni alterado en esta fase.

## 12–14. Límites respetados

- DB remota: **NO MODIFICADA**.
- Mercado Pago: **NO PAGO REAL**.
- Git: **NO COMMIT / NO PUSH**, sin staging.
- Vercel: sin modificación ni deploy. Secretos sin cambios ni exposición deliberada en resultados.

## 15. Próximas acciones humanas

1. Auditar diff y SQL, revisar datos existentes y resolver el plan de actualización de Astro/adaptador/Sharp antes de aprobar producción.
2. Autorizar una fase remota: backup, revisión/aplicación transaccional de migraciones en orden y verificación de RLS/grants reales. No copiar pruebas con fixtures a producción.
3. Comprobar Vercel Production Environment sin mostrar valores secretos; ambiente MP production, secreto de webhook presente y PUBLIC_SITE_URL `https://invitacion-boda-syr.vercel.app`.
4. Confirmar webhook productivo `/api/webhooks/mercadopago`, evento configurado Pagos (legacy), comportamiento de firma y estructura efectiva de Payment/merchant order. La configuración informada por el usuario no fue modificada en esta fase.
5. Autorizar deploy y comprobar login admin real, allowlist, cookies HTTPS, refresh/logout y smoke de APIs/RSVP/Admin con las migraciones aplicadas.
6. Sólo después de esos controles, solicitar autorización para una prueba controlada de pago real y conciliación, incluidos reintentos. Si en esa fase únicamente resta el pago: `USER ACTION REQUIRED — REAL PAYMENT TEST`.

Trabajo detenido para auditoría. Actualmente todavía faltan controles anteriores al pago real.

## Referencias consultadas

- [Supabase SSR: gestión avanzada de cookies y sesiones](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- [PostgreSQL 16: bloqueos explícitos](https://www.postgresql.org/docs/16/explicit-locking.html).
- [Mercado Pago: Webhooks](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
- [Astro: advisory AVIF](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2).
- [Astro/Vercel: advisory ISR](https://github.com/withastro/astro/security/advisories/GHSA-x27w-589x-frm2).
- Los demás IDs GHSA se corresponden con las entradas de `npm audit --json` consultadas en esta fase; se pueden consultar en `https://github.com/advisories/<ID>`.
