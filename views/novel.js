document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const novelId = urlParams.get('id');

  const syncChaptersBtn = document.getElementById('sync-chapters-btn');
  const downloadAllBtn = document.getElementById('download-all-btn');

  if (!novelId || !window.StorageService) {
    return;
  }

  let currentNovel = null;

  const novelSettingsBtn = document.getElementById('novel-settings-btn');
  if (novelSettingsBtn && novelId) {
    novelSettingsBtn.href = `settings.html?from=novel&id=${encodeURIComponent(novelId)}`;
  }

  // --- DeepSeek Translation UI Wiring ---
  let aiConfigPanel = null;

  async function initDeepSeekUI() {
    if (!window.AiConfigPanel || typeof window.AiConfigPanel.create !== 'function') {
      console.warn('[novel.js] AiConfigPanel module not loaded; DeepSeek panel disabled.');
      return;
    }

    aiConfigPanel = window.AiConfigPanel.create({
      variant: 'full',
      ids: {
        toggle: 'deepseek-toggle',
        toggleBadge: 'deepseek-toggle-badge',
        providerBadge: 'novel-provider-badge',
        providerBtnOfficial: 'novel-provider-btn-official',
        providerBtnCustom: 'novel-provider-btn-custom',
        customRow: 'novel-custom-api-row',
        customUrl: 'novel-custom-base-url',
        presetBtn: 'novel-bridge-preset-btn',
        testCustomBtn: 'novel-test-custom-btn',
        apiKeyLabel: 'novel-api-key-label',
        apiKey: 'deepseek-api-key',
        rememberKey: 'remember-deepseek-key',
        clearKeyBtn: 'clear-deepseek-btn',
        prompt: 'deepseek-prompt',
        visibilityBtn: 'toggle-key-visibility',
        fields: 'deepseek-config-fields',
        editPromptBtn: 'edit-prompt-btn',
        modelSelect: 'deepseek-model-select',
        testBtn: 'test-deepseek-btn',
        testStatus: 'deepseek-test-status',
        balanceBadge: 'deepseek-balance-badge',
        balanceText: 'deepseek-balance-text',
        refreshBalanceBtn: 'deepseek-refresh-balance-btn',
        refreshBalanceIcon: 'deepseek-refresh-balance-icon',
        pricingBadge: 'deepseek-pricing-badge',
        cooldownToggle: 'novel-cooldown-toggle',
        cooldownToggleLabel: 'novel-cooldown-toggle-label',
        cooldownMin: 'novel-cooldown-min',
        cooldownMax: 'novel-cooldown-max',
        cooldownMinLabel: 'novel-cooldown-min-label',
        cooldownMaxLabel: 'novel-cooldown-max-label',
        cooldownBadge: 'novel-cooldown-badge',
        cooldownInputs: 'novel-cooldown-inputs-container'
      },
      hooks: {
        getPrompt: () => (currentNovel && currentNovel.translationPrompt) || null,
        savePrompt: async (text) => {
          if (!currentNovel) return;
          currentNovel.translationPrompt = text;
          if (window.StorageService && typeof window.StorageService.updateNovel === 'function') {
            await window.StorageService.updateNovel(currentNovel.id, { translationPrompt: text });
          }
        }
      }
    });

    if (aiConfigPanel) await aiConfigPanel.refresh();
  }

  initDeepSeekUI();

  function refreshChapterList() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('novel-chapters-refresh'));
    }
  }

  async function enqueueChapterDownload(chNum, chapterTitle) {
    if (!currentNovel) return;

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

    const queueService = (typeof window !== 'undefined' && window.DownloadQueueService) ||
      (typeof globalThis !== 'undefined' && globalThis.DownloadQueueService);

    if (queueService && typeof queueService.enqueue === 'function') {
      await queueService.enqueue({
        novelId: currentNovel.id,
        novelTitle: currentNovel.title,
        chapterNumber: chNum,
        chapterTitle: chapterTitle || `Chapter ${chNum}`,
        options
      });
      refreshChapterList();
    } else {
      try {
        await window.StorageService.downloadChapter(currentNovel.id, chNum, options);
        if (aiConfigPanel && isTranslationEnabled && !isCustomMode) {
          aiConfigPanel.refreshBalance(true);
        }
        refreshChapterList();
      } catch (err) {
        console.error('Error downloading chapter:', err);
      }
    }
  }

  try {
    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) {
      return;
    }

    currentNovel = novel;

    // Populate Novel Translation Prompt
    if (aiConfigPanel) {
      aiConfigPanel.setPrompt(currentNovel.translationPrompt || undefined);
    }

    document.title = `${novel.title} - QuickConverter`;

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
          refreshChapterList();
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
          refreshChapterList();
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
    refreshChapterList();

    const queueService = (typeof window !== 'undefined' && window.DownloadQueueService);
    if (queueService && typeof queueService.subscribe === 'function') {
      let hadActiveTask = false;
      queueService.subscribe((state) => {
        const hasActive = !!(state && state.activeTask);
        if (hadActiveTask && !hasActive && aiConfigPanel) {
          aiConfigPanel.refreshBalance(true);
        }
        hadActiveTask = hasActive;
      });
    }

    window.addEventListener('novel-chapter-download', (e) => {
      const detail = (e && e.detail) || {};
      enqueueChapterDownload(detail.chapterNumber, detail.chapterTitle);
    });
  } catch (err) {
    console.error('Error loading novel details:', err);
  }
});
