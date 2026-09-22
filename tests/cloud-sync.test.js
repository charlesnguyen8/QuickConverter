const assert = require('assert');
const path = require('path');

console.log('--- Running Google Drive Cloud Sync Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');

const backupPayload = {
  format: 'quickconverter-backup',
  version: 1,
  exportedAt: '2026-09-21T00:00:00.000Z',
  novels: [{ id: 'novel-1', title: 'Test' }],
  chapters: [{ id: 'novel-1_ch1' }],
  preferences: { quickconverter_deepseek_model: 'deepseek-chat' }
};

let exportedAll = 0;
let imported = null;
const prefs = {};

global.StorageService = {
  async exportAll() { exportedAll++; return backupPayload; },
  async importAll(data, options) { imported = { data, options }; return { novels: 1, chapters: 1 }; },
  getPreference(key, fallback) { return key in prefs ? prefs[key] : fallback; },
  setPreference(key, val) { prefs[key] = String(val); }
};

let tokenCalls = [];
let removedTokens = [];
let clearedAuth = false;
global.chrome = {
  runtime: { lastError: null },
  identity: {
    getAuthToken(opts, cb) { tokenCalls.push(opts); cb('token-123'); },
    removeCachedAuthToken(details, cb) { removedTokens.push(details.token); cb(); },
    clearAllCachedAuthTokens(cb) { clearedAuth = true; if (cb) cb(); }
  }
};

let listFiles = [];
let fetchCalls = [];
let fetchHandler = null;

function makeResponse(status, data) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

global.fetch = async (url, options = {}) => {
  fetchCalls.push({ url, method: options.method || 'GET' });
  if (fetchHandler) return fetchHandler(url, options);
  if (url.includes('/upload/')) return makeResponse(200, { id: 'file-1' });
  if (url.includes('alt=media')) return makeResponse(200, backupPayload);
  if (url.includes('/drive/v3/files?')) return makeResponse(200, { files: listFiles });
  return makeResponse(404, {});
};

const CloudSyncService = require(path.join(repoRoot, 'services', 'cloud-sync.js'));

(async () => {
  const connectResult = await CloudSyncService.connect();
  assert.strictEqual(connectResult.connected, true);
  assert.strictEqual(tokenCalls[0].interactive, true, 'connect() must prompt interactively');
  console.log('✓ connect: requests an interactive Google token');

  listFiles = [];
  fetchCalls = [];
  const createResult = await CloudSyncService.backup();
  const createCall = fetchCalls.find((c) => c.url.includes('uploadType=multipart'));
  assert(createCall, 'backup() must create via multipart upload when no file exists');
  assert.strictEqual(createCall.method, 'POST');
  assert.strictEqual(createResult.novels, 1);
  assert.strictEqual(createResult.chapters, 1);
  assert(prefs.quickconverter_last_backup_at, 'backup() must record lastBackupAt');
  console.log('✓ backup: creates the app-data file when none exists');

  listFiles = [{ id: 'file-42', name: 'quickconverter-backup.json', modifiedTime: '2026-09-20T00:00:00Z' }];
  fetchCalls = [];
  await CloudSyncService.backup();
  const patchCall = fetchCalls.find((c) => c.method === 'PATCH');
  assert(patchCall, 'backup() must update the existing file');
  assert(patchCall.url.includes('/file-42'), 'PATCH must target the existing file id');
  console.log('✓ backup: updates the existing file when present');

  fetchCalls = [];
  const restoreResult = await CloudSyncService.restore();
  const downloadCall = fetchCalls.find((c) => c.url.includes('alt=media'));
  assert(downloadCall, 'restore() must download the file content');
  assert(imported, 'restore() must call StorageService.importAll');
  assert.strictEqual(imported.options.replace, true, 'restore() must replace local data');
  assert.strictEqual(restoreResult.modifiedTime, '2026-09-20T00:00:00Z');
  console.log('✓ restore: downloads and imports with replace=true');

  listFiles = [{ id: 'file-42' }];
  let first = true;
  removedTokens = [];
  fetchHandler = (url, options) => {
    if (url.includes('/drive/v3/files?')) {
      if (first) { first = false; return makeResponse(401, {}); }
      return makeResponse(200, { files: listFiles });
    }
    if (url.includes('alt=media')) return makeResponse(200, backupPayload);
    if (url.includes('/upload/')) return makeResponse(200, {});
    return makeResponse(404, {});
  };
  await CloudSyncService.restore();
  assert.strictEqual(removedTokens.length, 1, 'a 401 must drop the cached token and retry once');
  fetchHandler = null;
  console.log('✓ authFetch: refreshes the cached token once on 401');

  const status = await CloudSyncService.getStatus();
  assert.strictEqual(status.connected, true);
  assert.strictEqual(status.lastBackupAt, prefs.quickconverter_last_backup_at);
  console.log('✓ getStatus: reports connection and last backup time');

  const out = await CloudSyncService.signOut();
  assert.strictEqual(clearedAuth, true, 'signOut() must clear cached auth tokens');
  assert.strictEqual(out.connected, false);
  console.log('✓ signOut: clears cached Google auth tokens');

  console.log('🎉 Google Drive Cloud Sync Test Suite: ALL TESTS PASSED!');
})().catch((err) => {
  console.error('✗ Cloud sync test failed:', err.message);
  process.exit(1);
});
