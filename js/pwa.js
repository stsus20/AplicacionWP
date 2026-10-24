// Registro del Service Worker y ciclo de vida de actualizaciones.
// No se fuerza skipWaiting en la instalación: si hay una versión nueva, se
// avisa al usuario y la activación ocurre cuando este pulsa "Actualizar".

let registration = null;
let updateNotified = false;
let updateRequested = false;
let reloaded = false;
let hadController = false;

export async function initPWA({ onUpdateAvailable, onReady } = {}) {
  if (!('serviceWorker' in navigator)) {
    console.info('[pwa] Service Worker no soportado');
    return null;
  }

  hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    // En la primera instalación clients.claim() también dispara el evento;
    // no recargamos en ese caso para no interrumpir al usuario.
    if (!hadController && !updateRequested) return;
    reloaded = true;
    location.reload();
  });

  const notifyUpdate = () => {
    if (updateNotified) return;
    updateNotified = true;
    onUpdateAvailable?.();
  };

  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });

    if (registration.waiting && navigator.serviceWorker.controller) notifyUpdate();

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          notifyUpdate();
        }
      });
    });

    onReady?.(registration);

    // Comprobación periódica y al volver a la pestaña.
    const check = () => registration?.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });

    return registration;
  } catch (error) {
    console.error('[pwa] No se pudo registrar el Service Worker:', error);
    return null;
  }
}

export function applyUpdate() {
  updateRequested = true;
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    location.reload();
  }
}

export async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || registration;
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) {
    return false;
  }
}
