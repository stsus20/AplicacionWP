// Sincronización con la API REST.
// Estrategia: la red nunca bloquea la UI. Los cambios se guardan primero en
// IndexedDB y esta cola los empuja al servidor cuando hay conexión.

import { all, put, remove } from './db.js';

const API = '/api/incidencias';
const HEADERS = { 'Content-Type': 'application/json' };

let syncing = false;

export function payload(item) {
  const base = {
    id: item.id,
    titulo: item.titulo,
    prioridad: item.prioridad,
    descripcion: item.descripcion || '',
    fecha: item.fecha,
    updated: item.updated || item.fecha,
  };
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
    base.lat = item.lat;
    base.lng = item.lng;
    base.accuracy = Number.isFinite(item.accuracy) ? item.accuracy : null;
    base.geoAt = item.geoAt || null;
  }
  return base;
}

/**
 * Empuja los cambios pendientes y trae novedades del servidor.
 * @returns {Promise<{sent:number, failed:number, skipped:boolean}>}
 */
export async function syncPending() {
  if (syncing) return { sent: 0, failed: 0, skipped: true };
  if (!navigator.onLine) return { sent: 0, failed: 0, skipped: true };

  syncing = true;
  let sent = 0;
  let failed = 0;

  try {
    const pending = (await all()).filter((item) => !item.synced);
    for (const item of pending) {
      try {
        const id = encodeURIComponent(item.id);
        let response;
        if (item.deleted) {
          response = await fetch(`${API}/${id}`, { method: 'DELETE' });
        } else if (item.onServer) {
          response = await fetch(`${API}/${id}`, {
            method: 'PUT',
            headers: HEADERS,
            body: JSON.stringify(payload(item)),
          });
        } else {
          response = await fetch(API, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify(payload(item)),
          });
        }

        if (!response.ok) {
          failed += 1;
          continue;
        }

        // Si el usuario editó el registro mientras se enviaba, se conserva
        // pendiente para no perder el cambio más reciente.
        const current = (await all()).find((row) => row.id === item.id);
        if (!current || current.updated !== item.updated) continue;

        if (item.deleted) await remove(item.id);
        else await put({ ...current, synced: true, onServer: true });
        sent += 1;
      } catch (error) {
        console.warn('[api] No se pudo enviar un cambio:', error);
        failed += 1;
        break; // sin red o sin servidor: se reintenta en el próximo ciclo
      }
    }

    // Descarga de cambios remotos (por ejemplo, registros creados en otro equipo).
    try {
      const response = await fetch(API);
      if (response.ok) {
        const remote = await response.json();
        if (Array.isArray(remote)) {
          const local = new Map((await all()).map((item) => [item.id, item]));
          for (const item of remote) {
            if (!item || !item.id) continue;
            const current = local.get(item.id);
            if (!current) {
              await put({ ...item, synced: true, onServer: true });
            } else if (current.synced && !current.deleted && (item.updated || '') > (current.updated || '')) {
              await put({ ...item, synced: true, onServer: true });
            }
          }
        }
      }
    } catch (_) {
      // La descarga es opcional: si falla, se conserva lo local.
    }

    return { sent, failed, skipped: false };
  } finally {
    syncing = false;
  }
}
