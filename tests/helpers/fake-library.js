// A device for sync tests: the real platform, storage and cloud-sync services in a VM context, on
// an in-memory IndexedDB, signed in to a shared fake Google Drive (makeDrive).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

// Like IndexedDB, readwrite transactions run one at a time (a later one starts once the earlier
// one has finished), even when they come from different contexts sharing the database.
function makeDatabase() {
  const stores = { novels: {}, chapters: {}, syncState: {} };
  const reads = { chapterGetAll: 0, chapterGet: 0 };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const request = (result) => {
    const req = { result, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  };
  const answer = (run, read) => {
    const req = { result: undefined, onsuccess: null, onerror: null };
    run(() => {
      req.result = read();
      setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    });
    return req;
  };
  const store = (name, run) => ({
    getAll: () => answer(run, () => {
      if (name === 'chapters') reads.chapterGetAll++;
      return Object.values(stores[name]).map(copy);
    }),
    get: (id) => answer(run, () => {
      if (name === 'chapters') reads.chapterGet++;
      return stores[name][id] ? copy(stores[name][id]) : null;
    }),
    put: (record) => { const saved = copy(record); run(() => { stores[name][saved.id] = saved; }); },
    delete: (id) => run(() => { delete stores[name][id]; }),
    clear: () => run(() => { stores[name] = {}; }),
    index: (field) => ({
      openCursor: (range) => {
        const req = { onsuccess: null };
        run(() => {
          const matches = Object.values(stores[name]).filter((r) => r[field] === range.only);
          let i = 0;
          const step = () => setTimeout(() => {
            if (!req.onsuccess) return;
            const record = matches[i];
            req.onsuccess({
              target: {
                result: record
                  ? { value: record, delete: () => { delete stores[name][record.id]; }, continue: () => { i++; step(); } }
                  : null
              }
            });
          }, 0);
          step();
        });
        return req;
      }
    })
  });
  let writing = Promise.resolve();
  const database = {
    transaction(names, mode) {
      let active = false;
      const waiting = [];
      const run = (op) => { if (active) op(); else waiting.push(op); };
      const tx = { objectStore: (name) => store(name, run), oncomplete: null, onerror: null };
      const start = () => new Promise((done) => {
        active = true;
        waiting.splice(0).forEach((op) => op());
        setTimeout(() => {
          if (tx.oncomplete) tx.oncomplete();
          done();
        }, 20);
      });
      if (mode === 'readwrite') writing = writing.then(start);
      else start();
      return tx;
    }
  };
  return { stores, reads, open: () => request(database) };
}

// An in-memory Google Drive appDataFolder speaking the REST calls cloud-sync.js makes.
function makeDrive() {
  const files = new Map();
  let seq = 0;
  const log = [];
  const hooks = {};
  const response = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  });
  async function fetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const u = new URL(url);
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      log.push({ op: 'list' });
      const q = u.searchParams.get('q') || '';
      const byName = q.match(/name='([^']+)'/);
      const list = Array.from(files.values())
        .filter((f) => !byName || f.name === byName[1])
        .map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }));
      return response(200, { files: list });
    }
    const one = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (one && method === 'GET' && u.searchParams.get('alt') === 'media') {
      const f = files.get(one[1]);
      log.push({ op: 'download', name: f ? f.name : null });
      if (f && hooks.beforeDownload) await hooks.beforeDownload(f.name);
      return f ? response(200, f.content) : response(404, {});
    }
    if (one && method === 'DELETE') {
      const f = files.get(one[1]);
      log.push({ op: 'delete', name: f ? f.name : null });
      files.delete(one[1]);
      return response(204, {});
    }
    const upload = u.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (upload && method === 'PATCH') {
      const f = files.get(upload[1]);
      if (!f) return response(404, {});
      f.content = options.body;
      f.modifiedTime = new Date().toISOString();
      log.push({ op: 'update', name: f.name, bytes: options.body.length });
      return response(200, { id: f.id });
    }
    if (upload && method === 'POST') {
      const boundary = (options.headers['Content-Type'].match(/boundary=(.+)$/) || [])[1];
      const parts = options.body.split(`--${boundary}`);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1]);
      const content = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const id = `file-${++seq}`;
      files.set(id, { id, name: metadata.name, content, modifiedTime: new Date().toISOString() });
      log.push({ op: 'create', name: metadata.name, bytes: content.length });
      return response(200, { id });
    }
    return response(404, {});
  }
  return {
    fetch,
    log,
    hooks,
    files,
    names: () => Array.from(files.values()).map((f) => f.name).sort(),
    content: (name) => {
      const f = Array.from(files.values()).find((x) => x.name === name);
      return f ? JSON.parse(f.content) : null;
    },
    put: (name, payload) => {
      const id = `file-${++seq}`;
      files.set(id, { id, name, content: JSON.stringify(payload), modifiedTime: new Date().toISOString() });
      return id;
    }
  };
}

function makeDevice(drive, { db = makeDatabase() } = {}) {
  const ls = { quickconverter_db_initialized: 'true' };
  const localStorage = {
    get length() { return Object.keys(ls).length; },
    key: (i) => Object.keys(ls)[i],
    getItem: (k) => (k in ls ? ls[k] : null),
    setItem: (k, v) => { ls[k] = String(v); },
    removeItem: (k) => { delete ls[k]; }
  };
  const env = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    localStorage,
    IDBKeyRange: { only: (value) => ({ only: value }) },
    indexedDB: { open: db.open },
    fetch: (url, options) => drive.fetch(url, options),
    Capacitor: {
      PluginHeaders: [{ name: 'GoogleAuth', methods: [] }],
      nativePromise: async (plugin, method) => (method === 'getAccessToken' ? { accessToken: 'token' } : {})
    }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'platform.js'), env);
  vm.runInContext(read('src', 'services', 'storage.js'), env);
  vm.runInContext(read('src', 'services', 'cloud-sync.js'), env);
  return { S: env.StorageService, cloud: env.CloudSyncService, db, stores: db.stores, reads: db.reads, ls };
}

module.exports = { makeDrive, makeDevice, makeDatabase };
