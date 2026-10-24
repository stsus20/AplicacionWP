# Documentación del entregable

Este directorio contiene los tres puntos del requerimiento, listos para revisión y entrega.

| # | Documento | Punto | Contenido |
|---|---|---|---|
| 01 | [Planeación](01-planeacion.md) | 1 | Funciones con/sin conectividad, estrategias de caché, característica física, notificaciones, arquitectura y criterios de aceptación. |
| 02 | [Guía de integración](02-guia-integracion.md) | 2 | Código del Service Worker, offline, notificaciones, geolocalización, UI y pasos de integración. |
| 03 | [GitHub y despliegue](03-github-despliegue.md) | 3.1–3.2 | Commits, repositorio, GitHub Pages, Netlify, Vercel y Render. |
| 04 | [Evidencias](04-evidencias.md) | 3.3 | 10 capturas automáticas con explicación y justificación + plantillas manuales. |
| 05 | [Reporte de pruebas](05-reporte-pruebas.md) | 3.4 | 15 casos con resultado esperado/obtenido/estado, defectos y trazabilidad. |
| 06 | [Documento técnico](06-documento-tecnico.md) | 3.5 | APIs, parámetros, modelo de datos, seguridad, conclusiones y trabajo futuro. |

## Evidencias

Las capturas están en [`evidencias/`](evidencias/) y se regeneran con:

```powershell
node tests/e2e.mjs
```

## Orden de lectura recomendado

1. [Planeación](01-planeacion.md) — entiende el «por qué».
2. [Guía de integración](02-guia-integracion.md) — entiende el «cómo».
3. [Evidencias](04-evidencias.md) — comprueba el resultado visual.
4. [Reporte de pruebas](05-reporte-pruebas.md) — verifica la calidad.
5. [Documento técnico](06-documento-tecnico.md) — profundiza en APIs y decisiones.
6. [Despliegue](03-github-despliegue.md) — publica y entrega.

## Estado del entregable

| Entregable | Estado |
|---|---|
| Código funcional | Completo |
| Service Worker + offline | Completo |
| Notificaciones locales | Completo |
| Geolocalización | Completo |
| Manifest e iconos | Completo |
| Pruebas automatizadas | 15/15 aprobadas |
| Capturas automáticas | 10/10 generadas |
| Capturas manuales (SO, instalación) | Plantillas listas, pendientes de dispositivo |
| Documentación | Completa |
| Repositorio/URL pública | Pendiente de que el usuario lo publique |
