document.addEventListener('DOMContentLoaded', async () => {
  // Views
  const viewMain = document.getElementById('view-main');
  const viewNovel = document.getElementById('view-novel');
  const backToMainBtn = document.getElementById('back-to-main-btn');

  // Main View Elements
  const badgeEl = document.getElementById('badge');
  const siteHostEl = document.getElementById('site-host');
  const statusMsgEl = document.getElementById('status-message');
  const statusActionEl = document.getElementById('status-action');
  const novelListEl = document.getElementById('novel-list');
  const novelCountEl = document.getElementById('novel-count');
  const openLibraryBtn = document.getElementById('open-library-btn');

  // Novel Detail View Elements
  const popupNovelThumb = document.getElementById('popup-novel-thumb');
  const popupNovelTitle = document.getElementById('popup-novel-title');
  const popupNovelDomain = document.getElementById('popup-novel-domain');
  const popupNovelStats = document.getElementById('popup-novel-stats');
  const popupChapterCount = document.getElementById('popup-chapter-count');
  const popupChapterList = document.getElementById('popup-chapter-list');
  const settingsBtn = document.getElementById('settings-btn');
  const novelSettingsBtn = document.getElementById('novel-settings-btn');

  // Settings button handlers
  [settingsBtn, novelSettingsBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => {
        const settingsUrl =
          typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
            ? chrome.runtime.getURL('views/settings.html')
            : 'settings.html';
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: settingsUrl });
        } else {
          window.open(settingsUrl, '_blank');
        }
      });
    }
  });

  // --- DeepSeek Translation UI Wiring ---
  let currentActiveNovel = null;
  let updateNovelPromptUI = null;
  let popupBalanceTracker = null;

  function initDeepSeekUI() {
    const toggleEl = document.getElementById('deepseek-toggle');
    const badgeEl = document.getElementById('deepseek-toggle-badge');
    const keyEl = document.getElementById('deepseek-api-key');
    const rememberKeyEl = document.getElementById('remember-deepseek-key');
    const clearKeyBtn = document.getElementById('clear-deepseek-btn');
    const promptEl = document.getElementById('deepseek-prompt');
    const visibilityBtn = document.getElementById('toggle-key-visibility');
    const fieldsEl = document.getElementById('deepseek-config-fields');
    const editPromptBtn = document.getElementById('edit-prompt-btn');
    const modelSelectEl = document.getElementById('deepseek-model-select');
    const testBtn = document.getElementById('test-deepseek-btn');
    const testStatusEl = document.getElementById('deepseek-test-status');

    // Provider Selector Elements
    const providerBtnOfficial = document.getElementById('popup-provider-btn-official');
    const providerBtnCustom = document.getElementById('popup-provider-btn-custom');
    const providerBadgeEl = document.getElementById('popup-provider-badge');
    const customApiRow = document.getElementById('popup-custom-api-row');
    const customBaseUrlInput = document.getElementById('popup-custom-base-url');
    const bridgePresetBtn = document.getElementById('popup-bridge-preset-btn');
    const testCustomBtn = document.getElementById('popup-test-custom-btn');
    const customTestStatusEl = document.getElementById('popup-custom-test-status');
    const apiKeyLabelEl = document.getElementById('popup-api-key-label');

    // Balance Widget Elements
    const balanceBadgeEl = document.getElementById('deepseek-balance-badge');
    const balanceTextEl = document.getElementById('deepseek-balance-text');
    const refreshBalanceBtn = document.getElementById('deepseek-refresh-balance-btn');
    const refreshBalanceIcon = document.getElementById('deepseek-refresh-balance-icon');

    if (!toggleEl) return;

    const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
      (typeof DeepSeekService !== 'undefined' && DeepSeekService);

    let providerConfig = { provider: 'official', customUrl: 'http://127.0.0.1:8000/v1' };
    if (deepseek && typeof deepseek.getProviderConfig === 'function') {
      deepseek.getProviderConfig().then((cfg) => {
        providerConfig = cfg;
        applyProviderUI(cfg.provider, cfg.customUrl);
      }).catch((e) => console.warn('[popup.js] Failed to load provider config:', e));
    }

    function applyProviderUI(provider, customUrl) {
      const isCustom = provider !== 'official';
      if (providerBtnOfficial && providerBtnCustom) {
        if (isCustom) {
          providerBtnCustom.className = 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-purple-600 text-white shadow-sm';
          providerBtnOfficial.className = 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200';
        } else {
          providerBtnOfficial.className = 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-indigo-600 text-white shadow-sm';
          providerBtnCustom.className = 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200';
        }
      }
      if (providerBadgeEl) {
        if (isCustom) {
          providerBadgeEl.textContent = 'Custom API / Free';
          providerBadgeEl.className = 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30';
        } else {
          providerBadgeEl.textContent = 'Official Cloud';
          providerBadgeEl.className = 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        }
      }
      if (customApiRow) {
        if (isCustom) {
          customApiRow.classList.remove('hidden');
          customApiRow.classList.add('flex');
        } else {
          customApiRow.classList.add('hidden');
          customApiRow.classList.remove('flex');
        }
      }
      if (customBaseUrlInput && customUrl) {
        customBaseUrlInput.value = customUrl;
      }
      if (apiKeyLabelEl) {
        apiKeyLabelEl.textContent = isCustom ? '1. API Key (Optional for local)' : '1. DeepSeek API Key';
      }
      if (keyEl) {
        keyEl.placeholder = isCustom ? 'Optional (e.g. sk-... or leave blank for local)' : 'sk-...';
      }
      if (balanceBadgeEl && isCustom) {
        balanceBadgeEl.classList.add('hidden');
        balanceBadgeEl.classList.remove('inline-flex');
      }
      const pricingBadge = document.getElementById('deepseek-pricing-badge');
      if (pricingBadge) {
        if (isCustom) {
          pricingBadge.textContent = 'Free • Custom API';
          pricingBadge.className = 'text-[9px] font-semibold px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/15 text-purple-300';
          pricingBadge.title = 'Custom API / Local Bridge: No token fees charged to QuickConverter';
        } else if (deepseek && typeof deepseek.getPricingStatus === 'function') {
          const pStatus = deepseek.getPricingStatus();
          pricingBadge.textContent = pStatus.label;
          pricingBadge.className = `text-[9px] font-semibold px-1.5 py-0.5 rounded border ${pStatus.badgeClass}`;
          pricingBadge.title = `${pStatus.windowDesc} • Auto-applied UTC Schedule`;
        }
      }
    }

    if (providerBtnOfficial) {
      providerBtnOfficial.addEventListener('click', async () => {
        if (deepseek && typeof deepseek.setProviderConfig === 'function') {
          providerConfig = await deepseek.setProviderConfig({ provider: 'official' });
        }
        applyProviderUI('official', providerConfig.customUrl);
        if (popupBalanceTracker) popupBalanceTracker.refresh(true);
      });
    }

    if (providerBtnCustom) {
      providerBtnCustom.addEventListener('click', async () => {
        const customUrlVal = customBaseUrlInput ? (customBaseUrlInput.value.trim() || 'http://127.0.0.1:8000/v1') : 'http://127.0.0.1:8000/v1';
        if (deepseek && typeof deepseek.setProviderConfig === 'function') {
          providerConfig = await deepseek.setProviderConfig({ provider: 'custom', customUrl: customUrlVal });
        }
        applyProviderUI('custom', customUrlVal);
      });
    }

    if (customBaseUrlInput) {
      customBaseUrlInput.addEventListener('change', async () => {
        const val = customBaseUrlInput.value.trim() || 'http://127.0.0.1:8000/v1';
        if (deepseek && typeof deepseek.setProviderConfig === 'function') {
          providerConfig = await deepseek.setProviderConfig({ customUrl: val });
        }
        applyProviderUI(providerConfig.provider, val);
      });
    }

    if (bridgePresetBtn && customBaseUrlInput) {
      bridgePresetBtn.addEventListener('click', async () => {
        customBaseUrlInput.value = 'http://127.0.0.1:8000/v1';
        if (deepseek && typeof deepseek.setProviderConfig === 'function') {
          providerConfig = await deepseek.setProviderConfig({ customUrl: 'http://127.0.0.1:8000/v1' });
        }
        applyProviderUI(providerConfig.provider, 'http://127.0.0.1:8000/v1');
      });
    }

    if (testCustomBtn && customBaseUrlInput && customTestStatusEl) {
      testCustomBtn.addEventListener('click', async () => {
        const targetUrl = customBaseUrlInput.value.trim() || 'http://127.0.0.1:8000/v1';
        testCustomBtn.disabled = true;
        testCustomBtn.textContent = 'Testing...';
        customTestStatusEl.className = 'text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-1 rounded flex items-center gap-1.5 block mt-1';
        customTestStatusEl.innerHTML = `
          <svg class="animate-spin h-3 w-3 text-purple-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Pinging ${targetUrl}/models...</span>
        `;

        try {
          const key = keyEl ? keyEl.value.trim() : '';
          const res = await deepseek.testConnection(key, { provider: 'custom', baseUrl: targetUrl });
          if (res.success) {
            customTestStatusEl.className = 'text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded block mt-1';
            customTestStatusEl.textContent = `✓ Custom API connected! (${(res.models || []).length} models ready)`;
            if (modelSelectEl && Array.isArray(res.models) && res.models.length > 0) {
              const curModel = modelSelectEl.value;
              modelSelectEl.innerHTML = '';
              res.models.forEach((mId) => {
                const opt = document.createElement('option');
                opt.value = mId;
                let label = mId;
                if (mId === 'deepseek-flash') label += ' (V4.1-Flash • Fast)';
                else if (mId === 'deepseek-chat') label += ' (V3 • Standard)';
                else if (mId === 'deepseek-reasoner') label += ' (R1 • DeepThink)';
                opt.textContent = label;
                if (mId === curModel) opt.selected = true;
                modelSelectEl.appendChild(opt);
              });
            }
          } else {
            customTestStatusEl.className = 'text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded block mt-1';
            customTestStatusEl.textContent = `✗ ${res.error || 'Connection failed'}`;
          }
        } catch (err) {
          customTestStatusEl.className = 'text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded block mt-1';
          customTestStatusEl.textContent = `✗ Connection failed: ${err.message}`;
        } finally {
          testCustomBtn.disabled = false;
          testCustomBtn.textContent = 'Ping';
        }
      });
    }

    const updateBalanceUI = (balanceInfo, isUpdating) => {
      if (!balanceBadgeEl) return;
      if (providerConfig.provider !== 'official') {
        balanceBadgeEl.classList.add('hidden');
        balanceBadgeEl.classList.remove('inline-flex');
        return;
      }
      if (refreshBalanceIcon) {
        refreshBalanceIcon.classList.toggle('animate-spin', !!isUpdating);
      }
      if (isUpdating && !balanceInfo) {
        return;
      }
      if (!balanceInfo || !balanceInfo.success) {
        if (!keyEl || !keyEl.value.trim()) {
          balanceBadgeEl.classList.add('hidden');
          balanceBadgeEl.classList.remove('inline-flex');
        } else if (balanceInfo && balanceInfo.error) {
          balanceBadgeEl.classList.remove('hidden');
          balanceBadgeEl.classList.add('inline-flex');
          balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 select-none';
          if (balanceTextEl) balanceTextEl.textContent = 'Auth Error';
          balanceBadgeEl.title = balanceInfo.error;
        }
        return;
      }

      balanceBadgeEl.classList.remove('hidden');
      balanceBadgeEl.classList.add('inline-flex');

      if (!balanceInfo.isAvailable || balanceInfo.numericBalance <= 0) {
        balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 select-none';
        if (balanceTextEl) balanceTextEl.textContent = `${balanceInfo.compact} (No Funds)`;
        balanceBadgeEl.title = `DeepSeek Account Balance: ${balanceInfo.formatted} • Insufficient credits`;
      } else if (balanceInfo.isLow) {
        balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 select-none';
        if (balanceTextEl) balanceTextEl.textContent = `${balanceInfo.compact} (Low)`;
        balanceBadgeEl.title = `DeepSeek Account Balance: ${balanceInfo.formatted} • Low balance warning`;
      } else {
        balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none';
        if (balanceTextEl) balanceTextEl.textContent = balanceInfo.compact;
        balanceBadgeEl.title = `DeepSeek Account Balance: ${balanceInfo.formatted} (Click to refresh)`;
      }
    };

    if (deepseek && typeof deepseek.createBalanceTracker === 'function') {
      popupBalanceTracker = deepseek.createBalanceTracker(
        () => (keyEl ? keyEl.value.trim() : ''),
        updateBalanceUI
      );
    }

    if (refreshBalanceBtn && popupBalanceTracker) {
      refreshBalanceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        popupBalanceTracker.refresh(true);
      });
    }

    const updateClearBtnVisibility = () => {
      const hasKey = !!(keyEl && keyEl.value.trim());
      if (clearKeyBtn) {
        clearKeyBtn.classList.toggle('hidden', !hasKey);
      }
    };

    // Load API key from session storage (or local storage if remembered)
    if (deepseek && typeof deepseek.getApiKey === 'function') {
      deepseek.getApiKey().then(({ apiKey, remembered }) => {
        if (keyEl && apiKey) {
          keyEl.value = apiKey;
        }
        if (rememberKeyEl) {
          rememberKeyEl.checked = !!remembered;
        }
        updateClearBtnVisibility();
        if (popupBalanceTracker && apiKey) {
          popupBalanceTracker.refresh(false);
        }
      }).catch((e) => console.warn('[popup.js] Failed to load DeepSeek API key:', e));
    }

    let keyDebounceTimer = null;
    const handleKeyChange = () => {
      updateClearBtnVisibility();
      const val = keyEl ? keyEl.value.trim() : '';
      const remember = !!(rememberKeyEl && rememberKeyEl.checked);
      if (deepseek && typeof deepseek.setApiKey === 'function') {
        deepseek.setApiKey(val, remember);
      }
      if (!val) {
        updateBalanceUI(null, false);
      } else {
        clearTimeout(keyDebounceTimer);
        keyDebounceTimer = setTimeout(() => {
          if (popupBalanceTracker) popupBalanceTracker.refresh(true);
        }, 600);
      }
    };

    if (keyEl) {
      keyEl.addEventListener('input', handleKeyChange);
      keyEl.addEventListener('change', handleKeyChange);
    }

    if (rememberKeyEl) {
      rememberKeyEl.addEventListener('change', () => {
        if (deepseek && typeof deepseek.setApiKey === 'function') {
          const val = keyEl ? keyEl.value.trim() : '';
          deepseek.setApiKey(val, rememberKeyEl.checked);
        }
      });
    }

    if (clearKeyBtn) {
      clearKeyBtn.addEventListener('click', async () => {
        if (deepseek && typeof deepseek.clearApiKey === 'function') {
          await deepseek.clearApiKey();
        }
        if (keyEl) keyEl.value = '';
        if (rememberKeyEl) rememberKeyEl.checked = false;
        updateClearBtnVisibility();
        updateBalanceUI(null, false);
        if (testStatusEl) {
          testStatusEl.className = 'hidden';
          testStatusEl.textContent = '';
        }
      });
    }

    const pricingBadgeEl = document.getElementById('deepseek-pricing-badge');
    if (pricingBadgeEl && deepseek && typeof deepseek.getPricingStatus === 'function') {
      const pStatus = deepseek.getPricingStatus();
      pricingBadgeEl.textContent = pStatus.label;
      pricingBadgeEl.className = `text-[9px] font-semibold px-1.5 py-0.5 rounded border ${pStatus.badgeClass}`;
      pricingBadgeEl.title = `${pStatus.windowDesc} • Auto-applied UTC Schedule`;
    }

    const DEFAULT_PROMPT = 'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

    const getStored = (key, fallback) => {
      try {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
      } catch (e) {
        return fallback;
      }
    };

    const setStored = (key, val) => {
      try {
        localStorage.setItem(key, val);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [key]: val });
        }
      } catch (e) {}
    };

    const isEnabled = getStored('quickconverter_deepseek_enabled', 'false') === 'true';
    toggleEl.checked = isEnabled;

    const savedModel = getStored('quickconverter_deepseek_model', 'deepseek-flash');
    if (modelSelectEl) {
      modelSelectEl.value = savedModel;
      modelSelectEl.addEventListener('change', () => {
        setStored('quickconverter_deepseek_model', modelSelectEl.value);
      });
    }

    function updateState(checked) {
      if (badgeEl) {
        if (checked) {
          badgeEl.textContent = 'Active (Translates on Download)';
          badgeEl.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        } else {
          badgeEl.textContent = 'Off (Save Raw)';
          badgeEl.className = 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600';
        }
      }
      if (fieldsEl) {
        fieldsEl.classList.toggle('opacity-100', checked);
        fieldsEl.classList.toggle('opacity-60', !checked);
      }
    }

    updateState(isEnabled);

    toggleEl.addEventListener('change', () => {
      const checked = toggleEl.checked;
      setStored('quickconverter_deepseek_enabled', checked ? 'true' : 'false');
      updateState(checked);
    });

    if (visibilityBtn && keyEl) {
      visibilityBtn.addEventListener('click', () => {
        const isPassword = keyEl.type === 'password';
        keyEl.type = isPassword ? 'text' : 'password';
        visibilityBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }

    // "Test Key" button click handler
    if (testBtn && keyEl && testStatusEl) {
      testBtn.addEventListener('click', async () => {
        const key = keyEl.value.trim();
        if (!key) {
          testStatusEl.className = 'text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded block mt-1';
          testStatusEl.textContent = 'Please enter an API key to test.';
          keyEl.focus();
          return;
        }

        testBtn.disabled = true;
        testStatusEl.className = 'text-[10px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded flex items-center gap-1.5 block mt-1';
        testStatusEl.innerHTML = `
          <svg class="animate-spin h-3 w-3 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Testing connection...</span>
        `;

        try {
          const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
            (typeof DeepSeekService !== 'undefined' && DeepSeekService);

          if (!deepseek || typeof deepseek.testConnection !== 'function') {
            throw new Error('DeepSeekService not loaded');
          }

          const res = await deepseek.testConnection(key);
          if (res.success) {
            const currentSelected = (modelSelectEl && modelSelectEl.value) || savedModel;
            if (modelSelectEl && Array.isArray(res.models) && res.models.length > 0) {
              modelSelectEl.innerHTML = '';
              res.models.forEach((mId) => {
                const opt = document.createElement('option');
                opt.value = mId;
                opt.textContent = mId + (mId === 'deepseek-flash' ? ' (V4.1-Flash • Fast)' : (mId === 'deepseek-chat' ? ' (V3 • Standard)' : ''));
                if (mId === currentSelected || (!currentSelected && mId === 'deepseek-flash')) {
                  opt.selected = true;
                }
                modelSelectEl.appendChild(opt);
              });
            }

            const balStr = res.balance ? ` • Balance: ${res.balance.totalBalance === 'Available' ? 'Available' : '$' + res.balance.totalBalance}` : '';
            testStatusEl.className = 'text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded block mt-1';
            testStatusEl.textContent = `✓ Connected (${(res.models || []).length} models${balStr})`;
          } else {
            testStatusEl.className = 'text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded block mt-1';
            testStatusEl.textContent = `✗ ${res.error || 'Connection failed'}`;
          }
        } catch (e) {
          testStatusEl.className = 'text-[10px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded block mt-1';
          testStatusEl.textContent = `✗ ${e.message || 'Error testing connection'}`;
        } finally {
          testBtn.disabled = false;
        }
      });
    }

    // Translation Prompt: saved per novel with Edit button
    let isEditingPrompt = false;

    updateNovelPromptUI = (novel) => {
      if (!promptEl) return;
      promptEl.value = (novel && novel.translationPrompt) ? novel.translationPrompt : DEFAULT_PROMPT;
      promptEl.readOnly = true;
      promptEl.className = 'w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed cursor-default';
      if (editPromptBtn) {
        editPromptBtn.textContent = 'Edit';
        editPromptBtn.className = 'text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60';
      }
      isEditingPrompt = false;
    };

    if (editPromptBtn && promptEl) {
      editPromptBtn.addEventListener('click', async () => {
        if (!currentActiveNovel) return;

        if (isEditingPrompt) {
          // Save prompt to novel record in IndexedDB
          const updatedPrompt = promptEl.value.trim() || DEFAULT_PROMPT;
          currentActiveNovel.translationPrompt = updatedPrompt;
          await window.StorageService.updateNovel(currentActiveNovel.id, { translationPrompt: updatedPrompt });

          promptEl.readOnly = true;
          promptEl.className = 'w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed cursor-default';
          editPromptBtn.textContent = 'Saved ✓';
          editPromptBtn.className = 'text-[10px] font-semibold text-emerald-400 px-1.5 py-0.5 rounded';
          setTimeout(() => {
            editPromptBtn.textContent = 'Edit';
            editPromptBtn.className = 'text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60';
          }, 1500);
          isEditingPrompt = false;
        } else {
          // Enter edit mode
          isEditingPrompt = true;
          promptEl.readOnly = false;
          promptEl.className = 'w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-indigo-500 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none ring-1 ring-indigo-500/50 transition resize-none leading-relaxed';
          promptEl.focus();
          promptEl.setSelectionRange(promptEl.value.length, promptEl.value.length);
          editPromptBtn.textContent = 'Save';
          editPromptBtn.className = 'text-[10px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer px-2 py-0.5 rounded shadow-sm';
        }
      });
    }
  }

  initDeepSeekUI();

  // --- Novel & URL Detection Helpers ---
  function formatSlugToTitle(slug) {
    if (!slug) return '';
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\bRegressors\b/i, "Regressor’s")
      .replace(/\bAcademys\b/i, "Academy’s");
  }

  function extractNovelInfo(urlStr, pageTitle) {
    if (!urlStr) return null;
    try {
      if (typeof ProviderRegistry === 'undefined') return null;
      const provider = ProviderRegistry.getProviderForUrl(urlStr);
      if (!provider) return null;

      const parsed = provider.parseUrl(urlStr);
      if (!parsed || !parsed.slug) return null;

      let title = '';
      if (pageTitle && typeof pageTitle === 'string') {
        const parts = pageTitle.split('-');
        if (parts.length > 0 && !parts[0].toLowerCase().includes('just a moment')) {
          title = parts[0].trim();
        }
      }
      title = provider.formatTitle(parsed.slug, title);

      return {
        slug: parsed.slug,
        title: title || formatSlugToTitle(parsed.slug),
        chapterNumber: parsed.chapterNumber,
        url: parsed.seriesUrl || urlStr,
        domain: provider.domains ? provider.domains[0] : (new URL(urlStr).hostname),
        icon: '📚',
        providerName: provider.name
      };
    } catch (e) {
      console.warn('Error parsing novel URL:', e);
    }
    return null;
  }

  // --- Query Active Tab ---
  let currentUrl = null;
  let tabTitle = '';

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentUrl = tab.url;
        tabTitle = tab.title || '';
      }
    } catch (e) {
      console.warn('Unable to query active tab:', e);
    }
  } else {
    currentUrl = window.location.href;
    tabTitle = document.title;
  }

  // --- View Switching ---
  function showMainView() {
    if (viewNovel) viewNovel.classList.add('hidden');
    if (viewMain) viewMain.classList.remove('hidden');
    refreshNovelsList();
    checkCurrentPageStatus();
  }

  async function showNovelDetailView(novelId) {
    if (!window.StorageService || !novelId) return;

    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) return;

    if (viewMain) viewMain.classList.add('hidden');
    if (viewNovel) viewNovel.classList.remove('hidden');

    // Populate Novel Info
    if (popupNovelTitle) popupNovelTitle.textContent = novel.title;
    if (popupNovelDomain) popupNovelDomain.textContent = novel.domain || 'wetriedtls.com';
    if (popupNovelThumb) {
      popupNovelThumb.src = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      popupNovelThumb.alt = novel.title;
    }

    // Populate Novel Translation Prompt
    currentActiveNovel = novel;
    if (typeof updateNovelPromptUI === 'function') {
      updateNovelPromptUI(currentActiveNovel);
    }

    // Load and render chapters
    await renderPopupChapters(novel);
  }

  async function renderPopupChapters(novel) {
    if (!window.StorageService || !novel) return;

    let chaptersCatalog = novel.chapterList || [];

    // If chapter catalog is empty but novel has slug/provider, fetch catalog
    if (chaptersCatalog.length === 0 && novel.slug) {
      if (popupChapterList) {
        popupChapterList.innerHTML = `
          <div class="p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Loading chapter catalog...</span>
          </div>
        `;
      }
      const updated = await window.StorageService.syncNovelChapters(novel.id);
      if (updated && updated.chapterList && updated.chapterList.length > 0) {
        novel = updated;
        chaptersCatalog = novel.chapterList;
      }
    }

    const downloadedChapters = await window.StorageService.getNovelChapters(novel.id);
    const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

    const totalChapters = novel.totalChapters || chaptersCatalog.length || 100;

    if (popupNovelStats) {
      popupNovelStats.textContent = `${downloadedChapters.length} / ${totalChapters} chapters downloaded`;
    }

    // Display items: use catalog if available; otherwise use downloaded chapters
    const displayList = chaptersCatalog.length > 0
      ? chaptersCatalog
      : downloadedChapters;

    if (popupChapterCount) {
      popupChapterCount.textContent = `${displayList.length} Chapters`;
    }

    if (!popupChapterList) return;

    if (displayList.length === 0) {
      popupChapterList.innerHTML = `
        <div class="p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-slate-500 italic">
          No chapters discovered yet.
        </div>
      `;
      return;
    }

    popupChapterList.innerHTML = '';

    displayList.forEach((chapter) => {
      const chNum = Number(chapter.chapterNumber);
      const isDownloaded = downloadedMap.has(chNum);

      const row = document.createElement('div');
      row.className = isDownloaded
        ? 'flex items-center justify-between p-2 rounded-md bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 transition group cursor-pointer'
        : 'flex items-center justify-between p-2 rounded-md bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition group';

      if (isDownloaded) {
        row.title = `Click to read ${chapter.title || 'Chapter ' + chNum}`;
        row.addEventListener('click', () => {
          const readerUrl = chrome.runtime && chrome.runtime.getURL
            ? chrome.runtime.getURL(`views/reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`)
            : `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`;
          if (chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: readerUrl });
          } else {
            window.open(readerUrl, '_blank');
          }
        });
      }

      // Left: Chapter number badge and chapter title/name
      const leftSection = document.createElement('div');
      leftSection.className = 'flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2';

      const chBadge = document.createElement('span');
      chBadge.className = isDownloaded
        ? 'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300 border border-indigo-500/30 flex-shrink-0'
        : 'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700/80 flex-shrink-0';
      chBadge.textContent = `Ch. ${chNum}`;

      const nameEl = document.createElement('span');
      nameEl.className = isDownloaded
        ? 'text-xs font-medium text-slate-100 truncate group-hover:text-indigo-300 transition'
        : 'text-xs font-medium text-slate-300 truncate group-hover:text-slate-200 transition';
      nameEl.textContent = chapter.title || `Chapter ${chNum}`;

      leftSection.appendChild(chBadge);
      leftSection.appendChild(nameEl);

      // Right: Action area (Download downward arrow button OR Saved badge + Delete button)
      const rightSection = document.createElement('div');
      rightSection.className = 'flex items-center gap-1.5 flex-shrink-0';

      if (isDownloaded) {
        const readHint = document.createElement('span');
        readHint.className = 'text-[10px] font-semibold text-indigo-400 group-hover:text-indigo-300 transition';
        readHint.textContent = 'Read';

        const savedBadge = document.createElement('span');
        savedBadge.className = 'text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20';
        savedBadge.textContent = 'Saved';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/80 transition focus:outline-none cursor-pointer flex-shrink-0';
        delBtn.title = `Delete Chapter ${chNum}`;
        delBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;

        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.StorageService.deleteChapter(novel.id, chNum);
          await renderPopupChapters(novel);
        });

        rightSection.appendChild(readHint);
        rightSection.appendChild(savedBadge);

        const downloadedChapter = downloadedMap.get(chNum);
        if (downloadedChapter && downloadedChapter.translationCost && downloadedChapter.translationCost.formattedCost) {
          const costBadge = document.createElement('span');
          costBadge.className = 'text-[10px] font-mono font-medium px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20';
          costBadge.textContent = downloadedChapter.translationCost.formattedCost;
          costBadge.title = `Translation Cost: ${downloadedChapter.translationCost.formattedCost} USD • ${downloadedChapter.translationCost.ratePeriod}`;
          rightSection.appendChild(costBadge);
        }

        rightSection.appendChild(delBtn);
      } else {
        // Download button with downward arrow icon
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'p-1.5 rounded text-indigo-400 hover:text-white hover:bg-indigo-600/80 bg-slate-700/60 transition focus:outline-none cursor-pointer flex-shrink-0 flex items-center justify-center';
        dlBtn.title = `Download Chapter ${chNum}`;
        dlBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        `;

        dlBtn.addEventListener('click', async (e) => {
          e.stopPropagation();

          const toggleEl = document.getElementById('deepseek-toggle');
          const keyEl = document.getElementById('deepseek-api-key');
          const promptEl = document.getElementById('deepseek-prompt');
          const modelSelectEl = document.getElementById('deepseek-model-select');

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
          const customUrlInputEl = document.getElementById('popup-custom-base-url');
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
                  const clearKeyBtn = document.getElementById('clear-deepseek-btn');
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

          dlBtn.disabled = true;
          dlBtn.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
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
            await window.StorageService.downloadChapter(novel.id, chNum, options);
            if (popupBalanceTracker && isTranslationEnabled && !isCustomMode) {
              popupBalanceTracker.refresh(true);
            }
            await renderPopupChapters(novel);
          } catch (err) {
            console.error('Error downloading chapter:', err);
            dlBtn.disabled = false;
            dlBtn.classList.add('text-red-400');
            dlBtn.title = err.message || 'Error downloading chapter';
            dlBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            `;
          }
        });

        rightSection.appendChild(dlBtn);
      }

      row.appendChild(leftSection);
      row.appendChild(rightSection);
      popupChapterList.appendChild(row);
    });
  }

  // --- Render Managed Novels List in Main View ---
  function renderNovels(novels) {
    if (!novelListEl || !novelCountEl) return;

    novelCountEl.textContent = `${novels.length} Novel${novels.length === 1 ? '' : 's'}`;
    novelListEl.innerHTML = '';

    if (novels.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-slate-500 italic';
      emptyCard.textContent = 'No novels currently managed.';
      novelListEl.appendChild(emptyCard);
      return;
    }

    novels.forEach((novel) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'flex items-center justify-between p-2.5 rounded-md bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 transition group cursor-pointer';
      itemEl.title = `Click to view chapters for ${novel.title}`;

      // Clicking novel item navigates into the in-popup novel view
      itemEl.addEventListener('click', () => {
        showNovelDetailView(novel.id);
      });

      const leftSection = document.createElement('div');
      leftSection.className = 'flex items-center gap-2.5 overflow-hidden flex-1 min-w-0 pr-2';

      const iconBox = document.createElement('div');
      iconBox.className = 'w-8 h-8 rounded bg-slate-700/80 border border-slate-600/50 flex items-center justify-center flex-shrink-0 text-base';
      iconBox.textContent = novel.icon || '📖';

      const textContainer = document.createElement('div');
      textContainer.className = 'flex flex-col overflow-hidden min-w-0';

      const titleEl = document.createElement('span');
      titleEl.className = 'text-sm font-medium text-slate-200 group-hover:text-indigo-300 transition truncate';
      titleEl.textContent = novel.title;

      const subEl = document.createElement('span');
      subEl.className = 'text-xs text-slate-400 truncate';
      const chText = novel.totalChapters ? `${novel.totalChapters} Chs &bull; ` : '';
      subEl.innerHTML = `${chText}${novel.domain || 'wetriedtls.com'} &bull; ${novel.status || 'Active'}`;

      textContainer.appendChild(titleEl);
      textContainer.appendChild(subEl);
      leftSection.appendChild(iconBox);
      leftSection.appendChild(textContainer);

      const rightSection = document.createElement('div');
      rightSection.className = 'flex items-center gap-2 flex-shrink-0';

      const statusBadge = document.createElement('span');
      statusBadge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
      statusBadge.textContent = novel.status || 'Active';

      // Delete novel button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/80 transition focus:outline-none cursor-pointer flex-shrink-0';
      deleteBtn.title = `Delete ${novel.title}`;
      deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.StorageService) {
          const updatedNovels = await window.StorageService.deleteNovel(novel.id);
          renderNovels(updatedNovels);
          checkCurrentPageStatus();
        }
      });

      rightSection.appendChild(statusBadge);
      rightSection.appendChild(deleteBtn);

      itemEl.appendChild(leftSection);
      itemEl.appendChild(rightSection);
      novelListEl.appendChild(itemEl);
    });
  }

  async function refreshNovelsList() {
    if (window.StorageService) {
      try {
        const novels = await window.StorageService.getManagedNovels();
        renderNovels(novels);
      } catch (err) {
        console.error('Failed to load managed novels:', err);
      }
    }
  }

  // --- Evaluate & Render Current Page Status ---
  async function checkCurrentPageStatus() {
    const novelInfo = extractNovelInfo(currentUrl, tabTitle);

    if (novelInfo) {
      siteHostEl.textContent = novelInfo.domain || 'wetriedtls.com';
      const novel = window.StorageService
        ? await window.StorageService.getNovelBySlug(novelInfo.slug)
        : null;

      const isAlreadyManaged = !!novel;

      // Case: Visiting a specific Chapter page
      if (novelInfo.chapterNumber !== null) {
        statusActionEl.innerHTML = '';
        statusActionEl.classList.add('hidden');

        let isChapterSaved = false;
        if (novel) {
          isChapterSaved = await window.StorageService.isChapterSaved(novel.id, novelInfo.chapterNumber);
        }

        if (isChapterSaved) {
          badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
          badgeEl.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Chapter Saved
          `;
          statusMsgEl.innerHTML = `
            <p class="font-medium text-slate-100 truncate">${novel.title}</p>
            <p class="text-xs text-emerald-400/90 mt-0.5">Chapter ${novelInfo.chapterNumber} is saved in QuickConverterDB.</p>
          `;
        } else {
          badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
          badgeEl.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            Chapter Loading
          `;
          statusMsgEl.innerHTML = `
            <p class="font-medium text-slate-100 truncate">${novel ? novel.title : novelInfo.title}</p>
            <p class="text-xs text-slate-400 mt-0.5">Chapter ${novelInfo.chapterNumber} is being checked/saved.</p>
          `;
        }
        return;
      }

      // Case: Visiting Series Overview page
      if (isAlreadyManaged) {
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badgeEl.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Already Managed
        `;
        statusMsgEl.innerHTML = `
          <p class="font-medium text-slate-100 truncate">${novel.title}</p>
          <p class="text-xs text-emerald-400/90 mt-0.5">${novel.totalChapters ? novel.totalChapters + ' Total Chapters &bull; ' : ''}Already under management.</p>
        `;
        statusActionEl.innerHTML = '';
        statusActionEl.classList.add('hidden');

        // Background metadata sync
        if (window.StorageService && novel.slug) {
          window.StorageService.syncNovelMetadata(novel.slug).then((synced) => {
            if (synced && synced.totalChapters !== novel.totalChapters) {
              refreshNovelsList();
            }
          }).catch(() => {});
        }
      } else {
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
        badgeEl.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
          Novel Detected
        `;
        statusMsgEl.innerHTML = `
          <p class="font-medium text-slate-100 truncate">${novelInfo.title}</p>
          <p class="text-xs text-slate-400 mt-0.5">This novel is not managed yet.</p>
        `;

        statusActionEl.innerHTML = `
          <button
            id="add-novel-btn"
            type="button"
            class="w-full cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white bg-indigo-500 transition hover:bg-indigo-600 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Manage This Novel</span>
          </button>
        `;
        statusActionEl.classList.remove('hidden');

        const addBtn = document.getElementById('add-novel-btn');
        if (addBtn) {
          addBtn.addEventListener('click', async () => {
            if (window.StorageService) {
              addBtn.disabled = true;
              addBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Populating Chapters...</span>
              `;

              await window.StorageService.addNovel(novelInfo);
              if (novelInfo.slug) {
                await Promise.all([
                  window.StorageService.syncNovelMetadata(novelInfo.slug),
                  window.StorageService.syncNovelChapters(novelInfo.slug)
                ]);
              }
              const latest = await window.StorageService.getManagedNovels();
              renderNovels(latest);
              checkCurrentPageStatus();
            }
          });
        }
      }
      return;
    }

    // Check if on a supported provider homepage or domain
    let matchedProvider = null;
    let hostname = '';
    if (currentUrl) {
      try {
        const parsed = new URL(currentUrl);
        hostname = parsed.hostname;
        if (typeof ProviderRegistry !== 'undefined') {
          matchedProvider = ProviderRegistry.getProviderForUrl(currentUrl);
          if (!matchedProvider) {
            matchedProvider = ProviderRegistry.getProviderForDomain(hostname);
          }
        }
      } catch (e) {}
    }

    statusActionEl.innerHTML = '';
    statusActionEl.classList.add('hidden');

    if (matchedProvider) {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Supported Site
      `;
      siteHostEl.textContent = matchedProvider.domains[0] || hostname;
      statusMsgEl.innerHTML = `
        <p class="font-medium text-slate-100">QuickConverter supports <span class="text-indigo-300 font-semibold">${matchedProvider.name}</span>.</p>
        <p class="text-xs text-slate-400 mt-1">Open any novel series to manage it.</p>
      `;
    } else {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700/60 text-slate-400 border border-slate-600/40';
      badgeEl.textContent = 'Standard Mode';
      siteHostEl.textContent = hostname || 'Browser Tab';
      const supportedSites = (typeof ProviderRegistry !== 'undefined') 
        ? ProviderRegistry.getAllProviders().map((p) => p.name).join(', ')
        : 'We Tried TLS';
      statusMsgEl.innerHTML = `
        <p class="text-slate-300">QuickConverter supports <span class="text-indigo-300 font-medium">${supportedSites}</span>.</p>
        <p class="text-xs text-slate-500 mt-1">Visit a supported novel series to add it.</p>
      `;
    }
  }

  // --- Header Navigation & Open Library ---
  if (backToMainBtn) {
    backToMainBtn.addEventListener('click', () => {
      showMainView();
    });
  }

  if (openLibraryBtn) {
    openLibraryBtn.addEventListener('click', () => {
      const url = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('views/library.html') : 'library.html';
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    });
  }

  // Initial Load
  await refreshNovelsList();
  checkCurrentPageStatus();
});
