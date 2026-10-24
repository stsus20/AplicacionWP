// Notificaciones locales a través del Service Worker.
// Se pide permiso solo ante una acción explícita del usuario y se muestra la
// notificación con serviceWorkerRegistration.showNotification (requerido en
// Android; en escritorio se usa como respaldo el constructor Notification).

const ICON = './icons/icon-192.png';
const BADGE = './icons/badge-72.png';
const DEFAULT_TAG = 'alerta-campus';

// Última notificación emitida en esta sesión; se muestra en el diagnóstico.
export let lastNotification = null;

export function isSupported() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function permission() {
  if (!isSupported()) return 'unsupported';
  return Notification.permission; // granted | denied | default
}

export async function requestPermission() {
  if (!isSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.warn('[notifications] No se pudo pedir permiso:', error);
    return 'denied';
  }
}

async function registrationWithTimeout(ms = 4000) {
  if (!('serviceWorker' in navigator)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function showNotification(title, options = {}) {
  if (permission() !== 'granted') return { ok: false, reason: 'permission' };

  const config = {
    body: '',
    icon: ICON,
    badge: BADGE,
    tag: DEFAULT_TAG,
    renotify: true,
    requireInteraction: false,
    lang: 'es',
    data: { url: './index.html?action=list' },
    ...options,
  };

  const registration = await registrationWithTimeout();
  if (registration?.showNotification) {
    try {
      await registration.showNotification(title, config);
      lastNotification = { title, body: config.body, tag: config.tag, at: Date.now() };
      return { ok: true, via: 'service-worker' };
    } catch (error) {
      console.warn('[notifications] showNotification falló:', error);
    }
  }

  try {
    // Respaldo para navegadores de escritorio sin Service Worker listo.
    new Notification(title, config);
    lastNotification = { title, body: config.body, tag: config.tag, at: Date.now() };
    return { ok: true, via: 'window' };
  } catch (error) {
    console.warn('[notifications] Notification falló:', error);
    return { ok: false, reason: error?.message || 'unknown' };
  }
}

export function showTestNotification() {
  return showNotification('Alerta Campus', {
    body: 'Las notificaciones locales funcionan. Toca para abrir el historial.',
    tag: 'alerta-campus-prueba',
    data: { url: './index.html?action=list', test: true },
  });
}

export function notifyIncident(item) {
  const detail = item.descripcion ? ` · ${item.descripcion}` : '';
  return showNotification(`Incidencia de prioridad ${item.prioridad}`, {
    body: `${item.titulo}${detail}`.slice(0, 180),
    tag: `incidencia-${item.id}`,
    data: { url: './index.html?action=list', id: item.id },
  });
}
