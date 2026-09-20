// QuickConverter Chapter Reader Controller
// Renders clean distraction-free reading typography, font resizing, scroll progress, and adjacent chapter navigation.

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const novelId = urlParams.get('id');
  const chapterNumber = parseFloat(urlParams.get('ch'));

  // Header Elements
  const progressBar = document.getElementById('reading-progress-bar');
  const backToNovelBtn = document.getElementById('back-to-novel-btn');
  const headerNovelTitle = document.getElementById('header-novel-title');
  const headerChapterTitle = document.getElementById('header-chapter-title');
  const fontDecBtn = document.getElementById('font-dec-btn');
  const fontIncBtn = document.getElementById('font-inc-btn');
  const fontSizeLabel = document.getElementById('font-size-label');

  // Article / Reader Elements
  const readerLoading = document.getElementById('reader-loading');
  const readerNotSaved = document.getElementById('reader-not-saved');
  const readerContentView = document.getElementById('reader-content-view');
  const readerDownloadBtn = document.getElementById('reader-download-btn');

  const novelBadge = document.getElementById('novel-badge');
  const chapterBadge = document.getElementById('chapter-badge');
  const chapterMainTitle = document.getElementById('chapter-main-title');
  const chapterCharCount = document.getElementById('chapter-char-count');
  const chapterReadingTime = document.getElementById('chapter-reading-time');
  const chapterBody = document.getElementById('chapter-body');

  // Bottom Navigation
  const prevChapterBtn = document.getElementById('prev-chapter-btn');
  const nextChapterBtn = document.getElementById('next-chapter-btn');
  const bottomNovelBtn = document.getElementById('bottom-novel-btn');

  if (!novelId || isNaN(chapterNumber) || !window.StorageService) {
    if (readerLoading) readerLoading.innerHTML = '<p class="text-red-400">Invalid novel or chapter specified.</p>';
    return;
  }

  // --- Font Size Adjustment State ---
  const FONT_KEY = 'quickconverter_reader_font_size';
  let currentFontSize = parseInt(localStorage.getItem(FONT_KEY), 10) || 18;

  function applyFontSize(size) {
    currentFontSize = Math.min(26, Math.max(14, size));
    localStorage.setItem(FONT_KEY, currentFontSize);
    if (chapterBody) {
      chapterBody.style.fontSize = `${currentFontSize}px`;
    }
    if (fontSizeLabel) {
      fontSizeLabel.textContent = `${currentFontSize}px`;
    }
  }

  applyFontSize(currentFontSize);

  if (fontDecBtn) {
    fontDecBtn.addEventListener('click', () => {
      applyFontSize(currentFontSize - 2);
    });
  }

  if (fontIncBtn) {
    fontIncBtn.addEventListener('click', () => {
      applyFontSize(currentFontSize + 2);
    });
  }

  // --- Scroll Reading Progress ---
  window.addEventListener(
    'scroll',
    () => {
      if (!progressBar) return;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollHeight > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollHeight) * 100)) : 0;
      progressBar.style.width = `${progress}%`;
    },
    { passive: true }
  );

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // --- Load Novel and Chapter Data ---
  try {
    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) {
      if (readerLoading) readerLoading.innerHTML = '<p class="text-red-400">Novel not found in your library.</p>';
      return;
    }

    // Set page title & Header Back Links
    document.title = `${novel.title} - Ch. ${chapterNumber}`;
    const novelUrl = `novel.html?id=${encodeURIComponent(novel.id)}`;
    if (backToNovelBtn) backToNovelBtn.href = novelUrl;
    if (bottomNovelBtn) bottomNovelBtn.href = novelUrl;
    if (headerNovelTitle) headerNovelTitle.textContent = novel.title;
    if (novelBadge) novelBadge.textContent = novel.title;

    // Resolve chapter title from catalog if possible
    const catalogItem = (novel.chapterList || []).find((c) => Number(c.chapterNumber) === chapterNumber);
    const fallbackTitle = catalogItem ? catalogItem.title : `Chapter ${chapterNumber}`;

    if (headerChapterTitle) headerChapterTitle.textContent = fallbackTitle;
    if (chapterMainTitle) chapterMainTitle.textContent = fallbackTitle;
    if (chapterBadge) chapterBadge.textContent = `Ch. ${chapterNumber}`;

    // --- Configure Adjacent Chapter Navigation ---
    const catalog = (novel.chapterList || []).slice().sort((a, b) => a.chapterNumber - b.chapterNumber);
    const currentIndex = catalog.findIndex((c) => Number(c.chapterNumber) === chapterNumber);

    let prevCh = null;
    let nextCh = null;

    if (currentIndex > 0) {
      prevCh = catalog[currentIndex - 1].chapterNumber;
    } else if (chapterNumber > 1) {
      prevCh = chapterNumber - 1;
    }

    if (currentIndex >= 0 && currentIndex < catalog.length - 1) {
      nextCh = catalog[currentIndex + 1].chapterNumber;
    } else if (currentIndex < 0 && (!novel.totalChapters || chapterNumber < novel.totalChapters)) {
      nextCh = chapterNumber + 1;
    }

    if (prevChapterBtn) {
      if (prevCh !== null) {
        prevChapterBtn.disabled = false;
        prevChapterBtn.addEventListener('click', () => {
          window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(prevCh)}`;
        });
      } else {
        prevChapterBtn.disabled = true;
      }
    }

    if (nextChapterBtn) {
      if (nextCh !== null) {
        nextChapterBtn.disabled = false;
        nextChapterBtn.addEventListener('click', () => {
          window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(nextCh)}`;
        });
      } else {
        nextChapterBtn.disabled = true;
      }
    }

    // Keyboard Shortcuts (ArrowLeft / ArrowRight)
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if ((e.key === 'ArrowLeft' || e.key === '[') && prevCh !== null) {
        window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(prevCh)}`;
      } else if ((e.key === 'ArrowRight' || e.key === ']') && nextCh !== null) {
        window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(nextCh)}`;
      }
    });

    // --- Load Chapter Content ---
    async function loadChapterContent() {
      const chapter = await window.StorageService.getChapter(novel.id, chapterNumber);

      if (chapter && (chapter.rawText || chapter.convertedText)) {
        const text = chapter.convertedText || chapter.rawText;
        const paragraphs = text
          .split('\n\n')
          .map((p) => p.trim())
          .filter((p) => p.length > 0 && p !== '&nbsp;');

        if (chapterBody) {
          chapterBody.innerHTML = paragraphs.map((p) => `<p class="leading-relaxed">${escapeHtml(p)}</p>`).join('');
        }

        const charCount = text.length;
        if (chapterCharCount) chapterCharCount.textContent = `${charCount.toLocaleString()} characters`;
        if (chapterReadingTime) {
          const words = text.split(/\s+/).length;
          const mins = Math.max(1, Math.round(words / 220));
          chapterReadingTime.textContent = `~${mins} min read`;
        }

        if (chapter.title) {
          if (headerChapterTitle) headerChapterTitle.textContent = chapter.title;
          if (chapterMainTitle) chapterMainTitle.textContent = chapter.title;
        }

        if (readerLoading) readerLoading.classList.add('hidden');
        if (readerNotSaved) readerNotSaved.classList.add('hidden');
        if (readerContentView) readerContentView.classList.remove('hidden');
      } else {
        // Not saved yet
        if (readerLoading) readerLoading.classList.add('hidden');
        if (readerContentView) readerContentView.classList.add('hidden');
        if (readerNotSaved) readerNotSaved.classList.remove('hidden');

        if (readerDownloadBtn) {
          readerDownloadBtn.onclick = async () => {
            readerDownloadBtn.disabled = true;
            readerDownloadBtn.innerHTML = `
              <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Downloading Chapter...</span>
            `;

            try {
              await window.StorageService.downloadChapter(novel.id, chapterNumber);
              await loadChapterContent();
            } catch (err) {
              console.error('Download failed:', err);
              readerDownloadBtn.disabled = false;
              readerDownloadBtn.innerHTML = '<span>Failed. Click to Retry</span>';
            }
          };
        }
      }
    }

    await loadChapterContent();
  } catch (err) {
    console.error('Error rendering reader:', err);
    if (readerLoading) readerLoading.innerHTML = `<p class="text-red-400">Error: ${err.message}</p>`;
  }
});
