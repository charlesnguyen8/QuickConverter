// QuickConverter - AI Provider Coordinator & Dispatcher
// Manages switching between Official DeepSeek API and Custom API / Local Bridge,
// dispatching translation and test requests to the appropriate client service.

(function (global) {
  const PROVIDER_OFFICIAL = 'official';
  const PROVIDER_CUSTOM = 'custom';
  const PROVIDER_LOCAL_BRIDGE = 'local_bridge'; // backward-compatible alias

  const OFFICIAL_BASE_URL = 'https://api.deepseek.com';
  const CUSTOM_DEFAULT_URL = 'http://127.0.0.1:8000/v1';

  function resolveDeepSeek() {
    if (typeof global !== 'undefined' && global.DeepSeekService) return global.DeepSeekService;
    if (typeof window !== 'undefined' && window.DeepSeekService) return window.DeepSeekService;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./deepseek.js'); } catch (e) {}
    }
    return null;
  }

  function resolveCustomApi() {
    if (typeof global !== 'undefined' && global.CustomApiService) return global.CustomApiService;
    if (typeof window !== 'undefined' && window.CustomApiService) return window.CustomApiService;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./custom-api.js'); } catch (e) {}
    }
    return null;
  }

  const AIService = {
    PROVIDER_OFFICIAL,
    PROVIDER_CUSTOM,
    PROVIDER_LOCAL_BRIDGE,
    OFFICIAL_BASE_URL,
    CUSTOM_DEFAULT_URL,

    /**
     * Resolves currently active AI provider and endpoint configuration.
     * @returns {Promise<{ provider: string, baseUrl: string, customUrl: string, customApiKey: string, isOfficial: boolean, isCustom: boolean, isLocal: boolean, isLocalBridge: boolean }>}
     */
    async getProviderConfig() {
      let provider = PROVIDER_OFFICIAL;
      const customClient = resolveCustomApi();
      const customCfg = customClient ? await customClient.getConfig() : { customUrl: CUSTOM_DEFAULT_URL, customApiKey: '', isLocal: true };

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          const r = await new Promise((resolve) => {
            chrome.storage.local.get(['quickconverter_ai_provider'], (res) => resolve(res || {}));
          });
          if (r.quickconverter_ai_provider) provider = r.quickconverter_ai_provider;
        } catch (e) {}
      }

      if (typeof localStorage !== 'undefined') {
        const storedProv = localStorage.getItem('quickconverter_ai_provider');
        if (storedProv) provider = storedProv;
      }

      const isOfficial = provider === PROVIDER_OFFICIAL;
      const isCustom = !isOfficial;
      const baseUrl = isOfficial ? OFFICIAL_BASE_URL : customCfg.customUrl;
      const isLocal = customCfg.isLocal;

      return {
        provider: isOfficial ? PROVIDER_OFFICIAL : PROVIDER_CUSTOM,
        baseUrl: baseUrl.replace(/\/+$/, ''),
        customUrl: customCfg.customUrl,
        customApiKey: customCfg.customApiKey,
        isOfficial,
        isCustom,
        isLocal,
        isLocalBridge: isLocal
      };
    },

    /**
     * Sets and persists the active AI provider and endpoint configuration.
     * @param {object} config
     * @param {string} [config.provider]
     * @param {string} [config.baseUrl]
     * @param {string} [config.customUrl]
     * @param {string} [config.customApiKey]
     * @param {string} [config.bridgeUrl]
     */
    async setProviderConfig({ provider, baseUrl, customUrl, customApiKey, bridgeUrl }) {
      const updates = {};
      let cleanProvider = provider;

      if (cleanProvider) {
        if (cleanProvider === PROVIDER_LOCAL_BRIDGE) cleanProvider = PROVIDER_CUSTOM;
        updates.quickconverter_ai_provider = cleanProvider;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('quickconverter_ai_provider', cleanProvider);
        }
      }

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && Object.keys(updates).length > 0) {
        await new Promise((resolve) => chrome.storage.local.set(updates, () => resolve()));
      }

      const customClient = resolveCustomApi();
      if (customClient && (customUrl !== undefined || baseUrl !== undefined || customApiKey !== undefined || bridgeUrl !== undefined)) {
        await customClient.setConfig({
          customUrl: customUrl || baseUrl || bridgeUrl,
          customApiKey
        });
      }

      return this.getProviderConfig();
    },

    /**
     * Test connection to the requested or active AI provider.
     * @param {string} [apiKey]
     * @param {object} [options]
     * @param {string} [options.provider]
     * @param {string} [options.baseUrl]
     * @returns {Promise<{ success: boolean, models?: string[], modelCount?: number, balance?: object, isCustom?: boolean, isLocal?: boolean, isLocalBridge?: boolean, provider?: string, baseUrl?: string, error?: string }>}
     */
    async testConnection(apiKey, options = {}) {
      const provCfg = await this.getProviderConfig();
      const targetProvider = options.provider || provCfg.provider;
      const isCustom = targetProvider === PROVIDER_CUSTOM || targetProvider === PROVIDER_LOCAL_BRIDGE || (options.baseUrl && options.baseUrl !== OFFICIAL_BASE_URL);

      if (isCustom) {
        const customClient = resolveCustomApi();
        if (!customClient) {
          return { success: false, error: 'Custom API client is not loaded' };
        }
        const res = await customClient.testConnection(apiKey, {
          baseUrl: options.baseUrl || provCfg.customUrl
        });
        return {
          ...res,
          provider: PROVIDER_CUSTOM
        };
      }

      const deepseekClient = resolveDeepSeek();
      if (!deepseekClient) {
        return { success: false, error: 'DeepSeek service is not loaded' };
      }
      return deepseekClient.testConnection(apiKey);
    },

    /**
     * Unified translation dispatcher.
     * Routes request to CustomApiService or DeepSeekService based on provider/options.
     * @param {object} params
     * @param {string} [params.apiKey]
     * @param {string} params.prompt
     * @param {string} params.rawText
     * @param {string} [params.model]
     * @param {number} [params.temperature]
     * @param {string} [params.provider]
     * @param {string} [params.baseUrl]
     * @returns {Promise<{ translatedText: string, reasoningText?: string, modelUsed: string, usage?: object, costInfo: object, isCustom: boolean, isLocalBridge: boolean }>}
     */
    async translateChapter(params) {
      const provCfg = await this.getProviderConfig();
      const activeProvider = params.provider || provCfg.provider;
      const isCustom = activeProvider === PROVIDER_CUSTOM || activeProvider === PROVIDER_LOCAL_BRIDGE || (params.baseUrl && params.baseUrl !== OFFICIAL_BASE_URL);

      if (isCustom) {
        const customClient = resolveCustomApi();
        if (!customClient) {
          throw new Error('Custom API service is not loaded.');
        }
        return customClient.translateChapter({
          baseUrl: params.baseUrl || provCfg.customUrl,
          apiKey: params.apiKey || provCfg.customApiKey,
          prompt: params.prompt,
          rawText: params.rawText,
          model: params.model || 'deepseek-chat',
          temperature: params.temperature,
          stream: params.stream !== undefined ? params.stream : true,
          onChunk: params.onChunk,
          signal: params.signal
        });
      }

      const deepseekClient = resolveDeepSeek();
      if (!deepseekClient) {
        throw new Error('Official DeepSeek service is not loaded.');
      }
      return deepseekClient.translateChapter(params);
    }
  };

  // Wire backward compatibility on DeepSeekService if present
  function wireBackwardCompatibility() {
    const ds = resolveDeepSeek();
    if (ds) {
      if (!ds.getProviderConfig) {
        ds.getProviderConfig = () => AIService.getProviderConfig();
      }
      if (!ds.setProviderConfig) {
        ds.setProviderConfig = (cfg) => AIService.setProviderConfig(cfg);
      }
      ds.PROVIDER_OFFICIAL = PROVIDER_OFFICIAL;
      ds.PROVIDER_CUSTOM = PROVIDER_CUSTOM;
      ds.PROVIDER_LOCAL_BRIDGE = PROVIDER_LOCAL_BRIDGE;
      ds.CUSTOM_DEFAULT_URL = CUSTOM_DEFAULT_URL;
      ds.LOCAL_BRIDGE_DEFAULT_URL = CUSTOM_DEFAULT_URL;
    }
  }

  wireBackwardCompatibility();
  if (typeof setTimeout !== 'undefined') {
    setTimeout(wireBackwardCompatibility, 0);
  }

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.AIService = AIService;
  }
  if (typeof self !== 'undefined') {
    self.AIService = AIService;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
