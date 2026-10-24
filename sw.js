/* ============================================================
   Alerta Campus — Service Worker
   Estrategias:
   - Navegación: Network First con respaldo en caché (app shell).
   - CSS/JS/manifest: Stale-While-Revalidate.
   - Imágenes: Cache First con límite de entradas.
   - API (/api/): Network Only; la cola offline vive en IndexedDB.
   ============================================================ */

const VERSION = 'v5.0.1';
const PRECACHE = `alerta-campus-precache-${VERSION}`;
const RUNTIME = `alerta-campus-runtime-${VERSION}`;
const IMAGES = `alerta-campus-images-${VERSION}`;
const IMAGE_LIMIT = 70;

const PRECACHE_URLS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/api.js',
  './js/ui.js',
  './js/geolocation.js',
  './js/notifications.js',
  './js/pwa.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/badge-72.png',
  './imag1.png',
  './image2.png',
  './image3.png',
  './image4.png',
  './image5.png',
  './image6.png',
];

// ------------------------------------------------------------
// Ciclo de vida
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    // No se llama skipWaiting aquí: la nueva versión espera a que el usuario
    // pulse "Actualizar" en la interfaz.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PRECACHE, RUNTIME, IMAGES]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ------------------------------------------------------------
// Fetch y estrategias
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API se resuelve siempre contra la red. Si falla, la app conserva la
  // cola en IndexedDB y reintenta al recuperar conexión.
  if (/\/api\//.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  const isStatic = ['style', 'script', 'worker', 'manifest'].includes(request.destination) ||
    /\.(?:css|js|mjs|json|webmanifest|svg)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(staleWhileRevalidate(event, RUNTIME));
    return;
  }

  if (request.destination === 'image' || /\.(?:png|jpe?g|webp|gif|avif|ico)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event, IMAGES, IMAGE_LIMIT));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, RUNTIME));
});

async function networkFirstNavigation(event) {
  const request = event.request;
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    // Solo se guarda el documento de la SPA como shell; no se debe sobrescribir
    // index.html con offline.html si el usuario navega directamente a esa página.
    if (response && response.ok && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
      const copy = response.clone();
      event.waitUntil(
        caches.open(PRECACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {}),
      );
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await caches.match('./index.html');
    if (shell) return shell;
    return (await caches.match('./offline.html')) ||
      new Response('<h1>Sin conexión</h1><p>Abre la app de nuevo cuando tengas internet.</p>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const request = event.request;
  const cached = await caches.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Mantiene vivo el SW mientras se actualiza la copia en segundo plano.
  event.waitUntil(network);

  if (cached) return cached;
  const fresh = await network;
  return fresh || Response.error();
}

async function cacheFirst(event, cacheName, maxEntries) {
  const request = event.request;
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      event.waitUntil(trimCache(cacheName, maxEntries));
    }
    return response;
  } catch (_) {
    return Response.error();
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

// ------------------------------------------------------------
// Notificaciones: foco de ventana al tocar la notificación
// ------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || './index.html?action=list', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client) {
          try { await client.navigate(target); } catch (_) { /* ignora */ }
        }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
