# SPRINT 15 — TRANSFER PAYMENT MIGRATION

Fecha: 2026-10-02 (America/Buenos_Aires). Implementación local; sin migración remota, commit/push ni deploy. Estado: **READY FOR REVIEW**. Auditoría humana pendiente; no acredita aprobación ni despliegue productivo.

## Decisión y alcance

Se retira Checkout Pro. Mercado Pago queda únicamente como entidad receptora de transferencia manual y branding local. Configuración central en src/config/wedding.js: payment.transfer.provider='Mercado Pago', alias='ricardo.mpsyr', holder=''. Titular vacío no se muestra. El alias fue indicado por el usuario; no se consultó la cuenta remota para verificar su titularidad.

Efectivo sigue disponible porque el producto/código existente lo ofrece y la solicitud exige preservarlo cuando siga funcional. Sus RPC, endpoint, semántica y pantalla permanecen separados. No se alteraron hero, fotos, galerías ni contenido de la invitación. La selección del método conserva su ubicación actual en /confirmar; después de guardar invitados se muestra nuevamente el total server-side y se abre el modal mediante Transferencia.

## Arquitectura y estados

/confirmar → POST /api/registrations → /confirmar/invitados → POST guests → /pago/transferencia → POST transfer → modal → Sí/No → Finalizar (/).

| Acción | payment_method | payment_reported_at | payment_status | attendance_status |
| --- | --- | --- | --- | --- |
| RSVP + preparación de transferencia | transfer | NULL | pending | pending |
| No | transfer | NULL, sin escritura | pending | pending |
| Sí | transfer | timestamp server-side | pending | pending |
| Reintento de Sí | transfer | conserva primer timestamp | pending | pending |
| Admin verifica recepción | transfer | conserva declaración, incluso NULL | approved | confirmed |

paid_at pertenece a payments y sólo se establece al aprobar por admin. No es el timestamp de declaración. Una transferencia con monto cero también queda pendiente de revisión: no se introduce una excepción de autoaprobación. Si el admin verifica el ingreso sin declaración del invitado puede aprobarlo; la acción exige una fila contable preparada/coherente. Una declaración previa nunca se elimina al responder No en otra sesión.

## Endpoints y RPC

- POST /api/registrations/:id/transfer → prepare_transfer_payment(uuid,text). Prepara una sola fila transfer/pending, devuelve monto, estados y declaración persistidos. Reintento approved devuelve estado verificado sin nuevas escrituras.
- POST /api/registrations/:id/payment-reported → report_transfer_payment(uuid,text). Cuerpo vacío; guarda sólo payment_reported_at. Reintento conserva fecha. Rechaza approved/cancelled, método incorrecto, boda inactiva/ajena, invitados incompletos y contabilidad inconsistente.
- POST /api/admin/registrations/:id/transfer/approve → approve_transfer_payment(uuid). Requiere Supabase Auth + admin_users + mismo origen; valida UUID. Actualiza payment y registration en la misma transacción, paid_at=statement_timestamp(). Idempotente.

Las tres RPC son SECURITY INVOKER, search_path vacío y EXECUTE únicamente service_role. Se mantiene el conjunto previo de grants/RLS. No se conceden nuevos privilegios de tabla. Las RPC usan el mismo lock FOR UPDATE sobre registrations; preparación/aprobación bloquean también su fila payments. El token hash se compara nuevamente dentro del lock. La boda se valida por slug, actividad y pertenencia; preparación exige pagos habilitados. Monto se toma del total persistido/calculado server-side al RSVP, no del navegador. La aprobación compara amount/currency/provider y ausencia de identificadores online; verifica grupo de invitados completo y rechaza proveedores cruzados. Índice parcial único evita duplicados.

## Seguridad

UUID solo y token de otra inscripción no autorizan declaración/preparación. management token continúa en cookie HttpOnly/Secure/SameSite=Lax/Path=/ y su hash permanece privado. Token nunca viaja en URL o JSON. Cuerpo adicional a las acciones transfer/reporting se rechaza, no se permite enviar monto, timestamps o approved. Autorización privada comprueba Origin y Sec-Fetch-Site. Rutas privadas conservan private,no-store y no-referrer. RPC repite token, boda y estado, evitando usar el primer GET como único control.

Admin es la autoridad de verificación manual. Los retornos retirados nunca interpretan status=approved ni modifican DB. El frontend no puede aprobar payment ni attendance. No se desactivó el guard admin ni la allowlist.

## Retiro de Mercado Pago

[Inventario de referencias](15-MP-REFERENCE-AUDIT.json). Categorías: A eliminado; B reemplazado; C legacy histórico; D documentación; E tests.

Eliminados: clientes src/lib/mercadopago.js y mercadopagoWebhook.js, componente PaymentReturn y herramienta GET del diagnóstico Sprint 14. Desinstalado mercadopago 3.5.1; package.json y package-lock.json actualizados. No imports del SDK ni requests al API de Mercado Pago en src. Se conservan referencias de provider/columnas históricas en admin para mostrar datos legacy.

Los endpoints /api/registrations/:id/mercadopago y /api/webhooks/mercadopago responden 410 a todos los métodos, con mensaje fijo y sin DB/API/ENV/autenticación. /pago/exitoso, /pago/pendiente y /pago/error responden 410 y enlace neutro a /confirmar; sin lógica de redirect/pago. Es una retirada explícita para enlaces/notificaciones antiguas, no un webhook funcional.

Logo oficial almacenado en public/images/mercado-pago.svg; [origen del asset](../public/images/SOURCE.md). No se descarga desde el navegador ni es un botón de cobro.

## Migración, compatibilidad y postflight

Nueva migración: supabase/migrations/20261002000000_transfer_payment.sql. Idempotente: ADD COLUMN IF NOT EXISTS, reemplazo de CHECK con mismos valores legacy y nuevo transfer, CREATE INDEX IF NOT EXISTS y CREATE OR REPLACE FUNCTION + ACL explícita. Debe aplicarse en una transacción usando el mecanismo de migraciones revisado, conservando su registro de versión. No se ejecutó remote ni db push.

No realiza UPDATE/DELETE/INSERT de datos existentes. Nuevas registrations tienen payment_reported_at NULL. Constraints siguen admitiendo cash/mercadopago. Tablas, columnas, migraciones, pagos e intentos MP históricos se preservan: **legacy retained for historical compatibility**. RPC legacy conservadas en esquema para compatibilidad histórica/rollback; el runtime nuevo no las llama. No convierte inscripciones MP existentes a transferencia, no vuelve a crear preferencias y no aplica aprobaciones retrospectivas. Inscripciones legacy requieren revisión administrativa separada.

Preparados [baseline](15-TRANSFER-BASELINE-READ-ONLY.sql) y [postflight](15-TRANSFER-POSTFLIGHT-READ-ONLY.sql), SELECT únicamente. Guardar los resultados del baseline antes de aplicar y compararlos inmediatamente después, antes de nuevos RSVP: cuatro digests de registros/invitados/pagos/intentos, conteos legacy y ACL/RLS iguales. Digest de registrations excluye sólo la columna nueva para comparar versiones de esquema, conserva management_token_hash y updated_at. Postflight verifica columna, constraints, índice, RPC/ACL/security invoker, RLS, duplicados e inconsistencias. Nunca comparar un baseline capturado después de la migración como si fuera previo.

## ENV obsoletas

**SAFE TO REMOVE AFTER PRODUCTION VERIFICATION**:

- MERCADOPAGO_ACCESS_TOKEN
- MERCADOPAGO_ENVIRONMENT
- MERCADOPAGO_WEBHOOK_SECRET

No se modificó .env local ni secretos/ENV de Vercel. .env.example ya no solicita estos valores; deja nota de retiro. Se conservan PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY y PUBLIC_SITE_URL. No se necesitan secretos nuevos.

## QA

Validación local: suite final de 175 tests, framework smoke (1), regresión de cookies en navegador (1), y 34 comprobaciones del nuevo flujo en navegador. Los resultados finales se conservan en 15-VALIDATION-EVIDENCE.json. Baseline anterior: 153 = 151 unitarios + 1 framework + 1 navegador; actual: 177 = 175 + 1 + 1. Se reemplazaron pruebas de runtime MP retirado y se ampliaron matrices de seguridad y pruebas PostgreSQL. Suite histórica de DB continúa comprobando compatibilidad de funciones/datos MP legacy; no significa que el webhook siga activo. Los tests obsoletos de firma/checkout runtime se reemplazaron por retiro 410 sin efectos y por seguridad de transferencia/reporting/admin. La matriz de autorización privada mantiene UUID, token inválido/ajeno, boda ajena/inactiva, legacy NULL y CSRF. Se agregaron pruebas de declaración sin aprobación, reintentos y concurrencia, aprobación idempotente sin duplicados, monto cero, inconsistencias, permisos y reaplicación sin cambios históricos.

QA browser usa Astro real con Supabase/Auth sintéticos sobre loopback y PostgreSQL temporal con todas las migraciones. No conecta con producción ni se transfieren fondos. Modal usa dialog nativo showModal (top layer, fondo inerte, fondo inerte y ciclo explícito de foco con Tab/Shift+Tab), aria-labelledby/describedby, retorno de foco, Escape y click fuera; cierre bloqueado mientras guarda. Copia alias por Clipboard API, error controlado si navegador lo deniega. Reabrir después de No permite informar Sí; si ya informó, conserva mensaje persistido. Finalizar sólo vuelve a la invitación.

[QA navegador](15-TRANSFER-BROWSER-EVIDENCE.json): 375/390/768/1024/1440 px, sin overflow, controles de al menos 44 px, Escape/retorno de foco, Tab/Shift+Tab y click fuera PASS. Sí conserva pending/pending después de recarga; admin cambia a approved/confirmed. [Flujo local PostgreSQL](15-TRANSFER-LOCAL-FLOW-EVIDENCE.json): una fila contable, paid_at presente tras aprobación. Los formularios se enviaron mediante requestSubmit y sus handlers normales; la confirmación admin se aceptó programáticamente sólo para datos sintéticos. Clipboard API nativa recibió el alias exacto y resolvió con éxito; su lectura posterior en headless no coincidió, límite registrado en la evidencia. Verificar copia/pegado manual en el smoke productivo. No se transfirió dinero.

[Archivos del cambio](15-FILES-MODIFIED.json), [scan de secretos](15-SECRET-SCAN-EVIDENCE.json). El scan cubre valores configurados conocidos y patrón MP; no constituye una auditoría universal de secretos desconocidos.

## Rollout productivo — preparado, NO ejecutado

1. Auditoría humana de código, migración, evidencias y alias. Suspender nuevos RSVP durante la ventana. Registrar baseline de sólo lectura y snapshot/respaldo administrado; comprobar que no hay transfer legacy inconsistente.
2. Aplicar únicamente la migración Sprint 15 en transacción, por mecanismo revisado y con historial de migraciones correcto. No usar db push como sustituto de auditoría.
3. Ejecutar postflight y comparación baseline antes de nuevos RSVP. Si cambia cualquier fila legacy, ACL/RLS o management hash inesperadamente, detener rollout e investigar.
4. Commit del conjunto aprobado, incluyendo migration/lockfile/tests/docs; preservar evidencias previas y revisar archivos nuevos. Push main sólo con autorización.
5. Esperar deployment Vercel Ready y verificar commit/entorno. Mantener ENV MP durante esta fase para rollback; luego reabrir RSVP.
6. Smoke controlado de transferencia: RSVP, invitados, monto, modal, alias, titular oculto, No pendiente; Sí informado y todavía pending; comprobar cookie/UUID/CSRF, rutas MP 410 y ausencia de llamadas externas.
7. Verificación manual de recepción por admin en un caso autorizado. Confirmar approved/confirmed/paid_at, una sola fila contable y reintento idempotente. No marcarlo aprobado sin recepción verificada.
8. Tras PASS productivo, retirar las tres ENV MP obsoletas de Vercel, con autorización explícita y revisión de deployment resultante si corresponde.
9. Opcional: desactivar destino webhook productivo en Mercado Pago Developers, sin regenerar secretos ni borrar datos. Revisar si quedan cobros/preferencias históricos pendientes antes de desactivarlo: el runtime nuevo responde 410 y ya no procesará aprobaciones tardías; requieren conciliación manual separada.
10. Documentar evidencias de producción y cierre final. El estado local no acredita deploy ni PASS productivo.

## Rollback conceptual

No borrar transfer, payment_reported_at, filas nuevas ni esquema MP histórico. Ante problema, suspender nuevas operaciones y preservar evidencia. Preferir corrección hacia adelante. Revertir app a un deployment anterior requiere plan explícito: ese código no entiende transfer y puede reactivar preferencias/webhook legacy; conservar ENV no autoriza reactivarlo automáticamente. Las approvals/report timestamps creadas se preservan. No existe rollback destructivo de datos automático.

## Revisión de migración productiva — 2026-10-02

[Paquete controlado y auditoría](15-APLICACION-CONTROLADA/README.md). Se corrigió report_transfer_payment antes de congelar el SHA256: exige una fila contable existente y sólo declara, sin preparar pagos. Owner postgres se establece explícitamente para las tres RPC. La revisión se reinició y reemplaza la aprobación de la versión SQL anterior. Las evidencias de suite completa y browser del cierre anterior conservan su alcance histórico; esta revisión añade pruebas específicas de la corrección y del paquete. Ninguna aplicación remota, commit/push/deploy ni modificación de secretos.

## Preparación del deploy — 2026-10-02

El usuario confirmó aplicación remota y postflight PASS de Sprint 15; [confirmación manual](15-PRODUCTION-DB-MANUAL-CONFIRMATION.json). Se acepta como evidencia manual, sin nueva lectura o escritura DB del agente. Esta confirmación reemplaza el pendiente de migración de las secciones históricas. Commit/push de main y deployment automático autorizados para esta intervención. Las ENV MP y configuración Developer se conservan hasta smoke productivo PASS. Se retiraron helpers transitorios de QA local; evidencias y tests permanentes se conservan. El smoke productivo será read-only; no creará RSVP, invitados, pagos ni declaraciones y no aprobará registros. Con cero transfer registradas según postflight, el modal privado y aprobación real requieren una validación controlada posterior expresamente autorizada.
