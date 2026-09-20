// QuickConverter Chapter Reader Controller
// Renders clean distraction-free reading typography, font resizing, scroll progress, adjacent chapter navigation,
// and intuitive in-place translation and chapter text editing with IndexedDB persistence.

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const novelId = urlParams.get('id');
  const chapterNumber = parseFloat(urlParams.get('ch'));

  // Header Elements
  const progressBar = document.getElementById('reading-progress-bar');
  const backToNovelBtn = document.getElementById('back-to-novel-btn');
  const headerNovelTitle = document.getElementById('header-novel-title');
  const headerChapterTitle = document.getElementById('header-chapter-title');
  const headerEditBtn = document.getElementById('header-edit-btn');
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
  const contentEditBtn = document.getElementById('content-edit-btn');
  const chapterMainTitle = document.getElementById('chapter-main-title');
  const chapterCharCount = document.getElementById('chapter-char-count');
  const chapterReadingTime = document.getElementById('chapter-reading-time');
  const chapterBody = document.getElementById('chapter-body');

  // Bottom Navigation
  const prevChapterBtn = document.getElementById('prev-chapter-btn');
  const nextChapterBtn = document.getElementById('next-chapter-btn');
  const bottomNovelBtn = document.getElementById('bottom-novel-btn');

  // Editor Elements
  const readerEditView = document.getElementById('reader-edit-view');
  const editModeBadge = document.getElementById('edit-mode-badge');
  const editChapterTitle = document.getElementById('edit-chapter-title');
  const editChapterTextarea = document.getElementById('edit-chapter-textarea');
  const editCharCount = document.getElementById('edit-char-count');
  const editWordCount = document.getElementById('edit-word-count');
  const toggleRawRefBtn = document.getElementById('toggle-raw-reference-btn');
  const toggleRawRefLabel = document.getElementById('toggle-raw-reference-label');
  const revertEditBtn = document.getElementById('revert-edit-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const saveEditBtn = document.getElementById('save-edit-btn');
  const bottomCancelEditBtn = document.getElementById('bottom-cancel-edit-btn');
  const bottomSaveEditBtn = document.getElementById('bottom-save-edit-btn');
  const rawRefPanel = document.getElementById('raw-reference-panel');
  const rawRefText = document.getElementById('raw-reference-text');
  const closeRawPanelBtn = document.getElementById('close-raw-panel-btn');

  // Toast Element
  const saveToast = document.getElementById('save-toast');
  const saveToastMsg = document.getElementById('save-toast-msg');

  if (!novelId || isNaN(chapterNumber) || !window.StorageService) {
    if (readerLoading) readerLoading.innerHTML = '<p class="text-red-400">Invalid novel or chapter specified.</p>';
    return;
  }

  // State
  let currentChapter = null;
  let isEditing = false;
  let initialTitleBeforeEdit = '';
  let initialTextBeforeEdit = '';
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
    }, 3000);
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
    if (editChapterTextarea) {
      editChapterTextarea.style.fontSize = `${currentFontSize}px`;
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

  function updateEditorStats() {
    if (!editChapterTextarea) return;
    const text = editChapterTextarea.value || '';
    const charCount = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    if (editCharCount) editCharCount.textContent = `${charCount.toLocaleString()} characters`;
    if (editWordCount) editWordCount.textContent = `${words.toLocaleString()} words`;
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
    if (editModeBadge) editModeBadge.textContent = `Ch. ${chapterNumber}`;

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

    // --- Edit Mode Controller Methods ---
    function enterEditMode() {
      if (!currentChapter) return;
      isEditing = true;

      const titleVal = currentChapter.title || headerChapterTitle.textContent || `Chapter ${chapterNumber}`;
      const textVal = currentChapter.rawText || currentChapter.convertedText || '';

      if (editChapterTitle) editChapterTitle.value = titleVal;
      if (editChapterTextarea) {
        editChapterTextarea.value = textVal;
        editChapterTextarea.style.fontSize = `${currentFontSize}px`;
      }

      initialTitleBeforeEdit = titleVal;
      initialTextBeforeEdit = textVal;

      updateEditorStats();

      // Show/Hide Original Source Reference option
      if (currentChapter.originalRawText && currentChapter.originalRawText.trim() !== textVal.trim()) {
        if (toggleRawRefBtn) toggleRawRefBtn.classList.remove('hidden');
        if (rawRefText) rawRefText.textContent = currentChapter.originalRawText;
        if (revertEditBtn) revertEditBtn.classList.remove('hidden');
      } else {
        if (toggleRawRefBtn) toggleRawRefBtn.classList.add('hidden');
        if (rawRefPanel) rawRefPanel.classList.add('hidden');
        if (revertEditBtn) revertEditBtn.classList.add('hidden');
      }

      if (readerContentView) readerContentView.classList.add('hidden');
      if (readerEditView) readerEditView.classList.remove('hidden');

      // Scroll to editor top
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (editChapterTextarea) {
        setTimeout(() => editChapterTextarea.focus(), 100);
      }
    }

    function exitEditMode(saved = false) {
      isEditing = false;
      if (readerEditView) readerEditView.classList.add('hidden');
      if (readerContentView) readerContentView.classList.remove('hidden');

      if (saved) {
        loadChapterContent();
      }
    }

    function handleCancelEdit() {
      if (!isEditing) return;
      const curTitle = (editChapterTitle && editChapterTitle.value) || '';
      const curText = (editChapterTextarea && editChapterTextarea.value) || '';

      if (curTitle !== initialTitleBeforeEdit || curText !== initialTextBeforeEdit) {
        if (!confirm('Discard your unsaved edits?')) {
          return;
        }
      }
      exitEditMode(false);
    }

    async function handleSaveEdit() {
      if (!currentChapter || !novel) return;

      const newTitle = (editChapterTitle && editChapterTitle.value.trim()) || `Chapter ${chapterNumber}`;
      const newText = (editChapterTextarea && editChapterTextarea.value) || '';

      // Visual saving state
      const setButtonsBusy = (busy) => {
        [saveEditBtn, bottomSaveEditBtn].forEach((btn) => {
          if (!btn) return;
          btn.disabled = busy;
          btn.innerHTML = busy
            ? `
              <svg class="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Saving...</span>
            `
            : `
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              <span>Save Changes</span>
            `;
        });
      };

      try {
        setButtonsBusy(true);

        const updates = {
          title: newTitle,
          rawText: newText,
          convertedText: '', // Clear converted text to prioritize edited rawText
          isUserEdited: true,
          editedAt: Date.now()
        };

        const updated = await window.StorageService.updateChapter(novel.id, chapterNumber, updates);
        currentChapter = updated;

        setButtonsBusy(false);
        showToast('Chapter changes saved successfully!');
        exitEditMode(true);
      } catch (err) {
        console.error('Failed to save chapter edits:', err);
        setButtonsBusy(false);
        alert(`Failed to save changes: ${err.message || err}`);
      }
    }

    // Wire Edit triggers
    if (headerEditBtn) headerEditBtn.addEventListener('click', enterEditMode);
    if (contentEditBtn) contentEditBtn.addEventListener('click', enterEditMode);

    if (cancelEditBtn) cancelEditBtn.addEventListener('click', handleCancelEdit);
    if (bottomCancelEditBtn) bottomCancelEditBtn.addEventListener('click', handleCancelEdit);

    if (saveEditBtn) saveEditBtn.addEventListener('click', handleSaveEdit);
    if (bottomSaveEditBtn) bottomSaveEditBtn.addEventListener('click', handleSaveEdit);

    if (editChapterTextarea) {
      editChapterTextarea.addEventListener('input', updateEditorStats);
    }

    // Toggle Original Reference Panel
    if (toggleRawRefBtn && rawRefPanel) {
      toggleRawRefBtn.addEventListener('click', () => {
        const isHidden = rawRefPanel.classList.contains('hidden');
        if (isHidden) {
          rawRefPanel.classList.remove('hidden');
          if (toggleRawRefLabel) toggleRawRefLabel.textContent = 'Hide Original Source';
        } else {
          rawRefPanel.classList.add('hidden');
          if (toggleRawRefLabel) toggleRawRefLabel.textContent = 'View Original Source';
        }
      });
    }

    if (closeRawPanelBtn && rawRefPanel) {
      closeRawPanelBtn.addEventListener('click', () => {
        rawRefPanel.classList.add('hidden');
        if (toggleRawRefLabel) toggleRawRefLabel.textContent = 'View Original Source';
      });
    }

    // Revert to Original Source/Initial Text
    if (revertEditBtn) {
      revertEditBtn.addEventListener('click', () => {
        if (!currentChapter) return;
        const targetText = currentChapter.originalRawText || initialTextBeforeEdit;
        if (!targetText) return;

        if (confirm('Revert content back to the original source text? This will overwrite your current edits in the box.')) {
          if (editChapterTextarea) {
            editChapterTextarea.value = targetText;
            updateEditorStats();
          }
        }
      });
    }

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      // While editing: Ctrl+S / Cmd+S to save, Escape to cancel
      if (isEditing) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          handleSaveEdit();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelEdit();
          return;
        }
        return;
      }

      // Not editing: ignore if typing in any other input/textarea
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      // E or e triggers edit mode
      if ((e.key === 'e' || e.key === 'E') && currentChapter) {
        e.preventDefault();
        enterEditMode();
        return;
      }

      // Navigation shortcuts
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

        if (headerEditBtn) headerEditBtn.classList.remove('hidden');

        if (readerLoading) readerLoading.classList.add('hidden');
        if (readerNotSaved) readerNotSaved.classList.add('hidden');
        if (readerContentView) readerContentView.classList.remove('hidden');
      } else {
        // Not saved yet
        if (headerEditBtn) headerEditBtn.classList.add('hidden');
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
