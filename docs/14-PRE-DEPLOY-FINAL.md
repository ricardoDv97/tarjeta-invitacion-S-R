# SPRINT 14 — PRE-DEPLOY FINAL

Actualización posterior: ver [cierre de dependencias](14-DEPENDENCY-SECURITY-CLOSURE.md)
para versiones y audit vigentes. Los resultados de dependencias de este documento
se conservan como baseline histórico previo al upgrade autorizado.

Fecha: 2026-09-30. Estado: **READY FOR VERCEL ENV CHECK**.
Este estado permite revisar configuración; no aprueba un deploy con dependencias pendientes.

## Autorización e integración

El UUID identifica, pero no autoriza. Estado, checkout, confirmación de efectivo,
formulario de invitados y datos privados de páginas de pago requieren cookie de
management token, hash coincidente y boda activa del slug esperado. La creación
pública genera el token aleatorio y guarda sólo su hash. La cookie es HttpOnly,
SameSite=Lax, Secure fuera de HTTP loopback, Path=/ y dura 24 horas en el navegador.
No se acepta token por URL, JSON, localStorage ni sessionStorage. Las respuestas
del flujo usan Cache-Control privado/no-store y Referrer-Policy no-referrer.

Invitados usa save_registration_guests(uuid,jsonb,text): la RPC repite autorización
y validación de boda bajo bloqueo. Checkout/efectivo autorizan antes de llamar sus
RPC exclusivas de service_role. Admin y webhook tienen autenticación independiente.
Los retornos de Mercado Pago sin autorización muestran contenido genérico y no
escriben en DB. Ningún status de query string aprueba un pago.

El webhook firmado consulta al proveedor, verifica ambiente y correlación con la
preferencia (incluida merchant order cuando corresponde), y llama a la RPC de
resultados. mercadopago_payment_attempts mantiene intentos separados de la fila
contable; reintentos y concurrencia no duplican contabilización. Una segunda
aprobación queda marcada para revisión. No se realizaron pagos reales.

Las tres migraciones congeladas no se modificaron. Su aplicación y grants/RLS
remotos corresponden a la evidencia declarada por el usuario: contadores de
integridad cero, una boda esperada y 12 registros QA sin token. Estos 12 siguen sin
edición pública. Esta intervención no volvió a conectarse a la DB remota.

## Evidencia local

- npm test: **151 PASS / 0 FAIL**, incluyendo PostgreSQL 16 desechable real.
- npm run test:browser: **1 PASS / 0 FAIL** con Chrome y perfil temporal.
- Total: **152 PASS / 0 FAIL**.
- npm run build: **PASS**, salida server con adapter Vercel.
- git diff --check: **PASS**, sin errores de whitespace (avisos LF/CRLF locales).
- Autorización: token ausente, incorrecto, ajeno, UUID manipulado/desconocido,
  otra boda, boda inactiva y legacy; propio permitido; checkout permitido/denegado;
  ningún detalle privado ni escritura por redirect falsificado.
- Admin: credenciales ficticias rechazadas con 401, sesión ausente redirigida,
  cookies HttpOnly/Secure/Lax en login, refresh y logout.
- Los tests de endpoints/SSR inyectan clientes; ejecutan frontmatter de Astro,
  no una sesión real PostgREST/Vercel. El build comprueba las plantillas.
- El navegador comprueba que la cookie RSVP llega a API y páginas y es invisible
  a document.cookie. Secure usa la excepción de loopback; falta smoke HTTPS real.
- Secret scan reproducible: node scripts/security-scan.mjs. Sin hallazgos de
  secretos reales; .env ignorado y no trackeado. Fixtures sintéticos de Auth
  identificados aparte. El escaneo por patrones no garantiza detectar todo secreto.

## Dependencias

npm audit final: 4 paquetes afectados (1 crítico, 1 alto, 1 moderado, 1 bajo),
exit 1 esperado. No se utilizó audit fix --force ni se aplicaron majors.

| Paquete | Actual / parche disponible | Severidad | Tipo y ejecución | Decisión / exposición observada |
| --- | --- | --- | --- | --- |
| Astro | 6.4.8 / 7.2.8 para todos sus avisos propios; audit propone 7.3.5 | Crítica máxima | Directa, declarada dev pero usada en SSR y build | Major pendiente. Imágenes locales fijas, sin uploads ni dominios remotos autorizados. No se identificó entrada AVIF no confiable; esto no demuestra imposibilidad de explotación en producción. |
| @astrojs/vercel | 10.0.8 / 11.0.3; audit propone 11.0.11 | Moderada | Directa, adapter/build/runtime | Major pendiente. Configuración vercel() sin ISR; la condición ISR del aviso no está activada. |
| sharp | 0.34.5 / 0.35.4 | Alta | Transitiva opcional, imágenes en build/runtime | Minor 0.x fuera de ^0.34, no compatible por semver; no forzar override nativo. Actualizar con Astro. Misma limitación de entrada de imágenes. |
| esbuild | 0.27.7 anidado / 0.28.1 | Baja | Transitiva, build/dev | Minor 0.x fuera del rango; dev server Windows, no servidor productivo. Copia raíz 0.28.2 ya corregida. Actualizar con padres. |
| brace-expansion | 5.0.9 → 5.0.12 aplicado | Alta máxima antes; limpio después | Transitiva de minimatch, herramientas/globs | Patch compatible aplicado. No globs de usuario identificados. |

Avisos individuales de Astro: spread attributes XSS (moderado, parche 7.0.6),
transition directives XSS (bajo, 7.0.4), View Transition properties XSS (moderado,
7.0.10), base path boundary (moderado, 7.2.4), AVIF RCE (crítico, 7.2.8 con
Sharp 0.35.4). No hay atributos spread/transition alimentados por usuario ni base
personalizado en la configuración revisada. Son inferencias de alcance del código,
no sustitutos de aplicar parches. Ver [aviso AVIF del mantenedor](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2).

Sharp incluye libvips (alto, 0.35.0) y libheif (alto, 0.35.4). esbuild corresponde
a lectura de archivos por dev server Windows (bajo, 0.28.1). Vercel corresponde a
override de rutas en ISR (moderado, 11.0.3): [aviso del mantenedor](https://github.com/withastro/astro/security/advisories/GHSA-x27w-589x-frm2).

## Checklist manual Vercel Production

Abrir Project → Settings → Environment Variables → Production. No copiar valores
al informe ni al chat. El archivo local .env no acredita configuración en Vercel.

- [ ] PUBLIC_SUPABASE_URL: proyecto remoto auditado.
- [ ] PUBLIC_SUPABASE_PUBLISHABLE_KEY: clave pública del mismo proyecto.
- [ ] SUPABASE_SECRET_KEY: secreto backend del mismo proyecto, marcado sensible.
- [ ] MERCADOPAGO_ACCESS_TOKEN: secreto backend de la cuenta productiva correcta.
- [ ] MERCADOPAGO_ENVIRONMENT: coincide con el ambiente productivo solicitado.
- [ ] MERCADOPAGO_WEBHOOK_SECRET: secreto backend correspondiente al webhook.
- [ ] PUBLIC_SITE_URL: coincide exactamente con el origen HTTPS indicado por el usuario.
- [ ] Las siete están asignadas a Production; secretos sin prefijo PUBLIC_.
- [ ] Runtime Node 22 compatible con las dependencias instaladas.

## Archivos y revisión del alcance

Se revisó el diff contra HEAD, incluyendo cambios previos del Sprint, y archivos
nuevos. No se cambiaron fotos, estilos ni diseño. La navegación denegada sin token
es un cambio intencional de seguridad. No se incorporaron scripts temporales ni
logs de depuración en runtime; los scripts nuevos son herramientas reproducibles.

| Clase | Archivos |
| --- | --- |
| Security | src/lib/registrationManagement.js, src/lib/supabaseAuthServer.js, src/middleware.js; API registrations/index.js, [id].js, [id]/guests.js; confirmar/invitados.astro; pago/efectivo.astro, error.astro, exitoso.astro; scripts/security-scan.mjs |
| Database integration | Tres supabase/migrations/20260929*.sql y 20260930000000*.sql ya congeladas; scripts/prepare-reviewed-migrations.mjs; docs/14-APLICACION-CONTROLADA/ |
| Mercado Pago | src/lib/mercadopago.js, mercadopagoWebhook.js; API webhooks/mercadopago.js y registrations/[id]/mercadopago.js, cash.js |
| Dependency | package.json y package-lock.json; scripts de tests/overrides del Sprint y patch de brace-expansion |
| Tests | tests/*.test.mjs, tests/helpers/, tests/browser/cookies.test.mjs, tests/README.md |
| Docs | docs/14-*.md, docs/14-PREFLIGHT-READ-ONLY.sql y paquete controlado; informes anteriores son evidencia histórica |

## Riesgos y siguiente paso humano

Revisar variables y este diff. Antes de aprobar deploy, resolver la actualización
coordinada Astro/Vercel y transitivas en una tarea autorizada para majors, o registrar
una decisión explícita sobre los avisos restantes con evidencia de exposición.
No presentar el audit como limpio. Falta comprobar configuración remota efectiva,
HTTPS y sesión admin real: después de un deploy autorizado, verificar login real,
allowlist, navegación protegida, refresh/logout y ausencia de datos tras logout,
sin publicar credenciales. El webhook real tampoco se ejercitó con pagos.

Perder o expirar la cookie impide recuperar edición usando únicamente el UUID;
los registros QA legacy conservan ese bloqueo por decisión del usuario.
No hubo commit, push, deploy, db push, cambios de secretos ni datos productivos.
