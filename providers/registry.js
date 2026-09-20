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

  // Auto-register default providers available in the current environment
  const globalScope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
  if (globalScope && globalScope.WetriedtlsProvider) {
    registerProvider(globalScope.WetriedtlsProvider);
  }

  return {
    registerProvider,
    getProviderForUrl,
    getProviderForDomain,
    getProviderById,
    getAllProviders,
    getAllSupportedDomains
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProviderRegistry;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ProviderRegistry = ProviderRegistry;
}
