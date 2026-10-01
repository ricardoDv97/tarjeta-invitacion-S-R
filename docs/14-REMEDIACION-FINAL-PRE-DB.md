# SPRINT 14 — REMEDIACIÓN FINAL PRE-DB

> Revisión posterior: [14-DECISION-MIGRACIONES.md](14-DECISION-MIGRACIONES.md)
> incorpora los resultados remotos informados y la confirmación de que las doce
> filas legacy son QA y se conservan sin edición pública. El estado inferior es
> histórico, anterior a recibir esa evidencia.

Fecha: 2026-09-30. Estado: **BLOCKED** por preflight remoto pendiente.
Recomendación: **DO NOT APPLY MIGRATIONS**. Detenerse para auditoría humana.

## 1. Autorización y recorrido

Antes, `/confirmar` creaba una registration y trasladaba su UUID mediante
`?registration=...` al paso de invitados. No había token, cookie RSVP, sesión de
titularidad ni storage que autorizara esa carga. El UUID es una referencia que
puede quedar en historial, enlaces y logs; conocerlo no acredita titularidad.

Ahora el servidor genera 32 bytes aleatorios con `randomBytes`, entrega su
representación hexadecimal únicamente mediante Set-Cookie y almacena SHA-256
en `registrations.management_token_hash`. No se devuelve el token en JSON ni
se guarda plano en DB, URL, localStorage o sessionStorage. No se agregó login.

Cookie `rsvp_<registration UUID>` por inscripción, host-only, HttpOnly,
SameSite=Lax, Path=/api/registrations, Max-Age=86400. Secure salvo HTTP loopback
de desarrollo. Cada pestaña puede conservar su propia inscripción. Los fetch
existentes del mismo origen envían la cookie automáticamente. La cookie no se
renueva ni reemite en lecturas. Perderla o vencer sus 24 horas impide continuar
la carga; no hay recuperación por UUID ni por datos personales.

El endpoint valida formato del UUID, presencia/formato inequívoco de cookie,
Origin si está presente y calcula el hash. Consulta registration por ID + hash;
no revela existencia ante hash incorrecto. Valida payload/estado y llama RPC.
Se eligió **B**: la RPC vuelve a validar ID, hash, boda y estado bajo el lock.
SQL recibe solamente el hash, nunca el token plano. Ese hash también es sensible
para un cliente privilegiado: no debe registrarse en logs ni exponerse.

## 2. Registration, boda y RPC

La creación resuelve server-side la boda activa `ricardo-sabrina-2026`. La RPC
consulta la boda de la registration y exige ese slug y `is_active`; no recibe
ningún wedding_id del navegador. Sólo acepta attendance_status=pending.

Firma final: `public.save_registration_guests(uuid,jsonb,text)`. No se conserva
la sobrecarga insegura de dos argumentos. Se editó la migración local pendiente
20260929000000; si remoto ya tiene la firma anterior, **no aplicar esta cadena**:
el preflight debe detectar ese drift y requerir una migración de transición.

El SELECT FOR UPDATE de la registration precede la autorización y la escritura.
Se conserva el guardado atómico, comparación de multiconjuntos, reintentos
idénticos idempotentes, rechazo de grupos distintos ya guardados y rollback total.
No se borran invitados ni se impide que dos personas tengan el mismo nombre.
El protocolo conserva el lock común con las transiciones de pago.

Las filas existentes reciben hash NULL y fallan cerradas. No se inventan tokens
ni se permite reclamar una fila conociendo su UUID. El preflight cuenta esas
filas sin mostrar hashes. Antes de operar remotamente hace falta acordar qué
hacer con inscripciones pendientes anteriores y con posibles duplicados al
reiniciar un RSVP. No se alteran datos remotos en esta fase.

## 3. Permisos efectivos requeridos

La migración 20260930000000 revoca ALL sólo sobre las seis tablas de esta app
para PUBLIC, anon, authenticated y service_role, y luego concede lo siguiente.
No hay revokes globales del esquema ni de servicios ajenos.

| Tabla | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | REFERENCES | TRIGGER | Justificación |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| weddings | Sí | No | No | No | No | No | No | Precios, boda activa y dashboard |
| registrations | Sí | Sí | Sí | No | No | No | No | Creación, lectura y estados/locks de RPC |
| guests | Sí | Sí | No | No | No | No | No | Carga inicial atómica, conteos y dashboard |
| payments | Sí | Sí | Sí | No | No | No | No | Efectivo, preferencia MP, conciliación y admin |
| admin_users | Sí | No | No | No | No | No | No | Allowlist; mantenimiento fuera del runtime |
| mercadopago_payment_attempts | Sí | Sí | Sí | No | No | No | No | Historial, idempotencia, approved y requires_review |

No hay rutas runtime DELETE/TRUNCATE; tampoco se necesita crear triggers ni
foreign keys durante requests. UUID defaults no requieren secuencias de app.
Se mantiene BYPASSRLS de service_role porque es el backend privilegiado previsto;
los grants SQL siguen siendo necesarios para las RPC SECURITY INVOKER.

## 4. Funciones y default privileges

| RPC | SECURITY | Owner local / remoto | search_path | EXECUTE final |
| --- | --- | --- | --- | --- |
| save_registration_guests(uuid,jsonb,text) | INVOKER | postgres / verificar creador | vacío | sólo service_role entre roles auditados |
| apply_mercadopago_payment_result(uuid,text,text,numeric,text,text,timestamptz) | INVOKER | postgres / conserva owner | vacío | sólo service_role entre roles auditados |
| prepare_mercadopago_checkout(uuid) | INVOKER | postgres / conserva owner | vacío | sólo service_role entre roles auditados |
| confirm_cash_payment(uuid), approve_cash_payment(uuid) | INVOKER | postgres / histórico | vacío | service_role; históricos sin cambio de lógica |

PUBLIC/anon/authenticated carecen de EXECUTE sobre las RPC. Se cierra además
EXECUTE del trigger histórico set_updated_at para esos roles y service_role;
los triggers existentes siguen funcionando. No hay SECURITY DEFINER nuevo ni
SQL dinámico. No se fuerza ALTER OWNER sobre objetos remotos desconocidos.

El harness reproduce default privileges amplios de service_role. Los REVOKE
explícitos finales eliminan esos grants acumulados en objetos existentes. No se
modifican default privileges globales: dependen del rol creador y podrían servir
a otros objetos del proyecto. Toda nueva migración debe resetear ACLs de sus
tablas/funciones antes de otorgar sólo lo requerido. Esa regla no constituye una
restricción automática sobre futuras migraciones. El preflight inspecciona
pg_default_acl, owners, ACL, membresías, policies y privilegios efectivos: grants
vía otros roles, ownership o permisos por columna pueden requerir remediación
adicional remota. No se certifica el catálogo remoto desde pruebas locales.

## 5. Payment attempts

No se cambió la lógica de la migración 20260929000100 ni los endpoints MP en esta
remediación final. Se preservan los cambios previos del workspace y escenarios
de historial, approved terminal, segundo approved con requires_review,
idempotencia, amount/currency/preference/live_mode. Las pruebas de PostgreSQL
ejecutan esas RPC como service_role con los nuevos grants. Se agregó también
confirmación de efectivo y aprobación administrativa con privilegios reducidos.

## 6. Preflight remoto: pendiente

No hay una conexión SQL remota read-only identificada en las herramientas
disponibles. No se extrajeron credenciales de .env ni se improvisó acceso SQL a
través de una service key. No se consultó ni modificó la DB remota.

Instrucciones manuales exactas:

1. Abrir el proyecto Supabase correcto y SQL Editor.
2. Copiar **todo** [14-PREFLIGHT-READ-ONLY.sql](14-PREFLIGHT-READ-ONLY.sql) y ejecutar.
   El archivo contiene exclusivamente SELECT e introspección; se quitaron los
   BEGIN/ROLLBACK del borrador anterior. No copiar migraciones ni tests allí.
3. Guardar resultados de cada consulta para auditoría humana. Si una consulta
   falla por columna/tabla faltante, conservar el error como evidencia de drift;
   no crear objetos para hacerla pasar. Se pueden ejecutar SELECT individuales.
4. Verificar historia hasta 20260903000000, ausencia de los nuevos objetos y
   columna/constraint, boda activa única, índices válidos, backfill sin filas
   incompatibles, grupos consistentes, owners/ACL/defaults/membresías y RLS.
5. Resolver discrepancias y decidir el tratamiento de filas legacy sin token.
   Sólo después reevaluar aprobación. Estas lecturas independientes no son un
   snapshot único; repetir cerca de una ventana de escrituras suspendidas.

## 7. Dependencias pendientes

`npm audit --json`: exit 1, **5 paquetes**: 1 critical, 2 high, 1 moderate, 1 low.
Versiones contrastadas con package-lock.json. No hubo install, audit fix ni
upgrades en esta fase. Package.json/lock ya estaban modificados al comenzar.

| Paquete | Actual afectada | Corregida | Directa/transitiva | Severity | Uso | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| Astro | 6.4.8 | 7.2.8 cubre avisos propios; audit propone 7.3.5 | Directa devDependencies | critical | Build y SSR runtime | Major |
| @astrojs/vercel | 10.0.8 | 11.0.3; audit propone 11.0.11 | Directa | moderate | Build y adaptador runtime | Major |
| Sharp | 0.34.5 | 0.35.4 cubre libvips/libheif | Transitiva opcional | high | Imágenes build/runtime | Minor 0.x incompatible con rango actual |
| esbuild | 0.27.7 anidada en Astro/Vercel | 0.28.1 | Transitiva | low | Build/dev Windows | Minor 0.x fuera del rango; audit propone major de Astro |
| brace-expansion | 5.0.9 | 5.0.12 | Transitiva vía minimatch | high | Tooling/globs | Patch; propuesta separada |

La copia raíz de esbuild 0.28.2 no está afectada por ese aviso; quedan las dos
copias 0.27.7. La clasificación devDependencies no exime el SSR de Astro.
Producción requiere resolver o validar exposición a AVIF/Sharp y demás avisos;
esta clasificación no autoriza deploy. Los IDs y enlaces de advisories están
en el informe de auditoría anterior y en la salida actual de npm audit.

## 8. Verificación

Suite completa final: **108 PASS / 0 FAIL / 0 omitidos**:
`npm test` 107 PASS, `npm run test:browser` 1 PASS.
Build: PASS, exit 0, artefacto Vercel local completo.
git diff --check: PASS; archivos nuevos comprobados también por whitespace.

Se mantienen las pruebas de grupos idénticos concurrentes, grupos distintos
concurrentes, fallo durante inserción y rollback transaccional. Nuevas pruebas:
token propio válido, incorrecto, ajeno, ausente, manipulado, malformado, otra boda,
legacy NULL, validación directa SQL sin endpoint, emisión de cookie/hash,
aleatoriedad/cookies duplicadas y atributos Secure. La matriz efectiva se prueba
para cada tabla y cada uno de los siete privilegios requeridos por la auditoría.

Incidencias del harness corregidas: un fixture nuevo tenía una llave faltante;
Chrome retenía un archivo del perfil temporal al borrarlo. Se corrigieron el
fixture y la espera de cierre, conservando todas las aserciones de seguridad.
NVM4306 requirió ejecución autorizada fuera del sandbox; no se alteró NVM.

## 9. Archivos de esta fase y migraciones finales

- Nuevo: src/lib/registrationManagement.js.
- Modificados: src/pages/api/registrations/index.js y [id]/guests.js.
- Editada local pendiente: supabase/migrations/20260929000000_atomic_guest_registration.sql.
- Nueva: supabase/migrations/20260930000000_runtime_least_privilege.sql.
- Tests: database.test.mjs, audit.test.mjs, browser/cookies.test.mjs y nuevo registration-management.test.mjs.
- Docs: preflight, anotaciones en los dos informes anteriores y este dictamen.

Cadena final pendiente, en orden:

1. 20260929000000_atomic_guest_registration.sql.
2. 20260929000100_mercadopago_payment_attempts.sql (contenido previo conservado).
3. 20260930000000_runtime_least_privilege.sql.

Cada archivo debe aplicarse transaccionalmente por un runner verificado, con
escrituras incompatibles detenidas hasta coordinar esquema y backend. El código
nuevo requiere la columna y firma nuevas. No volver al endpoint inseguro como
rollback: ante problemas detener la carga y conservar datos para remediación.

## 10. Riesgos y límites

Faltan preflight remoto y revisión humana, tratamiento legacy, QA de cookies en
HTTPS desplegado y plan separado de dependencias. La cookie expira en el browser
a las 24 horas; no hay vencimiento SQL ni rotación automática del hash. Un token
robado sigue siendo una credencial hasta cambiar/quitar el hash o cerrar el
estado. No se presenta este flujo público como autenticación de identidad civil.

El alcance de este token es la escritura de invitados. Las rutas públicas de
lectura de estado y preparación de efectivo/checkout mantienen su autorización
histórica por UUID; requieren auditoría propia antes de declarar protegido todo
el RSVP. Admin y webhook conservan sus controles existentes. Un service_role
comprometido todavía puede usar sus permisos directos, por diseño.

Persisten límites previos: controles de frecuencia/body, conciliación manual de
segundos cobros, retención CASCADE para administradores y escenarios reales del
proveedor fuera de fixtures. No hubo pago real, cambios de secretos, db push,
git add/commit/push ni deploy. **DO NOT APPLY MIGRATIONS**.
