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
  const chapterMainTitle = document.getElementById('chapter-main-title');
  const chapterBody = document.getElementById('chapter-body');

  // Bottom Navigation

  // Source Drawer Elements
  const sourceDrawer = document.getElementById('source-drawer');
  const closeSourceDrawerBtn = document.getElementById('close-source-drawer-btn');
  const copySourceBtn = document.getElementById('copy-source-btn');

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
      const percentEl = document.getElementById('reading-progress-percent');
      if (percentEl) percentEl.textContent = `${Math.round(progress)}%`;
    },
    { passive: true }
  );


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

    // --- Source Reference Drawer Controller ---
    function openSourceDrawer() {
      window.dispatchEvent(new Event('reader-open-source'));
    }

    function closeSourceDrawer() {
      window.dispatchEvent(new Event('reader-close-source'));
    }

    if (toggleSourceDrawerBtn) {
      toggleSourceDrawerBtn.addEventListener('click', () => {
        openSourceDrawer();
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
      const activeEl = document.activeElement;

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

      // Hotkey: S opens the original source drawer (if source exists)
      if ((e.key === 's' || e.key === 'S') && currentChapter && currentChapter.originalRawText) {
        e.preventDefault();
        openSourceDrawer();
        return;
      }

      // Hotkey: Escape closes source drawer if open
      if (e.key === 'Escape' && sourceDrawer && !sourceDrawer.classList.contains('translate-x-full')) {
        e.preventDefault();
        closeSourceDrawer();
        return;
      }

      // Navigation Shortcuts (Left / Right Arrow)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === '[' || e.key === ']') {
        const catalog = (novel.chapterList || []).slice().sort((a, b) => a.chapterNumber - b.chapterNumber);
        const idx = catalog.findIndex((c) => Number(c.chapterNumber) === chapterNumber);
        let target = null;
        if (e.key === 'ArrowLeft' || e.key === '[') {
          if (idx > 0) target = catalog[idx - 1].chapterNumber;
          else if (chapterNumber > 1) target = chapterNumber - 1;
        } else if (idx >= 0 && idx < catalog.length - 1) {
          target = catalog[idx + 1].chapterNumber;
        } else if (idx < 0 && (!novel.totalChapters || chapterNumber < novel.totalChapters)) {
          target = chapterNumber + 1;
        }
        if (target !== null) {
          e.preventDefault();
          window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(target)}`;
        }
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

        if ((chapter.originalRawText && chapter.originalRawText.trim() !== text.trim()) || chapter.translationCost || chapter.reasoningText) {
          if (toggleSourceDrawerBtn) toggleSourceDrawerBtn.classList.remove('hidden');
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
