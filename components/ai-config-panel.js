(function (global) {
  const DEFAULT_PROMPT = 'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

  const VARIANTS = {
    full: {
      providerBtnActiveOfficial: 'px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-indigo-600 text-white shadow-sm',
      providerBtnActiveCustom: 'px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-purple-600 text-white shadow-sm',
      providerBtnInactive: 'px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200',
      providerBadgeOfficial: 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
      providerBadgeCustom: 'text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30'
    },
    compact: {
      providerBtnActiveOfficial: 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-indigo-600 text-white shadow-sm',
      providerBtnActiveCustom: 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-purple-600 text-white shadow-sm',
      providerBtnInactive: 'px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200',
      providerBadgeOfficial: 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
      providerBadgeCustom: 'text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30'
    }
  };

  const DEFAULT_TEXTS = {
    badgeOfficial: 'Official API',
    badgeBridge: 'Local Bridge (Free)',
    badgeCustom: 'Custom API',
    apiKeyLabelOfficial: '1. DeepSeek API Key',
    apiKeyLabelCustom: '1. API Key (Optional for local)',
    apiKeyPlaceholderOfficial: 'sk-...',
    apiKeyPlaceholderCustom: 'Optional (leave blank for local bridge)',
    pricingFree: 'Free / Custom',
    toggleOn: 'Active (Translates on Download)',
    toggleOff: 'Off (Save Raw Chapter)'
  };

  const DEFAULT_CAPABILITIES = {
    provider: true,
    balance: true,
    prompt: true,
    cooldown: true,
    modelSelect: true,
    testConnection: true
  };

  function resolveService(name) {
    if (typeof window !== 'undefined' && window[name]) return window[name];
    if (typeof global !== 'undefined' && global[name]) return global[name];
    if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
    return null;
  }

  function createAiConfigPanel(config) {
    config = config || {};
    const ids = config.ids || {};
    const styles = VARIANTS[config.variant] || VARIANTS.full;
    const texts = Object.assign({}, DEFAULT_TEXTS, config.texts || {});
    const capabilities = Object.assign({}, DEFAULT_CAPABILITIES, config.capabilities || {});
    const hooks = config.hooks || {};

    const el = (role) => (ids[role] ? document.getElementById(ids[role]) : null);

    const toggleEl = el('toggle');
    if (!toggleEl) return null;

    const badgeEl = el('toggleBadge');
    const providerBadgeEl = el('providerBadge');
    const providerBtnOfficial = el('providerBtnOfficial');
    const providerBtnCustom = el('providerBtnCustom');
    const customApiRow = el('customRow');
    const customBaseUrlInput = el('customUrl');
    const bridgePresetBtn = el('presetBtn');
    const testCustomBtn = el('testCustomBtn');
    const apiKeyLabel = el('apiKeyLabel');

    const keyEl = el('apiKey');
    const rememberKeyEl = el('rememberKey');
    const clearKeyBtn = el('clearKeyBtn');
    const promptEl = el('prompt');
    const visibilityBtn = el('visibilityBtn');
    const fieldsEl = el('fields');
    const editPromptBtn = el('editPromptBtn');
    const modelSelectEl = el('modelSelect');
    const testBtn = el('testBtn');
    const testStatusEl = el('testStatus');

    const balanceBadgeEl = el('balanceBadge');
    const balanceTextEl = el('balanceText');
    const refreshBalanceBtn = el('refreshBalanceBtn');
    const refreshBalanceIcon = el('refreshBalanceIcon');
    const pricingBadgeEl = el('pricingBadge');

    const cooldownToggleEl = el('cooldownToggle');
    const cooldownToggleLabelEl = el('cooldownToggleLabel');
    const cooldownMinEl = el('cooldownMin');
    const cooldownMaxEl = el('cooldownMax');
    const cooldownMinLabelEl = el('cooldownMinLabel');
    const cooldownMaxLabelEl = el('cooldownMaxLabel');
    const cooldownBadgeEl = el('cooldownBadge');
    const cooldownInputsContainerEl = el('cooldownInputs');

    const deepseek = resolveService('DeepSeekService');

    let providerConfig = {
      provider: 'official',
      baseUrl: 'https://api.deepseek.com',
      customUrl: 'http://127.0.0.1:8000/v1'
    };
    let balanceTracker = null;
    let currentPromptText = ((deepseek && deepseek.DEFAULT_PROMPT) || DEFAULT_PROMPT);
    let isEditingPrompt = false;

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

    function applyProviderUI(provider, targetUrl) {
      const isOfficial = provider === 'official';
      if (providerBtnOfficial) {
        providerBtnOfficial.className = isOfficial ? styles.providerBtnActiveOfficial : styles.providerBtnInactive;
      }
      if (providerBtnCustom) {
        providerBtnCustom.className = !isOfficial ? styles.providerBtnActiveCustom : styles.providerBtnInactive;
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
          providerBadgeEl.textContent = texts.badgeOfficial;
          providerBadgeEl.className = styles.providerBadgeOfficial;
          providerBadgeEl.title = 'Using official api.deepseek.com';
        } else {
          const isBridge = effectiveUrl.includes('127.0.0.1') || effectiveUrl.includes('localhost');
          providerBadgeEl.textContent = isBridge ? texts.badgeBridge : texts.badgeCustom;
          providerBadgeEl.className = styles.providerBadgeCustom;
          providerBadgeEl.title = `Connected to ${effectiveUrl}`;
        }
      }

      if (apiKeyLabel) {
        apiKeyLabel.textContent = isOfficial ? texts.apiKeyLabelOfficial : texts.apiKeyLabelCustom;
      }
      if (keyEl) {
        keyEl.placeholder = isOfficial ? texts.apiKeyPlaceholderOfficial : texts.apiKeyPlaceholderCustom;
      }

      if (pricingBadgeEl) {
        if (!isOfficial) {
          pricingBadgeEl.textContent = texts.pricingFree;
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

    function updateState(checked) {
      if (badgeEl) {
        if (checked) {
          badgeEl.textContent = texts.toggleOn;
          badgeEl.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        } else {
          badgeEl.textContent = texts.toggleOff;
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

    const updateClearBtnVisibility = () => {
      const hasKey = !!(keyEl && keyEl.value.trim());
      if (clearKeyBtn) {
        clearKeyBtn.classList.toggle('hidden', !hasKey);
      }
    };

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
      const qService = resolveService('DownloadQueueService');
      if (qService && typeof qService.setCooldownConfig === 'function') {
        qService.setCooldownConfig(cfg);
      }
      updateCooldownUI();
    };

    function applyPromptReadOnly() {
      if (!promptEl) return;
      promptEl.value = currentPromptText;
      promptEl.readOnly = true;
      promptEl.className = 'w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed cursor-default';
      if (editPromptBtn) {
        editPromptBtn.textContent = 'Edit';
        editPromptBtn.className = 'text-xs font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60';
      }
      isEditingPrompt = false;
    }

    function setPrompt(text) {
      currentPromptText = text || ((deepseek && deepseek.DEFAULT_PROMPT) || DEFAULT_PROMPT);
      applyPromptReadOnly();
    }

    function refreshBalance(force) {
      if (balanceTracker) balanceTracker.refresh(force);
    }

    function getProvider() {
      return { ...providerConfig };
    }

    function getApiKey() {
      return keyEl ? keyEl.value.trim() : '';
    }

    async function refresh() {
      if (deepseek && typeof deepseek.getProviderConfig === 'function') {
        try {
          providerConfig = await deepseek.getProviderConfig();
        } catch (e) {
          console.warn('[ai-config-panel] Could not load provider config:', e);
        }
      }

      applyProviderUI(providerConfig.provider, providerConfig.customUrl);

      const isEnabled = getStored('quickconverter_deepseek_enabled', 'false') === 'true';
      toggleEl.checked = isEnabled;
      updateState(isEnabled);

      const savedModel = getStored('quickconverter_deepseek_model', 'deepseek-flash');
      if (modelSelectEl) modelSelectEl.value = savedModel;

      if (capabilities.prompt) {
        let text = currentPromptText;
        if (typeof hooks.getPrompt === 'function') {
          try {
            text = hooks.getPrompt() || text;
          } catch (e) {
            console.warn('[ai-config-panel] getPrompt hook failed:', e);
          }
        }
        setPrompt(text);
      }

      if (capabilities.cooldown) updateCooldownUI();

      if (capabilities.balance && deepseek && typeof deepseek.getApiKey === 'function') {
        try {
          const { apiKey, remembered } = await deepseek.getApiKey();
          if (keyEl && apiKey) keyEl.value = apiKey;
          if (rememberKeyEl) rememberKeyEl.checked = !!remembered;
          updateClearBtnVisibility();
          if (balanceTracker && apiKey) balanceTracker.refresh(false);
        } catch (e) {
          console.warn('[ai-config-panel] Failed to load DeepSeek API key:', e);
        }
      } else {
        updateClearBtnVisibility();
      }
    }

    if (capabilities.provider) {
      if (providerBtnOfficial) {
        providerBtnOfficial.addEventListener('click', async () => {
          if (deepseek && typeof deepseek.setProviderConfig === 'function') {
            providerConfig = await deepseek.setProviderConfig({ provider: 'official' });
          }
          applyProviderUI('official', providerConfig.customUrl);
          if (typeof hooks.onProviderChange === 'function') hooks.onProviderChange('official', providerConfig.customUrl);
          refreshBalance(true);
        });
      }

      if (providerBtnCustom) {
        providerBtnCustom.addEventListener('click', async () => {
          const customUrlVal = customBaseUrlInput ? (customBaseUrlInput.value.trim() || 'http://127.0.0.1:8000/v1') : 'http://127.0.0.1:8000/v1';
          if (deepseek && typeof deepseek.setProviderConfig === 'function') {
            providerConfig = await deepseek.setProviderConfig({ provider: 'custom', customUrl: customUrlVal });
          }
          applyProviderUI('custom', customUrlVal);
          if (typeof hooks.onProviderChange === 'function') hooks.onProviderChange('custom', customUrlVal);
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

      if (capabilities.testConnection && testCustomBtn && customBaseUrlInput && testStatusEl) {
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
    }

    if (capabilities.balance) {
      if (balanceBadgeEl && deepseek && typeof deepseek.createBalanceTracker === 'function') {
        balanceTracker = deepseek.createBalanceTracker(
          () => (keyEl ? keyEl.value.trim() : ''),
          updateBalanceUI
        );
      }

      if (refreshBalanceBtn && balanceTracker) {
        refreshBalanceBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          balanceTracker.refresh(true);
        });
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
            if (balanceTracker) balanceTracker.refresh(true);
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
    }

    if (capabilities.modelSelect && modelSelectEl) {
      modelSelectEl.addEventListener('change', () => {
        setStored('quickconverter_deepseek_model', modelSelectEl.value);
      });
    }

    if (capabilities.testConnection && testBtn && testStatusEl) {
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
            const currentSelected = (modelSelectEl && modelSelectEl.value) || getStored('quickconverter_deepseek_model', 'deepseek-flash');
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

    toggleEl.addEventListener('change', () => {
      const checked = toggleEl.checked;
      setStored('quickconverter_deepseek_enabled', checked ? 'true' : 'false');
      updateState(checked);
      if (typeof hooks.onToggle === 'function') hooks.onToggle(checked);
    });

    if (visibilityBtn && keyEl) {
      visibilityBtn.addEventListener('click', () => {
        const isPassword = keyEl.type === 'password';
        keyEl.type = isPassword ? 'text' : 'password';
        visibilityBtn.textContent = isPassword ? 'Hide Key' : 'Show Key';
      });
    }

    if (capabilities.prompt && editPromptBtn && promptEl) {
      editPromptBtn.addEventListener('click', async () => {
        if (isEditingPrompt) {
          const updatedPrompt = promptEl.value.trim() || ((deepseek && deepseek.DEFAULT_PROMPT) || DEFAULT_PROMPT);
          currentPromptText = updatedPrompt;
          if (typeof hooks.savePrompt === 'function') {
            try {
              await hooks.savePrompt(updatedPrompt);
            } catch (e) {
              console.warn('[ai-config-panel] savePrompt hook failed:', e);
            }
          }

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

    if (capabilities.cooldown && cooldownToggleEl) {
      cooldownToggleEl.addEventListener('change', saveCooldownConfig);
      if (cooldownMinEl) cooldownMinEl.addEventListener('change', saveCooldownConfig);
      if (cooldownMaxEl) cooldownMaxEl.addEventListener('change', saveCooldownConfig);
    }

    return {
      refresh,
      refreshBalance,
      setPrompt,
      getProvider,
      getApiKey
    };
  }

  const AiConfigPanel = { create: createAiConfigPanel, DEFAULT_PROMPT };

  if (typeof window !== 'undefined') {
    window.AiConfigPanel = AiConfigPanel;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AiConfigPanel;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
