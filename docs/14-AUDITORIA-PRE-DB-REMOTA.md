# SPRINT 14 — AUDITORÍA PRE-DB REMOTA

> Actualización 2026-09-30: H1 y H2 tienen remediación local; H3 sigue pendiente.
> Consultar [dictamen final](14-REMEDIACION-FINAL-PRE-DB.md). El texto inferior
> documenta el estado anterior a esos cambios y se conserva como evidencia.

Fecha: 2026-09-30. **CORRECTIONS REQUIRED — DO NOT APPLY MIGRATIONS.**

Auditoría del diff contra HEAD, archivos nuevos, migraciones históricas, consumidores y pruebas. No se modificaron código funcional, migraciones, dependencias, secretos ni datos remotos. Se agregaron este informe, consultas read-only y cinco pruebas locales. No commit, push, db push, deploy ni pagos. Los resultados remotos del informe anterior son evidencia histórica; no certifican el estado actual.

## Hallazgos que impiden aprobar

**H1 — Alta: falta de autorización por inscripción y alcance de boda.** `src/pages/api/registrations/[id]/guests.js` acepta UUID y JSON sin sesión/capacidad vinculada al registro; utiliza service_role. `save_registration_guests` bloquea por ID, pero no comprueba titularidad, boda esperada ni boda activa. La FK sólo garantiza que existe una boda. Quien conozca un UUID pendiente sin invitados puede guardar primero un grupo ajeno válido; la protección contra sustitución impedirá luego al titular corregirlo. El GET público por UUID permite obtener cantidades. No se demuestra enumeración de UUID ni fuga de nombres; conocer la referencia es la precondición. Es una limitación previa que la remediación no resuelve, no una regresión introducida por el lock. La nueva prueba reproduce el endpoint sin credenciales sobre otra boda. El requisito explícito de imposibilidad de operar sobre registration ajena NO se cumple. Corregir autorización mediante sesión o capacidad firmada vinculada al registro, y validar el alcance de boda. No basta restringir la RPC a service_role ni confiar en RLS.

**H2 — Media: privilegios del historial no quedan limitados a SELECT/INSERT/UPDATE.** En `20260929000100_mercadopago_payment_attempts.sql` se revoca a PUBLIC/anon/authenticated, pero nunca a service_role antes de otorgar permisos. El helper existente concede ALL mediante default privileges; la prueba adicional confirma que DELETE, TRUNCATE, REFERENCES y TRIGGER sobreviven. El informe de remediación afirma incorrectamente que service_role sólo tiene tres permisos. Antes del GRANT debe revocarse ALL a service_role; comprobar también membresías, owner y ACL efectiva. Esto no demuestra exposición pública: los roles públicos sí quedan revocados en el entorno local. Es una falla de privilegio mínimo y de la afirmación auditada. Además, ON DELETE CASCADE desde payments puede borrar el historial incluso después de retirar DELETE directo; definir retención/RESTRICT si se exige evidencia permanente.

**H3 — Verificación remota pendiente.** No se certificaron catálogo, owner, default privileges, membresías, migraciones aplicadas ni datos actuales. El backfill puede fallar sobre datos permitidos por el esquema anterior. Antes de aprobar, ejecutar y revisar [14-PREFLIGHT-READ-ONLY.sql](14-PREFLIGHT-READ-ONLY.sql), con un rol autorizado a leer el catálogo. Está envuelto en READ ONLY y ROLLBACK; no aplicar las migraciones para averiguarlo. Si faltan columnas o la tabla de historial de migraciones, detenerse y resolver la discrepancia. No modificar datos automáticamente.

## 1. Migración invitados

La función es SECURITY INVOKER y tiene search_path vacío; referencias a tablas calificadas. Cada invocación es parte de una transacción. FOR UPDATE bloquea la inscripción antes de validar e insertar. No captura errores para devolver éxito: un fallo en el INSERT aborta la sentencia y revierte todos sus efectos. Se probó además un trigger que falla dentro de la inserción del segundo invitado, dejando cero filas.

Valida array JSON, objetos, claves permitidas, tipos string, nombres/apellidos de 1–80 caracteres tras btrim, total y conteos adult/child/young_child. Los constraints históricos garantizan NOT NULL, cantidades no negativas y suma de categorías. La longitud SQL cuenta caracteres y btrim elimina espacios; el endpoint hace trim JS y longitud JS, por lo que sus reglas de Unicode/espacios no son idénticas. No se encontró un bypass público por ello.

Compara multiconjuntos ordenados, conserva homónimos y tolera reordenamientos. No sustituye ni borra: grupos iguales devuelven already_saved y distintos guests_conflict. Grupos históricos parciales, nombres con espacios o categorías incoherentes quedan bloqueados para revisión, no reparados. La migración no altera datos existentes ni agrega columnas. Existencia de registration: validada; existencia de wedding: FK; titularidad/boda permitida: H1. payment_method puede ser NULL por esquema histórico y no se valida aquí; el endpoint trataría cualquier valor distinto de cash como Mercado Pago. Revisar registros históricos de ese tipo.

## 2. Migración payment attempts

La tabla es un historial del último estado de cada intento externo, no un log inmutable de cada webhook. PK global provider_payment_id (1–128 dígitos); FK payment_id NOT NULL a payments con CASCADE e índice para búsquedas por pago. registration_id se deriva mediante payments.registration_id: no se duplica en el historial. Los índices históricos garantizan una fila por registration/proveedor y unicidad de preferencia e ID externo en payments.

preference_id obligatorio no vacío; amount numeric(12,2)>0; currency='ARS'; cuatro estados; paid_at presente si y sólo si approved; created_at/updated_at NOT NULL y trigger set_updated_at. La RPC coteja importe exacto con registration y payment, moneda, preferencia, external_reference, método y coherencia de estados. No valida semánticamente la fecha futura ni conserva payload completo. Los IDs son texto; no existe un campo nuevo llamado external_payment_id: provider_payment_id representa ese dato.

Backfill copia sólo payments Mercado Pago con ID externo. No modifica payments, no elimina filas y omite pagos gratuitos sin ID. No reconstruye intentos antiguos que nunca fueron almacenados. Cantidad/moneda/fechas inconsistentes pueden abortar el backfill. La nueva tabla no impone mediante FK compuesta que payment sea Mercado Pago o que su preferencia/importe coincida: esa garantía está en la RPC, y service_role con escrituras directas puede eludirla.

| Escenario | Resultado local |
| --- | --- |
| A. pending → approved | Un pago contable aprobado, asistencia confirmada |
| B. rejected → segundo approved | Ambos intentos conservados; gana approved |
| C. cancelled → segundo approved | Ambos intentos conservados; gana approved |
| D. approved repetido | already_applied; sin duplicar intento, importe ni paid_at |
| E. rejected antiguo tras approved | No degrada agregado ni intento aprobado |
| F. dos approved distintos | Un agregado; segundo intento requires_review=true |
| G. ID de pago de otra registration existente | correlation_mismatch; segunda inscripción sin aprobación |
| H. importe incorrecto | correlation_mismatch, sin aprobación |
| I. moneda incorrecta | invalid_input para moneda distinta de ARS |
| J. preferencia incorrecta | correlation_mismatch, sin aprobación |

F preserva evidencia de dos cobros reales potenciales; no evita que el proveedor cobre dos veces. Impide doble contabilización en el dashboard actual, que suma payments. requires_review exige conciliación; no hay devolución automática ni aviso operativo nuevo.

## 3. Locks/concurrencia

Orden de las rutas auditadas: registration → payment → intento. Guardado y preparación/confirmación de pagos comparten lock de registration. Solicitudes sobre el mismo registro se serializan; sobre registros distintos avanzan independientemente. Una colisión global de provider_payment_id espera la transacción competidora y luego verifica pertenencia. No se encontró ciclo previsible entre estas RPC de una inscripción por llamada. No es garantía contra escrituras administrativas arbitrarias, triggers remotos desconocidos o transacciones que llamen múltiples RPC en orden inverso.

Dos requests de invitados equivalentes no duplican grupos; distintos dejan un ganador completo y un conflicto. No borran datos legítimos, no intercalan los INSERT y no dejan estado parcial. Esto sólo cubre escrituras por la RPC: INSERT/DELETE directos con privilegios de servicio pueden eludirlo. La autorización sigue siendo H1.

## 4. Idempotencia

Approved es terminal por intento y por agregado. El primer aprobado fija ID contable y paid_at; los siguientes no los reemplazan. Un intento pendiente tiene prioridad sobre rechazados/cancelados; entre éstos se usa updated_at e ID. No hay timestamp del evento del proveedor: el historial no garantiza orden cronológico de eventos no aprobados. prepare_checkout reutiliza preferencia sin resetear estados ni borrar intentos. El caso gratuito permanece idempotente sin intento externo. Un checkout posterior a aprobación positiva sigue devolviendo inconsistencia: comportamiento histórico, no regresión del diff.

## 5. Grants/revokes y owner

| Objeto nuevo/reemplazado | Owner | PUBLIC / anon / authenticated | service_role |
| --- | --- | --- | --- |
| save_registration_guests(uuid,jsonb) | Rol creador; postgres local | ALL revocado; EXECUTE denegado localmente | EXECUTE concedido |
| apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz) | Conserva owner existente; postgres local | ALL revocado; EXECUTE denegado localmente | EXECUTE concedido |
| prepare_mercadopago_checkout(uuid) | Conserva owner existente; postgres local | ALL revocado | EXECUTE concedido |
| mercadopago_payment_attempts | Rol creador; postgres local | ALL revocado | SELECT/INSERT/UPDATE explícitos; otros heredados, H2 |
| mercadopago_attempts_payment_idx / trigger | Asociados a tabla; no ACL de acceso independiente | Sin acceso adicional | No conceden acceso adicional |

Ningún OWNER se fija explícitamente en estas migraciones: owner remoto pendiente. CREATE OR REPLACE conserva ACL previas; revokes cubren roles nombrados y PUBLIC, pero no grants anteriores a otros roles o privilegios heredados por membresías. El catálogo debe confirmar también esas rutas. SECURITY INVOKER en las tres RPC, search_path vacío; no escalamiento DEFINER.

set_updated_at() es una función trigger histórica reutilizada, no nueva. No tiene REVOKE en el esquema inicial, por lo que EXECUTE público queda por defecto; no se debe afirmar que todas las funciones públicas están cerradas. No puede invocarse como RPC ordinaria para editar filas: PostgreSQL exige contexto de trigger. Revisar/hardening de ese permiso histórico sin confundirlo con una RPC pública de escritura. Las funciones nuevas/reemplazadas sí revocan el EXECUTE público.

## 6. RLS interaction

Historial con RLS habilitado y sin policies. anon/authenticated no tienen grants locales ni policies. service_role usa BYPASSRLS y necesita además GRANTs de tablas existentes; INVOKER no los aporta. El entorno de prueba los concede por default privileges, que no certifica Supabase remoto. RLS no restringe ownership por inscription en los endpoints con service_role. Tampoco protege TRUNCATE. Véase la semántica aditiva de [GRANT de PostgreSQL](https://www.postgresql.org/docs/16/sql-grant.html).

## 7. Compatibilidad con datos existentes

La cadena histórica más las nuevas migraciones pasa en PostgreSQL local. El test de actualización preserva íntegramente pagos rechazados, aprobados y gratuitos, carga dos intentos y admite un segundo pago. No se agregan columnas a tablas antiguas ni se alteran constraints existentes. Los nuevos nombres de tabla/función/índice deben estar libres: CREATE sin IF NOT EXISTS falla si hubo aplicación parcial/manual. Esto evita ocultar drift, pero requiere preflight.

El esquema anterior permite provider_preference_id NULL con ID externo, importe cero, moneda distinta de ARS, ID no numérico y combinaciones estado/paid_at que el backfill rechaza. No asumir que los datos existentes son válidos por tener constraints antiguos. La prueba con fixtures válidos no cubre el remoto.

Aplicación obligatoriamente transaccional por migración: los archivos no contienen BEGIN/COMMIT propios. El harness sí los envuelve. Si un operador los pega en un cliente con autocommit por sentencia, un fallo de backfill podría dejar DDL parcial. Verificar el runner antes de autorizar. Ejecutar sin tráfico incompatible: esquema antes del nuevo endpoint, pero evitar una ventana con el endpoint antiguo que inserta invitados sin RPC. Preparar despliegue coordinado o pausa de esas escrituras para no mezclar ambos protocolos de locking.

El SQL read-only adjunto enumera esquema, constraints, índices, triggers, cuerpos de funciones, propietarios, permisos/default privileges/membresías/RLS y conteos de incompatibilidades. Resultados esperados: historia coincidente, objetos nuevos ausentes, índices válidos, cero incompatibilidades. Repetir cerca de la ventana autorizada: una lectura no congela futuras escrituras.

## 8. Diff completo

git diff HEAD contiene siete archivos rastreados modificados; los nuevos también se leyeron porque no aparecen en ese diff. No se encontraron cambios UX ajenos, logs de depuración, console.log, TODO/FIXME peligrosos, tokens reales hardcoded ni bypasses temporales en los archivos auditados. Los secretos de tests son sintéticos. Escaneo por patrones y revisión manual, no garantía formal de ausencia de secretos. No se leyó ni editó .env.

| Archivo | Clasificación |
| --- | --- |
| package.json | dependency/test/docs: scripts de tests y overrides acotados |
| package-lock.json | dependency/test/docs: sólo path-to-regexp 6.1.0→6.3.0 y undici 8.10.0→8.10.2 y metadatos |
| src/lib/mercadopago.js | Mercado Pago fix: cliente MerchantOrder |
| src/lib/mercadopagoWebhook.js | Mercado Pago fix / security fix: live_mode y fecha aprobada |
| src/lib/supabaseAuthServer.js | security fix: cookies |
| src/pages/api/registrations/[id]/guests.js | concurrency fix: sustituye INSERT por RPC |
| src/pages/api/webhooks/mercadopago.js | Mercado Pago fix / security fix: ambiente y correlación de orden |
| supabase/migrations/20260929000000_atomic_guest_registration.sql | concurrency fix / security fix |
| supabase/migrations/20260929000100_mercadopago_payment_attempts.sql | Mercado Pago fix / concurrency fix |
| docs/14-AUDITORIA-PRE-PRODUCCION.md | dependency/test/docs; evidencia histórica |
| docs/14-REMEDIACION-SEGURIDAD.md | dependency/test/docs; corregir afirmación de grants y recuento vigente de audit |
| tests/auth.test.mjs | dependency/test/docs: Auth/cookies |
| tests/database.test.mjs | dependency/test/docs: SQL y concurrencia |
| tests/migrations.test.mjs | dependency/test/docs: backfill |
| tests/regression.test.mjs | dependency/test/docs: validación/middleware |
| tests/webhook.test.mjs | dependency/test/docs: proveedor simulado |
| tests/browser/cookies.test.mjs | dependency/test/docs: Chrome y SSR SDK |
| tests/helpers/modules.mjs | dependency/test/docs: módulos con dependencias ficticias |
| tests/helpers/postgres.mjs | dependency/test/docs: PostgreSQL desechable loopback |
| tests/README.md | dependency/test/docs |
| tests/audit.test.mjs | dependency/test/docs: cinco comprobaciones de esta auditoría |
| docs/14-PREFLIGHT-READ-ONLY.sql | dependency/test/docs: catálogo y datos, sólo lectura |
| docs/14-AUDITORIA-PRE-DB-REMOTA.md | dependency/test/docs: este dictamen |

Unrelated: ninguno. El adaptador de pruebas de invitados conserva ramas del endpoint anterior para reproducir la carrera histórica; no es código muerto productivo. Los helpers crean y eliminan sólo clusters/perfiles temporales propios, con verificación de ruta y procesos ocultos. No apuntan a una DB remota.

## 9. Cookies

Producción: HttpOnly=true, Secure=true, SameSite=Lax, Path=/. Desarrollo HTTP: Secure=false; HTTPS: true. No hay Secure incondicional en localhost dev. El SDK administra fragmentación, expiración y eliminación; setAll propaga opciones a Astro. SSR login/getUser/refresh/logout pasan con SDK real y Auth simulado. Chrome verifica invisibilidad a document.cookie, envío al servidor y logout. Usa la excepción de Secure en loopback, no demuestra HTTPS/Vercel real. Auth sólo servidor: no hay refresh del navegador que necesite leer el token.

## 10. live_mode

Producción exige boolean true y test boolean false; strings, números, null o ausencia no coinciden. SDK instalado declara live_mode?: boolean. Campo ausente se ignora (200 sin procesamiento), no se infiere desde el token. Un contrato sandbox diferente bloquearía procesamiento y debe verificarse con el proveedor; no se simuló una operación monetaria real. Merchant order se consulta cuando falta preferencia y coteja ID, external_reference y pertenencia del pago. La normalización también acepta metadata.preference_id de la respuesta autenticada, conducta previa al diff.

## 11. Dependencias pendientes

npm audit --json salió 1 por vulnerabilidades: **5 paquetes: 1 critical, 2 high, 1 moderate, 1 low**. Son paquetes afectados, no cinco advisories. La premisa de cuatro quedó desactualizada. No se ejecutó install, audit fix ni major upgrade.

| Paquete actual | Corregida / propuesta de npm | Tipo y uso efectivo | Severidad | Compatibilidad |
| --- | --- | --- | --- | --- |
| Astro 6.4.8 | 7.2.8 mínimo para avisos propios vigentes; npm propone 7.3.5 | Directa en devDependencies, participa en runtime SSR/build | critical | Major, breaking |
| @astrojs/vercel 10.0.8 | 11.0.3 para ISR; npm propone 11.0.11 | Directa, adapter build/runtime | moderate | Major, breaking |
| Sharp 0.34.5 | 0.35.0 libvips; 0.35.4 cubre también libheif | Transitiva opcional Astro; imágenes build/runtime | high | Fuera del rango 0.34; potencialmente breaking |
| esbuild 0.27.7 (Astro/adaptador) | 0.28.1 | Transitiva; tooling/build y servidor dev Windows | low | Fuera del rango 0.27; potencialmente breaking |
| brace-expansion 5.0.9 | 5.0.12 cubre los tres avisos | Transitiva vía minimatch; tooling/globs | high | Patch compatible con ^5.0.8 del padre |

Astro: avisos propios f48w (7.0.6), 7pw4 (7.0.4), 4g3v (7.0.10), 26w7 (7.2.8) y 376h (7.2.4). No se encontró entrada no confiable en nombres spread, View Transitions ni base personalizada. No hay ISR en astro.config.mjs ni rutas ISR en el artefacto local; el [aviso del adaptador](https://github.com/withastro/astro/security/advisories/GHSA-x27w-589x-frm2) depende de esa función.

La [vulnerabilidad AVIF de Astro](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2) requiere procesar una imagen AVIF no confiable. El código usa assets locales, no expone uploads ni configura dominios remotos; el endpoint instalado comprueba allowlist remota. Sin embargo, /_image sí existe en el artefacto SSR. Inferencia: no se identificó una vía explotable en este código/configuración, pero no se certificó el optimizador desplegado. Astro/Sharp siguen bloqueando una aprobación incondicional de producción hasta confirmar esa ausencia de entrada hostil o actualizar. No son por sí mismos impedimento técnico de ejecutar SQL. esbuild afecta servidor dev Windows, no el servidor productivo; ISR no habilitado; brace-expansion no recibe globs del usuario en la aplicación inspeccionada. No se demostró explotación productiva de esas tres alertas.

## 12. Tests

Baseline repetida: npm test 88 PASS, test:browser 1 PASS, total 89 PASS/0 FAIL. Se agregaron cinco pruebas: privilegios heredados, endpoint sin ownership/otra boda, grupos concurrentes distintos, fallo durante inserción y ID externo asociado a otra inscripción existente. Las dos primeras son **pruebas de evidencia de defectos actuales**, no controles de seguridad satisfechos; deben invertirse al corregir los defectos.

Resultado final de suite ampliada: **94 PASS, 0 FAIL, 0 omitidos** (npm test: 93; test:browser: 1). Un primer fixture nuevo reutilizaba una preferencia única y falló antes de probar el escenario; se corrigió para usar dos preferencias distintas y se repitió la suite. Ese fallo de fixture no se atribuye al producto.

## 13. Build

npm run build: PASS, exit 0, empaquetado Vercel completo. NVM4306 dentro del sandbox se resolvió ejecutando los comandos con permiso fuera del entorno restringido; no se alteró NVM ni se invocaron entrypoints para eludir su control.

## 14. git diff --check

**PASS**, exit 0 en la comprobación final. Advertencias LF/CRLF no son errores de whitespace. git status conserva siete archivos rastreados modificados y los archivos nuevos detallados; sin staging/commit. git diff --check cubre el diff rastreado; los tres archivos agregados en esta auditoría también se verifican separadamente por whitespace.

## 15. Riesgos restantes

Además de H1–H3: retención del historial por CASCADE, conciliación manual de additional_approved, reembolsos/contracargos fuera del modelo de cuatro estados, validación real de merchant order y boolean live_mode, refresh/cookies en HTTPS desplegado, límites de body basados sólo en Content-Length y controles de frecuencia no certificados. No se incorporan esos cambios durante esta auditoría. No confundir no doble contabilización con evitar doble cobro.

## 16. Correcciones necesarias

1. Cerrar autorización y alcance por inscription/boda en la API de invitados y probar denegación con UUID ajeno conocido.
2. Revocar privilegios heredados de service_role sobre el historial antes de otorgar SELECT/INSERT/UPDATE; verificar catálogo efectivo, owner/membresías y definir retención frente a CASCADE.
3. Ejecutar el preflight read-only remoto; resolver cualquier discrepancia sin inventar fechas ni descartar evidencia.
4. Actualizar la documentación de permisos y las cinco alertas vigentes; plan separado de upgrade/QA y verificación de superficie AVIF.
5. Repetir controles tras las correcciones y preparar aplicación transaccional/despliegue coordinado para no mezclar escritores antiguos y nuevos.

## 17. Recomendación explícita

**DO NOT APPLY MIGRATIONS.** Detenerse para auditoría humana. Los tests/build exitosos no compensan H1/H2 ni prueban el estado remoto. Sin autorización remota, commit, push, deploy ni pago real.
