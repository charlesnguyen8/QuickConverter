// High-Volume IndexedDB Storage Service for QuickConverter
// Capable of storing full novel chapter texts and translation data without quota limits

const DB_NAME = 'QuickConverterDB';
const DB_VERSION = 1;

const BACKUP_FORMAT = 'quickconverter-backup';
const BACKUP_VERSION = 1;
const NAME_LIST_PREFIX = 'namelist::';
const BACKUP_EXCLUDED_KEYS = [
  'quickconverter_deepseek_key',
  'quickconverter_deepseek_key_storage',
  'quickconverter_custom_api_key'
];

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
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
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
function isListRecord(record) {
  return !!record && typeof record.id === 'string' && record.id.indexOf('::') !== -1 && !!record.owner && Array.isArray(record.list);
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
      return chapters.map((c) => (c && hasChineseText(c.title) ? { ...c, title: converter.convert(c.title) } : c));
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
    const novels = await this.getManagedNovels();
    const record = novels.find((n) => n.id === novelId) || null;
    if (!record) return null;

    const stored = await this._getNameListRecord(novelId);
    if (stored) return { ...record, nameList: stored };

    const legacy = Array.isArray(record.nameList) ? record.nameList : [];
    await this._putNameListRecord(novelId, legacy);
    if (Object.prototype.hasOwnProperty.call(record, 'nameList')) {
      const { nameList, ...rest } = record;
      try { await this._putNovelRecord(rest); } catch (e) {}
    }
    return { ...record, nameList: legacy };
  },

  async isChapterSaved(novelId, chapterNumber) {
    const chapter = await this.getChapter(novelId, chapterNumber);
    return !!(chapter && (chapter.rawText || chapter.convertedText));
  },

  async addNovel(novel) {
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
      createdAt: Date.now()
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
          id: novel.id // preserve id
        };
        store.put(updated);
        tx.oncomplete = () => resolve(updated);
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

    const novels = await this.getManagedNovels();
    const novel = novels.find((n) => n.id === novelId) || null;
    const legacy = novel && Array.isArray(novel.nameList) ? novel.nameList : [];
    await this._putNameListRecord(novelId, legacy, kind);
    if (novel && Object.prototype.hasOwnProperty.call(novel, 'nameList')) {
      const { nameList, ...rest } = novel;
      try { await this._putNovelRecord(rest); } catch (e) {}
    }
    return [...legacy];
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

  _putNameListRecord(novelId, list, kind = 'namelist') {
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('novels', 'readwrite');
      tx.objectStore('novels').put({ id: `${kind}::${novelId}`, owner: novelId, kind, list });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
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
    const list = dedupeNameList(Array.isArray(nameList) ? nameList : []);
    await this._putNameListRecord(novelId, list, kind);
    return list;
  },

  /**
   * Adds a new name entry to the novel's Name List.
   * @param {string} novelId
   * @param {{ original: string, translation: string, chapterFirstSeen?: number|string }} entry
   * @returns {Promise<{id: string, original: string, translation: string, chapterFirstSeen: number|string, addedAt: number}>}
   */
  async addNameEntry(novelId, entry, kind = 'namelist') {
    if (!novelId || !entry) return null;
    const currentList = await this.getNameList(novelId, kind);
    const newEntry = {
      id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      original: (entry.original || '').trim(),
      translation: (entry.translation || '').trim(),
      chapterFirstSeen: entry.chapterFirstSeen !== undefined && entry.chapterFirstSeen !== '' ? entry.chapterFirstSeen : null,
      addedAt: Date.now()
    };
    currentList.unshift(newEntry);
    await this.saveNameList(novelId, currentList, kind);
    return newEntry;
  },

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
    const currentList = await this.getNameList(novelId, kind);
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
    if (added.length === 0) return [];
    await this.saveNameList(novelId, [...added, ...currentList], kind);
    if (kind === 'namelist' && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novel-name-list-updated', {
        detail: { novelId, count: currentList.length + added.length, added: added.length }
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
    const currentList = await this.getNameList(novelId, kind);
    const index = currentList.findIndex(e => e.id === entryId);
    if (index === -1) return null;

    currentList[index] = {
      ...currentList[index],
      original: updates.original !== undefined ? updates.original.trim() : currentList[index].original,
      translation: updates.translation !== undefined ? updates.translation.trim() : currentList[index].translation,
      chapterFirstSeen: updates.chapterFirstSeen !== undefined ? updates.chapterFirstSeen : currentList[index].chapterFirstSeen
    };

    await this.saveNameList(novelId, currentList, kind);
    return currentList[index];
  },

  /**
   * Deletes a name entry from the novel's Name List.
   * @param {string} novelId
   * @param {string} entryId
   * @returns {Promise<boolean>}
   */
  async deleteNameEntry(novelId, entryId, kind = 'namelist') {
    if (!novelId || !entryId) return false;
    const currentList = await this.getNameList(novelId, kind);
    const filtered = currentList.filter(e => e.id !== entryId);
    if (filtered.length === currentList.length) return false;
    await this.saveNameList(novelId, filtered, kind);
    return true;
  },

  /**
   * Moves a term between glossaries (e.g. soft -> locked), skipping an existing
   * entry with the same source name in the destination so nothing is duplicated.
   * @returns {Promise<Object|null>} the destination entry, or null if the source entry is missing
   */
  async moveNameEntry(novelId, entryId, fromKind = 'soft', toKind = 'locked') {
    if (!novelId || !entryId) return null;
    const fromList = await this.getNameList(novelId, fromKind);
    const entry = fromList.find(e => e.id === entryId);
    if (!entry) return null;

    const toList = await this.getNameList(novelId, toKind);
    const key = (entry.original || '').trim().toLowerCase();
    const existing = toList.find(e => (e.original || '').trim().toLowerCase() === key);
    let moved = existing;
    if (!existing) {
      moved = { ...entry, id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), addedAt: Date.now(), isNew: true };
      toList.unshift(moved);
    }
    await this.saveNameList(novelId, toList, toKind);
    await this.saveNameList(novelId, fromList.filter(e => e.id !== entryId), fromKind);
    return moved;
  },

  notifyChapterSaved(novelId, chapterNumber) {
    const platform = storagePlatform();
    if (!platform) return;
    platform.messaging.send({ action: 'CHAPTER_SAVED', novelId, chapterNumber }).catch(() => {});
  },

  openChapterInBackground(url) {
    const platform = storagePlatform();
    if (!url || !platform || !platform.messaging.isNative()) return false;
    const fallback = () => {
      const scope = typeof window !== 'undefined' ? window : null;
      if (scope && typeof scope.open === 'function') scope.open(url, '_blank');
    };
    platform.messaging.send({ action: 'OPEN_TO_SAVE', url })
      .then((response) => { if (!response || !response.ok) fallback(); }, fallback);
    return true;
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

  async syncNovelMetadata(slugOrId) {
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
        if (metadata.title && (!novel.title || novel.title.toLowerCase().includes('unknown'))) {
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

  async syncNovelChapters(slugOrId) {
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
        const fetched = await provider.fetchChapterList(novel.slug, novel.url);
        if (Array.isArray(fetched) && fetched.length > 0) {
          const paidSlugs = new Set((novel.chapterList || []).filter((c) => c && c.locked === true && c.slug).map((c) => String(c.slug)));
          const chapters = fetched.map((c) => (c && c.slug && paidSlugs.has(String(c.slug)) && c.locked !== true ? { ...c, locked: true } : c));
          const updates = {
            chapterList: await this._convertCatalogTitles(novel, chapters)
          };
          if (!novel.totalChapters || chapters.length > novel.totalChapters) {
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      store.put(chapterRecord);
      tx.oncomplete = () => resolve(chapterRecord);
      tx.onerror = () => reject(tx.error);
    });
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
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      store.put(updatedRecord);
      tx.oncomplete = () => resolve(updatedRecord);
      tx.onerror = () => reject(tx.error);
    });
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

    let provider = null;
    if (typeof ProviderRegistry !== 'undefined') {
      if (novel.url) provider = ProviderRegistry.getProviderForUrl(novel.url);
      if (!provider && novel.domain) provider = ProviderRegistry.getProviderForDomain(novel.domain);
    }

    if (!provider || typeof provider.fetchChapterContent !== 'function') {
      throw new Error(`No provider available to fetch chapter content for ${novel.title}`);
    }

    const catalogItem = (novel.chapterList || []).find(
      (c) => Number(c.chapterNumber) === Number(chapterNumber)
    );
    const chapterSlugOrNumber = catalogItem && catalogItem.slug ? catalogItem.slug : chapterNumber;

    if (options && typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'fetching', percent: 5, text: 'Fetching raw chapter...' });
    }

    const content = await provider.fetchChapterContent(novel.slug, chapterSlugOrNumber, { signal: options?.signal });
    if (!content || !content.rawText) {
      throw new Error(`Failed to extract chapter content for Chapter ${chapterNumber}`);
    }

    if (options && options.signal && options.signal.aborted) {
      throw new Error('UserCancelled');
    }

    const chapterTitle = (catalogItem && catalogItem.title) || content.title || `Chapter ${chapterNumber}`;
    const chapterUrl = (catalogItem && catalogItem.url) || `${novel.url}/chapter-${chapterNumber}`;

    let finalText = content.rawText;
    let isTranslated = false;
    let modelUsed = null;
    let translationCost = null;
    let translationUsage = null;
    let reasoningText = null;
    let capturedNames = [];
    let capturedLocked = [];
    let capturedSoft = [];
    let translationDelay = 0;

    // Optional DeepSeek translation pre-download
    if (options && options.translation && options.translation.enabled) {
      if (options && options.signal && options.signal.aborted) {
        throw new Error('UserCancelled');
      }
      const translated = await this._translateRaw(novel, content.rawText, options.translation, options);
      finalText = translated.text;
      capturedNames = translated.names;
      capturedLocked = translated.locked;
      capturedSoft = translated.soft;
      translationDelay = translated.delaySeconds;
      // Discard deepthink reasoning process - do not save to storage
      reasoningText = null;
      isTranslated = true;
      modelUsed = translated.modelUsed;
      translationCost = translated.costInfo;
      translationUsage = translated.usage;
    } else if (options && typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'saving', percent: 80, text: 'Saving raw chapter...' });
    }

    if (options && typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'saving', percent: 99, text: 'Saving chapter...' });
    }

    const saved = await this.saveChapter({
      novelId: novel.id,
      chapterNumber: Number(chapterNumber),
      title: chapterTitle,
      url: chapterUrl,
      rawText: finalText,
      originalRawText: content.rawText,
      reasoningText: null, // Discarded: deepthink reasoning process is not saved
      isTranslated: isTranslated,
      modelUsed: modelUsed,
      translatedAt: isTranslated ? Date.now() : null,
      translationCost: translationCost,
      translationUsage: translationUsage
    });

    await this._addCapturedGlossary(novel.id, Number(chapterNumber), { names: capturedNames, locked: capturedLocked, soft: capturedSoft });

    if (options && typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'completed', percent: 100, text: 'Completed' });
    }

    return { ...saved, translationDelay };
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

    const savedChapter = await this.saveChapter({
      novelId: novel.id,
      chapterNumber,
      title: title || `Chapter ${chapterNumber}`,
      url: url || '',
      rawText: rawText || ''
    });

    this.notifyChapterSaved(novel.id, chapterNumber);

    return {
      success: true,
      isSaved: true,
      chapterId: savedChapter.id,
      novelId: novel.id,
      novelTitle: novel.title
    };
  },

  async saveRecognizedChapter(novelId, chapterNumber, options = {}) {
    const text = typeof options.text === 'string' ? options.text.trim() : '';
    if (!text) {
      throw new Error('No text was recognized in the chapter image. The chapter was not saved.');
    }

    const novel = await this.getNovelById(novelId);
    if (!novel) {
      throw new Error(`Novel not found for ID: ${novelId}`);
    }

    const catalogItem = (novel.chapterList || []).find(
      (c) => Number(c.chapterNumber) === Number(chapterNumber)
    );
    const chapterTitle = (catalogItem && catalogItem.title) || options.title || `Chapter ${chapterNumber}`;
    const chapterUrl = options.url || (catalogItem && catalogItem.url) || '';
    const translation = options.translation;

    let translated = null;
    if (translation && translation.enabled) {
      translated = await this._translateRaw(novel, text, translation, {
        onProgress: options.onProgress,
        onChunk: options.onChunk,
        signal: options.signal,
        ocrSource: true
      });
    }

    if (typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'saving', percent: 99, text: 'Saving chapter...' });
    }

    const saved = await this.saveChapter({
      novelId: novel.id,
      chapterNumber: Number(chapterNumber),
      title: chapterTitle,
      url: chapterUrl,
      rawText: translated ? translated.text : text,
      originalRawText: text,
      reasoningText: null,
      ocrSource: true,
      isTranslated: !!translated,
      modelUsed: translated ? translated.modelUsed : null,
      translatedAt: translated ? Date.now() : null,
      translationCost: translated ? translated.costInfo : null,
      translationUsage: translated ? translated.usage : null
    });

    if (translated) {
      await this._addCapturedGlossary(novel.id, Number(chapterNumber), translated);
    }

    if (catalogItem && catalogItem.locked !== true) {
      try {
        await this.updateNovel(novel.id, {
          chapterList: novel.chapterList.map((c) => (c === catalogItem ? { ...c, locked: true } : c))
        });
      } catch (e) {
        console.warn('[StorageService] Failed to mark the chapter as paid:', e);
      }
    }

    this.notifyChapterSaved(novel.id, Number(chapterNumber));

    if (typeof options.onProgress === 'function') {
      options.onProgress({ phase: 'completed', percent: 100, text: 'Completed' });
    }

    return saved;
  },

  async deleteChapter(novelId, chapterNumber) {
    const chapterId = `${novelId}_ch${chapterNumber}`;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('chapters', 'readwrite');
      const store = tx.objectStore('chapters');
      store.delete(chapterId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
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
    const db = await openDatabase();
    const rawNovels = await getAllFromStore(db, 'novels');
    const chapters = await getAllFromStore(db, 'chapters');

    const listsByNovel = new Map();
    rawNovels.forEach((record) => {
      if (!record || typeof record.id !== 'string' || !record.owner || !Array.isArray(record.list)) return;
      const sep = record.id.indexOf('::');
      if (sep === -1) return;
      const kind = record.id.slice(0, sep);
      if (!listsByNovel.has(record.owner)) listsByNovel.set(record.owner, {});
      listsByNovel.get(record.owner)[kind] = record.list;
    });
    const novels = rawNovels
      .filter((record) => !isListRecord(record))
      .map((novel) => {
        const lists = listsByNovel.get(novel.id) || {};
        return {
          ...novel,
          nameList: lists.namelist !== undefined ? lists.namelist : (Array.isArray(novel.nameList) ? novel.nameList : []),
          glossaries: { locked: lists.locked || [], soft: lists.soft || [] }
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
      chapters,
      preferences
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
      if (!hasNameList && !hasGlossaries) {
        novelRecords.push(novel);
        return;
      }
      const { nameList, glossaries, ...rest } = novel;
      if (hasNameList) {
        nameRecords.push({ id: NAME_LIST_PREFIX + novel.id, owner: novel.id, kind: 'namelist', list: Array.isArray(nameList) ? nameList : [] });
      }
      if (hasGlossaries) {
        ['locked', 'soft'].forEach((kind) => {
          if (Object.prototype.hasOwnProperty.call(glossaries, kind)) {
            nameRecords.push({ id: `${kind}::${novel.id}`, owner: novel.id, kind, list: Array.isArray(glossaries[kind]) ? glossaries[kind] : [] });
          }
        });
      }
      novelRecords.push(rest);
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

    await this._setDbInitialized();
    return { novels: novels.length, chapters: chapters.length };
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
