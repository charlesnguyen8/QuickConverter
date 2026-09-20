// QuickConverter - DeepSeek Translation & Model Service
// Integrates DeepSeek's OpenAI-compatible completions, models discovery, and balance health endpoints.

(function (global) {
  const BASE_URL = 'https://api.deepseek.com';
  const DEFAULT_MODEL = 'deepseek-flash';
  const REQUEST_TIMEOUT_MS = 90000; // 90 seconds for large chapters

  const DeepSeekService = {
    BASE_URL,
    DEFAULT_MODEL,

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

        // 2. Fetch user balance and availability
        let balanceInfo = null;
        try {
          const balanceRes = await fetch(`${BASE_URL}/user/balance`, {
            method: 'GET',
            headers
          });

          if (balanceRes.ok) {
            const bData = await balanceRes.json();
            if (bData) {
              let totalStr = 'Available';
              let curr = 'USD';
              if (Array.isArray(bData.balance_infos) && bData.balance_infos.length > 0) {
                const b0 = bData.balance_infos[0];
                totalStr = b0.total_balance || b0.granted_balance || '0.00';
                curr = b0.currency || 'USD';
              }
              balanceInfo = {
                isAvailable: bData.is_available !== false,
                totalBalance: totalStr,
                currency: curr
              };
            }
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

        return {
          translatedText: content.trim(),
          modelUsed: activeModel,
          usage: data.usage || null
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
          await new Promise((resolve) => chrome.storage.session.remove(['quickconverter_deepseek_key'], () => resolve()));
        }
        if (chrome.storage.local) {
          await new Promise((resolve) => chrome.storage.local.remove(['quickconverter_deepseek_key', 'quickconverter_deepseek_remember'], () => resolve()));
        }
      }
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
