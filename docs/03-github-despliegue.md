# Punto 3.1 y 3.2 — GitHub y despliegue público

> **Objetivo:** publicar el código en GitHub con historial de commits coherente y obtener
> una URL HTTPS donde la PWA sea instalable y el Service Worker funcione.
> **Regla de oro:** el Service Worker solo funciona en `https://` o `http://localhost`.

---

## 1. Antes de publicar

### 1.1 Archivos que sí deben subirse

```text
index.html
offline.html
manifest.json
sw.js
server.js
package.json
db.example.json          (opcional, datos de ejemplo)
css/
js/
icons/
docs/
tests/e2e.mjs
tests/results/report.json
tools/generate-icons.py
netlify.toml
vercel.json
render.yaml
.gitignore
README.md
```

### 1.2 Archivos que NO deben subirse

| Archivo | Motivo |
|---|---|
| `db.json` | Datos locales de prueba; puede contener información real. |
| `db.json.tmp` | Archivo temporal de escritura atómica. |
| `node_modules/` | No hay dependencias de producción, pero si se añaden, no se versionan. |
| `.tmp/`, `tests/.tmp/` | Perfiles de navegador, capturas temporales y bases de prueba. |
| `*.log` | Ruido de ejecución. |
| `.env`, claves | Secretos. |

El `.gitignore` del proyecto ya los excluye:

```gitignore
node_modules/
.tmp/
tests/.tmp/
db.json
db.json.tmp
*.log
.DS_Store
Thumbs.db
```

> Si quieres conservar datos de demostración, versiona `db.example.json` y documenta que el
> servidor crea `db.json` vacío en el primer arranque.

---

## 2. Subir el código a GitHub

### 2.1 Inicializar el repositorio (solo la primera vez)

```powershell
# En C:\xampp\htdocs\pwa-incidencias
git init
git branch -M main
git config user.name "Tu Nombre"
git config user.email "tu-correo@ejemplo.com"
```

### 2.2 Revisar qué se va a subir

```powershell
git status
git add -A
git status
```

Comprueba que **no** aparezcan `db.json`, `.tmp/` ni perfiles de navegador.

### 2.3 Commits sugeridos (historial legible)

Se recomienda separar el trabajo en commits atómicos con [Conventional Commits](https://www.conventionalcommits.org/):

```powershell
# 1) Estructura base y estilos
git add index.html css/styles.css offline.html
git commit -m "feat(ui): separa estilos y añade shell offline"

# 2) Módulos de datos y red
git add js/db.js js/api.js js/ui.js
git commit -m "feat(offline): añade IndexedDB, respaldo local y cola de sincronización"

# 3) Service Worker y manifest
git add sw.js js/pwa.js manifest.json icons/
git commit -m "feat(pwa): service worker con precache y estrategias por recurso"

# 4) Notificaciones y geolocalización
git add js/notifications.js js/geolocation.js js/app.js
git commit -m "feat(device): integra notificaciones locales y geolocalización"

# 5) Servidor y scripts
git add server.js package.json tools/
git commit -m "feat(server): API REST con validación, idempotencia y MIME"

# 6) Pruebas y documentación
git add tests/ docs/ README.md netlify.toml vercel.json render.yaml .gitignore
git commit -m "test(docs): añade pruebas E2E, evidencias y documentación técnica"
```

Si prefieres un solo commit:

```powershell
git add -A
git commit -m "feat: PWA offline-first con notificaciones y geolocalización"
```

### 2.4 Crear el repositorio remoto

**Opción A — GitHub CLI (`gh`)**

```powershell
gh auth login
gh repo create alerta-campus-pwa --public --source=. --remote=origin --push
```

**Opción B — Desde la web**

1. github.com → **New repository**.
2. Nombre: `alerta-campus-pwa`.
3. Visibilidad: pública (para el entregable) o privada.
4. **No** inicializar con README ni `.gitignore` (ya existen).
5. Crear y copiar la URL.

```powershell
git remote add origin https://github.com/TU-USUARIO/alerta-campus-pwa.git
git push -u origin main
```

### 2.5 Verificación

```powershell
git log --oneline --graph --decorate
git remote -v
```

En GitHub deben verse los commits, la carpeta `docs/evidencias/` con las capturas y
`tests/results/report.json`.

---

## 3. Elegir plataforma de despliegue

| Plataforma | Coste | API Node (`/api`) | Service Worker | Facilidad | Recomendación |
|---|---|---|---|---|---|
| **GitHub Pages** | Gratis | ❌ No | ✅ HTTPS | Media | Demo estática del frontend. |
| **Netlify** | Gratis | ❌ No (salvo Functions) | ✅ HTTPS | Muy alta | Demo estática + formulario de despliegue. |
| **Vercel** | Gratis | ❌ No (salvo Serverless Functions) | ✅ HTTPS | Muy alta | Demo estática; requiere adaptar la API. |
| **Render** | Gratis (con suspensión) | ✅ Sí (`node server.js`) | ✅ HTTPS | Media | Demo completa con API y `db.json`. |
| **Railway / Fly.io** | Créditos gratuitos | ✅ Sí | ✅ HTTPS | Media | Alternativa full stack. |

> **Importante:** en un hosting estático la API `/api/incidencias` no existe. La app sigue
> funcionando offline y guardando en IndexedDB, pero la sincronización quedará pendiente y
> mostrará «No se pudo conectar con el servidor». Para una demo completa, usa Render o
> adapta la API a funciones serverless con una base de datos externa.

---

## 4. Opción A — GitHub Pages (frontend estático)

### 4.1 Activar Pages

1. Repositorio → **Settings** → **Pages**.
2. **Source:** *Deploy from a branch*.
3. **Branch:** `main` / carpeta `/ (root)`.
4. **Save**.
5. Esperar 1–2 minutos. URL:
   `https://TU-USUARIO.github.io/alerta-campus-pwa/`

### 4.2 Por qué funciona en una subcarpeta

- `manifest.json` usa `start_url: "./index.html"` y `scope: "./"`.
- El SW se registra con `./sw.js` y `scope: './'`.
- Todas las rutas de assets son relativas.
- El `scope` del SW queda en `/alerta-campus-pwa/`, no en la raíz del dominio.

### 4.3 Limitaciones

- La API no está disponible (404). La app funciona offline-first, pero no sincroniza.
- GitHub Pages no permite cabeceras personalizadas; el SW se sirve con caché corta, pero
  GitHub Pages respeta `ETag` y el navegador detecta cambios. Si hay problemas, fuerza
  `Ctrl+Shift+R` o cambia `VERSION` y vuelve a desplegar.

### 4.4 Verificación

```
https://TU-USUARIO.github.io/alerta-campus-pwa/
```

- DevTools → Application → Manifest: nombre e iconos.
- DevTools → Application → Service Workers: `activated and is running`.
- Network → Offline → recargar: debe abrir la app.
- El botón «Instalar app» puede aparecer (si el navegador lo permite).

---

## 5. Opción B — Netlify (recomendada para demo estática)

### 5.1 Despliegue por arrastre

1. netlify.com → **Add new site** → **Deploy manually**.
2. Arrastra la carpeta del proyecto (sin `db.json`, `.tmp` ni `node_modules`).
3. Netlify publica y da una URL `https://random-name.netlify.app`.
4. **Site settings** → **Change site name** → `alerta-campus-pwa`.

### 5.2 Despliegue desde GitHub (recomendado)

1. **Add new site** → **Import an existing project** → GitHub.
2. Selecciona el repositorio.
3. Configuración:
   - **Build command:** vacío.
   - **Publish directory:** `.`
   - **Functions directory:** vacío.
4. **Deploy site**.

El archivo `netlify.toml` incluido configura:

```toml
[build]
  publish = "."

[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache, no-store, must-revalidate"

[[headers]]
  for = "/manifest.json"
  [headers.values]
    Content-Type = "application/manifest+json"
```

### 5.3 Limitaciones

- Sin API. La sincronización no funciona; el resto sí.
- Para una demo con API, usa Netlify Functions + base de datos (trabajo adicional) o Render.

---

## 6. Opción C — Vercel (frontend estático)

1. vercel.com → **Add New** → **Project** → importar el repositorio.
2. **Framework Preset:** Other.
3. **Build Command:** vacío.
4. **Output Directory:** `.`
5. **Deploy**.

`vercel.json` incluido:

```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }]
    },
    {
      "source": "/manifest.json",
      "headers": [{ "key": "Content-Type", "value": "application/manifest+json" }]
    }
  ]
}
```

- URL: `https://alerta-campus-pwa.vercel.app`.
- La API no existe; aplica la misma limitación que GitHub Pages/Netlify.
- Vercel detecta `server.js` como proyecto Node si se configura, pero no como función
  serverless. Para API real, crea `api/incidencias.js` y una base de datos (Vercel KV,
  Neon, Supabase).

---

## 7. Opción D — Render (PWA + API completa)

### 7.1 Despliegue desde GitHub

1. render.com → **New** → **Web Service**.
2. Conecta el repositorio.
3. Configuración:
   - **Runtime:** Node.
   - **Build Command:** vacío (o `npm install` si añades dependencias).
   - **Start Command:** `node server.js`.
   - **Plan:** Free.
4. **Create Web Service**.
5. URL: `https://alerta-campus-pwa.onrender.com`.

El archivo `render.yaml` documenta la infraestructura:

```yaml
services:
  - type: web
    name: alerta-campus-pwa
    runtime: node
    plan: free
    buildCommand: ""
    startCommand: node server.js
    envVars:
      - key: NODE_VERSION
        value: "22"
```

### 7.2 Limitaciones del plan gratuito

- El servicio se suspende tras un periodo de inactividad; la primera petición tarda en
  despertar.
- El sistema de archivos es efímero: `db.json` se pierde en cada redeploy o reinicio.
- Para persistencia real, conecta una base de datos (PostgreSQL, MongoDB, Supabase) o usa
  un disco persistente de pago. Documenta esta limitación en la entrega.

### 7.3 Verificación de la API

```powershell
Invoke-RestMethod https://TU-SERVICIO.onrender.com/api/health
Invoke-RestMethod https://TU-SERVICIO.onrender.com/api/incidencias
```

---

## 8. Checklist posterior al despliegue

- [ ] La URL es HTTPS (candado).
- [ ] `manifest.json` responde 200 y el navegador muestra nombre e iconos.
- [ ] El Service Worker aparece como `activated`.
- [ ] La app abre con Network → Offline después de una primera visita.
- [ ] Se puede crear una incidencia offline y queda «Pendiente».
- [ ] Al reconectar, la cola se sincroniza (si hay API).
- [ ] El permiso de notificaciones se pide con un clic y la notificación aparece.
- [ ] La geolocalización pide permiso y muestra coordenadas (o un error claro).
- [ ] La app se instala en Android/escritorio; en iOS se añade a la pantalla de inicio.
- [ ] No hay errores 404 de assets ni excepciones en consola.

---

## 9. Problemas típicos en producción

| Problema | Causa | Solución |
|---|---|---|
| El SW no se registra | El sitio se sirve por HTTP o el archivo está en otra ruta. | Usar HTTPS y verificar `./sw.js`. |
| Sigue la versión vieja | Caché del SW o del CDN. | Subir `VERSION`, `no-store` en `sw.js`, recargar dos veces. |
| 404 en assets | Rutas absolutas (`/js/app.js`) en un subpath. | Usar rutas relativas (`./js/app.js`). |
| Manifest no válido | MIME incorrecto o JSON inválido. | Servir `application/manifest+json`, validar JSON. |
| No se puede instalar | Faltan iconos 192/512 o `start_url`. | Revisar `Page.getInstallabilityErrors` en DevTools. |
| API 404 en Netlify/Vercel/Pages | No hay backend. | Desplegar en Render o usar Functions + DB. |
| `db.json` se pierde en Render | Filesystem efímero. | Base de datos externa o disco persistente. |
| Notificaciones no aparecen en iOS | La PWA no está instalada o iOS < 16.4. | Instalar en pantalla de inicio; actualizar iOS. |

---

## 10. Rollback y versionado

1. Si un despliegue rompe la PWA, vuelve al commit anterior:
   ```powershell
   git revert HEAD
   git push
   ```
2. En Netlify/Vercel, usa **Deploys** → **Rollback** a un deployment anterior.
3. En GitHub Pages, revierte el commit o cambia la rama de Pages.
4. Sube `VERSION` del SW para forzar la actualización de caché.

---

## 11. Evidencia de publicación

Para el entregable, adjunta:

- Captura de la URL pública en la barra del navegador.
- Captura de **DevTools → Application → Manifest**.
- Captura de **DevTools → Application → Service Workers** (activado).
- Captura de la app instalada o del botón «Instalar app».
- URL del repositorio y del despliegue.
