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

  const escapeHtml = window.UIUtils.escapeHtml;

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
    const drawerBadge = document.getElementById('name-list-badge');

    if (drawerBadge) drawerBadge.textContent = nameList.length;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novel-name-list-updated', { detail: { count: nameList.length } }));
    }

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
    window.addEventListener('novel-open-name-list', openNameListDrawer);

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

    // Populate Novel Name List / Glossary
    if (typeof initNameListUI === 'function') {
      initNameListUI(currentNovel);
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
