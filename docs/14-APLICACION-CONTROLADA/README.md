# SPRINT 14 — MIGRACIONES REMOTAS

Actualización 2026-09-30: el usuario confirmó **3/3 migraciones remotas aplicadas**,
postflight íntegro y grants/RLS/RPC validados. No volver a ejecutar los APPLY.
La intervención inicial preparó el paquete sin acceso SQL remoto (0/3 ejecutadas
por el agente); las instrucciones siguientes se conservan como registro histórico.
Ver [pre-deploy final](../14-PRE-DEPLOY-FINAL.md) para el estado vigente.

## Acceso y alcance

El usuario autorizó las tres migraciones. No se encontró conexión SQL remota,
Supabase CLI instalado/enlazado ni herramienta de ejecución SQL en esta sesión.
Se inspeccionaron sólo los nombres de variables de .env: hay claves de aplicación,
no DATABASE_URL/credenciales PostgreSQL. No se mostraron sus valores, no se
modificaron secretos ni se intentó convertir una Secret Key en acceso DDL.

Se usó la alternativa autorizada: preparar un archivo por transacción para SQL
Editor. Los originales de supabase/migrations permanecen sin modificaciones.
La revisión de su contenido corresponde a la decisión anterior; no existía un
manifest criptográfico de aquella auditoría. Estos hashes congelan ahora los
bytes revisados; no se presenta un hash histórico inexistente como evidencia.

## Migraciones congeladas

| Archivo original | SHA-256 |
| --- | --- |
| 20260929000000_atomic_guest_registration.sql | `b6b8827fe1cb2b4236c7856bca4de993ed3b167f918515d0f5a3c4d83d9f9889` |
| 20260929000100_mercadopago_payment_attempts.sql | `f8977617300ed00b3da16f9ba3eafb6e1cc7fddb08f016ba1c8e1d335cfdbe38` |
| 20260930000000_runtime_least_privilege.sql | `90302ded14f38996eaa374f38c088d159dbe97225c65a947436826884dbae3f7` |

SHA256.json permite verificación automática. El generador local
scripts/prepare-reviewed-migrations.mjs aborta si algún original cambió. No
realiza conexiones ni modifica los originales. No editar los APPLY generados.

## Antes de escribir

1. Confirmar proyecto Supabase correcto y rol postgres. Mantener suspendidas
   las escrituras del backend antiguo durante toda la operación. No se cambió
   ni se comprobó remotamente esa suspensión desde esta sesión.
2. Ejecutar [00-BASELINE-READ-ONLY.sql](00-BASELINE-READ-ONLY.sql) y guardar todos
   los resultados. Comparar con el preflight aprobado: historia con máximo
   20260903000000, columna/RPC/tabla/índice nuevos ausentes y 12 registrations.
3. Revisar el esquema REAL de schema_migrations: el paquete usa version text,
   name text y statements text[]. Si falta alguna columna, tiene otro tipo o
   hay otras columnas obligatorias sin default, DETENERSE; no adaptar el catálogo
   ni crear objetos auxiliares a ciegas.
4. Guardar las tres filas de huellas y conteos de registrations, guests y
   payments. No incluyen contenidos personales ni hashes de gestión. Repetir
   [40-INTEGRITY-READ-ONLY.sql](40-INTEGRITY-READ-ONLY.sql): seis contadores de
   errores en cero, expected_active_weddings=1 y tokens ausentes=12.

Las huellas comparan todas las columnas originales y timestamps; una escritura
concurrente altera la comparación. No ignorar diferencias como si fueran una
consecuencia normal de las migraciones.

## Aplicar y verificar, un paso por vez

| Paso | Archivo a ejecutar completo | Postflight obligatorio antes de continuar |
| --- | --- | --- |
| 1 | [10-APPLY-20260929000000.sql](10-APPLY-20260929000000.sql) | [11-POSTFLIGHT-READ-ONLY.sql](11-POSTFLIGHT-READ-ONLY.sql), huellas y contadores |
| 2 | [20-APPLY-20260929000100.sql](20-APPLY-20260929000100.sql) | [21-POSTFLIGHT-READ-ONLY.sql](21-POSTFLIGHT-READ-ONLY.sql), huellas y contadores |
| 3 | [30-APPLY-20260930000000.sql](30-APPLY-20260930000000.sql) | [31-POSTFLIGHT-READ-ONLY.sql](31-POSTFLIGHT-READ-ONLY.sql), huellas y contadores |

No ejecutar los tres juntos, no seleccionar fragmentos, no avanzar automáticamente.
Para repetir huellas basta el último SELECT de 00; el inventario inicial de
objetos naturalmente cambia después de migrar.

Cada APPLY contiene BEGIN, un guard de rol/última versión, el contenido original
exacto, una inserción de historial y COMMIT. La inserción de historial es el único
write adicional: registra exclusivamente la versión aplicada, su nombre y el SQL
original en statements, dentro de la misma transacción. SQL Editor por sí solo
no registra una migración ejecutada manualmente. No se utiliza ON CONFLICT ni
se marca aplicada una migración por adelantado. Un error del historial revierte
también el DDL/backfill. El array statements contiene el original como un único
elemento, conservado como evidencia, sin depender de un parser SQL casero.

Si falla el APPLY: ejecutar `ROLLBACK;` y DETENERSE. No ejecutar el siguiente.
Si falla un postflight: DETENERSE; el COMMIT anterior ya ocurrió y ROLLBACK no lo
deshace. Conservar el error/resultados y no improvisar rollback destructivo ni
reintentar archivos ya confirmados. Los guards bloquean orden incorrecto o retry
de una versión anterior; no reemplazan la validación humana del postflight.

## Resultados esperados

- Paso 1: versión registrada, columna nullable text sin default, exactamente
  12 filas QA con NULL; invitados/registrations/payments con huellas idénticas.
  Firma vieja ausente, firma de tres argumentos presente, owner postgres,
  INVOKER/search_path vacío, EXECUTE false para anon/authenticated y true para
  service_role. No se invoca la RPC: sólo introspección.
- Paso 2: tabla y ambos índices (PK y payment_idx) válidos/listos; constraints
  validadas y trigger existente. expected_attempts=actual_attempts,
  backfill_mismatch=0 y duplicate_attempt_ids=0. Se comparan ID, referencia,
  preferencia, monto, moneda, estado, paid_at, timestamps y requires_review.
  Los pagos originales mantienen su huella exacta.
- Paso 3: todas las filas matches_expected=true; incluye MAINTAIN cuando la
  versión PostgreSQL lo admite. Seis tablas con RLS=true y owner postgres,
  cero policies, cinco firmas de RPC existentes y privadas a service_role.
  El privilegio de owner postgres se conserva intencionalmente.
- Final: historial descendente 20260930000000, 20260929000100, 20260929000000,
  20260903000000 y anteriores. Ninguna migración anterior se sobrescribe.

Los seis contadores originales de error son invalid_backfill_rows, duplicate_external_ids,
duplicate_accounting_rows, invalid_payment_correlations,
invalid_existing_guest_groups e invalid_registration_fields. Se agrega
duplicate_attempt_ids del postflight 2. Todos deben ser cero. El chequeo
adicional backfill_mismatch también debe ser cero. expected_active_weddings=1;
registrations_without_management_token=12 es el resultado correcto para QA.

## Baseline local y límites

Baseline repetida: npm test 108 PASS y navegador 1 PASS, 0 FAIL.
Build: PASS, exit 0. Prueba adicional del paquete manual: 1 PASS, 0 FAIL.
Total de casos distintos verificados: **110 PASS / 0 FAIL**. Los primeros dos
intentos de la prueba nueva detectaron conversiones CRLF en la salida de psql
para Windows; se corrigió el harness (comparación hexadecimal y separación
de filas), no las migraciones. La ejecución final pasó completa.
git diff --check y whitespace del paquete: PASS. Los tres SHA-256 se volvieron
a comprobar al cierre y coinciden con el manifest.

La prueba nueva del paquete usa PostgreSQL temporal loopback y datos sintéticos;
verifica bytes/hash de los originales, defaults amplios como los reportados,
preservación de doce registros y pagos, registro atómico de versiones, rollback
si falla ese registro y rechazo del orden incorrecto. Ejecuta los SELECT de
postflight y comprueba la matriz de permisos. No carga .env ni usa Supabase.

Revisión estática: management_token_hash sólo se almacena/filtra en servidor y
no se devuelve en las respuestas públicas inspeccionadas; SUPABASE_SECRET_KEY
se utiliza en supabaseServer. Esto no certifica el backend desplegado ni sustituye
un postflight remoto. No se creó ninguna registration ni se probó checkout/pago.

## Estado remoto y siguiente paso

Último estado remoto INFORMADO: historia hasta 20260903000000, doce filas QA,
objetos nuevos ausentes, grants aún amplios. No se consultó nuevamente remoto
ni se ejecutó ningún APPLY; no puede afirmarse MIGRATIONS APPLIED.

Método: paquete manual preparado. Migraciones 1/2/3: pendientes. Historial,
Guest RPC, attempts, grants finales, RLS/policies y contadores postflight:
pendientes de resultados remotos. Ningún error SQL remoto ocurrió porque no
se intentó conexión ni ejecución. Falta acceso SQL utilizable desde la sesión.

El siguiente paso es ejecutar manualmente la baseline y, sólo si coincide y las
escrituras están suspendidas, el paso 1 con su postflight. Avanzar a los demás
únicamente al pasar cada verificación. Compartir resultados sin datos privados.
Tras completar remoto corresponde repetir tests/build locales; eso todavía no
se puede etiquetar como validación posterior a DB. Mantener el backend antiguo
sin escrituras hasta coordinar la nueva versión en otra fase autorizada.

Sin commit, push, deploy, cambios de secretos, borrado QA ni pagos. Detenido
para ejecución manual controlada y auditoría humana.
