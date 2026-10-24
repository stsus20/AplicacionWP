# Punto 3.4 — Reporte formal de pruebas

> **Proyecto:** Alerta Campus — Registro de Incidencias (PWA)
> **Versión evaluada:** 1.0.0 · Service Worker `v5.0.1`
> **Fecha de ejecución:** 24 de octubre de 2026, 08:44 (America/Mexico_City)
> **Responsable:** Equipo de desarrollo Full Stack
> **Tipo de prueba:** caja negra, funcional y de integración, automatizada con Edge headless + CDP
> **Resultado global:** **15/15 casos aprobados (100 %)**

---

## 1. Identificación del entorno

| Elemento | Valor |
|---|---|
| Sistema operativo | Windows 11 |
| Navegador | Microsoft Edge 156.0.4314.42 (headless) |
| Motor de automatización | Chrome DevTools Protocol (CDP) vía WebSocket |
| Node.js | v26.5.1 |
| Servidor de pruebas | `node server.js` en `http://127.0.0.1:3100` |
| Base de datos | `tests/.tmp/db.json` (aislada, 3 incidencias semilla) |
| Viewport | 390 × 844 (móvil) y 1280 × 800 (escritorio) |
| Service Worker | `alerta-campus-precache-v5.0.1` |
| Almacenamiento | IndexedDB `incidenciasDB` |
| Red | CDP `Network.emulateNetworkConditions` (online/offline) |
| Geolocalización | CDP `Emulation.setGeolocationOverride` (19.4326, -99.1332, ±25 m) |
| Permisos | CDP `Browser.grantPermissions` / `Browser.setPermission` |

---

## 2. Alcance y criterios de entrada/salida

### 2.1 Alcance

Se verifican los requisitos del entregable:

- Service Worker: registro, instalación, activación, precache y actualización.
- Estrategias de caché: Network First (navegación), Stale-While-Revalidate (estáticos),
  Cache First (imágenes), Network Only (API).
- Funcionamiento offline: recarga, CRUD, persistencia y cola.
- Sincronización: envío al reconectar, descarga remota e idempotencia.
- Notificaciones: permiso por gesto, `showNotification`, disparador de prioridad Alta.
- Geolocalización: éxito, denegación, error y guardado sin ubicación.
- Manifest e instalabilidad.
- Responsive y consola sin excepciones.

### 2.2 Fuera de alcance

- Autenticación y autorización.
- Notificaciones push con servidor.
- Cámara/fotografía.
- Pruebas de carga y estrés.
- Pruebas en iOS/Safari reales (se documentan como pendientes manuales).
- Accesibilidad auditada con lector de pantalla (se revisan aspectos básicos).

### 2.3 Criterios de entrada

- Código desplegado en el servidor local.
- Base de datos de prueba limpia.
- Navegador con perfil nuevo (sin caché ni permisos previos).
- Edge y Node disponibles.

### 2.4 Criterios de salida

- Todos los casos críticos aprobados.
- Ningún defecto bloqueante abierto.
- Evidencias archivadas y reproducibles.

---

## 3. Resumen de resultados

| Estado | Casos | Porcentaje |
|---|---:|---:|
| Aprobado | 15 | 100 % |
| Fallido | 0 | 0 % |
| **Total** | **15** | **100 %** |

| ID | Caso | Estado |
|---|---|---|
| CP-01 | Carga inicial, Service Worker y caché offline | Aprobado |
| CP-02 | Manifest e instalabilidad | Aprobado |
| CP-03 | Permiso y notificación local de prueba | Aprobado |
| CP-04 | Geolocalización: permiso concedido y captura | Aprobado |
| CP-05 | Alta de incidencia con ubicación y sincronización | Aprobado |
| CP-06 | Disparador: incidencia de prioridad Alta | Aprobado |
| CP-07 | Geolocalización: permiso denegado | Aprobado |
| CP-08 | Funcionamiento offline con recarga | Aprobado |
| CP-09 | Alta de incidencia sin conexión | Aprobado |
| CP-10 | Reconexión y sincronización automática | Aprobado |
| CP-11 | Idempotencia ante reintentos | Aprobado |
| CP-12 | Persistencia local tras recarga | Aprobado |
| CP-13 | Eliminación de incidencia | Aprobado |
| CP-14 | Diseño responsive de escritorio | Aprobado |
| CP-15 | Consola del navegador | Aprobado |

---

## 4. Reporte detallado

### CP-01 — Carga inicial, Service Worker y caché offline

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Abrir la PWA con red y comprobar el registro/activación del SW y el precache. |
| **Resultado esperado** | La app carga, el SW queda `activated`, controla la página y el precache contiene los recursos del shell. |
| **Resultado obtenido** | Total 3 incidencias; SW `Activo · activated`; caché `24 recursos · 1 caché(s)`; almacenamiento `IndexedDB`; `controller: true`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-01](04-evidencias.md#e-01--carga-inicial-service-worker-y-estado-en-línea) · `docs/evidencias/01-home-online.png` |

### CP-02 — Manifest e instalabilidad

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Leer el manifest desde el navegador y consultar los errores de instalabilidad. |
| **Resultado esperado** | Manifest válido, nombre, iconos 192×192 y 512×512, sin errores críticos. |
| **Resultado obtenido** | Manifest `Alerta Campus — Registro de Incidencias`; 4 iconos; `installabilityErrors: []`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-02](04-evidencias.md#e-02--diagnóstico-interno-de-la-pwa) · `docs/evidencias/02-diagnostico-pwa.png` |

### CP-03 — Permiso y notificación local de prueba

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Conceder el permiso y pulsar «Probar notificación»; consultar `getNotifications()`. |
| **Resultado esperado** | Permiso concedido y notificación consultable con título, cuerpo y tag. |
| **Resultado obtenido** | `[{ title:"Alerta Campus", body:"Las notificaciones locales funcionan. Toca para abrir el historial.", tag:"alerta-campus-prueba" }]`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-03](04-evidencias.md#e-03--permiso-y-notificación-local) · `docs/evidencias/03-notificacion.png` |

### CP-04 — Geolocalización: permiso concedido y captura

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Pulsar «Obtener ubicación» con permiso concedido y posición simulada. |
| **Resultado esperado** | Se muestran latitud, longitud y precisión; el formulario sigue usable. |
| **Resultado obtenido** | `19.43260, -99.13320 · ±25 m`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-04](04-evidencias.md#e-04--geolocalización-permiso-concedido-y-captura) · `docs/evidencias/04-geolocalizacion.png` |

### CP-05 — Alta de incidencia con ubicación y sincronización

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Guardar la incidencia con ubicación y verificar la tarjeta, el enlace al mapa y el servidor. |
| **Resultado esperado** | La incidencia se guarda, muestra enlace al mapa y llega al servidor con `lat/lng`. |
| **Resultado obtenido** | Tarjeta «Fuga de agua en el laboratorio 3», badge Enviada, enlace de mapa presente; servidor `19.4326, -99.1332`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-05](04-evidencias.md#e-05--historial-con-ubicación-y-sincronización) · `docs/evidencias/05-historial-geo.png` |

### CP-06 — Disparador: incidencia de prioridad Alta

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Guardar una incidencia con prioridad Alta y comprobar la notificación emitida. |
| **Resultado esperado** | Se emite una notificación con título «Incidencia de prioridad Alta» y tag por id. |
| **Resultado obtenido** | Notificación `{ title:"Incidencia de prioridad Alta", body:"Fuga de agua en el laboratorio 3 · …", tag:"incidencia-841ca7e8-…" }`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-03](04-evidencias.md#e-03--permiso-y-notificación-local) · payload en `tests/results/report.json` |

### CP-07 — Geolocalización: permiso denegado

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Denegar el permiso de ubicación y pulsar «Obtener ubicación». |
| **Resultado esperado** | Mensaje claro y posibilidad de guardar sin ubicación. |
| **Resultado obtenido** | «Permiso de ubicación denegado. Habilítalo en los ajustes del navegador o del sistema.»; el botón Guardar sigue activo. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-06](04-evidencias.md#e-06--geolocalización-permiso-denegado) · `docs/evidencias/06-geo-denegado.png` |

### CP-08 — Funcionamiento offline con recarga

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Poner el navegador offline y recargar la app. |
| **Resultado esperado** | La app recarga, conserva los datos y muestra «Sin conexión». |
| **Resultado obtenido** | Estado `Sin conexión`; total 4; `controller: true`; caché `34 recursos · 2 caché(s)`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-07](04-evidencias.md#e-07--modo-offline-con-recarga) · `docs/evidencias/07-offline.png` |

### CP-09 — Alta de incidencia sin conexión

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Crear una incidencia sin red y revisar el historial. |
| **Resultado esperado** | Se guarda en IndexedDB y queda con badge Pendiente. |
| **Resultado obtenido** | Pendientes: 1; badge `Pendiente`; contador de la pestaña: 1. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-08](04-evidencias.md#e-08--alta-de-incidencia-sin-conexión) · `docs/evidencias/08-pendiente-offline.png` |

### CP-10 — Reconexión y sincronización automática

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Restaurar la red y esperar el evento `online`. |
| **Resultado esperado** | La cola se envía y el contador queda en cero. |
| **Resultado obtenido** | Incidencia presente en el servidor; pendientes: 0; aviso «1 cambio(s) sincronizado(s)». |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-09](04-evidencias.md#e-09--reconexión-y-sincronización-automática) · `docs/evidencias/09-sincronizado.png` |

### CP-11 — Idempotencia ante reintentos

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Enviar dos POST con el mismo `id` y contar las copias. |
| **Resultado esperado** | No se duplica el registro. |
| **Resultado obtenido** | Respuestas `201/200`; copias en servidor: 1. |
| **Estado** | **Aprobado** |
| **Evidencia** | `tests/results/report.json` |

### CP-12 — Persistencia local tras recarga

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Recargar la app y verificar que las incidencias siguen. |
| **Resultado esperado** | IndexedDB conserva los datos. |
| **Resultado obtenido** | Total tras recarga: 6. |
| **Estado** | **Aprobado** |
| **Evidencia** | `tests/results/report.json` |

### CP-13 — Eliminación de incidencia

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Eliminar una incidencia y verificar el borrado local y remoto. |
| **Resultado esperado** | La incidencia desaparece del historial y del servidor tras sincronizar. |
| **Resultado obtenido** | Eliminada en servidor: `true`. |
| **Estado** | **Aprobado** |
| **Evidencia** | `tests/results/report.json` |

### CP-14 — Diseño responsive de escritorio

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Cambiar a 1280×800 y medir el contenedor y la navegación. |
| **Resultado esperado** | La app se centra a 600 px y la navegación permanece fija. |
| **Resultado obtenido** | Ancho 600 px; `position: fixed`. |
| **Estado** | **Aprobado** |
| **Evidencia** | [E-10](04-evidencias.md#e-10--diseño-responsive-de-escritorio) · `docs/evidencias/10-escritorio.png` |

### CP-15 — Consola del navegador

| Campo | Detalle |
|---|---|
| **Caso de prueba** | Revisar excepciones y errores de consola durante todo el recorrido. |
| **Resultado esperado** | Sin excepciones de JavaScript. |
| **Resultado obtenido** | Sin excepciones. |
| **Estado** | **Aprobado** |
| **Evidencia** | `tests/results/report.json` (`summary.logs: []`) |

---

## 5. Pruebas manuales pendientes (dispositivo real)

Estas pruebas no se pueden capturar de forma fiable en headless; deben ejecutarse antes de la
entrega final y adjuntar las capturas M-01 a M-05 descritas en
[04-evidencias.md §5](04-evidencias.md#5-plantillas-para-capturas-manuales).

| ID | Caso | Resultado esperado | Estado |
|---|---|---|---|
| M-01 | Prompt nativo de permiso de ubicación | El navegador muestra el diálogo solo al pulsar «Obtener ubicación». | Pendiente |
| M-02 | Banner nativo de notificación | El SO muestra la notificación con título, cuerpo e icono. | Pendiente |
| M-03 | Aviso de nueva versión del SW | Aparece el banner, «Actualizar» activa la nueva versión y recarga una vez. | Pendiente |
| M-04 | Instalación en Android/escritorio | Se instala y abre en modo standalone. | Pendiente |
| M-05 | Instalación/añadir a inicio en iOS | Se añade desde Compartir y abre sin barra de Safari. | Pendiente |
| M-06 | Notificación en iOS instalado (16.4+) | El permiso y la notificación funcionan tras instalar. | Pendiente |
| M-07 | Geolocalización real al aire libre | Coordenadas y precisión coherentes; tiempo < 12 s. | Pendiente |
| M-08 | Geolocalización en interior/sin GPS | Mensaje de error claro; se puede guardar sin ubicación. | Pendiente |
| M-09 | Lectura con VoiceOver/TalkBack | Los campos y botones tienen nombres accesibles. | Pendiente |
| M-10 | Rotación y zoom 200 % | La UI no se rompe ni pierde acciones. | Pendiente |

> Los casos manuales no se marcan como «Fallido»: están **pendientes de ejecución** en el
> dispositivo de la entrega. El código y las capturas automáticas cubren su comportamiento
> funcional.

---

## 6. Defectos y observaciones

| # | Tipo | Descripción | Severidad | Estado |
|---|---|---|---|---|
| O-01 | Observación | En headless no se renderiza el banner nativo del SO; se verifica con `getNotifications()`. | Baja | Aceptada |
| O-02 | Observación | La geolocalización de las capturas es simulada por CDP; en dispositivo real cambia. | Baja | Aceptada |
| O-03 | Observación | En hosting estático (Pages/Netlify/Vercel) la API no existe; la sincronización queda pendiente. | Media | Documentada |
| O-04 | Observación | `db.json` es un archivo local; en Render free el filesystem es efímero. | Media | Documentada |
| O-05 | Observación | No hay autenticación; no usar con datos personales reales sin añadirla. | Alta (producción) | Documentada |
| O-06 | Observación | iOS requiere instalar la PWA para notificaciones web (16.4+). | Media | Documentada |
| D-01 | Defecto corregido | El `sync()` inicial no descargaba cambios remotos si no había pendientes. | Media | Corregido |
| D-02 | Defecto corregido | El manifest original no tenía iconos PNG 192/512 y referenciaba un maskable inexistente. | Media | Corregido |
| D-03 | Defecto corregido | El SW original era solo Network First y no precargaba el shell completo. | Alta | Corregido |

No quedan defectos bloqueantes abiertos.

---

## 7. Datos de prueba y limpieza

### 7.1 Datos semilla

| id | Título | Prioridad | Ubicación |
|---|---|---|---|
| `seed-luminaria` | Luminaria fundida en el pasillo B | Media | — |
| `seed-fuga` | Fuga de agua en el baño de profesores | Alta | 19.4326, -99.1332 |
| `seed-basura` | Contenedor de basura lleno | Baja | — |

Durante la ejecución se crean:

- «Fuga de agua en el laboratorio 3» (Alta, con GPS).
- «Árbol caído frente a la biblioteca» (Media, offline).
- «Prueba de idempotencia» (Baja, dos POST).
- Una eliminación de «Árbol caído…».

### 7.2 Limpieza

El arnés usa `tests/.tmp/db.json` y un perfil de Edge temporal; al terminar elimina el perfil.
Para reiniciar:

```powershell
Remove-Item tests\.tmp\db.json -Force -ErrorAction SilentlyContinue
node tests\e2e.mjs
```

No se modifica `db.json` de desarrollo.

---

## 8. Trazabilidad requisito → caso de prueba

| Requisito | Casos |
|---|---|
| Service Worker registrado/activo | CP-01, CP-08 |
| Instalación, activación y actualización | CP-01, CP-02, M-03 |
| Estrategia Cache First | CP-01, CP-08 |
| Estrategia Network First | CP-08 |
| Precarga de recursos | CP-01 |
| Funcionamiento offline | CP-08, CP-09, CP-12 |
| Notificaciones: permiso y disparo | CP-03, CP-06, M-02 |
| Geolocalización: éxito | CP-04, CP-05, M-01 |
| Geolocalización: error/denegación | CP-07, M-08 |
| Sincronización e idempotencia | CP-05, CP-10, CP-11 |
| CRUD completo | CP-05, CP-09, CP-12, CP-13 |
| Manifest e instalación | CP-02, M-04, M-05 |
| Responsive | CP-14 |
| Calidad de ejecución | CP-15 |

---

## 9. Conclusión y firma

La PWA cumple los requisitos funcionales del entregable: shell offline-first, Service Worker
con estrategias diferenciadas, precache, CRUD sin red, sincronización idempotente,
notificaciones locales y geolocalización con manejo de errores. Los 15 casos automatizados
pasan al 100 %. Las pruebas manuales de diálogos nativos, instalación en dispositivos y
accesibilidad quedan documentadas como pendientes para la validación final en hardware real.

| Rol | Nombre | Fecha |
|---|---|---|
| Desarrollo Full Stack | Equipo Alerta Campus | 24/10/2026 |
| Revisión de pruebas | ______________________ | ____/____/______ |
| Aprobación | ______________________ | ____/____/______ |

---

## 10. Reproducción

```powershell
# 1. Servidor de desarrollo
node server.js

# 2. Pruebas E2E (genera capturas y reporte)
node tests/e2e.mjs

# 3. Resultado
Get-Content tests\results\report.json
```

El reporte crudo está en [`tests/results/report.json`](../tests/results/report.json).

