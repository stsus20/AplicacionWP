// Lógica de la interfaz: navegación, CRUD, sincronización, diagnóstico,
// notificaciones y geolocalización. La persistencia vive en db.js y la red en
// api.js; este archivo solo orquesta.

import { all, put, remove, storageMode } from './db.js';
import { syncPending } from './api.js';
import { $, esc, ic, uid, fmtDate, toast } from './ui.js';
import * as geo from './geolocation.js';
import * as notify from './notifications.js';
import { initPWA, applyUpdate, getRegistration, requestPersistentStorage } from './pwa.js';

const COL = { Baja: 'var(--mint)', Media: 'var(--sun)', Alta: 'var(--rose)' };
const ICO = { Baja: 'down', Media: 'flat', Alta: 'dbl' };
const TT = {
  home: ['Resumen', 'Así van las incidencias de hoy.'],
  new: ['Nueva incidencia', 'Funciona aunque no haya internet.'],
  list: ['Historial', 'Todo lo que has registrado.'],
};

let filter = 'all';
let q = '';
let editId = null;
let delId = null;
let geoData = null;
let geoBusy = false;
let syncing = false;
let installPrompt = null;

// ------------------------------------------------------------
// Navegación
// ------------------------------------------------------------
function show(view) {
  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('on', section.id === `v-${view}`);
  });
  document.querySelectorAll('nav button').forEach((button) => {
    button.classList.toggle('on', button.dataset.v === view);
  });
  const meta = TT[view] || TT.home;
  $('ttl').textContent = meta[0];
  $('sub').textContent = meta[1];
  scrollTo(0, 0);
}

document.querySelectorAll('nav button').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.v === 'new' && editId) resetForm();
    show(button.dataset.v);
  });
});

// ------------------------------------------------------------
// Render del resumen y del historial
// ------------------------------------------------------------
function geoLine(item) {
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return '';
  const accuracy = Number.isFinite(item.accuracy) ? ` · ±${Math.round(item.accuracy)} m` : '';
  return `<span>${ic('pin')}<a href="${geo.mapUrl(item)}" target="_blank" rel="noopener" title="Abrir mapa (requiere conexión)">${Number(item.lat).toFixed(5)}, ${Number(item.lng).toFixed(5)}${accuracy}</a></span>`;
}

async function render() {
  try {
    const rows = await all();
    const items = rows
      .filter((item) => !item.deleted)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    const total = items.length;
    const sent = items.filter((item) => item.synced).length;
    const pending = rows.filter((item) => !item.synced).length;

    $('tot').textContent = total;
    $('okn').textContent = sent;
    $('pen').textContent = pending;
    $('ring').setAttribute('stroke-dasharray', `${total ? (251.3 * sent) / total : 0} 251.3`);
    $('synct').textContent = pending ? `Sincronizar (${pending})` : 'Todo al día';
    $('sync').disabled = !pending;
    $('dot').style.display = pending ? 'grid' : 'none';
    $('dot').textContent = pending;

    $('bars').innerHTML = ['Alta', 'Media', 'Baja'].map((priority) => {
      const count = items.filter((item) => item.prioridad === priority).length;
      return `<div class="pr"><span>${priority}</span><div class="track"><i style="background:${COL[priority]};width:${total ? (count / total) * 100 : 0}%"></i></div><b>${count}</b></div>`;
    }).join('');

    const filters = [
      ['all', 'Todas', 'list'],
      ['pend', 'Pendientes', 'clock'],
      ['Alta', 'Alta', 'dbl'],
    ];
    $('chips').innerHTML = filters.map(([value, label, icon]) =>
      `<button type="button" class="chip ${filter === value ? 'on' : ''}" data-f="${value}">${ic(icon)}${label}</button>`).join('');
    $('chips').querySelectorAll('.chip').forEach((button) => {
      button.onclick = () => { filter = button.dataset.f; render(); };
    });

    const term = q.trim().toLowerCase();
    const visible = items.filter((item) => {
      const matchesFilter = filter === 'all' ||
        (filter === 'pend' ? !item.synced : item.prioridad === filter);
      const text = `${item.titulo} ${item.descripcion || ''}`.toLowerCase();
      return matchesFilter && (!term || text.includes(term));
    });

    $('list').innerHTML = visible.map((item) => `
      <article class="tk" style="--c:${COL[item.prioridad] || COL.Baja}">
        <div class="h"><b>${esc(item.titulo)}</b>
          <span class="badge ${item.synced ? 'ok' : 'wait'}">${ic(item.synced ? 'cloud' : 'clock')}${item.synced ? 'Enviada' : 'Pendiente'}</span></div>
        ${item.descripcion ? `<p>${esc(item.descripcion)}</p>` : ''}
        <div class="meta"><span>${ic(ICO[item.prioridad] || 'flat')}${esc(item.prioridad || '')}</span>
          <span>${ic('clock')}${fmtDate(item.fecha)}</span>${geoLine(item)}</div>
        <div class="acts">
          <button type="button" class="mini" data-a="edit" data-id="${esc(item.id)}">${ic('edit')}Editar</button>
          <button type="button" class="mini del" data-a="del" data-id="${esc(item.id)}">${ic('trash')}Eliminar</button>
        </div>
      </article>`).join('') ||
      `<div class="empty">${ic('inbox')}${term ? 'Sin resultados para tu búsqueda.' : 'No hay incidencias en esta vista.'}</div>`;
  } catch (error) {
    console.error('[render]', error);
    $('list').innerHTML = `<div class="empty">Error leyendo datos: ${esc(error.message || error)}</div>`;
  }
}

$('q').addEventListener('input', (event) => {
  q = event.target.value;
  render();
});

// ------------------------------------------------------------
// Formulario: crear / editar
// ------------------------------------------------------------
function formMode(editing) {
  $('ftitle').textContent = editing ? 'Editar incidencia' : 'Nueva incidencia';
  $('savet').textContent = editing ? 'Guardar cambios' : 'Guardar incidencia';
  $('edbar').classList.toggle('on', editing);
  $('cancel').style.display = editing ? 'flex' : 'none';
  $('frow').style.gridTemplateColumns = editing ? '1fr 1fr' : '1fr';
}

function renderGeo() {
  const box = $('geobox');
  const status = $('geo-status');
  const result = $('geo-result');
  const getButton = $('geo-get');

  if (geoData && Number.isFinite(geoData.lat) && Number.isFinite(geoData.lng)) {
    box.classList.add('on');
    status.innerHTML = `${ic('pin')} Ubicación lista para adjuntar`;
    $('geo-coords').textContent = geo.formatCoords(geoData);
    $('geo-map').href = geo.mapUrl(geoData);
    result.hidden = false;
    $('geo-clear').hidden = false;
    getButton.innerHTML = `${ic('pin')}Actualizar`;
  } else {
    box.classList.remove('on');
    status.textContent = 'Sin ubicación adjunta. Puedes guardar la incidencia sin GPS.';
    result.hidden = true;
    $('geo-clear').hidden = true;
    getButton.innerHTML = `${ic('pin')}Obtener ubicación`;
  }
}

function setGeo(position) {
  geoData = position;
  renderGeo();
}

function resetForm() {
  editId = null;
  $('f').reset();
  setGeo(null);
  formMode(false);
}

async function startEdit(id) {
  const item = (await all()).find((row) => row.id === id);
  if (!item) return;
  editId = id;
  $('t').value = item.titulo;
  $('d').value = item.descripcion || '';
  const radio = document.querySelector(`input[name=p][value="${item.prioridad}"]`);
  if (radio) radio.checked = true;
  setGeo(Number.isFinite(item.lat) && Number.isFinite(item.lng) ? {
    lat: item.lat,
    lng: item.lng,
    accuracy: Number.isFinite(item.accuracy) ? item.accuracy : null,
    timestamp: item.geoAt ? new Date(item.geoAt).getTime() : Date.now(),
  } : null);
  formMode(true);
  show('new');
  $('ttl').textContent = 'Editar incidencia';
  $('sub').textContent = 'Modifica los datos y guarda los cambios.';
}

$('cancel').onclick = () => {
  resetForm();
  show('list');
};

$('f').addEventListener('submit', async (event) => {
  event.preventDefault();
  const titulo = $('t').value.trim();
  if (!titulo) {
    toast('Escribe qué ocurrió', 'warn');
    return;
  }

  const button = $('save');
  button.disabled = true;
  const now = new Date().toISOString();
  const fields = {
    titulo,
    prioridad: document.querySelector('input[name=p]:checked').value,
    descripcion: $('d').value.trim(),
  };
  const geoFields = geoData && Number.isFinite(geoData.lat) && Number.isFinite(geoData.lng)
    ? {
        lat: geoData.lat,
        lng: geoData.lng,
        accuracy: Number.isFinite(geoData.accuracy) ? geoData.accuracy : null,
        geoAt: geoData.timestamp ? new Date(geoData.timestamp).toISOString() : now,
      }
    : { lat: null, lng: null, accuracy: null, geoAt: null };

  try {
    let item;
    let message;
    if (editId) {
      const previous = (await all()).find((row) => row.id === editId);
      if (!previous) throw new Error('El registro ya no existe');
      item = { ...previous, ...fields, ...geoFields, updated: now, synced: false };
      message = 'Cambios guardados';
    } else {
      item = {
        id: uid(),
        ...fields,
        ...geoFields,
        fecha: now,
        updated: now,
        synced: false,
        onServer: false,
      };
      message = navigator.onLine ? 'Incidencia guardada' : 'Guardada sin conexión';
    }

    await put(item);
    if (!(await all()).some((row) => row.id === item.id)) throw new Error('No se pudo confirmar el guardado');

    resetForm();
    filter = 'all';
    q = '';
    $('q').value = '';
    await render();
    toast(message);
    show('list');

    // Disparador de notificación: incidencia guardada con prioridad Alta.
    if (item.prioridad === 'Alta' && notify.permission() === 'granted') {
      notify.notifyIncident(item).catch((error) => console.warn('[notify]', error));
    }

    sync();
  } catch (error) {
    console.error('[guardar]', error);
    toast(`Error al guardar: ${error.message || error}`, 'error');
  } finally {
    button.disabled = false;
  }
});

// ------------------------------------------------------------
// Eliminar (borrado lógico + sincronización)
// ------------------------------------------------------------
function closeDialog() {
  $('dlg').classList.remove('on');
  delId = null;
}

$('no').onclick = closeDialog;
$('dlg').addEventListener('click', (event) => {
  if (event.target === $('dlg')) closeDialog();
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDialog();
});

$('yes').onclick = async () => {
  const id = delId;
  closeDialog();
  try {
    const item = (await all()).find((row) => row.id === id);
    if (!item) return;
    await put({ ...item, deleted: true, synced: false, updated: new Date().toISOString() });
    if (editId === id) resetForm();
    await render();
    toast('Incidencia eliminada');
    sync();
  } catch (error) {
    console.error('[eliminar]', error);
    toast('Error al eliminar', 'error');
  }
};

$('list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-a]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.a === 'edit') {
    await startEdit(id);
    return;
  }
  const item = (await all()).find((row) => row.id === id);
  if (!item) return;
  delId = id;
  $('dlgt').textContent = `«${item.titulo}» se eliminará de este dispositivo y del servidor.`;
  $('dlg').classList.add('on');
});

// ------------------------------------------------------------
// Sincronización y estado de red
// ------------------------------------------------------------
async function sync({ silent = false } = {}) {
  if (syncing) return;
  if (!navigator.onLine) {
    if (!silent) toast('Sin conexión: los cambios quedan pendientes', 'offline');
    return;
  }

  syncing = true;
  const button = $('sync');
  button.classList.add('spin');
  button.disabled = true;
  try {
    // syncPending también descarga cambios remotos cuando no hay pendientes.
    const result = await syncPending();
    await render();
    if (result.sent) toast(`${result.sent} cambio(s) sincronizado(s)`);
    else if (result.failed) toast('No se pudo conectar con el servidor', 'error');
    else if (!silent) toast('Todo al día');
  } catch (error) {
    console.error('[sync]', error);
    toast('Error de sincronización', 'error');
  } finally {
    syncing = false;
    button.classList.remove('spin');
    await render();
    renderDiag();
  }
}

$('sync').onclick = () => sync();

function net() {
  const online = navigator.onLine;
  $('stt').textContent = online ? 'En línea' : 'Sin conexión';
  $('st').className = online ? '' : 'off';
  const use = $('st').querySelector('use');
  if (use) use.setAttribute('href', online ? '#ic-wifi' : '#ic-wifioff');
}

addEventListener('online', () => {
  net();
  toast('Conexión restaurada: sincronizando', 'ok');
  sync({ silent: true });
});
addEventListener('offline', () => {
  net();
  toast('Sin conexión: modo offline activo', 'offline');
});

// ------------------------------------------------------------
// Diagnóstico de la PWA (evidencia visible dentro de la app)
// ------------------------------------------------------------
const NOTIF_LABELS = {
  granted: ['Activadas', 'ok'],
  default: ['Sin activar', 'warn'],
  denied: ['Bloqueadas', 'bad'],
  unsupported: ['No soportadas', 'bad'],
};
const GEO_LABELS = {
  granted: ['Permiso concedido', 'ok'],
  prompt: ['Sin solicitar', 'warn'],
  denied: ['Permiso denegado', 'bad'],
  insecure: ['Requiere HTTPS', 'bad'],
  unsupported: ['No soportada', 'bad'],
  unknown: ['Estado desconocido', 'warn'],
};

function setDiag(element, text, tone) {
  if (!element) return;
  element.textContent = text;
  element.className = tone;
}

async function renderDiag() {
  const sw = $('diag-sw');
  const cache = $('diag-cache');
  const store = $('diag-store');
  const notif = $('diag-notif');
  const location = $('diag-geo');

  if (!('serviceWorker' in navigator)) {
    setDiag(sw, 'No soportado', 'bad');
  } else {
    const registration = await getRegistration();
    if (registration?.active) setDiag(sw, `Activo · ${registration.active.state}`, 'ok');
    else if (registration?.waiting) setDiag(sw, 'Esperando activación', 'warn');
    else if (registration?.installing) setDiag(sw, 'Instalando…', 'warn');
    else setDiag(sw, 'Sin registrar', 'bad');
  }

  if ('caches' in window) {
    try {
      const names = await caches.keys();
      let total = 0;
      for (const name of names) {
        const cacheStorage = await caches.open(name);
        total += (await cacheStorage.keys()).length;
      }
      setDiag(cache, names.length ? `${total} recursos · ${names.length} caché(s)` : 'Vacía', total ? 'ok' : 'warn');
    } catch (_) {
      setDiag(cache, 'No disponible', 'bad');
    }
  } else {
    setDiag(cache, 'No soportada', 'bad');
  }

  const storage = storageMode();
  setDiag(store, storage === 'indexeddb' ? 'IndexedDB' : 'localStorage (respaldo)', storage === 'indexeddb' ? 'ok' : 'warn');

  const permission = notify.permission();
  const [notifText, notifTone] = NOTIF_LABELS[permission] || NOTIF_LABELS.unsupported;
  setDiag(notif, notifText, notifTone);
  $('notif-ask').hidden = permission !== 'default';
  $('notif-test').disabled = permission === 'denied' || permission === 'unsupported';

  const last = notify.lastNotification;
  if (last) {
    const time = new Date(last.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    setDiag($('diag-last'), `${last.title} · ${time}`, 'ok');
  } else {
    setDiag($('diag-last'), 'Sin envíos', 'warn');
  }

  const geoPermission = await geo.permissionState();
  const [geoText, geoTone] = GEO_LABELS[geoPermission] || GEO_LABELS.unknown;
  setDiag(location, geoText, geoTone);
  $('geo-test').disabled = geoPermission === 'unsupported' || geoPermission === 'insecure';
}

// ------------------------------------------------------------
// Notificaciones
// ------------------------------------------------------------
$('notif-ask').onclick = async () => {
  const result = await notify.requestPermission();
  await renderDiag();
  if (result === 'granted') toast('Notificaciones activadas', 'bell');
  else if (result === 'denied') toast('Permiso denegado: actívalo en los ajustes del navegador', 'error');
  else if (result === 'unsupported') toast('Este navegador no soporta notificaciones', 'error');
  else toast('No se activaron las notificaciones', 'warn');
};

$('notif-test').onclick = async () => {
  let permission = notify.permission();
  if (permission === 'default') permission = await notify.requestPermission();
  if (permission !== 'granted') {
    await renderDiag();
    toast(permission === 'denied' ? 'Permiso denegado en el navegador' : 'No se pudo activar el permiso', 'error');
    return;
  }
  const result = await notify.showTestNotification();
  await renderDiag();
  toast(result.ok ? 'Notificación enviada' : 'No se pudo mostrar la notificación', result.ok ? 'bell' : 'error');
};

// ------------------------------------------------------------
// Geolocalización (característica física)
// ------------------------------------------------------------
async function captureGeo() {
  if (geoBusy) return;
  const button = $('geo-get');
  const previous = button.innerHTML;
  geoBusy = true;
  button.disabled = true;
  button.textContent = 'Obteniendo…';
  $('geo-status').textContent = 'Solicitando permiso y posición…';
  try {
    const position = await geo.requestPosition();
    setGeo(position);
    $('geo-status').innerHTML = `${ic('pin')} Ubicación lista para adjuntar`;
    toast('Ubicación adjuntada', 'pin');
  } catch (error) {
    const message = geo.describeError(error);
    $('geo-status').textContent = message;
    button.innerHTML = previous;
    toast(message, 'error');
  } finally {
    geoBusy = false;
    button.disabled = false;
    if (geoData) renderGeo();
    else button.innerHTML = `${ic('pin')}Obtener ubicación`;
    renderDiag();
  }
}

$('geo-get').onclick = captureGeo;

$('geo-clear').onclick = () => {
  setGeo(null);
  toast('Ubicación quitada', 'pin');
};

$('geo-test').onclick = async () => {
  const button = $('geo-test');
  const previous = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Ubicando…';
  try {
    const position = await geo.requestPosition();
    toast(`Ubicación: ${geo.formatCoords(position)}`, 'pin');
  } catch (error) {
    toast(geo.describeError(error), 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = previous;
    renderDiag();
  }
};

// ------------------------------------------------------------
// Instalación como app
// ------------------------------------------------------------
addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  $('install').hidden = false;
});

$('install').onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  try {
    const { outcome } = await installPrompt.userChoice;
    toast(outcome === 'accepted' ? 'Instalando Alerta Campus…' : 'Instalación cancelada', outcome === 'accepted' ? 'ok' : 'warn');
  } finally {
    installPrompt = null;
    $('install').hidden = true;
  }
};

addEventListener('appinstalled', () => {
  installPrompt = null;
  $('install').hidden = true;
  toast('Alerta Campus instalada', 'ok');
});

// ------------------------------------------------------------
// Service Worker y actualización
// ------------------------------------------------------------
$('updatebtn').onclick = () => {
  $('updatebar').classList.remove('on');
  applyUpdate();
};
$('updatedismiss').onclick = () => $('updatebar').classList.remove('on');

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
net();
renderGeo();

const params = new URLSearchParams(location.search);
const action = params.get('action');
if (action === 'new') {
  resetForm();
  show('new');
} else if (action === 'list') {
  show('list');
}

render()
  .then(() => sync({ silent: true }))
  .finally(() => renderDiag());

setTimeout(() => $('splash').classList.add('hide'), 1900);

initPWA({
  onUpdateAvailable: () => $('updatebar').classList.add('on'),
  onReady: () => renderDiag(),
});

requestPersistentStorage();
setTimeout(renderDiag, 2500);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderDiag();
});
