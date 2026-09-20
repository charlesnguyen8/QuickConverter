importScripts('storage.js');

function shouldOpenPopup(urlStr) {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    const isDomain = url.hostname === 'wetriedtls.com' || url.hostname === 'www.wetriedtls.com';
    if (!isDomain) return false;

    const isHomepage = url.pathname === '/' || url.pathname === '';
    // Only open popup automatically on homepage or series overview page, not on chapter reading pages
    const isSeriesLanding = url.pathname.startsWith('/series/') && !url.pathname.includes('/chapter');

    return isHomepage || isSeriesLanding;
  } catch (e) {
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && shouldOpenPopup(tab.url)) {
    if (chrome.action && typeof chrome.action.openPopup === 'function') {
      chrome.action.openPopup({ windowId: tab.windowId }, () => {
        if (chrome.runtime.lastError) {
          console.log("Could not open popup automatically:", chrome.runtime.lastError.message);
        }
      });
    }
  }
});

// Helper to format slug to title
function formatSlugToTitle(slug) {
  if (!slug) return 'Unknown Novel';
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\bRegressors\b/i, "Regressor’s")
    .replace(/\bAcademys\b/i, "Academy’s");
}

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
        const { slug, chapterNumber, title, url, rawText, novelTitle } = message;

        let novel = await StorageService.getNovelBySlug(slug);
        if (!novel) {
          console.log(`[QuickConverter] Cannot save chapter for unmanaged novel: ${slug}`);
          return sendResponse({ success: false, error: 'Novel is not managed' });
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
        const { slug, totalChapters, thumbnail, title } = message;
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
});
