# SPRINT 14 — DEPENDENCY SECURITY CLOSURE

Fecha: 2026-09-30. Revisión local del upgrade autorizado. Este informe reemplaza
la sección de dependencias pendientes de 14-PRE-DEPLOY-FINAL.md.

Estado: **READY FOR VERCEL ENV CHECK**. Recomendación: revisar el diff y completar
la checklist Production del pre-deploy; no ejecutar deploy sin auditoría humana.

## Resultados

- npm install: PASS, sin force ni conflictos de peers.
- npm test: 151 PASS / 0 FAIL.
- npm run test:browser: 1 PASS / 0 FAIL.
- npm run test:framework: 1 PASS / 0 FAIL.
- Total: **153 PASS / 0 FAIL**, baseline 152 preservado y un smoke añadido.
- npm run build: PASS, server/adapter Vercel, plantillas y assets compilados.
- git diff --check: PASS; avisos locales LF/CRLF sin errores de whitespace.
- Secret scan: 111 archivos de texto, cero hallazgos, .env no trackeado.
- Revisión de diff/status: cambios nuevos limitados a los archivos enumerados;
  remediaciones previas del Sprint preservadas, sin cambios visuales intencionales.

## Resoluciones efectivas y rangos solicitados

| Paquete | Instalado antes → después | Range antes → después | Relación / uso |
| --- | --- | --- | --- |
| astro | 6.4.8 → 7.3.5 | ^6.4.8 → ^7.3.5 | Directa devDependency; también SSR/runtime y build |
| @astrojs/vercel | 10.0.8 → 11.0.11 | ^10.0.8 → ^11.0.11 | Directa; adapter/build/runtime |
| sharp | 0.34.5 → 0.35.5 | Astro: ^0.34.0 → ^0.35.4 | Transitiva opcional; imágenes/build/runtime |
| esbuild | 0.27.7 (Astro/adapter), 0.28.2 (Vite) → 0.28.2 deduplicada | Astro/adapter: ^0.27.3 → ^0.28.0; Vite peer opcional ^0.27.0 \|\| ^0.28.0 | Transitiva; dev/build |
| brace-expansion | 5.0.12 → 5.0.12 | minimatch: ^5.0.8, sin cambios | Transitiva de glob/minimatch/@vercel/nft; tooling |

`npm ls astro @astrojs/vercel sharp esbuild brace-expansion` final termina en 0,
sin peers inválidos. Vercel 11.0.11 requiere Astro ^7.0.0. Tailwind/Vite 4.3.3
admite Vite ^5.2.0 || ^6 || ^7 || ^8; Vite efectivo pasó de 7.3.6 a 8.3.1.
Node local 22.23.2 satisface Astro >=22.12.0 y el override previo de Undici
>=22.19.0. No se añadieron overrides de Sharp/esbuild. Se conservan los overrides
de seguridad del Sprint para path-to-regexp y Undici.

## Audit inicial y final

Inicial: 4 paquetes afectados, 9 advisories distintos; 1 paquete crítico,
1 alto, 1 moderado, 1 bajo. Final posterior a npm install: **0 vulnerabilidades**.
El conteo por paquete de npm no es el conteo de advisories. brace-expansion ya
estaba corregido antes de esta intervención, sin advisory inicial activo.

Todos los advisories siguientes quedan en categoría **A: corregido por versión**.
Las observaciones de alcance describen el código previo; no se usaron para omitir
parches. B (no alcanzable), C (sólo dev), D (major adicional) y E (bloqueo
productivo) no contienen advisories pendientes en el audit final.

| GHSA / CVE referenciado | Paquete instalado antes | Severidad | Rango vulnerable | Parche mínimo | Alcance observado antes del parche |
| --- | --- | --- | --- | --- | --- |
| [GHSA-f48w-9m4c-m7f5](https://github.com/advisories/GHSA-f48w-9m4c-m7f5), corrección incompleta de CVE-2026-54298 | Astro 6.4.8 | Moderada | <7.0.6 | 7.0.6 | SSR; spread de Button usa claves fijas, no nombres de atributos de usuario |
| [GHSA-7pw4-f3q4-r2p2](https://github.com/advisories/GHSA-7pw4-f3q4-r2p2) | Astro 6.4.8 | Baja | >=3.10.0 <7.0.4 | 7.0.4 | Sin directivas transition con valores de usuario |
| [GHSA-4g3v-8h47-v7g6](https://github.com/advisories/GHSA-4g3v-8h47-v7g6) | Astro 6.4.8 | Moderada | >=2.9.0 <=7.0.9 | 7.0.10 | Sin View Transitions configuradas |
| [GHSA-26w7-cxv4-gfx2](https://github.com/withastro/astro/security/advisories/GHSA-26w7-cxv4-gfx2) | Astro 6.4.8 | Crítica | <7.2.8 | 7.2.8 y Sharp >=0.35.4 | Optimización de imágenes en runtime potencial; assets locales fijos, sin uploads ni allowlist remota; no se certificó imposibilidad de explotación |
| [GHSA-376h-93r7-7g6f](https://github.com/advisories/GHSA-376h-93r7-7g6f) | Astro 6.4.8 | Moderada | <=7.2.3 | 7.2.4 | Sin base personalizado; middleware de seguridad sí está en runtime |
| [GHSA-x27w-589x-frm2](https://github.com/withastro/astro/security/advisories/GHSA-x27w-589x-frm2) | Vercel 10.0.8 | Moderada | >=10.0.3 <11.0.3 | 11.0.3 | ISR desactivado en vercel(); no se dependió de ello para cerrar el aviso |
| [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr) | esbuild 0.27.7 | Baja | >=0.27.3 <0.28.1 | 0.28.1 | Dev server Windows, no servidor productivo; antes provenía de Astro y adapter |
| [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), CVE-2026-33327/33328/35590/35591 | Sharp 0.34.5 | Alta | <0.35.0 | 0.35.0 | Procesamiento nativo de imágenes; superficie compartida con Astro |
| [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), libheif GHSA-g89c-p67h-r497 y GHSA-2jg2-4ch7-h545 | Sharp 0.34.5 | Alta | <0.35.4 | 0.35.4 | Procesamiento nativo de imágenes; superficie compartida con Astro |

Astro y Sharp pueden intervenir en solicitudes productivas aunque Astro esté
declarado devDependency. Esbuild es herramienta de compilación: la aplicación no
importa su API ni inicia un dev server en Vercel. La resolución efectiva elimina
sus copias vulnerables; no se agregó una excepción dev-only al audit.
El artefacto local .vercel/output/functions/_render.func incluye Sharp 0.35.5;
no contiene node_modules/esbuild/package.json. Esta inspección corresponde al
build local, no a un deployment remoto.

## Compatibilidad major

Se revisó la [guía oficial Astro 7](https://docs.astro.build/en/guides/upgrade-to/v7/):
Vite 8, compilador Rust más estricto, src/fetch reservado, Markdown nuevo y espacios
JSX por defecto. El proyecto no usa src/fetch, Markdown de aplicación, Astro DB,
internals de transitions, renderers personalizados ni flags experimentales retirados.
Se fijó compressHTML: true para conservar los espacios de Astro 6, sin editar
contenido de la boda. El cambio de compilador se valida construyendo las plantillas.

Vite 8 cambia bundler/minificación y baseline de navegadores; no hay opciones
Rollup/esbuild personalizadas que migrar. El único plugin es Tailwind compatible.
Esto no amplía soporte a navegadores antiguos: [migración oficial Vite 8](https://vite.dev/guide/migration).

SSR/API, middleware, cookies, redirects, imports de imágenes y variables conservan
las APIs usadas por el proyecto. Supabase SSR no se cambió. El smoke nuevo levanta
Astro real y Auth sintético en loopback, con envDir temporal y las siete variables
sustituidas; prueba invitación, imagen importada, formulario, admin/login, redirects
privados, pago genérico, denegación API sin token y login ficticio 401. No crea
inscripciones ni llama a proveedores remotos. El build comprueba el adapter Vercel.

## Archivos de esta intervención

- package.json: Astro/Vercel y comando test:framework.
- package-lock.json: grafo resuelto por npm install, sin audit fix --force.
- astro.config.mjs: compatibilidad de espacios.
- tests/framework/smoke.test.mjs y tests/README.md: prueba HTTP reproducible.
- docs/14-DEPENDENCY-SECURITY-CLOSURE.md y referencia en 14-PRE-DEPLOY-FINAL.md.

El resto del diff contra HEAD pertenece a las remediaciones anteriores del Sprint
y se conserva. No se modificaron fotos, estilos, contenido, lógica financiera,
migraciones ni secretos. No se agregaron logs de debug ni scripts temporales.

## Límite de la conclusión

Un audit limpio sólo cubre vulnerabilidades conocidas por npm al ejecutarlo.
Falta el chequeo humano de variables Production y smoke HTTPS/admin real tras
un deploy autorizado. El smoke local no reproduce toda la infraestructura Vercel
ni constituye comparación visual pixel a pixel. No se realizó commit, push,
deploy, db push, modificación de secretos ni pago real.
