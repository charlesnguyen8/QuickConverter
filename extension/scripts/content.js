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

  function reportChapterDone() {
    chrome.runtime.sendMessage({ action: 'PAGE_CHAPTER_DONE' }, () => { void chrome.runtime.lastError; });
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
    const { slug, chapterSlug } = urlInfo;
    let { chapterNumber } = urlInfo;
    const hasNumber = chapterNumber !== null && chapterNumber !== undefined;
    if (!slug || (!hasNumber && !chapterSlug)) return;

    // 1. Check with background if this chapter is already saved or if novel is managed
    chrome.runtime.sendMessage(
      {
        action: 'CHECK_CHAPTER',
        slug,
        chapterNumber: hasNumber ? chapterNumber : undefined,
        chapterSlug
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

        if (!hasNumber) {
          chapterNumber = response.chapterNumber;
          if (chapterNumber === null || chapterNumber === undefined) {
            console.log(`[QuickConverter] Chapter ${chapterSlug} is not in the ${slug} catalog. Skipping chapter save.`);
            return;
          }
        }

        if (response && response.isSaved) {
          console.log(`[QuickConverter] Chapter ${chapterNumber} is already saved in QuickConverterDB.`);
          reportChapterDone();
          return;
        }

        console.log(`[QuickConverter] Chapter ${chapterNumber} is not saved yet. Extracting content via ${provider.name}...`);

        // 2. Wait for content hydration if needed
        let chapterInfo = provider.extractChapterInfo(document, chapterNumber);
        let attempts = 0;
        const maxAttempts = Math.ceil((provider.contentWaitMs || 5000) / 500);

        while ((!chapterInfo || !chapterInfo.rawText) && attempts < maxAttempts) {
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

  const OCR_PANEL_ID = 'qc-ocr-panel';
  const OCR_BUTTON_ID = 'qc-ocr-open-btn';

  function lookupChapter(urlInfo) {
    if (!urlInfo.slug) return Promise.resolve(null);
    const hasNumber = urlInfo.chapterNumber !== null && urlInfo.chapterNumber !== undefined;
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'CHECK_CHAPTER',
          slug: urlInfo.slug,
          chapterNumber: hasNumber ? urlInfo.chapterNumber : undefined,
          chapterSlug: urlInfo.chapterSlug
        },
        (response) => {
          void chrome.runtime.lastError;
          resolve(response || null);
        }
      );
    });
  }

  async function sendChapterImage(provider, frame, extOrigin) {
    try {
      const image = await provider.captureChapterImage(document, window);
      if (!image) {
        frame.contentWindow.postMessage({ type: 'QC_OCR_ERROR', message: 'The chapter image was not found on this page.' }, extOrigin);
        return;
      }
      frame.contentWindow.postMessage(
        { type: 'QC_OCR_IMAGE', bytes: image.bytes, mimeType: image.mimeType, width: image.width, height: image.height },
        extOrigin,
        [image.bytes]
      );
    } catch (err) {
      frame.contentWindow.postMessage({ type: 'QC_OCR_ERROR', message: `Could not read the chapter image (${err.message}).` }, extOrigin);
    }
  }

  function saveTargetOf(check) {
    if (!check || !check.isManaged || check.isSaved || !check.novelId) return null;
    if (check.chapterNumber === null || check.chapterNumber === undefined) return null;
    return { novelId: check.novelId, chapterNumber: check.chapterNumber };
  }

  async function openImageChapterPanel(provider, urlInfo, knownCheck) {
    if (document.getElementById(OCR_PANEL_ID)) return;
    const check = knownCheck !== undefined ? knownCheck : await lookupChapter(urlInfo);
    const novelId = check && check.novelId ? check.novelId : null;
    const target = saveTargetOf(check);
    const params = new URLSearchParams();
    if (novelId) params.set('id', novelId);
    if (target) {
      params.set('save', '1');
      params.set('ch', String(target.chapterNumber));
      params.set('url', window.location.href);
    }
    const query = params.toString();
    const frame = document.createElement('iframe');
    frame.id = OCR_PANEL_ID;
    frame.title = 'QuickConverter image chapter reader';
    frame.src = chrome.runtime.getURL('views/ocr-panel.html') + (query ? `?${query}` : '');
    Object.assign(frame.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: 'min(440px, 100vw)',
      height: '100vh',
      border: '0',
      zIndex: '2147483647',
      background: '#0f172a',
      boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.35)'
    });
    const extOrigin = new URL(frame.src).origin;
    const onMessage = (event) => {
      if (event.source !== frame.contentWindow || event.origin !== extOrigin) return;
      const type = event.data && event.data.type;
      if (type === 'QC_OCR_READY' || type === 'QC_OCR_RETRY') {
        sendChapterImage(provider, frame, extOrigin);
      } else if (type === 'QC_OCR_SAVED') {
        reportChapterDone();
      } else if (type === 'QC_OCR_CLOSE') {
        window.removeEventListener('message', onMessage);
        frame.remove();
      }
    };
    window.addEventListener('message', onMessage);
    document.body.appendChild(frame);
  }

  function mountImageChapterButton(provider, urlInfo) {
    if (document.getElementById(OCR_BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = OCR_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Translate (QuickConverter)';
    Object.assign(button.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483646',
      minHeight: '44px',
      padding: '0 18px',
      borderRadius: '22px',
      border: '0',
      background: '#6366f1',
      color: '#ffffff',
      font: '600 14px system-ui, sans-serif',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
      cursor: 'pointer'
    });
    button.addEventListener('click', () => openImageChapterPanel(provider, urlInfo));
    document.body.appendChild(button);
  }

  async function handleImageChapter(provider, urlInfo) {
    mountImageChapterButton(provider, urlInfo);
    const check = await lookupChapter(urlInfo);
    if (check && check.isManaged && check.isSaved) reportChapterDone();
    if (saveTargetOf(check)) {
      openImageChapterPanel(provider, urlInfo, check);
    }
  }

  function handlePage() {
    const provider = getActiveProvider();
    if (!provider) return;

    let urlInfo = provider.parseUrl(window.location.href);
    if (!urlInfo) return;

    if (urlInfo.type === 'chapter' && !urlInfo.slug && typeof provider.resolveChapterPage === 'function') {
      const resolved = provider.resolveChapterPage(document);
      if (!resolved) return;
      urlInfo = { ...urlInfo, ...resolved };
    }

    if (urlInfo.type === 'chapter' && typeof provider.isImageChapter === 'function' && provider.isImageChapter(document)) {
      handleImageChapter(provider, urlInfo);
    } else if (urlInfo.type === 'chapter') {
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
