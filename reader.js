// QuickConverter Chapter Reader Controller
// Renders clean distraction-free reading typography, font resizing, scroll progress, adjacent chapter navigation,
// and seamless zero-friction in-place paragraph editing with background auto-save to IndexedDB.

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const novelId = urlParams.get('id');
  const chapterNumber = parseFloat(urlParams.get('ch'));

  // Header Elements
  const progressBar = document.getElementById('reading-progress-bar');
  const backToNovelBtn = document.getElementById('back-to-novel-btn');
  const headerNovelTitle = document.getElementById('header-novel-title');
  const headerChapterTitle = document.getElementById('header-chapter-title');
  const toggleSourceDrawerBtn = document.getElementById('toggle-source-drawer-btn');
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
  const chapterTransBadge = document.getElementById('chapter-trans-badge');
  const chapterEditedBadge = document.getElementById('chapter-edited-badge');
  const chapterMainTitle = document.getElementById('chapter-main-title');
  const editTitleBtn = document.getElementById('edit-title-btn');
  const chapterCharCount = document.getElementById('chapter-char-count');
  const chapterReadingTime = document.getElementById('chapter-reading-time');
  const chapterBody = document.getElementById('chapter-body');

  // Bottom Navigation
  const prevChapterBtn = document.getElementById('prev-chapter-btn');
  const nextChapterBtn = document.getElementById('next-chapter-btn');
  const bottomNovelBtn = document.getElementById('bottom-novel-btn');

  // Source Drawer Elements
  const sourceDrawer = document.getElementById('source-drawer');
  const closeSourceDrawerBtn = document.getElementById('close-source-drawer-btn');
  const copySourceBtn = document.getElementById('copy-source-btn');
  const sourceDrawerText = document.getElementById('source-drawer-text');

  // Toast Element
  const saveToast = document.getElementById('save-toast');
  const saveToastMsg = document.getElementById('save-toast-msg');

  if (!novelId || isNaN(chapterNumber) || !window.StorageService) {
    if (readerLoading) readerLoading.innerHTML = '<p class="text-red-400">Invalid novel or chapter specified.</p>';
    return;
  }

  // State
  let currentChapter = null;
  let novel = null;
  let toastTimer = null;

  function showToast(msg) {
    if (!saveToast) return;
    if (saveToastMsg) saveToastMsg.textContent = msg;
    saveToast.classList.remove('translate-y-12', 'opacity-0', 'pointer-events-none');
    saveToast.classList.add('translate-y-0', 'opacity-100');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      saveToast.classList.remove('translate-y-0', 'opacity-100');
      saveToast.classList.add('translate-y-12', 'opacity-0', 'pointer-events-none');
    }, 2500);
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

  function updateMetricsFromDom() {
    if (!chapterBody) return;
    const allParagraphs = Array.from(chapterBody.querySelectorAll('.paragraph-text'))
      .map((el) => el.innerText.trim())
      .filter((t) => t.length > 0);
    const fullText = allParagraphs.join('\n\n');

    const charCount = fullText.length;
    if (chapterCharCount) chapterCharCount.textContent = `${charCount.toLocaleString()} characters`;
    if (chapterReadingTime) {
      const words = fullText.split(/\s+/).length;
      const mins = Math.max(1, Math.round(words / 220));
      chapterReadingTime.textContent = `~${mins} min read`;
    }
  }

  // --- Load Novel and Chapter Data ---
  try {
    novel = await window.StorageService.getNovelById(novelId);
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

    // --- In-Place Paragraph Editing System ---
    function startEditingParagraph(pBlock) {
      const pEl = pBlock.querySelector('.paragraph-text');
      if (!pEl || pEl.getAttribute('contenteditable') === 'true') return;

      const currentText = pEl.innerText.trim();
      pEl.dataset.origText = currentText;

      pEl.setAttribute('contenteditable', 'true');
      pEl.classList.add('ring-1', 'ring-indigo-500/60', 'bg-slate-800/90', 'px-2', 'py-1', 'shadow-inner');
      pEl.focus();

      // Place caret at end or selection
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(pEl);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    async function finishEditingParagraph(pBlock, save = true) {
      const pEl = pBlock.querySelector('.paragraph-text');
      const savePill = pBlock.querySelector('.save-pill');
      if (!pEl || pEl.getAttribute('contenteditable') !== 'true') return;

      const origText = pEl.dataset.origText || '';
      const newText = pEl.innerText.trim();

      pEl.setAttribute('contenteditable', 'false');
      pEl.classList.remove('ring-1', 'ring-indigo-500/60', 'bg-slate-800/90', 'px-2', 'py-1', 'shadow-inner');

      if (!save) {
        pEl.innerText = origText;
        return;
      }

      if (newText !== origText && newText.length > 0) {
        // Collect all paragraphs in the document
        const allParagraphs = Array.from(chapterBody.querySelectorAll('.paragraph-text'))
          .map((el) => el.innerText.trim())
          .filter((t) => t.length > 0);
        const fullText = allParagraphs.join('\n\n');

        try {
          await window.StorageService.updateChapter(novel.id, chapterNumber, {
            rawText: fullText,
            convertedText: '',
            isUserEdited: true,
            editedAt: Date.now()
          });

          if (currentChapter) {
            currentChapter.rawText = fullText;
            currentChapter.isUserEdited = true;
          }

          if (chapterEditedBadge) {
            chapterEditedBadge.classList.remove('hidden');
          }

          // Show subtle inline Saved pill
          if (savePill) {
            savePill.classList.remove('hidden');
            setTimeout(() => {
              savePill.classList.add('hidden');
            }, 1800);
          }

          updateMetricsFromDom();
        } catch (err) {
          console.error('Failed to auto-save paragraph edit:', err);
          showToast('Failed to save edit: ' + err.message);
        }
      }
    }

    // --- Inline Chapter Title Editing System ---
    function startEditingTitle() {
      if (!chapterMainTitle || chapterMainTitle.getAttribute('contenteditable') === 'true') return;

      const orig = chapterMainTitle.innerText.trim();
      chapterMainTitle.dataset.origTitle = orig;

      chapterMainTitle.setAttribute('contenteditable', 'true');
      chapterMainTitle.classList.add('ring-1', 'ring-indigo-500/60', 'bg-slate-800/90', 'px-2', 'py-0.5');
      chapterMainTitle.focus();

      // Select all text in title
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(chapterMainTitle);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    async function finishEditingTitle(save = true) {
      if (!chapterMainTitle || chapterMainTitle.getAttribute('contenteditable') !== 'true') return;

      const orig = chapterMainTitle.dataset.origTitle || '';
      const newTitle = chapterMainTitle.innerText.trim();

      chapterMainTitle.setAttribute('contenteditable', 'false');
      chapterMainTitle.classList.remove('ring-1', 'ring-indigo-500/60', 'bg-slate-800/90', 'px-2', 'py-0.5');

      if (!save) {
        chapterMainTitle.innerText = orig;
        return;
      }

      if (newTitle && newTitle !== orig) {
        try {
          await window.StorageService.updateChapter(novel.id, chapterNumber, {
            title: newTitle,
            isUserEdited: true,
            editedAt: Date.now()
          });

          if (currentChapter) currentChapter.title = newTitle;
          if (headerChapterTitle) headerChapterTitle.textContent = newTitle;
          document.title = `${novel.title} - ${newTitle}`;

          if (chapterEditedBadge) {
            chapterEditedBadge.classList.remove('hidden');
          }

          showToast('Title updated ✓');
        } catch (err) {
          console.error('Failed to save chapter title:', err);
          showToast('Failed to save title: ' + err.message);
        }
      }
    }

    if (chapterMainTitle) {
      chapterMainTitle.addEventListener('dblclick', startEditingTitle);
      chapterMainTitle.addEventListener('blur', () => finishEditingTitle(true));
      chapterMainTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEditingTitle(true);
          chapterMainTitle.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishEditingTitle(false);
          chapterMainTitle.blur();
        }
      });
    }

    if (editTitleBtn) {
      editTitleBtn.addEventListener('click', startEditingTitle);
    }

    // --- Source Reference Drawer Controller ---
    function openSourceDrawer() {
      if (!sourceDrawer) return;
      sourceDrawer.classList.remove('translate-x-full');
    }

    function closeSourceDrawer() {
      if (!sourceDrawer) return;
      sourceDrawer.classList.add('translate-x-full');
    }

    if (toggleSourceDrawerBtn) {
      toggleSourceDrawerBtn.addEventListener('click', () => {
        const isClosed = sourceDrawer.classList.contains('translate-x-full');
        if (isClosed) openSourceDrawer();
        else closeSourceDrawer();
      });
    }

    if (closeSourceDrawerBtn) {
      closeSourceDrawerBtn.addEventListener('click', closeSourceDrawer);
    }

    if (copySourceBtn) {
      copySourceBtn.addEventListener('click', () => {
        if (currentChapter && currentChapter.originalRawText) {
          navigator.clipboard.writeText(currentChapter.originalRawText).then(() => {
            copySourceBtn.textContent = 'Copied! ✓';
            setTimeout(() => {
              copySourceBtn.textContent = 'Copy';
            }, 2000);
          });
        }
      });
    }

    // Global Keydown Handler (Navigation, Hotkeys & Active ContentEditable overrides)
    window.addEventListener('keydown', (e) => {
      // If currently editing inside a contenteditable paragraph
      const activeEl = document.activeElement;
      if (activeEl && activeEl.getAttribute('contenteditable') === 'true') {
        const pBlock = activeEl.closest('.paragraph-block');
        if (pBlock) {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            finishEditingParagraph(pBlock, true);
            activeEl.blur();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            finishEditingParagraph(pBlock, false);
            activeEl.blur();
            return;
          }
        }
        return; // Don't trigger navigation keys while editing text
      }

      // If inside an input or textarea
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

      // Hotkey: S toggles original source drawer (if source exists)
      if ((e.key === 's' || e.key === 'S') && currentChapter && currentChapter.originalRawText) {
        e.preventDefault();
        const isClosed = sourceDrawer.classList.contains('translate-x-full');
        if (isClosed) openSourceDrawer();
        else closeSourceDrawer();
        return;
      }

      // Hotkey: Escape closes source drawer if open
      if (e.key === 'Escape' && sourceDrawer && !sourceDrawer.classList.contains('translate-x-full')) {
        e.preventDefault();
        closeSourceDrawer();
        return;
      }

      // Navigation Shortcuts (Left / Right Arrow)
      if ((e.key === 'ArrowLeft' || e.key === '[') && prevCh !== null) {
        window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(prevCh)}`;
      } else if ((e.key === 'ArrowRight' || e.key === ']') && nextCh !== null) {
        window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(nextCh)}`;
      }
    });

    // --- Load Chapter Content ---
    async function loadChapterContent() {
      const chapter = await window.StorageService.getChapter(novel.id, chapterNumber);
      currentChapter = chapter;

      if (chapter && (chapter.rawText || chapter.convertedText)) {
        const text = chapter.convertedText || chapter.rawText;
        const paragraphs = text
          .split('\n\n')
          .map((p) => p.trim())
          .filter((p) => p.length > 0 && p !== '&nbsp;');

        if (chapterBody) {
          chapterBody.innerHTML = paragraphs
            .map(
              (p, idx) => `
              <div class="paragraph-block relative group rounded-md transition-all -mx-2 px-2 py-0.5 hover:bg-slate-800/30" data-idx="${idx}">
                <p
                  class="paragraph-text leading-relaxed outline-none rounded transition-all cursor-text select-text"
                  tabindex="0"
                  title="Double-click to edit this paragraph"
                >${escapeHtml(p)}</p>
                <div class="paragraph-actions absolute right-2 -top-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
                  <span class="save-pill hidden text-[10px] font-medium text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 rounded shadow-sm">
                    Saved ✓
                  </span>
                  <button
                    type="button"
                    class="edit-p-btn pointer-events-auto p-1 text-slate-500 hover:text-indigo-300 hover:bg-slate-800 transition rounded cursor-pointer"
                    title="Edit paragraph"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            `
            )
            .join('');

          // Wire paragraph events
          chapterBody.querySelectorAll('.paragraph-block').forEach((pBlock) => {
            const pEl = pBlock.querySelector('.paragraph-text');
            const editBtn = pBlock.querySelector('.edit-p-btn');

            pEl.addEventListener('dblclick', () => startEditingParagraph(pBlock));
            if (editBtn) editBtn.addEventListener('click', () => startEditingParagraph(pBlock));

            pEl.addEventListener('blur', () => finishEditingParagraph(pBlock, true));
          });
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

        // Show/hide translation & edited badges
        if (chapterTransBadge) {
          if (chapter.isTranslated || chapter.modelUsed) {
            chapterTransBadge.textContent = chapter.modelUsed ? `Translated (${chapter.modelUsed})` : 'Translated';
            chapterTransBadge.classList.remove('hidden');
          } else {
            chapterTransBadge.classList.add('hidden');
          }
        }

        if (chapterEditedBadge) {
          if (chapter.isUserEdited) {
            chapterEditedBadge.classList.remove('hidden');
          } else {
            chapterEditedBadge.classList.add('hidden');
          }
        }

        // Handle Original Source Drawer setup
        if (chapter.originalRawText && chapter.originalRawText.trim() !== text.trim()) {
          if (toggleSourceDrawerBtn) toggleSourceDrawerBtn.classList.remove('hidden');
          if (sourceDrawerText) sourceDrawerText.textContent = chapter.originalRawText;
        } else {
          if (toggleSourceDrawerBtn) toggleSourceDrawerBtn.classList.add('hidden');
          closeSourceDrawer();
        }

        if (readerLoading) readerLoading.classList.add('hidden');
        if (readerNotSaved) readerNotSaved.classList.add('hidden');
        if (readerContentView) readerContentView.classList.remove('hidden');
      } else {
        // Not saved yet
        if (toggleSourceDrawerBtn) toggleSourceDrawerBtn.classList.add('hidden');
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
