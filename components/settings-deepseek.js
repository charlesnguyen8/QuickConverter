/**
 * QuickConverter - Settings DeepSeek controller
 * Moved out of views/settings.js (M3). Relies on the global-scope bindings
 * declared in settings.js: balanceTracker, updateBalanceDisplay,
 * triggerSaveIndicator, DeepSeekService.
 */
(function () {
  'use strict';

async function initDeepSeekSettings() {
  if (typeof DeepSeekService === 'undefined') return;

  const masterToggle = document.getElementById('deepseek-master-toggle');
  const toggleBadge = document.getElementById('deepseek-toggle-badge');
  const apiKeyInput = document.getElementById('settings-api-key');
  const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility-btn');
  const testKeyBtn = document.getElementById('test-key-btn');
  const clearKeyBtn = document.getElementById('clear-key-btn');
  const rememberKeyCheckbox = document.getElementById('settings-remember-key');
  const keyStatusEl = document.getElementById('key-validation-status');
  const refreshBalanceBtn = document.getElementById('refresh-balance-btn');
  const customPromptEl = document.getElementById('settings-custom-prompt');
  const resetPromptBtn = document.getElementById('reset-prompt-btn');

  const providerRadioOfficial = document.getElementById('provider-radio-official');
  const providerRadioBridge = document.getElementById('provider-radio-bridge');
  const providerCardOfficial = document.getElementById('provider-card-official');
  const providerCardBridge = document.getElementById('provider-card-bridge');
  const providerStatusBadge = document.getElementById('provider-status-badge');
  const bridgeConfigPanel = document.getElementById('bridge-config-panel');
  const bridgeUrlInput = document.getElementById('bridge-url-input');
  const testBridgeBtn = document.getElementById('test-bridge-btn');
  const bridgeStatusFeedback = document.getElementById('bridge-status-feedback');

  const radioFlash = document.getElementById('model-radio-flash');
  const radioChat = document.getElementById('model-radio-chat');
  const radioReasoner = document.getElementById('model-radio-reasoner');
  const cardFlash = document.getElementById('model-card-flash');
  const cardChat = document.getElementById('model-card-chat');
  const cardReasoner = document.getElementById('model-card-reasoner');

  // --- Master Toggle ---
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

  const bridgePresetBtn = document.getElementById('bridge-preset-btn');

  // --- Provider Configuration Setup ---
  let activeProviderConfig = {
    provider: DeepSeekService.PROVIDER_OFFICIAL,
    baseUrl: DeepSeekService.OFFICIAL_BASE_URL,
    customUrl: DeepSeekService.CUSTOM_DEFAULT_URL
  };

  try {
    activeProviderConfig = await DeepSeekService.getProviderConfig();
  } catch (err) {
    console.error('Failed to load provider config:', err);
  }

  function updateProviderUI(config) {
    const isCustom = config.provider !== DeepSeekService.PROVIDER_OFFICIAL;
    if (providerRadioOfficial) providerRadioOfficial.checked = !isCustom;
    if (providerRadioBridge) providerRadioBridge.checked = isCustom;

    if (providerCardOfficial && providerCardBridge) {
      if (isCustom) {
        providerCardBridge.className = 'flex flex-col gap-2 p-3.5 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
        providerCardOfficial.className = 'flex flex-col gap-2 p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';
      } else {
        providerCardOfficial.className = 'flex flex-col gap-2 p-3.5 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
        providerCardBridge.className = 'flex flex-col gap-2 p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';
      }
    }

    if (bridgeConfigPanel) {
      if (isCustom) {
        bridgeConfigPanel.classList.remove('hidden');
      } else {
        bridgeConfigPanel.classList.add('hidden');
      }
    }

    if (bridgeUrlInput) {
      bridgeUrlInput.value = config.customUrl || config.baseUrl || DeepSeekService.CUSTOM_DEFAULT_URL;
    }

    if (providerStatusBadge) {
      if (isCustom) {
        providerStatusBadge.textContent = 'Custom API / Local Bridge';
        providerStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30';
      } else {
        providerStatusBadge.textContent = 'Official Cloud API';
        providerStatusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
      }
    }
  }

  updateProviderUI(activeProviderConfig);

  // Switch Provider Event Listeners
  if (providerRadioOfficial) {
    providerRadioOfficial.addEventListener('change', async () => {
      activeProviderConfig = await DeepSeekService.setProviderConfig({
        provider: DeepSeekService.PROVIDER_OFFICIAL
      });
      updateProviderUI(activeProviderConfig);
      triggerSaveIndicator('Provider switched to Official DeepSeek API');
      if (balanceTracker) balanceTracker.refresh(true);
    });
  }

  if (providerRadioBridge) {
    providerRadioBridge.addEventListener('change', async () => {
      const bridgeUrl = bridgeUrlInput ? bridgeUrlInput.value.trim() : DeepSeekService.CUSTOM_DEFAULT_URL;
      activeProviderConfig = await DeepSeekService.setProviderConfig({
        provider: DeepSeekService.PROVIDER_CUSTOM,
        customUrl: bridgeUrl || DeepSeekService.CUSTOM_DEFAULT_URL
      });
      updateProviderUI(activeProviderConfig);
      triggerSaveIndicator('Provider switched to Custom API / Local Bridge');
    });
  }

  if (bridgePresetBtn && bridgeUrlInput) {
    bridgePresetBtn.addEventListener('click', async () => {
      bridgeUrlInput.value = DeepSeekService.CUSTOM_DEFAULT_URL;
      activeProviderConfig = await DeepSeekService.setProviderConfig({
        customUrl: DeepSeekService.CUSTOM_DEFAULT_URL
      });
      triggerSaveIndicator('Reset to Local Bridge preset URL');
    });
  }

  if (bridgeUrlInput) {
    bridgeUrlInput.addEventListener('change', async () => {
      const url = bridgeUrlInput.value.trim() || DeepSeekService.CUSTOM_DEFAULT_URL;
      activeProviderConfig = await DeepSeekService.setProviderConfig({
        customUrl: url,
        baseUrl: url
      });
      triggerSaveIndicator('Custom API Base URL updated');
    });
  }

  if (testBridgeBtn) {
    testBridgeBtn.addEventListener('click', async () => {
      const targetUrl = bridgeUrlInput ? (bridgeUrlInput.value.trim() || DeepSeekService.CUSTOM_DEFAULT_URL) : DeepSeekService.CUSTOM_DEFAULT_URL;
      testBridgeBtn.disabled = true;
      testBridgeBtn.textContent = 'Testing...';
      if (bridgeStatusFeedback) {
        bridgeStatusFeedback.textContent = 'Connecting to endpoint at ' + targetUrl + '...';
        bridgeStatusFeedback.className = 'text-xs font-medium text-indigo-400';
      }

      try {
        const res = await DeepSeekService.testConnection(null, {
          provider: DeepSeekService.PROVIDER_CUSTOM,
          baseUrl: targetUrl
        });

        if (res.success) {
          if (bridgeStatusFeedback) {
            bridgeStatusFeedback.textContent = `✓ Connected! Endpoint healthy (${(res.models || []).length || res.modelCount || 0} models ready)`;
            bridgeStatusFeedback.className = 'text-xs font-medium text-emerald-400';
          }
          triggerSaveIndicator('Custom endpoint verified!');
        } else {
          if (bridgeStatusFeedback) {
            bridgeStatusFeedback.textContent = `✕ Error: ${res.error}`;
            bridgeStatusFeedback.className = 'text-xs font-medium text-red-400';
          }
        }
      } catch (err) {
        if (bridgeStatusFeedback) {
          bridgeStatusFeedback.textContent = `✕ Connection failed: ${err.message}`;
          bridgeStatusFeedback.className = 'text-xs font-medium text-red-400';
        }
      } finally {
        testBridgeBtn.disabled = false;
        testBridgeBtn.textContent = 'Test Base URL';
      }
    });
  }

  // --- B. Model Selection ---
  const savedModel = localStorage.getItem('quickconverter_deepseek_model') || 'deepseek-flash';
  if (savedModel === 'deepseek-reasoner') {
    if (radioReasoner) radioReasoner.checked = true;
    updateModelCards('deepseek-reasoner');
  } else if (savedModel === 'deepseek-chat') {
    if (radioChat) radioChat.checked = true;
    updateModelCards('deepseek-chat');
  } else {
    if (radioFlash) radioFlash.checked = true;
    updateModelCards('deepseek-flash');
  }

  [radioFlash, radioChat, radioReasoner].forEach((radio) => {
    if (radio) {
      radio.addEventListener('change', () => {
        const val = radio.value;
        localStorage.setItem('quickconverter_deepseek_model', val);
        updateModelCards(val);
        let modelLabel = 'Flash';
        if (val === 'deepseek-chat') modelLabel = 'Chat';
        if (val === 'deepseek-reasoner') modelLabel = 'Reasoner (R1)';
        triggerSaveIndicator(`Default model set to ${modelLabel}`);
      });
    }
  });

  function updateModelCards(selectedModel) {
    const activeClass = 'flex flex-col gap-2 p-4 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative';
    const inactiveClass = 'flex flex-col gap-2 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600';

    if (cardFlash) cardFlash.className = selectedModel === 'deepseek-flash' ? activeClass : inactiveClass;
    if (cardChat) cardChat.className = selectedModel === 'deepseek-chat' ? activeClass : inactiveClass;
    if (cardReasoner) cardReasoner.className = selectedModel === 'deepseek-reasoner' ? activeClass : inactiveClass;
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

  // --- F. Queue Cooldown Settings ---
  const cooldownToggle = document.getElementById('queue-cooldown-toggle');
  const cooldownMin = document.getElementById('queue-cooldown-min');
  const cooldownMax = document.getElementById('queue-cooldown-max');
  const cooldownInputsContainer = document.getElementById('queue-cooldown-inputs-container');
  const errorCooldownInput = document.getElementById('queue-error-cooldown');
  const errorCooldownUnit = document.getElementById('queue-error-cooldown-unit');
  const maxRetriesInput = document.getElementById('queue-max-retries');

  const formatSecHuman = (sec) => {
    const s = Math.max(0, Math.round(sec || 0));
    if (s >= 3600) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return m > 0 ? `sec (${h}h ${m}m)` : `sec (${h}h)`;
    }
    const m = Math.floor(s / 60);
    return `sec (${m}m)`;
  };

  const updateCooldownConfig = () => {
    const enabled = cooldownToggle ? cooldownToggle.checked : true;
    let min = cooldownMin ? parseInt(cooldownMin.value, 10) : 180;
    let max = cooldownMax ? parseInt(cooldownMax.value, 10) : 300;
    let errorSec = errorCooldownInput ? parseInt(errorCooldownInput.value, 10) : 4500;
    let maxRetries = maxRetriesInput ? parseInt(maxRetriesInput.value, 10) : 3;

    if (isNaN(min) || min < 10) min = 10;
    if (isNaN(max) || max < min) max = min;
    if (isNaN(errorSec) || errorSec < 60) errorSec = 60;
    if (isNaN(maxRetries) || maxRetries < 1) maxRetries = 1;

    if (errorCooldownUnit) {
      errorCooldownUnit.textContent = formatSecHuman(errorSec);
    }

    const config = {
      enabled,
      minSec: min,
      maxSec: max,
      errorCooldownSec: errorSec,
      maxRetries: maxRetries
    };

    if (typeof DownloadQueueService !== 'undefined') {
      DownloadQueueService.setCooldownConfig(config);
    } else {
      localStorage.setItem('quickconverter_queue_cooldown', JSON.stringify(config));
    }
    if (cooldownInputsContainer) {
      cooldownInputsContainer.classList.toggle('opacity-50', !enabled);
      cooldownInputsContainer.classList.toggle('pointer-events-none', !enabled);
    }
    triggerSaveIndicator('Queue cooldown settings saved');
  };

  // Load saved configuration
  const loadSavedCooldown = () => {
    let cfg = { enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 };
    try {
      const raw = localStorage.getItem('quickconverter_queue_cooldown');
      if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
    } catch (e) {}

    if (cooldownToggle) cooldownToggle.checked = cfg.enabled !== false;
    if (cooldownMin) cooldownMin.value = cfg.minSec || 180;
    if (cooldownMax) cooldownMax.value = cfg.maxSec || 300;
    if (errorCooldownInput) errorCooldownInput.value = cfg.errorCooldownSec || 4500;
    if (errorCooldownUnit) errorCooldownUnit.textContent = formatSecHuman(cfg.errorCooldownSec || 4500);
    if (maxRetriesInput) maxRetriesInput.value = cfg.maxRetries || 3;

    if (cooldownInputsContainer) {
      cooldownInputsContainer.classList.toggle('opacity-50', !cooldownToggle.checked);
      cooldownInputsContainer.classList.toggle('pointer-events-none', !cooldownToggle.checked);
    }
  };

  loadSavedCooldown();

  if (cooldownToggle) cooldownToggle.addEventListener('change', updateCooldownConfig);
  if (cooldownMin) cooldownMin.addEventListener('change', updateCooldownConfig);
  if (cooldownMax) cooldownMax.addEventListener('change', updateCooldownConfig);
  if (errorCooldownInput) errorCooldownInput.addEventListener('change', updateCooldownConfig);
  if (maxRetriesInput) maxRetriesInput.addEventListener('change', updateCooldownConfig);
}

  window.wireSettingsDeepseek = function () {
    if (window.__settingsDeepseekWired) return;
    window.__settingsDeepseekWired = true;
    window.dispatchEvent(new CustomEvent('settings-deepseek-mounted'));
    initDeepSeekSettings();
  };
})();
