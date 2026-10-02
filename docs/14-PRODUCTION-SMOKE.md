# SPRINT 14 — PRODUCTION SMOKE

Estado final: **READY TO SEND INVITATION**.

Pendiente no bloqueante: **CONTROLLED REAL PAYMENT END-TO-END**.

Limitación: **Historical Vercel runtime log review unavailable on current Hobby plan.**
Limitación informada por el usuario y aceptada para este cierre; no se realizó upgrade de pago ni se consideró la revisión de logs como ejecutada.

Fecha: 2026-10-01 (America/Buenos_Aires).
Dominio: https://invitacion-boda-syr.vercel.app.
Deployment Ready de main / 563af255f188dcf31959b02da330e145e87de5c6 aceptado por confirmación manual del usuario. No se verificó deployment con curl, Vercel CLI ni autenticación externa.

## Evidencia funcional

Smoke ejecutado con Chrome headless aislado sobre HTTPS productivo. Las operaciones RSVP/invitados/pago se ejercitaron mediante fetch del navegador con cookies reales; no equivalen a completar manualmente cada formulario. Evidencia sanitizada en 14-PRODUCTION-SMOKE-EVIDENCE.json; sin valores de cookies, tokens ni secretos.

| Comprobación | Resultado |
| --- | --- |
| Invitación pública | PASS: título, h1 y enlace a /confirmar presentes. |
| Assets de imágenes | PASS: las 46 imágenes del DOM decodificaron correctamente. No se realizó auditoría exhaustiva de todos los assets. |
| RSVP | PASS: /confirmar 200; dos creaciones 201, un adulto cada una. |
| Management token | PASS: lectura propia 200 y página privada accesible con cookie. |
| UUID solo | PASS: lectura, invitados, cash y checkout 403 en ambos registros; página privada redirige a /confirmar. |
| Persistencia invitados | PASS funcional: guardado 201, reintento idéntico 200, contenido distinto 409. No se hizo lectura directa de DB. |
| Cash pending | PASS: paymentStatus=pending, attendanceStatus=confirmed, nextStep=cash-pending; página de efectivo 200. |
| Checkout Mercado Pago | PASS manual: misma preference abierta en Chrome normal a las 22:53; dominio productivo, ARS 35.000, concepto Contribución Boda Ricardo y Sabrina, sin sandbox/test ni error. No se ingresaron nuevos datos de pago ni se pagó. El 403 anterior se clasifica como limitación del entorno automatizado/headless. |
| Webhook inválido | PASS HTTP y estado DB observado: firma ausente/inválida 401; evento desconocido 200 con processed=false; cero mercadopago_payment_attempts y pagos smoke pending sin cambios posteriores. No se observaron escrituras DB inesperadas. El código valida firma antes de consultar proveedor/DB; sin traza histórica que certifique ausencia de invocaciones a la RPC. |
| Admin producción | PASS manual: el usuario confirmó login real/dashboard, sesión conservada al recargar, logout y retorno al login al volver a /admin. Allowlist aplicada funcionalmente por login exitoso; lectura remota confirma una entrada, sin publicar identidad. |
| Cookies RSVP HTTPS | PASS: HttpOnly, Secure, SameSite=Lax, Path=/, invisibles a document.cookie. Cookies enviadas a API y SSR. Auth: atributos confirmados manualmente por usuario, con sesión conservada al recargar; no se midió rotación del token al expirar. |
| Privacidad HTTP | PASS en rutas RSVP examinadas: private, no-store y no-referrer. |
| Legacy QA | PASS de lectura remota: 12 registros con management_token_hash NULL, creados antes del smoke; cero actualizaciones posteriores al inicio del smoke en sus registros, invitados y pagos según updated_at. Cuatro contadores de integridad revisados dan cero. No se editaron ni borraron QA; sin snapshot previo individual para comparación completa. |
| Runtime logs | LIMITACIÓN ACEPTADA, NO BLOQUEANTE: Historical Vercel runtime log review unavailable on current Hobby plan. Informado por el usuario; sin upgrade de pago. Cero excepciones del navegador no sustituye logs del servidor. |

## Registros de smoke preservados

- Cash: 8b5172e3-3dd3-4b45-86c9-1486b8d4093c. Invitado sintético SmokeProduction cash.
- Mercado Pago: 10853c60-4b91-4a0b-b717-81953109c7ca. Invitado sintético SmokeProduction mercadopago.

Se conservaron ambos registros y sus invitados/pagos pendientes. El navegador utilizó perfil temporal independiente, sin cuentas personales. No se borró QA ni se ejecutó limpieza de DB.

## Cierre y pendiente no bloqueante

La confirmación manual cierra checkout productivo, monto ARS 35.000 sin sandbox, admin real, refresh por recarga, logout y cookies. La lectura remota confirma los 12 QA legacy y sus controles de integridad examinados; los 12 UUID legacy fueron rechazados públicamente. Cero mercadopago_payment_attempts, pagos smoke pending y sin cambios posteriores al smoke ni escrituras DB inesperadas observadas. El usuario acepta esta evidencia disponible como suficiente para **READY TO SEND INVITATION**.

Queda **CONTROLLED REAL PAYMENT END-TO-END** como pendiente no bloqueante para enviar la invitación. No fue ejecutado ni queda autorizado por este cierre. La configuración global de notificaciones y la comprobación del pago aprobado/webhook/persistencia corresponden a esa validación posterior. La revisión histórica de logs permanece no disponible según la limitación informada del plan Hobby; no se exige upgrade ni se inventa evidencia de logs o trazas de ejecución.

No pago real. No db push. No modificación ENV. No commit/push. No borrado QA. Sin cambios de código de aplicación.

## Continuación del smoke — 2026-10-01

Registro histórico: los estados BLOCKED y solicitudes de acción de esta sección y las siguientes quedan reemplazados por el cierre final al inicio y al final de este documento.

La confirmación manual del deployment Ready de main / 563af255f188dcf31959b02da330e145e87de5c6 se mantiene como condición cumplida. No se volvió a verificar el deployment con curl, Vercel CLI ni autenticación externa.

Se repitieron las comprobaciones disponibles con Chrome headless y un nuevo perfil aislado. Evidencia sanitizada en 14-PRODUCTION-SMOKE-FOLLOWUP-EVIDENCE.json: invitación pública correcta; 46 imágenes decodificadas; /confirmar 200; /admin redirige a /admin/login; login público 200; lectura de los dos UUID preservados sin cookie rechazada con 403; webhook sin firma e inválido 401; evento desconocido 200 con processed=false; cero excepciones del navegador. Esta repetición no creó registros ni preferencias y no confirma ausencia de escrituras en DB mediante logs.

Para reabrir el checkout existente se inspeccionaron en modo de solo lectura el historial y los metadatos de cookies de los dos perfiles temporales aislados del smoke anterior. No contenían la URL del checkout ni cookies del dominio. La evidencia original conserva únicamente origen y ruta de checkout, sin referencia de preferencia. No fue posible reabrir esa preferencia con la evidencia disponible; no se reconstruyó el token ni se creó otro RSVP. El error previo de Mercado Pago sigue pendiente de diagnóstico.

No se recibió nueva evidencia remota de admin autenticado, allowlist, refresh, logout, cookies Auth, integridad de los 12 QA legacy o runtime logs. Estado final: **BLOCKED**. No habilita un pago real controlado.

## Resolución del blocker — 2026-10-01

Esta sección actualiza el estado de las continuaciones anteriores. El diagnóstico consultó únicamente mediante GET el registro/pago smoke existente en Supabase y su preference en Mercado Pago. No invocó prepare_mercadopago_checkout ni Preference.create. Evidencia sanitizada: [preference](14-PRODUCTION-MP-PREFERENCE-EVIDENCE.json) y [apertura](14-PRODUCTION-MP-CHECKOUT-EVIDENCE.json). Las consultas comenzaron aproximadamente a las 22:36 de America/Buenos_Aires; los archivos conservan timestamps UTC precisos.

1. **Mercado Pago preference.** Inscripción `10853c60…c7ca`, preference `55780589…9ee5`, external_reference `10853c60…c7ca`. GET de Supabase y GET de preference respondieron 200. La preference recuperada coincide con la almacenada; external_reference coincide con la inscripción. Un ítem, cantidad 1, ARS 35.000; el monto coincide con total_amount. expires=false, sin fechas de expiración. Esto permite reutilizarla; no acredita apertura funcional ni habilitación de la cuenta para cobrar.

2. **init_point production.** Host `www.mercadopago.com.ar`, ruta `/checkout/v1/redirect`, HTTPS, con parámetro pref_id presente. Existe sandbox_init_point en `sandbox.mercadopago.com.ar`, misma ruta, pero no se abrió. El código del commit aceptado selecciona init_point cuando MERCADOPAGO_ENVIRONMENT=production. La configuración local leída indica production; la respuesta original del runtime tenía el host productivo, coherente con esa rama. El valor efectivo de ENV y la identidad/tipo de credencial productiva del runtime de Vercel no fueron observados directamente; no se certifica ausencia de mezcla de credenciales basándose sólo en el archivo local. La credencial local pudo leer esta misma preference, sin exponerse.

   Los tres back_urls recuperados usan HTTPS y `invitacion-boda-syr.vercel.app`, con rutas /pago/exitoso, /pago/pendiente y /pago/error. auto_return=approved fue aceptado por el proveedor. El código exige preference_id no vacío, external_reference correspondiente, ARS, cantidad 1 y monto coincidente antes de responder 200. No se preservó la respuesta completa de la creación original; esta validación combina revisión de código y recuperación actual de la misma preference.

   **notification_url está vacío en la preference recuperada y no se envía en Preference.create.** No se puede marcar como URL productiva confirmada. Mercado Pago permite configurar Webhooks en Tus integraciones o durante la creación de preferencias; debe verificarse en modo productivo la configuración global existente, evento Pagos y destino `https://invitacion-boda-syr.vercel.app/api/webhooks/mercadopago`, sin guardar cambios ni regenerar secretos. [Documentación oficial de notificaciones](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/payment-notifications). No se atribuye el 403 a esta ausencia sin evidencia.

3. **Resultado al abrir checkout.** La URL completa recuperada se abrió una sola vez en un nuevo perfil Chrome headless aislado. HTTP 403, content-type=text/html, server=CloudFront. No se observaron redirects de documento. Mensaje visible exacto: “Hubo un error accediendo a esta pagina...”. Documento completo; cero excepciones del navegador. No se ingresó tarjeta ni se inició o confirmó pago. El importe aún no pudo comprobarse visualmente en Checkout Pro.

4. **Causa probable basada en evidencia.** La hipótesis principal es una denegación de acceso a la página de checkout en la infraestructura del proveedor, por el 403/CloudFront y la recuperación API 200 de una preference coherente. No distingue restricciones headless, red/IP, cuenta/aplicación, bloqueo del navegador o problema externo del proveedor. No hay evidencia suficiente para afirmar A–H como causa definitiva. Tampoco se demostró preference inválida, init_point incorrecta o mezcla test/production. Se detuvieron los intentos automatizados y no se intentó evadir el bloqueo.

5. **Acción manual requerida.** Abrir en un navegador normal el archivo local temporal `C:/Users/Ricardo/AppData/Local/Temp/wedding-existing-checkout-manual.html` y seguir su enlace a la MISMA init_point. Contiene sólo el enlace recuperado y las instrucciones; no cookies, tokens de acceso ni management token. No se publica la query de preference en esta evidencia. PASS requiere Checkout Pro cargado, preference reconocida, ARS 35.000 visible, sin sandbox/test y sin error de preference. Cerrar ahí; informar mensaje visible y hora aproximada. No ingresar tarjeta, iniciar ni confirmar pago. Si también falla manualmente, conservar status/redirecciones y consultar la configuración/cuenta del proveedor sin crear otra preference.

6. **Admin status.** Protección sin sesión y login público tienen evidencia PASS. La revisión de código confirma consulta a admin_users y cookies Auth HttpOnly/Secure/SameSite=Lax/Path=/. No sustituye prueba real de login, allowlist, dashboard, refresh, logout y acceso posterior. Después de resolver MP, el usuario debe ingresar su contraseña manualmente en el navegador productivo; nunca pegarla en el chat. No se realizó login ni se aprobó pago.

7. **Legacy QA status.** Pendiente de lectura remota actual de las 12 registrations con management_token_hash NULL y comparación contra baseline para demostrar que no cambiaron. Las lecturas DB de esta intervención se limitaron a la inscripción/pago MP smoke; no se consultaron ni modificaron QA. La evidencia histórica y los tests locales no sustituyen esa verificación. La matriz de UUID del smoke cubre registros nuevos, no los 12 legacy remotos.

8. **Webhook/log status.** Se conserva PASS HTTP de firma ausente/inválida 401 y evento desconocido 200/processed=false. Código revisado valida firma antes de consultar proveedor/DB. La lectura actual del pago MP muestra pending, sin provider_payment_id ni paid_at, y updated_at original del smoke. Es evidencia de que esa fila no fue actualizada posteriormente, pero no demuestra por sí sola ausencia de llamadas a apply_mercadopago_payment_result, intentos inesperados o cambios en otras filas. No se consultaron payment attempts ni logs Vercel; falta correlacionar las ventanas UTC de ambos smokes con logs y contadores. No se enviaron webhooks nuevos en esta intervención.

9. **Datos creados/modificados.** Cero registrations, preferences o pagos creados por esta intervención; cero escrituras a DB. Sólo se actualizaron este informe y dos evidencias JSON sanitizadas, y se crearon herramientas/ayuda temporal local fuera del repositorio. Sin cambios de aplicación, ENV, secretos, payment status, commit/push/deploy ni borrado QA. La navegación no realizó operaciones de pago.

10. **Riesgos restantes.** Apertura manual pendiente; credencial y ENV efectivos del runtime aún no certificados directamente; configuración global del webhook pendiente por notification_url vacío; admin autenticado, integridad legacy y logs/ausencia de procesamiento pendientes. Una apertura manual satisfactoria no cierra por sí sola estos controles ni habilita pago real.

Estado: **BLOCKED — MANUAL MP CHECK REQUIRED**. No pago real. Se detiene aquí conforme a la instrucción de realizar una comprobación manual si el entorno automatizado parece intervenir.

## Confirmación manual y controles restantes — 2026-10-01

Esta sección reemplaza los estados históricos anteriores; conserva sus evidencias y límites.

- **Checkout PASS manual.** El usuario abrió en Chrome normal la MISMA preference existente a las 22:53 (America/Buenos_Aires): dominio productivo, ARS 35.000, concepto Contribución Boda Ricardo y Sabrina, sin sandbox/test ni error de preference. No pagó ni ingresó nuevos datos de pago. Por instrucción expresa y evidencia manual, el 403 anterior se clasifica como limitación del entorno automatizado/headless, no como falla funcional de la integración. No se volvió a abrir ni crear checkout.
- **Admin PASS manual.** A la solicitud de comprobar login/dashboard, recarga, cookies HttpOnly/Secure/SameSite=Lax/Path=/, logout y regreso al login al volver a /admin, el usuario respondió “si paso todas las pruebas”. Se acepta como confirmación manual; no se capturó independientemente la sesión ni se solicitaron credenciales. El login exitoso evidencia la autorización por allowlist porque el código exige admin_users tanto en login como en dashboard; GET remoto confirmó una entrada sin publicar user_id. La recarga conservó sesión; no se midió por separado una renovación forzada al expirar el token. Evidencia: [confirmaciones manuales](14-PRODUCTION-MANUAL-EVIDENCE.json).
- **Legacy QA PASS en los controles examinados.** GET remoto 200 de registrations, guests y payments: 12 registrations con management_token_hash NULL, todas creadas antes del smoke. Cero actualizaciones durante o después del inicio del smoke en registros legacy, sus 7 invitados y sus 5 pagos según updated_at. No hay snapshot individual previo para demostrar igualdad completa de cada campo; los timestamps son evidencia, no auditoría histórica absoluta. Contadores revisados: pagos huérfanos=0, grupos contables duplicados=0, grupos de invitados inconsistentes=0, correlaciones MP inválidas=0. No equivalen a ejecutar todas las consultas SQL del paquete de integridad. Evidencia: [lectura remota](14-PRODUCTION-INTEGRITY-EVIDENCE.json).
- **UUID legacy PASS remoto.** Los 12 UUID conocidos se comprobaron por GET sin cookies: lectura API 403 en los 12; formulario privado redirigido a /confirmar en los 12. No se enviaron POST de edición. Esto prueba denegación de lectura y acceso al formulario; la denegación de escrituras legacy sigue respaldada por el código y las pruebas locales previas. Evidencia: [comprobaciones públicas](14-PRODUCTION-LEGACY-PUBLIC-EVIDENCE.json).
- **Webhook/DB PASS de estado, logs pendientes.** GET remoto de mercadopago_payment_attempts devolvió 200 y cero filas. Ambos pagos smoke siguen pending, sin provider_payment_id ni paid_at; updated_at conserva las fechas del smoke original. No aparecen intentos persistidos ni actualizaciones posteriores en esas filas. Estos resultados, junto con 401 productivos y validación de firma previa a DB, respaldan rechazo sin efecto persistido observado; no demuestran por sí solos que apply_mercadopago_payment_result nunca se invocó ni ausencia de errores/secretos en logs.

Se pidió evidencia sanitizada de Vercel para UTC 2026-10-01 17:36:27–17:36:56 y 2026-10-02 00:22:39–00:23:01 (14:36 y 21:22 respectivamente de America/Buenos_Aires el 2026-10-01). Pendiente confirmar rechazos, ausencia de procesamiento de requests inválidos, ausencia de 500 inesperados relevantes y de secretos en logs. No se accedió a logs Vercel, no se intentó autenticar externamente ni verificar nuevamente deployment.

No se realizaron pagos, nuevas inscriptions/preferences, aprobaciones, escrituras DB, cambios ENV/secretos, deploy, commit/push ni borrado QA. Se hicieron únicamente lecturas remotas, GET públicos, actualización de documentación/evidencias y herramientas temporales locales. No se enviaron nuevos webhooks.

Estado histórico de esta etapa: **BLOCKED — RUNTIME LOG REVIEW REQUIRED**, reemplazado por el cierre final siguiente.

## SPRINT 14 — FINAL CLOSURE

Fecha: 2026-10-01 (America/Buenos_Aires). Cierre por instrucción explícita del usuario, tomando las confirmaciones manuales y evidencias remotas preservadas como evidencia final disponible.

Estado final: **READY TO SEND INVITATION**.

Pendiente no bloqueante: **CONTROLLED REAL PAYMENT END-TO-END**.

Limitación: **Historical Vercel runtime log review unavailable on current Hobby plan.** Informada por el usuario; no se verificó nuevamente la disponibilidad del plan ni se realizó upgrade de pago. La revisión histórica no se declara PASS ni ejecutada. Su ausencia deja de bloquear el envío de la invitación por decisión explícita del usuario.

Se aceptan checkout productivo PASS manual, ARS 35.000 correcto sin sandbox, admin real/refresh/logout/cookies PASS, 12 QA legacy íntegros en los controles examinados, 12 UUID legacy rechazados públicamente, cero mercadopago_payment_attempts, pagos smoke pending y sin cambios posteriores ni escrituras DB inesperadas observadas. Se conservan los límites de evidencia detallados anteriormente: sin auditoría histórica completa ni pago real end-to-end.

Este cierre sólo actualizó documentación. No se realizaron nuevas pruebas remotas, pago real, escrituras DB, cambios ENV/secretos, upgrade, deploy, commit/push ni borrado QA. No pago real todavía.

## CONTROLLED REAL PAYMENT — E2E PREPARATION

Fecha: 2026-10-01 (America/Buenos_Aires). Estado de esta preparación: **CONTROLLED REAL PAYMENT — READY FOR USER PAYMENT**. **No se efectuó pago.** El estado de envío de invitación continúa READY TO SEND INVITATION; el pago real E2E sigue sin ejecutarse.

El usuario confirmó manualmente en esta intervención todas las condiciones previas: deployment Production Ready, branch main, commit 563af255f188dcf31959b02da330e145e87de5c6, MERCADOPAGO_ENVIRONMENT=production, y Webhooks de Mercado Pago en modo productivo con evento Pagos y destino https://invitacion-boda-syr.vercel.app/api/webhooks/mercadopago. No se verificó deployment con curl, Vercel CLI ni autenticación externa. La configuración global se acepta como confirmación manual, sin acceso al secreto.

Preflight remoto de solo lectura: una boda activa, pagos habilitados, price_per_guest=35000; no existía un invitado QA PAGO REAL E2E. Se completaron los formularios productivos reales en Chrome aislado: RSVP con asistencia seleccionada, un adulto y Mercado Pago; invitado con nombre QA y apellido PAGO REAL E2E. Se enviaron los formularios mediante sus handlers normales, sin sustituirlos por fetch manual: un POST RSVP (201), un POST invitados (201) y un POST checkout (200). El formulario de invitados llamó automáticamente al checkout. No hubo reenvíos; la navegación saliente al proveedor se interceptó y detuvo sin abrir Checkout Pro. Esa interceptación local no acredita respuesta HTTP del proveedor ni apertura visual del nuevo checkout.

| Verificación previa al pago | Resultado |
| --- | --- |
| Identificación | QA PAGO REAL E2E; inscripción `ebff321f…9d64` |
| Invitados | Un adulto; cero niños y menores; un invitado persistido |
| Preference | `55780589…b993`; recuperada por GET de Mercado Pago 200; coincide con la referencia almacenada |
| init_point | HTTPS, host www.mercadopago.com.ar, ruta /checkout/v1/redirect, pref_id correspondiente; coincide exactamente con la URL devuelta por el formulario; no se utilizó sandbox_init_point |
| Monto / moneda | 35000 / ARS, cantidad 1; coinciden registro, fila contable e ítem de preference |
| external_reference | `ebff321f…9d64`; coincide con la inscripción |
| registration.payment_status | pending |
| registration.attendance_status | pending |
| accounting payment | Una fila, provider=mercadopago, status=pending |
| Intentos de esta fila contable | Total=0; aprobados=0 |
| Evidencia de cobro | provider_payment_id ausente; paid_at ausente |
| Retornos | Los tres back_urls usan el dominio productivo; auto_return=approved |

Se creó una inscripción nueva, un invitado, una fila contable pendiente y una única preference asociada mediante el flujo normal autorizado. La comprobación posterior usó exclusivamente GET a DB y a Mercado Pago; no creó ni modificó estados. No se alteraron los registros smoke originales ni los 12 QA legacy. No se realizó pago automático, webhook falso, aprobación, modificación manual de estados, cambios ENV/secretos, db push, commit/push ni deploy.

Evidencia sanitizada: [formularios](14-CONTROLLED-PAYMENT-UI-EVIDENCE.json) y [validación previa](14-CONTROLLED-PAYMENT-PREPARATION-EVIDENCE.json). La verificación final fue aproximadamente a las 23:59 (America/Buenos_Aires); el JSON conserva timestamp UTC 2026-10-02T02:59:06.118Z. Las evidencias no contienen tokens, valores de cookies ni query completa del checkout.

Enlace preparado para el usuario en el archivo local temporal `C:/Users/Ricardo/AppData/Local/Temp/wedding-real-e2e-checkout.html`, que apunta a la misma y única init_point sin publicar su referencia completa en este informe. No volver a completar RSVP ni crear otra preference para esta prueba. El navegador aislado se cerró sin iniciar pago.

Warnings: el pago real y la recepción/procesamiento de su webhook aún no fueron ejercitados. notification_url está vacío en la preference; se utiliza la configuración global productiva confirmada manualmente. Continúa la limitación aceptada de logs históricos Vercel Hobby. Si el checkout se abre en otro navegador, el retorno a la invitación puede mostrar contenido genérico por ausencia de su cookie RSVP; la comprobación posterior del resultado deberá realizarse sobre esta misma inscripción y fila contable.

Se detiene aquí, antes de efectuar el pago. Esta intervención únicamente prepara la prueba; no ejecuta el pago del usuario.

## PAY BUTTON DIAGNOSTIC — 2026-10-02

Estado del retest: **BLOCKED — TEST/PRODUCTION MIX**. Reemplaza READY FOR USER PAYMENT de la preparación anterior. [Diagnóstico y límites](14-MP-PAY-BUTTON-DIAGNOSTIC.md), [evidencia GET sanitizada](14-MP-PAY-BUTTON-EVIDENCE.json).

Misma preference e inscripción preservadas. Collector real activo, monto ARS 35000 correcto, sin expiración ni exclusiones efectivas observadas. Primera prueba con comprador Test y tarjeta Test contra vendedor real: estrategia de simulación inválida. Segunda prueba móvil sin causa demostrada; falta medio usado, mensaje e identidad comprador/vendedor. live_mode ausente en GET, no se certifica true. DB continúa pending y cero intentos. Sin cambio de aplicación ni operaciones remotas de escritura. No pago, nueva preference, cambio ENV/secretos, deploy o commit/push. Se requiere auditoría humana antes del retest. El cierre histórico READY TO SEND INVITATION no acredita solución del nuevo incidente.
