# SPRINT 13 — INFORME

Estado: COMPLETADO. Pendiente de auditoría.

1. **Estado inicial:** invitación con Hero sin foto, galería vacía, Story, ceremonia, celebración, dress code y ubicación de demostración. El árbol sólo tenía src/assets/ sin seguimiento.
2. **Fotos encontradas:** 16 JPEG, imagen-1.jpg a imagen-16.jpg. Todas inspeccionadas visualmente en una hoja de contacto. Nueve horizontales y siete verticales; originales conservados sin cambios.
3. **Hero:** imagen-10.jpg, pareja bajo los árboles; composición central apta para recorte responsive.
4. **Galería:** imagen-8.jpg, imagen-3.jpg, imagen-14.jpg, imagen-11.jpg, imagen-13.jpg e imagen-4.jpg. Se alternan retratos, detalles, paisaje y blanco y negro.
5. **Secciones eliminadas:** Story y toda su configuración/import; DressCode por falta de información real. Se retiraron también los componentes Ceremony y Celebration.
6. **Secciones fusionadas:** la presentación del evento se concentra en fecha/horario y ubicación. No se presupone una ceremonia separada.
7. **Textos eliminados:** mensajes de “Muy pronto”, “Próximamente”, “A confirmar”, descripción genérica de galería y cierre “Hecho con amor…”.
8. **Textos finales:** Hero “Sabri & Ri / Nos casamos / 19 · 12 · 2026”; “Reservá la fecha”; “Sábado 19 de diciembre de 2026”; “18:00 a 00:00 hs”; galería “Nosotros / Algunos momentos antes de comenzar un nuevo capítulo.”; ubicación y RSVP con el texto solicitado.
9. **Spacing:** padding por sección de 32–56 px en lugar de 64–128 px, limitado a la invitación pública; headings con margen de 24 px; galería con separaciones de 12 px; footer de 32 px por lado.
10. **Hero:** altura 82svh móvil / 85svh escritorio, object-fit cover, overlay inferior para legibilidad y texto corto. La fuente responsive considera el recorte alto en móvil.
11. **Aviso inicial:** “Para confirmar tu asistencia, deslizá hasta el final.”, con flecha decorativa y enlace a #rsvp.
12. **Galería:** columnas CSS sin librerías: una hasta 599 px, dos desde 600 px, tres desde 1024 px. Imágenes completas, sin estirar ni forzar proporciones.
13. **Ubicación:** Finca de Oficiales del Servicio Penitenciario de Misiones. URL exacta https://maps.app.goo.gl/bp1X7bPJ3mufhSqv7, target="_blank", rel="noopener noreferrer". Sin dirección postal inventada ni mapa ficticio.
14. **RSVP:** “¿Nos acompañás?” y texto solicitado, CTA “Confirmar asistencia” a /confirmar. Slug, precios, categorías, APIs y lógica funcional preservados.
15. **Footer:** nombres, fecha, agradecimiento y acceso administrador discreto con contraste mejorado.
16. **Responsive:** PASS en Chrome a 320, 375, 390, 768, 1024 y 1440 px: sin elementos desbordados; siete imágenes cargadas; sobre abierto y contador activo. Capturas revisadas de escritorio y del viewport móvil de 320 × 900: rostros visibles y Hero de 738 px (82svh).
17. **Performance:** Astro Image, WebP, srcset y sizes; portada eager/fetchpriority high, límite base 1920 px; galería lazy/async, límite base 960 px y variantes 320/480/720/960. Sin dependencias nuevas.
18. **Accesibilidad:** alt breves en las siete imágenes, encabezados y secciones etiquetados, flecha decorativa oculta a lectores, foco visible y reduced-motion preservados. Hora del contador corregida a 18:00 UTC−03:00.
19. **Archivos creados:** este informe. Las fotos de src/assets/boda ya estaban presentes y siguen sin seguimiento.
20. **Archivos modificados:** README.md; docs/04-SPRINT-MASTER.md; src/config/wedding.js; src/pages/index.astro; src/styles/global.css; Footer.astro; Hero.astro; Countdown.astro; Gallery.astro; Location.astro; RSVP.astro. Eliminados: Story.astro, Ceremony.astro, Celebration.astro y DressCode.astro.
21. **Build:** PASS final: npm run build, salida 0, empaquetado Vercel completo (2m 2s). Node v22.23.2. NVM bloqueó npm dentro del sandbox; la ejecución autorizada fuera del sandbox avanzó. Se desactivó telemetría sólo en el entorno del proceso.
22. **Pruebas manuales:** GET /, /confirmar y /admin/login → 200. Inspección visual de Hero, aviso, galería, ubicación, RSVP y footer. URL Maps y atributos externos verificados; CTA a /confirmar y acceso administrador presentes. RSVP: 2 adultos + 1 niño + 1 menor = 4 personas / $80.000, sin enviar el formulario. Sin errores JS ni imágenes 404 en la pasada final. Al principio, el perfil temporal de Chrome dentro del proyecto provocó recargas de Vite; se retiró del repositorio, se reinició el servidor y se repitió el QA correctamente.
23. **git diff --check:** PASS; sólo advertencias de conversión LF/CRLF de Git.
24. **git status:** 11 archivos modificados, 4 componentes eliminados; informe nuevo y src/assets/ sin seguimiento. Sin archivos auxiliares de QA en el repositorio; los originales ya estaban sin seguimiento al comenzar.
25. **Riesgos/observaciones:** no se ejecutan pagos ni escrituras en Supabase durante el QA visual. Las pruebas de interfaz y comparación del diff no sustituyen un E2E de pagos/Auth. El texto preexistente del formulario dice “1 a 5 años”; se conserva por estar fuera del cambio de categorías solicitado.

Confirmado: NO videos; NO Sprint 14; NO migraciones; NO db push; NO git add; NO commit; NO push.

Pendiente de auditoría antes de cualquier git add, commit o push.
