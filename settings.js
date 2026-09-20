/**
 * QuickConverter - Settings Page Controller
 * Manages global defaults for DeepSeek AI, Reader Typography with Live Preview, and Storage Quotas.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // --- Navigation & Context-aware Return Setup ---
  initNavigation();

  // --- Sidebar Tab Switching ---
  initTabs();

  // --- DeepSeek AI Settings ---
  await initDeepSeekSettings();

  // --- Reader Typography & Appearance ---
  initReaderSettings();

  // --- Storage & Quota Management ---
  await initStorageStats();
});

// =========================================================================
// 1. Navigation & Context-aware Return
// =========================================================================
function initNavigation() {
  const backBtn = document.getElementById('settings-back-btn');
  const backText = document.getElementById('settings-back-text');
  if (!backBtn) return;

  const params = new URLSearchParams(window.location.search);
  const from = params.get('from');
  const id = params.get('id');
  const ch = params.get('ch');

  if (from === 'reader' && id && ch) {
    backBtn.href = `reader.html?id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`;
    if (backText) backText.textContent = `Back to Chapter ${ch}`;
    backBtn.title = `Return to Chapter ${ch}`;
  } else if (from === 'novel' && id) {
    backBtn.href = `novel.html?id=${encodeURIComponent(id)}`;
    if (backText) backText.textContent = 'Back to Novel';
    backBtn.title = 'Return to Novel Overview';
  } else if (from === 'library') {
    backBtn.href = 'library.html';
    if (backText) backText.textContent = 'Back to Library';
    backBtn.title = 'Return to Novel Library';
  } else {
    // Default fallback
    backBtn.href = 'library.html';
    if (backText) backText.textContent = 'Back to Library';
  }
}

// =========================================================================
// 2. Sidebar Tab Switching
// =========================================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.settings-nav-btn');
  const sections = document.querySelectorAll('.settings-tab-section');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update button visual styles
      tabButtons.forEach((b) => {
        b.classList.remove(
          'active',
          'border-indigo-500/30',
          'bg-indigo-600/15',
          'text-indigo-300',
          'font-semibold'
        );
        b.classList.add(
          'border-slate-800',
          'bg-slate-850',
          'text-slate-400',
          'font-medium'
        );
      });

      btn.classList.add(
        'active',
        'border-indigo-500/30',
        'bg-indigo-600/15',
        'text-indigo-300',
        'font-semibold'
      );
      btn.classList.remove(
        'border-slate-800',
        'bg-slate-850',
        'text-slate-400',
        'font-medium'
      );

      // Toggle corresponding section
      sections.forEach((sec) => {
        if (sec.id === `tab-content-${targetTab}`) {
          sec.classList.remove('hidden');
        } else {
          sec.classList.add('hidden');
        }
      });
    });
  });
}

// =========================================================================
// 3. DeepSeek AI Settings Controller
// =========================================================================
let balanceTracker = null;

async function initDeepSeekSettings() {
  if (typeof DeepSeekService === 'undefined') return;

  const masterToggle = document.getElementById('deepseek-master-toggle');
  const toggleBadge = document.getElementById('deepseek-toggle-badge');
  const radioFlash = document.getElementById('model-radio-flash');
  const radioChat = document.getElementById('model-radio-chat');
  const cardFlash = document.getElementById('model-card-flash');
  const cardChat = document.getElementById('model-card-chat');
  const apiKeyInput = document.getElementById('settings-api-key');
  const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility-btn');
  const testKeyBtn = document.getElementById('test-key-btn');
  const clearKeyBtn = document.getElementById('clear-key-btn');
  const rememberKeyCheckbox = document.getElementById('settings-remember-key');
  const keyStatusEl = document.getElementById('key-validation-status');
  const refreshBalanceBtn = document.getElementById('refresh-balance-btn');
  const customPromptEl = document.getElementById('settings-custom-prompt');
  const resetPromptBtn = document.getElementById('reset-prompt-btn');

  // --- A. Master Toggle ---
  const isEnabled = localStorage.getItem('quickconverter_deepseek_enabled') === 'true';
  if (masterToggle) {
    masterToggle.checked = isEnabled;
    updateToggleBadge(isEnabled);
    masterToggle.addEventListener('change', () => {
      localStorage.setItem('quickconverter_deepseek_enabled', masterToggle.checked ? 'true' : 'false');
      updateToggleBadge(masterToggle.checked);
      triggerSaveIndicator('Translation preference saved');
    });
  }

  function updateToggleBadge(enabled) {
    if (!toggleBadge) return;
    if (enabled) {
      toggleBadge.textContent = 'Active';
      toggleBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    } else {
      toggleBadge.textContent = 'Disabled';
      toggleBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-400 border border-slate-600';
    }
  }

  // --- B. Model Selection ---
  const savedModel = localStorage.getItem('quickconverter_deepseek_model') || 'deepseek-flash';
  if (savedModel === 'deepseek-chat') {
    if (radioChat) radioChat.checked = true;
    updateModelCards('deepseek-chat');
  } else {
    if (radioFlash) radioFlash.checked = true;
    updateModelCards('deepseek-flash');
  }

  [radioFlash, radioChat].forEach((radio) => {
    if (radio) {
      radio.addEventListener('change', () => {
        const val = radio.value;
        localStorage.setItem('quickconverter_deepseek_model', val);
        updateModelCards(val);
        triggerSaveIndicator(`Default model set to ${val === 'deepseek-flash' ? 'Flash' : 'Chat'}`);
      });
    }
  });

  function updateModelCards(selectedModel) {
    if (cardFlash && cardChat) {
      if (selectedModel === 'deepseek-flash') {
        cardFlash.className = 'flex flex-col gap-2 p-4 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
        cardChat.className = 'flex flex-col gap-2 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';
      } else {
        cardFlash.className = 'flex flex-col gap-2 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';
        cardChat.className = 'flex flex-col gap-2 p-4 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
      }
    }
  }

  // --- C. API Key & Storage ---
  const rememberKey = localStorage.getItem('quickconverter_deepseek_key_storage') !== 'session';
  if (rememberKeyCheckbox) {
    rememberKeyCheckbox.checked = rememberKey;
  }

  try {
    const keyData = await DeepSeekService.getApiKey();
    const existingKey = typeof keyData === 'object' ? keyData.apiKey : keyData;
    const isRemembered = typeof keyData === 'object' ? keyData.remembered : false;

    if (existingKey && apiKeyInput) {
      apiKeyInput.value = existingKey;
      if (keyStatusEl) {
        keyStatusEl.textContent = '● Key configured';
        keyStatusEl.className = 'text-xs font-medium text-emerald-400';
      }
    }
    if (rememberKeyCheckbox && typeof isRemembered === 'boolean') {
      rememberKeyCheckbox.checked = isRemembered;
    }
  } catch (err) {
    console.error('Failed to load DeepSeek API key:', err);
  }

  // Toggle eye visibility
  if (toggleKeyVisibilityBtn && apiKeyInput) {
    toggleKeyVisibilityBtn.addEventListener('click', () => {
      if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
      } else {
        apiKeyInput.type = 'password';
      }
    });
  }

  // Remember Key checkbox change
  if (rememberKeyCheckbox && apiKeyInput) {
    rememberKeyCheckbox.addEventListener('change', async () => {
      const keyVal = apiKeyInput.value.trim();
      if (keyVal) {
        await DeepSeekService.setApiKey(keyVal, rememberKeyCheckbox.checked);
        triggerSaveIndicator(rememberKeyCheckbox.checked ? 'Key saved to local device' : 'Key saved for session only');
      }
    });
  }

  // Key Input auto-save on change / blur
  if (apiKeyInput) {
    const saveKeyNow = async () => {
      const val = apiKeyInput.value.trim();
      const shouldRemember = rememberKeyCheckbox ? rememberKeyCheckbox.checked : true;
      if (val) {
        await DeepSeekService.setApiKey(val, shouldRemember);
        triggerSaveIndicator('API Key updated');
        if (balanceTracker) balanceTracker.refresh(true);
      }
    };
    apiKeyInput.addEventListener('change', saveKeyNow);
  }

  // Clear Key Button
  if (clearKeyBtn && apiKeyInput) {
    clearKeyBtn.addEventListener('click', async () => {
      await DeepSeekService.clearApiKey();
      apiKeyInput.value = '';
      if (keyStatusEl) {
        keyStatusEl.textContent = 'Key removed';
        keyStatusEl.className = 'text-xs font-medium text-slate-400';
      }
      updateBalanceDisplay({ success: false, isAvailable: false });
      triggerSaveIndicator('API Key cleared');
    });
  }

  // Verify Key Button
  if (testKeyBtn && apiKeyInput) {
    testKeyBtn.addEventListener('click', async () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        if (keyStatusEl) {
          keyStatusEl.textContent = 'Please enter an API key first';
          keyStatusEl.className = 'text-xs font-medium text-amber-400';
        }
        return;
      }

      testKeyBtn.disabled = true;
      testKeyBtn.textContent = 'Verifying...';
      if (keyStatusEl) {
        keyStatusEl.textContent = 'Contacting DeepSeek API...';
        keyStatusEl.className = 'text-xs font-medium text-indigo-400';
      }

      try {
        const balanceData = await DeepSeekService.getBalance(key, { force: true });
        if (!balanceData || !balanceData.success) {
          throw new Error(balanceData ? balanceData.error : 'Verification failed');
        }

        // Save the verified key
        const shouldRemember = rememberKeyCheckbox ? rememberKeyCheckbox.checked : true;
        await DeepSeekService.setApiKey(key, shouldRemember);

        if (keyStatusEl) {
          keyStatusEl.textContent = `✓ Verified (${balanceData.compact})`;
          keyStatusEl.className = 'text-xs font-medium text-emerald-400';
        }
        updateBalanceDisplay(balanceData);
        triggerSaveIndicator('Key verified successfully!');
      } catch (err) {
        console.error('Key verification error:', err);
        if (keyStatusEl) {
          keyStatusEl.textContent = `✕ Verification Failed: ${err.message}`;
          keyStatusEl.className = 'text-xs font-medium text-red-400';
        }
      } finally {
        testKeyBtn.disabled = false;
        testKeyBtn.textContent = 'Verify Key';
      }
    });
  }

  // --- D. Balance Polling & Refresh ---
  balanceTracker = DeepSeekService.createBalanceTracker(
    () => (apiKeyInput ? apiKeyInput.value.trim() : ''),
    (balanceInfo, isUpdating) => {
      const refreshIcon = document.getElementById('refresh-icon');
      if (refreshIcon) {
        refreshIcon.classList.toggle('animate-spin', !!isUpdating);
      }
      if (balanceInfo) {
        updateBalanceDisplay(balanceInfo);
      }
    }
  );

  if (apiKeyInput && apiKeyInput.value.trim()) {
    balanceTracker.refresh(true);
  }

  if (refreshBalanceBtn) {
    refreshBalanceBtn.addEventListener('click', async () => {
      if (balanceTracker) {
        await balanceTracker.refresh(true);
        triggerSaveIndicator('Balance refreshed');
      }
    });
  }

  // --- E. Custom Prompt ---
  const savedPrompt = localStorage.getItem('quickconverter_deepseek_prompt') || DeepSeekService.DEFAULT_PROMPT;
  if (customPromptEl) {
    customPromptEl.value = savedPrompt;
    customPromptEl.addEventListener('change', () => {
      localStorage.setItem('quickconverter_deepseek_prompt', customPromptEl.value.trim());
      triggerSaveIndicator('Default prompt updated');
    });
  }

  if (resetPromptBtn && customPromptEl) {
    resetPromptBtn.addEventListener('click', () => {
      customPromptEl.value = DeepSeekService.DEFAULT_PROMPT;
      localStorage.setItem('quickconverter_deepseek_prompt', DeepSeekService.DEFAULT_PROMPT);
      triggerSaveIndicator('Prompt reset to default');
    });
  }
}

function updateBalanceDisplay(data) {
  const balanceText = document.getElementById('settings-balance-text');
  const grantedText = document.getElementById('settings-granted-text');
  const headerBadge = document.getElementById('deepseek-header-balance');
  const headerVal = document.getElementById('deepseek-header-balance-val');

  if (!data || !data.success || !data.isAvailable) {
    if (balanceText) {
      if (data && data.success && !data.isAvailable) {
        balanceText.textContent = `${data.compact || '$0.00'} (No Funds)`;
      } else {
        balanceText.textContent = 'No Balance Available';
      }
    }
    if (grantedText) {
      grantedText.textContent = data && data.error ? `(${data.error})` : '(Key not set or invalid)';
    }
    if (headerVal) headerVal.textContent = 'Unconfigured';
    return;
  }

  const total = parseFloat(data.totalBalance || '0').toFixed(2);
  const granted = parseFloat(data.grantedBalance || '0').toFixed(2);
  const currency = data.currency || 'USD';
  const symbol = data.currencySymbol || '$';

  if (balanceText) {
    balanceText.textContent = `${symbol}${total} ${currency}`;
  }
  if (grantedText) {
    grantedText.textContent = `(Includes ${symbol}${granted} granted)`;
  }
  if (headerVal) {
    headerVal.textContent = `${symbol}${total}`;
  }
  if (headerBadge) {
    headerBadge.classList.remove('hidden');
    headerBadge.classList.add('inline-flex');
  }
}

// =========================================================================
// 4. Reader Typography & Appearance Controller
// =========================================================================
function initReaderSettings() {
  const fontFamilySelect = document.getElementById('reader-font-family');
  const columnWidthSelect = document.getElementById('reader-column-width');
  const fontSizeSlider = document.getElementById('reader-font-size');
  const fontSizeVal = document.getElementById('font-size-val');
  const fontSizeDec = document.getElementById('font-size-dec');
  const fontSizeInc = document.getElementById('font-size-inc');
  const lineHeightSelect = document.getElementById('reader-line-height');
  const themeButtons = document.querySelectorAll('.theme-picker-btn');
  const resetDefaultsBtn = document.getElementById('reset-reader-defaults-btn');

  // Load saved preferences with sensible defaults
  const currentFont = localStorage.getItem('quickconverter_reader_font_family') || 'sans';
  const currentWidth = localStorage.getItem('quickconverter_reader_column_width') || 'standard';
  const currentSize = parseInt(localStorage.getItem('quickconverter_reader_font_size'), 10) || 18;
  const currentLineHeight = localStorage.getItem('quickconverter_reader_line_height') || 'relaxed';
  const currentTheme = localStorage.getItem('quickconverter_reader_theme') || 'slate';

  if (fontFamilySelect) fontFamilySelect.value = currentFont;
  if (columnWidthSelect) columnWidthSelect.value = currentWidth;
  if (fontSizeSlider) fontSizeSlider.value = currentSize;
  if (fontSizeVal) fontSizeVal.textContent = `${currentSize}px`;
  if (lineHeightSelect) lineHeightSelect.value = currentLineHeight;
  updateThemeButtonsUI(currentTheme);

  // Render initial live preview
  updateReaderPreview();

  // Font family change
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', () => {
      localStorage.setItem('quickconverter_reader_font_family', fontFamilySelect.value);
      updateReaderPreview();
      triggerSaveIndicator('Font family updated');
    });
  }

  // Column width change
  if (columnWidthSelect) {
    columnWidthSelect.addEventListener('change', () => {
      localStorage.setItem('quickconverter_reader_column_width', columnWidthSelect.value);
      updateReaderPreview();
      triggerSaveIndicator('Column width updated');
    });
  }

  // Line height change
  if (lineHeightSelect) {
    lineHeightSelect.addEventListener('change', () => {
      localStorage.setItem('quickconverter_reader_line_height', lineHeightSelect.value);
      updateReaderPreview();
      triggerSaveIndicator('Line spacing updated');
    });
  }

  // Font size slider & step buttons
  const setFontSize = (newSize) => {
    const clamped = Math.max(14, Math.min(28, newSize));
    if (fontSizeSlider) fontSizeSlider.value = clamped;
    if (fontSizeVal) fontSizeVal.textContent = `${clamped}px`;
    localStorage.setItem('quickconverter_reader_font_size', clamped.toString());
    updateReaderPreview();
  };

  if (fontSizeSlider) {
    fontSizeSlider.addEventListener('input', () => {
      setFontSize(parseInt(fontSizeSlider.value, 10));
    });
    fontSizeSlider.addEventListener('change', () => {
      triggerSaveIndicator(`Font size set to ${fontSizeSlider.value}px`);
    });
  }

  if (fontSizeDec) {
    fontSizeDec.addEventListener('click', () => {
      const cur = parseInt(fontSizeSlider ? fontSizeSlider.value : 18, 10);
      setFontSize(cur - 1);
      triggerSaveIndicator(`Font size: ${cur - 1}px`);
    });
  }

  if (fontSizeInc) {
    fontSizeInc.addEventListener('click', () => {
      const cur = parseInt(fontSizeSlider ? fontSizeSlider.value : 18, 10);
      setFontSize(cur + 1);
      triggerSaveIndicator(`Font size: ${cur + 1}px`);
    });
  }

  // Theme Pickers
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      localStorage.setItem('quickconverter_reader_theme', theme);
      updateThemeButtonsUI(theme);
      updateReaderPreview();
      triggerSaveIndicator(`Theme preset applied: ${theme}`);
    });
  });

  function updateThemeButtonsUI(activeTheme) {
    themeButtons.forEach((btn) => {
      const theme = btn.getAttribute('data-theme');
      if (theme === activeTheme) {
        btn.classList.add('border-2', 'border-indigo-500');
        btn.classList.remove('border-slate-700', 'border-amber-800/40', 'border-emerald-900/40');
      } else {
        btn.classList.remove('border-2', 'border-indigo-500');
        if (theme === 'sepia') btn.classList.add('border', 'border-amber-800/40');
        else if (theme === 'forest') btn.classList.add('border', 'border-emerald-900/40');
        else btn.classList.add('border', 'border-slate-700');
      }
    });
  }

  // Reset defaults
  if (resetDefaultsBtn) {
    resetDefaultsBtn.addEventListener('click', () => {
      localStorage.setItem('quickconverter_reader_font_family', 'sans');
      localStorage.setItem('quickconverter_reader_column_width', 'standard');
      localStorage.setItem('quickconverter_reader_font_size', '18');
      localStorage.setItem('quickconverter_reader_line_height', 'relaxed');
      localStorage.setItem('quickconverter_reader_theme', 'slate');

      if (fontFamilySelect) fontFamilySelect.value = 'sans';
      if (columnWidthSelect) columnWidthSelect.value = 'standard';
      setFontSize(18);
      if (lineHeightSelect) lineHeightSelect.value = 'relaxed';
      updateThemeButtonsUI('slate');
      updateReaderPreview();
      triggerSaveIndicator('Reader settings reset to defaults');
    });
  }
}

// Live interactive typography preview renderer
function updateReaderPreview() {
  const container = document.getElementById('typography-preview-container');
  const textEl = document.getElementById('typography-preview-text');
  if (!container || !textEl) return;

  const font = localStorage.getItem('quickconverter_reader_font_family') || 'sans';
  const size = parseInt(localStorage.getItem('quickconverter_reader_font_size'), 10) || 18;
  const lineHeight = localStorage.getItem('quickconverter_reader_line_height') || 'relaxed';
  const theme = localStorage.getItem('quickconverter_reader_theme') || 'slate';

  // Apply Theme styling to preview container
  if (theme === 'oled') {
    container.style.backgroundColor = '#000000';
    container.style.color = '#f4f4f5';
    container.style.borderColor = '#27272a';
  } else if (theme === 'sepia') {
    container.style.backgroundColor = '#fbf0d9';
    container.style.color = '#382a1d';
    container.style.borderColor = '#d5c3aa';
  } else if (theme === 'forest') {
    container.style.backgroundColor = '#0d1712';
    container.style.color = '#e2f2e9';
    container.style.borderColor = '#1d3b2a';
  } else {
    // Default Slate
    container.style.backgroundColor = '#0f172a';
    container.style.color = '#f8fafc';
    container.style.borderColor = '#334155';
  }

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
      case 'mono':
        return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Code", "Courier New", monospace';
      case 'sans':
      default:
        return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    }
  }

  // Apply Font Family
  textEl.style.fontFamily = resolveFontFamilyCss(font);

  // Apply Font Size
  textEl.style.fontSize = `${size}px`;

  // Apply Line Height
  if (lineHeight === 'compact') {
    textEl.style.lineHeight = '1.5';
  } else if (lineHeight === 'spacious') {
    textEl.style.lineHeight = '2.0';
  } else {
    textEl.style.lineHeight = '1.75';
  }
}

// =========================================================================
// 5. Storage & Quota Management Controller
// =========================================================================
async function initStorageStats() {
  if (typeof StorageService === 'undefined') return;

  const refreshBtn = document.getElementById('refresh-storage-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Calculating...';
      await loadStorageData();
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Recalculate';
      triggerSaveIndicator('Storage usage recalculated');
    });
  }

  await loadStorageData();
}

async function loadStorageData() {
  const usedDisplay = document.getElementById('storage-used-display');
  const quotaDisplay = document.getElementById('storage-quota-display');
  const progressBar = document.getElementById('storage-progress-bar');
  const percentDisplay = document.getElementById('storage-percent-display');
  const novelCountEl = document.getElementById('storage-novel-count');
  const chapterCountEl = document.getElementById('storage-chapter-count');

  try {
    const disk = await StorageService.getDiskUsage();
    const getNovelsFn = StorageService.getManagedNovels || StorageService.getAllNovels;
    const novels = getNovelsFn ? await getNovelsFn.call(StorageService) : [];

    if (novelCountEl) novelCountEl.textContent = novels.length.toString();
    if (chapterCountEl) chapterCountEl.textContent = (disk.totalDownloadedChapters || 0).toString();

    if (usedDisplay) usedDisplay.textContent = `${disk.formatted} used`;
    if (quotaDisplay) quotaDisplay.textContent = `Quota: ~${disk.formattedQuota || '120 GB'}`;

    let percent = 0.01;
    if (disk.percentOfQuota) {
      percent = Math.max(0.01, parseFloat(disk.percentOfQuota));
    } else if (disk.quotaBytes && disk.quotaBytes > 0) {
      percent = Math.max(0.01, (disk.bytes / disk.quotaBytes) * 100);
    }

    if (progressBar) {
      progressBar.style.width = `${Math.min(100, Math.max(1, percent))}%`;
    }
    if (percentDisplay) {
      percentDisplay.textContent = `${percent.toFixed(2)}% of browser quota utilized`;
    }
  } catch (err) {
    console.error('Failed to load storage data:', err);
    if (usedDisplay) usedDisplay.textContent = 'Storage unavailable';
  }
}

// =========================================================================
// 6. UI Notification & Toast Helpers
// =========================================================================
let toastTimeout = null;

function triggerSaveIndicator(message = 'Settings saved') {
  const pill = document.getElementById('settings-save-pill');
  if (pill) {
    pill.classList.remove('opacity-0');
    setTimeout(() => {
      pill.classList.add('opacity-0');
    }, 1800);
  }

  const toast = document.getElementById('settings-toast');
  const toastMsg = document.getElementById('settings-toast-msg');
  if (toast && toastMsg) {
    toastMsg.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('translate-y-20', 'opacity-0');
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 2200);
  }
}
