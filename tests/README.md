# Pruebas locales de seguridad

`npm run test:framework` ejecuta HTTP real sobre Astro con Auth ficticio local,
envDir temporal y las siete variables de aplicación reemplazadas por valores
sintéticos. Comprueba middleware, redirects, denegación privada, login 401 y una
imagen importada de la invitación. Ejecutarlo separado del build (ambos usan
el caché de Astro); no accede a DB ni proveedores remotos.

La cobertura final incluye `private-rsvp.test.mjs`: autorización de estado,
checkout y frontmatter SSR con token propio, ausente y ajeno, boda incorrecta,
retornos sin escrituras y ausencia de información privada. Los clientes son
inyectados; no sustituye una comprobación PostgREST/Vercel real. El test de Chrome
también verifica la cookie RSVP HttpOnly en API y páginas con Path=/.
`node scripts/security-scan.mjs` revisa archivos versionados/nuevos y diff sin
imprimir valores secretos; distingue fixtures sintéticos de Auth.

Ejecutar `npm test`, `npm run test:browser` y `npm run build` con Node 22.23.2/npm 10.9.8. No requieren secretos ni conexiones a Supabase/Mercado Pago. Los tests no cargan `.env`; el build de Astro conserva su mecanismo habitual de variables de entorno.

`npm test` necesita PostgreSQL 16 instalado. El helper usa por defecto `C:/Program Files/PostgreSQL/16/bin`; puede configurarse `TEST_PG_BIN` con el directorio de binarios. Crea clusters nuevos en el temporal del sistema, escucha sólo en loopback con puerto libre, aplica migraciones con fixtures y elimina exclusivamente sus propios directorios al terminar. Nunca apuntar los helpers a una base existente: no admiten DATABASE_URL y sus comandos usan explícitamente el puerto local recién creado. El usuario de sistema debe poder ejecutar initdb y pg_ctl; en Windows un sandbox con token restringido puede impedirlo.

`npm run test:browser` requiere Chrome en `C:/Program Files/Google/Chrome/Application/chrome.exe`, o `TEST_BROWSER_BIN` apuntando a Chrome/Chromium compatible con CDP. Usa navegador headless, perfil temporal y servidor loopback; no abre una ventana interactiva ni utiliza perfiles personales. Verifica cookies Secure en la excepción de loopback admitida por Chrome. La comprobación HTTPS en Vercel sigue pendiente.

Los tests de Auth utilizan el SDK Supabase SSR real con respuestas de Auth ficticias; los del webhook simulan el SDK Mercado Pago. El harness reemplaza `import.meta.env` por configuración sintética e inyecta dependencias explícitas. Las carreras de invitados, las RPC de pagos y las migraciones se prueban sobre PostgreSQL real. Esto no sustituye validar el proveedor, permisos remotos, Vercel y sesiones reales.

Si se interrumpe un proceso, revisar los clusters `wedding-security-pg-*` propios de la ejecución antes de limpiar su directorio; detenerlos con su pg_ctl y comprobar que la ruta pertenece al temporal. No eliminar directorios calculados sin verificar su destino.
