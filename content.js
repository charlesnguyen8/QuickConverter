// QuickConverter Content Script for wetriedtls.com
// Detects chapter loading, checks IndexedDB storage, saves full chapter texts,
// and gathers series metadata (including real total chapter count) on novel pages.

(() => {
  const CHAPTER_REGEX = /\/series\/([^/]+)\/chapter-([0-9.]+)/i;
  const SERIES_REGEX = /^\/series\/([^/]+)\/?$/i;

  function parseChapterUrl() {
    const match = window.location.pathname.match(CHAPTER_REGEX);
    if (!match) return null;

    return {
      slug: match[1],
      chapterNumber: parseFloat(match[2])
    };
  }

  function parseSeriesUrl() {
    const match = window.location.pathname.match(SERIES_REGEX);
    if (!match) return null;

    return {
      slug: match[1]
    };
  }

  function extractSeriesMetadata() {
    let totalChapters = null;

    // 1. Check DOM elements for 'Total chapters' label
    const allSpansAndDivs = Array.from(document.querySelectorAll('span, div, dt'));
    const totalChapterLabel = allSpansAndDivs.find(
      (el) => el.textContent && el.textContent.trim().toLowerCase() === 'total chapters'
    );

    if (totalChapterLabel) {
      // Next sibling in flex container
      const sibling = totalChapterLabel.nextElementSibling;
      if (sibling && sibling.textContent) {
        const num = parseInt(sibling.textContent.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > 0) {
          totalChapters = num;
        }
      }
    }

    // 2. Fallback regex on HTML content
    if (!totalChapters) {
      const html = document.documentElement.innerHTML;
      const match = html.match(/Total chapters<\/span>\s*<span[^>]*>\s*(\d+)\s*<\/span>/i)
                 || html.match(/Total chapters[\s\S]*?>\s*(\d+)\s*<\//i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0) {
          totalChapters = num;
        }
      }
    }

    // Extract artwork thumbnail
    let thumbnail = null;
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg && ogImg.content) {
      thumbnail = ogImg.content;
    }
    if (!thumbnail) {
      const imgEl = document.querySelector('img[src*="reaperscans.net"], img[src*="/_next/image"]');
      if (imgEl && imgEl.src) {
        thumbnail = imgEl.src;
      }
    }

    // Extract title
    let title = '';
    const h1 = document.querySelector('h1');
    if (h1 && h1.textContent) {
      title = h1.textContent.trim();
    } else {
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle && ogTitle.content) {
        title = ogTitle.content.replace(/\s*-\s*We Tried TLS.*$/i, '').trim();
      }
    }

    return { totalChapters, thumbnail, title };
  }

  async function checkAndSyncSeriesPage() {
    const seriesInfo = parseSeriesUrl();
    if (!seriesInfo) return;

    const { slug } = seriesInfo;

    // Wait a brief moment if Next.js hydration is still underway
    let meta = extractSeriesMetadata();
    let attempts = 0;
    while ((!meta.totalChapters || !meta.title) && attempts < 10) {
      attempts++;
      await new Promise((r) => setTimeout(r, 400));
      meta = extractSeriesMetadata();
    }

    if (meta.totalChapters) {
      console.log(`[QuickConverter] Extracted series metadata for ${slug}: ${meta.totalChapters} chapters`);
      chrome.runtime.sendMessage(
        {
          action: 'UPDATE_NOVEL_METADATA',
          slug,
          totalChapters: meta.totalChapters,
          thumbnail: meta.thumbnail,
          title: meta.title
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            return;
          }
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

  function extractChapterTitle(chapterNumber) {
    // Try to find the h1 chapter header or title tag
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText) {
      return h1.innerText.trim();
    }

    if (document.title) {
      const parts = document.title.split('-');
      if (parts.length >= 2) {
        return parts[1].trim();
      }
    }

    return `Chapter ${chapterNumber}`;
  }

  function extractNovelTitle() {
    const h2 = document.querySelector('h2');
    if (h2 && h2.innerText) {
      return h2.innerText.trim();
    }

    if (document.title) {
      const parts = document.title.split('-');
      if (parts.length > 0) {
        return parts[0].trim();
      }
    }

    return '';
  }

  function extractChapterContent() {
    // In wetriedtls.com, chapter paragraphs have dir="auto"
    const pElements = Array.from(document.querySelectorAll('p[dir="auto"]'));
    if (pElements.length > 0) {
      const text = pElements
        .map((p) => p.innerText.trim())
        .filter((t) => t.length > 0 && t !== '&nbsp;')
        .join('\n\n');

      if (text.length > 20) {
        return text;
      }
    }

    // Fallback: search within main reader container
    const main = document.querySelector('main');
    if (main) {
      const paragraphs = Array.from(main.querySelectorAll('p'));
      if (paragraphs.length > 3) {
        return paragraphs
          .map((p) => p.innerText.trim())
          .filter(Boolean)
          .join('\n\n');
      }
    }

    return null;
  }

  async function checkAndSaveChapter() {
    const urlInfo = parseChapterUrl();
    if (!urlInfo) return;

    const { slug, chapterNumber } = urlInfo;

    // 1. Check with background if this chapter is already saved
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

        console.log(`[QuickConverter] Chapter ${chapterNumber} is not saved yet. Extracting content...`);

        // 2. Wait for content to hydrate if needed
        let rawText = extractChapterContent();
        let attempts = 0;

        while (!rawText && attempts < 10) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 500));
          rawText = extractChapterContent();
        }

        if (!rawText) {
          console.warn('[QuickConverter] Could not find chapter content in DOM after waiting.');
          return;
        }

        const chapterTitle = extractChapterTitle(chapterNumber);
        const novelTitle = extractNovelTitle();

        // 3. Send full chapter text to background service worker to persist in IndexedDB
        chrome.runtime.sendMessage(
          {
            action: 'SAVE_CHAPTER',
            slug,
            chapterNumber,
            title: chapterTitle,
            novelTitle,
            url: window.location.href,
            rawText
          },
          (saveResponse) => {
            if (chrome.runtime.lastError) {
              console.error('[QuickConverter] Error saving chapter:', chrome.runtime.lastError.message);
              return;
            }

            if (saveResponse && saveResponse.success) {
              console.log(
                `%c[QuickConverter] Successfully saved ${saveResponse.novelTitle} - ${chapterTitle} (${rawText.length} characters) to IndexedDB!`,
                'color: #34d399; font-weight: bold;'
              );
            }
          }
        );
      }
    );
  }

  function handlePage() {
    if (parseChapterUrl()) {
      checkAndSaveChapter();
    } else if (parseSeriesUrl()) {
      checkAndSyncSeriesPage();
    }
  }

  // Run on initial load
  handlePage();

  // Also listen for single-page application (SPA) URL changes in Next.js
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      handlePage();
    }
  });

  observer.observe(document, { subtree: true, childList: true });
})();
