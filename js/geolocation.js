// Geolocalización: única característica física integrada.
// Centraliza la comprobación de soporte, permisos y traducción de errores.

export const DEFAULT_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 30000,
};

const MESSAGES = {
  unsupported: 'Este dispositivo o navegador no soporta geolocalización. La incidencia se puede guardar sin ubicación.',
  insecure: 'La geolocalización requiere HTTPS o localhost. Abre la PWA en un contexto seguro.',
  permission_denied: 'Permiso de ubicación denegado. Habilítalo en los ajustes del navegador o del sistema.',
  position_unavailable: 'No se pudo obtener la posición. Comprueba que el GPS esté activo e inténtalo de nuevo.',
  timeout: 'La ubicación tardó demasiado en responder. Inténtalo otra vez en un lugar despejado.',
  unknown: 'Ocurrió un error inesperado al obtener la ubicación.',
};

export class GeoError extends Error {
  constructor(code, nativeCode = null, detail = '') {
    super(MESSAGES[code] || MESSAGES.unknown);
    this.name = 'GeoError';
    this.code = code;
    this.nativeCode = nativeCode;
    this.detail = detail;
  }
}

export function isSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function isSecureContextOk() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.isSecureContext) ||
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

export async function permissionState() {
  if (!isSupported()) return 'unsupported';
  if (!isSecureContextOk()) return 'insecure';
  if (!navigator.permissions?.query) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // granted | denied | prompt
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Pide una posición al dispositivo. Nunca deja la promesa colgada: además del
 * timeout nativo se usa un temporizador de seguridad.
 * @returns {Promise<{lat:number,lng:number,accuracy:number,timestamp:number}>}
 */
export function requestPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!isSupported()) return reject(new GeoError('unsupported'));
    if (!isSecureContextOk()) return reject(new GeoError('insecure'));

    const opts = { ...DEFAULT_OPTIONS, ...options };
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      fn(value);
    };
    const guard = setTimeout(
      () => finish(reject, new GeoError('timeout')),
      Math.max(1000, Number(opts.timeout) || DEFAULT_OPTIONS.timeout) + 2000,
    );

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          finish(resolve, {
            lat: Number(latitude.toFixed(6)),
            lng: Number(longitude.toFixed(6)),
            accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
            timestamp: position.timestamp || Date.now(),
          });
        },
        (error) => {
          const code = error?.code === 1
            ? 'permission_denied'
            : error?.code === 2
              ? 'position_unavailable'
              : error?.code === 3
                ? 'timeout'
                : 'unknown';
          finish(reject, new GeoError(code, error?.code ?? null, error?.message || ''));
        },
        opts,
      );
    } catch (error) {
      finish(reject, new GeoError('unknown', null, error?.message || ''));
    }
  });
}

export function describeError(error) {
  if (error instanceof GeoError) return error.message;
  if (error?.code === 1) return MESSAGES.permission_denied;
  if (error?.code === 2) return MESSAGES.position_unavailable;
  if (error?.code === 3) return MESSAGES.timeout;
  return error?.message || MESSAGES.unknown;
}

export function mapUrl({ lat, lng }) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '#';
  const la = latitude.toFixed(6);
  const lo = longitude.toFixed(6);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=18/${la}/${lo}`;
}

export function formatCoords({ lat, lng, accuracy }) {
  const parts = [`${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`];
  if (Number.isFinite(accuracy)) parts.push(`±${Math.round(accuracy)} m`);
  return parts.join(' · ');
}
