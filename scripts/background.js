// QuickConverter Background Service Worker
// Coordinates tab listeners, automated popup triggering via providers, and IndexedDB message bus.

importScripts('../providers/wetriedtls.js', '../providers/registry.js', '../services/deepseek.js', '../services/storage.js');

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
  if (message.action === 'CHECK_CHAPTER') {
    (async () => {
      try {
        const { slug, chapterNumber } = message;
        const novel = await StorageService.getNovelBySlug(slug);

        if (!novel) {
          return sendResponse({ isManaged: false, isSaved: false });
        }

        const isSaved = await StorageService.isChapterSaved(novel.id, chapterNumber);
        const chapter = isSaved ? await StorageService.getChapter(novel.id, chapterNumber) : null;

        sendResponse({
          isManaged: true,
          isSaved,
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
        const { slug, chapterNumber, title, url, rawText, novelTitle, domain } = message;

        let novel = await StorageService.getNovelBySlug(slug);
        if (!novel) {
          console.log(`[QuickConverter] Cannot save chapter for unmanaged novel: ${slug}`);
          return sendResponse({ success: false, error: 'Novel is not managed' });
        }

        if (domain && !novel.domain) {
          await StorageService.updateNovel(novel.id, { domain });
        }

        const savedChapter = await StorageService.saveChapter({
          novelId: novel.id,
          chapterNumber,
          title: title || `Chapter ${chapterNumber}`,
          url: url || (sender.tab && sender.tab.url) || '',
          rawText: rawText || ''
        });

        console.log(`[QuickConverter] Saved Chapter ${chapterNumber} for ${novel.title} (${(rawText || '').length} chars)`);

        sendResponse({
          success: true,
          isSaved: true,
          chapterId: savedChapter.id,
          novelId: novel.id,
          novelTitle: novel.title
        });
      } catch (err) {
        console.error('Error saving chapter:', err);
        sendResponse({ error: err.message, success: false });
      }
    })();
    return true; // Keep channel open for async response
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
});
