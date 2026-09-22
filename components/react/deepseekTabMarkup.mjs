export const deepseekTabHtml = `
          <!-- Section Banner -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-bold text-slate-100 flex items-center gap-2">
                <span>🌐</span>
                <span>DeepSeek AI Translation</span>
              </h2>
              <!-- Live Balance Widget Badge in Header -->
              <div
                id="deepseek-header-balance"
                class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shadow-sm"
                title="Active DeepSeek Account Balance"
              >
                <span>💳</span>
                <span id="deepseek-header-balance-val">Balance: Loading...</span>
              </div>
            </div>
            <p class="text-xs text-slate-400">
              Configure global defaults, API credentials, balance auto-refresh, and translation prompt rules.
            </p>
          </div>

          <!-- Master AI Translation Enable / Disable Card -->
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex items-center justify-between gap-4">
            <div class="flex flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-slate-200">AI Translation by Default</span>
                <span
                  id="deepseek-toggle-badge"
                  class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-400 border border-slate-600"
                >
                  Disabled
                </span>
              </div>
              <p class="text-xs text-slate-400">
                When enabled, newly queued chapters are translated using DeepSeek AI. You can still toggle this per-novel at any time.
              </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input type="checkbox" id="deepseek-master-toggle" class="sr-only peer" />
              <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <!-- AI Provider & Endpoint Selector Card -->
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-slate-200">AI Provider & Connection</h3>
                <p class="text-xs text-slate-400">Choose between the official cloud API or your custom OpenAI-compatible endpoint (e.g. Local Web Bridge).</p>
              </div>
              <span id="provider-status-badge" class="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                Official Cloud API
              </span>
            </div>

            <!-- Provider Segmented Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Official Cloud API Option -->
              <label id="provider-card-official" class="flex flex-col gap-2 p-3.5 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <input type="radio" name="ai-provider" value="official" id="provider-radio-official" class="text-indigo-600 focus:ring-indigo-500" checked />
                    <span class="text-sm font-bold text-slate-100">Official DeepSeek API</span>
                  </div>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 border border-slate-600">
                    Cloud API
                  </span>
                </div>
                <p class="text-xs text-slate-300 leading-relaxed">
                  High-throughput cloud requests with context caching discounts. Requires DeepSeek platform API key and account balance.
                </p>
                <div class="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
                  <span>api.deepseek.com</span>
                  <span class="text-emerald-400 font-semibold">Pay-per-token</span>
                </div>
              </label>

              <!-- Custom API / Local Web Bridge Option -->
              <label id="provider-card-bridge" class="flex flex-col gap-2 p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <input type="radio" name="ai-provider" value="custom" id="provider-radio-bridge" class="text-indigo-600 focus:ring-indigo-500" />
                    <span class="text-sm font-bold text-slate-200">Custom API / Local Bridge</span>
                  </div>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Custom • Free
                  </span>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Connect to any OpenAI-compatible base URL (Local Web Bridge, Ollama, LM Studio). API key is optional for local endpoints.
                </p>
                <div class="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
                  <span>127.0.0.1:8000/v1 or custom</span>
                  <span class="text-emerald-400 font-semibold">No Token Fees</span>
                </div>
              </label>
            </div>

            <!-- Custom / Bridge Configuration Details -->
            <div id="bridge-config-panel" class="hidden flex flex-col gap-3 pt-2 border-t border-slate-700/60">
              <div class="flex items-center justify-between">
                <label for="bridge-url-input" class="text-xs font-semibold text-slate-300">Custom API Base URL</label>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    id="bridge-preset-btn"
                    class="text-[10px] text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer"
                  >
                    Preset: Local Bridge (8000)
                  </button>
                  <span id="bridge-status-feedback" class="text-xs font-medium text-slate-400">Not checked yet</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  id="bridge-url-input"
                  value="http://127.0.0.1:8000/v1"
                  placeholder="http://127.0.0.1:8000/v1"
                  class="flex-1 px-3 py-2 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <button
                  type="button"
                  id="test-bridge-btn"
                  class="px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition focus:outline-none cursor-pointer flex-shrink-0 shadow-sm"
                >
                  Test Base URL
                </button>
              </div>
              <div class="p-2.5 rounded-lg bg-slate-900/60 border border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
                <span>💡 Works with <code>start_chromium.bat</code> or any OpenAI-compatible <code>/v1/chat/completions</code> server.</span>
                <span class="text-emerald-400 font-medium">Auto-deletes chats</span>
              </div>
            </div>
          </div>

          <!-- Default Translation Model Card -->
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
            <div>
              <h3 class="text-sm font-semibold text-slate-200">Default Model</h3>
              <p class="text-xs text-slate-400">Select the model used for new translation tasks.</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Flash Card -->
              <label
                id="model-card-flash"
                class="flex flex-col gap-2 p-4 rounded-xl border border-indigo-500/50 bg-indigo-500/10 cursor-pointer transition relative"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <input type="radio" name="deepseek-model" value="deepseek-flash" id="model-radio-flash" class="text-indigo-600 focus:ring-indigo-500" checked />
                    <span class="text-sm font-bold text-slate-100">DeepSeek Flash</span>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    ⚡ 50x Cheaper Cache
                  </span>
                </div>
                <p class="text-xs text-slate-300 leading-relaxed">
                  Ultra fast throughput, lowest latency, and up to 50x cheaper token cost when context cache hits. Ideal for novel binge-reading.
                </p>
                <div class="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
                  <span>Input: $0.14 / M</span>
                  <span class="text-emerald-400 font-semibold">Cached: $0.014 / M</span>
                </div>
              </label>

              <!-- Chat Card -->
              <label
                id="model-card-chat"
                class="flex flex-col gap-2 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <input type="radio" name="deepseek-model" value="deepseek-chat" id="model-radio-chat" class="text-indigo-600 focus:ring-indigo-500" />
                    <span class="text-sm font-bold text-slate-200">DeepSeek Chat</span>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Standard
                  </span>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Standard flagship conversational and literary translation model with nuanced grammar awareness for complex prose.
                </p>
                <div class="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
                  <span>Input: $0.27 / M</span>
                  <span class="text-emerald-400 font-semibold">Cached: $0.07 / M</span>
                </div>
              </label>

              <!-- Reasoner / R1 Card -->
              <label
                id="model-card-reasoner"
                class="flex flex-col gap-2 p-4 rounded-xl border border-slate-700/60 bg-slate-900/40 cursor-pointer transition relative hover:border-slate-600 col-span-1 sm:col-span-2"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <input type="radio" name="deepseek-model" value="deepseek-reasoner" id="model-radio-reasoner" class="text-indigo-600 focus:ring-indigo-500" />
                    <span class="text-sm font-bold text-slate-200">DeepSeek Reasoner (R1 DeepThink)</span>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    🧠 DeepThink Reasoning
                  </span>
                </div>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Activates in-depth reasoning and context synthesis before generating final English text. Excellent for cultivation terminology, poetic allegories, and difficult idioms.
                </p>
                <div class="text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-700/60 flex items-center justify-between">
                  <span>Reasoning Mode: Chain-of-Thought</span>
                  <span class="text-purple-400 font-semibold">Free via Local Bridge</span>
                </div>
              </label>
            </div>
          </div>

          <!-- API Key & Balance Card -->
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-5">
            <div>
              <h3 class="text-sm font-semibold text-slate-200">DeepSeek API Key</h3>
              <p class="text-xs text-slate-400">
                Your key is stored securely on this device and used exclusively for direct requests to DeepSeek's official API.
              </p>
            </div>

            <!-- API Key Input Field -->
            <div class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    type="password"
                    id="settings-api-key"
                    placeholder="sk-..."
                    autocomplete="off"
                    class="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 font-mono pr-10 transition"
                  />
                  <button
                    type="button"
                    id="toggle-key-visibility-btn"
                    class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded focus:outline-none cursor-pointer"
                    title="Show / Hide API Key"
                  >
                    <svg id="eye-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  </button>
                </div>

                <button
                  type="button"
                  id="test-key-btn"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer flex-shrink-0"
                >
                  <span>Verify Key</span>
                </button>

                <button
                  type="button"
                  id="clear-key-btn"
                  class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition focus:outline-none cursor-pointer flex-shrink-0"
                  title="Remove Key from Storage"
                >
                  <span>Clear</span>
                </button>
              </div>

              <!-- Key Storage Persistence Options -->
              <div class="flex items-center justify-between pt-1">
                <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
                  <input
                    type="checkbox"
                    id="settings-remember-key"
                    class="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    checked
                  />
                  <span>Remember API Key on this computer (Local Storage)</span>
                </label>
                <span id="key-validation-status" class="text-xs font-medium"></span>
              </div>
            </div>

            <!-- Live Account Balance Monitor -->
            <div id="settings-balance-card" class="bg-slate-900/60 border border-slate-700/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-400 flex-shrink-0">
                  💳
                </div>
                <div class="flex flex-col">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-slate-400">Available Account Balance</span>
                    <span id="balance-live-dot" class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live Auto-Refreshing"></span>
                  </div>
                  <div class="flex items-baseline gap-2">
                    <span id="settings-balance-text" class="text-lg font-bold font-mono text-emerald-400">
                      $0.00 USD
                    </span>
                    <span id="settings-granted-text" class="text-xs text-slate-400">
                      (Includes granted funds)
                    </span>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 self-end sm:self-center">
                <span class="text-[11px] text-slate-500 hidden lg:inline">Auto-refreshes periodically</span>
                <button
                  type="button"
                  id="refresh-balance-btn"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition focus:outline-none cursor-pointer"
                  title="Refresh Balance from DeepSeek"
                >
                  <svg id="refresh-icon" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 4v6h-6"></path>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Custom Translation System Prompt Card -->
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-slate-200">Default Translation System Prompt</h3>
                <p class="text-xs text-slate-400">
                  Global instructions instructing the AI how to translate web novel chapters.
                </p>
              </div>
              <button
                type="button"
                id="reset-prompt-btn"
                class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
              >
                Reset to Default
              </button>
            </div>

            <textarea
              id="settings-custom-prompt"
              rows="4"
              class="w-full px-3.5 py-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition leading-relaxed"
              placeholder="Enter custom translation instructions..."
            ></textarea>

            <p class="text-[11px] text-slate-400">
              💡 Tip: Individual novels can override this prompt in their respective Novel Overview page.
            </p>
          </div>

          <!-- DeepSeek Translation Rate Limit & Cooldown Card -->
          <div class="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-semibold text-slate-200">DeepSeek Translation Rate Limit & Cooldown</h3>
                <p class="text-xs text-slate-400">Randomized delay between queued chapters when DeepSeek Translation is enabled to avoid API rate limits.</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input type="checkbox" id="queue-cooldown-toggle" class="sr-only peer" checked />
                <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div id="queue-cooldown-inputs-container" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
              <div class="flex flex-col gap-1.5">
                <label for="queue-cooldown-min" class="text-xs font-semibold text-slate-300">
                  Minimum Wait
                </label>
                <div class="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
                  <input
                    type="number"
                    id="queue-cooldown-min"
                    min="10"
                    max="600"
                    step="5"
                    value="180"
                    class="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
                  />
                  <span class="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (3m)</span>
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="queue-cooldown-max" class="text-xs font-semibold text-slate-300">
                  Maximum Wait
                </label>
                <div class="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
                  <input
                    type="number"
                    id="queue-cooldown-max"
                    min="10"
                    max="1200"
                    step="5"
                    value="300"
                    class="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
                  />
                  <span class="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (5m)</span>
                </div>
              </div>
            </div>

            <!-- Error & Rate-Limit Backoff Inputs -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
              <div class="flex flex-col gap-1.5">
                <label for="queue-error-cooldown" class="text-xs font-semibold text-slate-300">
                  Rate Limit / Failure Backoff Duration
                </label>
                <div class="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/50">
                  <input
                    type="number"
                    id="queue-error-cooldown"
                    min="60"
                    max="86400"
                    step="60"
                    value="4500"
                    class="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
                  />
                  <span id="queue-error-cooldown-unit" class="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (1h 15m)</span>
                </div>
              </div>

              <div class="flex flex-col gap-1.5">
                <label for="queue-max-retries" class="text-xs font-semibold text-slate-300">
                  Max Automatic Retries
                </label>
                <div class="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/50">
                  <input
                    type="number"
                    id="queue-max-retries"
                    min="1"
                    max="10"
                    step="1"
                    value="3"
                    class="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
                  />
                  <span class="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">attempts</span>
                </div>
              </div>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-700/40">
              💡 When enabled with DeepSeek Translation, the queue will wait for a randomized duration between <strong>180s (3m)</strong> and <strong>300s (5m)</strong> after completing each translated chapter. If an API rate limit or error occurs, the failed chapter is placed back at the top of the queue and pauses for <strong>1 hour 15 minutes</strong> before retrying automatically. You can click <strong>Retry Now 🔄</strong> or <strong>Skip ⏩</strong> in the floating Queue Dock at any time.
            </p>
          </div>

          <!-- Pricing & Off-Peak Reference Notice -->
          <div class="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 flex flex-col gap-2">
            <div class="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <span>🕒</span>
              <span>Off-Peak Discount & Token Pricing Notice</span>
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">
              DeepSeek offers an automatic <strong class="text-emerald-400">50% off-peak discount</strong> during Beijing non-business hours (UTC 16:30 – 08:30). QuickConverter automatically factors in off-peak rates and context caching discounts when calculating per-chapter costs.
            </p>
          </div>
`;
