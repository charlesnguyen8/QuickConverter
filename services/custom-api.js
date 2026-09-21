// QuickConverter - Custom API & Local Web Bridge Service
// Dedicated service for custom OpenAI-compatible endpoints (Local Web Bridge, Ollama, LM Studio, vLLM).

(function (global) {
  const DEFAULT_BASE_URL = 'http://127.0.0.1:8000/v1';
  const DEFAULT_KEY = 'sk-local';
  const TIMEOUT_MS = 180000; // 180s for local bridge reasoning & human cooldown
  const DEFAULT_MODEL = 'deepseek-chat';

  const CustomApiService = {
    DEFAULT_BASE_URL,
    DEFAULT_KEY,
    TIMEOUT_MS,
    DEFAULT_MODEL,

    /**
     * Checks if a base URL points to a local loopback server.
     * @param {string} url
     * @returns {boolean}
     */
    isLocalUrl(url) {
      if (!url) return true;
      const lower = url.toLowerCase();
      return lower.includes('127.0.0.1') || lower.includes('localhost') || lower.includes('0.0.0.0');
    },

    /**
     * Retrieves stored Custom API configuration.
     * @returns {Promise<{ customUrl: string, customApiKey: string, isLocal: boolean }>}
     */
    async getConfig() {
      let customUrl = DEFAULT_BASE_URL;
      let customApiKey = '';

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const r = await new Promise((resolve) => {
            chrome.storage.local.get(
              ['quickconverter_ai_custom_url', 'quickconverter_ai_bridge_url', 'quickconverter_custom_api_key'],
              (res) => resolve(res || {})
            );
          });
          if (r.quickconverter_ai_custom_url) customUrl = r.quickconverter_ai_custom_url;
          else if (r.quickconverter_ai_bridge_url) customUrl = r.quickconverter_ai_bridge_url;
          if (r.quickconverter_custom_api_key) customApiKey = r.quickconverter_custom_api_key;
        } catch (e) {}
      }

      if (typeof localStorage !== 'undefined') {
        const storedCustom = localStorage.getItem('quickconverter_ai_custom_url') || localStorage.getItem('quickconverter_ai_bridge_url');
        if (storedCustom) customUrl = storedCustom;
        const storedKey = localStorage.getItem('quickconverter_custom_api_key');
        if (storedKey) customApiKey = storedKey;
      }

      const cleanUrl = (customUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
      return {
        customUrl: cleanUrl,
        customApiKey: customApiKey || '',
        isLocal: this.isLocalUrl(cleanUrl)
      };
    },

    /**
     * Persists Custom API configuration.
     * @param {object} config
     * @param {string} [config.customUrl]
     * @param {string} [config.customApiKey]
     * @param {string} [config.baseUrl]
     */
    async setConfig({ customUrl, customApiKey, baseUrl }) {
      const targetUrl = (customUrl || baseUrl !== undefined ? (customUrl || baseUrl) : undefined);
      const updates = {};

      if (targetUrl !== undefined) {
        const cleanUrl = String(targetUrl).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
        updates.quickconverter_ai_custom_url = cleanUrl;
        updates.quickconverter_ai_bridge_url = cleanUrl;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('quickconverter_ai_custom_url', cleanUrl);
          localStorage.setItem('quickconverter_ai_bridge_url', cleanUrl);
        }
      }

      if (customApiKey !== undefined) {
        const cleanKey = String(customApiKey).trim();
        updates.quickconverter_custom_api_key = cleanKey;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('quickconverter_custom_api_key', cleanKey);
        }
      }

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && Object.keys(updates).length > 0) {
        await new Promise((resolve) => chrome.storage.local.set(updates, () => resolve()));
      }

      return this.getConfig();
    },

    /**
     * Test connection to the Custom API / Local Bridge endpoint by fetching /models.
     * @param {string|object} [keyOrOptions] API key string or options object
     * @param {object} [options]
     * @param {string} [options.baseUrl] Target base URL override
     * @param {string} [options.apiKey] API key override
     * @returns {Promise<{ success: boolean, models?: string[], modelCount?: number, baseUrl?: string, isLocal?: boolean, isLocalBridge?: boolean, error?: string }>}
     */
    async testConnection(keyOrOptions, options = {}) {
      let key = '';
      let targetUrl = '';

      if (typeof keyOrOptions === 'string') {
        key = keyOrOptions;
        targetUrl = options.baseUrl;
      } else if (keyOrOptions && typeof keyOrOptions === 'object') {
        key = keyOrOptions.apiKey || keyOrOptions.key || '';
        targetUrl = keyOrOptions.baseUrl || keyOrOptions.targetUrl || '';
      }

      if (!targetUrl && options.baseUrl) {
        targetUrl = options.baseUrl;
      }

      const cfg = await this.getConfig();
      const effectiveBaseUrl = (targetUrl || cfg.customUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
      const isLocal = this.isLocalUrl(effectiveBaseUrl);
      const cleanKey = (key || cfg.customApiKey || (isLocal ? DEFAULT_KEY : '')).trim();

      try {
        const headers = {
          'Authorization': `Bearer ${cleanKey || DEFAULT_KEY}`,
          'Accept': 'application/json'
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const modelsRes = await fetch(`${effectiveBaseUrl}/models`, {
          method: 'GET',
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!modelsRes.ok) {
          if (modelsRes.status === 401) {
            return { success: false, error: 'Unauthorized (401). Please check custom API key.' };
          }
          if (modelsRes.status === 502) {
            return { success: false, error: 'Local Bridge: Automation browser is disconnected (502).' };
          }
          if (modelsRes.status === 503) {
            return { success: false, error: 'Local Bridge: Cloudflare challenge required in browser (503).' };
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

        return {
          success: true,
          models,
          modelCount: models.length,
          baseUrl: effectiveBaseUrl,
          isLocal,
          isLocalBridge: isLocal,
          provider: 'custom'
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: false, error: 'Connection timed out (12s).' };
        }
        return { success: false, error: err.message || 'Failed to connect to custom endpoint.' };
      }
    },

    /**
     * Translates raw chapter text using an OpenAI-compatible /v1/chat/completions endpoint.
     * Supports DeepSeek-R1 / DeepThink chain-of-thought reasoning extraction.
     * @param {object} params
     * @param {string} [params.baseUrl]
     * @param {string} [params.apiKey]
     * @param {string} params.prompt
     * @param {string} params.rawText
     * @param {string} [params.model='deepseek-chat']
     * @param {number} [params.temperature=0.7]
     * @returns {Promise<{ translatedText: string, reasoningText?: string, modelUsed: string, usage?: object, costInfo: object, isCustom: boolean, isLocalBridge: boolean }>}
     */
    async translateChapter({ baseUrl, apiKey, prompt, rawText, model = DEFAULT_MODEL, temperature = 0.7 }) {
      if (!rawText || !rawText.trim()) {
        throw new Error('Chapter text to translate is empty.');
      }

      const cfg = await this.getConfig();
      const effectiveBaseUrl = (baseUrl || cfg.customUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
      const isLocal = this.isLocalUrl(effectiveBaseUrl);
      const cleanKey = (apiKey || cfg.customApiKey || (isLocal ? DEFAULT_KEY : '')).trim() || DEFAULT_KEY;

      const activeModel = (model || '').trim() || DEFAULT_MODEL;
      const systemPrompt = (prompt || '').trim() ||
        'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

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

        const res = await fetch(`${effectiveBaseUrl}/chat/completions`, {
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
            throw new Error('Custom API: Invalid or unauthorized key (401).');
          } else if (res.status === 502) {
            throw new Error('Local Bridge: Automation browser is disconnected (502). Run start_chromium.bat.');
          } else if (res.status === 503) {
            throw new Error('Local Bridge: Cloudflare challenge required in browser (503).');
          } else if (res.status === 504) {
            throw new Error('Custom API: Request timed out at gateway (504).');
          }

          let errMsg = `HTTP Error ${res.status}`;
          try {
            const errData = await res.json();
            if (errData && errData.error && errData.error.message) {
              errMsg = errData.error.message;
            }
          } catch (e) {}
          throw new Error(`Custom API error (${res.status}): ${errMsg}`);
        }

        const data = await res.json();
        const choice = data.choices && data.choices[0];
        const content = choice && choice.message && choice.message.content;
        const reasoningContent = choice && choice.message && choice.message.reasoning_content;

        if (!content || !content.trim()) {
          throw new Error('Custom API returned an empty translation response.');
        }

        const promptTokens = data.usage?.prompt_tokens || 0;
        const completionTokens = data.usage?.completion_tokens || 0;
        const totalTokens = data.usage?.total_tokens || (promptTokens + completionTokens);

        const costInfo = {
          costUSD: 0,
          formattedCost: isLocal ? 'Free (Local Bridge)' : 'Custom API',
          modelUsed: activeModel,
          isPeak: false,
          ratePeriod: isLocal ? 'Local Bridge (Free)' : 'Custom Endpoint',
          discountPercent: 100,
          promptTokens,
          completionTokens,
          totalTokens,
          isCustom: true,
          isLocalBridge: isLocal,
          calculatedAt: Date.now()
        };

        return {
          translatedText: content.trim(),
          reasoningText: reasoningContent ? reasoningContent.trim() : null,
          modelUsed: activeModel,
          usage: data.usage || null,
          costInfo,
          isCustom: true,
          isLocalBridge: isLocal
        };
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error(`Custom API translation request timed out after ${TIMEOUT_MS / 1000} seconds.`);
        }
        throw err;
      }
    }
  };

  // Export to global scope (Browser Window or Service Worker)
  if (typeof window !== 'undefined') {
    window.CustomApiService = CustomApiService;
  }
  if (typeof self !== 'undefined') {
    self.CustomApiService = CustomApiService;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CustomApiService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
