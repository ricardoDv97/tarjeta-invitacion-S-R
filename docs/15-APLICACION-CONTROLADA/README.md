# SPRINT 15 — PRODUCTION DB MIGRATION REVIEW

Estado: **APPROVED FOR REMOTE MIGRATION**, como resultado de revisión técnica local y sujeto al preflight remoto y auditoría humana. **No se aplicó en producción.** No autoriza ejecutar el APPLY automáticamente.

Migración: `supabase/migrations/20261002000000_transfer_payment.sql`.
Versión: `20261002000000`; nombre de historial: `transfer_payment`.
SHA256 congelado: `bd797423b1560b0bc3c12ac9ef59fe050c513bd363a6ea2914da33cde96c37bc`.
Fecha: 2026-10-02, America/Buenos_Aires.

El cuerpo de la fuente aparece byte por byte entre marcadores del APPLY y también en statements del registro. La prueba del historial normaliza CRLF a LF porque psql procesa esos saltos de línea; no normaliza ni modifica el archivo congelado. SHA256.json mide los bytes reales del archivo y de cada SQL del paquete.

## Corrección antes de congelar

La revisión detectó que report_transfer_payment delegaba a prepare_transfer_payment y podía insertar una fila contable ausente. Se corrigió antes de congelar este SHA256 y se reinició la revisión: la declaración ahora valida y bloquea directamente registration/payment, exige una fila transfer preparada y sólo actualiza payment_reported_at. No prepara ni inserta pagos. El trigger preexistente actualiza también registrations.updated_at; no se deshabilitó ni modificó. Si falta la fila, devuelve payment_not_found sin cambios. También se estableció explícitamente owner postgres en las tres RPC.

La evidencia anterior de 175 tests corresponde a la versión previa. La corrección se verificó con 39 pruebas específicas de transferencia/migraciones/endpoints y dos pruebas del paquete completo PostgreSQL. No se volvió a declarar aquella suite como ejecutada sobre este SHA. Frontend, precios, alias y runtime de la app permanecen como en el cierre local; la página prepara la fila antes de habilitar el modal. No requiere alterar el contrato del endpoint.

## Objetos revisados

- registrations.payment_reported_at: timestamptz, nullable, sin default, sin backfill. Todas las filas existentes quedan NULL.
- CHECK registrations_payment_method_valid: NULL/cash/transfer/mercadopago.
- CHECK payments_provider_valid: cash/transfer/mercadopago. Datos existentes no se convierten; el CHECK se valida transaccionalmente.
- Índice parcial único payments_one_transfer_per_registration_idx sobre registration_id WHERE provider='transfer'.
- RPC prepare_transfer_payment(uuid,text), report_transfer_payment(uuid,text), approve_transfer_payment(uuid): SECURITY INVOKER, owner postgres, search_path vacío.
- REVOKE ALL de esas firmas a PUBLIC, anon, authenticated y service_role; GRANT EXECUTE sólo a service_role. postgres conserva el permiso implícito del propietario.
- Ninguna tabla nueva persistente, policy, grant de tabla, modificación de RLS, trigger, columna MP, RPC cash/MP o migración histórica.

## Autorización y estados

Prepare/report comparan management_token_hash dentro de FOR UPDATE sobre la inscripción, exigen boda activa con slug ricardo-sabrina-2026 y método transfer; pagos habilitados, grupo completo y contabilidad coherente. Un hash NULL, ajeno o ausencia de inscripción falla cerrado. El endpoint sigue exigiendo cookie privada y mismo origen. Sólo service_role puede invocar SQL; la autenticación de invitado/admin corresponde al backend, no a un JWT de usuario invocando directamente la RPC.

Report bloquea también la fila contable existente, valida pending/pending, monto/ARS/proveedor/identificadores y preserva el primer timestamp. No establece approved, confirmed ni paid_at. Los reintentos no disparan UPDATE.

Approve no acepta cash ni mercadopago; bloquea padre/fila contable, valida boda, grupo, monto/ARS/proveedor/estados, actualiza ambos registros atómicamente y nunca inserta pagos. paid_at usa statement_timestamp(): fecha actual de la sentencia de aprobación, no del reporte; a diferencia de now(), no queda fijada al inicio de una transacción más antigua. approved coherente devuelve already_applied y conserva paid_at. Admin puede verificar recepción aunque el invitado no haya declarado. No se cambian estados históricos durante la migración.

## Evidencia local y límites remotos

Las migraciones previas habilitan RLS en weddings, registrations, guests, payments, admin_users y mercadopago_payment_attempts; no hay policies públicas. Se conservan los grants mínimos del Sprint 14: SELECT en weddings/admin_users; SELECT+INSERT en guests; SELECT+INSERT+UPDATE en registrations/payments/attempts. No se restauran DELETE/TRUNCATE/REFERENCES/TRIGGER. Las RPC cash y MP permanecen definidas con ACL segura para compatibilidad histórica; el runtime nuevo no procesa MP.

Estos son resultados de revisión del código y de PostgreSQL temporal. **No se consultó el esquema remoto en esta intervención**. Los SQL preparados permitirán comprobar su estado real; si difiere, detenerse. No afirmar counts/fingerprints/RLS remotos PASS antes de recibir sus resultados.

## Archivos y ejecución humana

1. `00-BASELINE-READ-ONLY.sql`: ejecutar primero, con escrituras suspendidas. Captura historia, esquema del historial, constraints, seis conteos/fingerprints completos, distribución, pendientes, tokens NULL, bodas activas, RLS/policies, grants efectivos de tabla/columna y ACL/owner/search_path de RPC. Sólo agregados/digests; no publica management hashes, nombres de invitados ni credenciales.
2. `20-INTEGRITY-READ-ONLY.sql`: ejecutar antes del APPLY y repetir después. Errores esperados cero, boda esperada una. Captura nuevamente digests completos y subconjuntos QA NULL-token/cash/MP. Grupos de invitados vacíos son RSVP incompletos válidos; grupos presentes deben estar completos. Approved MP histórico de monto cero puede no tener paid_at ni preference, conforme al esquema anterior. Attempts antiguos pueden tener preferencias distintas de la fila contable actual; no se inventa relación con columnas inexistentes.
3. Revisar resultados y confirmar **proyecto Supabase correcto desde su dashboard**, boda y migraciones esperadas. current_database suele ser postgres y no identifica un proyecto. El guard es de esquema/evento/historia, no una certificación del project ref. No se publica ni extrae un secreto para identificarlo.
4. Revisar diff, fuente y SHA256.json con auditor humano. Cualquier edición de la fuente reinicia la revisión: no conservar este estado/hash si cambia. Verificar también hashes de los SQL del paquete.
5. Sólo después de aprobación humana y autorización específica de aplicación, abrir `10-APPLY-20261002000000.sql` completo en SQL Editor como postgres. **No ejecutar ahora.** No pegar fragmentos ni la migración sola.
6. APPLY usa BEGIN/COMMIT, lock_timeout=5s, statement_timeout=60s y guards. Requiere máximo de historial 20260930000000 y ausencia de Sprint 15, seis tablas con RLS, cero policies, grants privados cerrados y RPC legacy seguras; niega objetos transfer ya existentes. Bloquea las seis tablas durante la ventana; puede bloquear lecturas/escrituras y fallar por timeout. No retirar los límites para forzar éxito.
7. Guarda snapshots en una tabla TEMP ON COMMIT DROP, ejecuta bytes exactos de la migración entre marcadores, compara todas las filas previas (incluidos management hashes, timestamps, invitados, pagos, attempts, admins, bodas), y compara ACL/RLS/policies/RPC legacy. Si difieren, excepción y rollback. La única escritura persistente adicional es INSERT de version/name/statements en supabase_migrations.schema_migrations dentro de la misma transacción. La tabla TEMP no conserva datos después de COMMIT/ROLLBACK.
8. Ante error: ejecutar ROLLBACK si la sesión sigue en transacción; detenerse, conservar error sanitizado y revisar. No continuar con otro fragmento, no marcar historial manualmente ni borrar datos. El APPLY es deliberadamente de una sola aplicación; repetirlo ya registrado aborta. La fuente es idempotente, pero el guard del paquete exige un preflight nuevo para cualquier reparación/reaplicación.
9. Ejecutar `11-POSTFLIGHT-READ-ONLY.sql` y nuevamente integridad con RSVP aún suspendido. Esperado: una versión registrada, columna timestamptz nullable/default NULL, ambos CHECK admiten cash/transfer/mercadopago, índice único, tres RPC postgres/invoker/path vacío, anon/authenticated EXECUTE false y service_role true; todas las tablas RLS true, policies cero. Count/digests/grants previos idénticos. RPC nuevas son adiciones esperadas, no deben contarse como cambios de ACL legacy.
10. No reabrir RSVP hasta validar DB y desplegar el runtime compatible mediante una tarea posteriormente autorizada. Mantener suspendidas escrituras durante baseline/apply/postflight; si hubo actividad entre snapshots, los fingerprints externos no son comparables y se necesita baseline nuevo. No se ejecutó commit/push/deploy ni retirada de ENV.

## Riesgos y próxima acción exacta

El SQL Editor podría tener un schema_migrations distinto; baseline debe confirmar version text, name text y statements text[]. Cualquier columna adicional NOT NULL sin default o versión inesperada exige revisión, no modificación improvisada del paquete. Los guards no sustituyen backup administrado ni la revisión de resultados. Los snapshots son adecuados para la escala actual; JSON agregados completos y locks requieren ventana controlada. Fingerprints MD5 se usan para comparación de datos bajo control, no autenticación; SHA256 congela archivos.

Legacy QA intactos significa comparar los digests previos con los posteriores; no inferir integridad por un número histórico de 12. MP legacy y cash no cambian. Antes de rollout, transfer rows y payment_reported_at deben ser cero. La recepción de futuros pagos MP legacy ya no la procesa el nuevo runtime; conciliación separada antes del rollout. La limitación histórica de logs Vercel no se sustituye con estos SQL.

**Próxima acción:** auditor humano verifica este paquete y ejecuta únicamente baseline e integridad read-only en el proyecto correcto, conservando sus resultados sanitizados. Revisarlos antes de autorizar el APPLY. Este trabajo se detiene aquí sin aplicación remota.
## APPLY package security correction — 2026-10-02

El usuario informó que Supabase SQL Editor canceló la ejecución por un aviso de tabla sin RLS. Se registra como confirmación manual de cancelación; no se verificó el estado remoto en esta intervención. La auditoría del archivo original encontró CREATE TEMP TABLE ... ON COMMIT DROP: ya era temporal y no creaba una tabla persistente en public. No se atribuye una causa definitiva al detector del editor sin su mensaje completo.

El snapshot existe sólo para comparar filas, management hashes y seguridad antes/después dentro de la transacción. El wrapper corregido usa explícitamente pg_temp.sprint15_review_snapshot en CREATE/ALTER/UPDATE/lecturas y DROP. REVOKE ALL cierra permisos a PUBLIC, anon, authenticated y service_role sobre esa tabla temporal. DROP TABLE explícito ocurre después de las comprobaciones y antes de registrar schema_migrations/COMMIT; ON COMMIT DROP conserva limpieza automática adicional. ROLLBACK revierte su creación y terminar la sesión elimina cualquier objeto temporal restante. No se concede acceso público ni se agrega una tabla al modelo de datos.

El guard rechaza una tabla public.sprint15_review_snapshot previamente existente; no la borra ni la considera creada por este paquete. La fuente congelada y su SHA256 permanecen iguales. Cambió sólo el wrapper APPLY y su SHA256, reflejado en SHA256.json. Los objetos persistentes previstos continúan siendo la columna payment_reported_at, los dos CHECK, el índice parcial único transfer, las tres RPC con owner/ACL y la fila schema_migrations. No hay modificación de RLS, policies, grants de tablas de aplicación, cash/MP legacy ni datos existentes.

Las pruebas del paquete verifican temporalidad real en pg_temp, ausencia en public y acceso denegado a roles runtime durante la transacción; ausencia después de COMMIT y ROLLBACK en la misma conexión; lista de tablas públicas sin cambios; fuente exacta/hashes; conservación y rollback. Evidencia final en ../15-APPLY-SECURITY-CORRECTION-EVIDENCE.json.

Usar únicamente el APPLY actualizado completo después del preflight y auditoría humana. No reutilizar una copia anterior del SQL Editor. Si el editor vuelve a emitir el aviso, conservar el texto exacto y revisar; no cambiar a tabla permanente ni desactivar controles para forzar la ejecución. Este ajuste no aplica la migración ni certifica su estado remoto.
