// QuickConverter Background Service Worker
// Coordinates tab listeners, automated popup triggering via providers, and IndexedDB message bus.

importScripts('../providers/wetriedtls.js', '../providers/nkwwlkj.js', '../providers/sangtacviet.js', '../providers/registry.js', '../services/platform.js', '../services/custom-api.js', '../services/deepseek.js', '../services/ai-service.js', '../services/name-matcher.js', '../services/longest-matcher.js', '../services/qt-numbers.js', '../services/luat-nhan.js', '../services/text-processors.js', '../services/han-viet.js', '../services/qt-dictionaries.js', '../services/storage.js', '../services/download-queue.js', '../services/open-to-save.js', '../services/page-session.js', '../services/tab-page-source.js', '../services/offscreen-ocr.js');

const OPEN_TO_SAVE_KEY = 'qcOpenToSaveTabs';
const openToSave = OpenToSave.createTracker({
  pageFor: (url) => `${chrome.runtime.getURL('views/open-to-save.html')}?url=${encodeURIComponent(url)}`,
  tabs: {
    create: (props) => chrome.tabs.create(props),
    remove: (tabId) => chrome.tabs.remove(tabId)
  },
  store: {
    get: async () => {
      if (!chrome.storage || !chrome.storage.session) return [];
      const saved = await chrome.storage.session.get(OPEN_TO_SAVE_KEY);
      return (saved && saved[OPEN_TO_SAVE_KEY]) || [];
    },
    set: async (ids) => {
      if (chrome.storage && chrome.storage.session) await chrome.storage.session.set({ [OPEN_TO_SAVE_KEY]: ids });
    }
  }
});

// Downloads of page sites open the chapter in a background tab (the content script reports the
// page back); image chapters are read with OCR in an offscreen page.
const tabPageSource = TabPageSource.create({
  pageFor: (url) => `${chrome.runtime.getURL('views/open-to-save.html')}?url=${encodeURIComponent(url)}`,
  tabs: {
    create: (props) => chrome.tabs.create(props),
    remove: (tabId) => chrome.tabs.remove(tabId),
    activate: async (tabId) => {
      const tab = await chrome.tabs.update(tabId, { active: true });
      if (tab && chrome.windows && typeof chrome.windows.update === 'function') {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    }
  }
});

const offscreenOcr = OffscreenOcr.create({
  ensureDocument: async () => {
    if (chrome.offscreen && typeof chrome.offscreen.hasDocument === 'function' && await chrome.offscreen.hasDocument()) return;
    try {
      await chrome.offscreen.createDocument({
        url: 'views/ocr-offscreen.html',
        reasons: ['BLOBS'],
        justification: 'Read image chapters with OCR while downloading them.'
      });
    } catch (e) {
      if (!/single offscreen|already/i.test(e && e.message ? e.message : '')) throw e;
    }
  },
  send: (message) => chrome.runtime.sendMessage(message)
});

Platform.provide({ pageSource: tabPageSource, ocr: offscreenOcr });

chrome.tabs.onRemoved.addListener((tabId) => {
  openToSave.forget(tabId);
  tabPageSource.onTabRemoved(tabId);
});

function shouldOpenPopup(urlStr) {
  if (!urlStr) return false;
  try {
    if (typeof ProviderRegistry !== 'undefined') {
      const provider = ProviderRegistry.getProviderForUrl(urlStr);
      if (provider && typeof provider.shouldAutoOpenPopup === 'function') {
        return provider.shouldAutoOpenPopup(urlStr);
      }
    }
    return false;
  } catch (e) {
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && shouldOpenPopup(tab.url)) {
    if (chrome.action && typeof chrome.action.openPopup === 'function') {
      chrome.action.openPopup({ windowId: tab.windowId }, () => {
        if (chrome.runtime.lastError) {
          console.log('Could not open popup automatically:', chrome.runtime.lastError.message);
        }
      });
    }
  }
});

// Runtime message listener for content script requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'PAGE_SOURCE_QUERY') {
    sendResponse(sender.tab ? tabPageSource.sessionFor(sender.tab.id) : null);
    return false;
  }

  if (message.action === 'PAGE_SOURCE_RESULT') {
    if (sender.tab) tabPageSource.onTabMessage(sender.tab.id, message.message);
    return false;
  }

  if (message.action === 'CHECK_CHAPTER') {
    (async () => {
      try {
        const { slug, chapterSlug } = message;
        let { chapterNumber } = message;
        let novel = await StorageService.getNovelBySlug(slug);

        if (!novel) {
          return sendResponse({ isManaged: false, isSaved: false });
        }

        if ((chapterNumber === null || chapterNumber === undefined) && chapterSlug) {
          chapterNumber = StorageService.getCatalogChapterNumber(novel, chapterSlug);
          if (chapterNumber === null) {
            novel = (await StorageService.syncNovelChapters(novel.id)) || novel;
            chapterNumber = StorageService.getCatalogChapterNumber(novel, chapterSlug);
          }
          if (chapterNumber === null) {
            return sendResponse({ isManaged: true, isSaved: false, novelId: novel.id, chapterNumber: null });
          }
        }

        const isSaved = await StorageService.isChapterSaved(novel.id, chapterNumber);
        const chapter = isSaved ? await StorageService.getChapter(novel.id, chapterNumber) : null;

        sendResponse({
          isManaged: true,
          isSaved,
          chapterNumber,
          novelId: novel.id,
          novelTitle: novel.title,
          chapterTitle: chapter ? chapter.title : null
        });
      } catch (err) {
        console.error('Error checking chapter:', err);
        sendResponse({ error: err.message, isSaved: false });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'SAVE_CHAPTER') {
    (async () => {
      try {
        const { slug, chapterNumber, title, url, rawText, domain } = message;

        const result = await StorageService.saveOpenedChapter({
          slug,
          chapterNumber,
          title,
          url: url || (sender.tab && sender.tab.url) || '',
          rawText,
          domain
        });

        if (result.success) {
          console.log(`[QuickConverter] Saved Chapter ${chapterNumber} for ${result.novelTitle} (${(rawText || '').length} chars)`);
          if (sender.tab) openToSave.done(sender.tab.id);
        } else {
          console.log(`[QuickConverter] Cannot save chapter for unmanaged novel: ${slug}`);
        }

        sendResponse(result);
      } catch (err) {
        console.error('Error saving chapter:', err);
        sendResponse({ error: err.message, success: false });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'OPEN_TO_SAVE') {
    openToSave.open(message.url)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.action === 'PAGE_CHAPTER_DONE') {
    if (sender.tab) openToSave.done(sender.tab.id);
    return false;
  }

  if (message.action === 'UPDATE_NOVEL_METADATA') {
    (async () => {
      try {
        const { slug, totalChapters, thumbnail, title, domain } = message;
        if (!slug) {
          return sendResponse({ success: false, error: 'Slug is required' });
        }

        let novel = await StorageService.getNovelBySlug(slug);
        const updates = {};
        if (totalChapters && Number(totalChapters) > 0) {
          updates.totalChapters = Number(totalChapters);
        }
        if (thumbnail) {
          updates.thumbnail = thumbnail;
        }
        if (title) {
          updates.title = title;
        }
        if (domain && (!novel || !novel.domain)) {
          updates.domain = domain;
        }

        if (novel) {
          const updated = await StorageService.updateNovel(novel.id, updates);
          console.log(`[QuickConverter] Updated metadata for ${novel.title}:`, updates);
          sendResponse({ success: true, novel: updated });
        } else {
          sendResponse({ success: false, message: 'Novel not managed yet' });
        }
      } catch (err) {
        console.error('Error updating novel metadata:', err);
        sendResponse({ error: err.message, success: false });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'SYNC_NOVEL_METADATA') {
    (async () => {
      try {
        const { slug } = message;
        const updated = await StorageService.syncNovelMetadata(slug);
        sendResponse({ success: !!updated, novel: updated });
      } catch (err) {
        console.error('Error syncing novel metadata:', err);
        sendResponse({ error: err.message, success: false });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'SYNC_NOVEL_CHAPTERS') {
    (async () => {
      try {
        const { novelId, slug } = message;
        const updated = await StorageService.syncNovelChapters(novelId || slug);
        sendResponse({ success: !!updated, novel: updated });
      } catch (err) {
        console.error('Error syncing novel chapters:', err);
        sendResponse({ error: err.message, success: false });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'DOWNLOAD_CHAPTER') {
    (async () => {
      try {
        const { novelId, chapterNumber, options, translation } = message;
        const opt = options || (translation ? { translation } : {});
        const chapter = await StorageService.downloadChapter(novelId, chapterNumber, opt);
        sendResponse({ success: true, chapter });
      } catch (err) {
        console.error(`Error downloading chapter ${message.chapterNumber}:`, err);
        sendResponse({ error: err.message, success: false });
      }
    })();
    return true; // Keep channel open for async response
  }

  if (message.action === 'QUEUE_ENQUEUE') {
    (async () => {
      try {
        if (typeof DownloadQueueService !== 'undefined') {
          const res = await DownloadQueueService.enqueue(message.task || message);
          sendResponse({ ...res, state: DownloadQueueService.getState() });
        } else {
          sendResponse({ success: false, error: 'DownloadQueueService not loaded' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'QUEUE_ENQUEUE_BATCH') {
    (async () => {
      try {
        if (typeof DownloadQueueService !== 'undefined') {
          const res = await DownloadQueueService.enqueueBatch(message.tasks || []);
          sendResponse({ ...res, state: DownloadQueueService.getState() });
        } else {
          sendResponse({ success: false, error: 'DownloadQueueService not loaded' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'QUEUE_REMOVE') {
    (async () => {
      try {
        if (typeof DownloadQueueService !== 'undefined') {
          const res = await DownloadQueueService.remove(message.taskId);
          sendResponse({ success: res, state: DownloadQueueService.getState() });
        } else {
          sendResponse({ success: false });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'QUEUE_PAUSE') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.pause();
      sendResponse({ success: true, isPaused: true, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.action === 'QUEUE_RESUME') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.resume();
      sendResponse({ success: true, isPaused: false, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.action === 'QUEUE_CLEAR_ALL') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.clearAll();
      sendResponse({ success: true, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.action === 'QUEUE_GET_STATE') {
    if (typeof DownloadQueueService !== 'undefined') {
      sendResponse(DownloadQueueService.getState());
    } else {
      sendResponse({ activeTask: null, queue: [], isPaused: false, isProcessing: false, cooldown: null });
    }
    return false;
  }

  if (message.action === 'QUEUE_SKIP_COOLDOWN') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.skipCooldown();
      sendResponse({ success: true, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.action === 'QUEUE_RETRY_NOW') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.retryNow();
      sendResponse({ success: true, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.action === 'QUEUE_SKIP_FAILED_CHAPTER') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.skipFailedChapter();
      sendResponse({ success: true, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }

  if (message.action === 'QUEUE_SET_COOLDOWN_CONFIG') {
    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.setCooldownConfig(message.config);
      sendResponse({ success: true, state: DownloadQueueService.getState() });
    } else {
      sendResponse({ success: false });
    }
    return false;
  }
});

// Chrome alarms listener to wake up MV3 background service worker when cooldown or retry alarm fires
if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === 'QUEUE_COOLDOWN_ALARM') {
      if (typeof DownloadQueueService !== 'undefined') {
        DownloadQueueService.skipCooldown();
      }
    }
  });
}

