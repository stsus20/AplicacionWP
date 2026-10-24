// Servidor mínimo sin dependencias externas: sirve la PWA y una API REST.
// Uso local:            node server.js
// Puerto y base de datos configurables:
//   PORT=3100 DB_FILE=./tests/.tmp/db.json node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = path.resolve(process.env.DB_FILE || path.join(__dirname, 'db.json'));
const MAX_BODY = 1024 * 1024; // 1 MB

let data = [];
try {
  if (fs.existsSync(DB_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]');
    data = Array.isArray(parsed) ? parsed : [];
  }
} catch (error) {
  console.warn(`[server] No se pudo leer ${DB_FILE}:`, error.message);
  data = [];
}

function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (_) {
        resolve(null);
      }
    });
    req.on('error', reject);
  });
}

function validDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalize(input) {
  if (!input || typeof input !== 'object') return null;
  const id = String(input.id || '').trim().slice(0, 100);
  const titulo = String(input.titulo || '').trim().slice(0, 120);
  if (!id || !titulo) return null;

  const prioridad = ['Baja', 'Media', 'Alta'].includes(input.prioridad) ? input.prioridad : 'Baja';
  const descripcion = String(input.descripcion || '').slice(0, 1000);
  const fecha = validDate(input.fecha) ? input.fecha : new Date().toISOString();
  const updated = validDate(input.updated) ? input.updated : fecha;

  const item = { id, titulo, prioridad, descripcion, fecha, updated, synced: true };

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    item.lat = lat;
    item.lng = lng;
    const accuracy = Number(input.accuracy);
    item.accuracy = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
    item.geoAt = validDate(input.geoAt) ? input.geoAt : fecha;
  }

  return item;
}

function upsert(input) {
  const clean = normalize(input);
  if (!clean) return { error: 'Datos inválidos' };
  const index = data.findIndex((item) => item.id === clean.id);
  if (index < 0) {
    data.push(clean);
    return { result: 'created', item: clean };
  }
  // Last-write-wins por marca de tiempo; una versión vieja no pisa la nueva.
  if ((clean.updated || '') >= (data[index].updated || '')) {
    data[index] = clean;
    return { result: 'updated', item: clean };
  }
  return { result: 'ignored', item: data[index] };
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  // API REST
  const match = url.match(/^\/api\/incidencias(?:\/([^/]+))?$/);
  if (match) {
    const id = match[1] ? decodeURIComponent(match[1]) : null;

    if (req.method === 'GET' && !id) return json(res, 200, data);
    if (req.method === 'GET' && id) {
      const item = data.find((row) => row.id === id);
      return item ? json(res, 200, item) : json(res, 404, { ok: false, error: 'No encontrada' });
    }
    if (req.method === 'POST' && !id) {
      const body = await readBody(req);
      if (!body?.id) return json(res, 400, { ok: false, error: 'Falta el id' });
      const outcome = upsert(body);
      if (outcome.error) return json(res, 400, { ok: false, error: outcome.error });
      save();
      return json(res, outcome.result === 'created' ? 201 : 200, {
        ok: true,
        id: outcome.item.id,
        result: outcome.result,
      });
    }
    if (req.method === 'PUT' && id) {
      const body = await readBody(req);
      if (!body) return json(res, 400, { ok: false, error: 'JSON inválido' });
      const outcome = upsert({ ...body, id });
      if (outcome.error) return json(res, 400, { ok: false, error: outcome.error });
      save();
      return json(res, 200, { ok: true, id, result: outcome.result });
    }
    if (req.method === 'DELETE' && id) {
      const before = data.length;
      data = data.filter((row) => row.id !== id);
      if (data.length !== before) save();
      return json(res, 200, { ok: true, id, deleted: before !== data.length });
    }
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return json(res, 405, { ok: false, error: 'Método no permitido' });
  }

  if (url === '/api/health') {
    return json(res, 200, {
      ok: true,
      service: 'alerta-campus',
      items: data.length,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }

  // Archivos estáticos
  let pathname;
  try {
    pathname = decodeURIComponent(url === '/' ? '/index.html' : url);
  } catch (_) {
    res.statusCode = 400;
    return res.end('400');
  }

  const filePath = path.resolve(__dirname, `.${pathname}`);
  const root = path.resolve(__dirname) + path.sep;
  if (!filePath.startsWith(root)) {
    res.statusCode = 403;
    return res.end('403');
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('404');
    }

    const ext = path.extname(filePath).toLowerCase();
    const noStore = /(?:^|[\\/])(?:sw\.js|index\.html|offline\.html|manifest\.json)$/.test(pathname);
    const contentType = pathname.endsWith('/manifest.json')
      ? 'application/manifest+json; charset=utf-8'
      : TYPES[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', noStore ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (pathname === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');

    fs.readFile(filePath, (readError, content) => {
      if (readError) {
        res.statusCode = 500;
        return res.end('500');
      }
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Alerta Campus: http://localhost:${PORT}`);
  console.log(`Base de datos: ${DB_FILE}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
