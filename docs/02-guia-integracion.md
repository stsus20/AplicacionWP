# Punto 2 — Guía de programación e integración

> **Objetivo:** explicar cómo está implementado cada requisito y cómo trasladar los
> fragmentos a otra PWA sin romper la arquitectura.
> **Código fuente:** [`sw.js`](../sw.js), [`js/`](../js/), [`index.html`](../index.html), [`manifest.json`](../manifest.json).

---

## 1. Requisitos previos

| Requisito | Detalle |
|---|---|
| Navegador | Chrome/Edge 90+, Firefox 90+, Safari iOS 16.4+ (notificaciones instaladas). |
| Contexto seguro | `https://` o `http://localhost` / `http://127.0.0.1`. Sin esto no hay Service Worker ni geolocalización. |
| Servidor | Node.js 18+ para `server.js` (sin dependencias). |
| Codificación | UTF-8; rutas relativas para funcionar en subcarpetas (GitHub Pages). |
| MIME | `.js` como `text/javascript`, `.json` como `application/json`, `.webmanifest` como `application/manifest+json`. |

### Puesta en marcha local

```bash
# 1. Desde la raíz del proyecto
node server.js
# → http://localhost:3000

# 2. Abrir en el navegador y comprobar:
#    - Tarjeta "Estado de la PWA" → Service Worker activo
#    - DevTools → Application → Service Workers
#    - DevTools → Application → Cache Storage
```

> El Service Worker **no funciona abriendo `index.html` con doble clic** (`file://`).
> Siempre debe servirse por HTTP/HTTPS.

---

## 2. Mapa de correspondencia requisito → código

| Requisito del entregable | Archivo | Funciones / bloques |
|---|---|---|
| Registro del SW en el cliente | `js/pwa.js` | `initPWA()`, `applyUpdate()` |
| Instalación, activación y actualización | `sw.js` | `install`, `activate`, `message`, `skipWaiting` |
| Estrategia Cache First | `sw.js` | `cacheFirst()` (imágenes) |
| Estrategia Network First | `sw.js` | `networkFirstNavigation()` |
| Estrategia intermedia SWR | `sw.js` | `staleWhileRevalidate()` (CSS/JS) |
| Precarga de recursos esenciales | `sw.js` | `PRECACHE_URLS`, `cache.addAll()` |
| Solicitud de permiso de notificaciones | `js/notifications.js` | `requestPermission()` |
| Disparo de notificación local | `js/notifications.js` | `showNotification()`, `notifyIncident()` |
| Click en la notificación | `sw.js` | `notificationclick` |
| Acceso a geolocalización | `js/geolocation.js` | `requestPosition()`, `permissionState()` |
| Manejo de errores de geolocalización | `js/geolocation.js` | `GeoError`, `describeError()` |
| Integración con la UI | `js/app.js` | `captureGeo()`, `$('f').addEventListener('submit')`, `renderDiag()` |
| Interfaz base | `index.html` | Tarjeta «Estado de la PWA», campo de ubicación |
| Estilos | `css/styles.css` | `.geo-box`, `.diag`, `#updatebar` |
| Manifest | `manifest.json` | `icons`, `start_url`, `scope`, `shortcuts` |

---

## 3. Service Worker

### 3.1 Registro y actualización en el cliente

`js/pwa.js` registra el SW y gestiona el ciclo de vida. No fuerza la activación: si hay una
versión nueva, avisa a la UI mediante `onUpdateAvailable`.

```js
// js/pwa.js (fragmento)
let registration = null;
let updateNotified = false;
let updateRequested = false;
let hadController = false;

export async function initPWA({ onUpdateAvailable } = {}) {
  if (!('serviceWorker' in navigator)) return null;

  hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController && !updateRequested) return; // primera instalación
    location.reload();                               // activación confirmada
  });

  const notifyUpdate = () => {
    if (updateNotified) return;
    updateNotified = true;
    onUpdateAvailable?.();
  };

  registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });

  if (registration.waiting && navigator.serviceWorker.controller) notifyUpdate();

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        notifyUpdate();
      }
    });
  });

  // Comprobación periódica y al volver a la pestaña
  setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });

  return registration;
}

export function applyUpdate() {
  updateRequested = true;
  if (registration?.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}
```

**Puntos clave**

- `scope: './'` permite desplegar en una subcarpeta (`/repo/`) sin cambiar el código.
- No se llama `skipWaiting()` en `install`; la nueva versión queda en `waiting`.
- El aviso se muestra en `#updatebar`; al pulsar «Actualizar» se envía `SKIP_WAITING`.
- En la primera instalación, `clients.claim()` también dispara `controllerchange`; se ignora
  para no recargar al usuario.

### 3.2 Instalación y precarga

```js
// sw.js (fragmento)
const VERSION = 'v5.0.1';
const PRECACHE = `alerta-campus-precache-${VERSION}`;
const RUNTIME = `alerta-campus-runtime-${VERSION}`;
const IMAGES = `alerta-campus-images-${VERSION}`;

const PRECACHE_URLS = [
  './', './index.html', './offline.html', './manifest.json',
  './css/styles.css',
  './js/app.js', './js/db.js', './js/api.js', './js/ui.js',
  './js/geolocation.js', './js/notifications.js', './js/pwa.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './icons/badge-72.png',
  './imag1.png', './image2.png', './image3.png',
  './image4.png', './image5.png', './image6.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS); // si falla un recurso, falla la instalación
  })());
});
```

### 3.3 Activación y limpieza de versiones

```js
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PRECACHE, RUNTIME, IMAGES]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});
```

### 3.4 Enrutamiento de peticiones

```js
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/api\//.test(url.pathname)) return; // Network Only

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  const isStatic = ['style', 'script', 'worker', 'manifest'].includes(request.destination) ||
    /\.(?:css|js|mjs|json|webmanifest|svg)$/i.test(url.pathname);

  if (isStatic) return event.respondWith(staleWhileRevalidate(event, RUNTIME));
  if (request.destination === 'image') return event.respondWith(cacheFirst(event, IMAGES, 70));

  event.respondWith(staleWhileRevalidate(event, RUNTIME));
});
```

### 3.5 Network First para navegación

```js
async function networkFirstNavigation(event) {
  try {
    const response = await fetch(event.request);
    if (response?.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(PRECACHE).then((c) => c.put('./index.html', copy)).catch(() => {}));
    }
    return response;
  } catch {
    return (await caches.match(event.request, { ignoreSearch: true })) ||
      (await caches.match('./index.html')) ||
      (await caches.match('./offline.html'));
  }
}
```

**Por qué `ignoreSearch`:** las rutas `?action=new` y `?action=list` son la misma SPA; el
documento cacheado debe responder a ambas.

### 3.6 Stale-While-Revalidate para CSS/JS

```js
async function staleWhileRevalidate(event, cacheName) {
  const cached = await caches.match(event.request);
  const network = fetch(event.request)
    .then(async (response) => {
      if (response?.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  event.waitUntil(network); // mantiene vivo el SW durante la actualización
  return cached || (await network) || Response.error();
}
```

### 3.7 Cache First para imágenes

```js
async function cacheFirst(event, cacheName, maxEntries) {
  const cached = await caches.match(event.request);
  if (cached) return cached;

  const response = await fetch(event.request);
  if (response?.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(event.request, response.clone());
    event.waitUntil(trimCache(cacheName, maxEntries));
  }
  return response;
}
```

### 3.8 Actualización controlada

```js
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

La UI muestra el aviso:

```js
// js/app.js
initPWA({
  onUpdateAvailable: () => $('updatebar').classList.add('on'),
});
$('updatebtn').onclick = () => { $('updatebar').classList.remove('on'); applyUpdate(); };
```

### 3.9 Instrucciones para integrarlo en otra app

1. Copia `sw.js` a la **raíz** del sitio (o a una ruta cuyo `scope` cubra la app).
2. Ajusta `PRECACHE_URLS` a tus archivos reales; verifica que todos existan (un 404 rompe
   la instalación).
3. Registra el SW con `navigator.serviceWorker.register('./sw.js', { scope: './' })`.
4. Sirve `sw.js` con `Cache-Control: no-cache, no-store, must-revalidate`.
5. Si usas build con hash, cambia `VERSION` en cada despliegue y genera la lista de assets.
6. No uses `skipWaiting()` automático si quieres avisar al usuario.
7. Prueba en DevTools → Application → Service Workers: «Update», «Bypass for network»,
   «Offline».

---

## 4. Funcionamiento offline

### 4.1 Persistencia local

`js/db.js` encapsula IndexedDB y un respaldo automático en localStorage:

```js
const DB_NAME = 'incidenciasDB';
const DB_VERSION = 1;
const STORE = 'items';
const LS_KEY = 'incidencias_respaldo';

export async function all() { /* getAll() o localStorage */ }
export async function put(item) { /* put() o upsert en localStorage */ }
export async function remove(id) { /* delete() o filtro en localStorage */ }
```

**Por qué un respaldo:** algunos modos privados o navegadores antiguos bloquean IndexedDB.
La app no debe romperse; pierde capacidad, no funcionalidad.

### 4.2 Modelo de la incidencia

```js
{
  id: "uuid",
  titulo: "Fuga de agua en el laboratorio 3",
  prioridad: "Alta",              // Baja | Media | Alta
  descripcion: "El agua se acerca a las tomas…",
  fecha: "2026-10-24T14:35:00.000Z",
  updated: "2026-10-24T14:35:00.000Z",
  synced: false,
  onServer: false,
  deleted: false,                 // borrado lógico
  lat: 19.4326,
  lng: -99.1332,
  accuracy: 25,
  geoAt: "2026-10-24T14:35:00.000Z"
}
```

### 4.3 Cola de sincronización

```js
// js/api.js (fragmento)
export async function syncPending() {
  if (syncing || !navigator.onLine) return { sent: 0, failed: 0, skipped: true };
  syncing = true;
  let sent = 0;
  let failed = 0;

  try {
    for (const item of (await all()).filter((i) => !i.synced)) {
      let response;
      if (item.deleted) response = await fetch(`${API}/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      else if (item.onServer) response = await fetch(`${API}/${encodeURIComponent(item.id)}`, {
        method: 'PUT', headers: HEADERS, body: JSON.stringify(payload(item)),
      });
      else response = await fetch(API, {
        method: 'POST', headers: HEADERS, body: JSON.stringify(payload(item)),
      });

      if (!response.ok) { failed++; continue; }

      // Evita pisar una edición hecha mientras se enviaba
      const current = (await all()).find((i) => i.id === item.id);
      if (!current || current.updated !== item.updated) continue;

      if (item.deleted) await remove(item.id);
      else await put({ ...current, synced: true, onServer: true });
      sent++;
    }

    // Descarga de cambios remotos
    const remote = await fetch(API);
    if (remote.ok) {
      const list = await remote.json();
      for (const item of list) {
        const local = (await all()).find((i) => i.id === item.id);
        if (!local) await put({ ...item, synced: true, onServer: true });
        else if (local.synced && !local.deleted && (item.updated || '') > (local.updated || '')) {
          await put({ ...item, synced: true, onServer: true });
        }
      }
    }

    return { sent, failed, skipped: false };
  } finally {
    syncing = false;
  }
}
```

**Disparadores del reintento**

- Evento `online` del navegador.
- Botón «Sincronizar».
- Al abrir la app (`render().then(() => sync({ silent: true }))`).

No se usa Background Sync API porque no está disponible en Safari/Firefox de forma estable;
la estrategia con eventos y botón es suficiente para el alcance.

### 4.4 Página offline

`offline.html` se precarga y se usa como último recurso si el shell no está disponible.
Incluye un botón «Reintentar» y un enlace al inicio.

### 4.5 Idempotencia en el servidor

El cliente genera el UUID; el servidor hace `upsert` por `id` y compara `updated`:

```js
function upsert(input) {
  const clean = normalize(input);
  const index = data.findIndex((item) => item.id === clean.id);
  if (index < 0) { data.push(clean); return { result: 'created' }; }
  if ((clean.updated || '') >= (data[index].updated || '')) {
    data[index] = clean;
    return { result: 'updated' };
  }
  return { result: 'ignored' }; // versión vieja
}
```

---

## 5. Notificaciones locales

### 5.1 Solicitud de permiso

```js
// js/notifications.js
export function permission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission; // granted | denied | default
}

export async function requestPermission() {
  if (permission() === 'unsupported') return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}
```

> **Regla:** llamar a `requestPermission()` solo desde un manejador de clic. Los navegadores
> ignoran o penalizan las solicitudes automáticas al cargar.

### 5.2 Disparo con `showNotification`

```js
export async function showNotification(title, options = {}) {
  if (permission() !== 'granted') return { ok: false, reason: 'permission' };

  const config = {
    body: '',
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    tag: 'alerta-campus',
    renotify: true,
    lang: 'es',
    data: { url: './index.html?action=list' },
    ...options,
  };

  const registration = await navigator.serviceWorker.ready; // Android exige el SW
  await registration.showNotification(title, config);
  return { ok: true, via: 'service-worker' };
}
```

### 5.3 Disparador de prioridad Alta

```js
// js/app.js, después de confirmar el guardado y refrescar la UI
if (item.prioridad === 'Alta' && notify.permission() === 'granted') {
  notify.notifyIncident(item).catch((error) => console.warn('[notify]', error));
}
```

### 5.4 Click en la notificación

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './index.html?action=list', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) await client.navigate(target).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
```

### 5.5 Integración en la UI

```html
<!-- Tarjeta Estado de la PWA -->
<button id="notif-ask" type="button">Activar notificaciones</button>
<button id="notif-test" type="button">Probar notificación</button>
```

```js
// js/app.js
$('notif-ask').onclick = async () => {
  const result = await notify.requestPermission();
  await renderDiag();
  if (result === 'granted') toast('Notificaciones activadas', 'bell');
};

$('notif-test').onclick = async () => {
  if (notify.permission() === 'default') await notify.requestPermission();
  const result = await notify.showTestNotification();
  toast(result.ok ? 'Notificación enviada' : 'No se pudo mostrar', result.ok ? 'bell' : 'error');
};
```

### 5.6 Verificación rápida

1. Pulsar «Activar notificaciones» → aceptar.
2. Pulsar «Probar notificación» → debe aparecer el banner del sistema.
3. En DevTools → Application → Service Workers → «Push» no aplica; usar
   `registration.getNotifications()` en la consola para confirmar el payload:

```js
navigator.serviceWorker.ready.then((r) => r.getNotifications()).then(console.log);
```

---

## 6. Geolocalización

### 6.1 Comprobaciones previas

```js
export function isSupported() {
  return 'geolocation' in navigator;
}

export function isSecureContextOk() {
  return window.isSecureContext ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}
```

### 6.2 Captura con timeout y errores normalizados

```js
export function requestPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!isSupported()) return reject(new GeoError('unsupported'));
    if (!isSecureContextOk()) return reject(new GeoError('insecure'));

    const opts = { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000, ...options };
    let settled = false;
    const guard = setTimeout(() => finish(reject, new GeoError('timeout')), opts.timeout + 2000);

    navigator.geolocation.getCurrentPosition(
      (position) => finish(resolve, {
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
        accuracy: Math.round(position.coords.accuracy),
        timestamp: position.timestamp || Date.now(),
      }),
      (error) => finish(reject, new GeoError(
        error.code === 1 ? 'permission_denied'
        : error.code === 2 ? 'position_unavailable'
        : error.code === 3 ? 'timeout' : 'unknown',
        error.code,
        error.message,
      )),
      opts,
    );
  });
}
```

### 6.3 Interfaz del formulario

```html
<label class="l" id="geo-label">Ubicación del incidente (opcional)</label>
<div class="geo-box" id="geobox">
  <div class="geo-head">
    <p class="geo-status" id="geo-status" aria-live="polite">Sin ubicación adjunta…</p>
    <button class="mini" id="geo-get" type="button">Obtener ubicación</button>
  </div>
  <div class="geo-result" id="geo-result" hidden>
    <code class="geo-coords" id="geo-coords"></code>
    <a class="geo-map" id="geo-map" target="_blank" rel="noopener">Abrir en OpenStreetMap ↗</a>
    <button class="mini del" id="geo-clear" type="button">Quitar ubicación</button>
  </div>
</div>
```

### 6.4 Captura e integración con el guardado

```js
async function captureGeo() {
  const button = $('geo-get');
  button.disabled = true;
  button.textContent = 'Obteniendo…';
  $('geo-status').textContent = 'Solicitando permiso y posición…';

  try {
    const position = await geo.requestPosition();
    geoData = position;
    renderGeo();
    toast('Ubicación adjuntada', 'pin');
  } catch (error) {
    $('geo-status').textContent = geo.describeError(error);
    toast(geo.describeError(error), 'error');
  } finally {
    button.disabled = false;
  }
}

// Al guardar:
const geoFields = geoData ? {
  lat: geoData.lat,
  lng: geoData.lng,
  accuracy: geoData.accuracy,
  geoAt: new Date(geoData.timestamp).toISOString(),
} : { lat: null, lng: null, accuracy: null, geoAt: null };
```

### 6.5 Mostrar la ubicación en el historial

```js
function geoLine(item) {
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return '';
  const accuracy = Number.isFinite(item.accuracy) ? ` · ±${Math.round(item.accuracy)} m` : '';
  return `<span><svg class="i"><use href="#ic-pin"/></svg>
    <a href="${geo.mapUrl(item)}" target="_blank" rel="noopener">
      ${item.lat.toFixed(5)}, ${item.lng.toFixed(5)}${accuracy}
    </a></span>`;
}
```

### 6.6 Prueba en DevTools

1. DevTools → ⋮ → More tools → Sensors.
2. Location → Custom location → latitud/longitud.
3. Pulsar «Obtener ubicación».
4. Para el caso denegado: Sensors → Location → «Location unavailable» o bloquear el permiso
   en el icono del candado.

---

## 7. Integración de la interfaz base

### 7.1 Orden de carga

```html
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="css/styles.css">
...
<script type="module" src="js/app.js"></script>
```

`app.js` importa el resto de módulos. No se necesitan bundler ni dependencias.

### 7.2 IDs que la lógica espera

| ID | Uso |
|---|---|
| `#st`, `#stt` | Estado en línea / sin conexión. |
| `#tot`, `#okn`, `#pen` | Contadores del resumen. |
| `#sync`, `#synct` | Botón y texto de sincronización. |
| `#list`, `#chips`, `#q` | Historial, filtros y búsqueda. |
| `#t`, `#d`, `input[name=p]` | Formulario. |
| `#geo-get`, `#geo-status`, `#geo-result`, `#geo-coords`, `#geo-map`, `#geo-clear` | Ubicación. |
| `#diag-sw`, `#diag-cache`, `#diag-store`, `#diag-notif`, `#diag-last`, `#diag-geo` | Diagnóstico. |
| `#notif-ask`, `#notif-test` | Permiso y prueba de notificaciones. |
| `#install` | Instalación. |
| `#updatebar`, `#updatebtn`, `#updatedismiss` | Aviso de actualización. |
| `#splash`, `#toast`, `#tmsg` | Splash y avisos. |

### 7.3 Estados visuales

| Clase | Significado |
|---|---|
| `#st.off` | Sin conexión. |
| `#updatebar.on` | Hay una versión nueva esperando. |
| `.geo-box.on` | Hay una ubicación adjunta. |
| `.badge.ok` / `.badge.wait` | Incidencia enviada / pendiente. |
| `.diag b.ok` / `.warn` / `.bad` | Diagnóstico correcto / atención / error. |
| `#splash.hide` | Splash oculto. |

### 7.4 Accesibilidad

- `aria-live="polite"` en el estado de red, el estado de ubicación y los avisos.
- `role="dialog"` y `aria-modal="true"` en el diálogo de eliminación.
- `:focus-visible` con contorno visible.
- Etiquetas `<label for>` en los campos.
- Botones con texto, no solo iconos.
- `prefers-reduced-motion` desactiva animaciones.

---

## 8. Cómo adaptar estos fragmentos a otro proyecto

1. **Copia** `sw.js`, `js/pwa.js`, `js/notifications.js` y `js/geolocation.js`.
2. **Ajusta** `PRECACHE_URLS` a tus rutas y tu build.
3. **Registra** el SW en el punto de entrada y añade el banner de actualización.
4. **Añade** los botones de permiso y el bloque de ubicación a tu formulario.
5. **Conecta** el guardado: primero tu almacenamiento local, luego la cola de red.
6. **Configura** el servidor para servir `sw.js` y `manifest.json` con los MIME correctos y
   sin caché agresiva.
7. **Prueba** en localhost con DevTools (Offline, Sensors, Application) y luego en un
   dispositivo real por HTTPS.

---

## 9. Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `ServiceWorker registration failed` | `file://`, HTTP no localhost o ruta incorrecta. | Servir por `http://localhost` o HTTPS; revisar la ruta y el `scope`. |
| El SW no se actualiza | `sw.js` cacheado por el servidor o por el navegador. | `Cache-Control: no-store`; DevTools → Update; cerrar pestañas. |
| `cache.addAll` falla en install | Algún recurso de `PRECACHE_URLS` devuelve 404. | Revisar rutas y consola de la instalación. |
| No aparece el prompt de notificaciones | Se pidió sin gesto de usuario o el permiso está bloqueado. | Pedirlo en un clic; revisar el candado del sitio. |
| `new Notification` lanza error en Android | Android exige `ServiceWorkerRegistration.showNotification`. | Usar siempre `registration.showNotification`. |
| La geolocalización falla | Contexto no seguro, GPS apagado o permiso denegado. | HTTPS/localhost; revisar Sensors y ajustes del sistema. |
| El navegador no ofrece instalar | Falta icono 192/512, `start_url`, `display` o HTTPS. | Revisar `manifest.json` y `Page.getInstallabilityErrors`. |
| Los datos no se sincronizan | API caída, CORS o `navigator.onLine` engañoso. | Revisar Network; el botón «Sincronizar» reintenta. |
| Se ven datos viejos | Caché de una versión anterior. | Subir `VERSION`; limpiar Cache Storage; recargar. |

---

## 10. Checklist de integración

- [ ] El SW está en la raíz y su `scope` cubre toda la app.
- [ ] `PRECACHE_URLS` contiene todos los recursos críticos y ninguno devuelve 404.
- [ ] `VERSION` cambia en cada despliegue.
- [ ] `sw.js` se sirve con `no-store`.
- [ ] La navegación usa Network First y tiene fallback al shell.
- [ ] La API no se cachea.
- [ ] La creación de incidencias funciona sin red.
- [ ] La cola se reintenta al reconectar y es idempotente.
- [ ] El permiso de notificaciones se pide solo por gesto.
- [ ] La notificación usa `showNotification` y tiene `notificationclick`.
- [ ] La geolocalización maneja éxito, denegación, timeout y contexto inseguro.
- [ ] El guardado no depende de la ubicación.
- [ ] El manifest tiene iconos 192/512/maskable y `start_url`/`scope`.
- [ ] La app se probó en móvil y escritorio, online y offline.

