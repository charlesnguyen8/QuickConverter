export const popupHtml = `
    <!-- View 1: Main Menu View -->
    <div id="view-main" class="flex flex-col gap-3.5">
      <!-- Header -->
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-md bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            Q
          </div>
          <h1
            class="text-xl font-bold leading-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"
          >
            QuickConverter
          </h1>
        </div>

        <button
          type="button"
          id="settings-btn"
          class="flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            ></path>
          </svg>
        </button>
      </header>

      <!-- Main Container -->
      <main class="flex flex-col gap-3.5">
        <!-- Status Card -->
        <section id="status-card" class="flex flex-col gap-2 rounded-md border border-slate-700 bg-slate-800 p-3.5 shadow-sm">
          <div class="flex items-center justify-between">
            <span id="badge" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300">
              Checking site...
            </span>
            <span id="site-host" class="text-xs text-slate-400 font-mono truncate max-w-[140px]"></span>
          </div>

          <div id="status-message" class="text-sm text-slate-300 leading-relaxed">
            Detecting current page compatibility...
          </div>

          <div id="status-action" class="hidden pt-1"></div>
        </section>

        <!-- Managed Novels Section -->
        <section class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-0.5">
            <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Managing these novel
            </h2>
            <div class="flex items-center gap-1.5">
              <add-book-button compact></add-book-button>
              <span id="novel-count" class="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                0 Novels
              </span>
            </div>
          </div>

          <!-- Dynamic Novel List -->
          <div id="novel-list" class="flex flex-col gap-1.5 overflow-y-auto max-h-[200px]">
            <!-- Rendered dynamically from storage -->
          </div>
        </section>

        <!-- Open Library Button -->
        <div>
          <button
            type="button"
            id="open-library-btn"
            class="w-full cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white bg-indigo-500 transition hover:bg-indigo-600 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm flex items-center justify-center gap-2"
          >
            <span>Open Library</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>
      </main>
    </div>

    <!-- View 2: Novel Detail View (Hidden by default) -->
    <div id="view-novel" class="hidden flex flex-col gap-3">
      <!-- Header with Top-Left Back Arrow Button & Settings Button -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            id="back-to-main-btn"
            class="flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex-shrink-0 cursor-pointer"
            title="Back to Main Menu"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              stroke-width="2" 
              stroke-linecap="round" 
              stroke-linejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>

          <h1 class="text-lg font-bold leading-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent truncate">
            Novel Chapters
          </h1>
        </div>

        <button
          type="button"
          id="novel-settings-btn"
          class="flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer flex-shrink-0"
          title="Settings"
          aria-label="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            ></path>
          </svg>
        </button>
      </div>

      <!-- Novel Summary Card (Thumbnail, Title, Stats) -->
      <div class="flex items-center gap-3 p-3 rounded-md bg-slate-800 border border-slate-700 shadow-sm">
        <div class="w-14 aspect-[3/4] rounded overflow-hidden bg-slate-900 border border-slate-700/80 flex-shrink-0 shadow-sm">
          <img
            id="popup-novel-thumb"
            src=""
            alt="Thumbnail"
            class="w-full h-full object-cover"
          />
        </div>
        <div class="flex flex-col gap-1 overflow-hidden flex-1 min-w-0">
          <h2 id="popup-novel-title" class="text-sm font-bold text-slate-100 truncate">
            Novel Title
          </h2>
          <div class="flex items-center gap-1.5">
            <span id="popup-novel-domain" class="text-[11px] font-mono text-slate-400 truncate">
              wetriedtls.com
            </span>
          </div>
          <span id="popup-novel-stats" class="text-xs text-indigo-300 font-medium">
            0 / 0 chapters downloaded
          </span>
        </div>
      </div>

      <!-- DeepSeek Translation Pre-Download Card -->
      <div class="rounded-lg bg-slate-800/90 border border-slate-700/80 p-3 shadow-sm flex flex-col gap-2.5">
        <!-- Toggle Row -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-6 h-6 rounded bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-xs">
              🌐
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-bold text-slate-100">DeepSeek Translation</span>
                <span id="deepseek-toggle-badge" class="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                  Off (Save Raw)
                </span>
              </div>
              <p class="text-[10px] text-slate-400 leading-tight">
                Translate chapter via API before saving
              </p>
            </div>
          </div>

          <!-- Slider Toggle -->
          <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" id="deepseek-toggle" class="sr-only peer" />
            <div class="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500"></div>
          </label>
        </div>

        <!-- Configuration Inputs (Model, API Key & Prompt) -->
        <div id="deepseek-config-fields" class="flex flex-col gap-2 pt-2 border-t border-slate-700/60">
          <!-- Provider Selector (Official DeepSeek vs Custom API) -->
          <div class="flex flex-col gap-1.5 p-2 rounded-md bg-slate-900/60 border border-slate-700/70">
            <div class="flex items-center justify-between text-[11px] font-semibold text-slate-300">
              <span>AI Provider</span>
              <span id="popup-provider-badge" class="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Official Cloud</span>
            </div>
            <div class="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-md border border-slate-700/80">
              <button
                type="button"
                id="popup-provider-btn-official"
                class="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-indigo-600 text-white shadow-sm"
              >
                Official DeepSeek
              </button>
              <button
                type="button"
                id="popup-provider-btn-custom"
                class="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200"
              >
                Custom API / Bridge
              </button>
            </div>
            <!-- Custom API Base URL Input -->
            <div id="popup-custom-api-row" class="hidden flex-col gap-1 pt-1 border-t border-slate-700/50">
              <div class="flex items-center justify-between text-[10px] text-slate-400">
                <label for="popup-custom-base-url" class="font-mono">Base URL:</label>
                <div class="flex items-center gap-1.5">
                  <button type="button" id="popup-bridge-preset-btn" class="text-[9px] text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer" title="Use local bridge default (port 8000)">Preset (8000)</button>
                  <button type="button" id="popup-test-custom-btn" class="text-[9px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer">Ping</button>
                </div>
              </div>
              <input
                type="text"
                id="popup-custom-base-url"
                value="http://127.0.0.1:8000/v1"
                placeholder="http://127.0.0.1:8000/v1"
                class="w-full px-2 py-1 text-[11px] font-mono bg-slate-950/80 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition"
              />
              <div id="popup-custom-test-status" class="hidden text-[10px] px-1.5 py-0.5 rounded border"></div>
            </div>
          </div>

          <!-- Model Selector -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <label for="deepseek-model-select" class="text-[11px] font-semibold text-slate-300">
                Model
              </label>
              <div class="flex items-center gap-1 flex-wrap">
                <span id="deepseek-pricing-badge" class="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400" title="Live DeepSeek UTC Pricing Schedule">
                  Off-Peak (50% Off)
                </span>
                <div id="deepseek-balance-badge" class="hidden items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none" title="DeepSeek Account Balance">
                  <span>💳</span>
                  <span id="deepseek-balance-text">...</span>
                  <button type="button" id="deepseek-refresh-balance-btn" class="hover:text-white transition ml-0.5 cursor-pointer" title="Refresh balance">
                    <svg id="deepseek-refresh-balance-icon" class="w-2.5 h-2.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                  </button>
                </div>
                <span class="text-[10px] text-slate-400">DeepSeek V4.1</span>
              </div>
            </div>
            <select
              id="deepseek-model-select"
              class="w-full px-2 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer"
            >
              <option value="deepseek-flash" selected>deepseek-flash (V4.1-Flash • Fast)</option>
              <option value="deepseek-chat">deepseek-chat (V3 • Standard)</option>
            </select>
          </div>

          <!-- Box 1: API Key -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <label for="deepseek-api-key" id="popup-api-key-label" class="text-[11px] font-semibold text-slate-300">
                1. DeepSeek API Key
              </label>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  id="test-deepseek-btn"
                  class="text-[10px] font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60"
                  title="Test key and fetch live models"
                >
                  Test Key
                </button>
                <button
                  type="button"
                  id="toggle-key-visibility"
                  class="text-[10px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                >
                  Show
                </button>
              </div>
            </div>
            <input
              type="password"
              id="deepseek-api-key"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="sk-..."
              class="w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition font-mono"
            />
            <div id="deepseek-test-status" class="hidden text-[10px] px-2 py-1 rounded border"></div>
            <div class="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
              <label class="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Keep key saved across browser restarts">
                <input
                  type="checkbox"
                  id="remember-deepseek-key"
                  class="w-3 h-3 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer"
                />
                <span>Remember key</span>
              </label>
              <button
                type="button"
                id="clear-deepseek-btn"
                class="hidden text-rose-400 hover:text-rose-300 transition text-[10px] underline cursor-pointer"
                title="Clear API key from memory and storage"
              >
                Clear
              </button>
            </div>
          </div>

          <!-- Box 2: Translation Prompt -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <label for="deepseek-prompt" class="text-[11px] font-semibold text-slate-300">
                2. Translation Prompt
              </label>
              <button
                type="button"
                id="edit-prompt-btn"
                class="text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60"
              >
                Edit
              </button>
            </div>
            <textarea
              id="deepseek-prompt"
              rows="2"
              readonly
              placeholder="Enter translation instructions/prompt for DeepSeek..."
              class="w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition resize-none leading-relaxed cursor-default"
            ></textarea>
          </div>

          <!-- Cooldown Option in Popup DeepSeek Panel -->
          <div class="flex items-center justify-between pt-2 border-t border-slate-700/60">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs">⏳</span>
              <div class="flex flex-col min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[11px] font-bold text-slate-200">Rate Limit Cooldown</span>
                  <span id="popup-cooldown-badge" class="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    3–5m
                  </span>
                </div>
                <p class="text-[10px] text-slate-400 truncate">Wait 3–5m between queued translations</p>
              </div>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span id="popup-cooldown-toggle-label" class="text-[10px] font-mono font-bold text-amber-400">ON</span>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0" title="Toggle 3-5m randomized cooldown between translated chapters">
                <input type="checkbox" id="popup-cooldown-toggle" class="sr-only peer" checked />
                <div class="w-8 h-4.5 cooldown-popup-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all"></div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Chapters List Section -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between px-0.5">
          <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Novel Chapters
          </h3>
          <div class="flex items-center gap-1.5">
            <button
              id="popup-download-all-btn"
              type="button"
              class="px-2 py-0.5 rounded text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer shadow-sm flex items-center gap-1"
              title="Download and translate all missing chapters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>Download All</span>
            </button>
            <span id="popup-chapter-count" class="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              0 Chapters
            </span>
          </div>
        </div>

        <div id="popup-chapter-list" class="flex flex-col gap-1.5 overflow-y-auto max-h-[220px]">
          <!-- Populated dynamically by popup.js -->
        </div>
      </div>
    </div>
`;
