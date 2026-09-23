// QuickConverter - Custom API & Local Web Bridge Service
// Dedicated service for custom OpenAI-compatible endpoints (Local Web Bridge, Ollama, LM Studio, vLLM).

(function (global) {
  const DEFAULT_BASE_URL = 'http://127.0.0.1:8000/v1';
  const DEFAULT_KEY = 'sk-local';
  const TIMEOUT_MS = 180000; // 180s fallback timeout
  const INACTIVITY_TIMEOUT_MS = 60000; // 60s idle reset on streaming
  const MAX_REQUEST_TIMEOUT_MS = 300000; // 300s (5m) hard ceiling for giant chapters
  const DEFAULT_MODEL = 'deepseek-chat';

  const CustomApiService = {
    DEFAULT_BASE_URL,
    DEFAULT_KEY,
    TIMEOUT_MS,
    INACTIVITY_TIMEOUT_MS,
    MAX_REQUEST_TIMEOUT_MS,
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
     * Parses an SSE stream from a fetch Response, accumulating content, reasoning, and usage.
     * Compatible with browser ReadableStream, Node.js streams, and non-streaming JSON fallback.
     * @param {Response} res
     * @param {object} [options]
     * @param {function} [options.onChunk]
     * @param {function} [options.onActivity]
     * @returns {Promise<{ content: string, reasoning: string, usage: object|null }>}
     */
    async _readSseStream(res, { onChunk, onActivity } = {}) {
      const contentType = (res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : '') || '';

      // Fallback: If server returned standard JSON payload instead of an event stream
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (typeof onActivity === 'function') onActivity();
        const choice = data.choices && data.choices[0];
        const content = (choice && choice.message && choice.message.content) || '';
        const reasoningRaw = (choice && choice.message && choice.message.reasoning_content) || '';
        const reasoningCharCount = reasoningRaw.length;
        if (content && typeof onChunk === 'function') {
          onChunk({ type: 'content', delta: content, fullText: content });
        }
        return { content, reasoning: null, reasoningCharCount, usage: data.usage || null };
      }

      let content = '';
      let reasoning = null;
      let reasoningCharCount = 0;
      let usage = null;

      const processLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) return;
        if (trimmed === 'data: [DONE]') return;
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.replace(/^data:\s*/, '');
          try {
            const data = JSON.parse(jsonStr);
            const delta = data.choices && data.choices[0] && data.choices[0].delta;
            if (delta) {
              if (delta.content) {
                content += delta.content;
                if (typeof onChunk === 'function') {
                  onChunk({ type: 'content', delta: delta.content, fullText: content });
                }
              }
              if (delta.reasoning_content) {
                // Count characters for token calculation, but discard reasoning text
                reasoningCharCount += delta.reasoning_content.length;
                if (typeof onChunk === 'function') {
                  onChunk({ type: 'reasoning', delta: delta.reasoning_content });
                }
              }
            }
            if (data.usage) {
              usage = data.usage;
            }
          } catch (e) {
            // Incomplete or non-JSON chunk, ignore
          }
        }
      };

      if (res.body && typeof res.body.getReader === 'function') {
        const reader = res.body.getReader();
        const decoder = new (typeof TextDecoder !== 'undefined' ? TextDecoder : require('util').TextDecoder)('utf-8');
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (typeof onActivity === 'function') onActivity();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              processLine(line);
            }
          }

          if (buffer.trim()) {
            processLine(buffer);
          }
        } finally {
          if (reader && typeof reader.releaseLock === 'function') {
            reader.releaseLock();
          }
        }
      } else if (res.body && typeof res.body[Symbol.asyncIterator] === 'function') {
        const decoder = new (typeof TextDecoder !== 'undefined' ? TextDecoder : require('util').TextDecoder)('utf-8');
        let buffer = '';

        for await (const chunk of res.body) {
          if (typeof onActivity === 'function') onActivity();
          const str = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
          buffer += str;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            processLine(line);
          }
        }

        if (buffer.trim()) {
          processLine(buffer);
        }
      } else {
        const text = await res.text();
        if (typeof onActivity === 'function') onActivity();
        const lines = text.split('\n');
        for (const line of lines) {
          processLine(line);
        }
      }

      return { content, reasoning: null, reasoningCharCount, usage };
    },

    /**
     * Translates raw chapter text using an OpenAI-compatible /v1/chat/completions endpoint.
     * Supports streaming (stream: true) and DeepSeek-R1 / DeepThink chain-of-thought reasoning extraction.
     * @param {object} params
     * @param {string} [params.baseUrl]
     * @param {string} [params.apiKey]
     * @param {string} params.prompt
     * @param {string} params.rawText
     * @param {string} [params.model='deepseek-chat']
     * @param {number} [params.temperature=0.7]
     * @param {boolean} [params.stream=true]
     * @param {function} [params.onChunk] Callback receiving streaming deltas
     * @returns {Promise<{ translatedText: string, reasoningText?: string, modelUsed: string, usage?: object, costInfo: object, isCustom: boolean, isLocalBridge: boolean }>}
     */
    async translateChapter({ baseUrl, apiKey, prompt, rawText, model = DEFAULT_MODEL, temperature = 0.7, stream = true, onChunk, signal }) {
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
      if (signal) {
        if (signal.aborted) throw new Error('Translation cancelled by user.');
        signal.addEventListener('abort', () => controller.abort(new Error('UserCancelled')));
      }
      let inactivityTimer = null;
      let maxTimer = null;

      const resetInactivity = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          controller.abort(new Error('InactivityTimeout'));
        }, INACTIVITY_TIMEOUT_MS);
      };

      try {
        resetInactivity();
        maxTimer = setTimeout(() => {
          controller.abort(new Error('MaxDurationTimeout'));
        }, MAX_REQUEST_TIMEOUT_MS);

        const payload = {
          model: activeModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawText }
          ],
          stream: stream !== false,
          temperature: typeof temperature === 'number' ? temperature : 0.7
        };

        const res = await fetch(`${effectiveBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cleanKey}`,
            'Accept': 'text/event-stream, application/json'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        if (!res.ok) {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          if (maxTimer) clearTimeout(maxTimer);

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

        const { content, reasoning, reasoningCharCount, usage } = await this._readSseStream(res, {
          onChunk,
          onActivity: resetInactivity
        });

        if (!content || !content.trim()) {
          throw new Error('Custom API returned an empty translation response.');
        }

        const promptTokens = usage?.prompt_tokens || Math.max(1, Math.round((systemPrompt.length + rawText.length) / 3.5));
        const completionTokens = usage?.completion_tokens || Math.max(1, Math.round((content.length + (reasoningCharCount || 0)) / 3.5));
        const totalTokens = usage?.total_tokens || (promptTokens + completionTokens);

        const synthesizedUsage = usage || {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens
        };

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
          reasoningText: null, // Discarded: deepthink reasoning process is not saved
          modelUsed: activeModel,
          usage: synthesizedUsage,
          costInfo,
          isCustom: true,
          isLocalBridge: isLocal
        };
      } catch (err) {
        if (signal?.aborted || err.message === 'UserCancelled' || controller.signal.reason?.message === 'UserCancelled') {
          throw new Error('Translation cancelled by user.');
        }
        if (err.name === 'AbortError' || err.message === 'InactivityTimeout' || err.message === 'MaxDurationTimeout') {
          if (controller.signal.reason?.message === 'InactivityTimeout' || err.message === 'InactivityTimeout') {
            throw new Error(`Custom API translation timed out: no data received for ${INACTIVITY_TIMEOUT_MS / 1000} seconds.`);
          }
          if (controller.signal.reason?.message === 'MaxDurationTimeout' || err.message === 'MaxDurationTimeout') {
            throw new Error(`Custom API translation exceeded maximum limit of ${MAX_REQUEST_TIMEOUT_MS / 1000} seconds.`);
          }
          throw new Error(`Custom API translation request timed out after ${TIMEOUT_MS / 1000} seconds.`);
        }
        throw err;
      } finally {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        if (maxTimer) clearTimeout(maxTimer);
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
