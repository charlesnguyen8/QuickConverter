// QuickConverter - Official DeepSeek Cloud API Service
// Dedicated client for DeepSeek's cloud platform (https://api.deepseek.com),
// managing official chat completions, models discovery, UTC pricing schedules, and account balance.

(function (global) {
  const OFFICIAL_BASE_URL = 'https://api.deepseek.com';
  const DEFAULT_MODEL = 'deepseek-flash';
  const REQUEST_TIMEOUT_MS = 90000; // 90 seconds for official cloud requests

  // In-memory balance cache for debounce (15 seconds)
  let _balanceCache = null;
  const BALANCE_CACHE_TTL_MS = 15000;

  function resolveAIService() {
    if (typeof global !== 'undefined' && global.AIService) return global.AIService;
    if (typeof window !== 'undefined' && window.AIService) return window.AIService;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./ai-service.js'); } catch (e) {}
    }
    return null;
  }

  const DeepSeekService = {
    BASE_URL: OFFICIAL_BASE_URL,
    OFFICIAL_BASE_URL,
    DEFAULT_MODEL,
    REQUEST_TIMEOUT_MS,

    // Backward-compatibility aliases
    PROVIDER_OFFICIAL: 'official',
    PROVIDER_CUSTOM: 'custom',
    PROVIDER_LOCAL_BRIDGE: 'local_bridge',
    CUSTOM_DEFAULT_URL: 'http://127.0.0.1:8000/v1',
    LOCAL_BRIDGE_DEFAULT_URL: 'http://127.0.0.1:8000/v1',

    /**
     * Resolves provider config by delegating to AIService.
     */
    async getProviderConfig() {
      const ai = resolveAIService();
      if (ai && typeof ai.getProviderConfig === 'function') {
        return ai.getProviderConfig();
      }
      return {
        provider: 'official',
        baseUrl: OFFICIAL_BASE_URL,
        customUrl: 'http://127.0.0.1:8000/v1',
        customApiKey: '',
        isOfficial: true,
        isCustom: false,
        isLocal: false,
        isLocalBridge: false
      };
    },

    /**
     * Sets provider config by delegating to AIService.
     */
    async setProviderConfig(cfg) {
      const ai = resolveAIService();
      if (ai && typeof ai.setProviderConfig === 'function') {
        return ai.setProviderConfig(cfg);
      }
      return this.getProviderConfig();
    },

    /**
     * Fetches live account balance from https://api.deepseek.com/user/balance
     * @param {string} apiKey
     * @param {object} [options]
     * @param {boolean} [options.force=false] Bypass cache
     * @returns {Promise<{ isAvailable: boolean, totalBalance: string, grantedBalance: string, toppedUpBalance: string, currency: string, isLow: boolean, formatted: string, compact: string }>}
     */
    async getBalance(apiKey, options = {}) {
      const cleanKey = (apiKey || '').trim();
      if (!cleanKey) {
        throw new Error('API key is required to check balance.');
      }

      const now = Date.now();
      if (!options.force && _balanceCache && _balanceCache.key === cleanKey && (now - _balanceCache.timestamp) < BALANCE_CACHE_TTL_MS) {
        return _balanceCache.data;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const res = await fetch(`${OFFICIAL_BASE_URL}/user/balance`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cleanKey}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('Invalid API key (401 Unauthorized)');
          }
          throw new Error(`Failed to fetch balance (HTTP ${res.status})`);
        }

        const data = await res.json();
        const balanceInfos = data.balance_infos || [];
        const primary = balanceInfos[0] || {};

        const totalNum = parseFloat(primary.total_balance) || 0;
        const grantedNum = parseFloat(primary.granted_balance) || 0;
        const toppedUpNum = parseFloat(primary.topped_up_balance) || 0;
        const currency = primary.currency || 'USD';
        const isAvailable = data.is_available !== false && totalNum > 0;

        const symbol = currency === 'CNY' ? '¥' : '$';
        const formatted = `${symbol}${totalNum.toFixed(4)} ${currency}`;
        const compact = `${symbol}${totalNum.toFixed(2)}`;

        const parsed = {
          isAvailable,
          totalBalance: primary.total_balance || '0.00',
          grantedBalance: primary.granted_balance || '0.00',
          toppedUpBalance: primary.topped_up_balance || '0.00',
          numericBalance: totalNum,
          currency,
          symbol,
          isLow: isAvailable && totalNum < 0.50,
          formatted,
          compact,
          updatedAt: now,
          success: true
        };

        _balanceCache = {
          key: cleanKey,
          timestamp: now,
          data: parsed
        };

        return parsed;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Balance check request timed out.');
        }
        throw err;
      }
    },

    /**
     * Alias for getBalance.
     */
    async fetchBalance(apiKey, options = {}) {
      return this.getBalance(apiKey, options);
    },

    /**
     * Creates a balance tracker instance that automatically updates a UI callback.
     * @param {Function} getKeyFn Function returning active API key
     * @param {Function} updateCallback Callback receiving (balanceInfo, isUpdating)
     * @returns {{ refresh: Function, destroy: Function }}
     */
    createBalanceTracker(getKeyFn, updateCallback) {
      let isChecking = false;

      const refresh = async (force = false) => {
        if (isChecking) return;
        const key = typeof getKeyFn === 'function' ? getKeyFn() : '';
        if (!key || !key.trim()) {
          updateCallback(null, false);
          return;
        }

        isChecking = true;
        updateCallback(null, true);

        try {
          const bal = await this.getBalance(key, { force });
          updateCallback(bal, false);
        } catch (err) {
          updateCallback({ success: false, error: err.message }, false);
        } finally {
          isChecking = false;
        }
      };

      return {
        refresh,
        destroy() {
          isChecking = false;
        }
      };
    },

    /**
     * Test official API Key, check account balance, and retrieve live models roster.
     * @param {string} apiKey 
     * @param {object} [options]
     * @returns {Promise<{ success: boolean, models?: string[], balance?: object, provider: string, baseUrl: string, modelCount?: number, error?: string }>}
     */
    async testConnection(apiKey, options = {}) {
      // If options specify custom provider or custom baseUrl, route to AIService
      if (options.provider === 'custom' || options.provider === 'local_bridge' || (options.baseUrl && options.baseUrl !== OFFICIAL_BASE_URL)) {
        const ai = resolveAIService();
        if (ai && typeof ai.testConnection === 'function') {
          return ai.testConnection(apiKey, options);
        }
      }

      const cleanKey = (apiKey || '').trim();
      if (!cleanKey) {
        return { success: false, error: 'DeepSeek API key is required' };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        // 1. Fetch available models roster
        const modelsRes = await fetch(`${OFFICIAL_BASE_URL}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${cleanKey}`,
            'Accept': 'application/json'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!modelsRes.ok) {
          if (modelsRes.status === 401) {
            return { success: false, error: 'Invalid API Key (401 Unauthorized)' };
          }
          if (modelsRes.status === 402) {
            return { success: false, error: 'Account has insufficient balance / payment required (402)' };
          }
          let errMsg = `HTTP error ${modelsRes.status}`;
          try {
            const errData = await modelsRes.json();
            if (errData && errData.error && errData.error.message) {
              errMsg = errData.error.message;
            }
          } catch (e) {}
          return { success: false, error: errMsg };
        }

        const data = await modelsRes.json();
        const models = (data.data || []).map((m) => m.id);

        // 2. Fetch balance
        let balance = null;
        try {
          balance = await this.getBalance(cleanKey, { force: true });
        } catch (e) {
          console.warn('[DeepSeekService] Balance check failed during test:', e);
        }

        return {
          success: true,
          models,
          balance,
          isCustom: false,
          isLocalBridge: false,
          provider: 'official',
          baseUrl: OFFICIAL_BASE_URL,
          modelCount: models.length
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, error: 'Connection timed out (12s)' };
        }
        return { success: false, error: err.message || 'Failed to connect' };
      }
    },

    /**
     * Translates raw chapter text using official DeepSeek cloud chat completions.
     * @param {object} params
     * @param {string} [params.apiKey]
     * @param {string} params.prompt
     * @param {string} params.rawText
     * @param {string} [params.model='deepseek-flash']
     * @param {number} [params.temperature=0.7]
     * @param {string} [params.provider]
     * @param {string} [params.baseUrl]
     * @returns {Promise<{ translatedText: string, reasoningText?: string, modelUsed: string, usage?: object, costInfo: object, isCustom: boolean, isLocalBridge: boolean }>}
     */
    async translateChapter({ apiKey, prompt, rawText, model = DEFAULT_MODEL, temperature = 0.7, provider, baseUrl }) {
      // If caller requested custom provider or custom baseUrl, route to AIService
      if (provider === 'custom' || provider === 'local_bridge' || (baseUrl && baseUrl !== OFFICIAL_BASE_URL)) {
        const ai = resolveAIService();
        if (ai && typeof ai.translateChapter === 'function') {
          return ai.translateChapter({ apiKey, prompt, rawText, model, temperature, provider, baseUrl });
        }
      }

      let cleanKey = (apiKey || '').trim();
      if (!cleanKey) {
        const stored = await this.getApiKey();
        cleanKey = stored.apiKey;
      }
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

        const res = await fetch(`${OFFICIAL_BASE_URL}/chat/completions`, {
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
            throw new Error('Invalid API key. Please check your key.');
          } else if (res.status === 402) {
            throw new Error('Insufficient account balance. Please top up your credits.');
          } else if (res.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
          }

          let errMsg = `HTTP Error ${res.status}`;
          try {
            const errData = await res.json();
            if (errData && errData.error && errData.error.message) {
              errMsg = errData.error.message;
            }
          } catch (e) {}
          throw new Error(`DeepSeek API error (${res.status}): ${errMsg}`);
        }

        const data = await res.json();
        const choice = data.choices && data.choices[0];
        const content = choice && choice.message && choice.message.content;
        const reasoningContent = choice && choice.message && choice.message.reasoning_content;

        if (!content || !content.trim()) {
          throw new Error('DeepSeek API returned an empty translation response.');
        }

        const costInfo = this.calculateCost(data.usage, activeModel);

        return {
          translatedText: content.trim(),
          reasoningText: reasoningContent ? reasoningContent.trim() : null,
          modelUsed: activeModel,
          usage: data.usage || null,
          costInfo,
          isCustom: false,
          isLocalBridge: false
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

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.session) {
        await new Promise((resolve) => {
          chrome.storage.session.set({ quickconverter_deepseek_key: cleanKey }, () => resolve());
        });
      } else if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('quickconverter_deepseek_key', cleanKey);
      }

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

  // Export to global scope
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
