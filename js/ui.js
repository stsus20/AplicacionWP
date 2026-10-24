// Utilidades de UI compartidas por los módulos de la aplicación.

export const $ = (id) => document.getElementById(id);

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  })[c]);

export const ic = (name) => `<svg class="i" aria-hidden="true"><use href="#ic-${name}"/></svg>`;

export function uid() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (_) { /* continúa con el respaldo */ }
  try {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch (_) { /* continúa con el respaldo */ }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

let toastTimer = null;

/** Muestra un aviso breve. type: ok | warn | error | offline */
export function toast(message, type = 'ok') {
  const box = $('toast');
  const msg = $('tmsg');
  if (!box || !msg) return;
  const icons = { ok: 'check', warn: 'alert', error: 'x', offline: 'wifioff', bell: 'bell', pin: 'pin' };
  const use = box.querySelector('use');
  if (use) use.setAttribute('href', `#ic-${icons[type] || 'check'}`);
  msg.textContent = message;
  box.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('on'), 3000);
}
