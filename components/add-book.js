// QuickConverter - Reusable Add Book Web Component (<add-book-button>)
// Encapsulates trigger button, URL inspection dialog, platform matching,
// live series preview, and library persistence without tight view coupling.

(function () {
  const SUPPORTED_DOMAINS = ['wetriedtls.com'];

  class AddBookButton extends HTMLElement {
    constructor() {
      super();
      this._buttonEl = null;
      this._modalEl = null;
      this._previewData = null;
      this._isInspecting = false;
      this._debounceTimer = null;
    }

    connectedCallback() {
      this._renderButton();
    }

    disconnectedCallback() {
      if (this._modalEl && this._modalEl.parentNode) {
        this._modalEl.parentNode.removeChild(this._modalEl);
        this._modalEl = null;
      }
    }

    _renderButton() {
      const isCompact = this.hasAttribute('compact');
      const customClass = this.getAttribute('button-class') || '';

      if (isCompact) {
        this.innerHTML = `
          <button
            type="button"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition cursor-pointer active:scale-[0.98] ${customClass}"
            title="Add novel from web link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Book</span>
          </button>
        `;
      } else {
        this.innerHTML = `
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm shadow-indigo-500/20 transition cursor-pointer active:scale-[0.98] ${customClass}"
            title="Add novel from web link"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Add Book</span>
          </button>
        `;
      }

      this._buttonEl = this.querySelector('button');
      if (this._buttonEl) {
        this._buttonEl.addEventListener('click', (e) => {
          e.preventDefault();
          this.openModal();
        });
      }
    }

    openModal() {
      let modal = document.getElementById('quickconverter-add-book-modal');
      if (!modal) {
        modal = this._createModal();
        document.body.appendChild(modal);
      }
      this._modalEl = modal;

      // Reset state
      this._previewData = null;
      const input = modal.querySelector('#add-book-url-input');
      if (input) {
        input.value = '';
        setTimeout(() => input.focus(), 80);
      }
      this._renderPreviewState(null);

      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    closeModal() {
      if (this._modalEl) {
        this._modalEl.classList.add('hidden');
        this._modalEl.classList.remove('flex');
      }
    }

    _createModal() {
      const modal = document.createElement('div');
      modal.id = 'quickconverter-add-book-modal';
      modal.className = 'fixed inset-0 z-50 hidden items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200';

      modal.innerHTML = `
        <div class="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col p-5 gap-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
          <!-- Header -->
          <div class="flex items-center justify-between pb-3 border-b border-slate-800">
            <div class="flex items-center gap-2.5">
              <div class="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm">
                📖
              </div>
              <div>
                <h3 class="text-sm font-bold text-slate-100 leading-tight">Add Book by Link</h3>
                <p class="text-[11px] text-slate-400">Inspect and add a novel to your managed library</p>
              </div>
            </div>
            <button
              type="button"
              id="add-book-close-btn"
              class="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition cursor-pointer"
              title="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <!-- Input Group -->
          <div class="flex flex-col gap-2">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>Novel Web Link</span>
              <div class="flex items-center gap-1">
                <span>Supported:</span>
                <span class="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono text-[10px] border border-indigo-500/25">wetriedtls.com</span>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input
                  type="url"
                  id="add-book-url-input"
                  placeholder="https://wetriedtls.com/series/..."
                  autocomplete="off"
                  spellcheck="false"
                  class="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <button
                type="button"
                id="add-book-inspect-btn"
                class="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                <span>Inspect</span>
              </button>
            </div>
          </div>

          <!-- Status & Preview Area -->
          <div id="add-book-preview-container" class="min-h-[90px] flex flex-col justify-center">
            <!-- Populated dynamically -->
          </div>

          <!-- Footer Action Buttons -->
          <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              id="add-book-cancel-btn"
              class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              id="add-book-submit-btn"
              disabled
              class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-500/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Add to Library</span>
            </button>
          </div>
        </div>
      `;

      // Event Listeners
      const closeBtn = modal.querySelector('#add-book-close-btn');
      const cancelBtn = modal.querySelector('#add-book-cancel-btn');
      const submitBtn = modal.querySelector('#add-book-submit-btn');
      const inspectBtn = modal.querySelector('#add-book-inspect-btn');
      const urlInput = modal.querySelector('#add-book-url-input');

      closeBtn.addEventListener('click', () => this.closeModal());
      cancelBtn.addEventListener('click', () => this.closeModal());

      // Backdrop click closes
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.closeModal();
      });

      // Escape key closes
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
          this.closeModal();
        }
      });

      // Inspect click
      inspectBtn.addEventListener('click', () => this._handleInspect());

      // Input change / paste auto-inspect debounce
      urlInput.addEventListener('input', () => {
        if (this._debounceTimer) clearTimeout(this._debounceTimer);
        const val = urlInput.value.trim();
        if (val.length > 8 && (val.includes('wetriedtls.com') || val.includes('http'))) {
          this._debounceTimer = setTimeout(() => this._handleInspect(), 350);
        }
      });

      urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (this._previewData) {
            this._handleSubmit();
          } else {
            this._handleInspect();
          }
        }
      });

      // Submit click
      submitBtn.addEventListener('click', () => this._handleSubmit());

      return modal;
    }

    async _handleInspect() {
      if (!this._modalEl) return;
      const input = this._modalEl.querySelector('#add-book-url-input');
      const inspectBtn = this._modalEl.querySelector('#add-book-inspect-btn');
      if (!input) return;

      let rawUrl = input.value.trim();
      if (!rawUrl) {
        this._renderPreviewState({
          type: 'error',
          message: 'Please paste or type a valid novel link.'
        });
        return;
      }

      // Auto-prepend https:// if protocol is omitted
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = 'https://' + rawUrl;
        input.value = rawUrl;
      }

      // Validate URL format
      let parsedUrlObj;
      try {
        parsedUrlObj = new URL(rawUrl);
      } catch (e) {
        this._renderPreviewState({
          type: 'error',
          message: 'Invalid URL format. Example: https://wetriedtls.com/series/my-novel'
        });
        return;
      }

      // Check Provider Registry
      const provider = (typeof window.ProviderRegistry !== 'undefined')
        ? window.ProviderRegistry.getProviderForUrl(rawUrl)
        : (typeof window.WetriedtlsProvider !== 'undefined' && window.WetriedtlsProvider.matches(rawUrl) ? window.WetriedtlsProvider : null);

      if (!provider) {
        this._renderPreviewState({
          type: 'unsupported',
          domain: parsedUrlObj.hostname,
          message: `The website "${parsedUrlObj.hostname}" is not currently supported.`
        });
        return;
      }

      // Parse series or chapter URL
      let parsedInfo = null;
      if (typeof provider.parseUrl === 'function') {
        parsedInfo = provider.parseUrl(rawUrl);
      }

      if (!parsedInfo || !parsedInfo.slug) {
        this._renderPreviewState({
          type: 'error',
          message: 'Could not identify a novel series from this link. Please provide a series or chapter page.'
        });
        return;
      }

      const slug = parsedInfo.slug;
      const seriesUrl = parsedInfo.seriesUrl || rawUrl;

      // Check if novel is already in library
      if (window.StorageService && typeof window.StorageService.getNovelBySlug === 'function') {
        const existing = await window.StorageService.getNovelBySlug(slug);
        if (existing) {
          this._renderPreviewState({
            type: 'already_managed',
            novel: existing
          });
          return;
        }
      }

      // Show loading skeleton
      this._renderPreviewState({ type: 'loading', slug });
      if (inspectBtn) inspectBtn.disabled = true;

      try {
        // Fetch series metadata
        let metadata = null;
        if (typeof provider.fetchSeriesMetadata === 'function') {
          metadata = await provider.fetchSeriesMetadata(slug, seriesUrl);
        }

        // Fetch accurate chapter count from API if needed
        let totalChapters = metadata?.totalChapters || null;
        if ((!totalChapters || totalChapters <= 0) && typeof provider.fetchChapterList === 'function') {
          const chapters = await provider.fetchChapterList(slug, seriesUrl);
          if (Array.isArray(chapters) && chapters.length > 0) {
            totalChapters = chapters.length;
          }
        }

        const title = metadata?.title || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const thumbnail = metadata?.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
        const status = metadata?.status || 'Active';

        this._previewData = {
          title,
          slug,
          seriesUrl,
          domain: provider.domains ? provider.domains[0] : 'wetriedtls.com',
          thumbnail,
          totalChapters: totalChapters || 100,
          status,
          icon: '📖'
        };

        this._renderPreviewState({
          type: 'success',
          preview: this._previewData
        });
      } catch (err) {
        console.warn('[AddBook] Failed to inspect series:', err);
        this._renderPreviewState({
          type: 'error',
          message: 'Failed to retrieve novel details from the website. Check your internet connection.'
        });
      } finally {
        if (inspectBtn) inspectBtn.disabled = false;
      }
    }

    async _handleSubmit() {
      if (!this._previewData || !window.StorageService) return;
      const submitBtn = this._modalEl.querySelector('#add-book-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Adding...</span>
        `;
      }

      try {
        const newNovel = {
          title: this._previewData.title,
          slug: this._previewData.slug,
          url: this._previewData.seriesUrl,
          domain: this._previewData.domain,
          thumbnail: this._previewData.thumbnail,
          totalChapters: this._previewData.totalChapters,
          status: this._previewData.status,
          icon: this._previewData.icon || '📖'
        };

        await window.StorageService.addNovel(newNovel);

        // Dispatch global standard DOM event
        window.dispatchEvent(
          new CustomEvent('novel-added', {
            detail: { novel: newNovel, slug: this._previewData.slug }
          })
        );

        if (submitBtn) {
          submitBtn.className = 'px-4 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm shadow-emerald-500/20';
          submitBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Added!</span>
          `;
        }

        setTimeout(() => {
          this.closeModal();
        }, 500);
      } catch (err) {
        console.error('[AddBook] Error adding novel:', err);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Retry Add</span>`;
        }
      }
    }

    _renderPreviewState(state) {
      if (!this._modalEl) return;
      const container = this._modalEl.querySelector('#add-book-preview-container');
      const submitBtn = this._modalEl.querySelector('#add-book-submit-btn');
      if (!container) return;

      if (submitBtn) {
        submitBtn.disabled = !(state && state.type === 'success');
      }

      if (!state) {
        container.innerHTML = `
          <div class="p-4 rounded-lg bg-slate-800/40 border border-slate-700/40 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
            <span class="text-base">💡</span>
            <span>Paste a series or chapter link to preview cover, title, and chapters.</span>
          </div>
        `;
        return;
      }

      if (state.type === 'loading') {
        container.innerHTML = `
          <div class="flex items-center gap-3 p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
            <div class="w-12 h-16 rounded bg-slate-700/50 animate-pulse flex-shrink-0"></div>
            <div class="flex flex-col gap-2 flex-1">
              <div class="h-3.5 w-3/4 bg-slate-700/60 rounded animate-pulse"></div>
              <div class="h-2.5 w-1/2 bg-slate-700/40 rounded animate-pulse"></div>
              <div class="text-[11px] text-indigo-400 flex items-center gap-1.5 pt-0.5">
                <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Fetching series metadata & chapter count...</span>
              </div>
            </div>
          </div>
        `;
        return;
      }

      if (state.type === 'unsupported') {
        container.innerHTML = `
          <div class="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex flex-col gap-1.5">
            <div class="font-semibold flex items-center gap-1.5">
              <span>⚠️</span>
              <span>Website Not Supported</span>
            </div>
            <p class="text-slate-300 text-[11px]">
              The link belongs to <span class="font-mono text-amber-200">${state.domain || 'an unsupported domain'}</span>. Currently supported platforms:
              <strong class="text-white">${SUPPORTED_DOMAINS.join(', ')}</strong>.
            </p>
          </div>
        `;
        return;
      }

      if (state.type === 'already_managed') {
        const novel = state.novel;
        container.innerHTML = `
          <div class="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <img src="${novel.thumbnail || ''}" alt="${novel.title}" class="w-10 h-14 object-cover rounded border border-blue-500/30 flex-shrink-0 bg-slate-800" />
              <div class="flex flex-col min-w-0">
                <span class="font-semibold text-slate-100 truncate">${novel.title}</span>
                <span class="text-[11px] text-blue-300/80">Already in your library (${novel.totalChapters || 0} chapters)</span>
              </div>
            </div>
            <button
              type="button"
              id="add-book-open-existing-btn"
              class="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition cursor-pointer flex-shrink-0"
            >
              Open
            </button>
          </div>
        `;
        const openBtn = container.querySelector('#add-book-open-existing-btn');
        if (openBtn) {
          openBtn.addEventListener('click', () => {
            this.closeModal();
            window.location.href = `novel.html?id=${encodeURIComponent(novel.id)}`;
          });
        }
        return;
      }

      if (state.type === 'error') {
        container.innerHTML = `
          <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-start gap-2">
            <span class="text-sm">❌</span>
            <span>${state.message || 'An error occurred.'}</span>
          </div>
        `;
        return;
      }

      if (state.type === 'success' && state.preview) {
        const p = state.preview;
        container.innerHTML = `
          <div class="flex gap-3.5 p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 items-center">
            <div class="w-14 h-20 rounded-md overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
              <img
                src="${p.thumbnail}"
                alt="${p.title}"
                class="w-full h-full object-cover"
                onerror="this.src='https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp'"
              />
            </div>
            <div class="flex flex-col gap-1 min-w-0 flex-1">
              <span class="font-bold text-slate-100 text-xs sm:text-sm line-clamp-2 leading-snug">${p.title}</span>
              <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-700/60 border border-slate-600/50 text-slate-300">
                  ${p.domain}
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  ${p.totalChapters} Chs
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  ${p.status}
                </span>
              </div>
            </div>
          </div>
        `;
      }
    }
  }

  // Register Custom Element
  if (typeof customElements !== 'undefined' && !customElements.get('add-book-button')) {
    customElements.define('add-book-button', AddBookButton);
  }

  // Global export
  if (typeof window !== 'undefined') {
    window.AddBookButton = AddBookButton;
  }
})();
