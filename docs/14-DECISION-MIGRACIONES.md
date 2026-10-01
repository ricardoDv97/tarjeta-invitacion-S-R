# SPRINT 14 — DECISIÓN MIGRACIONES

Fecha: 2026-09-30. **APPROVED FOR REMOTE MIGRATIONS — APPLY MIGRATIONS**.

Dictamen técnico sobre las tres migraciones, con aplicación transaccional como
postgres y escrituras suspendidas hasta completar la cadena y coordinar el
backend. No constituye ejecución, autorización de deploy ni aprobación de
producción. La evidencia adicional aportada durante esta revisión cerró la
falta inicial de información de catálogo.

## Evidencia remota recibida

Fuente: resultados informados por el usuario, no una conexión remota del agente.

- Historia: 20260824000000, 20260826000000, 20260827000000, 20260828000000,
  20260831000000, 20260902000000 y 20260903000000.
- RLS activo, FORCE RLS false en weddings, registrations, guests, payments y
  admin_users. Sin policies en las tablas auditadas.
- Ausentes: save_registration_guests(uuid,jsonb), su firma autorizada de tres
  argumentos y mercadopago_payment_attempts.
- Cero filas incompatibles de backfill, IDs externos duplicados, filas contables
  duplicadas, correlaciones inválidas, grupos de invitados inválidos y campos de
  registration inválidos. Una boda activa esperada.
- Doce registrations sin token. El usuario confirmó: **son QA y deben
  conservarse sin edición pública**.
- Grants amplios SELECT/INSERT/UPDATE/DELETE/TRUNCATE para anon, authenticated y
  service_role en las cuatro tablas principales; admin_users privado para
  anon/authenticated, service_role amplio.

Evidencia adicional recibida:

- Columnas y tipos coinciden con el esquema histórico requerido. No existe
  management_token_hash; tampoco su constraint. Constraints listadas validadas.
- Índices contables únicos por proveedor/registration y por IDs de pago y
  preferencia presentes. mercadopago_attempts_payment_idx devuelve NULL.
- Las cinco tablas existentes pertenecen a postgres; sus ACL provienen de
  postgres y no muestran otros destinatarios fuera de los roles auditados.
- apply_mercadopago_payment_result y approve_cash_payment: owner postgres,
  SECURITY INVOKER, search_path vacío, EXECUTE sólo postgres/service_role.
- Defaults de postgres/public conceden permisos amplios a anon/authenticated/
  service_role en tablas, secuencias y funciones; las migraciones los revocan
  explícitamente para los objetos de esta aplicación. No hay secuencias nuevas.
- anon/authenticated no son superuser ni BYPASSRLS; service_role no es superuser
  y sí BYPASSRLS. Ninguno aparece como miembro de un rol que amplíe sus permisos.
  Que authenticator/postgres sean miembros de service_role no implica la
  membresía inversa.

La ACL remota incluye además `m` (MAINTAIN). REVOKE ALL la retira junto con los
otros permisos; ninguno de los GRANT runtime la vuelve a conceder. La prueba
local PostgreSQL 16 cubre los siete privilegios solicitados; no se atribuye a
ella una comprobación runtime de MAINTAIN de versiones posteriores.
[PostgreSQL 17: privilegios](https://www.postgresql.org/docs/17/sql-grant.html).

## Legacy: resuelto

La primera migración agrega una columna nullable sin DEFAULT. Las doce filas
quedan con management_token_hash=NULL; el CHECK acepta NULL. No hay DELETE,
backfill de tokens, cambio de IDs, estados, importes ni relaciones. Se mantienen
pagos, invitados y capacidad de consulta administrativa. La RPC rechaza NULL
antes de insertar invitados. Ningún UUID permite reclamar esa credencial.

La decisión QA elimina la necesidad de implementar recuperación pública. Si
en otra fase se requieren registros reales editables, hará falta verificación
independiente de titularidad por un administrador y emisión de una credencial
nueva aleatoria mediante entrega de un solo uso y expiración server-side,
guardando sólo su hash y auditando la emisión. No reutilizar UUID, correo sin
verificar ni tokens deterministas. Ese mecanismo no existe ni se implementó
en esta auditoría.

## Grants y RLS

La tercera migración elimina todos los grants sobre las seis tablas para PUBLIC,
anon, authenticated y service_role y después concede esta matriz:

| Tabla | service_role | anon / authenticated |
| --- | --- | --- |
| weddings | SELECT | ninguno |
| registrations | SELECT, INSERT, UPDATE | ninguno |
| guests | SELECT, INSERT | ninguno |
| payments | SELECT, INSERT, UPDATE | ninguno |
| admin_users | SELECT | ninguno |
| mercadopago_payment_attempts | SELECT, INSERT, UPDATE | ninguno |

DELETE, TRUNCATE, REFERENCES y TRIGGER quedan retirados de los roles nombrados.
No se necesitan en las rutas runtime. Las pruebas locales comprueban los siete
privilegios por tabla y los flujos de efectivo y MP con permisos reducidos.

RLS sin policies niega operaciones normales sobre filas a roles sujetos a RLS,
pero **no protege TRUNCATE ni REFERENCES**. Esto exige revocar esos privilegios;
no demuestra por sí solo que exista una ruta HTTP para explotarlos.
[PostgreSQL: RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html).

Las RPC son SECURITY INVOKER con search_path vacío y referencias calificadas;
no hay policies públicas nuevas. El backend necesita service_role con BYPASSRLS
y grants de tablas. La autorización del invitado la resuelve el token y el
alcance de boda de la RPC, no RLS. Owners y membresías aportados no muestran
rutas adicionales de permisos para los tres roles auditados. REVOKE de tabla
también revoca los permisos
correspondientes de columnas para ese destinatario; no elimina derechos por
otra membresía. [PostgreSQL: REVOKE](https://www.postgresql.org/docs/16/sql-revoke.html).

## Autorización de invitados

El servidor genera 32 bytes aleatorios y calcula SHA-256. Sólo el hash se guarda;
el valor plano se entrega en cookie HttpOnly/Secure/SameSite=Lax. El endpoint
filtra ID+hash y pasa el hash a la RPC. Bajo SELECT FOR UPDATE ésta exige hash
no NULL coincidente, boda activa ricardo-sabrina-2026 y attendance_status=pending.
Después valida el grupo completo. Se conserva atomicidad, reintento idempotente,
ausencia de intercalación y rollback completo ante error. Legacy NULL falla
cerrado. No se guardan tokens planos ni se crea la firma insegura anterior.

## Payment attempts y backfill

Los conteos remotos aportados satisfacen las comprobaciones de compatibilidad
del backfill: ID numérico, preferencia presente, monto positivo, ARS, estado y
paid_at coherentes, timestamps y unicidad. Se copian sólo pagos Mercado Pago con
provider_payment_id no NULL; no se crean fechas ficticias ni se descartan filas
inválidas para forzar éxito. Los pagos gratuitos sin ID quedan fuera del ledger.
Los payments originales no se alteran durante la migración.

La tabla ausente y el to_regclass NULL adicional del índice confirman que esos
nombres están libres. El inventario no muestra índices duplicados con el nuevo
índice; éste pertenece al nuevo ledger. Las columnas/constraints proporcionadas
son compatibles. CREATE OR REPLACE conserva las firmas históricas de las RPC
MP y la migración instala sus definiciones revisadas. La RPC de invitados utiliza
una firma nueva cuyo to_regprocedure también es NULL.

La lógica MP no se cambió. Se conservan escenarios A–J, historial, approved
terminal, segundo aprobado marcado para revisión, idempotencia y validación
de amount/currency/preference/live_mode.

## Orden y fallo parcial

Orden correcto, sin dependencias invertidas:

1. 20260929000000_atomic_guest_registration.sql: columna y RPC autorizada.
2. 20260929000100_mercadopago_payment_attempts.sql: ledger/backfill y RPC MP.
3. 20260930000000_runtime_least_privilege.sql: grants finales, incluida tabla nueva.

Todas las sentencias permiten transacción PostgreSQL; no hay CREATE INDEX
CONCURRENTLY ni otras operaciones que la impidan. Los archivos **no contienen
BEGIN/COMMIT propios**. El harness local sí los envuelve. Para la futura ejecución
se requiere un runner verificado que haga cada archivo transaccional (incluido
el registro de su versión), se detenga al primer error y no use autocommit por
sentencia. Una ejecución manual debe envolver el archivo entero explícitamente
en BEGIN/COMMIT y resolver también el historial de migraciones; no ejecutar sólo
fragmentos seleccionados. Nada de esto se ejecutó remotamente en esta revisión.
[PostgreSQL: transacciones](https://www.postgresql.org/docs/16/tutorial-transactions.html).

Si falla una sentencia, se revierte todo el archivo dentro de su transacción.
Si el archivo 2 falla después de confirmar el 1, el 1 permanece aplicado;
atomicidad por archivo no implica atomicidad del lote. Si falla el 3, los grants
excesivos siguen pendientes. No reanudar escrituras ni desplegar en ese estado.
Resolver el fallo y continuar de forma controlada, sin repetir archivos ya
confirmados a ciegas. No restaurar el endpoint UUID-only ni eliminar el ledger
como rollback automático. Pausar escritores/webhooks durante la ventana evita
mezclar protocolos y deja que los reintentos posteriores se procesen de forma
idempotente; el mecanismo concreto de esa pausa debe quedar definido.

## Condiciones de aplicación de la aprobación

Aplicar como postgres con transacción por archivo, detención al primer error y
registro de versiones consistente con el runner. Si se usa SQL Editor, no
asumir atomicidad por pegar texto: envolver explícitamente cada archivo completo
y conservar el control de versiones. No aplicar en autocommit por sentencia.
El método de ejecución no fue ejecutado ni certificado remotamente aquí; estas
son condiciones del procedimiento aprobado, no propiedades implícitas del SQL.

Mantener las escrituras incompatibles suspendidas durante toda la cadena y la
coordinación con el backend autorizado. Revisar después los permisos efectivos,
RLS, firmas e historia con las consultas de
[14-PREFLIGHT-READ-ONLY.sql](14-PREFLIGHT-READ-ONLY.sql), interpretando entonces
que los objetos nuevos deben existir. Revalidar datos si cambia el estado entre
este preflight y la ventana real. Sin estas condiciones no procede ejecutar.

## Validación y cambios locales

Resultados de tests: **109 PASS / 0 FAIL / 0 omitidos**. Suite completa:
`npm test` 108 PASS; navegador: `npm run test:browser` 1 PASS. Las dos pruebas
de migraciones también pasaron en ejecución focalizada; no se suman de nuevo.
Un intento focalizado dentro del sandbox falló al iniciar initdb por restricciones
de Windows; se repitió fuera del sandbox con autorización y pasó.
`npm run build`: PASS, exit 0. `git diff --check`: PASS.

Sólo se amplió tests/migrations.test.mjs y se documentó la decisión. La prueba
legacy compara íntegramente doce filas antes/después excluyendo la nueva columna,
comprueba sus hashes NULL y el rechazo de la RPC. La prueba de fallo inyecta un
error al final de cada archivo transaccional y compara catálogo, columnas,
funciones y ACL con el estado anterior. Las tres migraciones no se modificaron.

## Riesgos restantes y dictamen

La compatibilidad de los datos informados, el catálogo aportado y la política QA
permiten aprobar técnicamente las tres migraciones bajo el procedimiento
indicado. No se identificó un nuevo defecto que obligue a cambiar su lógica.

Persisten los riesgos documentados de dependencias, rutas de estado/checkout por
UUID, QA HTTPS, expiración de token sólo en cookie y conciliación del proveedor.
No confundir esta aprobación de SQL con aprobación de producción.

**APPROVED FOR REMOTE MIGRATIONS — APPLY MIGRATIONS.** No hubo DB remota escrita,
db push, commit, push, deploy ni pago real. Detenerse para auditoría humana.
