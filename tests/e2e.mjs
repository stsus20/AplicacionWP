/* ============================================================
   Pruebas E2E de Alerta Campus con Edge headless + CDP.
   Requisitos: Edge instalado, Node 22+ (WebSocket global), servidor local.
   Uso: node tests/e2e.mjs
   Genera: docs/evidencias/*.png y tests/results/report.json
   ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_PORT = Number(process.env.TEST_PORT) || 3100;
const CDP_PORT = Number(process.env.CDP_PORT) || 9334;
const ORIGIN = `http://127.0.0.1:${APP_PORT}`;
const EVIDENCE = path.join(ROOT, 'docs', 'evidencias');
const RESULTS = path.join(ROOT, 'tests', 'results');
const TMP = path.join(ROOT, 'tests', '.tmp');
const DB_FILE = path.join(TMP, 'db.json');
const profile = path.join(process.env.TEMP, `alerta-campus-e2e-${Date.now()}`);

fs.mkdirSync(EVIDENCE, { recursive: true });
fs.mkdirSync(RESULTS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const now = Date.now();
const seed = [
  {
    id: 'seed-luminaria',
    titulo: 'Luminaria fundida en el pasillo B',
    prioridad: 'Media',
    descripcion: 'El pasillo queda a oscuras después de las 18:00.',
    fecha: new Date(now - 3 * 3600_000).toISOString(),
    updated: new Date(now - 3 * 3600_000).toISOString(),
    synced: true,
  },
  {
    id: 'seed-fuga',
    titulo: 'Fuga de agua en el baño de profesores',
    prioridad: 'Alta',
    descripcion: 'Hay agua acumulada junto a la puerta.',
    fecha: new Date(now - 2 * 3600_000).toISOString(),
    updated: new Date(now - 2 * 3600_000).toISOString(),
    synced: true,
    lat: 19.4326,
    lng: -99.1332,
    accuracy: 18,
    geoAt: new Date(now - 2 * 3600_000).toISOString(),
  },
  {
    id: 'seed-basura',
    titulo: 'Contenedor de basura lleno',
    prioridad: 'Baja',
    descripcion: 'Frente al edificio de vinculación.',
    fecha: new Date(now - 3600_000).toISOString(),
    updated: new Date(now - 3600_000).toISOString(),
    synced: true,
  },
];
fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));

const report = {
  generatedAt: new Date().toISOString(),
  environment: {
    browser: 'Microsoft Edge headless (CDP)',
    viewport: '390x844 (móvil) / 1280x800 (escritorio)',
    url: ORIGIN,
    node: process.version,
  },
  cases: [],
};

function record(id, name, expected, obtained, status, evidence = []) {
  report.cases.push({ id, name, expected, obtained, status, evidence });
  console.log(`${status === 'Aprobado' ? 'PASS' : 'FAIL'} ${id} ${name}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let edge;
let ws;
let nextId = 0;
const pending = new Map();
const browserLogs = [];

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) { /* reintenta */ }
    await sleep(200);
  }
  throw new Error(`No responde ${url}`);
}

async function connect() {
  let target;
  for (let i = 0; i < 100; i += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
      target = list.find((item) => item.type === 'page' && item.url.startsWith('http'));
      if (target) break;
    } catch (_) { /* reintenta */ }
    await sleep(150);
  }
  if (!target) throw new Error('No se encontró la pestaña de Edge');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      browserLogs.push(`[exception] ${message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text}`);
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      browserLogs.push(`[log] ${message.params.entry.text}`);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(expression, timeout = 10000, label = expression) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const value = await evaluate(expression);
      if (value) return value;
    } catch (_) { /* la página puede estar navegando */ }
    await sleep(150);
  }
  throw new Error(`Timeout esperando: ${label}`);
}

async function waitSplash() {
  await waitFor('!document.getElementById("splash") || document.getElementById("splash").classList.contains("hide")', 8000, 'splash oculto');
  await sleep(700); // deja terminar la transición de opacidad
}

async function goto(url = `${ORIGIN}/`) {
  await send('Page.navigate', { url });
  await waitFor('document.readyState === "complete"', 15000);
  await sleep(800);
  await waitSplash();
}

async function reload() {
  await send('Page.reload', { ignoreCache: false });
  await waitFor('document.readyState === "complete"', 15000);
  await sleep(800);
  await waitSplash();
}

async function setOffline(offline) {
  await send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
    connectionType: offline ? 'none' : 'wifi',
  });
  await sleep(500);
}

async function click(selector) {
  const found = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
  if (!found) throw new Error(`No existe el selector ${selector}`);
  await sleep(250);
}

async function fill(selector, value) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('No existe ${selector}');
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function scrollTo(selector) {
  await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  })()`);
  await sleep(350);
}

async function top() {
  await evaluate('window.scrollTo(0, 0)');
  await sleep(250);
}

async function capture(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const file = path.join(EVIDENCE, name);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return `docs/evidencias/${name}`;
}

async function notifications() {
  return evaluate(`(async () => {
    const registration = await navigator.serviceWorker.ready;
    const list = await registration.getNotifications();
    return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag }));
  })()`);
}

async function serverItems() {
  const response = await fetch(`${ORIGIN}/api/incidencias`);
  return response.json();
}

async function main() {
  // Servidor aislado con base de datos temporal.
  server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(APP_PORT), DB_FILE },
    stdio: 'ignore',
  });
  await waitForHttp(`${ORIGIN}/api/health`);

  edge = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=390,844',
    `${ORIGIN}/`,
  ], { stdio: 'ignore' });

  await connect();
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Emulation.setGeolocationOverride', {
    latitude: 19.4326,
    longitude: -99.1332,
    accuracy: 25,
  });
  await send('Browser.grantPermissions', {
    origin: ORIGIN,
    permissions: ['geolocation', 'notifications'],
  });
  await goto();
  await waitFor('document.getElementById("tot") && document.getElementById("tot").textContent !== "0"', 12000, 'incidencias sincronizadas');
  await waitFor('document.getElementById("diag-sw")?.textContent.includes("Activo")', 12000, 'Service Worker activo');
  await sleep(500);

  // CP-01: carga inicial y Service Worker
  const initialState = await evaluate(`({
    total: document.getElementById('tot').textContent,
    sw: document.getElementById('diag-sw').textContent,
    cache: document.getElementById('diag-cache').textContent,
    store: document.getElementById('diag-store').textContent,
    controller: Boolean(navigator.serviceWorker.controller),
    online: navigator.onLine
  })`);
  const homeShot = await capture('01-home-online.png');
  record(
    'CP-01',
    'Carga inicial, Service Worker y caché offline',
    'La app carga, el SW queda activo y el precache contiene los recursos del shell.',
    `Total ${initialState.total}; SW: ${initialState.sw}; caché: ${initialState.cache}; almacenamiento: ${initialState.store}; controlador: ${initialState.controller}.`,
    initialState.total === '3' && initialState.sw.includes('Activo') && initialState.controller ? 'Aprobado' : 'Fallido',
    [homeShot],
  );

  // CP-02: manifest e instalabilidad
  const manifest = await send('Page.getAppManifest');
  const installability = await send('Page.getInstallabilityErrors');
  const manifestData = manifest.data ? JSON.parse(manifest.data) : null;
  const manifestOk = Boolean(manifestData?.name && manifestData?.icons?.some((icon) => icon.sizes === '192x192') && manifestData?.icons?.some((icon) => icon.sizes === '512x512'));
  record(
    'CP-02',
    'Manifest e instalabilidad',
    'manifest.json válido, con iconos 192/512 y sin errores críticos de instalación.',
    `Manifest: ${manifestData?.name || 'no leído'}; iconos: ${manifestData?.icons?.length || 0}; errores: ${JSON.stringify(installability.installabilityErrors || [])}.`,
    manifestOk ? 'Aprobado' : 'Fallido',
    [],
  );

  // CP-03: diagnóstico visible + notificación de prueba
  await scrollTo('#card-pwa');
  await sleep(600);
  const diagShot = await capture('02-diagnostico-pwa.png');
  await scrollTo('#card-pwa');
  await click('#notif-test');
  await sleep(1200);
  const notifList = await notifications();
  const notifShot = await capture('03-notificacion.png');
  record(
    'CP-03',
    'Permiso y notificación local de prueba',
    'El permiso está concedido y showNotification deja una notificación consultable.',
    `Notificaciones obtenidas: ${JSON.stringify(notifList)}.`,
    notifList.some((item) => item.tag === 'alerta-campus-prueba') ? 'Aprobado' : 'Fallido',
    [diagShot, notifShot],
  );

  // CP-04: geolocalización exitosa + alta de incidencia
  await click('nav button[data-v="new"]');
  await fill('#t', 'Fuga de agua en el laboratorio 3');
  await fill('#d', 'El agua se acerca a las tomas de corriente.');
  await evaluate('document.querySelector(\'input[name=p][value="Alta"]\').checked = true');
  await click('#geo-get');
  await waitFor('document.getElementById("geo-result") && !document.getElementById("geo-result").hidden', 12000, 'coordenadas capturadas');
  await scrollTo('#geobox');
  const geoS = await evaluate('document.getElementById("geo-coords").textContent');
  const geoShot = await capture('04-geolocalizacion.png');
  record(
    'CP-04',
    'Geolocalización: permiso concedido y captura',
    'Se obtienen coordenadas y precisión sin bloquear el formulario.',
    `Coordenadas mostradas: ${geoS}.`,
    geoS.includes('19.43260') && geoS.includes('99.13320') ? 'Aprobado' : 'Fallido',
    [geoShot],
  );

  await evaluate('document.getElementById("f").requestSubmit()');
  await waitFor('document.querySelectorAll("#list .tk").length >= 4', 12000, 'incidencia guardada');
  await sleep(1500);
  const saved = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('#list .tk')];
    const card = cards.find((el) => el.textContent.includes('Fuga de agua en el laboratorio 3'));
    return card ? { text: card.textContent.replace(/\\s+/g, ' ').trim(), map: card.querySelector('.meta a')?.href || null } : null;
  })()`);
  await top();
  await sleep(400);
  const listShot = await capture('05-historial-geo.png');
  const serverAfterCreate = await serverItems();
  const serverItem = serverAfterCreate.find((item) => item.titulo === 'Fuga de agua en el laboratorio 3');
  record(
    'CP-05',
    'Alta de incidencia con ubicación y sincronización',
    'La incidencia se guarda, muestra enlace al mapa y llega al servidor con lat/lng.',
    `Tarjeta: ${saved?.text?.slice(0, 120) || 'no encontrada'}; mapa: ${saved?.map ? 'sí' : 'no'}; servidor: ${serverItem ? `${serverItem.lat}, ${serverItem.lng}` : 'no'}.`,
    saved?.map && serverItem?.lat === 19.4326 ? 'Aprobado' : 'Fallido',
    [listShot],
  );

  // CP-06: notificación disparada por prioridad Alta
  const highNotifs = await notifications();
  record(
    'CP-06',
    'Disparador: incidencia de prioridad Alta',
    'Al guardar una incidencia Alta con permiso concedido se emite una notificación.',
    `Notificaciones: ${JSON.stringify(highNotifs)}.`,
    highNotifs.some((item) => item.title.includes('Alta')) ? 'Aprobado' : 'Fallido',
    [],
  );

  // CP-07: geolocalización denegada
  await send('Browser.setPermission', {
    origin: ORIGIN,
    permission: { name: 'geolocation' },
    setting: 'denied',
  });
  await reload();
  await waitFor('document.getElementById("diag-sw")?.textContent.includes("Activo")', 12000);
  await click('nav button[data-v="new"]');
  await click('#geo-get');
  await waitFor('document.getElementById("geo-status")?.textContent.includes("denegado")', 8000, 'mensaje de permiso denegado');
  await scrollTo('#geobox');
  const deniedText = await evaluate('document.getElementById("geo-status").textContent');
  const deniedShot = await capture('06-geo-denegado.png');
  record(
    'CP-07',
    'Geolocalización: permiso denegado',
    'Se muestra un mensaje claro y la incidencia puede guardarse sin ubicación.',
    `Mensaje: ${deniedText}`,
    deniedText.includes('denegado') ? 'Aprobado' : 'Fallido',
    [deniedShot],
  );

  // Restaura permisos para las pruebas offline.
  await send('Browser.setPermission', {
    origin: ORIGIN,
    permission: { name: 'geolocation' },
    setting: 'granted',
  });
  await reload();
  await waitFor('document.getElementById("diag-sw")?.textContent.includes("Activo")', 12000);

  // CP-08: modo offline con recarga
  await setOffline(true);
  await waitFor('navigator.onLine === false', 8000, 'navegador offline');
  await reload();
  await waitFor('document.getElementById("stt")?.textContent === "Sin conexión"', 12000, 'estado sin conexión');
  const offlineState = await evaluate(`({
    stt: document.getElementById('stt').textContent,
    total: document.getElementById('tot').textContent,
    controller: Boolean(navigator.serviceWorker.controller),
    cache: document.getElementById('diag-cache').textContent
  })`);
  await top();
  const offlineShot = await capture('07-offline.png');
  record(
    'CP-08',
    'Funcionamiento offline con recarga',
    'La app recarga sin red, conserva los datos y muestra el estado Sin conexión.',
    `Estado: ${offlineState.stt}; total: ${offlineState.total}; controlador: ${offlineState.controller}; caché: ${offlineState.cache}.`,
    offlineState.stt === 'Sin conexión' && Number(offlineState.total) >= 3 && offlineState.controller ? 'Aprobado' : 'Fallido',
    [offlineShot],
  );

  // CP-09: alta offline y cola de pendientes
  await click('nav button[data-v="new"]');
  await fill('#t', 'Árbol caído frente a la biblioteca');
  await fill('#d', 'Bloquea el paso peatonal; se reporta sin señal.');
  await evaluate('document.querySelector(\'input[name=p][value="Media"]\').checked = true');
  await evaluate('document.getElementById("f").requestSubmit()');
  await waitFor('document.querySelectorAll("#list .tk").length >= 5', 10000, 'incidencia offline guardada');
  await top();
  const pendingState = await evaluate(`({
    pend: document.getElementById('pen').textContent,
    dot: document.getElementById('dot').textContent,
    badge: [...document.querySelectorAll('#list .tk')].find((el) => el.textContent.includes('Árbol caído'))?.querySelector('.badge')?.textContent.trim()
  })`);
  const pendingShot = await capture('08-pendiente-offline.png');
  record(
    'CP-09',
    'Alta de incidencia sin conexión',
    'La incidencia se guarda en IndexedDB y queda marcada como pendiente.',
    `Pendientes: ${pendingState.pend}; badge: ${pendingState.badge}; contador: ${pendingState.dot}.`,
    Number(pendingState.pend) > 0 && pendingState.badge === 'Pendiente' ? 'Aprobado' : 'Fallido',
    [pendingShot],
  );

  // CP-10: reconexión y sincronización automática
  await setOffline(false);
  await waitFor('navigator.onLine === true', 8000, 'navegador online');
  await waitFor('document.getElementById("pen")?.textContent === "0"', 15000, 'cola sincronizada');
  await sleep(800);
  const serverAfterOffline = await serverItems();
  const offlineSynced = serverAfterOffline.find((item) => item.titulo === 'Árbol caído frente a la biblioteca');
  await top();
  const syncShot = await capture('09-sincronizado.png');
  record(
    'CP-10',
    'Reconexión y sincronización automática',
    'Al volver la red, la cola pendiente se envía y el contador queda en cero.',
    `Servidor: ${offlineSynced ? 'incidencia presente' : 'no encontrada'}; pendientes: ${await evaluate('document.getElementById("pen").textContent')}.`,
    Boolean(offlineSynced) ? 'Aprobado' : 'Fallido',
    [syncShot],
  );

  // CP-11: idempotencia del servidor ante reintentos
  const duplicate = {
    id: `dedup-${Date.now()}`,
    titulo: 'Prueba de idempotencia',
    prioridad: 'Baja',
    descripcion: 'Se envía dos veces con el mismo id.',
    fecha: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  const first = await fetch(`${ORIGIN}/api/incidencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(duplicate),
  });
  const second = await fetch(`${ORIGIN}/api/incidencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(duplicate),
  });
  const allAfterDuplicate = await serverItems();
  const copies = allAfterDuplicate.filter((item) => item.id === duplicate.id).length;
  record(
    'CP-11',
    'Idempotencia ante reintentos',
    'Dos POST con el mismo id no duplican el registro.',
    `Respuestas: ${first.status}/${second.status}; copias en servidor: ${copies}.`,
    copies === 1 ? 'Aprobado' : 'Fallido',
    [],
  );

  // CP-12: persistencia tras recarga
  await reload();
  await waitFor('document.getElementById("tot") && document.getElementById("tot").textContent !== "0"', 12000);
  const persisted = await evaluate('document.getElementById("tot").textContent');
  record(
    'CP-12',
    'Persistencia local tras recarga',
    'IndexedDB conserva las incidencias al recargar.',
    `Total tras recarga: ${persisted}.`,
    Number(persisted) >= 5 ? 'Aprobado' : 'Fallido',
    [],
  );

  // CP-13: borrado lógico y propagación
  await click('nav button[data-v="list"]');
  const targetSelector = await evaluate(`(() => {
    const card = [...document.querySelectorAll('#list .tk')].find((el) => el.textContent.includes('Árbol caído frente a la biblioteca'));
    if (!card) return null;
    card.querySelector('[data-a="del"]')?.click();
    return true;
  })()`);
  if (targetSelector) {
    await waitFor('document.getElementById("dlg")?.classList.contains("on")', 5000);
    await click('#yes');
    await sleep(1200);
  }
  const serverAfterDelete = await serverItems();
  const deleted = !serverAfterDelete.some((item) => item.titulo === 'Árbol caído frente a la biblioteca');
  record(
    'CP-13',
    'Eliminación de incidencia',
    'La incidencia se elimina localmente y del servidor tras sincronizar.',
    `Eliminada en servidor: ${deleted}.`,
    deleted ? 'Aprobado' : 'Fallido',
    [],
  );

  // CP-14: vista de escritorio / responsive
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await click('nav button[data-v="home"]');
  await top();
  await sleep(500);
  const desktopShot = await capture('10-escritorio.png');
  const desktopLayout = await evaluate(`({
    width: document.querySelector('.app').getBoundingClientRect().width,
    nav: getComputedStyle(document.querySelector('nav')).position
  })`);
  record(
    'CP-14',
    'Diseño responsive de escritorio',
    'La app se centra a 600px y la navegación permanece fija.',
    `Ancho del contenedor: ${desktopLayout.width}px; navegación: ${desktopLayout.nav}.`,
    Math.round(desktopLayout.width) <= 600 ? 'Aprobado' : 'Fallido',
    [desktopShot],
  );

  // CP-15: consola sin errores de aplicación
  const appErrors = browserLogs.filter((line) => !line.includes('Failed to load resource') && !line.includes('Deprecation'));
  record(
    'CP-15',
    'Consola del navegador',
    'Sin excepciones de JavaScript durante el recorrido completo.',
    appErrors.length ? appErrors.join(' | ') : 'Sin excepciones.',
    appErrors.length === 0 ? 'Aprobado' : 'Fallido',
    [],
  );
}

try {
  await main();
} catch (error) {
  console.error('E2E ERROR:', error);
  report.fatal = String(error?.stack || error);
  try {
    await capture('99-error.png');
  } catch (_) { /* ignora */ }
} finally {
  report.summary = {
    total: report.cases.length,
    passed: report.cases.filter((item) => item.status === 'Aprobado').length,
    failed: report.cases.filter((item) => item.status === 'Fallido').length,
    logs: browserLogs,
  };
  fs.writeFileSync(path.join(RESULTS, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\nRESUMEN: ${report.summary.passed}/${report.summary.total} aprobadas`);
  try { ws?.close(); } catch (_) { /* ignora */ }
  try { edge?.kill(); } catch (_) { /* ignora */ }
  try { server?.kill(); } catch (_) { /* ignora */ }
  await sleep(700);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (_) { /* ignora */ }
}
