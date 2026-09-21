// High-Volume IndexedDB Storage Service for QuickConverter
// Capable of storing full novel chapter texts and translation data without quota limits

const DB_NAME = 'QuickConverterDB';
const DB_VERSION = 1;

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

const StorageService = {
  async _isDbInitialized() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(['quickconverter_db_initialized'], (r) => {
          resolve(!!(r && r.quickconverter_db_initialized));
        });
      });
    }
    if (typeof localStorage !== 'undefined') {
      return !!localStorage.getItem('quickconverter_db_initialized');
    }
    return false;
  },

  async _setDbInitialized() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ quickconverter_db_initialized: true });
    }
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
        let novels = request.result || [];

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
            thumbnail: novel.thumbnail || (defaultRef ? defaultRef.thumbnail : 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp'),
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
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      previous = await new Promise((res) => {
        chrome.storage.local.get(['quickconverter_managed_novels'], (r) => {
          res(r && r.quickconverter_managed_novels);
        });
      });
    }

    const seeds = (Array.isArray(previous) && previous.length > 0)
      ? previous.map((p) => {
          const match = INITIAL_NOVELS.find((init) => init.slug === p.slug);
          return {
            ...p,
            thumbnail: p.thumbnail || (match ? match.thumbnail : 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp'),
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
    return novels.find((n) => n.id === novelId) || null;
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
      thumbnail: novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp',
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
          ...updates,
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
        const chapters = await provider.fetchChapterList(novel.slug, novel.url);
        if (Array.isArray(chapters) && chapters.length > 0) {
          const updates = {
            chapterList: chapters
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
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['quickconverter_managed_novels'], (r) => {
        if (r && Array.isArray(r.quickconverter_managed_novels)) {
          const remaining = r.quickconverter_managed_novels.filter(
            (n) => !targetIds.has(n.id) && !targetSlugs.has(n.slug)
          );
          chrome.storage.local.set({ quickconverter_managed_novels: remaining });
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
    const chapterRecord = {
      ...rest,
      id: chapterId,
      novelId,
      chapterNumber: Number(chapterNumber),
      title: title || `Chapter ${chapterNumber}`,
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

  async downloadChapter(novelId, chapterNumber, options = {}) {
    if (!novelId || chapterNumber === undefined) {
      throw new Error('novelId and chapterNumber are required to download a chapter');
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

    const content = await provider.fetchChapterContent(novel.slug, chapterSlugOrNumber);
    if (!content || !content.rawText) {
      throw new Error(`Failed to extract chapter content for Chapter ${chapterNumber}`);
    }

    const chapterTitle = (catalogItem && catalogItem.title) || content.title || `Chapter ${chapterNumber}`;
    const chapterUrl = (catalogItem && catalogItem.url) || `${novel.url}/chapter-${chapterNumber}`;

    let finalText = content.rawText;
    let isTranslated = false;
    let modelUsed = null;
    let translationCost = null;
    let translationUsage = null;
    let reasoningText = null;

    // Optional DeepSeek translation pre-download
    if (options && options.translation && options.translation.enabled) {
      let { apiKey, prompt, model, provider, baseUrl } = options.translation;
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

      const effectivePrompt = prompt || novel.translationPrompt ||
        'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

      // Estimate expected translated character count (CJK: ~2.8x, Latin: ~1.1x)
      const rawLen = content.rawText ? content.rawText.length : 1000;
      const isCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f\uac00-\ud7af]/.test(content.rawText || '');
      const expansionRatio = isCJK ? 2.8 : 1.1;
      const expectedChars = Math.max(100, Math.round(rawLen * expansionRatio));

      const result = await client.translateChapter({
        apiKey: cleanKey,
        prompt: effectivePrompt,
        rawText: content.rawText,
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

      finalText = result.translatedText;
      // Discard deepthink reasoning process - do not save to storage
      reasoningText = null;
      isTranslated = true;
      modelUsed = result.modelUsed;
      translationCost = result.costInfo || null;
      translationUsage = result.usage || null;
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

    if (options && typeof options.onProgress === 'function') {
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
   * Stores a lightweight user preference across localStorage and chrome.storage.local (if available).
   * @param {string} key
   * @param {any} val
   */
  setPreference(key, val) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(val));
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: String(val) });
      }
    } catch (e) {}
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
