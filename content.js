// QuickConverter Universal Content Script
// Detects novel pages via the Provider Registry, delegates DOM extraction
// to the appropriate site adapter, and communicates with the background service worker.

(() => {
  function getActiveProvider() {
    if (typeof ProviderRegistry === 'undefined') {
      console.warn('[QuickConverter] ProviderRegistry is not loaded.');
      return null;
    }
    return ProviderRegistry.getProviderForUrl(window.location.href);
  }

  async function checkAndSyncSeriesPage(provider, urlInfo) {
    const { slug } = urlInfo;
    if (!slug) return;

    let meta = provider.extractSeriesMetadata(document);
    let attempts = 0;
    while ((!meta || !meta.totalChapters || !meta.title) && attempts < 10) {
      attempts++;
      await new Promise((r) => setTimeout(r, 400));
      meta = provider.extractSeriesMetadata(document);
    }

    if (meta && meta.totalChapters) {
      console.log(`[QuickConverter] Extracted series metadata for ${slug}: ${meta.totalChapters} chapters`);
      chrome.runtime.sendMessage(
        {
          action: 'UPDATE_NOVEL_METADATA',
          slug,
          totalChapters: meta.totalChapters,
          thumbnail: meta.thumbnail,
          title: meta.title,
          domain: provider.domains ? provider.domains[0] : undefined
        },
        (resp) => {
          if (chrome.runtime.lastError) return;
          if (resp && resp.success) {
            console.log(
              `%c[QuickConverter] Successfully synced ${slug} metadata: ${meta.totalChapters} total chapters!`,
              'color: #34d399; font-weight: bold;'
            );
          }
        }
      );
    }
  }

  async function checkAndSaveChapter(provider, urlInfo) {
    const { slug, chapterNumber } = urlInfo;
    if (!slug || chapterNumber === null || chapterNumber === undefined) return;

    // 1. Check with background if this chapter is already saved or if novel is managed
    chrome.runtime.sendMessage(
      {
        action: 'CHECK_CHAPTER',
        slug,
        chapterNumber
      },
      async (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[QuickConverter] Communication error:', chrome.runtime.lastError.message);
          return;
        }

        if (!response || !response.isManaged) {
          console.log(`[QuickConverter] Novel ${slug} is not currently managed. Skipping chapter save.`);
          return;
        }

        if (response && response.isSaved) {
          console.log(`[QuickConverter] Chapter ${chapterNumber} is already saved in QuickConverterDB.`);
          return;
        }

        console.log(`[QuickConverter] Chapter ${chapterNumber} is not saved yet. Extracting content via ${provider.name}...`);

        // 2. Wait for content hydration if needed
        let chapterInfo = provider.extractChapterInfo(document, chapterNumber);
        let attempts = 0;

        while ((!chapterInfo || !chapterInfo.rawText) && attempts < 10) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 500));
          chapterInfo = provider.extractChapterInfo(document, chapterNumber);
        }

        if (!chapterInfo || !chapterInfo.rawText) {
          console.warn('[QuickConverter] Could not find chapter content in DOM after waiting.');
          return;
        }

        // 3. Persist to IndexedDB via background
        chrome.runtime.sendMessage(
          {
            action: 'SAVE_CHAPTER',
            slug,
            chapterNumber,
            title: chapterInfo.title,
            novelTitle: chapterInfo.novelTitle,
            url: window.location.href,
            rawText: chapterInfo.rawText,
            domain: provider.domains ? provider.domains[0] : undefined
          },
          (saveResponse) => {
            if (chrome.runtime.lastError) {
              console.error('[QuickConverter] Error saving chapter:', chrome.runtime.lastError.message);
              return;
            }

            if (saveResponse && saveResponse.success) {
              console.log(
                `%c[QuickConverter] Successfully saved ${saveResponse.novelTitle || slug} - ${chapterInfo.title} (${chapterInfo.rawText.length} chars) to IndexedDB!`,
                'color: #34d399; font-weight: bold;'
              );
            }
          }
        );
      }
    );
  }

  function handlePage() {
    const provider = getActiveProvider();
    if (!provider) return;

    const urlInfo = provider.parseUrl(window.location.href);
    if (!urlInfo) return;

    if (urlInfo.type === 'chapter') {
      checkAndSaveChapter(provider, urlInfo);
    } else if (urlInfo.type === 'series') {
      checkAndSyncSeriesPage(provider, urlInfo);
    }
  }

  // Initial execution
  handlePage();

  // SPA Navigation listener (URL changes via history/pushState in Next.js/React/Vue)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handlePage();
    }
  });

  observer.observe(document, { subtree: true, childList: true });
})();
