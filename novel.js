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

  if (!novelId || !window.StorageService) {
    if (titleEl) titleEl.textContent = 'Novel Not Found';
    return;
  }

  let currentNovel = null;

  // --- DeepSeek Translation UI Wiring ---
  let updateNovelPromptUI = null;

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

    if (!toggleEl) return;

    const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
      (typeof DeepSeekService !== 'undefined' && DeepSeekService);

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
      }).catch((e) => console.warn('[novel.js] Failed to load DeepSeek API key:', e));
    }

    const handleKeyChange = () => {
      updateClearBtnVisibility();
      if (deepseek && typeof deepseek.setApiKey === 'function') {
        const val = keyEl ? keyEl.value.trim() : '';
        const remember = !!(rememberKeyEl && rememberKeyEl.checked);
        deepseek.setApiKey(val, remember);
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
        if (testStatusEl) {
          testStatusEl.className = 'hidden';
          testStatusEl.textContent = '';
        }
      });
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
        visibilityBtn.textContent = isPassword ? 'Hide Key' : 'Show Key';
      });
    }

    // "Test Key" button click handler
    if (testBtn && keyEl && testStatusEl) {
      testBtn.addEventListener('click', async () => {
        const key = keyEl.value.trim();
        if (!key) {
          testStatusEl.className = 'text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-md block mt-1';
          testStatusEl.textContent = 'Please enter an API key to test.';
          keyEl.focus();
          return;
        }

        testBtn.disabled = true;
        testStatusEl.className = 'text-[11px] text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 block mt-1';
        testStatusEl.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Testing connection & fetching models...</span>
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
        rightCol.appendChild(delBtn);
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

          if (isTranslationEnabled && !apiKey) {
            const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
              (typeof DeepSeekService !== 'undefined' && DeepSeekService);
            if (deepseek && typeof deepseek.getApiKey === 'function') {
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

          if (isTranslationEnabled && !apiKey) {
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
            <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>${isTranslationEnabled ? 'Translating (' + selectedModel + ')...' : 'Downloading...'}</span>
          `;

          try {
            const options = {
              translation: {
                enabled: isTranslationEnabled,
                apiKey: apiKey,
                prompt: promptEl ? promptEl.value : '',
                model: selectedModel
              }
            };
            await window.StorageService.downloadChapter(novel.id, chNum, options);
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
        });

        rightCol.appendChild(dlBtn);
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

    // Initial render
    await renderChapters(currentNovel);
  } catch (err) {
    console.error('Error loading novel details:', err);
  }
});
