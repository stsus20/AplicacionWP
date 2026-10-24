// Persistencia local offline-first.
// Fuente principal: IndexedDB. Respaldo automático: localStorage.
// La UI nunca habla con IndexedDB directamente: importa estas funciones.

const DB_NAME = 'incidenciasDB';
const DB_VERSION = 1;
const STORE = 'items';
const LS_KEY = 'incidencias_respaldo';

let db = null;
let mode = 'indexeddb';

export function storageMode() {
  return mode;
}

export function openDB() {
  if (db) return Promise.resolve(db);
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB no disponible'));
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      return reject(error);
    }
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      db = req.result;
      db.onversionchange = () => {
        db.close();
        db = null;
      };
      mode = 'indexeddb';
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB está bloqueada por otra pestaña'));
  });
}

function tx(storeMode, fn) {
  return openDB().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, storeMode);
    const request = fn(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transacción abortada'));
  }));
}

function lsRead() {
  try {
    const value = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function lsWrite(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export async function all() {
  if (mode !== 'localstorage') {
    try {
      const rows = await tx('readonly', (store) => store.getAll());
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      console.warn('[db] IndexedDB falló, se usa localStorage:', error);
      mode = 'localstorage';
    }
  }
  return lsRead();
}

export async function put(item) {
  if (mode !== 'localstorage') {
    try {
      await tx('readwrite', (store) => store.put(item));
      return item;
    } catch (error) {
      console.warn('[db] IndexedDB falló, se usa localStorage:', error);
      mode = 'localstorage';
    }
  }
  const items = lsRead();
  const index = items.findIndex((row) => row.id === item.id);
  if (index >= 0) items[index] = item;
  else items.push(item);
  lsWrite(items);
  return item;
}

export async function remove(id) {
  if (mode !== 'localstorage') {
    try {
      await tx('readwrite', (store) => store.delete(id));
      return;
    } catch (error) {
      console.warn('[db] IndexedDB falló, se usa localStorage:', error);
      mode = 'localstorage';
    }
  }
  lsWrite(lsRead().filter((row) => row.id !== id));
}
