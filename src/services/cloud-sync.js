(function (global) {
  const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  const BACKUP_FILENAME = 'quickconverter-backup.json';
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const LAST_BACKUP_KEY = 'quickconverter_last_backup_at';

  function getStorage() {
    if (typeof window !== 'undefined' && window.StorageService) return window.StorageService;
    return global.StorageService || null;
  }

  function getIdentity() {
    return (typeof chrome !== 'undefined' && chrome.identity) ? chrome.identity : null;
  }

  function getLastError() {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
      ? chrome.runtime.lastError
      : null;
  }

  function getToken(interactive) {
    const identity = getIdentity();
    if (!identity || typeof identity.getAuthToken !== 'function') {
      return Promise.reject(new Error('Google sign-in is only available in the Chrome extension'));
    }
    return new Promise((resolve, reject) => {
      identity.getAuthToken({ interactive: !!interactive, scopes: [SCOPE] }, (token) => {
        const lastError = getLastError();
        if (lastError) {
          reject(new Error(lastError.message || 'Google sign-in failed'));
          return;
        }
        if (!token) {
          reject(new Error('No Google auth token returned'));
          return;
        }
        resolve(token);
      });
    });
  }

  function removeCachedToken(token) {
    const identity = getIdentity();
    if (!identity || typeof identity.removeCachedAuthToken !== 'function') return Promise.resolve();
    return new Promise((resolve) => identity.removeCachedAuthToken({ token }, () => resolve()));
  }

  async function authFetch(url, options = {}, retried) {
    const token = await getToken(false);
    const headers = Object.assign({}, options.headers || {}, { Authorization: `Bearer ${token}` });
    const response = await fetch(url, Object.assign({}, options, { headers }));
    if (response.status === 401 && !retried) {
      await removeCachedToken(token);
      return authFetch(url, options, true);
    }
    return response;
  }

  async function findBackupFile() {
    const query = encodeURIComponent(`name='${BACKUP_FILENAME}'`);
    const url = `${DRIVE_FILES_API}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime)`;
    const response = await authFetch(url);
    if (!response.ok) throw new Error(`Google Drive list failed (${response.status})`);
    const data = await response.json();
    return (data.files && data.files[0]) || null;
  }

  async function connect() {
    const token = await getToken(true);
    return { connected: !!token };
  }

  async function signOut() {
    const identity = getIdentity();
    if (identity && typeof identity.clearAllCachedAuthTokens === 'function') {
      await new Promise((resolve) => identity.clearAllCachedAuthTokens(() => resolve()));
    }
    return { connected: false };
  }

  async function backup() {
    const storage = getStorage();
    if (!storage || typeof storage.exportAll !== 'function') throw new Error('StorageService not available');

    const payload = await storage.exportAll();
    const body = JSON.stringify(payload);
    const existing = await findBackupFile();

    let response;
    if (existing) {
      response = await authFetch(`${DRIVE_UPLOAD_API}/${existing.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body
      });
    } else {
      const boundary = `qc${Date.now()}`;
      const metadata = { name: BACKUP_FILENAME, parents: ['appDataFolder'] };
      const multipart = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        body,
        `--${boundary}--`
      ].join('\r\n');
      response = await authFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: multipart
      });
    }

    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status})`);

    const uploadedAt = new Date().toISOString();
    storage.setPreference(LAST_BACKUP_KEY, uploadedAt);
    return {
      exportedAt: payload.exportedAt,
      uploadedAt,
      novels: (payload.novels || []).length,
      chapters: (payload.chapters || []).length
    };
  }

  async function restore() {
    const storage = getStorage();
    if (!storage || typeof storage.importAll !== 'function') throw new Error('StorageService not available');

    const existing = await findBackupFile();
    if (!existing) throw new Error('No backup found in Google Drive');

    const response = await authFetch(`${DRIVE_FILES_API}/${existing.id}?alt=media`);
    if (!response.ok) throw new Error(`Google Drive download failed (${response.status})`);
    const data = await response.json();

    const result = await storage.importAll(data, { replace: true });
    return Object.assign({ modifiedTime: existing.modifiedTime }, result);
  }

  async function getStatus() {
    const storage = getStorage();
    const lastBackupAt = (storage && typeof storage.getPreference === 'function')
      ? storage.getPreference(LAST_BACKUP_KEY, null)
      : null;
    let connected = false;
    try {
      await getToken(false);
      connected = true;
    } catch (e) {
      connected = false;
    }
    return { connected, lastBackupAt };
  }

  const CloudSyncService = { connect, signOut, backup, restore, getStatus };

  if (typeof window !== 'undefined') window.CloudSyncService = CloudSyncService;
  if (typeof self !== 'undefined') self.CloudSyncService = CloudSyncService;
  if (typeof globalThis !== 'undefined') globalThis.CloudSyncService = CloudSyncService;
  if (typeof module !== 'undefined' && module.exports) module.exports = CloudSyncService;
})(typeof globalThis !== 'undefined' ? globalThis : this);
