document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const novelId = urlParams.get('id');

  const titleEl = document.getElementById('novel-title');
  const artworkEl = document.getElementById('novel-artwork');
  const domainEl = document.getElementById('novel-domain');
  const statusEl = document.getElementById('novel-status');
  const chaptersStatEl = document.getElementById('chapters-stat');
  const progressBarEl = document.getElementById('chapters-progress-bar');
  const totalChaptersLabel = document.getElementById('total-chapters-label');
  const progressPercentEl = document.getElementById('progress-percent');
  const chaptersBadgeEl = document.getElementById('chapters-badge');
  const chaptersListEl = document.getElementById('chapters-list');
  const syncChaptersBtn = document.getElementById('sync-chapters-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');

  if (!novelId || !window.StorageService) {
    if (titleEl) titleEl.textContent = 'Novel Not Found';
    return;
  }

  let currentNovel = null;

  const novelSettingsBtn = document.getElementById('novel-settings-btn');
  if (novelSettingsBtn && novelId) {
    novelSettingsBtn.href = `settings.html?from=novel&id=${encodeURIComponent(novelId)}`;
  }

  // --- DeepSeek Translation UI Wiring ---
  let updateNovelPromptUI = null;
  let novelBalanceTracker = null;

  async function initDeepSeekUI() {
    const toggleEl = document.getElementById('deepseek-toggle');
    const badgeEl = document.getElementById('deepseek-toggle-badge');
    const providerBadgeEl = document.getElementById('novel-provider-badge');
    const providerBtnOfficial = document.getElementById('novel-provider-btn-official');
    const providerBtnCustom = document.getElementById('novel-provider-btn-custom');
    const customApiRow = document.getElementById('novel-custom-api-row');
    const customBaseUrlInput = document.getElementById('novel-custom-base-url');
    const bridgePresetBtn = document.getElementById('novel-bridge-preset-btn');
    const testCustomBtn = document.getElementById('novel-test-custom-btn');
    const apiKeyLabel = document.getElementById('novel-api-key-label');

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

    // Balance Widget Elements
    const balanceBadgeEl = document.getElementById('deepseek-balance-badge');
    const balanceTextEl = document.getElementById('deepseek-balance-text');
    const refreshBalanceBtn = document.getElementById('deepseek-refresh-balance-btn');
    const refreshBalanceIcon = document.getElementById('deepseek-refresh-balance-icon');
    const pricingBadgeEl = document.getElementById('deepseek-pricing-badge');

    if (!toggleEl) return;

    const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
      (typeof DeepSeekService !== 'undefined' && DeepSeekService);

    // Fetch active AI provider configuration
    let providerConfig = {
      provider: 'official',
      baseUrl: 'https://api.deepseek.com',
      customUrl: 'http://127.0.0.1:8000/v1'
    };

    if (deepseek && typeof deepseek.getProviderConfig === 'function') {
      try {
        providerConfig = await deepseek.getProviderConfig();
      } catch (e) {
        console.warn('[novel.js] Could not load provider config:', e);
      }
    }

    function applyProviderUI(provider, targetUrl) {
      const isOfficial = provider === 'official';
      if (providerBtnOfficial) {
        providerBtnOfficial.className = isOfficial
          ? 'px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-indigo-600 text-white shadow-sm'
          : 'px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200';
      }
      if (providerBtnCustom) {
        providerBtnCustom.className = !isOfficial
          ? 'px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-purple-600 text-white shadow-sm'
          : 'px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200';
      }

      if (customApiRow) {
        if (isOfficial) {
          customApiRow.classList.add('hidden');
        } else {
          customApiRow.classList.remove('hidden');
        }
      }

      const effectiveUrl = targetUrl || providerConfig.customUrl || 'http://127.0.0.1:8000/v1';
      if (customBaseUrlInput) {
        customBaseUrlInput.value = effectiveUrl;
      }

      if (providerBadgeEl) {
        if (isOfficial) {
          providerBadgeEl.textContent = 'Official API';
          providerBadgeEl.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
          providerBadgeEl.title = 'Using official api.deepseek.com';
        } else {
          const isBridge = effectiveUrl.includes('127.0.0.1') || effectiveUrl.includes('localhost');
          providerBadgeEl.textContent = isBridge ? 'Local Bridge (Free)' : 'Custom API';
          providerBadgeEl.className = 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30';
          providerBadgeEl.title = `Connected to ${effectiveUrl}`;
        }
      }

      if (apiKeyLabel) {
        apiKeyLabel.textContent = isOfficial ? '1. DeepSeek API Key' : '1. API Key (Optional for local)';
      }
      if (keyEl) {
        keyEl.placeholder = isOfficial ? 'sk-...' : 'Optional (leave blank for local bridge)';
      }

      if (pricingBadgeEl) {
        if (!isOfficial) {
          pricingBadgeEl.textContent = 'Free / Custom';
          pricingBadgeEl.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/15 text-purple-300';
          pricingBadgeEl.title = 'Custom API / Local Bridge endpoint';
        } else if (deepseek && typeof deepseek.getPricingStatus === 'function') {
          const pStatus = deepseek.getPricingStatus();
          pricingBadgeEl.textContent = pStatus.label;
          pricingBadgeEl.className = `text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pStatus.badgeClass}`;
          pricingBadgeEl.title = `${pStatus.windowDesc} • Auto-applied UTC Schedule`;
        }
      }

      if (balanceBadgeEl && !isOfficial) {
        balanceBadgeEl.classList.add('hidden');
        balanceBadgeEl.classList.remove('inline-flex');
      }
    }

    applyProviderUI(providerConfig.provider, providerConfig.customUrl);

    // Provider Switch Clicks
    if (providerBtnOfficial) {
      providerBtnOfficial.addEventListener('click', async () => {
        if (deepseek && typeof deepseek.setProviderConfig === 'function') {
          providerConfig = await deepseek.setProviderConfig({ provider: 'official' });
        }
        applyProviderUI('official', providerConfig.customUrl);
        if (novelBalanceTracker) novelBalanceTracker.refresh(true);
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

    // Test Custom API connection
    if (testCustomBtn && customBaseUrlInput && testStatusEl) {
      testCustomBtn.addEventListener('click', async () => {
        const targetUrl = customBaseUrlInput.value.trim() || 'http://127.0.0.1:8000/v1';
        testCustomBtn.disabled = true;
        testCustomBtn.textContent = 'Testing...';
        testStatusEl.className = 'text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 block mt-1';
        testStatusEl.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-purple-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Pinging ${targetUrl}/models...</span>
        `;

        try {
          const key = keyEl ? keyEl.value.trim() : '';
          const res = await deepseek.testConnection(key, { provider: 'custom', baseUrl: targetUrl });
          if (res.success) {
            testStatusEl.className = 'text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-md block mt-1';
            testStatusEl.textContent = `✓ Custom API connected! (${(res.models || []).length} models ready)`;
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
            testStatusEl.className = 'text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-md block mt-1';
            testStatusEl.textContent = `✗ ${res.error || 'Connection failed'}`;
          }
        } catch (err) {
          testStatusEl.className = 'text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-md block mt-1';
          testStatusEl.textContent = `✗ Connection failed: ${err.message}`;
        } finally {
          testCustomBtn.disabled = false;
          testCustomBtn.textContent = 'Test Connection';
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
          balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-300 select-none';
          if (balanceTextEl) balanceTextEl.textContent = 'Auth Error';
          balanceBadgeEl.title = balanceInfo.error;
        }
        return;
      }

      balanceBadgeEl.classList.remove('hidden');
      balanceBadgeEl.classList.add('inline-flex');

      if (!balanceInfo.isAvailable || balanceInfo.numericBalance <= 0) {
        balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/15 text-rose-300 select-none';
        if (balanceTextEl) balanceTextEl.textContent = `${balanceInfo.compact} (No Funds)`;
        balanceBadgeEl.title = `DeepSeek Account Balance: ${balanceInfo.formatted} • Insufficient credits`;
      } else if (balanceInfo.isLow) {
        balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/15 text-amber-300 select-none';
        if (balanceTextEl) balanceTextEl.textContent = `${balanceInfo.compact} (Low)`;
        balanceBadgeEl.title = `DeepSeek Account Balance: ${balanceInfo.formatted} • Low balance warning`;
      } else {
        balanceBadgeEl.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none';
        if (balanceTextEl) balanceTextEl.textContent = balanceInfo.compact;
        balanceBadgeEl.title = `DeepSeek Account Balance: ${balanceInfo.formatted} (Click to refresh)`;
      }
    };

    if (deepseek && typeof deepseek.createBalanceTracker === 'function') {
      novelBalanceTracker = deepseek.createBalanceTracker(
        () => (keyEl ? keyEl.value.trim() : ''),
        updateBalanceUI
      );
    }

    if (refreshBalanceBtn && novelBalanceTracker) {
      refreshBalanceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        novelBalanceTracker.refresh(true);
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
        if (novelBalanceTracker && apiKey) {
          novelBalanceTracker.refresh(false);
        }
      }).catch((e) => console.warn('[novel.js] Failed to load DeepSeek API key:', e));
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
          if (novelBalanceTracker) novelBalanceTracker.refresh(true);
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

    if (pricingBadgeEl) {
      if (providerConfig.provider !== 'official') {
        pricingBadgeEl.textContent = 'Free / Custom';
        pricingBadgeEl.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/15 text-purple-300';
        pricingBadgeEl.title = 'Custom API / Local Bridge endpoint';
      } else if (deepseek && typeof deepseek.getPricingStatus === 'function') {
        const pStatus = deepseek.getPricingStatus();
        pricingBadgeEl.textContent = pStatus.label;
        pricingBadgeEl.className = `text-[10px] font-semibold px-1.5 py-0.5 rounded border ${pStatus.badgeClass}`;
        pricingBadgeEl.title = `${pStatus.windowDesc} • Auto-applied UTC Schedule`;
      }
    }

    const DEFAULT_PROMPT = 'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

    const getStored = (key, fallback) => {
      return (window.StorageService && typeof window.StorageService.getPreference === 'function')
        ? window.StorageService.getPreference(key, fallback)
        : (typeof localStorage !== 'undefined' ? (localStorage.getItem(key) ?? fallback) : fallback);
    };

    const setStored = (key, val) => {
      if (window.StorageService && typeof window.StorageService.setPreference === 'function') {
        window.StorageService.setPreference(key, val);
      } else {
        try {
          if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val));
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ [key]: String(val) });
          }
        } catch (e) {}
      }
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

    // --- Cooldown Elements in DeepSeek Panel ---
    const cooldownToggleEl = document.getElementById('novel-cooldown-toggle');
    const cooldownToggleLabelEl = document.getElementById('novel-cooldown-toggle-label');
    const cooldownMinEl = document.getElementById('novel-cooldown-min');
    const cooldownMaxEl = document.getElementById('novel-cooldown-max');
    const cooldownMinLabelEl = document.getElementById('novel-cooldown-min-label');
    const cooldownMaxLabelEl = document.getElementById('novel-cooldown-max-label');
    const cooldownBadgeEl = document.getElementById('novel-cooldown-badge');
    const cooldownInputsContainerEl = document.getElementById('novel-cooldown-inputs-container');

    function updateState(checked) {
      if (badgeEl) {
        if (checked) {
          badgeEl.textContent = 'Active (Translates on Download)';
          badgeEl.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        } else {
          badgeEl.textContent = 'Off (Save Raw Chapter)';
          badgeEl.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600';
        }
      }
      if (fieldsEl) {
        fieldsEl.classList.toggle('opacity-100', checked);
        fieldsEl.classList.toggle('opacity-60', !checked);
      }
      if (cooldownToggleEl) {
        const cooldownCard = cooldownToggleEl.closest('.rounded-xl');
        if (cooldownCard) {
          cooldownCard.classList.toggle('opacity-40', !checked);
          cooldownCard.classList.toggle('pointer-events-none', !checked);
        }
      }
    }

    const formatSecondsHuman = (sec) => {
      const s = Math.round(sec);
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return rem === 0 ? `${m} min` : `${m}m ${rem}s`;
    };

    const updateCooldownUI = () => {
      let cfg = { enabled: true, minSec: 180, maxSec: 300 };
      try {
        const raw = getStored('quickconverter_queue_cooldown', null);
        if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
      } catch (e) {}

      const isChecked = cfg.enabled !== false;
      if (cooldownToggleEl) cooldownToggleEl.checked = isChecked;
      if (cooldownMinEl) cooldownMinEl.value = cfg.minSec || 180;
      if (cooldownMaxEl) cooldownMaxEl.value = cfg.maxSec || 300;

      if (cooldownToggleLabelEl) {
        cooldownToggleLabelEl.textContent = isChecked ? 'ON' : 'OFF';
        cooldownToggleLabelEl.className = isChecked
          ? 'text-xs font-bold text-amber-400 font-mono'
          : 'text-xs font-semibold text-slate-400 font-mono';
      }

      if (cooldownMinLabelEl) {
        cooldownMinLabelEl.textContent = formatSecondsHuman(cfg.minSec || 180);
      }
      if (cooldownMaxLabelEl) {
        cooldownMaxLabelEl.textContent = formatSecondsHuman(cfg.maxSec || 300);
      }

      if (cooldownBadgeEl) {
        if (isChecked) {
          const minM = formatSecondsHuman(cfg.minSec || 180);
          const maxM = formatSecondsHuman(cfg.maxSec || 300);
          cooldownBadgeEl.textContent = `Active (${minM} ~ ${maxM})`;
          cooldownBadgeEl.className = 'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30';
        } else {
          cooldownBadgeEl.textContent = 'Disabled (No wait)';
          cooldownBadgeEl.className = 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700';
        }
      }

      if (cooldownInputsContainerEl) {
        cooldownInputsContainerEl.classList.toggle('opacity-30', !isChecked);
        cooldownInputsContainerEl.classList.toggle('pointer-events-none', !isChecked);
      }
    };

    const saveCooldownConfig = () => {
      const enabled = cooldownToggleEl ? cooldownToggleEl.checked : true;
      let min = cooldownMinEl ? parseInt(cooldownMinEl.value, 10) : 180;
      let max = cooldownMaxEl ? parseInt(cooldownMaxEl.value, 10) : 300;
      if (isNaN(min) || min < 10) min = 10;
      if (isNaN(max) || max < min) max = min;

      const cfg = { enabled, minSec: min, maxSec: max };
      setStored('quickconverter_queue_cooldown', JSON.stringify(cfg));
      const qService = (typeof window !== 'undefined' && window.DownloadQueueService) ||
        (typeof DownloadQueueService !== 'undefined' && DownloadQueueService);
      if (qService && typeof qService.setCooldownConfig === 'function') {
        qService.setCooldownConfig(cfg);
      }
      updateCooldownUI();
    };

    updateCooldownUI();
    if (cooldownToggleEl) cooldownToggleEl.addEventListener('change', saveCooldownConfig);
    if (cooldownMinEl) cooldownMinEl.addEventListener('change', saveCooldownConfig);
    if (cooldownMaxEl) cooldownMaxEl.addEventListener('change', saveCooldownConfig);

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
        visibilityBtn.textContent = isPassword ? 'Hide Key' : 'Show Key';
      });
    }

    // "Test Key" button click handler
    if (testBtn && testStatusEl) {
      testBtn.addEventListener('click', async () => {
        const isCustom = providerConfig.provider !== 'official';
        const key = keyEl ? keyEl.value.trim() : '';
        if (!isCustom && !key) {
          testStatusEl.className = 'text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-md block mt-1';
          testStatusEl.textContent = 'Please enter an API key to test.';
          if (keyEl) keyEl.focus();
          return;
        }

        testBtn.disabled = true;
        testStatusEl.className = 'text-[11px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 block mt-1';
        testStatusEl.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Connecting to ${isCustom ? 'Custom API / Bridge' : 'DeepSeek API'}...</span>
        `;

        try {
          const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
            (typeof DeepSeekService !== 'undefined' && DeepSeekService);

          if (!deepseek || typeof deepseek.testConnection !== 'function') {
            throw new Error('DeepSeekService not loaded');
          }

          const effectiveUrl = isCustom
            ? ((customBaseUrlInput && customBaseUrlInput.value.trim()) || providerConfig.customUrl || 'http://127.0.0.1:8000/v1')
            : undefined;

          const res = await deepseek.testConnection(key, {
            provider: providerConfig.provider,
            baseUrl: effectiveUrl
          });

          if (res.success) {
            const currentSelected = (modelSelectEl && modelSelectEl.value) || savedModel;
            if (modelSelectEl && Array.isArray(res.models) && res.models.length > 0) {
              modelSelectEl.innerHTML = '';
              res.models.forEach((mId) => {
                const opt = document.createElement('option');
                opt.value = mId;
                let label = mId;
                if (mId === 'deepseek-flash') label += ' (V4.1-Flash • Fast)';
                else if (mId === 'deepseek-chat') label += ' (V3 • Standard)';
                else if (mId === 'deepseek-reasoner') label += ' (R1 • DeepThink)';
                opt.textContent = label;
                if (mId === currentSelected || (!currentSelected && mId === 'deepseek-flash')) {
                  opt.selected = true;
                }
                modelSelectEl.appendChild(opt);
              });
            }

            const balStr = isCustom ? ' • Free / Custom' : (res.balance ? ` • Balance: ${res.balance.totalBalance === 'Available' ? 'Available' : '$' + res.balance.totalBalance}` : '');
            testStatusEl.className = 'text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-md block mt-1';
            testStatusEl.textContent = `✓ Connected (${(res.models || []).length} models ready${balStr})`;
          } else {
            testStatusEl.className = 'text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-md block mt-1';
            testStatusEl.textContent = `✗ ${res.error || 'Connection failed'}`;
          }
        } catch (e) {
          testStatusEl.className = 'text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-md block mt-1';
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
      promptEl.className = 'w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed cursor-default';
      if (editPromptBtn) {
        editPromptBtn.textContent = 'Edit';
        editPromptBtn.className = 'text-xs font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60';
      }
      isEditingPrompt = false;
    };

    if (editPromptBtn && promptEl) {
      editPromptBtn.addEventListener('click', async () => {
        if (!currentNovel) return;

        if (isEditingPrompt) {
          // Save prompt to novel record in IndexedDB
          const updatedPrompt = promptEl.value.trim() || DEFAULT_PROMPT;
          currentNovel.translationPrompt = updatedPrompt;
          await window.StorageService.updateNovel(currentNovel.id, { translationPrompt: updatedPrompt });

          promptEl.readOnly = true;
          promptEl.className = 'w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed cursor-default';
          editPromptBtn.textContent = 'Saved ✓';
          editPromptBtn.className = 'text-xs font-semibold text-emerald-400 px-2 py-0.5 rounded';
          setTimeout(() => {
            editPromptBtn.textContent = 'Edit';
            editPromptBtn.className = 'text-xs font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60';
          }, 1500);
          isEditingPrompt = false;
        } else {
          // Enter edit mode
          isEditingPrompt = true;
          promptEl.readOnly = false;
          promptEl.className = 'w-full px-3 py-2 text-xs bg-slate-900 border border-indigo-500 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none ring-1 ring-indigo-500/50 transition resize-none leading-relaxed';
          promptEl.focus();
          promptEl.setSelectionRange(promptEl.value.length, promptEl.value.length);
          editPromptBtn.textContent = 'Save';
          editPromptBtn.className = 'text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer px-2.5 py-0.5 rounded shadow-sm';
        }
      });
    }
  }

  initDeepSeekUI();

  // ==========================================
  // Name List & Glossary Slide-over Drawer UI
  // ==========================================
  let nameList = [];
  let currentSort = 'time_desc';
  let currentSearch = '';
  let editingId = null;
  let isDrawerInitialized = false;

  function parseChapterNumber(val) {
    if (val === null || val === undefined || val === '') return Infinity;
    if (typeof val === 'number') return val;
    const match = String(val).match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : Infinity;
  }

  function formatAddedTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getSortedAndFilteredEntries() {
    let entries = [...nameList];

    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      entries = entries.filter((e) =>
        (e.original && e.original.toLowerCase().includes(q)) ||
        (e.translation && e.translation.toLowerCase().includes(q)) ||
        (e.chapterFirstSeen && String(e.chapterFirstSeen).toLowerCase().includes(q))
      );
    }

    switch (currentSort) {
      case 'time_desc':
        return entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      case 'time_asc':
        return entries.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
      case 'orig_asc':
        return entries.sort((a, b) => (a.original || '').localeCompare(b.original || '', undefined, { sensitivity: 'base', numeric: true }));
      case 'orig_desc':
        return entries.sort((a, b) => (b.original || '').localeCompare(a.original || '', undefined, { sensitivity: 'base', numeric: true }));
      case 'trans_asc':
        return entries.sort((a, b) => (a.translation || '').localeCompare(b.translation || '', undefined, { sensitivity: 'base', numeric: true }));
      case 'trans_desc':
        return entries.sort((a, b) => (b.translation || '').localeCompare(a.translation || '', undefined, { sensitivity: 'base', numeric: true }));
      case 'ch_asc':
        return entries.sort((a, b) => {
          const ca = parseChapterNumber(a.chapterFirstSeen);
          const cb = parseChapterNumber(b.chapterFirstSeen);
          if (ca !== cb) return ca - cb;
          return (a.addedAt || 0) - (b.addedAt || 0);
        });
      case 'ch_desc':
        return entries.sort((a, b) => {
          const ca = parseChapterNumber(a.chapterFirstSeen);
          const cb = parseChapterNumber(b.chapterFirstSeen);
          if (ca !== cb) {
            if (ca === Infinity) return 1;
            if (cb === Infinity) return -1;
            return cb - ca;
          }
          return (b.addedAt || 0) - (a.addedAt || 0);
        });
      default:
        return entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    }
  }

  function renderInlineEditRow(entry) {
    const rawCh = entry.chapterFirstSeen;
    const cleanCh = rawCh !== null && rawCh !== undefined && rawCh !== '' ? String(rawCh).replace(/^ch(?:apter)?\.?\s*/i, '') : '';
    return `
      <div class="flex flex-col gap-2 p-3 rounded-lg bg-slate-800/90 border border-indigo-500/60 ring-1 ring-indigo-500/25 transition" data-id="${entry.id}" data-inline-edit="1">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            class="name-inline-original w-full min-w-0 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="Original Name"
            value="${escapeHtml(entry.original)}"
            autocomplete="off"
            spellcheck="false"
          />
          <input
            type="text"
            class="name-inline-translation w-full min-w-0 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="Translated Name"
            value="${escapeHtml(entry.translation)}"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="flex items-center gap-2">
          <input
            type="text"
            class="name-inline-chapter flex-1 min-w-0 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            placeholder="Chapter First Seen (e.g. 1)"
            value="${escapeHtml(cleanCh)}"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="name-inline-save-btn flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            title="Save changes (Enter)"
          >
            Save
          </button>
          <button
            type="button"
            class="name-inline-cancel-btn flex-shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition cursor-pointer"
            title="Cancel (Esc)"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  function renderNameList() {
    const itemsContainer = document.getElementById('name-list-items');
    const heroCountBadge = document.getElementById('name-list-count-badge');
    const drawerBadge = document.getElementById('name-list-badge');

    if (heroCountBadge) heroCountBadge.textContent = nameList.length;
    if (drawerBadge) drawerBadge.textContent = nameList.length;

    if (!itemsContainer) return;

    const filtered = getSortedAndFilteredEntries();

    if (nameList.length === 0) {
      itemsContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div class="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl text-slate-400 mb-3">
            📖
          </div>
          <h4 class="text-sm font-bold text-slate-200 mb-1">No names added yet</h4>
          <p class="text-xs text-slate-400 max-w-xs mb-4">
            Add character, sect, and location names (e.g. <span class="text-slate-200 font-mono">Yanguo = Yên quốc</span>) to keep a handy reading glossary.
          </p>
          <button type="button" id="name-list-empty-add-btn" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer">
            + Add First Name
          </button>
        </div>
      `;
      const emptyAddBtn = document.getElementById('name-list-empty-add-btn');
      if (emptyAddBtn) {
        emptyAddBtn.addEventListener('click', () => showAddNameForm());
      }
      return;
    }

    if (filtered.length === 0) {
      itemsContainer.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
          <p class="text-xs text-slate-400 mb-2">No names matching "<span class="text-slate-200 font-semibold">${escapeHtml(currentSearch)}</span>"</p>
          <button type="button" id="name-list-clear-search-btn" class="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer">
            Clear search filter
          </button>
        </div>
      `;
      const clearBtn = document.getElementById('name-list-clear-search-btn');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          currentSearch = '';
          const searchInput = document.getElementById('name-list-search-input');
          const searchClearBtn = document.getElementById('name-list-search-clear');
          if (searchInput) searchInput.value = '';
          if (searchClearBtn) searchClearBtn.classList.add('hidden');
          renderNameList();
        });
      }
      return;
    }

    itemsContainer.innerHTML = filtered.map((entry) => {
      if (entry.id === editingId) {
        return renderInlineEditRow(entry);
      }
      const rawCh = entry.chapterFirstSeen;
      const cleanCh = rawCh !== null && rawCh !== undefined && rawCh !== '' ? String(rawCh).replace(/^ch(?:apter)?\.?\s*/i, '') : null;
      return `
        <div class="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60 hover:border-slate-600 transition group" data-id="${entry.id}">
          <div class="flex flex-col gap-1 min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-bold text-sm text-slate-100 font-mono tracking-tight">${escapeHtml(entry.original)}</span>
              <span class="text-xs text-slate-500 font-bold">=</span>
              <span class="font-bold text-sm text-emerald-400">${escapeHtml(entry.translation)}</span>
              ${cleanCh ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">Ch. ${escapeHtml(cleanCh)}</span>` : ''}
            </div>
            <div class="text-[10px] text-slate-500 flex items-center gap-1.5">
              <span>Added: ${formatAddedTime(entry.addedAt)}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition flex-shrink-0">
            <button
              type="button"
              class="name-edit-btn p-1.5 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 transition cursor-pointer"
              title="Edit entry"
              data-id="${entry.id}"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button
              type="button"
              class="name-delete-btn p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition cursor-pointer"
              title="Delete entry"
              data-id="${entry.id}"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Wire edit and delete clicks
    itemsContainer.querySelectorAll('.name-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (!nameList.some((e) => e.id === id)) return;
        editingId = id;
        renderNameList();
      });
    });

    itemsContainer.querySelectorAll('.name-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!currentNovel || !id) return;
        if (editingId === id) editingId = null;
        if (window.StorageService && typeof window.StorageService.deleteNameEntry === 'function') {
          await window.StorageService.deleteNameEntry(currentNovel.id, id);
        }
        nameList = nameList.filter((e) => e.id !== id);
        currentNovel.nameList = nameList;
        renderNameList();
      });
    });

    // Wire inline edit controls
    const inlineRow = itemsContainer.querySelector('[data-inline-edit]');
    if (inlineRow) {
      const id = inlineRow.getAttribute('data-id');
      const originalInput = inlineRow.querySelector('.name-inline-original');
      const translationInput = inlineRow.querySelector('.name-inline-translation');
      const chapterInput = inlineRow.querySelector('.name-inline-chapter');
      const saveBtn = inlineRow.querySelector('.name-inline-save-btn');
      const cancelBtn = inlineRow.querySelector('.name-inline-cancel-btn');

      const cancelInline = () => {
        editingId = null;
        renderNameList();
      };

      const saveInline = async () => {
        if (!currentNovel || !id) return;
        const orig = originalInput ? originalInput.value.trim() : '';
        const trans = translationInput ? translationInput.value.trim() : '';
        const ch = chapterInput ? chapterInput.value.trim() : '';

        if (!orig) {
          if (originalInput) originalInput.focus();
          return;
        }
        if (!trans) {
          if (translationInput) translationInput.focus();
          return;
        }

        let updated = null;
        if (window.StorageService && typeof window.StorageService.updateNameEntry === 'function') {
          updated = await window.StorageService.updateNameEntry(currentNovel.id, id, {
            original: orig,
            translation: trans,
            chapterFirstSeen: ch || null
          });
        }

        const idx = nameList.findIndex((x) => x.id === id);
        if (idx !== -1) {
          nameList[idx] = updated || {
            ...nameList[idx],
            original: orig,
            translation: trans,
            chapterFirstSeen: ch || null
          };
        }
        currentNovel.nameList = nameList;
        editingId = null;
        renderNameList();
      };

      const handleKey = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveInline();
        } else if (e.key === 'Escape') {
          e.stopPropagation();
          cancelInline();
        }
      };

      [originalInput, translationInput, chapterInput].forEach((inp) => {
        if (!inp) return;
        inp.addEventListener('keydown', handleKey);
      });
      if (saveBtn) saveBtn.addEventListener('click', saveInline);
      if (cancelBtn) cancelBtn.addEventListener('click', cancelInline);

      if (originalInput) {
        originalInput.focus();
        originalInput.select();
      }
    }
  }

  function showAddNameForm() {
    const formCard = document.getElementById('name-list-form-card');
    const entryIdInput = document.getElementById('name-entry-id');
    const entryOriginalInput = document.getElementById('name-entry-original');
    const entryTranslationInput = document.getElementById('name-entry-translation');
    const entryChapterInput = document.getElementById('name-entry-chapter');
    const formTitle = document.getElementById('name-list-form-title');
    const entrySubmitBtn = document.getElementById('name-entry-submit-btn');
    const bulkCard = document.getElementById('name-list-bulk-card');

    if (!formCard) return;
    if (entryIdInput) entryIdInput.value = '';
    if (entryOriginalInput) entryOriginalInput.value = '';
    if (entryTranslationInput) entryTranslationInput.value = '';
    if (entryChapterInput) entryChapterInput.value = '';
    if (formTitle) formTitle.textContent = 'Add New Name';
    if (entrySubmitBtn) entrySubmitBtn.textContent = 'Save Entry';
    formCard.classList.remove('hidden');
    if (bulkCard) bulkCard.classList.add('hidden');
    if (entryOriginalInput) entryOriginalInput.focus();
  }

  function hideNameForm() {
    const formCard = document.getElementById('name-list-form-card');
    const entryIdInput = document.getElementById('name-entry-id');
    if (formCard) formCard.classList.add('hidden');
    if (entryIdInput) entryIdInput.value = '';
  }

  function parseBulkLines(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const parsed = [];
    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line || line.startsWith('//') || line.startsWith(';')) continue;

      let chapter = null;
      const commentMatch = line.match(/(?:#|\/\/)\s*(?:ch(?:apter)?\.?\s*)?(\d+(?:\.\d+)?)/i);
      if (commentMatch) {
        chapter = commentMatch[1];
        line = line.substring(0, commentMatch.index).trim();
      }

      let orig = '';
      let trans = '';
      if (line.includes('=')) {
        const parts = line.split('=');
        orig = parts[0].trim();
        trans = parts.slice(1).join('=').trim();
      } else if (line.includes('\t')) {
        const parts = line.split('\t');
        orig = parts[0].trim();
        trans = parts.slice(1).join('\t').trim();
      } else if (line.includes(' - ')) {
        const parts = line.split(' - ');
        orig = parts[0].trim();
        trans = parts.slice(1).join(' - ').trim();
      }

      if (orig && trans) {
        parsed.push({
          original: orig,
          translation: trans,
          chapterFirstSeen: chapter || null
        });
      }
    }
    return parsed;
  }

  function exportToBulkText() {
    if (nameList.length === 0) return '';
    return nameList.map((e) => {
      const ch = e.chapterFirstSeen ? ` # Ch. ${String(e.chapterFirstSeen).replace(/^ch(?:apter)?\.?\s*/i, '')}` : '';
      return `${e.original} = ${e.translation}${ch}`;
    }).join('\n');
  }

  function initNameListUI(novel) {
    if (!novel) return;
    currentNovel = novel;
    nameList = Array.isArray(novel.nameList) ? [...novel.nameList] : [];

    const openDrawerBtn = document.getElementById('open-name-list-btn');
    const drawerBackdrop = document.getElementById('name-list-drawer-backdrop');
    const drawerPanel = document.getElementById('name-list-drawer-panel');
    const closeDrawerBtn = document.getElementById('name-list-close-btn');
    const drawerNovelTitle = document.getElementById('name-list-novel-title');
    const toggleAddBtn = document.getElementById('name-list-toggle-add-btn');
    const formCard = document.getElementById('name-list-form-card');
    const formCancelBtn = document.getElementById('name-list-form-cancel');
    const nameForm = document.getElementById('name-list-form');
    const entryIdInput = document.getElementById('name-entry-id');
    const entryOriginalInput = document.getElementById('name-entry-original');
    const entryTranslationInput = document.getElementById('name-entry-translation');
    const entryChapterInput = document.getElementById('name-entry-chapter');

    const bulkToggleBtn = document.getElementById('name-list-bulk-btn');
    const bulkCard = document.getElementById('name-list-bulk-card');
    const bulkCloseBtn = document.getElementById('name-list-bulk-close');
    const bulkTextarea = document.getElementById('name-list-bulk-text');
    const bulkExportBtn = document.getElementById('name-list-bulk-export-btn');
    const bulkImportBtn = document.getElementById('name-list-bulk-import-btn');
    const bulkStatus = document.getElementById('name-list-bulk-status');

    const searchInput = document.getElementById('name-list-search-input');
    const searchClearBtn = document.getElementById('name-list-search-clear');
    const sortSelect = document.getElementById('name-list-sort-select');

    if (drawerNovelTitle) {
      drawerNovelTitle.textContent = novel.title ? `${novel.title} Glossary` : 'Character & Place Glossary';
    }

    renderNameList();

    if (isDrawerInitialized) return;
    isDrawerInitialized = true;

    function openNameListDrawer() {
      if (!drawerBackdrop || !drawerPanel) return;
      drawerBackdrop.classList.remove('hidden');
      void drawerBackdrop.offsetWidth;
      drawerBackdrop.classList.remove('opacity-0');
      drawerBackdrop.classList.add('opacity-100');
      drawerPanel.classList.remove('translate-x-full');
      drawerPanel.classList.add('translate-x-0');
      document.body.style.overflow = 'hidden';
      renderNameList();
      if (searchInput) searchInput.focus();
    }

    function closeNameListDrawer() {
      if (!drawerBackdrop || !drawerPanel) return;
      drawerBackdrop.classList.remove('opacity-100');
      drawerBackdrop.classList.add('opacity-0');
      drawerPanel.classList.remove('translate-x-0');
      drawerPanel.classList.add('translate-x-full');
      document.body.style.overflow = '';
      editingId = null;
      setTimeout(() => {
        drawerBackdrop.classList.add('hidden');
      }, 300);
    }

    if (openDrawerBtn) openDrawerBtn.addEventListener('click', openNameListDrawer);
    if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeNameListDrawer);

    if (drawerBackdrop) {
      drawerBackdrop.addEventListener('click', (e) => {
        if (e.target === drawerBackdrop || (e.target.firstElementChild && e.target.firstElementChild.parentElement === drawerBackdrop)) {
          closeNameListDrawer();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerBackdrop && !drawerBackdrop.classList.contains('hidden')) {
        closeNameListDrawer();
      }
    });

    if (toggleAddBtn) {
      toggleAddBtn.addEventListener('click', () => {
        if (formCard && !formCard.classList.contains('hidden')) {
          hideNameForm();
        } else {
          showAddNameForm();
        }
      });
    }

    if (formCancelBtn) formCancelBtn.addEventListener('click', hideNameForm);

    if (nameForm) {
      nameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentNovel) return;
        const orig = entryOriginalInput ? entryOriginalInput.value.trim() : '';
        const trans = entryTranslationInput ? entryTranslationInput.value.trim() : '';
        const ch = entryChapterInput ? entryChapterInput.value.trim() : '';
        const id = entryIdInput ? entryIdInput.value.trim() : '';

        if (!orig || !trans) return;

        if (id) {
          // Update existing
          if (window.StorageService && typeof window.StorageService.updateNameEntry === 'function') {
            const updated = await window.StorageService.updateNameEntry(currentNovel.id, id, {
              original: orig,
              translation: trans,
              chapterFirstSeen: ch || null
            });
            if (updated) {
              const idx = nameList.findIndex((x) => x.id === id);
              if (idx !== -1) nameList[idx] = updated;
            }
          }
        } else {
          // Add new
          if (window.StorageService && typeof window.StorageService.addNameEntry === 'function') {
            const added = await window.StorageService.addNameEntry(currentNovel.id, {
              original: orig,
              translation: trans,
              chapterFirstSeen: ch || null
            });
            if (added) {
              nameList.unshift(added);
            }
          }
        }

        currentNovel.nameList = nameList;
        hideNameForm();
        renderNameList();
      });
    }

    // Bulk toggle
    if (bulkToggleBtn) {
      bulkToggleBtn.addEventListener('click', () => {
        if (!bulkCard) return;
        if (!bulkCard.classList.contains('hidden')) {
          bulkCard.classList.add('hidden');
        } else {
          hideNameForm();
          bulkCard.classList.remove('hidden');
          if (bulkTextarea && (!bulkTextarea.value.trim() || bulkTextarea.value === exportToBulkText())) {
            bulkTextarea.value = exportToBulkText();
          }
          if (bulkStatus) bulkStatus.classList.add('hidden');
        }
      });
    }

    if (bulkCloseBtn) {
      bulkCloseBtn.addEventListener('click', () => {
        if (bulkCard) bulkCard.classList.add('hidden');
      });
    }

    if (bulkExportBtn) {
      bulkExportBtn.addEventListener('click', async () => {
        const text = exportToBulkText();
        if (bulkTextarea) bulkTextarea.value = text;
        if (text) {
          try {
            await navigator.clipboard.writeText(text);
            if (bulkStatus) {
              bulkStatus.className = 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block';
              bulkStatus.textContent = `Copied ${nameList.length} names to clipboard! ✓`;
            }
          } catch (err) {
            if (bulkStatus) {
              bulkStatus.className = 'text-xs font-semibold py-1 px-2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 block';
              bulkStatus.textContent = 'Generated names above. Copy with Ctrl+C';
            }
          }
        } else {
          if (bulkStatus) {
            bulkStatus.className = 'text-xs font-semibold py-1 px-2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 block';
            bulkStatus.textContent = 'Name list is currently empty.';
          }
        }
      });
    }

    if (bulkImportBtn) {
      bulkImportBtn.addEventListener('click', async () => {
        if (!currentNovel || !bulkTextarea) return;
        const parsed = parseBulkLines(bulkTextarea.value);
        if (parsed.length === 0) {
          if (bulkStatus) {
            bulkStatus.className = 'text-xs font-semibold py-1 px-2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 block';
            bulkStatus.textContent = 'No valid "Original = Translation" lines found.';
          }
          return;
        }

        let addedCount = 0;
        let updatedCount = 0;

        for (const item of parsed) {
          const existingIdx = nameList.findIndex((e) => e.original.toLowerCase() === item.original.toLowerCase());
          if (existingIdx !== -1) {
            nameList[existingIdx] = {
              ...nameList[existingIdx],
              translation: item.translation,
              chapterFirstSeen: item.chapterFirstSeen || nameList[existingIdx].chapterFirstSeen
            };
            updatedCount++;
          } else {
            nameList.unshift({
              id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
              original: item.original,
              translation: item.translation,
              chapterFirstSeen: item.chapterFirstSeen,
              addedAt: Date.now()
            });
            addedCount++;
          }
        }

        if (window.StorageService && typeof window.StorageService.saveNameList === 'function') {
          await window.StorageService.saveNameList(currentNovel.id, nameList);
        }
        currentNovel.nameList = nameList;

        if (bulkStatus) {
          bulkStatus.className = 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block';
          bulkStatus.textContent = `Import complete: ${addedCount} added, ${updatedCount} updated! ✓`;
        }

        renderNameList();
      });
    }

    // Live search input
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        currentSearch = searchInput.value.trim();
        if (searchClearBtn) {
          if (currentSearch) searchClearBtn.classList.remove('hidden');
          else searchClearBtn.classList.add('hidden');
        }
        renderNameList();
      });
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        currentSearch = '';
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        searchClearBtn.classList.add('hidden');
        renderNameList();
      });
    }

    // Sort selector
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        currentSort = sortSelect.value;
        renderNameList();
      });
    }
  }

  async function updateStatsAndProgress(novel, downloadedCount, totalCount) {
    const total = totalCount || novel.totalChapters || 100;
    const percent = total > 0 ? Math.min(100, Math.round((downloadedCount / total) * 100)) : 0;

    if (chaptersStatEl) chaptersStatEl.textContent = `${downloadedCount} / ${total}`;
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;
    if (totalChaptersLabel) totalChaptersLabel.textContent = `${total} Total Chapters`;
    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (chaptersBadgeEl) chaptersBadgeEl.textContent = `${downloadedCount} / ${total} Saved`;
  }

  async function renderChapters(novel) {
    if (!novel || !chaptersListEl) return;

    let catalog = novel.chapterList || [];

    // If catalog is empty but novel has slug, attempt initial auto-sync
    if (catalog.length === 0 && novel.slug) {
      chaptersListEl.innerHTML = `
        <div class="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
          <svg class="animate-spin h-6 w-6 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <p class="text-sm font-medium text-slate-300">Fetching chapter catalog from provider...</p>
        </div>
      `;

      const synced = await window.StorageService.syncNovelChapters(novel.id);
      if (synced && synced.chapterList && synced.chapterList.length > 0) {
        novel = synced;
        currentNovel = synced;
        catalog = novel.chapterList;
      }
    }

    const downloadedChapters = await window.StorageService.getNovelChapters(novel.id);
    const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

    const displayList = catalog.length > 0 ? catalog : downloadedChapters;
    const totalCount = novel.totalChapters || displayList.length || 100;

    updateStatsAndProgress(novel, downloadedChapters.length, totalCount);

    if (downloadAllBtn) {
      const queueService = (typeof window !== 'undefined' && window.DownloadQueueService);
      const unqueuedMissingCount = catalog.filter((c) => {
        const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
        if (downloadedMap.has(chNum)) return false;
        if (queueService && typeof queueService.isQueued === 'function') {
          if (queueService.isQueued(novel.id, chNum)) return false;
        }
        return true;
      }).length;

      if (catalog.length === 0 || unqueuedMissingCount === 0) {
        downloadAllBtn.classList.add('opacity-50', 'pointer-events-none');
        downloadAllBtn.title = 'All chapters are already downloaded or queued';
      } else {
        downloadAllBtn.classList.remove('opacity-50', 'pointer-events-none');
        downloadAllBtn.title = `Download and translate all ${unqueuedMissingCount} missing chapters`;
      }
    }

    if (displayList.length === 0) {
      chaptersListEl.innerHTML = `
        <div class="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
          <div class="text-2xl">📖</div>
          <p class="text-sm font-medium text-slate-300">No chapters found for this novel.</p>
          <p class="text-xs text-slate-500 max-w-sm">
            Click "Sync Catalog" above to fetch chapters from the provider.
          </p>
        </div>
      `;
      return;
    }

    chaptersListEl.innerHTML = '';

    displayList.forEach((chapter) => {
      const chNum = Number(chapter.chapterNumber);
      const isDownloaded = downloadedMap.has(chNum);

      const row = document.createElement('div');
      row.className = isDownloaded
        ? 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/80 border border-slate-700/60 hover:border-indigo-500/60 hover:bg-slate-800 transition group cursor-pointer'
        : 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition group';

      if (isDownloaded) {
        row.title = `Click to read ${chapter.title || 'Chapter ' + chNum}`;
        row.addEventListener('click', () => {
          window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`;
        });
      }

      // Left: Chapter number badge + Chapter title
      const leftCol = document.createElement('div');
      leftCol.className = 'flex items-center gap-3 overflow-hidden flex-1 min-w-0 pr-3';

      const chBadge = document.createElement('span');
      chBadge.className = isDownloaded
        ? 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-indigo-300 border border-indigo-500/30 flex-shrink-0'
        : 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700/80 flex-shrink-0';
      chBadge.textContent = `Ch. ${chNum}`;

      const nameEl = document.createElement('span');
      nameEl.className = isDownloaded
        ? 'text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition'
        : 'text-sm font-medium text-slate-300 truncate group-hover:text-slate-200 transition';
      nameEl.textContent = chapter.title || `Chapter ${chNum}`;

      leftCol.appendChild(chBadge);
      leftCol.appendChild(nameEl);

      // Right: Actions (Download button OR Saved badge + Delete button)
      const rightCol = document.createElement('div');
      rightCol.className = 'flex items-center gap-2.5 flex-shrink-0';

      if (isDownloaded) {
        const readHint = document.createElement('span');
        readHint.className = 'inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all';
        readHint.innerHTML = `
          <span>Read</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        `;

        const statusBadge = document.createElement('span');
        statusBadge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
        statusBadge.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Saved
        `;

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700/80 transition cursor-pointer';
        delBtn.title = `Delete Chapter ${chNum}`;
        delBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;

        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.StorageService.deleteChapter(novel.id, chNum);
          await renderChapters(currentNovel);
        });

        rightCol.appendChild(readHint);
        rightCol.appendChild(statusBadge);

        const downloadedChapter = downloadedMap.get(chNum);
        if (downloadedChapter && downloadedChapter.translationCost && downloadedChapter.translationCost.formattedCost) {
          const costBadge = document.createElement('span');
          costBadge.className = 'text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20';
          costBadge.textContent = downloadedChapter.translationCost.formattedCost;
          const promptTok = downloadedChapter.translationCost.promptTokens ? `${downloadedChapter.translationCost.promptTokens.toLocaleString()} in` : '';
          const outTok = downloadedChapter.translationCost.completionTokens ? `${downloadedChapter.translationCost.completionTokens.toLocaleString()} out` : '';
          const cacheTok = downloadedChapter.translationCost.cacheHitTokens ? ` • ${downloadedChapter.translationCost.cacheHitTokens.toLocaleString()} cached` : '';
          costBadge.title = `Translation Cost: ${downloadedChapter.translationCost.formattedCost} USD (${promptTok}, ${outTok}${cacheTok}) • ${downloadedChapter.translationCost.ratePeriod}`;
          rightCol.appendChild(costBadge);
        }

        rightCol.appendChild(delBtn);
      } else {
        const queueService = (typeof window !== 'undefined' && window.DownloadQueueService) ||
          (typeof globalThis !== 'undefined' && globalThis.DownloadQueueService);
        const qStatus = queueService && typeof queueService.getChapterStatus === 'function'
          ? queueService.getChapterStatus(novel.id, chNum)
          : null;

        if (qStatus && qStatus.status === 'processing') {
          // Chapter is currently being downloaded/translated in queue
          const activeBtn = document.createElement('button');
          activeBtn.type = 'button';
          activeBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-rose-600 transition shadow-sm cursor-pointer group/activebtn';
          activeBtn.title = 'Currently downloading & translating. Click to cancel and skip to next.';
          activeBtn.dataset.activeChapter = String(chNum);

          const percent = qStatus.progress?.percent !== undefined ? qStatus.progress.percent : 10;
          const ringHtml = (typeof window !== 'undefined' && typeof window.renderProgressRing === 'function')
            ? window.renderProgressRing(percent, 16, 2.5, false)
            : `
            <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>`;

          activeBtn.innerHTML = `
            <span class="active-progress-ring-container flex items-center justify-center">${ringHtml}</span>
            <span class="active-progress-text group-hover/activebtn:hidden">${percent}% Translating...</span>
            <span class="hidden group-hover/activebtn:inline font-bold">Cancel ✕</span>
          `;

          activeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (queueService) {
              await queueService.remove(`${novel.id}_ch${chNum}`);
            }
          });

          rightCol.appendChild(activeBtn);
        } else if (qStatus && qStatus.status === 'retry_pending') {
          // Chapter is pending retry after error / rate-limit backoff
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition shadow-sm cursor-pointer group/retrybtn';
          retryBtn.title = `Retry Pending (Attempt ${qStatus.retryCount || 1}). Rate-limit backoff active. Click to retry now immediately.`;
          retryBtn.innerHTML = `
            <span class="group-hover/retrybtn:hidden">🔄 Retry Pending</span>
            <span class="hidden group-hover/retrybtn:inline font-bold">Retry Now ⚡</span>
          `;

          retryBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (queueService) {
              if (typeof queueService.retryNow === 'function') {
                await queueService.retryNow();
              } else if (typeof queueService.skipCooldown === 'function') {
                await queueService.skipCooldown();
              }
            }
          });

          rightCol.appendChild(retryBtn);
        } else if (qStatus && qStatus.status === 'queued') {
          // Chapter is waiting in queue
          const queuedBtn = document.createElement('button');
          queuedBtn.type = 'button';
          queuedBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition shadow-sm cursor-pointer group/qbtn';
          queuedBtn.title = `Queued (#${qStatus.queuePosition}). Click to remove from queue.`;
          queuedBtn.innerHTML = `
            <span class="group-hover/qbtn:hidden">⏳ Queued (#${qStatus.queuePosition})</span>
            <span class="hidden group-hover/qbtn:inline">Remove ✕</span>
            <span class="text-amber-400 group-hover/qbtn:text-rose-300 font-bold ml-0.5 group-hover/qbtn:hidden">✕</span>
          `;

          queuedBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (queueService) {
              await queueService.remove(`${novel.id}_ch${chNum}`);
            }
          });

          rightCol.appendChild(queuedBtn);
        } else {
          // Download button with downward arrow icon
          const dlBtn = document.createElement('button');
          dlBtn.type = 'button';
          dlBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50';
          dlBtn.title = `Download Chapter ${chNum}`;
          dlBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
            <span>Download</span>
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
            const customUrlInputEl = document.getElementById('novel-custom-base-url');
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

            const cooldownToggleEl = document.getElementById('novel-cooldown-toggle');
            const isCooldownActive = cooldownToggleEl ? cooldownToggleEl.checked : true;
            const options = {
              cooldown: isCooldownActive,
              translation: {
                enabled: isTranslationEnabled,
                cooldown: isCooldownActive,
                apiKey: apiKey || (isCustomMode ? 'sk-local' : ''),
                prompt: promptEl ? promptEl.value : '',
                model: selectedModel,
                provider: curProvConfig.provider,
                baseUrl: isCustomMode ? effectiveCustomUrl : undefined
              }
            };

            if (queueService && typeof queueService.enqueue === 'function') {
              // Add to download queue
              await queueService.enqueue({
                novelId: novel.id,
                novelTitle: novel.title,
                chapterNumber: chNum,
                chapterTitle: chapter.title || `Chapter ${chNum}`,
                options
              });
              await renderChapters(currentNovel);
            } else {
              // Fallback direct download
              dlBtn.disabled = true;
              dlBtn.innerHTML = `
                <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>${isTranslationEnabled ? 'Translating (' + selectedModel + ')...' : 'Downloading...'}</span>
              `;

              try {
                await window.StorageService.downloadChapter(novel.id, chNum, options);
                if (novelBalanceTracker && isTranslationEnabled && !isCustomMode) {
                  novelBalanceTracker.refresh(true);
                }
                await renderChapters(currentNovel);
              } catch (err) {
                console.error('Error downloading chapter:', err);
                dlBtn.disabled = false;
                dlBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition shadow-sm cursor-pointer';
                dlBtn.title = err.message || 'Error downloading chapter';
                dlBtn.innerHTML = `
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <polyline points="19 12 12 19 5 12"></polyline>
                  </svg>
                  <span>Retry</span>
                `;
              }
            }
          });

          rightCol.appendChild(dlBtn);
        }
      }

      if (chapter.url) {
        const linkBtn = document.createElement('a');
        linkBtn.href = chapter.url;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noreferrer';
        linkBtn.className = 'p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition ml-0.5';
        linkBtn.title = 'Open chapter on web';
        linkBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        `;
        linkBtn.addEventListener('click', (e) => e.stopPropagation());
        rightCol.appendChild(linkBtn);
      }

      row.appendChild(leftCol);
      row.appendChild(rightCol);
      chaptersListEl.appendChild(row);
    });
  }

  try {
    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) {
      if (titleEl) titleEl.textContent = 'Novel Not Found';
      return;
    }

    currentNovel = novel;

    // Populate Novel Translation Prompt
    if (typeof updateNovelPromptUI === 'function') {
      updateNovelPromptUI(currentNovel);
    }

    // Populate Novel Name List / Glossary
    if (typeof initNameListUI === 'function') {
      initNameListUI(currentNovel);
    }

    // Populate Novel Info
    document.title = `${novel.title} - QuickConverter`;
    if (titleEl) titleEl.textContent = novel.title;

    if (artworkEl) {
      artworkEl.src = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      artworkEl.alt = novel.title;
      artworkEl.onerror = () => {
        artworkEl.src = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      };
    }

    if (domainEl) domainEl.textContent = novel.domain || 'wetriedtls.com';
    if (statusEl) statusEl.textContent = novel.status || 'Active';

    // Wire Sync Catalog button
    if (syncChaptersBtn) {
      syncChaptersBtn.addEventListener('click', async () => {
        syncChaptersBtn.disabled = true;
        syncChaptersBtn.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Syncing...</span>
        `;

        try {
          const updated = await window.StorageService.syncNovelChapters(currentNovel.id);
          if (updated) {
            currentNovel = updated;
          }
          await renderChapters(currentNovel);
        } catch (e) {
          console.error('Error syncing catalog:', e);
        } finally {
          syncChaptersBtn.disabled = false;
          syncChaptersBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>Sync Catalog</span>
          `;
        }
      });
    }

    if (downloadAllBtn) {
      downloadAllBtn.addEventListener('click', async () => {
        if (!currentNovel) {
          alert('No novel loaded. Please select a novel first.');
          return;
        }
        const catalog = currentNovel.chapterList || [];
        if (catalog.length === 0) {
          alert('No chapters found in catalog. Please click "Sync Catalog" first.');
          return;
        }

        const queueService = (typeof window !== 'undefined' && window.DownloadQueueService) ||
          (typeof globalThis !== 'undefined' && globalThis.DownloadQueueService);
        const storageService = (typeof window !== 'undefined' && window.StorageService) ||
          (typeof globalThis !== 'undefined' && globalThis.StorageService);

        const downloadedChapters = storageService && typeof storageService.getNovelChapters === 'function'
          ? await storageService.getNovelChapters(currentNovel.id)
          : [];
        const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

        const unqueuedMissing = catalog.filter((c) => {
          const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
          if (downloadedMap.has(chNum)) return false;
          if (queueService && typeof queueService.isQueued === 'function') {
            if (queueService.isQueued(currentNovel.id, chNum)) return false;
          }
          return true;
        });

        if (unqueuedMissing.length === 0) {
          alert('All chapters are already downloaded or queued!');
          return;
        }

        const toggleEl = document.getElementById('deepseek-toggle');
        const keyEl = document.getElementById('deepseek-api-key');
        const promptEl = document.getElementById('deepseek-prompt');
        const modelSelectEl = document.getElementById('deepseek-model-select');

        const isTranslationEnabled = !!(toggleEl && toggleEl.checked);
        let apiKey = keyEl ? keyEl.value.trim() : '';
        const deepseek = (typeof AIService !== 'undefined' && AIService.getProvider && AIService.getProvider('deepseek')) ||
          (typeof DeepSeekService !== 'undefined' && DeepSeekService);

        let curProvConfig = { provider: 'official', customUrl: 'http://127.0.0.1:8000/v1' };
        if (deepseek && typeof deepseek.getProviderConfig === 'function') {
          try {
            curProvConfig = await deepseek.getProviderConfig();
          } catch (e) {}
        }
        const isCustomMode = curProvConfig.provider !== 'official';
        const customUrlInputEl = document.getElementById('novel-custom-base-url');
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

        const selectedModel = (modelSelectEl && modelSelectEl.value) || 'deepseek-flash';

        if (unqueuedMissing.length > 5) {
          const transDetail = isTranslationEnabled
            ? `with translation enabled (${selectedModel}, provider: ${curProvConfig.provider})`
            : `without translation (raw text)`;
          const confirmed = confirm(`You are about to queue ${unqueuedMissing.length} chapters for download ${transDetail}.\n\nDo you wish to proceed?`);
          if (!confirmed) {
            return;
          }
        }

        const cooldownToggleEl = document.getElementById('novel-cooldown-toggle');
        const isCooldownActive = cooldownToggleEl ? cooldownToggleEl.checked : true;
        const options = {
          cooldown: isCooldownActive,
          translation: {
            enabled: isTranslationEnabled,
            cooldown: isCooldownActive,
            apiKey: apiKey || (isCustomMode ? 'sk-local' : ''),
            prompt: promptEl ? promptEl.value : '',
            model: selectedModel,
            provider: curProvConfig.provider,
            baseUrl: isCustomMode ? effectiveCustomUrl : undefined
          }
        };

        const tasksToEnqueue = unqueuedMissing.map((c) => {
          const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
          return {
            novelId: currentNovel.id,
            novelTitle: currentNovel.title,
            chapterNumber: chNum,
            chapterTitle: c.title || `Chapter ${chNum}`,
            options
          };
        });

        downloadAllBtn.disabled = true;
        const originalHtml = downloadAllBtn.innerHTML;
        downloadAllBtn.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Queuing...</span>
        `;

        try {
          if (queueService && typeof queueService.enqueueBatch === 'function') {
            await queueService.enqueueBatch(tasksToEnqueue);
          } else if (queueService && typeof queueService.enqueue === 'function') {
            for (const task of tasksToEnqueue) {
              await queueService.enqueue(task);
            }
          }
          await renderChapters(currentNovel);
        } catch (err) {
          console.error('Error queuing batch download:', err);
          alert('Error queuing chapters: ' + (err.message || err));
        } finally {
          downloadAllBtn.disabled = false;
          downloadAllBtn.innerHTML = originalHtml;
        }
      });
    }

    // Initial render
    await renderChapters(currentNovel);

    // Listen for queue state events to update chapter button states
    let isUpdatingFromQueue = false;
    let hasPendingQueueUpdate = false;
    let hadActiveTask = false;
    let lastActiveTaskId = null;
    let lastQueueCount = -1;
    let lastIsPaused = null;

    function updateActiveProgressInPlace(activeTask) {
      if (!activeTask || !chaptersListEl) return false;
      const chNum = Number(activeTask.chapterNumber);
      const btn = chaptersListEl.querySelector(`button[data-active-chapter="${chNum}"]`);
      if (!btn) return false;

      const percent = activeTask.progress?.percent !== undefined ? activeTask.progress.percent : 10;
      const ringContainer = btn.querySelector('.active-progress-ring-container');
      if (ringContainer) {
        const circle = ringContainer.querySelector('circle[stroke="#6366f1"]');
        if (circle) {
          const size = 16, strokeWidth = 2.5;
          const radius = (size - strokeWidth) / 2;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
          circle.style.strokeDashoffset = offset.toFixed(1);
        } else if (typeof window.renderProgressRing === 'function') {
          ringContainer.innerHTML = window.renderProgressRing(percent, 16, 2.5, false);
        }
      }
      const textEl = btn.querySelector('.active-progress-text');
      if (textEl) {
        textEl.textContent = `${percent}% Translating...`;
      }
      return true;
    }

    async function handleQueueChange(state) {
      const currentActiveTaskId = state?.activeTask?.id || null;
      const currentQueueCount = Array.isArray(state?.queue) ? state.queue.length : 0;
      const currentIsPaused = !!state?.isPaused;

      // If active task and queue structure are unchanged, update only progress in place!
      if (
        currentActiveTaskId &&
        currentActiveTaskId === lastActiveTaskId &&
        currentQueueCount === lastQueueCount &&
        currentIsPaused === lastIsPaused
      ) {
        const updated = updateActiveProgressInPlace(state.activeTask);
        if (updated) {
          return; // Targeted in-place update with zero DOM rebuilding or hover blinking
        }
      }

      // Active task, queue items, or paused state transitioned -> Full re-render needed
      lastActiveTaskId = currentActiveTaskId;
      lastQueueCount = currentQueueCount;
      lastIsPaused = currentIsPaused;

      if (isUpdatingFromQueue) {
        hasPendingQueueUpdate = true;
        return;
      }
      isUpdatingFromQueue = true;
      try {
        if (currentNovel) {
          await renderChapters(currentNovel);
          if (hadActiveTask && (!state || !state.activeTask) && novelBalanceTracker) {
            novelBalanceTracker.refresh(true);
          }
        }
        hadActiveTask = !!(state && state.activeTask);
      } catch (e) {
        console.warn('[novel.js] Error updating from queue change:', e);
      } finally {
        isUpdatingFromQueue = false;
        if (hasPendingQueueUpdate) {
          hasPendingQueueUpdate = false;
          handleQueueChange(window.DownloadQueueService ? window.DownloadQueueService.getState() : null);
        }
      }
    }

    const queueService = (typeof window !== 'undefined' && window.DownloadQueueService);
    if (queueService && typeof queueService.subscribe === 'function') {
      queueService.subscribe((state) => {
        handleQueueChange(state);
      });
    }
  } catch (err) {
    console.error('Error loading novel details:', err);
  }
});
