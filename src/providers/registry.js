// QuickConverter - Provider Registry
// Manages novel website adapters and resolves the correct provider for any given URL or domain.

const ProviderRegistry = (() => {
  const providers = [];

  function registerProvider(provider) {
    if (!provider || !provider.id) {
      console.warn('[ProviderRegistry] Cannot register invalid provider:', provider);
      return;
    }
    const existingIndex = providers.findIndex((p) => p.id === provider.id);
    if (existingIndex >= 0) {
      providers[existingIndex] = provider;
    } else {
      providers.push(provider);
    }
  }

  function getProviderForUrl(url) {
    if (!url) return null;
    return providers.find((provider) => provider.matches(url)) || null;
  }

  function getProviderForDomain(domain) {
    if (!domain) return null;
    const cleanDomain = domain.toLowerCase().replace(/^www\./, '');
    return providers.find((provider) => {
      return (provider.domains || []).some((d) => d.toLowerCase().replace(/^www\./, '') === cleanDomain);
    }) || null;
  }

  function getProviderById(id) {
    if (!id) return null;
    return providers.find((p) => p.id === id) || null;
  }

  function getAllProviders() {
    return [...providers];
  }

  function getAllSupportedDomains() {
    const domains = new Set();
    providers.forEach((p) => {
      (p.domains || []).forEach((d) => domains.add(d));
    });
    return Array.from(domains);
  }

  function getProviderForNovel(novel) {
    if (!novel) return null;
    return (novel.url && getProviderForUrl(novel.url)) || (novel.domain && getProviderForDomain(novel.domain)) || null;
  }

  // Every site can download through the queue; sites whose chapters only exist on their own page
  // need a platform that can open pages (the app's site window, or the extension's worker).
  function canBulkDownload(novel) {
    const provider = getProviderForNovel(novel);
    if (!provider) return true;
    const pageOnly = provider.fetchMode === 'page' || provider.supportsBulkDownload === false;
    if (!pageOnly) return true;
    const platform = globalScope && globalScope.Platform;
    return !!(platform && (platform.canOpenPages || platform.pageSource));
  }

  // Auto-register default providers available in the current environment
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
  if (globalScope && globalScope.WetriedtlsProvider) {
    registerProvider(globalScope.WetriedtlsProvider);
  }
  if (globalScope && globalScope.NkwwlkjProvider) {
    registerProvider(globalScope.NkwwlkjProvider);
  }
  if (globalScope && globalScope.SangtacvietProvider) {
    registerProvider(globalScope.SangtacvietProvider);
  }

  return {
    registerProvider,
    getProviderForUrl,
    getProviderForDomain,
    getProviderById,
    getAllProviders,
    getAllSupportedDomains,
    getProviderForNovel,
    canBulkDownload
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProviderRegistry;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ProviderRegistry = ProviderRegistry;
}
