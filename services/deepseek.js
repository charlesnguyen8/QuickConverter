// QuickConverter - DeepSeek Translation & Model Service
// Integrates DeepSeek's OpenAI-compatible completions, models discovery, and balance health endpoints.

(function (global) {
  const BASE_URL = 'https://api.deepseek.com';
  const DEFAULT_MODEL = 'deepseek-flash';
  const REQUEST_TIMEOUT_MS = 90000; // 90 seconds for large chapters

  // In-memory balance cache for debounce (15 seconds)
  let _balanceCache = null;
  const BALANCE_CACHE_TTL_MS = 15000;

  const DeepSeekService = {
    BASE_URL,
    DEFAULT_MODEL,

    /**
     * Retrieves account balance for the given DeepSeek API key.
     * @param {string} apiKey 
     * @param {object} [options]
     * @param {boolean} [options.force=false] Bypasses short-term cache
     * @returns {Promise<{ success: boolean, totalBalance?: string, numericBalance?: number, currency?: string, currencySymbol?: string, formatted?: string, compact?: string, isAvailable?: boolean, isLow?: boolean, error?: string, fromCache?: boolean }>}
     */
    async getBalance(apiKey, options = {}) {
      const cleanKey = (apiKey || '').trim();
      if (!cleanKey) {
        return { success: false, error: 'API key is required' };
      }

      const force = !!options.force;
      const now = Date.now();

      // Check in-memory cache if not forced
      if (!force && _balanceCache && _balanceCache.key === cleanKey && (now - _balanceCache.timestamp) < BALANCE_CACHE_TTL_MS) {
        return { ..._balanceCache.data, fromCache: true };
      }

      try {
        const res = await fetch(`${BASE_URL}/user/balance`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cleanKey}`,
            'Accept': 'application/json'
          }
        });

        if (!res.ok) {
          if (res.status === 401) {
            return { success: false, error: 'Invalid DeepSeek API Key (401 Unauthorized)' };
          }
          if (res.status === 402) {
            return { success: false, error: 'Insufficient DeepSeek account balance (402)' };
          }
          return { success: false, error: `HTTP error ${res.status}` };
        }

        const data = await res.json();
        let totalStr = '0.00';
        let curr = 'USD';
        let grantedStr = '0.00';
        let toppedUpStr = '0.00';

        if (data && Array.isArray(data.balance_infos) && data.balance_infos.length > 0) {
          // Prefer info with positive balance or take the first
          const b0 = data.balance_infos.find((b) => parseFloat(b.total_balance || '0') > 0) || data.balance_infos[0];
          totalStr = b0.total_balance || b0.granted_balance || '0.00';
          curr = b0.currency || 'USD';
          grantedStr = b0.granted_balance || '0.00';
          toppedUpStr = b0.topped_up_balance || '0.00';
        }

        const numVal = parseFloat(totalStr) || 0;
        const symbol = (curr.toUpperCase() === 'CNY' || curr.toUpperCase() === 'RMB') ? '¥' : '$';
        const isAvailable = data ? data.is_available !== false : true;
        const isLow = numVal < (symbol === '¥' ? 3.5 : 0.50);

        const balanceResult = {
          success: true,
          isAvailable,
          totalBalance: totalStr,
          numericBalance: numVal,
          currency: curr.toUpperCase(),
          currencySymbol: symbol,
          formatted: `${symbol}${numVal.toFixed(2)} ${curr.toUpperCase()}`,
          compact: `${symbol}${numVal.toFixed(2)}`,
          isLow,
          grantedBalance: grantedStr,
          toppedUpBalance: toppedUpStr,
          timestamp: now
        };

        _balanceCache = {
          key: cleanKey,
          data: balanceResult,
          timestamp: now
        };

        // Cache in session storage for instant retrieval across views
        try {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
            chrome.storage.session.set({
              quickconverter_deepseek_balance_cache: {
                data: balanceResult,
                timestamp: now,
                keyLast4: cleanKey.slice(-4)
              }
            });
          }
        } catch (storageErr) {}

        // Emit custom DOM event for active page
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new CustomEvent('deepseek:balance_updated', { detail: balanceResult }));
          } catch (evErr) {}
        }

        return balanceResult;
      } catch (err) {
        return {
          success: false,
          error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Network request failed')
        };
      }
    },

    /**
     * Alias for getBalance for backward compatibility and alternate naming.
     * @param {string} apiKey
     * @param {object} [options]
     */
    async fetchBalance(apiKey, options = {}) {
      return this.getBalance(apiKey, options);
    },

    /**
     * Sets up automatic balance tracking and synchronization for a view.
     * Updates frequently on mount, tab focus, visibility change, and periodic heartbeat.
     * @param {Function} getApiKeyFn Function returning the current API key string (or Promise of it)
     * @param {Function} onBalanceUpdatedFn Callback (balanceInfo, isUpdating) => void
     * @returns {{ refresh: (force?: boolean) => Promise<void>, destroy: () => void }}
     */
    createBalanceTracker(getApiKeyFn, onBalanceUpdatedFn) {
      let isDestroyed = false;
      let intervalId = null;

      const refresh = async (force = true) => {
        if (isDestroyed) return;
        try {
          const keyRaw = typeof getApiKeyFn === 'function' ? await getApiKeyFn() : '';
          const key = (keyRaw || '').trim();
          if (!key) {
            if (typeof onBalanceUpdatedFn === 'function') {
              onBalanceUpdatedFn(null, false);
            }
            return;
          }

          if (typeof onBalanceUpdatedFn === 'function') {
            onBalanceUpdatedFn(null, true); // true indicates updating/loading
          }

          const res = await this.getBalance(key, { force });
          if (!isDestroyed && typeof onBalanceUpdatedFn === 'function') {
            onBalanceUpdatedFn(res, false);
          }
        } catch (e) {
          if (!isDestroyed && typeof onBalanceUpdatedFn === 'function') {
            onBalanceUpdatedFn({ success: false, error: e.message }, false);
          }
        }
      };

      // 1. Initial check (use cache if fresh)
      refresh(false);

      // 2. On window focus / tab re-entry
      const handleFocus = () => {
        refresh(false);
      };
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', handleFocus);
      }

      // 3. On document visibility change
      const handleVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          refresh(false);
        }
      };
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      // 4. Periodic heartbeat (every 60s while tab is visible)
      intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        refresh(false);
      }, 60000);

      // 5. Cross-tab sync via chrome.storage.onChanged
      const handleStorageChange = (changes, areaName) => {
        if (areaName === 'session' && changes.quickconverter_deepseek_balance_cache) {
          const newVal = changes.quickconverter_deepseek_balance_cache.newValue;
          if (newVal && newVal.data && !isDestroyed && typeof onBalanceUpdatedFn === 'function') {
            onBalanceUpdatedFn(newVal.data, false);
          }
        }
      };
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange);
      }

      return {
        refresh,
        destroy() {
          isDestroyed = true;
          if (intervalId) clearInterval(intervalId);
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('focus', handleFocus);
          }
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
          }
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
            chrome.storage.onChanged.removeListener(handleStorageChange);
          }
        }
      };
    },

    /**
     * Test API Key, check account balance, and retrieve live models roster.
     * @param {string} apiKey 
     * @returns {Promise<{ success: boolean, models?: string[], balance?: object, error?: string }>}
     */
    async testConnection(apiKey) {
      const cleanKey = (apiKey || '').trim();
      if (!cleanKey) {
        return { success: false, error: 'API key is required' };
      }

      try {
        const headers = {
          'Authorization': `Bearer ${cleanKey}`,
          'Accept': 'application/json'
        };

        // 1. Fetch available models roster
        const modelsRes = await fetch(`${BASE_URL}/models`, {
          method: 'GET',
          headers
        });

        if (!modelsRes.ok) {
          if (modelsRes.status === 401) {
            return { success: false, error: 'Invalid DeepSeek API Key (401 Unauthorized)' };
          }
          if (modelsRes.status === 402) {
            return { success: false, error: 'DeepSeek account has insufficient balance / payment required (402)' };
          }
          let errMsg = `HTTP error ${modelsRes.status}`;
          if (typeof modelsRes.json === 'function') {
            const errData = await modelsRes.json().catch(() => ({}));
            if (errData && errData.error && errData.error.message) {
              errMsg = errData.error.message;
            }
          }
          return { success: false, error: errMsg };
        }

        const modelsData = await modelsRes.json();
        let modelsList = [];
        if (modelsData && Array.isArray(modelsData.data)) {
          modelsList = modelsData.data.map((m) => m.id);
        }

        // 2. Fetch user balance via getBalance (force refresh)
        let balanceInfo = null;
        try {
          const bRes = await this.getBalance(cleanKey, { force: true });
          if (bRes && bRes.success) {
            balanceInfo = bRes;
          }
        } catch (bErr) {
          console.warn('[DeepSeekService] Balance check non-fatal warning:', bErr);
        }

        return {
          success: true,
          models: modelsList.length > 0 ? modelsList : [DEFAULT_MODEL, 'deepseek-chat'],
          balance: balanceInfo
        };
      } catch (err) {
        return {
          success: false,
          error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Network request failed')
        };
      }
    },

    /**
     * Translates chapter text using DeepSeek completions endpoint.
     * @param {object} params
     * @param {string} params.apiKey
     * @param {string} params.prompt
     * @param {string} params.rawText
     * @param {string} [params.model='deepseek-flash']
     * @param {number} [params.temperature=0.7]
     * @returns {Promise<{ translatedText: string, modelUsed: string, usage?: object }>}
     */
    async translateChapter({ apiKey, prompt, rawText, model = DEFAULT_MODEL, temperature = 0.7 }) {
      const cleanKey = (apiKey || '').trim();
      if (!cleanKey) {
        throw new Error('DeepSeek API Key is missing. Please enter your API key.');
      }
      if (!rawText || !rawText.trim()) {
        throw new Error('Chapter text to translate is empty.');
      }

      const activeModel = (model || '').trim() || DEFAULT_MODEL;
      const systemPrompt = (prompt || '').trim() ||
        'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const payload = {
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawText }
          ],
          stream: false,
          temperature: typeof temperature === 'number' ? temperature : 0.7
        };

        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('Invalid DeepSeek API key. Please check your key.');
          } else if (res.status === 402) {
            throw new Error('Insufficient DeepSeek account balance. Please top up your credits.');
          } else if (res.status === 429) {
            throw new Error('DeepSeek rate limit exceeded. Please wait a moment before trying again.');
          }

          let errMsg = `HTTP Error ${res.status}`;
          if (typeof res.json === 'function') {
            const errData = await res.json().catch(() => ({}));
            if (errData && errData.error && errData.error.message) {
              errMsg = errData.error.message;
            }
          }
          throw new Error(`DeepSeek API error (${res.status}): ${errMsg}`);
        }

        const data = await res.json();
        const choice = data.choices && data.choices[0];
        const content = choice && choice.message && choice.message.content;

        if (!content || !content.trim()) {
          throw new Error('DeepSeek API returned an empty translation response.');
        }

        const costInfo = this.calculateCost(data.usage, activeModel);

        return {
          translatedText: content.trim(),
          modelUsed: activeModel,
          usage: data.usage || null,
          costInfo
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error(`Translation request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
        }
        throw err;
      }
    },

    /**
     * Determines whether a given timestamp falls within DeepSeek's Peak or Off-Peak billing window.
     * Peak: Mon-Fri 01:00-04:00 UTC and 06:00-10:00 UTC.
     * Off-Peak: 50% discount at all other times (weekends 24h, off-peak weekday hours).
     * @param {Date|number} [date=new Date()]
     * @returns {{ isPeak: boolean, multiplier: number, discountPercent: number, label: string, badgeClass: string, windowDesc: string }}
     */
    getPricingStatus(date = new Date()) {
      const d = date instanceof Date ? date : new Date(date);
      const day = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
      const hour = d.getUTCHours();

      const isWeekday = day >= 1 && day <= 5;
      const isPeakHour = (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
      const isPeak = isWeekday && isPeakHour;

      return {
        isPeak,
        multiplier: isPeak ? 1.0 : 0.5,
        discountPercent: isPeak ? 0 : 50,
        label: isPeak ? 'Peak Hours' : 'Off-Peak (50% Off)',
        badgeClass: isPeak ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
        windowDesc: isPeak
          ? 'Peak billing window (UTC 01:00-04:00, 06:00-10:00 Mon-Fri)'
          : 'Off-Peak discount active (50% off standard rates)'
      };
    },

    /**
     * Calculates the exact request cost in USD based on token usage, model, and Peak/Off-Peak schedule.
     * Accounts for prompt tokens (system prompt instructions + raw chapter source), completion tokens,
     * and context cache hits/misses.
     * @param {object} usage DeepSeek API usage object
     * @param {string} [model='deepseek-flash']
     * @param {Date|number} [date=new Date()]
     * @returns {object|null} Cost breakdown
     */
    calculateCost(usage, model = DEFAULT_MODEL, date = new Date()) {
      if (!usage) {
        return null;
      }

      const pricing = this.getPricingStatus(date);
      const activeModel = model === 'deepseek-chat' ? 'deepseek-chat' : 'deepseek-flash';

      // Base peak rates per 1 token (USD)
      const baseRates = {
        'deepseek-flash': {
          hit: 0.006 / 1000000,
          miss: 0.30 / 1000000,
          out: 1.20 / 1000000
        },
        'deepseek-chat': {
          hit: 0.028 / 1000000,
          miss: 0.27 / 1000000,
          out: 0.55 / 1000000
        }
      }[activeModel];

      const cacheHitTokens = Number(usage.prompt_cache_hit_tokens) || 0;
      let cacheMissTokens = Number(usage.prompt_cache_miss_tokens);
      if (isNaN(cacheMissTokens)) {
        cacheMissTokens = Math.max(0, (Number(usage.prompt_tokens) || 0) - cacheHitTokens);
      }
      const promptTokens = Number(usage.prompt_tokens) || (cacheHitTokens + cacheMissTokens);
      const completionTokens = Number(usage.completion_tokens) || 0;
      const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);

      const hitCost = cacheHitTokens * baseRates.hit * pricing.multiplier;
      const missCost = cacheMissTokens * baseRates.miss * pricing.multiplier;
      const outCost = completionTokens * baseRates.out * pricing.multiplier;
      const totalCostUSD = hitCost + missCost + outCost;

      let formattedCost = `$${totalCostUSD.toFixed(4)}`;
      if (totalCostUSD < 0.0001 && totalCostUSD > 0) {
        formattedCost = `<$0.0001`;
      }

      return {
        costUSD: totalCostUSD,
        formattedCost,
        modelUsed: activeModel,
        isPeak: pricing.isPeak,
        ratePeriod: pricing.label,
        discountPercent: pricing.discountPercent,
        promptTokens,
        completionTokens,
        totalTokens,
        cacheHitTokens,
        cacheMissTokens,
        calculatedAt: date instanceof Date ? date.getTime() : new Date(date).getTime()
      };
    },

    /**
     * Retrieves the API key and remember-preference from chrome.storage.session
     * or chrome.storage.local (with fallback to window.sessionStorage/localStorage).
     * @returns {Promise<{ apiKey: string, remembered: boolean }>}
     */
    async getApiKey() {
      // 1. Try chrome.storage.session (RAM only, active browser session)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        try {
          const res = await new Promise((resolve) => {
            chrome.storage.session.get(['quickconverter_deepseek_key'], (r) => resolve(r || {}));
          });
          if (res && res.quickconverter_deepseek_key) {
            const localRes = await new Promise((resolve) => {
              chrome.storage.local.get(['quickconverter_deepseek_remember'], (r) => resolve(r || {}));
            });
            return {
              apiKey: res.quickconverter_deepseek_key,
              remembered: !!(localRes && localRes.quickconverter_deepseek_remember)
            };
          }
        } catch (e) {
          console.warn('[DeepSeekService] error reading chrome.storage.session:', e);
        }
      }

      // 2. Try chrome.storage.local if remembered on device
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const localRes = await new Promise((resolve) => {
            chrome.storage.local.get(['quickconverter_deepseek_key', 'quickconverter_deepseek_remember'], (r) => resolve(r || {}));
          });
          if (localRes && localRes.quickconverter_deepseek_remember && localRes.quickconverter_deepseek_key) {
            if (chrome.storage.session) {
              chrome.storage.session.set({ quickconverter_deepseek_key: localRes.quickconverter_deepseek_key });
            }
            return {
              apiKey: localRes.quickconverter_deepseek_key,
              remembered: true
            };
          }
        } catch (e) {
          console.warn('[DeepSeekService] error reading chrome.storage.local:', e);
        }
      }

      // 3. Fallback for non-extension / web / test contexts
      if (typeof sessionStorage !== 'undefined') {
        const sessionKey = sessionStorage.getItem('quickconverter_deepseek_key');
        if (sessionKey) {
          const isRem = typeof localStorage !== 'undefined' && localStorage.getItem('quickconverter_deepseek_remember') === 'true';
          return { apiKey: sessionKey, remembered: isRem };
        }
      }
      if (typeof localStorage !== 'undefined') {
        const isRem = localStorage.getItem('quickconverter_deepseek_remember') === 'true';
        const localKey = localStorage.getItem('quickconverter_deepseek_key');
        if (isRem && localKey) {
          return { apiKey: localKey, remembered: true };
        }
      }

      return { apiKey: '', remembered: false };
    },

    /**
     * Sets the API key in session memory, and optionally in persistent local storage.
     * @param {string} apiKey
     * @param {boolean} rememberOnDevice
     */
    async setApiKey(apiKey, rememberOnDevice = false) {
      const cleanKey = (apiKey || '').trim();

      if (!cleanKey) {
        return this.clearApiKey();
      }

      // Store in session storage (RAM only)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        await new Promise((resolve) => {
          chrome.storage.session.set({ quickconverter_deepseek_key: cleanKey }, () => resolve());
        });
      } else if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('quickconverter_deepseek_key', cleanKey);
      }

      // Handle remember on device
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (rememberOnDevice) {
          await new Promise((resolve) => {
            chrome.storage.local.set({
              quickconverter_deepseek_key: cleanKey,
              quickconverter_deepseek_remember: true
            }, () => resolve());
          });
        } else {
          await new Promise((resolve) => {
            chrome.storage.local.remove(['quickconverter_deepseek_key', 'quickconverter_deepseek_remember'], () => resolve());
          });
        }
      } else if (typeof localStorage !== 'undefined') {
        if (rememberOnDevice) {
          localStorage.setItem('quickconverter_deepseek_key', cleanKey);
          localStorage.setItem('quickconverter_deepseek_remember', 'true');
        } else {
          localStorage.removeItem('quickconverter_deepseek_key');
          localStorage.removeItem('quickconverter_deepseek_remember');
        }
      }
    },

    /**
     * Clears the API key completely from session and local storage.
     */
    async clearApiKey() {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (chrome.storage.session) {
          await new Promise((resolve) => chrome.storage.session.remove(['quickconverter_deepseek_key', 'quickconverter_deepseek_balance_cache'], () => resolve()));
        }
        if (chrome.storage.local) {
          await new Promise((resolve) => chrome.storage.local.remove(['quickconverter_deepseek_key', 'quickconverter_deepseek_remember'], () => resolve()));
        }
      }
      _balanceCache = null;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('quickconverter_deepseek_key');
      }
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('quickconverter_deepseek_key');
        localStorage.removeItem('quickconverter_deepseek_remember');
      }
    }
  };

  // Export to global scope (Browser Window or Service Worker)
  if (typeof window !== 'undefined') {
    window.DeepSeekService = DeepSeekService;
  }
  if (typeof self !== 'undefined') {
    self.DeepSeekService = DeepSeekService;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeepSeekService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
