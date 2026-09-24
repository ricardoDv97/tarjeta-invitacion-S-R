# Sprint Master

## Sprint 13 — Contenido real, galería y refinamiento visual

Implementado localmente para auditoría. Sprints 01–12 aprobados según el contexto recibido; las notas inferiores conservan el registro histórico.

- 16 fotos inspeccionadas y conservadas; 1 portada y 6 imágenes en galería.
- Datos reales, Maps, aviso de confirmación y estructura compacta.
- Story eliminada; ceremonia/celebración sustituidas por fecha y ubicación; dress code genérico retirado.
- WebP responsive, prioridad de portada y carga diferida en galería.
- Sin cambios funcionales en RSVP, pagos, APIs, Auth o Admin.
- Sin videos, migraciones, db push, git add, commit ni push. Sprint 14 no iniciado.
- Evidencia y limitaciones en [el informe](13-SPRINT-INFORME.md).

## Registro histórico

## Sprint 12 — Dashboard Admin

Estado: implementado localmente, pendiente de auditoría y aplicación manual de la migración.

- Dashboard SSR responsive con resumen y tablas de registrations, guests y payments.
- Búsqueda por nombre, apellido o registration ID y filtros por asistencia, pago y método.
- Acceso discreto desde el footer y navegación/logout administrativos.
- Endpoint protegido por sesión, allowlist y same-origin.
- RPC atómica e idempotente para aprobar únicamente efectivo pendiente.
- Sin paginación en este MVP (<200 invitados); sin cambios a Mercado Pago ni alcance de Sprint 13.

## Sprint 11 — estado local

Autenticación administrativa preparada para auditoría: login con Supabase Auth, sesión SSR en cookies, allowlist `admin_users`, guard server-side y logout. La migración no fue aplicada y el primer admin debe crearse manualmente. El alcance termina en Sprint 11; el dashboard de Sprint 12 no está implementado.

Implementación local actual: Sprint 10 preparado para auditoría. Incluye Webhook firmado, consulta real del payment y transición atómica. La migración, el secret, la configuración externa y el E2E permanecen pendientes; Sprint 11 no fue iniciado.

Estado actual: Sprint 10 implementado localmente y pendiente de auditoría, migración remota, configuración externa y E2E sandbox.

1. Inicialización
2. Design System
3. Invitación pública
4. Responsive y animaciones
5. Supabase y modelo de datos
6. RSVP
7. Registro de invitados
8. Pago en efectivo
9. Mercado Pago
10. Webhook Mercado Pago
11. Autenticación administrador
12. Dashboard administrador
13. Contenido real, galería y refinamiento visual

El alcance actual termina en el Sprint 10. La nueva migración permanece local para auditoría y no fue aplicada remotamente.
