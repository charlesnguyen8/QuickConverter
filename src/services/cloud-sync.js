(function (global) {
  const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  const BACKUP_FILENAME = 'quickconverter-backup.json';
  const INDEX_FILENAME = 'quickconverter-index.json';
  const BOOK_PREFIX = 'quickconverter-book-';
  const SYNC_FORMAT = 'quickconverter-sync';
  const SYNC_VERSION = 2;
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const LAST_BACKUP_KEY = 'quickconverter_last_backup_at';
  const LAST_SYNC_KEY = 'quickconverter_last_sync_at';

  function getStorage() {
    if (typeof window !== 'undefined' && window.StorageService) return window.StorageService;
    return global.StorageService || null;
  }

  function resolvePlatform() {
    if (typeof global !== 'undefined' && global.Platform) return global.Platform;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./platform.js'); } catch (e) {}
    }
    return null;
  }

  function getIdentity() {
    const platform = resolvePlatform();
    return platform ? platform.identity : null;
  }

  function getToken(interactive) {
    const identity = getIdentity();
    if (!identity) {
      return Promise.reject(new Error('Google sign-in is only available in the Chrome extension'));
    }
    return identity.getAuthToken({ interactive: !!interactive, scopes: [SCOPE] });
  }

  function removeCachedToken(token) {
    const identity = getIdentity();
    return identity ? identity.removeCachedAuthToken(token) : Promise.resolve();
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

  // --- Drive files (the app's private appDataFolder) -----------------------------------

  async function listFiles() {
    const base = `${DRIVE_FILES_API}?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime)`;
    let files = [];
    let pageToken = null;
    do {
      const response = await authFetch(pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base);
      if (!response.ok) throw new Error(`Google Drive list failed (${response.status})`);
      const data = await response.json();
      files = files.concat(data.files || []);
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    return files;
  }

  async function downloadJson(fileId) {
    const response = await authFetch(`${DRIVE_FILES_API}/${fileId}?alt=media`);
    if (!response.ok) throw new Error(`Google Drive download failed (${response.status})`);
    return response.json();
  }

  async function createFile(name, payload) {
    const boundary = `qc${Date.now()}${Math.random().toString(16).slice(2)}`;
    const metadata = { name, parents: ['appDataFolder'] };
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      JSON.stringify(payload),
      `--${boundary}--`
    ].join('\r\n');
    const response = await authFetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart
    });
    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status})`);
    const data = await response.json().catch(() => ({}));
    return data && data.id ? data.id : null;
  }

  async function updateFile(fileId, payload) {
    const response = await authFetch(`${DRIVE_UPLOAD_API}/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Google Drive upload failed (${response.status})`);
    return fileId;
  }

  async function deleteFile(fileId) {
    const response = await authFetch(`${DRIVE_FILES_API}/${fileId}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) throw new Error(`Google Drive delete failed (${response.status})`);
  }

  async function writeFile(name, payload, fileId) {
    if (fileId) return updateFile(fileId, payload);
    return createFile(name, payload);
  }

  // --- Library layout: one file per book plus an index -----------------------------------

  function bookFileName(id) {
    return `${BOOK_PREFIX}${encodeURIComponent(id)}.json`;
  }

  function hashText(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  // A fingerprint of a book from its change times: equal fingerprints mean nothing to transfer.
  function bookSignature(novel, chapters) {
    const lists = (novel && novel.listsUpdatedAt) || {};
    const read = novel && novel.lastRead ? novel.lastRead.updatedAt || 0 : 0;
    const chapterTimes = (chapters || []).map((c) => `${c.id}:${c.updatedAt || 0}`).sort().join(',');
    const text = [novel.id, novel.updatedAt || 0, read, lists.namelist || 0, lists.locked || 0, lists.soft || 0, chapterTimes].join('|');
    return `${hashText(text)}-${(chapters || []).length}`;
  }

  function groupBooks(library) {
    const books = new Map();
    (library.novels || []).forEach((novel) => {
      if (novel && novel.id) books.set(novel.id, { novel, chapters: [] });
    });
    (library.chapters || []).forEach((chapter) => {
      const book = chapter && books.get(chapter.novelId);
      if (book) book.chapters.push(chapter);
    });
    return books;
  }

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function bookPayload(novel, chapters) {
    return { format: SYNC_FORMAT, version: SYNC_VERSION, novel, chapters };
  }

  function indexPayload(books, deleted, preferences) {
    return { format: SYNC_FORMAT, version: SYNC_VERSION, updatedAt: new Date().toISOString(), books, deleted, preferences };
  }

  function fileIdByName(files) {
    return new Map(files.map((f) => [f.name, f.id]));
  }

  // Writes every book of a library as its own file and returns the index entries.
  async function writeAllBooks(library, files) {
    const ids = fileIdByName(files);
    const books = {};
    for (const [id, book] of groupBooks(library)) {
      const name = bookFileName(id);
      const fileId = await writeFile(name, bookPayload(book.novel, book.chapters), ids.get(name));
      books[id] = { file: fileId, sig: bookSignature(book.novel, book.chapters), title: book.novel.title || '' };
    }
    return books;
  }

  // --- Public API -------------------------------------------------------------------------

  async function connect() {
    const token = await getToken(true);
    return { connected: !!token };
  }

  async function signOut() {
    const identity = getIdentity();
    if (identity) await identity.clearAllCachedAuthTokens();
    return { connected: false };
  }

  // Replaces the Drive copy with this device's library.
  async function backup() {
    const storage = getStorage();
    if (!storage || typeof storage.exportAll !== 'function') throw new Error('StorageService not available');

    const payload = await storage.exportAll();
    const files = await listFiles();
    const books = await writeAllBooks(payload, files);
    const keep = new Set(Object.keys(books).map(bookFileName));
    for (const file of files) {
      if (file.name.indexOf(BOOK_PREFIX) === 0 && !keep.has(file.name)) await deleteFile(file.id);
    }
    const index = files.find((f) => f.name === INDEX_FILENAME);
    await writeFile(INDEX_FILENAME, indexPayload(books, payload.deleted || { novels: {}, chapters: {} }, payload.preferences || {}), index && index.id);

    const uploadedAt = new Date().toISOString();
    storage.setPreference(LAST_BACKUP_KEY, uploadedAt);
    return {
      exportedAt: payload.exportedAt,
      uploadedAt,
      novels: (payload.novels || []).length,
      chapters: (payload.chapters || []).length
    };
  }

  // Replaces this device's library with the Drive copy.
  async function restore() {
    const storage = getStorage();
    if (!storage || typeof storage.importAll !== 'function') throw new Error('StorageService not available');

    const files = await listFiles();
    const indexFile = files.find((f) => f.name === INDEX_FILENAME);
    if (!indexFile) {
      const legacy = files.find((f) => f.name === BACKUP_FILENAME);
      if (!legacy) throw new Error('No backup found in Google Drive');
      const data = await downloadJson(legacy.id);
      const result = await storage.importAll(data, { replace: true });
      return Object.assign({ modifiedTime: legacy.modifiedTime }, result);
    }
    const index = await downloadJson(indexFile.id);
    const novels = [];
    const chapters = [];
    for (const entry of Object.values(index.books || {})) {
      const book = await downloadJson(entry.file);
      if (book && book.novel) novels.push(book.novel);
      if (book && Array.isArray(book.chapters)) book.chapters.forEach((c) => chapters.push(c));
    }
    const result = await storage.importAll({ format: 'quickconverter-backup', version: 1, novels, chapters, preferences: index.preferences || {} }, { replace: true });
    if (typeof storage.applySync === 'function') {
      await storage.applySync({ novels: [], chapters: [], deleteNovels: [], deleteChapters: [], preferences: {} }, index.deleted || { novels: {}, chapters: {} });
    }
    return Object.assign({ modifiedTime: indexFile.modifiedTime }, result);
  }

  // First sync with per-book files: merge with the old single backup file if there is one, then
  // write every book and the index.
  async function firstSync(storage, local, files) {
    const legacy = files.find((f) => f.name === BACKUP_FILENAME);
    const remote = legacy ? await downloadJson(legacy.id) : null;
    const { library, apply } = storage.mergeLibraries(local, remote);
    await storage.applySync(apply, library.deleted);
    const books = await writeAllBooks(library, files);
    await createFile(INDEX_FILENAME, indexPayload(books, library.deleted, library.preferences));
    return { library, books, received: { novels: apply.novels.length, chapters: apply.chapters.length, deleted: apply.deleteNovels.length + apply.deleteChapters.length } };
  }

  // Two-way sync: books whose fingerprint differs on either side are downloaded, merged (newer
  // item wins, deletions carried over) and uploaded if the merge changed them; unchanged books are
  // not transferred. Deletion markers and settings live in the index.
  async function sync() {
    const storage = getStorage();
    if (!storage || typeof storage.exportAll !== 'function' || typeof storage.mergeLibraries !== 'function') {
      throw new Error('StorageService not available');
    }
    const local = await storage.exportAll();
    const files = await listFiles();
    const indexFile = files.find((f) => f.name === INDEX_FILENAME);

    let received;
    let bookCount;
    let chapterCount = 0;
    if (!indexFile) {
      const first = await firstSync(storage, local, files);
      received = first.received;
      bookCount = Object.keys(first.books).length;
      chapterCount = (first.library.chapters || []).length;
    } else {
      const index = await downloadJson(indexFile.id);
      const names = fileIdByName(files);
      const remoteBooks = index.books || {};
      const localBooks = groupBooks(local);
      let deleted = {
        novels: { ...((index.deleted || {}).novels || {}) },
        chapters: { ...((index.deleted || {}).chapters || {}) }
      };
      ['novels', 'chapters'].forEach((kind) => {
        Object.entries((local.deleted || {})[kind] || {}).forEach(([id, time]) => {
          deleted[kind][id] = Math.max(Number(deleted[kind][id]) || 0, Number(time) || 0);
        });
      });
      received = { novels: 0, chapters: 0, deleted: 0 };
      const books = {};
      const ids = Array.from(new Set([...localBooks.keys(), ...Object.keys(remoteBooks)]));
      for (const id of ids) {
        const mine = localBooks.get(id);
        const entry = remoteBooks[id];
        if (mine && entry && entry.sig === bookSignature(mine.novel, mine.chapters)) {
          books[id] = entry;
          chapterCount += mine.chapters.length;
          continue;
        }
        const theirs = entry ? await downloadJson(entry.file) : null;
        const { library, apply } = storage.mergeLibraries(
          { novels: mine ? [mine.novel] : [], chapters: mine ? mine.chapters : [], preferences: {}, deleted },
          { novels: theirs && theirs.novel ? [theirs.novel] : [], chapters: theirs && Array.isArray(theirs.chapters) ? theirs.chapters : [], preferences: {}, deleted }
        );
        await storage.applySync(apply, null);
        received.novels += apply.novels.length;
        received.chapters += apply.chapters.length;
        received.deleted += apply.deleteNovels.length + apply.deleteChapters.length;
        deleted = library.deleted;
        const merged = library.novels[0];
        if (!merged) {
          if (entry) await deleteFile(entry.file);
          continue;
        }
        chapterCount += library.chapters.length;
        const sig = bookSignature(merged, library.chapters);
        if (entry && entry.sig === sig) {
          books[id] = entry;
          continue;
        }
        const name = bookFileName(id);
        const fileId = await writeFile(name, bookPayload(merged, library.chapters), entry ? entry.file : names.get(name));
        books[id] = { file: fileId, sig, title: merged.title || '' };
      }

      const remotePrefs = index.preferences || {};
      const fill = {};
      Object.keys(remotePrefs).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(local.preferences || {}, key)) fill[key] = remotePrefs[key];
      });
      await storage.applySync({ novels: [], chapters: [], deleteNovels: [], deleteChapters: [], preferences: fill }, deleted);
      const preferences = { ...(local.preferences || {}), ...remotePrefs };

      const before = stableJson({ books: remoteBooks, deleted: index.deleted || { novels: {}, chapters: {} }, preferences: remotePrefs });
      const after = stableJson({ books, deleted, preferences });
      if (before !== after) await updateFile(indexFile.id, indexPayload(books, deleted, preferences));
      bookCount = Object.keys(books).length;
    }

    const syncedAt = new Date().toISOString();
    storage.setPreference(LAST_SYNC_KEY, syncedAt);
    return { received, novels: bookCount, chapters: chapterCount, syncedAt };
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
    const lastSyncAt = (storage && typeof storage.getPreference === 'function')
      ? storage.getPreference(LAST_SYNC_KEY, null)
      : null;
    return { connected, lastBackupAt, lastSyncAt };
  }

  const CloudSyncService = { connect, signOut, backup, restore, sync, getStatus, bookSignature };

  if (typeof window !== 'undefined') window.CloudSyncService = CloudSyncService;
  if (typeof self !== 'undefined') self.CloudSyncService = CloudSyncService;
  if (typeof globalThis !== 'undefined') globalThis.CloudSyncService = CloudSyncService;
  if (typeof module !== 'undefined' && module.exports) module.exports = CloudSyncService;
})(typeof globalThis !== 'undefined' ? globalThis : this);
