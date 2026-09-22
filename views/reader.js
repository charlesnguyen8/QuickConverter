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
  const readerSettingsBtn = document.getElementById('reader-settings-btn');

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

  if (readerSettingsBtn && novelId && !isNaN(chapterNumber)) {
    readerSettingsBtn.href = `settings.html?from=reader&id=${encodeURIComponent(novelId)}&ch=${encodeURIComponent(chapterNumber)}`;
  }

  // --- Reader Typography, Appearance & Theme Preferences ---
  const FONT_KEY = 'quickconverter_reader_font_size';
  const FONT_FAMILY_KEY = 'quickconverter_reader_font_family';
  const LINE_HEIGHT_KEY = 'quickconverter_reader_line_height';
  const WIDTH_KEY = 'quickconverter_reader_column_width';
  const THEME_KEY = 'quickconverter_reader_theme';

  const readerMainEl = document.querySelector('main');
  const readerHeaderEl = document.querySelector('header');

  function resolveFontFamilyCss(fontKey) {
    switch (fontKey) {
      case 'serif':
      case 'georgia':
        return 'Georgia, Cambria, "Times New Roman", Times, serif';
      case 'garamond':
        return 'Garamond, "EB Garamond", "Baskerville", "Times New Roman", serif';
      case 'palatino':
        return '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif';
      case 'charter':
        return 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif';
      case 'baskerville':
        return 'Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, serif';
      case 'times':
        return '"Times New Roman", Times, Georgia, serif';
      case 'verdana':
        return 'Verdana, Geneva, "DejaVu Sans", sans-serif';
      case 'trebuchet':
        return '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif';
      case 'unkempt':
        return "'Unkempt', cursive, sans-serif";
      case 'patrick-hand':
        return "'Patrick Hand', cursive, sans-serif";
      case 'merienda':
        return "'Merienda', cursive, serif";
      case 'pangolin':
        return "'Pangolin', cursive, sans-serif";
      case 'playwrite-vn':
        return "'Playwrite VN', cursive, sans-serif";
      case 'sedgwick-ave':
        return "'Sedgwick Ave Display', cursive, sans-serif";
      case 'mynerve':
        return "'Mynerve', cursive, sans-serif";
      case 'fuzzy-bubbles':
        return "'Fuzzy Bubbles', cursive, sans-serif";
      case 'mono':
        return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Code", "Courier New", monospace';
      case 'sans':
      default:
        return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }
  }

  function applyReaderPreferences() {
    const fontSize = parseInt(localStorage.getItem(FONT_KEY), 10) || 18;
    const fontFamily = localStorage.getItem(FONT_FAMILY_KEY) || 'sans';
    const lineHeight = localStorage.getItem(LINE_HEIGHT_KEY) || 'relaxed';
    const columnWidth = localStorage.getItem(WIDTH_KEY) || 'standard';
    const theme = localStorage.getItem(THEME_KEY) || 'slate';

    // Apply font size
    if (chapterBody) {
      chapterBody.style.fontSize = `${fontSize}px`;
    }
    if (fontSizeLabel) {
      fontSizeLabel.textContent = `${fontSize}px`;
    }
    const inReaderFontVal = document.getElementById('in-reader-font-val');
    if (inReaderFontVal) {
      inReaderFontVal.textContent = `${fontSize}px`;
    }
    const inReaderFontSlider = document.getElementById('in-reader-font-slider');
    if (inReaderFontSlider) {
      inReaderFontSlider.value = fontSize;
    }

    // Apply font family
    if (chapterBody) {
      chapterBody.style.fontFamily = resolveFontFamilyCss(fontFamily);
    }
    const inReaderFontSelect = document.getElementById('in-reader-font-family');
    if (inReaderFontSelect) {
      inReaderFontSelect.value = fontFamily;
    }

    // Apply line height
    if (chapterBody) {
      if (lineHeight === 'compact') {
        chapterBody.style.lineHeight = '1.5';
      } else if (lineHeight === 'spacious') {
        chapterBody.style.lineHeight = '2.0';
      } else {
        chapterBody.style.lineHeight = '1.75';
      }
    }
    document.querySelectorAll('.in-reader-line-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lineChoice === lineHeight);
    });

    // Apply column width
    if (readerMainEl) {
      readerMainEl.classList.remove('max-w-2xl', 'max-w-3xl', 'max-w-4xl', 'max-w-5xl');
      if (columnWidth === 'compact') readerMainEl.classList.add('max-w-2xl');
      else if (columnWidth === 'wide') readerMainEl.classList.add('max-w-4xl');
      else if (columnWidth === 'full') readerMainEl.classList.add('max-w-5xl');
      else readerMainEl.classList.add('max-w-3xl');
    }
    document.querySelectorAll('.in-reader-width-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.widthChoice === columnWidth);
    });

    // Apply Theme attribute and colors
    document.body.setAttribute('data-theme', theme);

    // Sync theme buttons in popover
    document.querySelectorAll('.in-reader-theme-btn').forEach((btn) => {
      const isSelected = btn.dataset.themeChoice === theme;
      btn.classList.toggle('active', isSelected);
      const checkEl = btn.querySelector('.theme-check');
      if (checkEl) checkEl.style.opacity = isSelected ? '1' : '0';
    });

    if (theme === 'sepia') {
      document.body.style.backgroundColor = '#fbf0d9';
      document.body.style.color = '#2d231b';
      if (chapterBody) chapterBody.style.color = '#2d231b';
      if (chapterMainTitle) chapterMainTitle.style.color = '#2d231b';
      if (readerHeaderEl) {
        readerHeaderEl.style.backgroundColor = 'rgba(251, 240, 217, 0.95)';
        readerHeaderEl.style.borderColor = '#e5d5be';
      }
    } else if (theme === 'oled') {
      document.body.style.backgroundColor = '#000000';
      document.body.style.color = '#f4f4f5';
      if (chapterBody) chapterBody.style.color = '#f4f4f5';
      if (chapterMainTitle) chapterMainTitle.style.color = '#f4f4f5';
      if (readerHeaderEl) {
        readerHeaderEl.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
        readerHeaderEl.style.borderColor = '#27272a';
      }
    } else if (theme === 'forest') {
      document.body.style.backgroundColor = '#0d1712';
      document.body.style.color = '#e2f2e9';
      if (chapterBody) chapterBody.style.color = '#e2f2e9';
      if (chapterMainTitle) chapterMainTitle.style.color = '#e2f2e9';
      if (readerHeaderEl) {
        readerHeaderEl.style.backgroundColor = 'rgba(13, 23, 18, 0.95)';
        readerHeaderEl.style.borderColor = '#1a3325';
      }
    } else {
      // Default slate
      document.body.style.backgroundColor = '';
      document.body.style.color = '';
      if (chapterBody) chapterBody.style.color = '#e2e8f0';
      if (chapterMainTitle) chapterMainTitle.style.color = '#f8fafc';
      if (readerHeaderEl) {
        readerHeaderEl.style.backgroundColor = '';
        readerHeaderEl.style.borderColor = '';
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('reader-prefs-updated'));
    }
  }

  // --- In-Reader Typography Popover Controller ---
  function initInReaderTypography() {
    const popoverBtn = document.getElementById('toggle-typography-popover-btn');
    const popoverEl = document.getElementById('reader-typography-popover');
    const closeBtn = document.getElementById('close-typography-popover-btn');
    const wrapperEl = document.getElementById('reader-typography-wrapper');
    const fontSlider = document.getElementById('in-reader-font-slider');
    const inReaderFontDec = document.getElementById('in-reader-font-dec');
    const inReaderFontInc = document.getElementById('in-reader-font-inc');
    const fullSettingsLink = document.getElementById('popover-full-settings-link');

    if (fullSettingsLink && novelId && !isNaN(chapterNumber)) {
      fullSettingsLink.href = `settings.html?from=reader&id=${encodeURIComponent(novelId)}&ch=${encodeURIComponent(chapterNumber)}`;
    }

    function openPopover() {
      if (!popoverEl) return;
      popoverEl.classList.remove('hidden');
      if (popoverBtn) popoverBtn.setAttribute('aria-expanded', 'true');
    }

    function closePopover() {
      if (!popoverEl) return;
      popoverEl.classList.add('hidden');
      if (popoverBtn) popoverBtn.setAttribute('aria-expanded', 'false');
    }

    function togglePopover() {
      if (!popoverEl) return;
      if (popoverEl.classList.contains('hidden')) openPopover();
      else closePopover();
    }

    if (popoverBtn) {
      popoverBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closePopover();
      });
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!popoverEl || popoverEl.classList.contains('hidden')) return;
      if (wrapperEl && !wrapperEl.contains(e.target)) {
        closePopover();
      }
    });

    // Theme preset buttons
    document.querySelectorAll('.in-reader-theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.themeChoice;
        if (choice) {
          localStorage.setItem(THEME_KEY, choice);
          applyReaderPreferences();
        }
      });
    });

    // Font Family dropdown select
    const fontSelect = document.getElementById('in-reader-font-family');
    if (fontSelect) {
      fontSelect.addEventListener('change', (e) => {
        const choice = e.target.value;
        if (choice) {
          localStorage.setItem(FONT_FAMILY_KEY, choice);
          applyReaderPreferences();
        }
      });
    }

    // Line Spacing buttons
    document.querySelectorAll('.in-reader-line-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.lineChoice;
        if (choice) {
          localStorage.setItem(LINE_HEIGHT_KEY, choice);
          applyReaderPreferences();
        }
      });
    });

    // Column Width buttons
    document.querySelectorAll('.in-reader-width-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.widthChoice;
        if (choice) {
          localStorage.setItem(WIDTH_KEY, choice);
          applyReaderPreferences();
        }
      });
    });

    // Font Size Slider
    if (fontSlider) {
      fontSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        localStorage.setItem(FONT_KEY, val.toString());
        applyReaderPreferences();
      });
    }

    // Popover Font Steppers
    if (inReaderFontDec) {
      inReaderFontDec.addEventListener('click', () => {
        const cur = parseInt(localStorage.getItem(FONT_KEY), 10) || 18;
        const next = Math.max(14, cur - 1);
        localStorage.setItem(FONT_KEY, next.toString());
        applyReaderPreferences();
      });
    }

    if (inReaderFontInc) {
      inReaderFontInc.addEventListener('click', () => {
        const cur = parseInt(localStorage.getItem(FONT_KEY), 10) || 18;
        const next = Math.min(28, cur + 1);
        localStorage.setItem(FONT_KEY, next.toString());
        applyReaderPreferences();
      });
    }

    return { openPopover, closePopover, togglePopover };
  }

  const inReaderTypography = initInReaderTypography();
  applyReaderPreferences();

  if (fontDecBtn) {
    fontDecBtn.addEventListener('click', () => {
      const cur = parseInt(localStorage.getItem(FONT_KEY), 10) || 18;
      const next = Math.max(14, cur - 2);
      localStorage.setItem(FONT_KEY, next.toString());
      applyReaderPreferences();
    });
  }

  if (fontIncBtn) {
    fontIncBtn.addEventListener('click', () => {
      const cur = parseInt(localStorage.getItem(FONT_KEY), 10) || 18;
      const next = Math.min(28, cur + 2);
      localStorage.setItem(FONT_KEY, next.toString());
      applyReaderPreferences();
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

  const escapeHtml = window.UIUtils.escapeHtml;

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
    if (headerNovelTitle) headerNovelTitle.textContent = novel.title;
    if (novelBadge) novelBadge.textContent = novel.title;

    // Resolve chapter title from catalog if possible
    const catalogItem = (novel.chapterList || []).find((c) => Number(c.chapterNumber) === chapterNumber);
    const fallbackTitle = catalogItem ? catalogItem.title : `Chapter ${chapterNumber}`;

    if (headerChapterTitle) headerChapterTitle.textContent = fallbackTitle;
    if (chapterMainTitle) chapterMainTitle.textContent = fallbackTitle;
    if (chapterBadge) chapterBadge.textContent = `Ch. ${chapterNumber}`;

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

      // Hotkey: T toggles reader typography popover
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        if (inReaderTypography) inReaderTypography.togglePopover();
        return;
      }

      // Hotkey: Escape closes typography popover if open
      const typographyPopoverEl = document.getElementById('reader-typography-popover');
      if (e.key === 'Escape' && typographyPopoverEl && !typographyPopoverEl.classList.contains('hidden')) {
        e.preventDefault();
        if (inReaderTypography) inReaderTypography.closePopover();
        return;
      }

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

    // --- DeepSeek Pre-Download UI for Reader ---
    let aiConfigPanel = null;

    async function initReaderDeepSeekUI(novelRecord) {
      if (!window.AiConfigPanel || typeof window.AiConfigPanel.create !== 'function') {
        console.warn('[reader.js] AiConfigPanel module not loaded; DeepSeek panel disabled.');
        return;
      }

      aiConfigPanel = window.AiConfigPanel.create({
        variant: 'full',
        capabilities: { cooldown: false },
        options: { readerPromptStyle: true },
        ids: {
          toggle: 'reader-deepseek-toggle',
          toggleBadge: 'reader-deepseek-toggle-badge',
          providerBadge: 'reader-provider-badge',
          providerBtnOfficial: 'reader-provider-btn-official',
          providerBtnCustom: 'reader-provider-btn-custom',
          customRow: 'reader-custom-api-row',
          customUrl: 'reader-custom-base-url',
          presetBtn: 'reader-bridge-preset-btn',
          testCustomBtn: 'reader-test-custom-btn',
          apiKeyLabel: 'reader-api-key-label',
          apiKey: 'reader-deepseek-api-key',
          rememberKey: 'reader-remember-deepseek-key',
          clearKeyBtn: 'reader-clear-deepseek-btn',
          prompt: 'reader-deepseek-prompt',
          visibilityBtn: 'reader-toggle-key-visibility',
          fields: 'reader-deepseek-config-fields',
          editPromptBtn: 'reader-edit-prompt-btn',
          modelSelect: 'reader-deepseek-model-select',
          testBtn: 'reader-test-deepseek-btn',
          testStatus: 'reader-deepseek-test-status',
          balanceBadge: 'reader-deepseek-balance-badge',
          balanceText: 'reader-deepseek-balance-text',
          refreshBalanceBtn: 'reader-deepseek-refresh-balance-btn',
          refreshBalanceIcon: 'reader-deepseek-refresh-balance-icon',
          pricingBadge: 'reader-deepseek-pricing-badge'
        },
        hooks: {
          getPrompt: () => (novelRecord && novelRecord.translationPrompt) || null,
          savePrompt: async (text) => {
            if (!novelRecord) return;
            novelRecord.translationPrompt = text;
            if (window.StorageService && typeof window.StorageService.updateNovel === 'function') {
              await window.StorageService.updateNovel(novelRecord.id, { translationPrompt: text });
            }
          },
          onPromptSaved: () => showToast('Translation prompt saved ✓')
        }
      });

      if (aiConfigPanel) await aiConfigPanel.refresh();
    }

    initReaderDeepSeekUI(novel);

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

        if (headerChapterTitle) headerChapterTitle.textContent = chapter.title || fallbackTitle;

        // Handle Original Source Drawer setup & cost breakdown
        const sourceDrawerCostCard = document.getElementById('source-drawer-cost-card');
        const drawerCostRateBadge = document.getElementById('drawer-cost-rate-badge');
        const drawerCostPromptTokens = document.getElementById('drawer-cost-prompt-tokens');
        const drawerCostCacheTokens = document.getElementById('drawer-cost-cache-tokens');
        const drawerCostOutTokens = document.getElementById('drawer-cost-out-tokens');
        const drawerCostTotalTokens = document.getElementById('drawer-cost-total-tokens');
        const drawerCostTotalAmount = document.getElementById('drawer-cost-total-amount');

        if (chapter.translationCost && sourceDrawerCostCard) {
          sourceDrawerCostCard.classList.remove('hidden');
          if (drawerCostRateBadge) {
            drawerCostRateBadge.textContent = chapter.translationCost.ratePeriod || 'Off-Peak';
            drawerCostRateBadge.className = chapter.translationCost.isPeak
              ? 'text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/15 text-amber-400'
              : 'text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400';
          }
          if (drawerCostPromptTokens) {
            drawerCostPromptTokens.textContent = `${(chapter.translationCost.promptTokens || 0).toLocaleString()} tokens`;
          }
          if (drawerCostCacheTokens) {
            drawerCostCacheTokens.textContent = `${(chapter.translationCost.cacheHitTokens || 0).toLocaleString()} cached (90% off)`;
          }
          if (drawerCostOutTokens) {
            drawerCostOutTokens.textContent = `${(chapter.translationCost.completionTokens || 0).toLocaleString()} tokens`;
          }
          if (drawerCostTotalTokens) {
            drawerCostTotalTokens.textContent = `${(chapter.translationCost.totalTokens || 0).toLocaleString()} total tokens`;
          }
          if (drawerCostTotalAmount) {
            drawerCostTotalAmount.textContent = `${chapter.translationCost.formattedCost} USD`;
          }
        } else if (sourceDrawerCostCard) {
          sourceDrawerCostCard.classList.add('hidden');
        }

        // Handle DeepSeek Reasoner (R1) chain-of-thought drawer section
        const reasoningContainer = document.getElementById('source-reasoning-container');
        const reasoningHeader = document.getElementById('source-reasoning-header');
        const reasoningContent = document.getElementById('source-reasoning-content');
        const reasoningToggleIcon = document.getElementById('source-reasoning-toggle-icon');

        if (chapter.reasoningText && reasoningContainer && reasoningContent) {
          reasoningContainer.classList.remove('hidden');
          reasoningContent.textContent = chapter.reasoningText;
          if (reasoningHeader && !reasoningHeader.dataset.wired) {
            reasoningHeader.dataset.wired = 'true';
            reasoningHeader.addEventListener('click', () => {
              const isCollapsed = reasoningContent.classList.contains('hidden');
              reasoningContent.classList.toggle('hidden', !isCollapsed);
              if (reasoningToggleIcon) reasoningToggleIcon.textContent = isCollapsed ? '▼' : '►';
            });
          }
        } else if (reasoningContainer) {
          reasoningContainer.classList.add('hidden');
        }

        if ((chapter.originalRawText && chapter.originalRawText.trim() !== text.trim()) || chapter.translationCost || chapter.reasoningText) {
          if (toggleSourceDrawerBtn) toggleSourceDrawerBtn.classList.remove('hidden');
          if (sourceDrawerText) sourceDrawerText.textContent = chapter.originalRawText || 'No separate raw source text stored.';
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
            const toggleEl = document.getElementById('reader-deepseek-toggle');
            const keyEl = document.getElementById('reader-deepseek-api-key');
            const promptEl = document.getElementById('reader-deepseek-prompt');
            const modelSelectEl = document.getElementById('reader-deepseek-model-select');

            const isTranslationEnabled = !!(toggleEl && toggleEl.checked);
            let apiKey = keyEl ? keyEl.value.trim() : '';
            const selectedModel = (modelSelectEl && modelSelectEl.value) || 'deepseek-flash';

            const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
              (typeof DeepSeekService !== 'undefined' && DeepSeekService);

            let curProvConfig = { provider: 'official', customUrl: 'http://127.0.0.1:8000/v1' };
            if (deepseek && typeof deepseek.getProviderConfig === 'function') {
              try {
                curProvConfig = await deepseek.getProviderConfig();
              } catch (e) {}
            }
            const isCustomMode = curProvConfig.provider !== 'official';
            const customUrlInputEl = document.getElementById('reader-custom-base-url');
            const effectiveCustomUrl = customUrlInputEl ? (customUrlInputEl.value.trim() || curProvConfig.customUrl || 'http://127.0.0.1:8000/v1') : (curProvConfig.customUrl || 'http://127.0.0.1:8000/v1');

            if (isTranslationEnabled && !apiKey) {
              if (isCustomMode) {
                apiKey = 'sk-local';
              } else if (deepseek && typeof deepseek.getApiKey === 'function') {
                try {
                  const stored = await deepseek.getApiKey();
                  if (stored && stored.apiKey) {
                    apiKey = stored.apiKey.trim();
                    if (keyEl) keyEl.value = apiKey;
                    const clearKeyBtn = document.getElementById('reader-clear-deepseek-btn');
                    if (clearKeyBtn) clearKeyBtn.classList.remove('hidden');
                  }
                } catch (e) {}
              }
            }

            if (isTranslationEnabled && !apiKey && !isCustomMode) {
              if (keyEl) {
                keyEl.focus();
                keyEl.classList.add('border-rose-500', 'ring-1', 'ring-rose-500/50');
                setTimeout(() => {
                  keyEl.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500/50');
                }, 2500);
              }
              alert('Please enter your DeepSeek API Key before translating.');
              return;
            }

            readerDownloadBtn.disabled = true;
            readerDownloadBtn.innerHTML = `
              <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>${isTranslationEnabled ? 'Translating (' + selectedModel + ')...' : 'Downloading Chapter...'}</span>
            `;

            try {
              const options = {
                translation: {
                  enabled: isTranslationEnabled,
                  apiKey: apiKey || (isCustomMode ? 'sk-local' : ''),
                  prompt: promptEl ? promptEl.value : '',
                  model: selectedModel,
                  provider: curProvConfig.provider,
                  baseUrl: isCustomMode ? effectiveCustomUrl : undefined
                }
              };
              await window.StorageService.downloadChapter(novel.id, chapterNumber, options);
          if (aiConfigPanel && isTranslationEnabled && !isCustomMode) {
            aiConfigPanel.refreshBalance(true);
          }
              await loadChapterContent();
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('reader-chapter-refresh'));
              }
            } catch (err) {
              console.error('Download failed:', err);
              readerDownloadBtn.disabled = false;
              readerDownloadBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <polyline points="19 12 12 19 5 12"></polyline>
                </svg>
                <span>Failed. Click to Retry</span>
              `;
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
