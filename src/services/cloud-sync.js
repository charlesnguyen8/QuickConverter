(function (global) {
  const DRIVE_FILES_API = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
  const BACKUP_FILENAME = 'quickconverter-backup.json';
  const INDEX_FILENAME = 'quickconverter-index.json';
  const BOOK_PREFIX = 'quickconverter-book-';
  const SYNC_FORMAT = 'quickconverter-sync';
  const SYNC_VERSION = 3;
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

  // --- Library layout v3: small pieces per book plus an index -----------------------------
  //
  // quickconverter-index.json   books: { id: { title, lastRead, pieces: { key: { file, sig } } } },
  //                             deletion markers, settings
  // qc-book-<id>.json           the book record without its name lists and reading position
  // qc-names-<id>-<kind>.json   one name list (namelist, locked, soft)
  // qc-chapters-<id>-<n>.json   chapters n*50 .. n*50+49
  //
  // A sync transfers only the pieces whose fingerprint differs; the reading position travels in
  // the index.

  const CHAPTER_BATCH = 50;
  const LIST_KINDS = ['namelist', 'locked', 'soft'];

  function isPieceFile(name) {
    return /^qc-(book|names|chapters)-/.test(name);
  }

  function pieceFileName(bookId, key) {
    const id = encodeURIComponent(bookId);
    if (key === 'book') return `qc-book-${id}.json`;
    if (key.indexOf('names.') === 0) return `qc-names-${id}-${key.slice('names.'.length)}.json`;
    return `qc-chapters-${id}-${key.slice('chapters.'.length)}.json`;
  }

  function hashText(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function normalizeDeleted(deleted) {
    const d = deleted && typeof deleted === 'object' ? deleted : {};
    const names = {};
    Object.entries(d.names || {}).forEach(([novelId, kinds]) => {
      names[novelId] = {};
      Object.entries(kinds || {}).forEach(([kind, ids]) => { names[novelId][kind] = { ...(ids || {}) }; });
    });
    return { novels: { ...(d.novels || {}) }, chapters: { ...(d.chapters || {}) }, names };
  }

  function mergeDeleted(target, source) {
    const later = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
    ['novels', 'chapters'].forEach((kind) => {
      Object.entries(source[kind]).forEach(([id, time]) => { target[kind][id] = later(target[kind][id], time); });
    });
    Object.entries(source.names).forEach(([novelId, kinds]) => {
      const book = target.names[novelId] || (target.names[novelId] = {});
      Object.entries(kinds).forEach(([kind, ids]) => {
        const markers = book[kind] || (book[kind] = {});
        Object.entries(ids).forEach(([id, time]) => { markers[id] = later(markers[id], time); });
      });
    });
    return target;
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

  function batchOf(chapter) {
    const n = Number(chapter && chapter.chapterNumber);
    return Math.floor((Number.isFinite(n) && n > 0 ? n : 0) / CHAPTER_BATCH);
  }

  function chapterBatchSig(chapters) {
    return `${hashText(chapters.map((c) => `${c.id}:${c.updatedAt || 0}`).sort().join(','))}-${chapters.length}`;
  }

  // Splits a book into its pieces ({ key: { content, sig } }) and its reading position. The book
  // record and name lists are fingerprinted by content; chapters by their change times.
  function splitBook(novel, chapters) {
    const { nameList, glossaries, listsUpdatedAt, lastRead, ...record } = novel;
    const pieces = {};
    pieces.book = { content: { novel: record }, sig: hashText(stableJson(record)) };
    const times = listsUpdatedAt || {};
    LIST_KINDS.forEach((kind) => {
      const list = kind === 'namelist' ? nameList : (glossaries || {})[kind];
      const entries = Array.isArray(list) ? list : [];
      const time = Number(times[kind]) || 0;
      if (entries.length === 0 && !time) return;
      pieces[`names.${kind}`] = { content: { list: entries, updatedAt: time }, sig: hashText(`${time}|${stableJson(entries)}`) };
    });
    const batches = new Map();
    (chapters || []).forEach((chapter) => {
      const n = batchOf(chapter);
      if (!batches.has(n)) batches.set(n, []);
      batches.get(n).push(chapter);
    });
    batches.forEach((list, n) => {
      pieces[`chapters.${n}`] = { content: { chapters: list }, sig: chapterBatchSig(list) };
    });
    return { pieces, lastRead: lastRead || null };
  }

  // Rebuilds a book from piece contents (as split by splitBook) and its reading position.
  function assembleBook(contents, lastRead) {
    if (!contents.book || !contents.book.novel) return null;
    const listOf = (kind) => contents[`names.${kind}`] || { list: [], updatedAt: 0 };
    const novel = { ...contents.book.novel };
    novel.nameList = listOf('namelist').list || [];
    novel.glossaries = { locked: listOf('locked').list || [], soft: listOf('soft').list || [] };
    novel.listsUpdatedAt = { namelist: listOf('namelist').updatedAt || 0, locked: listOf('locked').updatedAt || 0, soft: listOf('soft').updatedAt || 0 };
    if (lastRead) novel.lastRead = lastRead;
    const chapters = [];
    Object.keys(contents).filter((k) => k.indexOf('chapters.') === 0).forEach((key) => {
      (contents[key].chapters || []).forEach((c) => chapters.push(c));
    });
    return { novel, chapters };
  }

  function piecePayload(content) {
    return { format: SYNC_FORMAT, version: SYNC_VERSION, ...content };
  }

  function indexPayload(books, deleted, preferences) {
    return { format: SYNC_FORMAT, version: SYNC_VERSION, updatedAt: new Date().toISOString(), books, deleted, preferences };
  }

  function fileIdByName(files) {
    return new Map(files.map((f) => [f.name, f.id]));
  }

  // Writes a whole book as pieces (reusing files of the same name) and returns its index entry.
  async function writeBookPieces(id, book, names) {
    const split = splitBook(book.novel, book.chapters);
    const pieces = {};
    for (const [key, piece] of Object.entries(split.pieces)) {
      const name = pieceFileName(id, key);
      const fileId = await writeFile(name, piecePayload(piece.content), names.get(name));
      pieces[key] = { file: fileId, sig: piece.sig };
    }
    return { title: book.novel.title || '', lastRead: split.lastRead, pieces };
  }

  async function writeAllBooks(library, files) {
    const names = fileIdByName(files);
    const books = {};
    for (const [id, book] of groupBooks(library)) {
      books[id] = await writeBookPieces(id, book, names);
    }
    return books;
  }

  async function downloadBookPieces(entry) {
    const contents = {};
    for (const [key, piece] of Object.entries((entry && entry.pieces) || {})) {
      contents[key] = await downloadJson(piece.file);
    }
    return assembleBook(contents, entry && entry.lastRead);
  }

  // The library stored in the previous layout (v2: one file per book).
  async function readV2Library(index) {
    const novels = [];
    const chapters = [];
    for (const entry of Object.values(index.books || {})) {
      if (!entry || !entry.file) continue;
      const book = await downloadJson(entry.file);
      if (book && book.novel) novels.push(book.novel);
      if (book && Array.isArray(book.chapters)) book.chapters.forEach((c) => chapters.push(c));
    }
    return { format: 'quickconverter-backup', version: 1, novels, chapters, preferences: index.preferences || {}, deleted: index.deleted || {} };
  }

  function checkVersion(index) {
    if (index && Number(index.version) > SYNC_VERSION) {
      throw new Error('Your Google Drive library was saved by a newer QuickConverter. Update QuickConverter to sync.');
    }
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
    const indexFile = files.find((f) => f.name === INDEX_FILENAME);
    if (indexFile) checkVersion(await downloadJson(indexFile.id));
    const books = await writeAllBooks(payload, files);
    const keep = new Set();
    Object.entries(books).forEach(([id, entry]) => Object.keys(entry.pieces).forEach((key) => keep.add(pieceFileName(id, key))));
    for (const file of files) {
      const stale = (isPieceFile(file.name) && !keep.has(file.name)) || file.name.indexOf(BOOK_PREFIX) === 0;
      if (stale) await deleteFile(file.id);
    }
    await writeFile(INDEX_FILENAME, indexPayload(books, normalizeDeleted(payload.deleted), payload.preferences || {}), indexFile && indexFile.id);

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
    checkVersion(index);
    let library;
    if (Number(index.version) < 3) {
      library = await readV2Library(index);
    } else {
      const novels = [];
      const chapters = [];
      for (const entry of Object.values(index.books || {})) {
        const book = await downloadBookPieces(entry);
        if (!book) continue;
        novels.push(book.novel);
        book.chapters.forEach((c) => chapters.push(c));
      }
      library = { format: 'quickconverter-backup', version: 1, novels, chapters, preferences: index.preferences || {} };
    }
    const result = await storage.importAll(library, { replace: true });
    if (typeof storage.applySync === 'function') {
      await storage.applySync({ novels: [], chapters: [], deleteNovels: [], deleteChapters: [], preferences: {} }, normalizeDeleted(index.deleted));
    }
    return Object.assign({ modifiedTime: indexFile.modifiedTime }, result);
  }

  function countReceived(received, apply) {
    received.novels += apply.novels.length;
    received.chapters += apply.chapters.length;
    received.deleted += apply.deleteNovels.length + apply.deleteChapters.length;
  }

  // A whole-library merge followed by writing every book as pieces: the first sync, or moving
  // from the old single backup file or the previous per-book layout.
  async function fullSync(storage, local, remote, files, indexFile, staleFiles) {
    const { library, apply } = storage.mergeLibraries(local, remote);
    await storage.applySync(apply, library.deleted);
    const books = await writeAllBooks(library, files);
    for (const file of staleFiles) await deleteFile(file.id);
    await writeFile(INDEX_FILENAME, indexPayload(books, normalizeDeleted(library.deleted), library.preferences || {}), indexFile && indexFile.id);
    const received = { novels: 0, chapters: 0, deleted: 0 };
    countReceived(received, apply);
    return { received, novels: Object.keys(books).length, chapters: (library.chapters || []).length };
  }

  // A book on this device as sync sees it: its pieces' fingerprints (book and name lists from the
  // record, chapter batches from the summary times, no chapter text) and its reading position.
  function localBookPieces(book) {
    const split = splitBook(book.novel, []);
    const batches = {};
    Object.entries(book.times || {}).forEach(([chapterId, value]) => {
      const [time, number] = Array.isArray(value) ? value : [0, 0];
      const key = `chapters.${batchOf({ chapterNumber: number })}`;
      (batches[key] || (batches[key] = [])).push({ id: chapterId, updatedAt: time });
    });
    const pieces = { ...split.pieces };
    Object.entries(batches).forEach(([key, list]) => {
      pieces[key] = { sig: chapterBatchSig(list), ids: list.map((c) => c.id) };
    });
    return { pieces, lastRead: split.lastRead };
  }

  const isBatchKey = (key) => key.indexOf('chapters.') === 0;

  // Syncs one book: compares fingerprints, downloads only the pieces that differ, loads this
  // device's chapters only for batches that differ, merges, writes the merged changes here and
  // uploads only the pieces the merge changed. Returns the new index entry (null when the book is
  // gone) and how many chapters it has.
  async function syncBook(storage, id, mine, entry, state, names) {
    const local = mine ? localBookPieces(mine) : null;
    const remotePieces = (entry && entry.pieces) || {};
    const keys = Array.from(new Set([...(local ? Object.keys(local.pieces) : []), ...Object.keys(remotePieces)]));
    const differing = keys.filter((key) => !local || !local.pieces[key] || !remotePieces[key] || local.pieces[key].sig !== remotePieces[key].sig);
    const sameRead = stableJson(local ? local.lastRead : null) === stableJson(entry ? entry.lastRead || null : null);
    if (local && entry && differing.length === 0 && sameRead) {
      return { entry, chapters: Object.keys(mine.times || {}).length };
    }

    const loadIds = [];
    if (local) differing.filter((key) => isBatchKey(key) && local.pieces[key]).forEach((key) => local.pieces[key].ids.forEach((cid) => loadIds.push(cid)));
    const localChapters = loadIds.length > 0 ? await mine.load(loadIds) : [];

    let theirs = null;
    if (entry) {
      const contents = {};
      for (const key of Object.keys(remotePieces)) {
        if (differing.includes(key)) contents[key] = await downloadJson(remotePieces[key].file);
        else if (!isBatchKey(key)) contents[key] = local.pieces[key].content;
      }
      theirs = assembleBook(contents, entry.lastRead || null);
    }

    const { library, apply } = storage.mergeLibraries(
      { novels: mine ? [mine.novel] : [], chapters: localChapters, preferences: {}, deleted: state.deleted },
      { novels: theirs ? [theirs.novel] : [], chapters: theirs ? theirs.chapters : [], preferences: {}, deleted: state.deleted }
    );
    await storage.applySync(apply, null);
    countReceived(state.received, apply);
    state.deleted = normalizeDeleted(library.deleted);

    const merged = library.novels[0];
    if (!merged) {
      const leftover = mine ? Object.keys(mine.times || {}).filter((cid) => apply.deleteChapters.indexOf(cid) === -1) : [];
      if (leftover.length > 0) {
        await storage.applySync({ novels: [], chapters: [], deleteNovels: [], deleteChapters: leftover, preferences: {} }, null);
        state.received.deleted += leftover.length;
      }
      for (const piece of Object.values(remotePieces)) await deleteFile(piece.file);
      return { entry: null, chapters: 0 };
    }

    const pieces = {};
    const upload = async (key, sig, content) => {
      const existing = remotePieces[key];
      if (existing && existing.sig === sig) {
        pieces[key] = existing;
        return;
      }
      const name = pieceFileName(id, key);
      const fileId = await writeFile(name, piecePayload(content), existing ? existing.file : names.get(name));
      pieces[key] = { file: fileId, sig };
    };

    const record = splitBook(merged, []);
    for (const [key, piece] of Object.entries(record.pieces)) await upload(key, piece.sig, piece.content);

    const mergedBatches = new Map();
    library.chapters.forEach((chapter) => {
      const key = `chapters.${batchOf(chapter)}`;
      if (!mergedBatches.has(key)) mergedBatches.set(key, []);
      mergedBatches.get(key).push(chapter);
    });
    let chapterCount = 0;
    for (const key of keys.filter(isBatchKey)) {
      if (!differing.includes(key)) {
        pieces[key] = remotePieces[key];
        chapterCount += local.pieces[key].ids.length;
        continue;
      }
      const list = mergedBatches.get(key);
      if (!list || list.length === 0) continue;
      chapterCount += list.length;
      await upload(key, chapterBatchSig(list), { chapters: list });
    }
    for (const [key, piece] of Object.entries(remotePieces)) {
      if (!pieces[key]) await deleteFile(piece.file);
    }
    return { entry: { title: merged.title || '', lastRead: record.lastRead, pieces }, chapters: chapterCount };
  }

  // This device's books for an incremental sync: from the summaries when the device keeps them,
  // otherwise from a full read.
  async function localSyncBooks(storage) {
    const snapshot = typeof storage.getSyncSnapshot === 'function' ? await storage.getSyncSnapshot() : null;
    if (snapshot) {
      const books = new Map();
      snapshot.novels.forEach((novel) => {
        books.set(novel.id, { novel, times: snapshot.chapterTimes[novel.id] || {}, load: (ids) => storage.getChaptersByIds(ids) });
      });
      return { books, preferences: snapshot.preferences || {}, deleted: snapshot.deleted };
    }
    const local = await storage.exportAll();
    const books = new Map();
    groupBooks(local).forEach((book, novelId) => {
      const byId = new Map(book.chapters.map((c) => [c.id, c]));
      const times = {};
      book.chapters.forEach((c) => { times[c.id] = [Number(c.updatedAt) || 0, Number(c.chapterNumber)]; });
      books.set(novelId, { novel: book.novel, times, load: async (ids) => ids.map((cid) => byId.get(cid)).filter(Boolean) });
    });
    return { books, preferences: local.preferences || {}, deleted: local.deleted };
  }

  // Two-way sync with the Drive copy: only pieces that differ are transferred, and on this device
  // only the chapters of batches that differ are read; nothing is replaced wholesale.
  async function sync() {
    const storage = getStorage();
    if (!storage || typeof storage.exportAll !== 'function' || typeof storage.mergeLibraries !== 'function') {
      throw new Error('StorageService not available');
    }
    const files = await listFiles();
    const indexFile = files.find((f) => f.name === INDEX_FILENAME);
    const index = indexFile ? await downloadJson(indexFile.id) : null;
    checkVersion(index);

    let outcome;
    if (!index) {
      const legacy = files.find((f) => f.name === BACKUP_FILENAME);
      const remote = legacy ? await downloadJson(legacy.id) : null;
      outcome = await fullSync(storage, await storage.exportAll(), remote, files, null, []);
    } else if (Number(index.version) < 3) {
      const remote = await readV2Library(index);
      const stale = files.filter((f) => f.name.indexOf(BOOK_PREFIX) === 0);
      outcome = await fullSync(storage, await storage.exportAll(), remote, files, indexFile, stale);
    } else {
      const names = fileIdByName(files);
      const remoteBooks = index.books || {};
      const local = await localSyncBooks(storage);
      const remoteDeleted = normalizeDeleted(index.deleted);
      const state = {
        deleted: mergeDeleted(normalizeDeleted(index.deleted), normalizeDeleted(local.deleted)),
        received: { novels: 0, chapters: 0, deleted: 0 }
      };
      const books = {};
      let chapterCount = 0;
      const ids = Array.from(new Set([...local.books.keys(), ...Object.keys(remoteBooks)]));
      for (const id of ids) {
        const result = await syncBook(storage, id, local.books.get(id), remoteBooks[id], state, names);
        chapterCount += result.chapters;
        if (result.entry) books[id] = result.entry;
      }

      const remotePrefs = index.preferences || {};
      const fill = {};
      Object.keys(remotePrefs).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(local.preferences, key)) fill[key] = remotePrefs[key];
      });
      await storage.applySync({ novels: [], chapters: [], deleteNovels: [], deleteChapters: [], preferences: fill }, state.deleted);
      const preferences = { ...local.preferences, ...remotePrefs };

      const before = stableJson({ books: remoteBooks, deleted: remoteDeleted, preferences: remotePrefs });
      const after = stableJson({ books, deleted: state.deleted, preferences });
      if (before !== after) await updateFile(indexFile.id, indexPayload(books, state.deleted, preferences));
      outcome = { received: state.received, novels: Object.keys(books).length, chapters: chapterCount };
    }

    const syncedAt = new Date().toISOString();
    storage.setPreference(LAST_SYNC_KEY, syncedAt);
    return { ...outcome, syncedAt };
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

  const CloudSyncService = { connect, signOut, backup, restore, sync, getStatus };

  if (typeof window !== 'undefined') window.CloudSyncService = CloudSyncService;
  if (typeof self !== 'undefined') self.CloudSyncService = CloudSyncService;
  if (typeof globalThis !== 'undefined') globalThis.CloudSyncService = CloudSyncService;
  if (typeof module !== 'undefined' && module.exports) module.exports = CloudSyncService;
})(typeof globalThis !== 'undefined' ? globalThis : this);
