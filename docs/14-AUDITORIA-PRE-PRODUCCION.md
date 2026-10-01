# SPRINT 14 — AUDITORÍA PREVIA A PRODUCCIÓN

Fecha: 29/09/2026. Base local: `3364b53` (`feat: add RSVP deadline and improve guest form inputs`). El árbol estaba limpio al comenzar.

**Dictamen: NO APROBADO para avanzar a la prueba de pago real.** La auditoría de código, las comprobaciones sin escrituras y las pruebas aisladas se ejecutaron; quedan hallazgos y verificaciones pendientes. Un build correcto no cierra esos puntos.

No se realizaron pagos, creación de preferencias, altas de inscripciones, carga de invitados, aprobación de efectivo, modificaciones de Supabase/Auth/Vercel ni cambios de secretos. No se imprimieron credenciales, cookies, nombres, correos ni IDs de personas. Sólo se agrega este informe; el código funcional permanece intacto.

## 1. Configuración y secretos

| Comprobación | Resultado y alcance |
| --- | --- |
| Variables locales requeridas | Las siete variables de `.env.example` están presentes y sin definiciones duplicadas en `.env`. |
| Ambiente MP local | Coincide con producción. Se verificó por comparación, sin imprimir su contenido. |
| URL pública local | Coincide exactamente con `https://invitacion-boda-syr.vercel.app`. |
| Access Token local | Consulta de sólo lectura `GET /users/me` de Mercado Pago: 200; cuenta argentina y sin etiqueta de usuario de prueba. No se solicitó ni creó ningún pago. |
| Webhook local | Secret presente. |
| Webhook desplegado | La ruta existe; una notificación `payment` JSON sin firma devuelve 401, y una firma falsa también devuelve 401. Esto demuestra que el despliegue no cae en la rama de secret ausente; no demuestra que el secret coincida con el panel MP. |
| Configuración en el panel MP | Se toma como confirmada por el usuario: URL productiva `/api/webhooks/mercadopago`, evento Pagos (legacy) y guardado exitoso. No se accedió al panel. |
| Variables en Vercel Production | No se accedió a su configuración privada. No se certifica que el token, ambiente, secret y URL del deployment coincidan con los locales. |
| Secretos en Git | `.env` no está versionado y no tiene commits en el historial local disponible consultado. Los 71 archivos de texto versionados inspeccionados no contienen los tres secretos privados actuales. No equivale a un barrido de todos los secretos históricos. |
| Secretos en assets públicos | Los cuatro archivos de texto relevantes generados en `.vercel/output/static` no contienen los tres secretos privados actuales. Las respuestas HTTP inspeccionadas tampoco. |
| Archivos sensibles por HTTP | En producción, `/.env` y `/.git/config` devuelven 404. En desarrollo devuelven 403. |

La configuración global del webhook desde Tus integraciones es una modalidad válida; no se considera defecto que `preference.create` no envíe `notification_url`. El tópico `payment` corresponde al flujo Checkout Pro con preferencias utilizado por este proyecto. [Documentación oficial de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).

## 2. Hallazgos que requieren resolución

**H1 — Medio, prioritario para Admin: cookies administrativas sin HttpOnly ni Secure.** `src/lib/supabaseAuthServer.js:15` crea el cliente sin `cookieOptions`; `setAll` transmite las opciones recibidas sin endurecerlas. El SDK instalado usa `httpOnly: false` y no establece `secure`. Una autenticación completamente simulada con el SDK real generó una cookie con ambos controles ausentes; SameSite=Lax sí estaba presente. Astro serializa esas opciones sin agregar ambos flags. Esto contradice `docs/02-ARQUITECTURA.md`. En esta aplicación la autenticación se realiza en servidor, por lo que el navegador no necesita leer estos tokens. Configurar ambos atributos explícitamente, con Secure para HTTPS productivo, y verificar login, renovación y logout con una sesión real antes de aprobar. No se afirma que se haya robado una sesión.

**H2 — Alto: carga de invitados vulnerable a envíos simultáneos.** En `src/pages/api/registrations/[id]/guests.js:36` se consulta si existen invitados y en la línea 51 se insertan mediante otra operación. Dos solicitudes concurrentes pueden observar la lista vacía e insertar ambas. Se reprodujo con el endpoint real y Supabase simulado: dos respuestas 201 y dos invitados insertados para una inscripción de una persona. Las migraciones versionadas no contienen una garantía que serialice esta operación. Las RPC de pago rechazarían después el grupo por cantidades incoherentes. Mover la validación e inserción a una transacción que bloquee la inscripción y conserve la idempotencia; probar concurrencia en una base aislada. No se generaron duplicados en producción.

**H3 — Alto: un segundo intento de pago puede quedar sin conciliar.** `supabase/migrations/20260831000000_mercadopago_webhook_processing.sql:63` rechaza cualquier ID distinto del primero asociado. Escenario inferido del SQL: llega un pago A rechazado o pendiente, se asocia su ID, y un pago B aprobado de la misma inscripción se descarta como `different_payment_id`. El webhook responde 200 con `processed: false`, de modo que repetir la misma notificación no corrige el problema. Además, `prepare_mercadopago_checkout` no permite reanudar normalmente cuando ya existe un provider_payment_id o el estado dejó de ser pending. Es una limitación ya documentada, pero relevante antes de cobrar. Definir y probar el manejo de intentos múltiples y su conciliación; no basta con sobrescribir IDs. La revisión es del SQL local, no de una ejecución financiera real ni de la definición SQL remota.

**H4 — Dependencias: alertas de seguridad vigentes.** La consulta al servicio de avisos de npm para 443 nombres de paquetes del lockfile devolvió 21 avisos en seis paquetes, con una alerta crítica y alertas altas. Esto es una consulta de rangos afectados; no demuestra explotación de cada aviso en esta aplicación. Resolver mediante actualización compatible o justificar una mitigación verificable antes de aprobar producción. No se instalaron paquetes ni se cambió el lockfile.

| Paquete instalado | Avisos | Evaluación |
| --- | --- | --- |
| Astro 6.4.8 | 5; uno crítico | La alerta crítica afecta el procesamiento de AVIF no confiables mediante Sharp/libheif. Se publicaron correcciones en Astro 7.2.8 con Sharp 0.35.4. Este proyecto usa fotografías locales JPEG, sin uploads ni allowlist remota de imágenes; no se demostró una ruta para introducir un AVIF malicioso. El rango afectado existe y requiere tratamiento, sin afirmar RCE comprobada. |
| Sharp 0.34.5 | 2 altos | Alertas heredadas de libvips/libheif; revisar junto con Astro. |
| @astrojs/vercel 10.0.8 | 1 moderado | El aviso exige ISR. Aquí `vercel()` usa el valor por defecto `isr=false`, y la configuración generada no contiene ruta `_isr`; esa precondición no se encontró. Corrección publicada en 11.0.3. |
| path-to-regexp 6.1.0 | 1 alto | Dependencia de `@vercel/routing-utils`; también hay una copia 6.3.0. No se probó un ataque de consumo de CPU ni se demostró exposición de un patrón vulnerable. |
| esbuild 0.27.7 | 1 bajo | Copias bajo Astro y su adaptador; aviso sobre servidor de desarrollo en Windows. La copia principal 0.28.2 queda fuera del rango del aviso. |
| undici 8.10.0 | 11, de varias severidades | Dependencia de unifont. Avisos de WebSocket, reintentos, caché, descompresión y TLS; evaluar el uso efectivo. La versión corregida indicada por los rangos es 8.10.2. |

Fuentes: [aviso primario de Astro/AVIF](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2), [aviso primario del adaptador ISR](https://github.com/withastro/astro/security/advisories/GHSA-x27w-589x-frm2), [Sharp/libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [Sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [path-to-regexp](https://github.com/advisories/GHSA-9wv6-86v2-598j). El inventario se obtuvo del endpoint oficial `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`, sin enviar secretos ni código del proyecto. Una actualización mayor requiere revisar compatibilidad y volver a probar.

**H5 — Medio: falta comprobar live_mode en el pago consultado.** `src/lib/mercadopagoWebhook.js` normaliza el pago y descarta ese atributo; el handler no contrasta el modo real del pago con el ambiente configurado. La prueba aislada confirmó que un objeto de pago con `live_mode: false` se normaliza. No se demostró que las credenciales productivas actuales puedan consultar un pago de prueba ajeno. Agregar la comprobación sobre la respuesta autenticada de Mercado Pago, nunca confiar en el cuerpo del webhook como autoridad.

## 3. Observaciones adicionales

- No hay limitación de frecuencia ni protección contra automatización en las APIs públicas de inscripción/checkout implementada en el repositorio. No se inspeccionaron reglas privadas del firewall de Vercel ni se hizo una prueba de carga. Revisar esta protección antes de difusión pública.
- Los límites de body usan `Content-Length` y luego leen el body completo. Sin ese encabezado, el límite de aplicación no mide los bytes reales; las cotas de plataforma no se verificaron. Considerar lectura acotada y controles de frecuencia.
- Supabase Auth permite altas públicas (`disable_signup=false`). La allowlist impide que una cuenta nueva sea administradora. Para un acceso sólo administrativo, revisar si corresponde deshabilitar las altas públicas. El único admin observado no tiene factores MFA verificados; no se modificó su cuenta.
- La home productiva tiene HSTS; no devuelve CSP, X-Frame-Options, X-Content-Type-Options ni Referrer-Policy explícitos. Añadir protecciones compatibles, especialmente contra framing de la administración, sin romper scripts ni fuentes. No se demostró XSS ni clickjacking.
- Las páginas de resultado de pago no establecen `private, no-store`; Vercel devuelve `public, max-age=0, must-revalidate`. No se observó una fuga de datos por caché, pero conviene definir la política explícitamente para respuestas vinculadas a una inscripción.
- `/pago/efectivo` exige payment pending y paid_at nulo para importes positivos. Después de la aprobación administrativa esos requisitos dejan de cumplirse y la misma confirmación pasaría a 404, según el código. Ajustar la vista si debe seguir disponible tras aprobar el efectivo.
- No se valida tolerancia temporal en la firma MP. La consulta autenticada del estado actual y la idempotencia SQL reducen el riesgo de cambio de estado mediante replay; revisar una política compatible con los reintentos del proveedor y controles de frecuencia.
- Reembolsos y contracargos no tienen conciliación específica: el normalizador agrupa estados desconocidos como pending y SQL conserva approved. Definir el procedimiento operativo; no se solicitó ni simuló un reembolso real.
- La arquitectura y el Sprint Master contienen afirmaciones históricas contradictorias sobre cookies, webhook y migraciones. Actualizar la documentación cuando se cierre la remediación.

## 4. Supabase: evidencia remota de sólo lectura

Las lecturas con el cliente privado encontraron 1 boda, 11 inscripciones, 7 invitados, 5 pagos y 1 entrada en `admin_users`. Sólo se mostraron conteos y resultados de comparación.

La única boda activa coincide con el slug de la aplicación, tiene pagos habilitados y coincide con precios de adultos/niños y fecha/hora de `src/config/wedding.js`.

Con la publishable key y sin sesión, las cuatro tablas de negocio devolvieron cero filas visibles; `admin_users` devolvió 401. Las mismas tablas sí contienen filas visibles para el cliente privado, lo que aporta evidencia de denegación anónima. No se verificaron permisos con una sesión authenticated no administradora.

La descripción OpenAPI disponible para el cliente privado anuncia las cuatro RPC esperadas: `confirm_cash_payment`, `prepare_mercadopago_checkout`, `apply_mercadopago_payment_result` y `approve_cash_payment`. No se ejecutó ninguna RPC remota. La descripción anónima fue denegada. Esto no certifica las definiciones SQL, los índices, las políticas ni los GRANT efectivos completos: se revisaron sus versiones locales, pero falta inspección remota del catálogo/migraciones.

Las migraciones locales habilitan RLS, restringen las RPC a service_role, fijan search_path y bloquean filas en las transacciones de pago. Los montos, moneda, estados y correlaciones se validan en servidor/SQL; los redirects no aprueban pagos.

La revisión de coherencia de todas las filas observadas detectó **0** discrepancias de cantidades por inscripción, grupos parcialmente insertados/duplicados, confirmados sin invitados completos, pagos con importe/método/estado incoherente, pagos duplicados por proveedor e inscripción, o pagos aprobados sin asistencia confirmada. Las cantidades siguen coincidiendo con la lectura inicial. Los registros existentes no se clasificaron ni eliminaron como datos de prueba.

La entrada administrativa corresponde a un usuario Auth existente con correo confirmado. No se inició sesión como esa persona ni se obtuvo su contraseña.

## 5. Pruebas de APIs y seguridad

Se hicieron 24 comprobaciones HTTP en desarrollo y otras 24 en producción. Las expectativas iniciales se ajustaron a la semántica de las respuestas: un 403 para archivos privados en desarrollo y un 404 para una ruta administrativa inexistente en producción son denegaciones válidas, no bypasses.

| Prueba | Local / producción |
| --- | --- |
| GET /, /confirmar, /admin/login | 200 / 200; fecha límite presente en home. |
| GET /admin sin sesión | 303 a /admin/login, private/no-store en ambos. |
| GET /admin/audit inexistente | 303 local; 404 en producción, sin datos administrativos. |
| Métodos GET en APIs que exigen POST | 405. |
| Registro con JSON vacío | 400, antes de cualquier inserción. |
| Referencias inválidas en read/guests/cash/MP | 400. |
| Webhook con tópico ajeno | 200 ignorado. |
| Webhook payment con ID inválido | 400. |
| Webhook payment JSON sin firma o con firma falsa | 401; no se usó una firma productiva válida. |
| Login con payload inválido | 400. |
| Login con Origin ajeno | 403. |
| Aprobar efectivo sin sesión | 401, private/no-store. |
| Confirmación de efectivo con referencia inválida | 404. |
| Return exitoso con status=approved y referencia inválida | 200 de UX informativa; sin escritura ni aprobación. |
| Acceso HTTP a .env y .git/config | 403 local, 404 producción. |

La primera pasada de POST sin Content-Type fue rechazada por Astro con 403 antes de llegar a los handlers. Se repitió con `application/json`, formato de las notificaciones MP, y se obtuvieron los resultados de la tabla. No se desactivó la protección de origen.

Se ejecutaron **43 aserciones aisladas** sobre validadores, selección de URL de checkout productiva, webhook y endpoint de aprobación administrativa. Pasaron: rechazo de precios/estados inyectados, counts inválidos, invitados incompletos/categorías incorrectas, URLs de checkout no confiables, firmas inválidas sin llamadas externas, firma sintética válida con proveedor/RPC simulados, rechazo de ID remoto discordante, errores RPC reintentables, guard administrativo y respuestas idempotentes. Además se reprodujeron H1/H2/H5; estos hallazgos no se cuentan como controles que pasaron.

Las pruebas usaron secretos y tokens sintéticos para la firma y sesión simuladas. La prueba de concurrencia no escribe Supabase. Las pruebas positivas de webhook y aprobación no ejecutan pagos/RPC reales. Los scripts auxiliares se retiraron al finalizar.

## 6. Build y preparación de despliegue

`npm run build` fue intentado y bloqueado por NVM con NVM4306 (entrypoint delegado no confiable). Se ejecutó el mismo comando de compilación del script mediante `node node_modules/astro/bin/astro.mjs build`: **PASS**, código de salida 0 y empaquetado Vercel completo. No se cambió la instalación de Node/NVM ni se desplegó.

El build local incluye las rutas de APIs/webhook/admin esperadas. No hay ISR habilitado. La home desplegada incluye el ajuste de fecha límite, pero no se pudo certificar el SHA del deployment ni sus variables privadas desde el panel.

`git diff --check`: PASS al cierre. Único archivo nuevo de esta auditoría: `docs/14-AUDITORIA-PRE-PRODUCCION.md`. Servidor local de auditoría detenido. Sin scripts temporales restantes en el repositorio.

## 7. Condiciones antes del pago real

1. Resolver H1, H2 y H3; tratar los avisos H4 y la separación de ambiente H5. Repetir sus pruebas sin usar producción como base de ensayo.
2. Verificar en Vercel Production las variables requeridas y el deployment activo sin revelar valores. Confirmar que secret y aplicación/token MP pertenecen a la misma integración.
3. Inspeccionar catálogo/migraciones/permisos remotos de Supabase y probar el rol authenticated no autorizado, además del acceso anónimo ya verificado.
4. Completar login, renovación, logout, rechazo de no-admin y vista Admin con una sesión autorizada; probar transacciones/concurrencia/idempotencia en una base aislada.
5. Verificar entrega de una notificación firmada desde el panel MP sin crear un pago, y su diagnóstico sin secretos. La recepción de firmas falsas no sustituye esta comprobación.
6. Resolver o aceptar explícitamente las observaciones aplicables de protección contra abuso, headers, caché y conciliación operativa. Repetir build y smoke tests tras la remediación y el despliegue correspondiente.

**Aún no se cumple la condición de que sólo falte el pago real.** No se solicita ni se ejecuta esa prueba. Cuando se hayan cerrado los puntos anteriores y ése sea el único paso restante, corresponde detenerse con `USER ACTION REQUIRED — REAL PAYMENT TEST`.

Confirmado: NO pagos reales; NO preferencias reales nuevas; NO escrituras DB; NO cambios Supabase, Mercado Pago, Auth o Admin; NO cambios en .env; NO db push; NO deploy; NO git add; NO commit; NO push.
