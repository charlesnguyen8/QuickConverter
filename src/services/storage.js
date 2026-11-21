// High-Volume IndexedDB Storage Service for QuickConverter
// Capable of storing full novel chapter texts and translation data without quota limits

const DB_NAME = 'QuickConverterDB';
const DB_VERSION = 3;
const SYNC_STATE_STORE = 'syncState';
const COMMON_STORE = 'commonLists';

const BACKUP_FORMAT = 'quickconverter-backup';
const BACKUP_VERSION = 1;
const NAME_LIST_PREFIX = 'namelist::';
const BACKUP_EXCLUDED_KEYS = [
  'quickconverter_deepseek_key',
  'quickconverter_deepseek_key_storage',
  'quickconverter_custom_api_key',
  'quickconverter_sync_deleted',
  'quickconverter_sync_dirty_at',
  'quickconverter_sync_lock',
  'quickconverter_last_sync_at'
];
const SYNC_DELETED_KEY = 'quickconverter_sync_deleted';
const SYNC_DIRTY_KEY = 'quickconverter_sync_dirty_at';
const libraryChangeListeners = new Set();
const LIST_KINDS = ['namelist', 'locked', 'soft'];

const INITIAL_NOVELS = [
  {
    id: "novel-1",
    title: "A Regressor’s Tale of Cultivation",
    slug: "a-regressors-tale-of-cultivation",
    url: "https://wetriedtls.com/series/a-regressors-tale-of-cultivation",
    domain: "wetriedtls.com",
    thumbnail: "https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp",
    totalChapters: 880,
    icon: "📖",
    status: "Active",
    createdAt: 1726700000000
  },
  {
    id: "novel-2",
    title: "Surviving as an Academy Necromancer",
    slug: "surviving-as-an-academy-necromancer",
    url: "https://wetriedtls.com/series/surviving-as-an-academy-necromancer",
    domain: "wetriedtls.com",
    thumbnail: "https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp",
    totalChapters: 240,
    icon: "⚔️",
    status: "Active",
    createdAt: 1726700001000
  },
  {
    id: "novel-3",
    title: "Academy’s Genius Swordmaster",
    slug: "academys-genius-swordmaster",
    url: "https://wetriedtls.com/series/academys-genius-swordmaster",
    domain: "wetriedtls.com",
    thumbnail: "https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp",
    totalChapters: 310,
    icon: "📜",
    status: "Active",
    createdAt: 1726700002000
  }
];

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store 1: Managed Novels metadata
      if (!db.objectStoreNames.contains('novels')) {
        const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
        novelStore.createIndex('slug', 'slug', { unique: false });
        novelStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Store 2: Full Novel Chapter Texts (high-volume store)
      if (!db.objectStoreNames.contains('chapters')) {
        const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
        chapterStore.createIndex('novelId', 'novelId', { unique: false });
        chapterStore.createIndex('chapterNumber', 'chapterNumber', { unique: false });
      }

      // Store 3: per-book chapter summaries (id -> [updatedAt, chapterNumber]) for sync
      if (!db.objectStoreNames.contains(SYNC_STATE_STORE)) {
        db.createObjectStore(SYNC_STATE_STORE, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(COMMON_STORE)) {
        db.createObjectStore(COMMON_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (db && 'onversionchange' in db) {
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
      }
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function chapterNovelId(chapterId) {
  const id = String(chapterId || '');
  const at = id.lastIndexOf('_ch');
  return at > 0 ? id.slice(0, at) : null;
}

function hasStore(db, name) {
  return !!(db && db.objectStoreNames && typeof db.objectStoreNames.contains === 'function' && db.objectStoreNames.contains(name));
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Parses `name=translation` pairs split on pipes or newlines (the shared body of the
// NAME_LIST / LOCKED_GLOSSARY / SOFT_GLOSSARY / TRANSLATION annotation blocks).
function parseNameTranslationPairs(content) {
  const entries = [];
  String(content || '').split(/[|\r\n]+/).forEach((segment) => {
    const piece = segment.trim();
    if (!piece) return;
    const eq = piece.indexOf('=');
    if (eq <= 0) return;
    const original = piece.slice(0, eq).trim();
    const translation = piece.slice(eq + 1).trim();
    if (original && translation) entries.push({ original, translation });
  });
  return entries;
}

// Extracts and strips an optional `<<<TAG_START>>> ... <<<TAG_END>>>` block that some
// translation models append, returning the cleaned text plus the parsed `source=translated`
// entries (split on newlines or pipes).
function extractGlossaryBlock(text, tag) {
  const source = typeof text === 'string' ? text : '';
  const marker = new RegExp(`<<<\\s*${tag}_START\\s*>>>([\\s\\S]*?)<<<\\s*${tag}_END\\s*>>>`, 'i');
  const match = source.match(marker);
  if (!match) return { text: source, entries: [] };

  const cleaned = (source.slice(0, match.index) + source.slice(match.index + match[0].length))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: cleaned, entries: parseNameTranslationPairs(match[1]) };
}

// Parses a user-pasted `<<<TRANSLATION_START>>>name=translation|...<<<TRANSLATION_END>>>`
// result. Falls back to treating the whole text as the block body when the markers are absent.
function parseTranslationBlock(text) {
  const source = typeof text === 'string' ? text : '';
  const match = source.match(/<<<\s*TRANSLATION_START\s*>>>([\s\S]*?)<<<\s*TRANSLATION_END\s*>>>/i);
  return parseNameTranslationPairs(match ? match[1] : source);
}

// Extracts the optional `<<<NAME_LIST_START>>> ... <<<NAME_LIST_END>>>` block.
// Returns the chapter text without the block plus the parsed entries.
function parseNameListBlock(text) {
  const { text: cleaned, entries } = extractGlossaryBlock(text, 'NAME_LIST');
  return { text: cleaned, names: entries };
}

// Extracts and strips the optional `<<<DELAY>>>115s<<<DELAY>>>` block some models append,
// returning the cleaned text plus the delay in whole seconds (0 when absent).
function extractDelayBlock(text) {
  const source = typeof text === 'string' ? text : '';
  const match = source.match(/<<<\s*DELAY\s*>>>\s*(\d+)s\s*<<<\s*DELAY\s*>>>/i);
  if (!match) return { text: source, delaySeconds: 0 };
  const cleaned = (source.slice(0, match.index) + source.slice(match.index + match[0].length))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text: cleaned, delaySeconds: parseInt(match[1], 10) };
}

// Extracts and strips the NAME_LIST, LOCKED_GLOSSARY, SOFT_GLOSSARY and DELAY blocks in
// one pass so the saved chapter text never leaks annotation markers. `delaySeconds` is
// how long the queue should wait before the next chapter (0 = never requested).
function parseGlossaryBlocks(text) {
  const names = extractGlossaryBlock(text, 'NAME_LIST');
  const locked = extractGlossaryBlock(names.text, 'LOCKED_GLOSSARY');
  const soft = extractGlossaryBlock(locked.text, 'SOFT_GLOSSARY');
  const delay = extractDelayBlock(soft.text);
  return { text: delay.text, names: names.entries, locked: locked.entries, soft: soft.entries, delaySeconds: delay.delaySeconds };
}

function textProcessors() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
  if (scope && scope.TextProcessors) return scope.TextProcessors;
  throw new Error('TextProcessors module is not loaded.');
}

// A name list / locked / soft glossary is stored in the `novels` object store under
// `<kind>::<novelId>` with an `owner` and `list`, so it must never be treated as a novel.
const RECYCLE_BIN_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function isListRecord(record) {
  return !!record && typeof record.id === 'string' && record.id.indexOf('::') !== -1 && !!record.owner && Array.isArray(record.list);
}

// A backup/sync book carries its name list and glossaries inline; on the device they are their own
// records, each with the time it last changed.
function splitNovelLists(novel) {
  const { nameList, glossaries, listsUpdatedAt, ...record } = novel;
  const times = listsUpdatedAt && typeof listsUpdatedAt === 'object' ? listsUpdatedAt : {};
  const lists = [];
  const add = (kind, list) => {
    lists.push({ id: `${kind}::${novel.id}`, owner: novel.id, kind, list: Array.isArray(list) ? list : [], updatedAt: Number(times[kind]) || 0 });
  };
  if (Object.prototype.hasOwnProperty.call(novel, 'nameList')) add('namelist', nameList);
  if (glossaries && typeof glossaries === 'object') {
    ['locked', 'soft'].forEach((kind) => {
      if (Object.prototype.hasOwnProperty.call(glossaries, kind)) add(kind, glossaries[kind]);
    });
  }
  return { record, lists };
}

function syncTime(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function syncLibraryParts(data) {
  const deleted = data && data.deleted && typeof data.deleted === 'object' ? data.deleted : {};
  return {
    novels: data && Array.isArray(data.novels) ? data.novels.filter((n) => n && n.id) : [],
    chapters: data && Array.isArray(data.chapters) ? data.chapters.filter((c) => c && c.id) : [],
    preferences: data && data.preferences && typeof data.preferences === 'object' ? data.preferences : {},
    commonLists: data && Array.isArray(data.commonLists) ? data.commonLists.filter((l) => l && l.id) : [],
    deleted: { novels: { ...(deleted.novels || {}) }, chapters: { ...(deleted.chapters || {}) }, names: copyNameMarkers(deleted.names), common: copyCommonMarkers(deleted.common) }
  };
}

function copyCommonMarkers(common) {
  const source = common && typeof common === 'object' ? common : {};
  const entries = {};
  Object.entries(source.entries && typeof source.entries === 'object' ? source.entries : {}).forEach(([listId, ids]) => {
    entries[listId] = { ...(ids || {}) };
  });
  return { lists: { ...(source.lists || {}) }, entries };
}

function mergeCommonMarkers(target, source) {
  const from = copyCommonMarkers(source);
  Object.entries(from.lists).forEach(([id, time]) => {
    target.lists[id] = Math.max(syncTime(target.lists[id]), syncTime(time));
  });
  Object.entries(from.entries).forEach(([listId, ids]) => {
    const markers = target.entries[listId] || (target.entries[listId] = {});
    Object.entries(ids).forEach(([id, time]) => {
      markers[id] = Math.max(syncTime(markers[id]), syncTime(time));
    });
  });
  return target;
}

function commonKind(kind) {
  return LIST_KINDS.indexOf(kind) !== -1 ? kind : 'namelist';
}

function sameTerm(a, b) {
  return commonKind(a.kind) === commonKind(b.kind) && String(a.translation || '').trim() === String(b.translation || '').trim();
}

function newEntryId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function cleanCommonEntry(entry, now) {
  return {
    id: newEntryId('common'),
    original: String(entry.original || '').trim(),
    translation: String(entry.translation || '').trim(),
    kind: commonKind(entry.kind),
    addedAt: now
  };
}

function mergeCommonList(mine, theirs, markers) {
  const meta = (list) => {
    const { entries, ...rest } = list;
    return rest;
  };
  const base = mine && theirs ? newerCopy(meta(mine), meta(theirs), (l) => syncTime(l.updatedAt)) : meta(mine || theirs);
  const result = mergeNameEntries(mine ? mine.entries : [], theirs ? theirs.entries : [], markers);
  const updatedAt = Math.max(syncTime(mine && mine.updatedAt), syncTime(theirs && theirs.updatedAt));
  return { list: { ...base, updatedAt, entries: result.list }, markers: result.markers };
}

function copyNameMarkers(names) {
  const out = {};
  Object.entries(names && typeof names === 'object' ? names : {}).forEach(([novelId, kinds]) => {
    out[novelId] = {};
    Object.entries(kinds && typeof kinds === 'object' ? kinds : {}).forEach(([kind, ids]) => {
      out[novelId][kind] = { ...(ids || {}) };
    });
  });
  return out;
}

function mergeNameMarkers(target, source) {
  Object.entries(source || {}).forEach(([novelId, kinds]) => {
    const book = target[novelId] || (target[novelId] = {});
    Object.entries(kinds || {}).forEach(([kind, ids]) => {
      const markers = book[kind] || (book[kind] = {});
      Object.entries(ids || {}).forEach(([id, time]) => {
        markers[id] = Math.max(syncTime(markers[id]), syncTime(time));
      });
    });
  });
  return target;
}

function nameKey(entry) {
  return String((entry && entry.original) || '').trim().toLowerCase();
}

// Merges two copies of one name list entry by entry: newer edit of the same entry wins, removal
// markers drop older entries (and are dropped for entries edited after), and the same name
// added on both devices collapses into the newer one. Returns the list and the markers left.
function mergeNameEntries(localList, remoteList, markers) {
  const time = (entry) => syncTime(entry && entry.updatedAt);
  const keyOf = (entry) => (entry.id ? `id:${entry.id}` : `name:${nameKey(entry)}`);
  const picked = new Map();
  [...(localList || []), ...(remoteList || [])].forEach((entry) => {
    if (!entry) return;
    const key = keyOf(entry);
    const current = picked.get(key);
    picked.set(key, current ? newerCopy(current, entry, time) : entry);
  });
  const left = { ...(markers || {}) };
  const survivors = [];
  picked.forEach((entry) => {
    const marker = entry.id ? left[entry.id] : undefined;
    if (marker !== undefined && syncTime(marker) >= time(entry)) return;
    if (marker !== undefined) delete left[entry.id];
    survivors.push(entry);
  });
  const byName = new Map();
  const unnamed = [];
  survivors.forEach((entry) => {
    const name = nameKey(entry);
    if (!name) {
      unnamed.push(entry);
      return;
    }
    const best = byName.get(name);
    byName.set(name, best ? newerCopy(best, entry, time) : entry);
  });
  const list = [...byName.values(), ...unnamed].sort((a, b) => {
    const added = syncTime(b.addedAt) - syncTime(a.addedAt);
    if (added !== 0) return added;
    return String(a.id || nameKey(a)) < String(b.id || nameKey(b)) ? -1 : 1;
  });
  return { list, markers: left };
}

// The newer of two copies; with equal times the same copy wins whichever device merges.
function newerCopy(local, remote, timeOf) {
  const lt = timeOf(local);
  const rt = timeOf(remote);
  if (rt !== lt) return rt > lt ? remote : local;
  return stableJson(remote) > stableJson(local) ? remote : local;
}

function mergeSyncedNovel(local, remote) {
  const strip = (book) => {
    const { lastRead, nameList, glossaries, listsUpdatedAt, ...rest } = book;
    return rest;
  };
  const localRecord = strip(local);
  const remoteRecord = strip(remote);
  const base = newerCopy(localRecord, remoteRecord, (b) => syncTime(b.updatedAt)) === remoteRecord ? remote : local;
  const merged = { ...base };
  const localRead = local.lastRead ? syncTime(local.lastRead.updatedAt) : -1;
  const remoteRead = remote.lastRead ? syncTime(remote.lastRead.updatedAt) : -1;
  if (remoteRead > localRead) merged.lastRead = remote.lastRead;
  else if (local.lastRead) merged.lastRead = local.lastRead;
  return merged;
}

// Puts the entry-by-entry merge of both copies' name lists on a merged book, using and updating
// the book's removal markers.
function mergeBookNames(merged, local, remote, nameMarkers) {
  const listOf = (book, kind) => {
    if (!book) return [];
    const list = kind === 'namelist' ? book.nameList : (book.glossaries || {})[kind];
    return Array.isArray(list) ? list : [];
  };
  const markersByKind = nameMarkers[merged.id] || {};
  const lists = {};
  const times = {};
  LIST_KINDS.forEach((kind) => {
    const result = mergeNameEntries(listOf(local, kind), listOf(remote, kind), markersByKind[kind]);
    lists[kind] = result.list;
    if (markersByKind[kind]) markersByKind[kind] = result.markers;
    times[kind] = Math.max(
      syncTime(((local && local.listsUpdatedAt) || {})[kind]),
      syncTime(((remote && remote.listsUpdatedAt) || {})[kind])
    );
  });
  merged.nameList = lists.namelist;
  merged.glossaries = { locked: lists.locked, soft: lists.soft };
  merged.listsUpdatedAt = times;
  return merged;
}

// Collapses entries that share a source name (trimmed, case-insensitive), keeping
// the oldest translation so established names win.
function dedupeNameList(list) {
  const out = [];
  const indexByKey = new Map();
  list.forEach((entry) => {
    if (!entry) return;
    const key = (entry.original || '').trim().toLowerCase();
    if (!key) { out.push(entry); return; }
    if (!indexByKey.has(key)) { indexByKey.set(key, out.length); out.push(entry); return; }
    const idx = indexByKey.get(key);
    if ((entry.addedAt || 0) < (out[idx].addedAt || 0)) out[idx] = entry;
  });
  return out;
}

// Whether a name entry changed, ignoring its time and the "new" badge the drawer clears.
function sameNameEntry(a, b) {
  const strip = (entry) => {
    const { updatedAt, isNew, ...rest } = entry || {};
    return rest;
  };
  return stableJson(strip(a)) === stableJson(strip(b));
}

// A list about to be saved, deduped, with each changed entry stamped `now` and each unchanged
// one keeping its stored time.
function stampNameList(previous, nameList, now) {
  const previousById = new Map(previous.filter((e) => e && e.id).map((e) => [e.id, e]));
  return dedupeNameList(Array.isArray(nameList) ? nameList : []).map((entry) => {
    if (!entry || !entry.id) return entry;
    const before = previousById.get(entry.id);
    if (before && sameNameEntry(before, entry)) {
      return before.updatedAt !== undefined ? { ...entry, updatedAt: before.updatedAt } : entry;
    }
    return { ...entry, updatedAt: now };
  });
}

function chapterNumberOfTitle(title) {
  const text = String(title || '').trim();
  const match = text.match(/^(?:thứ\s*([\d,.]+)\s*chương|chương\s*([\d,.]+)|chapter\s*([\d,.]+)|第\s*([\d,]+)\s*章)/i);
  if (!match) return null;
  const digits = (match[1] || match[2] || match[3] || match[4]).replace(/[,.]/g, '');
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function guessSwitchStart(chapters, fromChapter) {
  const list = Array.isArray(chapters) ? chapters : [];
  if (list.length === 0) return -1;
  const byNumber = list.findIndex((c) => chapterNumberOfTitle(c && c.title) === Number(fromChapter));
  if (byNumber !== -1) return byNumber;
  return Math.min(Math.max(Number(fromChapter) - 1, 0), list.length - 1);
}

function mergeSourceSwitches(mainList, switches, listsBySwitch, previous = []) {
  const ordered = [...(switches || [])].filter((s) => s && s.id).sort((a, b) => Number(a.fromChapter) - Number(b.fromChapter));
  let merged = [...(mainList || [])];
  ordered.forEach((sw) => {
    const from = Number(sw.fromChapter);
    const list = (listsBySwitch || {})[sw.id];
    const start = Array.isArray(list) ? list.findIndex((c) => c && String(c.slug) === String(sw.startSlug)) : -1;
    const head = merged.filter((c) => c && Number(c.chapterNumber) < from);
    let tail;
    if (start === -1) {
      tail = (previous || []).filter((c) => c && c.source === sw.id && Number(c.chapterNumber) >= from);
    } else {
      tail = list.slice(start).map((c, i) => ({ ...c, chapterNumber: from + i, source: sw.id, sourceSlug: sw.slug }));
    }
    merged = head.concat(tail);
  });
  return merged;
}

function isPlaceholderTitle(novel, provider) {
  const title = String((novel && novel.title) || '').trim();
  if (!title || title.toLowerCase().includes('unknown')) return true;
  if (!provider) return false;
  if (title === provider.shortName || title === provider.name) return true;
  return typeof provider.formatTitle === 'function' && title === provider.formatTitle(novel.slug, '');
}

function providerForNovel(novel) {
  if (!novel || typeof ProviderRegistry === 'undefined') return null;
  let provider = null;
  if (novel.url) provider = ProviderRegistry.getProviderForUrl(novel.url);
  if (!provider && novel.domain) provider = ProviderRegistry.getProviderForDomain(novel.domain);
  return provider || null;
}

function catalogItemOf(novel, chapterNumber) {
  return (novel.chapterList || []).find((c) => Number(c.chapterNumber) === Number(chapterNumber)) || null;
}

function hasChineseText(text) {
  return typeof text === 'string' && /[㐀-鿿豈-﫿]/.test(text);
}

function storagePlatform() {
  const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null);
  if (scope && scope.Platform) return scope.Platform;
  if (typeof module !== 'undefined' && typeof require === 'function') {
    try { return require('./platform.js'); } catch (e) {}
  }
  return null;
}

function storageArea(name) {
  const platform = storagePlatform();
  return platform && platform.storage ? platform.storage.area(name) : null;
}

const StorageService = {
  async _titleConverter(novel) {
    if (!novel || !novel.conversionMode) return null;
    const hanViet = typeof HanViet !== 'undefined' ? HanViet : null;
    const dictionaries = typeof QtDictionaries !== 'undefined' ? QtDictionaries : null;
    const processors = typeof TextProcessors !== 'undefined' ? TextProcessors : null;
    if (!hanViet || !dictionaries || !processors) return null;
    const safe = (load) => Promise.resolve().then(load).catch((e) => {
      console.warn('[QuickConverter] Dictionary unavailable for title conversion:', e);
      return undefined;
    });
    const [hanVietMap, locked, soft, vietPhrase, qtNames, pronouns, ignoredPhrases, luatNhan, hoNguoi, hauTu, traditional] = await Promise.all([
      safe(() => hanViet.load()),
      safe(() => this.getNameList(novel.id, 'locked')),
      safe(() => this.getNameList(novel.id, 'soft')),
      safe(() => dictionaries.load('vietPhrase')),
      safe(() => dictionaries.load('qtNames')),
      safe(() => dictionaries.load('pronouns')),
      safe(() => dictionaries.load('ignoredPhrases')),
      safe(() => dictionaries.load('luatNhan')),
      safe(() => dictionaries.load('hoNguoi')),
      safe(() => dictionaries.load('hauTu')),
      safe(() => dictionaries.load('traditional'))
    ]);
    const loaded = {};
    if (vietPhrase) loaded.vietPhrase = vietPhrase;
    if (qtNames) loaded.qtNames = qtNames;
    if (pronouns) loaded.pronouns = pronouns;
    if (hoNguoi) loaded.hoNguoi = hoNguoi;
    if (hauTu) loaded.hauTu = hauTu;
    if (traditional) loaded.traditional = traditional;
    return processors.createConverter({
      hanViet: hanVietMap || new Map(),
      names: Array.isArray(novel.nameList) ? novel.nameList : [],
      locked: locked || [],
      soft: soft || [],
      dictionaries: loaded,
      ignoredPhrases: ignoredPhrases || [],
      luatNhan: Array.isArray(luatNhan) ? luatNhan : []
    });
  },

  async _convertCatalogTitles(novel, chapters) {
    if (!novel || !novel.conversionMode || !chapters.some((c) => c && hasChineseText(c.title))) return chapters;
    try {
      const converter = await this._titleConverter(novel);
      if (!converter) return chapters;
      const traditional = converter.isTraditional(chapters.map((c) => (c && c.title) || '').join('\n'));
      return chapters.map((c) => (c && hasChineseText(c.title) ? { ...c, title: converter.convert(c.title, { traditional }) } : c));
    } catch (e) {
      console.warn('[QuickConverter] Could not convert chapter titles:', e);
      return chapters;
    }
  },

  async _convertChapterTitle(novelId, title) {
    if (!hasChineseText(title)) return title;
    try {
      const novel = await this.getNovelById(novelId);
      if (!novel || !novel.conversionMode) return title;
      const converter = await this._titleConverter(novel);
      return converter ? converter.convert(title) : title;
    } catch (e) {
      console.warn('[QuickConverter] Could not convert chapter title:', e);
      return title;
    }
  },

  async _isDbInitialized() {
    const local = storageArea('local');
    if (local) {
      const r = await local.get(['quickconverter_db_initialized']);
      return !!(r && r.quickconverter_db_initialized);
    }
    if (typeof localStorage !== 'undefined') {
      return !!localStorage.getItem('quickconverter_db_initialized');
    }
    return false;
  },

  async _setDbInitialized() {
    const local = storageArea('local');
    if (local) local.set({ quickconverter_db_initialized: true });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('quickconverter_db_initialized', 'true');
    }
  },

  async getAllNovels() {
    return this.getManagedNovels();
  },

  async getManagedNovels() {
    return (await this._novelRecords()).filter((n) => !n.deletedAt);
  },

  async _novelRecords() {
    const db = await openDatabase();
    const isInitialized = await this._isDbInitialized();

    return new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      const request = store.getAll();

      request.onsuccess = async () => {
        let novels = (request.result || []).filter((n) => !isListRecord(n));

        // First-time seed ONLY on clean install/first run, NEVER after user deletes novels
        if (!isInitialized && novels.length === 0) {
          novels = await this._seedInitialNovels();
        } else if (novels.length > 0 && !isInitialized) {
          await this._setDbInitialized();
        }

        // Fill in default thumbnails and chapter counts, and auto-migrate outdated counts
        let needsUpdate = false;
        novels = novels.map((novel) => {
          const defaultRef = INITIAL_NOVELS.find((init) => init.slug === novel.slug);
          const updatedNovel = {
            ...novel,
            thumbnail: novel.thumbnail || (defaultRef ? defaultRef.thumbnail : ''),
            totalChapters: novel.totalChapters || (defaultRef ? defaultRef.totalChapters : 100)
          };

          // Auto-migrate A Regressor's Tale of Cultivation from hardcoded 558 to 880
          if (novel.slug === 'a-regressors-tale-of-cultivation' && (novel.totalChapters === 558 || !novel.totalChapters)) {
            updatedNovel.totalChapters = 880;
            needsUpdate = true;
          }

          return updatedNovel;
        });

        if (needsUpdate) {
          novels.forEach((n) => store.put(n));
        }

        // Sort by creation order
        novels.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        resolve(novels);
      };

      request.onerror = () => reject(request.error);
    });
  },

  async _seedInitialNovels() {
    let previous = null;
    const local = storageArea('local');
    if (local) {
      const r = await local.get(['quickconverter_managed_novels']);
      previous = r && r.quickconverter_managed_novels;
    }

    const seeds = (Array.isArray(previous) && previous.length > 0)
      ? previous.map((p) => {
          const match = INITIAL_NOVELS.find((init) => init.slug === p.slug);
          return {
            ...p,
            thumbnail: p.thumbnail || (match ? match.thumbnail : ''),
            totalChapters: p.totalChapters || (match ? match.totalChapters : 100)
          };
        })
      : INITIAL_NOVELS;

    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      seeds.forEach((novel) => {
        store.put({
          ...novel,
          createdAt: novel.createdAt || Date.now()
        });
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await this._setDbInitialized();
    return seeds;
  },

  async isNovelManaged(slugOrTitle) {
    const novel = await this.getNovelBySlug(slugOrTitle);
    return !!novel;
  },

  async getNovelBySlug(slugOrTitle) {
    if (!slugOrTitle) return null;
    const novels = await this.getManagedNovels();
    const query = slugOrTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

    return novels.find((novel) => {
      const slugMatch = novel.slug && novel.slug.toLowerCase().replace(/[^a-z0-9]/g, '') === query;
      const titleMatch = novel.title && novel.title.toLowerCase().replace(/[^a-z0-9]/g, '') === query;
      return slugMatch || titleMatch;
    }) || null;
  },

  async getNovelById(novelId) {
    if (!novelId) return null;
    const novels = await this._novelRecords();
    const record = novels.find((n) => n.id === novelId) || null;
    if (!record) return null;

    const nameList = await this.getNameList(novelId);
    const { nameList: legacy, ...rest } = record;
    return { ...rest, nameList };
  },

  async isChapterSaved(novelId, chapterNumber) {
    const chapter = await this.getChapter(novelId, chapterNumber);
    return !!(chapter && (chapter.rawText || chapter.convertedText));
  },

  async addNovel(novel) {
    const binned = await this._binnedNovelMatching(novel.slug || novel.title);
    if (binned) {
      await this.restoreNovel(binned.id);
      return this.getManagedNovels();
    }
    const alreadyExists = await this.isNovelManaged(novel.slug || novel.title);
    if (alreadyExists) {
      return this.getManagedNovels();
    }

    let defaultDomain = 'unknown';
    if (novel.domain) {
      defaultDomain = novel.domain;
    } else if (novel.url) {
      try {
        defaultDomain = new URL(novel.url).hostname;
      } catch (e) {}
    }

    const newNovel = {
      id: novel.id || `novel-${Date.now()}`,
      title: novel.title,
      slug: novel.slug || '',
      url: novel.url || '',
      domain: defaultDomain,
      thumbnail: novel.thumbnail || '',
      totalChapters: novel.totalChapters || 100,
      chapterList: Array.isArray(novel.chapterList) ? novel.chapterList : [],
      icon: novel.icon || '📚',
      status: 'Active',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      store.put(newNovel);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await this._setDbInitialized();
    this._libraryChanged('novel');

    // Populate chapter catalog in background if slug is present
    if (newNovel.slug) {
      this.syncNovelChapters(newNovel.id).catch(() => {});
    }

    return this.getManagedNovels();
  },

  async updateNovel(novelId, updates) {
    if (!novelId || !updates) return null;
    const cleanUpdates = { ...updates };
    if (Object.prototype.hasOwnProperty.call(cleanUpdates, 'nameList')) {
      await this.saveNameList(novelId, cleanUpdates.nameList);
      delete cleanUpdates.nameList;
    }
    // Flush any legacy inline list into its own record before rewriting the novel.
    await this.getNameList(novelId);
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      const getReq = store.get(novelId);

      getReq.onsuccess = () => {
        const novel = getReq.result;
        if (!novel) {
          return resolve(null);
        }
        const updated = {
          ...novel,
          ...cleanUpdates,
          id: novel.id, // preserve id
          updatedAt: Date.now()
        };
        store.put(updated);
        tx.oncomplete = () => {
          this._libraryChanged('novel');
          resolve(updated);
        };
      };
      getReq.onerror = () => reject(getReq.error);
      tx.onerror = () => reject(tx.error);
    });
  },

  async updateNovelBySlug(slug, updates) {
    if (!slug || !updates) return null;
    const novel = await this.getNovelBySlug(slug);
    if (!novel) return null;
    return this.updateNovel(novel.id, updates);
  },

  /**
   * Retrieves the Name List (glossary) for a specific novel.
   * @param {string} novelId
   * @returns {Promise<Array<{id: string, original: string, translation: string, chapterFirstSeen: number|string, addedAt: number}>>}
   */
  async getNameList(novelId, kind = 'namelist') {
    if (!novelId) return [];
    const stored = await this._getNameListRecord(novelId, kind);
    if (stored) return [...stored];

    if (kind !== 'namelist') return [];

    const db = await openDatabase();
    const list = await new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      let found = null;
      const listRequest = store.get(`${kind}::${novelId}`);
      listRequest.onsuccess = () => {
        const record = listRequest.result;
        if (record && Array.isArray(record.list)) {
          found = record.list;
          return;
        }
        const novelRequest = store.get(novelId);
        novelRequest.onsuccess = () => {
          const novel = novelRequest.result && !isListRecord(novelRequest.result) ? novelRequest.result : null;
          found = novel && Array.isArray(novel.nameList) ? novel.nameList : [];
          store.put({ id: `${kind}::${novelId}`, owner: novelId, kind, list: found, updatedAt: 0 });
          if (novel && Object.prototype.hasOwnProperty.call(novel, 'nameList')) {
            const { nameList, ...rest } = novel;
            store.put(rest);
          }
        };
      };
      tx.oncomplete = () => resolve(found || []);
      tx.onerror = () => reject(tx.error);
    });
    return [...list];
  },

  _getNameListRecord(novelId, kind = 'namelist') {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readonly');
      const request = tx.objectStore('novels').get(`${kind}::${novelId}`);
      request.onsuccess = () => {
        const record = request.result;
        resolve(record && Array.isArray(record.list) ? record.list : null);
      };
      request.onerror = () => reject(request.error);
    }));
  },

  _putNameListRecord(novelId, list, kind = 'namelist', { migrated = false } = {}) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      tx.objectStore('novels').put({ id: `${kind}::${novelId}`, owner: novelId, kind, list, updatedAt: migrated ? 0 : Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    })).then(() => {
      if (!migrated) this._libraryChanged('names');
    });
  },

  // Announces a change made on this device (not one applied by a sync) and marks the library as
  // changed since the last sync, so AutoSync uploads it.
  onLibraryChanged(handler) {
    libraryChangeListeners.add(handler);
    return () => libraryChangeListeners.delete(handler);
  },

  _libraryChanged(kind) {
    this.setPreference(SYNC_DIRTY_KEY, String(Date.now()));
    libraryChangeListeners.forEach((handler) => {
      try {
        handler({ kind });
      } catch (e) {}
    });
  },

  _putNovelRecord(record) {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      tx.objectStore('novels').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  },

  /**
   * Saves the entire Name List array for a novel (useful for bulk import/reordering).
   * @param {string} novelId
   * @param {Array} nameList
   * @returns {Promise<Array>}
   */
  async saveNameList(novelId, nameList, kind = 'namelist') {
    if (!novelId) return [];
    const { written } = await this._changeNameLists(novelId, [kind], () => ({
      lists: { [kind]: Array.isArray(nameList) ? nameList : [] }
    }));
    return written[kind];
  },

  // Reads, changes and writes a book's name lists in one IndexedDB transaction, so a change made
  // at the same moment in another context (the download worker, another page) is never lost and
  // only entries this change removed get deletion markers. `change` gets the stored lists by kind
  // and returns { lists, result }; only the lists it returns are written.
  async _changeNameLists(novelId, kinds, change) {
    const wanted = [...new Set(kinds)];
    const db = await openDatabase();
    const outcome = await new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      const stored = {};
      let legacyNovel = null;
      let pending = wanted.length + (wanted.includes('namelist') ? 1 : 0);
      let done = null;
      let failure = null;
      const ready = () => {
        if (--pending > 0) return;
        try {
          const current = {};
          wanted.forEach((kind) => {
            const legacy = kind === 'namelist' && legacyNovel && Array.isArray(legacyNovel.nameList) ? legacyNovel.nameList : [];
            current[kind] = [...(stored[kind] || legacy)];
          });
          const { lists = {}, result } = change(current) || {};
          const now = Date.now();
          const written = {};
          const removed = {};
          Object.keys(lists).forEach((kind) => {
            const previous = stored[kind] || [];
            const list = stampNameList(previous, lists[kind], now);
            const kept = new Set(list.filter((e) => e && e.id).map((e) => e.id));
            removed[kind] = previous.filter((e) => e && e.id && !kept.has(e.id)).map((e) => e.id);
            written[kind] = list;
            store.put({ id: `${kind}::${novelId}`, owner: novelId, kind, list, updatedAt: now });
          });
          if (written.namelist && !stored.namelist && legacyNovel && Object.prototype.hasOwnProperty.call(legacyNovel, 'nameList')) {
            const { nameList, ...rest } = legacyNovel;
            store.put(rest);
          }
          done = { result, written, removed, now };
        } catch (e) {
          failure = e;
          if (typeof tx.abort === 'function') tx.abort();
        }
      };
      wanted.forEach((kind) => {
        const request = store.get(`${kind}::${novelId}`);
        request.onsuccess = () => {
          stored[kind] = request.result && Array.isArray(request.result.list) ? request.result.list : null;
          ready();
        };
      });
      if (wanted.includes('namelist')) {
        const request = store.get(novelId);
        request.onsuccess = () => {
          legacyNovel = request.result && !isListRecord(request.result) ? request.result : null;
          ready();
        };
      }
      tx.oncomplete = () => (failure ? reject(failure) : resolve(done));
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error);
    });
    const removedKinds = Object.keys(outcome.removed).filter((kind) => outcome.removed[kind].length > 0);
    if (removedKinds.length > 0) {
      const deleted = this._readSyncDeleted();
      const book = deleted.names[novelId] || (deleted.names[novelId] = {});
      removedKinds.forEach((kind) => {
        const markers = book[kind] || (book[kind] = {});
        outcome.removed[kind].forEach((id) => { markers[id] = outcome.now; });
      });
      this._writeSyncDeleted(deleted);
    }
    if (Object.keys(outcome.written).length > 0) this._libraryChanged('names');
    return outcome;
  },

  /**
   * Adds a new name entry to the novel's Name List.
   * @param {string} novelId
   * @param {{ original: string, translation: string, chapterFirstSeen?: number|string }} entry
   * @returns {Promise<{id: string, original: string, translation: string, chapterFirstSeen: number|string, addedAt: number}>}
   */
  async addNameEntry(novelId, entry, kind = 'namelist') {
    if (!novelId || !entry) return null;
    const { result } = await this._changeNameLists(novelId, [kind], (lists) => {
      const currentList = lists[kind];
      const key = (entry.original || '').trim().toLowerCase();
      const existingIndex = key ? currentList.findIndex((e) => e && (e.original || '').trim().toLowerCase() === key) : -1;
      if (existingIndex !== -1) {
        currentList[existingIndex] = { ...currentList[existingIndex], translation: (entry.translation || '').trim() };
        return { lists: { [kind]: currentList }, result: currentList[existingIndex] };
      }
      const newEntry = {
        id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        original: (entry.original || '').trim(),
        translation: (entry.translation || '').trim(),
        chapterFirstSeen: entry.chapterFirstSeen !== undefined && entry.chapterFirstSeen !== '' ? entry.chapterFirstSeen : null,
        addedAt: Date.now()
      };
      currentList.unshift(newEntry);
      return { lists: { [kind]: currentList }, result: newEntry };
    });
    return result;
  },

  async _readCommonLists() {
    const db = await openDatabase();
    if (!hasStore(db, COMMON_STORE)) return [];
    const lists = await getAllFromStore(db, COMMON_STORE);
    return lists.filter((l) => l && l.id).sort((a, b) => (syncTime(a.createdAt) - syncTime(b.createdAt)) || (a.id < b.id ? -1 : 1));
  },

  async getCommonLists() {
    return this._readCommonLists();
  },

  async _getCommonList(listId) {
    if (!listId) return null;
    const db = await openDatabase();
    if (!hasStore(db, COMMON_STORE)) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(COMMON_STORE, 'readonly');
      const request = tx.objectStore(COMMON_STORE).get(listId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  // Reads, changes and writes one common list in a single transaction. `change` gets a copy of
  // the list and returns { list, result }; the list is written only when returned. Changed
  // entries are stamped, and removed ones leave a marker so a sync does not bring them back.
  async _changeCommonList(listId, change) {
    const db = await openDatabase();
    if (!listId || !hasStore(db, COMMON_STORE)) return { result: null, written: null };
    const outcome = await new Promise((resolve, reject) => {
      const tx = db.transaction(COMMON_STORE, 'readwrite');
      const store = tx.objectStore(COMMON_STORE);
      let done = { result: null, written: null, removed: [], now: 0 };
      let failure = null;
      const request = store.get(listId);
      request.onsuccess = () => {
        const stored = request.result;
        if (!stored) return;
        try {
          const previous = Array.isArray(stored.entries) ? stored.entries : [];
          const { list, result } = change({ ...stored, entries: [...previous] }) || {};
          done = { result, written: null, removed: [], now: 0 };
          if (!list) return;
          const now = Date.now();
          const entries = stampNameList(previous, list.entries, now);
          const kept = new Set(entries.filter((e) => e && e.id).map((e) => e.id));
          const written = { ...list, entries, updatedAt: now };
          store.put(written);
          done = { result, written, removed: previous.filter((e) => e && e.id && !kept.has(e.id)).map((e) => e.id), now };
        } catch (e) {
          failure = e;
          if (typeof tx.abort === 'function') tx.abort();
        }
      };
      tx.oncomplete = () => (failure ? reject(failure) : resolve(done));
      tx.onerror = () => reject(failure || tx.error);
      tx.onabort = () => reject(failure || tx.error);
    });
    if (outcome.removed.length > 0) {
      const deleted = this._readSyncDeleted();
      const markers = deleted.common.entries[listId] || (deleted.common.entries[listId] = {});
      outcome.removed.forEach((id) => { markers[id] = outcome.now; });
      this._writeSyncDeleted(deleted);
    }
    if (outcome.written) this._libraryChanged('common');
    return outcome;
  },

  async createCommonList(name) {
    const db = await openDatabase();
    if (!hasStore(db, COMMON_STORE)) return null;
    const lists = await this._readCommonLists();
    const latest = lists.reduce((max, l) => Math.max(max, syncTime(l.createdAt)), 0);
    const now = Math.max(Date.now(), latest + 1);
    const list = { id: newEntryId('clist'), name: String(name || '').trim() || 'Untitled list', createdAt: now, updatedAt: now, entries: [] };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(COMMON_STORE, 'readwrite');
      tx.objectStore(COMMON_STORE).put(list);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this._libraryChanged('common');
    return list;
  },

  async renameCommonList(listId, name) {
    const clean = String(name || '').trim();
    if (!clean) return null;
    const { written } = await this._changeCommonList(listId, (list) => (list.name === clean ? { result: list } : { list: { ...list, name: clean } }));
    return written;
  },

  async deleteCommonList(listId) {
    const db = await openDatabase();
    if (!listId || !hasStore(db, COMMON_STORE)) return false;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(COMMON_STORE, 'readwrite');
      tx.objectStore(COMMON_STORE).delete(listId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const deleted = this._readSyncDeleted();
    deleted.common.lists[listId] = Date.now();
    delete deleted.common.entries[listId];
    this._writeSyncDeleted(deleted);
    this._libraryChanged('common');
    return true;
  },

  // Sorts incoming terms against what a list already holds: fresh (not there), same (same
  // translation and type) and clashes (a different translation or type).
  _sortAgainst(existingByKey, entries) {
    const fresh = [];
    const same = [];
    const clashes = [];
    const seen = new Set();
    (entries || []).forEach((entry) => {
      const key = nameKey(entry);
      if (!key || !String((entry && entry.translation) || '').trim() || seen.has(key)) return;
      seen.add(key);
      const existing = existingByKey.get(key);
      if (!existing) fresh.push(entry);
      else if (sameTerm(existing.entry, entry)) same.push(entry);
      else clashes.push({ entry, existing: existing.entry, existingKind: existing.kind });
    });
    return { fresh, same, clashes };
  },

  async compareWithCommonList(listId, entries) {
    const list = await this._getCommonList(listId);
    const byKey = new Map(((list && list.entries) || []).map((e) => [nameKey(e), { entry: e, kind: commonKind(e.kind) }]));
    const { fresh, same, clashes } = this._sortAgainst(byKey, entries);
    return { fresh, same, clashes: clashes.map(({ entry, existing }) => ({ entry, existing })) };
  },

  async addToCommonList(listId, entries, { replace = [] } = {}) {
    const replaceKeys = new Set((replace || []).map((original) => nameKey({ original })));
    const { result } = await this._changeCommonList(listId, (list) => {
      const byKey = new Map(list.entries.map((e) => [nameKey(e), { entry: e, kind: commonKind(e.kind) }]));
      const sorted = this._sortAgainst(byKey, entries);
      const now = Date.now();
      const counts = { added: sorted.fresh.length, replaced: 0, unchanged: sorted.same.length, kept: 0 };
      let next = [...sorted.fresh.map((entry) => cleanCommonEntry(entry, now)), ...list.entries];
      sorted.clashes.forEach(({ entry, existing }) => {
        if (!replaceKeys.has(nameKey(entry))) {
          counts.kept += 1;
          return;
        }
        counts.replaced += 1;
        next = next.map((e) => (e === existing ? { ...e, translation: String(entry.translation || '').trim(), kind: commonKind(entry.kind) } : e));
      });
      if (counts.added === 0 && counts.replaced === 0) return { result: counts };
      return { list: { ...list, entries: next }, result: counts };
    });
    return result || { added: 0, replaced: 0, unchanged: 0, kept: 0 };
  },

  async addCommonEntry(listId, entry) {
    if (!entry || !nameKey(entry) || !String(entry.translation || '').trim()) return null;
    const { result } = await this._changeCommonList(listId, (list) => {
      const key = nameKey(entry);
      const index = list.entries.findIndex((e) => nameKey(e) === key);
      if (index === -1) {
        const added = cleanCommonEntry(entry, Date.now());
        return { list: { ...list, entries: [added, ...list.entries] }, result: added };
      }
      const updated = { ...list.entries[index], translation: String(entry.translation).trim(), kind: commonKind(entry.kind) };
      const next = [...list.entries];
      next[index] = updated;
      return { list: { ...list, entries: next }, result: updated };
    });
    return result;
  },

  async updateCommonEntry(listId, entryId, updates) {
    if (!entryId || !updates) return null;
    const { result } = await this._changeCommonList(listId, (list) => {
      const index = list.entries.findIndex((e) => e.id === entryId);
      if (index === -1) return { result: null };
      const current = list.entries[index];
      const updated = {
        ...current,
        original: updates.original !== undefined ? String(updates.original).trim() : current.original,
        translation: updates.translation !== undefined ? String(updates.translation).trim() : current.translation,
        kind: updates.kind !== undefined ? commonKind(updates.kind) : current.kind
      };
      const next = [...list.entries];
      next[index] = updated;
      return { list: { ...list, entries: next }, result: updated };
    });
    return result;
  },

  async removeCommonEntry(listId, entryId) {
    if (!entryId) return false;
    const { result } = await this._changeCommonList(listId, (list) => {
      const next = list.entries.filter((e) => e.id !== entryId);
      if (next.length === list.entries.length) return { result: false };
      return { list: { ...list, entries: next }, result: true };
    });
    return !!result;
  },

  _novelTermsByKey(lists) {
    const byKey = new Map();
    LIST_KINDS.forEach((kind) => {
      (lists[kind] || []).forEach((entry) => {
        const key = nameKey(entry);
        if (key && !byKey.has(key)) byKey.set(key, { entry, kind });
      });
    });
    return byKey;
  },

  async compareCommonListWithNovel(listId, novelId) {
    const list = await this._getCommonList(listId);
    const lists = {};
    for (const kind of LIST_KINDS) lists[kind] = await this.getNameList(novelId, kind);
    const novelEntries = ((list && list.entries) || []).map((e) => ({ ...e, kind: commonKind(e.kind) }));
    const byKey = this._novelTermsByKey(lists);
    const withKinds = new Map([...byKey].map(([key, value]) => [key, { entry: { ...value.entry, kind: value.kind }, kind: value.kind }]));
    const sorted = this._sortAgainst(withKinds, novelEntries);
    return {
      fresh: sorted.fresh,
      same: sorted.same,
      clashes: sorted.clashes.map(({ entry, existing, existingKind }) => {
        const { kind, ...plainEntry } = existing;
        return { entry, existing: plainEntry, existingKind };
      })
    };
  },

  // Copies a common list into a novel once: each entry goes to the novel tab of its type. Terms
  // the novel already has the same are skipped; clashes stay as the novel has them unless their
  // original is in `replace`, in which case the common entry takes their place (moving tabs if
  // its type differs).
  async applyCommonList(listId, novelId, { replace = [] } = {}) {
    const list = await this._getCommonList(listId);
    if (!list || !novelId) return null;
    const replaceKeys = new Set((replace || []).map((original) => nameKey({ original })));
    const { result } = await this._changeNameLists(novelId, LIST_KINDS, (lists) => {
      const byKey = this._novelTermsByKey(lists);
      const counts = { added: 0, replaced: 0, unchanged: 0, kept: 0 };
      const changed = new Set();
      const now = Date.now();
      const novelEntry = (entry) => ({
        id: newEntryId('name'),
        original: String(entry.original || '').trim(),
        translation: String(entry.translation || '').trim(),
        chapterFirstSeen: null,
        addedAt: now
      });
      (list.entries || []).forEach((entry) => {
        const key = nameKey(entry);
        if (!key || !String(entry.translation || '').trim()) return;
        const kind = commonKind(entry.kind);
        const found = byKey.get(key);
        if (!found) {
          const added = novelEntry(entry);
          lists[kind] = [added, ...lists[kind]];
          byKey.set(key, { entry: added, kind });
          changed.add(kind);
          counts.added += 1;
          return;
        }
        if (sameTerm({ ...found.entry, kind: found.kind }, entry)) {
          counts.unchanged += 1;
          return;
        }
        if (!replaceKeys.has(key)) {
          counts.kept += 1;
          return;
        }
        counts.replaced += 1;
        if (found.kind === kind) {
          const updated = { ...found.entry, translation: String(entry.translation).trim() };
          lists[kind] = lists[kind].map((e) => (e === found.entry ? updated : e));
          byKey.set(key, { entry: updated, kind });
          changed.add(kind);
          return;
        }
        lists[found.kind] = lists[found.kind].filter((e) => e !== found.entry);
        const moved = novelEntry(entry);
        lists[kind] = [moved, ...lists[kind]];
        byKey.set(key, { entry: moved, kind });
        changed.add(found.kind);
        changed.add(kind);
      });
      const written = {};
      changed.forEach((kind) => { written[kind] = lists[kind]; });
      return { lists: written, result: counts };
    });
    return result;
  },

  chapterNumberOfTitle,

  guessSwitchStart,

  mergeSourceSwitches,

  parseNameListBlock,

  parseGlossaryBlocks,

  parseTranslationBlock,

  tokenizeSource(text, names) {
    return textProcessors().tokenizeSource(text, names);
  },

  restoreTokens(text, mapping) {
    return textProcessors().restoreTokens(text, mapping);
  },

  applyLockedGlossary(text, entries) {
    return textProcessors().applyLockedGlossary(text, entries);
  },

  stripLockedMarkers(text) {
    return textProcessors().stripLockedMarkers(text);
  },

  /**
   * Adds several name entries at once, skipping any whose source name already exists
   * (case-insensitive). Saves the list once.
   * @param {string} novelId
   * @param {Array<{original: string, translation: string}>} entries
   * @param {number|string} [chapterFirstSeen]
   * @returns {Promise<Array>} the entries actually added
   */
  async addNameEntries(novelId, entries, chapterFirstSeen, kind = 'namelist') {
    if (!novelId || !Array.isArray(entries) || entries.length === 0) return [];
    const { result } = await this._changeNameLists(novelId, [kind], (lists) => {
      const currentList = lists[kind];
      const seen = new Set(
        currentList.map((e) => (e.original || '').trim().toLowerCase()).filter(Boolean)
      );
      const added = [];
      entries.forEach((entry) => {
        const original = (entry && entry.original ? entry.original : '').trim();
        const translation = (entry && entry.translation ? entry.translation : '').trim();
        if (!original || !translation) return;
        const key = original.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        added.push({
          id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          original,
          translation,
          chapterFirstSeen: chapterFirstSeen !== undefined && chapterFirstSeen !== '' ? chapterFirstSeen : null,
          addedAt: Date.now(),
          isNew: true
        });
      });
      if (added.length === 0) return { result: { added, count: currentList.length } };
      return { lists: { [kind]: [...added, ...currentList] }, result: { added, count: currentList.length + added.length } };
    });
    const { added, count } = result;
    if (added.length === 0) return [];
    if (kind === 'namelist' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novel-name-list-updated', {
        detail: { novelId, count, added: added.length }
      }));
    }
    return added;
  },

  /**
   * Updates an existing name entry.
   * @param {string} novelId
   * @param {string} entryId
   * @param {Partial<{ original: string, translation: string, chapterFirstSeen: number|string }>} updates
   * @returns {Promise<Object|null>}
   */
  async updateNameEntry(novelId, entryId, updates, kind = 'namelist') {
    if (!novelId || !entryId || !updates) return null;
    const { result } = await this._changeNameLists(novelId, [kind], (lists) => {
      const currentList = lists[kind];
      const index = currentList.findIndex(e => e.id === entryId);
      if (index === -1) return { result: null };

      currentList[index] = {
        ...currentList[index],
        original: updates.original !== undefined ? updates.original.trim() : currentList[index].original,
        translation: updates.translation !== undefined ? updates.translation.trim() : currentList[index].translation,
        chapterFirstSeen: updates.chapterFirstSeen !== undefined ? updates.chapterFirstSeen : currentList[index].chapterFirstSeen
      };
      if (updates.isNew !== undefined) currentList[index].isNew = updates.isNew;

      return { lists: { [kind]: currentList }, result: currentList[index] };
    });
    return result;
  },

  /**
   * Imports "Original = Translation" lines: updates the meaning of names already in the list
   * (case-insensitive) and adds the rest.
   * @returns {Promise<{added: number, updated: number, list: Array}>}
   */
  async importNameEntries(novelId, items, kind = 'namelist') {
    if (!novelId || !Array.isArray(items) || items.length === 0) return { added: 0, updated: 0, list: await this.getNameList(novelId, kind) };
    const { result, written } = await this._changeNameLists(novelId, [kind], (lists) => {
      const next = lists[kind];
      let added = 0;
      let updated = 0;
      items.forEach((item) => {
        const key = (item.original || '').trim().toLowerCase();
        if (!key) return;
        const idx = next.findIndex((e) => (e.original || '').trim().toLowerCase() === key);
        if (idx !== -1) {
          next[idx] = { ...next[idx], translation: item.translation, chapterFirstSeen: item.chapterFirstSeen || next[idx].chapterFirstSeen };
          updated++;
        } else {
          next.unshift({
            id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            original: item.original,
            translation: item.translation,
            chapterFirstSeen: item.chapterFirstSeen,
            addedAt: Date.now()
          });
          added++;
        }
      });
      return { lists: { [kind]: next }, result: { added, updated } };
    });
    return { ...result, list: written[kind] };
  },

  /**
   * Deletes a name entry from the novel's Name List.
   * @param {string} novelId
   * @param {string} entryId
   * @returns {Promise<boolean>}
   */
  async deleteNameEntry(novelId, entryId, kind = 'namelist') {
    if (!novelId || !entryId) return false;
    const { result } = await this._changeNameLists(novelId, [kind], (lists) => {
      const currentList = lists[kind];
      const filtered = currentList.filter(e => e.id !== entryId);
      if (filtered.length === currentList.length) return { result: false };
      return { lists: { [kind]: filtered }, result: true };
    });
    return result;
  },

  /**
   * Moves a term between glossaries (e.g. soft -> locked), skipping an existing
   * entry with the same source name in the destination so nothing is duplicated.
   * @returns {Promise<Object|null>} the destination entry, or null if the source entry is missing
   */
  async moveNameEntry(novelId, entryId, fromKind = 'soft', toKind = 'locked') {
    if (!novelId || !entryId) return null;
    const { result } = await this._changeNameLists(novelId, [fromKind, toKind], (lists) => {
      const fromList = lists[fromKind];
      const entry = fromList.find(e => e.id === entryId);
      if (!entry) return { result: null };

      const toList = lists[toKind];
      const key = (entry.original || '').trim().toLowerCase();
      const existing = toList.find(e => (e.original || '').trim().toLowerCase() === key);
      let moved = existing;
      if (!existing) {
        moved = { ...entry, id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), addedAt: Date.now(), isNew: true };
        toList.unshift(moved);
      }
      return { lists: { [toKind]: toList, [fromKind]: fromList.filter(e => e.id !== entryId) }, result: moved };
    });
    return result;
  },

  notifyChapterSaved(novelId, chapterNumber) {
    const platform = storagePlatform();
    if (!platform) return;
    platform.messaging.send({ action: 'CHAPTER_SAVED', novelId, chapterNumber }).catch(() => {});
  },

  subscribeChapterSaved(handler) {
    const platform = storagePlatform();
    if (!platform) return () => {};
    return platform.messaging.subscribe((message) => {
      if (message && message.action === 'CHAPTER_SAVED') handler(message);
    });
  },

  getCatalogChapterNumber(novel, chapterSlug) {
    if (!novel || !Array.isArray(novel.chapterList) || chapterSlug === undefined || chapterSlug === null) return null;
    const match = novel.chapterList.find((c) => String(c.slug) === String(chapterSlug));
    return match ? Number(match.chapterNumber) : null;
  },

  async syncNovelMetadata(slugOrId, { preferSiteTitle = false } = {}) {
    let novel = await this.getNovelById(slugOrId);
    if (!novel) {
      novel = await this.getNovelBySlug(slugOrId);
    }
    if (!novel || !novel.slug) return null;

    try {
      let provider = null;
      if (typeof ProviderRegistry !== 'undefined') {
        if (novel.url) {
          provider = ProviderRegistry.getProviderForUrl(novel.url);
        }
        if (!provider && novel.domain) {
          provider = ProviderRegistry.getProviderForDomain(novel.domain);
        }
      }

      let metadata = null;
      if (provider && typeof provider.fetchSeriesMetadata === 'function') {
        metadata = await provider.fetchSeriesMetadata(novel.slug, novel.url);
      } else {
        const url = novel.url || `https://wetriedtls.com/series/${novel.slug}`;
        const resp = await fetch(url);
        if (resp.ok) {
          const html = await resp.text();
          const match = html.match(/Total chapters<\/span>\s*<span[^>]*>\s*(\d+)\s*<\/span>/i)
                     || html.match(/Total chapters[\s\S]*?>\s*(\d+)\s*<\//i);
          const totalChapters = match ? parseInt(match[1], 10) : null;
          const ogImgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          const thumbnail = ogImgMatch ? ogImgMatch[1] : null;
          metadata = { totalChapters, thumbnail };
        }
      }

      if (metadata) {
        const updates = {};
        if (metadata.totalChapters && metadata.totalChapters > 0) {
          updates.totalChapters = metadata.totalChapters;
        }
        if (metadata.thumbnail) {
          updates.thumbnail = metadata.thumbnail;
        }
        if (metadata.title && metadata.title !== novel.title && (preferSiteTitle || isPlaceholderTitle(novel, provider))) {
          updates.title = metadata.title;
        }

        if (Object.keys(updates).length > 0) {
          return await this.updateNovel(novel.id, updates);
        }
      }
    } catch (e) {
      console.warn('[QuickConverter] syncNovelMetadata error:', e);
    }
    return novel;
  },

  async syncNovel(slugOrId) {
    const novel = await this.syncNovelMetadata(slugOrId);
    if (!novel) return null;
    return this.syncNovelChapters(novel.id);
  },

  async syncNovelChapters(slugOrId, { exactTotal = false } = {}) {
    let novel = await this.getNovelById(slugOrId);
    if (!novel) {
      novel = await this.getNovelBySlug(slugOrId);
    }
    if (!novel || !novel.slug) return null;

    try {
      let provider = null;
      if (typeof ProviderRegistry !== 'undefined') {
        if (novel.url) {
          provider = ProviderRegistry.getProviderForUrl(novel.url);
        }
        if (!provider && novel.domain) {
          provider = ProviderRegistry.getProviderForDomain(novel.domain);
        }
      }

      if (provider && typeof provider.fetchChapterList === 'function') {
        const switches = Array.isArray(novel.sourceSwitches) ? novel.sourceSwitches : [];
        const previous = Array.isArray(novel.chapterList) ? novel.chapterList : [];
        let fetched = null;
        try {
          fetched = await provider.fetchChapterList(novel.slug, novel.url);
        } catch (e) {
          if (switches.length === 0 && !exactTotal) throw e;
        }
        let main = Array.isArray(fetched) && fetched.length > 0 ? fetched : null;
        if (!main && (switches.length > 0 || exactTotal)) main = previous.filter((c) => c && !c.source);
        if (main && main.length > 0) {
          let merged = main;
          if (switches.length > 0) {
            const listsBySwitch = {};
            for (const sw of switches) {
              try {
                const list = await provider.fetchChapterList(sw.slug, sw.url);
                if (Array.isArray(list) && list.length > 0) listsBySwitch[sw.id] = list;
              } catch (e) {
                console.warn(`[QuickConverter] Could not load the chapter list of ${sw.slug}:`, e);
              }
            }
            merged = mergeSourceSwitches(main, switches, listsBySwitch, previous);
          }
          const paidSlugs = new Set(previous.filter((c) => c && c.locked === true && c.slug).map((c) => String(c.slug)));
          const chapters = merged.map((c) => (c && c.slug && paidSlugs.has(String(c.slug)) && c.locked !== true ? { ...c, locked: true } : c));
          const updates = {
            chapterList: await this._convertCatalogTitles(novel, chapters)
          };
          if (exactTotal || switches.length > 0 || !novel.totalChapters || chapters.length > novel.totalChapters) {
            updates.totalChapters = chapters.length;
          }
          const updated = await this.updateNovel(novel.id, updates);
          return updated;
        }
      }
    } catch (e) {
      console.warn('[QuickConverter] syncNovelChapters error:', e);
    }
    return novel;
  },


  async previewSourceSwitch(novelId, url, fromChapter) {
    const novel = await this.getNovelById(novelId);
    if (!novel) throw new Error('Book not found.');
    const provider = providerForNovel(novel);
    const target = typeof ProviderRegistry !== 'undefined' && url ? ProviderRegistry.getProviderForUrl(url) : null;
    if (!provider || !target || target.id !== provider.id) {
      throw new Error(`The new source must be on the same site as the book (${provider ? provider.shortName || provider.name || provider.id : 'unknown site'}).`);
    }
    const parsed = typeof target.parseUrl === 'function' ? target.parseUrl(url) : null;
    if (!parsed || !parsed.slug) throw new Error('This link is not a book page.');
    if (parsed.slug === novel.slug) throw new Error("That link is already the book's own source.");
    const from = Number(fromChapter);
    const last = (novel.chapterList || []).reduce((max, c) => Math.max(max, Number(c && c.chapterNumber) || 0), 0);
    if (!Number.isInteger(from) || from < 1 || from > last + 1) {
      throw new Error(`The book has no chapter ${fromChapter}. Pick a chapter from 1 to ${last + 1}.`);
    }
    const seriesUrl = parsed.seriesUrl || url;
    const chapters = await target.fetchChapterList(parsed.slug, seriesUrl);
    if (!Array.isArray(chapters) || chapters.length === 0) {
      throw new Error('Could not load the chapter list of that source. Open it on the site once, then try again.');
    }
    return { slug: parsed.slug, url: seriesUrl, chapters, guess: guessSwitchStart(chapters, from) };
  },

  async addSourceSwitch(novelId, { fromChapter, url, slug, startSlug, startTitle } = {}) {
    const novel = await this.getNovelById(novelId);
    const from = Number(fromChapter);
    if (!novel || !Number.isInteger(from) || from < 1 || !slug || !startSlug) return null;
    const sw = { id: newEntryId('switch'), fromChapter: from, url: url || '', slug, startSlug: String(startSlug), startTitle: startTitle || '', createdAt: Date.now() };
    const switches = (novel.sourceSwitches || [])
      .filter((s) => Number(s.fromChapter) !== from)
      .concat(sw)
      .sort((a, b) => Number(a.fromChapter) - Number(b.fromChapter));
    await this.updateNovel(novel.id, { sourceSwitches: switches });
    await this.syncNovelChapters(novel.id, { exactTotal: true });
    return sw;
  },

  async removeSourceSwitch(novelId, switchId) {
    const novel = await this.getNovelById(novelId);
    if (!novel || !switchId) return null;
    const switches = (novel.sourceSwitches || []).filter((s) => s.id !== switchId);
    await this.updateNovel(novel.id, { sourceSwitches: switches });
    return this.syncNovelChapters(novel.id, { exactTotal: true });
  },

  async _binnedNovelMatching(slugOrTitle) {
    if (!slugOrTitle) return null;
    const query = String(slugOrTitle).toLowerCase().replace(/[^a-z0-9]/g, '');
    const records = await this._novelRecords();
    return records.find((novel) => novel.deletedAt && (
      (novel.slug && novel.slug.toLowerCase().replace(/[^a-z0-9]/g, '') === query) ||
      (novel.title && novel.title.toLowerCase().replace(/[^a-z0-9]/g, '') === query)
    )) || null;
  },

  async moveNovelToBin(novelId) {
    if (!novelId) return null;
    return this.updateNovel(novelId, { deletedAt: Date.now() });
  },

  async restoreNovel(novelId) {
    if (!novelId) return null;
    return this.updateNovel(novelId, { deletedAt: null });
  },

  async getRecycleBin(now = Date.now()) {
    const records = await this._novelRecords();
    return records
      .filter((n) => n.deletedAt)
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .map((n) => ({
        ...n,
        daysLeft: Math.max(0, Math.ceil((n.deletedAt + RECYCLE_BIN_DAYS * DAY_MS - now) / DAY_MS))
      }));
  },

  async purgeRecycleBin(now = Date.now()) {
    const expired = (await this.getRecycleBin(now)).filter((n) => now - n.deletedAt > RECYCLE_BIN_DAYS * DAY_MS);
    for (const novel of expired) await this.deleteNovel(novel.id);
    return expired.map((n) => n.id);
  },

  async deleteNovelForever(novelId) {
    return this.deleteNovel(novelId);
  },

  async deleteNovel(novelIdOrSlug) {
    if (!novelIdOrSlug) return this.getManagedNovels();
    const db = await openDatabase();

    // 1. Identify all matching IDs and slugs for this novel
    const allNovels = await new Promise((resolve) => {
      const tx = db.transaction('novels', 'readonly');
      const store = tx.objectStore('novels');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });

    const targetIds = new Set();
    const targetSlugs = new Set();

    targetIds.add(novelIdOrSlug);

    allNovels.forEach((n) => {
      if (
        n.id === novelIdOrSlug ||
        n.slug === novelIdOrSlug ||
        (n.title && n.title.toLowerCase() === String(novelIdOrSlug).toLowerCase())
      ) {
        targetIds.add(n.id);
        if (n.slug) targetSlugs.add(n.slug);
      }
    });

    // Also match any duplicate records with matching slug
    allNovels.forEach((n) => {
      if (n.slug && targetSlugs.has(n.slug)) {
        targetIds.add(n.id);
      }
    });

    // Remove the deleted novel's name list / locked / soft glossary records too
    allNovels.forEach((n) => {
      if (isListRecord(n) && targetIds.has(n.owner)) targetIds.add(n.id);
    });

    // 2. Delete from both novels and chapters stores
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['novels', 'chapters'], 'readwrite');
      const novelStore = tx.objectStore('novels');
      const chapterStore = tx.objectStore('chapters');

      // Delete novel record(s)
      targetIds.forEach((id) => {
        novelStore.delete(id);
      });

      // Delete all chapters belonging to any of the target novel IDs
      const chapterIndex = chapterStore.index('novelId');
      targetIds.forEach((id) => {
        const request = chapterIndex.openCursor(IDBKeyRange.only(id));
        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    this._markDeleted('novels', Array.from(targetIds).filter((id) => String(id).indexOf('::') === -1));
    await this._updateSyncSummaries({ dropBooks: Array.from(targetIds) });
    this._libraryChanged('novel');

    // 3. Mark database as initialized so deleting all novels leaves the list empty instead of re-seeding
    await this._setDbInitialized();

    // 4. Update legacy storage cache if present
    const local = storageArea('local');
    if (local) {
      local.get(['quickconverter_managed_novels']).then((r) => {
        if (r && Array.isArray(r.quickconverter_managed_novels)) {
          const remaining = r.quickconverter_managed_novels.filter(
            (n) => !targetIds.has(n.id) && !targetSlugs.has(n.slug)
          );
          local.set({ quickconverter_managed_novels: remaining });
        }
      });
    }

    return this.getManagedNovels();
  },

  // --- High-Volume Chapter Operations ---

  async saveChapter(chapterData) {
    const { novelId, chapterNumber, title, url, rawText, convertedText, ...rest } = chapterData || {};
    if (!novelId || chapterNumber === undefined) {
      throw new Error('novelId and chapterNumber are required to save a chapter');
    }

    const chapterId = `${novelId}_ch${chapterNumber}`;
    const savedTitle = await this._convertChapterTitle(novelId, title);
    const chapterRecord = {
      ...rest,
      id: chapterId,
      novelId,
      chapterNumber: Number(chapterNumber),
      title: savedTitle || `Chapter ${chapterNumber}`,
      url: url || '',
      rawText: rawText || '',
      convertedText: convertedText || '',
      updatedAt: Date.now()
    };

    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      store.put(chapterRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this._updateSyncSummaries({ put: [chapterRecord] });
    this._libraryChanged('chapter');
    return chapterRecord;
  },

  async updateChapter(novelId, chapterNumber, updates) {
    if (!novelId || chapterNumber === undefined || !updates) {
      throw new Error('novelId, chapterNumber, and updates are required to update a chapter');
    }

    const existing = await this.getChapter(novelId, chapterNumber);
    if (!existing) {
      throw new Error(`Chapter ${chapterNumber} not found for novel ${novelId}`);
    }

    const updatedRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      novelId: existing.novelId,
      chapterNumber: Number(existing.chapterNumber),
      updatedAt: Date.now()
    };

    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      store.put(updatedRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    await this._updateSyncSummaries({ put: [updatedRecord] });
    this._libraryChanged('chapter');
    return updatedRecord;
  },

  async getChapter(novelId, chapterNumber) {
    const chapterId = `${novelId}_ch${chapterNumber}`;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readonly');
      const store = tx.objectStore('chapters');
      const request = store.get(chapterId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  },

  async getNovelChapters(novelId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readonly');
      const store = tx.objectStore('chapters');
      const index = store.index('novelId');
      const request = index.getAll(IDBKeyRange.only(novelId));

      request.onsuccess = () => {
        const chapters = request.result || [];
        chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
        resolve(chapters);
      };
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Replaces a translated name throughout every downloaded chapter's translated text
   * (rawText, not the source). wholeWord uses letter/number lookarounds so short names
   * don't hit longer words. Pass dryRun to only count. Returns { count, chaptersChanged,
   * chaptersScanned }.
   */
  async replaceInChapters(novelId, search, replacement, options = {}) {
    const { dryRun = false, wholeWord = true, caseSensitive = true } = options;
    const result = { count: 0, chaptersChanged: 0, chaptersScanned: 0 };
    if (!novelId || !search || search === replacement) return result;

    const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = caseSensitive ? 'gu' : 'giu';
    const regex = wholeWord
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, flags)
      : new RegExp(escaped, flags);

    const chapters = await this.getNovelChapters(novelId);
    result.chaptersScanned = chapters.length;

    for (const chapter of chapters) {
      if (typeof chapter.rawText !== 'string' || !chapter.rawText) continue;
      regex.lastIndex = 0;
      const matches = chapter.rawText.match(regex);
      if (!matches || matches.length === 0) continue;
      result.count += matches.length;
      result.chaptersChanged += 1;
      if (!dryRun) {
        regex.lastIndex = 0;
        const nextText = chapter.rawText.replace(regex, replacement);
        await this.updateChapter(novelId, chapter.chapterNumber, { rawText: nextText });
      }
    }
    return result;
  },

  formatBytes(bytes) {
    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  },

  async getNovelDownloadStats(novelId, totalChapters = 100) {
    const chapters = await this.getNovelChapters(novelId);
    let bytes = 0;
    chapters.forEach((ch) => {
      if (typeof ch.rawText === 'string') bytes += ch.rawText.length * 2;
      if (typeof ch.originalRawText === 'string') bytes += ch.originalRawText.length * 2;
      if (typeof ch.title === 'string') bytes += ch.title.length * 2;
      bytes += 256;
    });

    return {
      downloadedCount: chapters.length,
      totalChapters: totalChapters,
      bytes: bytes,
      formattedSize: this.formatBytes(bytes)
    };
  },

  /**
   * Retrieves overall disk and IndexedDB storage usage for saved chapters.
   * @returns {Promise<{ bytes: number, contentBytes: number, formatted: string, quotaBytes: number|null, formattedQuota: string|null, percentOfQuota: string|null, totalDownloadedChapters: number, novelBytesMap: object }>}
   */
  async getDiskUsage() {
    let quota = null;
    let usageBytes = null;
    let estimateSuccess = false;

    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate && typeof estimate.usage === 'number') {
          usageBytes = estimate.usage;
          quota = estimate.quota || null;
          estimateSuccess = true;
        }
      } catch (e) {
        console.warn('[StorageService] navigator.storage.estimate warning:', e);
      }
    }

    const db = await openDatabase();
    let contentBytes = 0;
    let totalChapters = 0;
    const novelBytesMap = {};

    await new Promise((resolve) => {
      const tx = db.transaction('chapters', 'readonly');
      const store = tx.objectStore('chapters');
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          totalChapters++;
          const ch = cursor.value;
          let chBytes = 0;
          if (typeof ch.rawText === 'string') chBytes += ch.rawText.length * 2;
          if (typeof ch.originalRawText === 'string') chBytes += ch.originalRawText.length * 2;
          if (typeof ch.title === 'string') chBytes += ch.title.length * 2;
          chBytes += 256;

          contentBytes += chBytes;
          const nid = ch.novelId || 'unknown';
          novelBytesMap[nid] = (novelBytesMap[nid] || 0) + chBytes;
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    const effectiveBytes = (estimateSuccess && usageBytes !== null) ? usageBytes : contentBytes;

    return {
      bytes: effectiveBytes,
      contentBytes: contentBytes,
      formatted: this.formatBytes(effectiveBytes),
      quotaBytes: quota,
      formattedQuota: quota ? this.formatBytes(quota) : null,
      percentOfQuota: (quota && quota > 0) ? ((effectiveBytes / quota) * 100).toFixed(2) : null,
      totalDownloadedChapters: totalChapters,
      novelBytesMap
    };
  },

  async _translateRaw(novel, rawText, translation, options = {}) {
    if (options && options.signal && options.signal.aborted) {
      throw new Error('UserCancelled');
    }
    let { apiKey, prompt, model, provider, baseUrl } = translation;
    let cleanKey = (apiKey || '').trim();

    if (options && typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'connecting', percent: 10, text: 'Connecting to AI...' });
    }

    const ai = (typeof window !== 'undefined' && window.AIService) ||
      (typeof self !== 'undefined' && self.AIService) ||
      (typeof AIService !== 'undefined' && AIService);

    const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
      (typeof self !== 'undefined' && self.DeepSeekService) ||
      (typeof DeepSeekService !== 'undefined' && DeepSeekService);

    const client = ai || deepseek;

    const provConfig = (client && typeof client.getProviderConfig === 'function')
      ? await client.getProviderConfig()
      : { provider: 'official', baseUrl: 'https://api.deepseek.com', isLocalBridge: false };

    const activeProvider = provider || provConfig.provider;
    const effectiveBaseUrl = baseUrl || provConfig.baseUrl;

    if (!cleanKey && deepseek && typeof deepseek.getApiKey === 'function') {
      try {
        const stored = await deepseek.getApiKey();
        if (stored && stored.apiKey) {
          cleanKey = stored.apiKey.trim();
        }
      } catch (e) {
        console.warn('[StorageService] Error loading stored DeepSeek key:', e);
      }
    }

    if (!cleanKey) {
      if (activeProvider === 'custom' || activeProvider === 'local_bridge' || (effectiveBaseUrl && (effectiveBaseUrl.includes('127.0.0.1') || effectiveBaseUrl.includes('localhost')))) {
        cleanKey = 'sk-local';
      } else {
        throw new Error('DeepSeek API Key is required when translation is enabled.');
      }
    }

    if (!client || typeof client.translateChapter !== 'function') {
      throw new Error('AI translation service is not loaded.');
    }

    const effectivePrompt = prompt || (novel && novel.translationPrompt) ||
      'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

    const nameEntries = novel && Array.isArray(novel.nameList) ? novel.nameList : [];
    let lockedEntries = [];
    try {
      lockedEntries = novel ? await this.getNameList(novel.id, 'locked') : [];
    } catch (e) {
      console.warn('[StorageService] Failed to load locked glossary:', e);
    }
    const prepared = textProcessors().prepareForAi(rawText, { names: nameEntries, locked: lockedEntries });
    const sourceForTranslation = prepared.text;
    let promptForTranslation = prepared.mapping.length > 0
      ? `${effectivePrompt}\n\nKeep every placeholder token such as @1@ or @a@ exactly as written - do not translate, alter, or remove them.`
      : effectivePrompt;
    if (options && options.ocrSource) {
      promptForTranslation = `${promptForTranslation}\n\nThe source text was produced by OCR from an image, so a few characters may be misread or missing. Use the surrounding context to infer the intended words.`;
    }

    // Estimate expected translated character count (CJK: ~2.8x, Latin: ~1.1x)
    const rawLen = rawText ? rawText.length : 1000;
    const isCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(rawText || '');
    const expansionRatio = isCJK ? 2.8 : 1.1;
    const expectedChars = Math.max(100, Math.round(rawLen * expansionRatio));

    const result = await client.translateChapter({
      apiKey: cleanKey,
      prompt: promptForTranslation,
      rawText: sourceForTranslation,
      model: model || (activeProvider === 'local_bridge' ? 'deepseek-chat' : 'deepseek-flash'),
      provider: activeProvider,
      baseUrl: effectiveBaseUrl,
      signal: options.signal,
      onChunk: (chunk) => {
        if (options && typeof options.onChunk === 'function') {
          options.onChunk(chunk);
        }
        if (options && typeof options.onProgress === 'function' && chunk) {
          if (chunk.type === 'reasoning') {
            options.onProgress({
              phase: 'reasoning',
              percent: 12,
              text: 'DeepThinking...'
            });
          } else if (chunk.type === 'content') {
            const currentChars = (chunk.fullText || '').length;
            const ratio = currentChars / expectedChars;
            let pct;
            if (ratio <= 1.0) {
              pct = Math.round(10 + ratio * 82); // 10% to 92%
            } else {
              const overflow = (currentChars - expectedChars) / (expectedChars * 0.5);
              pct = Math.min(98, Math.round(92 + (1 - Math.exp(-overflow)) * 6)); // 92% to 98%
            }
            options.onProgress({
              phase: 'translating',
              percent: Math.max(12, Math.min(98, pct)),
              text: `Translating (${pct}%)...`,
              currentChars,
              expectedChars
            });
          }
        }
      }
    });


    const parsedGlossary = this.parseGlossaryBlocks(textProcessors().restoreFromAi(result.translatedText, prepared.mapping));
    return {
      text: parsedGlossary.text,
      names: parsedGlossary.names,
      locked: parsedGlossary.locked,
      soft: parsedGlossary.soft,
      delaySeconds: parsedGlossary.delaySeconds || 0,
      modelUsed: result.modelUsed,
      costInfo: result.costInfo || null,
      usage: result.usage || null
    };
  },

  async translateText(novelId, rawText, translation, options = {}) {
    const novel = novelId ? await this.getNovelById(novelId) : null;
    return this._translateRaw(novel, rawText, { ...(translation || {}), enabled: true }, options);
  },

  // The http chapter source: the provider fetches the chapter text (wetriedtls). Sites whose
  // chapters only exist on their own page (fetchMode 'page') are read by opening that page.
  async fetchChapterSource(novel, chapterNumber, options = {}) {
    const provider = providerForNovel(novel);
    if (provider && provider.fetchMode === 'page') {
      const platform = storagePlatform();
      const pages = platform && platform.pageSource;
      if (!pages) {
        throw new Error(`${provider.shortName || provider.name || 'This site'}: chapters are saved by opening its page.`);
      }
      const pageItem = catalogItemOf(novel, chapterNumber);
      if (!pageItem || !pageItem.url) {
        throw new Error(`Chapter ${chapterNumber} is not in the book's chapter list. Sync Catalog, then try again.`);
      }
      return pages.fetch(pageItem.url, {
        expect: { slug: pageItem.sourceSlug || novel.slug, chapterSlug: pageItem.slug },
        onNeedsUser: options.onNeedsUser,
        signal: options.signal
      });
    }
    if (!provider || typeof provider.fetchChapterContent !== 'function') {
      throw new Error(`No provider available to fetch chapter content for ${novel.title}`);
    }
    const catalogItem = catalogItemOf(novel, chapterNumber);
    const chapterSlugOrNumber = catalogItem && catalogItem.slug ? catalogItem.slug : chapterNumber;
    const content = await provider.fetchChapterContent((catalogItem && catalogItem.sourceSlug) || novel.slug, chapterSlugOrNumber, { signal: options.signal });
    if (!content || !content.rawText) {
      throw new Error(`Failed to extract chapter content for Chapter ${chapterNumber}`);
    }
    return { kind: 'text', title: content.title, rawText: content.rawText };
  },

  // The one download: gets the chapter's source (or uses options.source when it is already in
  // hand), then translates and saves it through _saveChapterFromSource.
  async downloadChapter(novelId, chapterNumber, options = {}) {
    if (!novelId || chapterNumber === undefined) {
      throw new Error('novelId and chapterNumber are required to download a chapter');
    }
    if (options && options.signal && options.signal.aborted) {
      throw new Error('UserCancelled');
    }
    const novel = await this.getNovelById(novelId);
    if (!novel) {
      throw new Error(`Novel not found for ID: ${novelId}`);
    }
    let source = options && options.source ? options.source : null;
    if (!source) {
      if (options && typeof options.onProgress === 'function') {
        options.onProgress({ phase: 'fetching', percent: 5, text: 'Fetching raw chapter...' });
      }
      const provider = providerForNovel(novel);
      const release = options && typeof options.siteTurn === 'function'
        ? await options.siteTurn((provider && provider.id) || novel.domain || 'unknown')
        : null;
      try {
        source = await this.fetchChapterSource(novel, chapterNumber, options);
      } finally {
        if (typeof release === 'function') release();
      }
    }
    if (options && options.signal && options.signal.aborted) {
      throw new Error('UserCancelled');
    }
    if (source.kind === 'image') {
      let text;
      if (source.text !== undefined) {
        text = String(source.text || '').trim();
      } else {
        const platform = storagePlatform();
        const ocr = platform && platform.ocr;
        if (!ocr) throw new Error('Reading chapter images is not available here.');
        if (options && typeof options.onProgress === 'function') {
          options.onProgress({ phase: 'reading', percent: 20, text: 'Reading the chapter image...' });
        }
        text = String((await ocr.recognize(source.image.bytes, source.image.mimeType, source.image.base64)) || '').trim();
      }
      if (!text) throw new Error('No text was found in the chapter image. The chapter was not saved.');
      if (options && options.signal && options.signal.aborted) throw new Error('UserCancelled');
      return this._saveChapterFromSource(novel, chapterNumber, { origin: 'ocr', title: source.title, url: source.url, rawText: text }, options);
    }
    return this._saveChapterFromSource(novel, chapterNumber, { origin: 'fetch', ...source }, options);
  },

  // Translates (when asked) and saves a chapter's source text. Where the text came from
  // (source.origin) decides the few things that still differ: 'fetch' (a download), 'page' (a
  // chapter page the user opened) and 'ocr' (an image chapter read with OCR, which also marks the
  // chapter as paid).
  async _saveChapterFromSource(novel, chapterNumber, source, options = {}) {
    const origin = source.origin || 'fetch';
    const number = Number(chapterNumber);
    const report = (update) => {
      if (options && typeof options.onProgress === 'function') options.onProgress(update);
    };
    const catalogItem = catalogItemOf(novel, chapterNumber);
    const rawText = source.rawText;
    const title = origin === 'page'
      ? source.title || `Chapter ${chapterNumber}`
      : (catalogItem && catalogItem.title) || source.title || `Chapter ${chapterNumber}`;
    let url;
    if (origin === 'fetch') url = (catalogItem && catalogItem.url) || `${novel.url}/chapter-${chapterNumber}`;
    else if (origin === 'page') url = source.url || '';
    else url = source.url || (catalogItem && catalogItem.url) || '';

    const translation = options && options.translation;
    let translated = null;
    if (translation && translation.enabled) {
      if (options.signal && options.signal.aborted) throw new Error('UserCancelled');
      translated = await this._translateRaw(novel, rawText, translation, { ...options, ocrSource: origin === 'ocr' });
    } else if (origin === 'fetch') {
      report({ phase: 'saving', percent: 80, text: 'Saving raw chapter...' });
    }

    if (origin !== 'page') report({ phase: 'saving', percent: 99, text: 'Saving chapter...' });

    const sourceMark = catalogItem && catalogItem.source ? { source: catalogItem.source } : {};
    let record;
    if (origin === 'page' && !translated) {
      record = { novelId: novel.id, chapterNumber, title, url, rawText: rawText || '', ...sourceMark };
    } else {
      record = {
        novelId: novel.id,
        chapterNumber: number,
        title,
        url,
        rawText: translated ? translated.text : rawText,
        originalRawText: rawText,
        reasoningText: null,
        ...(origin === 'ocr' ? { ocrSource: true } : {}),
        isTranslated: !!translated,
        modelUsed: translated ? translated.modelUsed : null,
        translatedAt: translated ? Date.now() : null,
        translationCost: translated ? translated.costInfo : null,
        translationUsage: translated ? translated.usage : null,
        ...sourceMark
      };
    }
    const saved = await this.saveChapter(record);

    if (translated) {
      await this._addCapturedGlossary(novel.id, number, { names: translated.names, locked: translated.locked, soft: translated.soft });
    }

    if (origin === 'ocr' && catalogItem && catalogItem.locked !== true) {
      try {
        await this.updateNovel(novel.id, {
          chapterList: novel.chapterList.map((c) => (c === catalogItem ? { ...c, locked: true } : c))
        });
      } catch (e) {
        console.warn('[StorageService] Failed to mark the chapter as paid:', e);
      }
    }

    if (origin === 'page' || origin === 'ocr') this.notifyChapterSaved(novel.id, origin === 'ocr' ? number : chapterNumber);

    if (origin !== 'page') report({ phase: 'completed', percent: 100, text: 'Completed' });

    return { ...saved, translationDelay: translated ? translated.delaySeconds : 0 };
  },

  async _addCapturedGlossary(novelId, chapterNumber, { names = [], locked = [], soft = [] } = {}) {
    if (names.length > 0) {
      try {
        await this.addNameEntries(novelId, names, chapterNumber);
      } catch (e) {
        console.warn('[StorageService] Failed to save auto-detected name list:', e);
      }
    }

    if (locked.length > 0) {
      try {
        await this.addNameEntries(novelId, locked, chapterNumber, 'locked');
      } catch (e) {
        console.warn('[StorageService] Failed to save auto-detected locked glossary:', e);
      }
    }

    if (soft.length > 0) {
      try {
        await this.addNameEntries(novelId, soft, chapterNumber, 'soft');
      } catch (e) {
        console.warn('[StorageService] Failed to save auto-detected soft glossary:', e);
      }
    }
  },

  async setLastRead(novelId, { chapterNumber, paragraph = 0, count = 0, title = '' } = {}) {
    const number = Number(chapterNumber);
    if (!novelId || !Number.isFinite(number)) return null;
    const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const lastRead = {
      chapterNumber: number,
      paragraph: whole(paragraph),
      count: whole(count),
      title: String(title || ''),
      updatedAt: Date.now()
    };
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      const store = tx.objectStore('novels');
      const request = store.get(novelId);
      request.onsuccess = () => {
        const novel = request.result;
        if (!novel) {
          resolve(null);
          return;
        }
        const updated = { ...novel, lastRead };
        store.put(updated);
        this._libraryChanged('reading');
        resolve(updated);
      };
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  },

  async saveOpenedChapter({ slug, chapterNumber, title, url, rawText, domain } = {}) {
    const novel = await this.getNovelBySlug(slug);
    if (!novel) {
      return { success: false, error: 'Novel is not managed' };
    }

    if (domain && !novel.domain) {
      await this.updateNovel(novel.id, { domain });
    }

    const savedChapter = await this._saveChapterFromSource(novel, chapterNumber, { origin: 'page', title, url, rawText });

    return {
      success: true,
      isSaved: true,
      chapterId: savedChapter.id,
      novelId: novel.id,
      novelTitle: novel.title
    };
  },

  async deleteChapter(novelId, chapterNumber) {
    const chapterId = `${novelId}_ch${chapterNumber}`;
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      store.delete(chapterId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    this._markDeleted('chapters', [chapterId]);
    await this._updateSyncSummaries({ remove: [chapterId] });
    this._libraryChanged('chapter');
    return true;
  },

  // Deletion markers ({ novels: { id: time }, chapters: { id: time } }) so a sync removes what
  // another device deleted instead of bringing it back.
  _readSyncDeleted() {
    try {
      const parsed = JSON.parse(this.getPreference(SYNC_DELETED_KEY, '{}') || '{}');
      return {
        novels: parsed && parsed.novels && typeof parsed.novels === 'object' ? parsed.novels : {},
        chapters: parsed && parsed.chapters && typeof parsed.chapters === 'object' ? parsed.chapters : {},
        names: parsed && parsed.names && typeof parsed.names === 'object' ? parsed.names : {},
        common: copyCommonMarkers(parsed && parsed.common)
      };
    } catch (e) {
      return { novels: {}, chapters: {}, names: {}, common: copyCommonMarkers(null) };
    }
  },

  // The synced markers plus the ones this device made since the sync started.
  _keepNewerMarkers(deleted, since) {
    const current = this._readSyncDeleted();
    const out = { novels: { ...((deleted && deleted.novels) || {}) }, chapters: { ...((deleted && deleted.chapters) || {}) }, names: copyNameMarkers(deleted && deleted.names), common: copyCommonMarkers(deleted && deleted.common) };
    const newer = (time) => syncTime(time) >= since;
    const recentCommon = copyCommonMarkers(null);
    Object.entries(current.common.lists).forEach(([id, time]) => { if (newer(time)) recentCommon.lists[id] = time; });
    Object.entries(current.common.entries).forEach(([listId, ids]) => {
      Object.entries(ids || {}).forEach(([id, time]) => {
        if (newer(time)) (recentCommon.entries[listId] || (recentCommon.entries[listId] = {}))[id] = time;
      });
    });
    mergeCommonMarkers(out.common, recentCommon);
    ['novels', 'chapters'].forEach((kind) => {
      Object.entries(current[kind] || {}).forEach(([id, time]) => {
        if (newer(time)) out[kind][id] = Math.max(syncTime(out[kind][id]), syncTime(time));
      });
    });
    const recent = {};
    Object.entries(current.names || {}).forEach(([novelId, kinds]) => {
      Object.entries(kinds || {}).forEach(([kind, ids]) => {
        Object.entries(ids || {}).forEach(([id, time]) => {
          if (!newer(time)) return;
          ((recent[novelId] || (recent[novelId] = {}))[kind] || (recent[novelId][kind] = {}))[id] = time;
        });
      });
    });
    mergeNameMarkers(out.names, recent);
    return out;
  },

  _writeSyncDeleted(deleted) {
    this.setPreference(SYNC_DELETED_KEY, JSON.stringify({
      novels: (deleted && deleted.novels) || {},
      chapters: (deleted && deleted.chapters) || {},
      names: (deleted && deleted.names) || {},
      common: copyCommonMarkers(deleted && deleted.common)
    }));
  },

  // Keeps the per-book chapter summaries (sync reads these instead of every chapter). Never
  // fails a save: without the store (older databases in tests) it does nothing.
  async _updateSyncSummaries({ put = [], remove = [], dropBooks = [] } = {}) {
    if (put.length === 0 && remove.length === 0 && dropBooks.length === 0) return;
    const byBook = new Map();
    const touch = (novelId) => {
      if (!byBook.has(novelId)) byBook.set(novelId, { put: [], remove: [] });
      return byBook.get(novelId);
    };
    put.forEach((chapter) => { if (chapter && chapter.novelId) touch(chapter.novelId).put.push(chapter); });
    remove.forEach((id) => { const novelId = chapterNovelId(id); if (novelId) touch(novelId).remove.push(id); });
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STATE_STORE, 'readwrite');
        const store = tx.objectStore(SYNC_STATE_STORE);
        dropBooks.forEach((novelId) => { if (!byBook.has(novelId)) store.delete(novelId); });
        byBook.forEach((change, novelId) => {
          if (dropBooks.indexOf(novelId) !== -1) {
            store.delete(novelId);
            return;
          }
          const request = store.get(novelId);
          request.onsuccess = () => {
            const record = request.result || { id: novelId, chapters: {} };
            const chapters = { ...(record.chapters || {}) };
            change.put.forEach((c) => { chapters[c.id] = [Number(c.updatedAt) || 0, Number(c.chapterNumber)]; });
            change.remove.forEach((id) => { delete chapters[id]; });
            store.put({ id: novelId, chapters });
          };
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  },

  async _clearSyncSummaries() {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_STATE_STORE, 'readwrite');
        tx.objectStore(SYNC_STATE_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {}
  },

  // What sync needs from this device without reading chapter text: every book (with its name
  // lists), each book's chapter ids/numbers/times, the deletion markers and settings. Books
  // without a summary (libraries from before summaries) get one built from a single full read.
  async getSyncSnapshot() {
    const base = await this._exportBase();
    const db = await openDatabase();
    let summaries = [];
    try {
      summaries = await getAllFromStore(db, SYNC_STATE_STORE);
    } catch (e) {
      return null;
    }
    const chapterTimes = {};
    summaries.forEach((record) => { if (record && record.id) chapterTimes[record.id] = { ...(record.chapters || {}) }; });
    const missing = base.novels.filter((novel) => !chapterTimes[novel.id]);
    if (missing.length > 0) {
      const chapters = await getAllFromStore(db, 'chapters');
      const built = new Map(missing.map((novel) => [novel.id, {}]));
      chapters.forEach((c) => {
        const book = c && built.get(c.novelId);
        if (book) book[c.id] = [Number(c.updatedAt) || 0, Number(c.chapterNumber)];
      });
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(SYNC_STATE_STORE, 'readwrite');
          const store = tx.objectStore(SYNC_STATE_STORE);
          built.forEach((times, novelId) => store.put({ id: novelId, chapters: times }));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {}
      built.forEach((times, novelId) => { chapterTimes[novelId] = times; });
    }
    const books = new Set(base.novels.map((novel) => novel.id));
    Object.keys(chapterTimes).forEach((novelId) => { if (!books.has(novelId)) delete chapterTimes[novelId]; });
    return { ...base, chapterTimes };
  },

  async getChaptersByIds(ids) {
    if (!ids || ids.length === 0) return [];
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readonly');
      const store = tx.objectStore('chapters');
      const found = new Array(ids.length).fill(null);
      ids.forEach((id, i) => {
        const request = store.get(id);
        request.onsuccess = () => { found[i] = request.result || null; };
      });
      tx.oncomplete = () => resolve(found.filter(Boolean));
      tx.onerror = () => reject(tx.error);
    });
  },

  _markDeleted(kind, ids) {
    if (!ids || ids.length === 0) return;
    const deleted = this._readSyncDeleted();
    const now = Date.now();
    ids.forEach((id) => { deleted[kind][id] = now; });
    this._writeSyncDeleted(deleted);
  },

  /**
   * Retrieves a lightweight user preference (synchronously with fallback).
   * Reads from localStorage and works uniformly across Extension, Browser, and Mobile WebView.
   * @param {string} key
   * @param {any} [fallback=null]
   * @returns {string|any}
   */
  getPreference(key, fallback = null) {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(key);
        if (val !== null) return val;
      }
    } catch (e) {}
    return fallback;
  },

  /**
   * Stores a lightweight user preference across localStorage and the platform's local storage area (if any).
   * @param {string} key
   * @param {any} val
   */
  setPreference(key, val) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(val));
      }
      const local = storageArea('local');
      if (local) local.set({ [key]: String(val) });
    } catch (e) {}
  },

  async exportAll() {
    const base = await this._exportBase();
    const db = await openDatabase();
    const chapters = await getAllFromStore(db, 'chapters');
    return { ...base, chapters, deleted: base.deleted };
  },

  async _exportBase() {
    const db = await openDatabase();
    const rawNovels = await getAllFromStore(db, 'novels');

    const listsByNovel = new Map();
    const listTimesByNovel = new Map();
    rawNovels.forEach((record) => {
      if (!record || typeof record.id !== 'string' || !record.owner || !Array.isArray(record.list)) return;
      const sep = record.id.indexOf('::');
      if (sep === -1) return;
      const kind = record.id.slice(0, sep);
      if (!listsByNovel.has(record.owner)) listsByNovel.set(record.owner, {});
      if (!listTimesByNovel.has(record.owner)) listTimesByNovel.set(record.owner, {});
      listsByNovel.get(record.owner)[kind] = record.list;
      listTimesByNovel.get(record.owner)[kind] = Number(record.updatedAt) || 0;
    });
    const novels = rawNovels
      .filter((record) => !isListRecord(record))
      .map((novel) => {
        const lists = listsByNovel.get(novel.id) || {};
        const times = listTimesByNovel.get(novel.id) || {};
        return {
          ...novel,
          nameList: lists.namelist !== undefined ? lists.namelist : (Array.isArray(novel.nameList) ? novel.nameList : []),
          glossaries: { locked: lists.locked || [], soft: lists.soft || [] },
          listsUpdatedAt: { namelist: times.namelist || 0, locked: times.locked || 0, soft: times.soft || 0 }
        };
      });

    const preferences = {};
    const local = storageArea('local');
    if (local) {
      try {
        const stored = await local.get(null);
        Object.keys(stored).forEach((key) => {
          if (key.indexOf('quickconverter_') !== 0) return;
          if (BACKUP_EXCLUDED_KEYS.indexOf(key) !== -1) return;
          preferences[key] = stored[key];
        });
      } catch (e) {}
    }
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key || key.indexOf('quickconverter_') !== 0) continue;
          if (BACKUP_EXCLUDED_KEYS.indexOf(key) !== -1) continue;
          preferences[key] = localStorage.getItem(key);
        }
      }
    } catch (e) {}

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      novels,
      commonLists: await this._readCommonLists(),
      preferences,
      deleted: this._readSyncDeleted()
    };
  },

  async importAll(data, options = {}) {
    if (!data || data.format !== BACKUP_FORMAT || data.version !== BACKUP_VERSION) {
      throw new Error('Unsupported backup format or version');
    }
    const replace = options.replace !== false;
    const novels = Array.isArray(data.novels) ? data.novels : [];
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];

    const novelRecords = [];
    const nameRecords = [];
    novels.forEach((novel) => {
      if (!novel) return;
      const hasNameList = Object.prototype.hasOwnProperty.call(novel, 'nameList');
      const hasGlossaries = novel.glossaries && typeof novel.glossaries === 'object';
      const { listsUpdatedAt, ...withoutTimes } = novel;
      if (!hasNameList && !hasGlossaries) {
        novelRecords.push(withoutTimes);
        return;
      }
      const split = splitNovelLists(novel);
      novelRecords.push(split.record);
      split.lists.forEach((record) => nameRecords.push(record));
    });

    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['novels', 'chapters'], 'readwrite');
      const novelStore = tx.objectStore('novels');
      const chapterStore = tx.objectStore('chapters');
      if (replace) {
        novelStore.clear();
        chapterStore.clear();
      }
      novelRecords.forEach((novel) => novelStore.put(novel));
      nameRecords.forEach((record) => novelStore.put(record));
      chapters.forEach((chapter) => chapterStore.put(chapter));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (Array.isArray(data.commonLists) && hasStore(db, COMMON_STORE)) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(COMMON_STORE, 'readwrite');
        const store = tx.objectStore(COMMON_STORE);
        if (replace) store.clear();
        data.commonLists.filter((l) => l && l.id).forEach((list) => store.put(list));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    const preferences = data.preferences || {};
    Object.keys(preferences).forEach((key) => {
      if (BACKUP_EXCLUDED_KEYS.indexOf(key) !== -1) return;
      const value = preferences[key];
      if (typeof value === 'string') {
        this.setPreference(key, value);
      } else {
        const local = storageArea('local');
        if (local) local.set({ [key]: value });
      }
    });

    await this._clearSyncSummaries();
    await this._setDbInitialized();
    return { novels: novels.length, chapters: chapters.length };
  },

  // Merges this device's library (exportAll) with another copy (e.g. the one in Drive): per book and
  // chapter the newer copy wins, the reading position and each name list follow their own times,
  // deletion markers remove what is older than them, and settings stay as they are here (missing
  // ones are filled in). Returns the merged library and the changes to write on this device.
  mergeLibraries(localData, remoteData) {
    const local = syncLibraryParts(localData);
    const apply = { novels: [], chapters: [], deleteNovels: [], deleteChapters: [], preferences: {}, commonLists: [], deleteCommonLists: [] };
    const libraryOf = (parts) => ({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      novels: parts.novels,
      chapters: parts.chapters,
      commonLists: parts.commonLists,
      preferences: parts.preferences,
      deleted: parts.deleted
    });
    if (!remoteData) return { library: libraryOf(local), apply };
    const remote = syncLibraryParts(remoteData);

    const deleted = { novels: { ...local.deleted.novels }, chapters: { ...local.deleted.chapters }, names: copyNameMarkers(local.deleted.names), common: copyCommonMarkers(local.deleted.common) };
    ['novels', 'chapters'].forEach((kind) => {
      Object.keys(remote.deleted[kind]).forEach((id) => {
        deleted[kind][id] = Math.max(syncTime(deleted[kind][id]), syncTime(remote.deleted[kind][id]));
      });
    });
    mergeNameMarkers(deleted.names, remote.deleted.names);
    mergeCommonMarkers(deleted.common, remote.deleted.common);

    const byId = (list) => new Map(list.map((item) => [item.id, item]));
    const idsOf = (a, b) => Array.from(new Set([...a.map((x) => x.id), ...b.map((x) => x.id)]));

    const localNovels = byId(local.novels);
    const remoteNovels = byId(remote.novels);
    const novels = [];
    idsOf(local.novels, remote.novels).forEach((id) => {
      const mine = localNovels.get(id);
      const theirs = remoteNovels.get(id);
      const merged = mergeBookNames(mine && theirs ? mergeSyncedNovel(mine, theirs) : { ...(mine || theirs) }, mine, theirs, deleted.names);
      const marker = deleted.novels[id];
      if (marker !== undefined && syncTime(marker) >= syncTime(merged.updatedAt)) {
        if (mine) apply.deleteNovels.push(id);
        return;
      }
      if (marker !== undefined) delete deleted.novels[id];
      novels.push(merged);
      if (!mine || stableJson(mine) !== stableJson(merged)) apply.novels.push(merged);
    });

    const localChapters = byId(local.chapters);
    const remoteChapters = byId(remote.chapters);
    const chapters = [];
    idsOf(local.chapters, remote.chapters).forEach((id) => {
      const mine = localChapters.get(id);
      const theirs = remoteChapters.get(id);
      const merged = mine && theirs ? (syncTime(theirs.updatedAt) > syncTime(mine.updatedAt) ? theirs : mine) : (mine || theirs);
      const time = syncTime(merged.updatedAt);
      const bookMarker = deleted.novels[merged.novelId];
      const marker = deleted.chapters[id];
      if ((bookMarker !== undefined && syncTime(bookMarker) >= time) || (marker !== undefined && syncTime(marker) >= time)) {
        if (mine) apply.deleteChapters.push(id);
        return;
      }
      if (marker !== undefined) delete deleted.chapters[id];
      chapters.push(merged);
      if (merged !== mine) apply.chapters.push(merged);
    });

    const preferences = {};
    Object.keys(remote.preferences).forEach((key) => {
      if (BACKUP_EXCLUDED_KEYS.indexOf(key) !== -1) return;
      preferences[key] = remote.preferences[key];
      if (!Object.prototype.hasOwnProperty.call(local.preferences, key)) apply.preferences[key] = remote.preferences[key];
    });
    Object.keys(local.preferences).forEach((key) => {
      if (BACKUP_EXCLUDED_KEYS.indexOf(key) === -1) preferences[key] = local.preferences[key];
    });

    const localCommon = byId(local.commonLists);
    const remoteCommon = byId(remote.commonLists);
    const commonLists = [];
    idsOf(local.commonLists, remote.commonLists).forEach((id) => {
      const mine = localCommon.get(id);
      const theirs = remoteCommon.get(id);
      const entryMarkers = deleted.common.entries[id];
      const result = mergeCommonList(mine, theirs, entryMarkers);
      if (entryMarkers) deleted.common.entries[id] = result.markers;
      const merged = result.list;
      const marker = deleted.common.lists[id];
      if (marker !== undefined && syncTime(marker) >= syncTime(merged.updatedAt)) {
        if (mine) apply.deleteCommonLists.push(id);
        return;
      }
      if (marker !== undefined) delete deleted.common.lists[id];
      commonLists.push(merged);
      if (!mine || stableJson(mine) !== stableJson(merged)) apply.commonLists.push(merged);
    });

    apply.nameMarkers = copyNameMarkers(deleted.names);
    apply.commonMarkers = copyCommonMarkers(deleted.common);
    return { library: libraryOf({ novels, chapters, commonLists, preferences, deleted }), apply };
  },

  // Writes a merge's changes on this device, keeping each record's time so it does not look
  // newly changed, and remembers the merged deletion markers.
  async applySync(apply, deleted, { keepSince = null } = {}) {
    const changes = apply || {};
    const markers = mergeNameMarkers(copyNameMarkers(this._readSyncDeleted().names), copyNameMarkers(changes.nameMarkers));
    if (deleted) mergeNameMarkers(markers, copyNameMarkers(deleted.names));
    const novelRecords = [];
    const listRecords = [];
    (changes.novels || []).forEach((novel) => {
      const split = splitNovelLists(novel);
      novelRecords.push(split.record);
      split.lists.forEach((record) => listRecords.push(record));
    });
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['novels', 'chapters'], 'readwrite');
      const novelStore = tx.objectStore('novels');
      const chapterStore = tx.objectStore('chapters');
      novelRecords.forEach((record) => novelStore.put(record));
      listRecords.forEach((record) => {
        const request = novelStore.get(record.id);
        request.onsuccess = () => {
          const current = request.result && Array.isArray(request.result.list) ? request.result.list : null;
          if (!current) {
            novelStore.put(record);
            return;
          }
          const kindMarkers = (markers[record.owner] || {})[record.kind] || {};
          novelStore.put({ ...record, list: mergeNameEntries(current, record.list, kindMarkers).list });
        };
      });
      (changes.chapters || []).forEach((chapter) => chapterStore.put(chapter));
      (changes.deleteNovels || []).forEach((id) => {
        novelStore.delete(id);
        LIST_KINDS.forEach((kind) => novelStore.delete(`${kind}::${id}`));
      });
      (changes.deleteChapters || []).forEach((id) => chapterStore.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    const putCommon = changes.commonLists || [];
    const dropCommon = changes.deleteCommonLists || [];
    if ((putCommon.length > 0 || dropCommon.length > 0) && hasStore(db, COMMON_STORE)) {
      const commonMarkers = mergeCommonMarkers(copyCommonMarkers(this._readSyncDeleted().common), changes.commonMarkers);
      if (deleted) mergeCommonMarkers(commonMarkers, deleted.common);
      await new Promise((resolve, reject) => {
        const tx = db.transaction(COMMON_STORE, 'readwrite');
        const store = tx.objectStore(COMMON_STORE);
        putCommon.forEach((list) => {
          const request = store.get(list.id);
          request.onsuccess = () => {
            const current = request.result;
            store.put(current ? mergeCommonList(current, list, commonMarkers.entries[list.id]).list : list);
          };
        });
        dropCommon.forEach((id) => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    const preferences = changes.preferences || {};
    Object.keys(preferences).forEach((key) => {
      if (BACKUP_EXCLUDED_KEYS.indexOf(key) !== -1) return;
      const value = preferences[key];
      if (typeof value === 'string') {
        this.setPreference(key, value);
      } else {
        const area = storageArea('local');
        if (area) area.set({ [key]: value });
      }
    });
    await this._updateSyncSummaries({
      put: changes.chapters || [],
      remove: changes.deleteChapters || [],
      dropBooks: changes.deleteNovels || []
    });
    if (deleted) this._writeSyncDeleted(keepSince === null ? deleted : this._keepNewerMarkers(deleted, keepSince));
    await this._setDbInitialized();
  }
};

if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
}
if (typeof self !== 'undefined') {
  self.StorageService = StorageService;
}
if (typeof global !== 'undefined') {
  global.StorageService = StorageService;
}
if (typeof globalThis !== 'undefined') {
  globalThis.StorageService = StorageService;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
}

(function requestPersistentStorageOnce() {
  const platform = storagePlatform();
  const runtime = platform && platform.runtime;
  if (!runtime || typeof runtime.requestPersistentStorage !== 'function') return;
  try {
    Promise.resolve(runtime.requestPersistentStorage()).catch(() => {});
  } catch (e) {}
})();
