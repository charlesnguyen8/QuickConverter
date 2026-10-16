(function (global) {
  'use strict';

  const BASE = '../dict/';
  const FILES = {
    vietPhrase: { file: 'VietPhrase.txt', kind: 'dictionary' },
    qtNames: { file: 'Names.txt', kind: 'dictionary' },
    pronouns: { file: 'Pronouns.txt', kind: 'dictionary' },
    ignoredPhrases: { file: 'IgnoredChinesePhrases.txt', kind: 'list' }
  };
  const cache = new Map();

  function lines(text) {
    return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  }

  function parseDictionary(text) {
    const map = new Map();
    lines(text).forEach((line) => {
      const parts = line.split('=');
      if (parts.length !== 2) return;
      const key = parts[0];
      const meaning = parts[1].split(/[/|]/)[0].trim();
      if (!key || !meaning || map.has(key)) return;
      map.set(key, meaning);
    });
    return map;
  }

  function parseList(text) {
    return lines(text).map((line) => line.trim()).filter(Boolean);
  }

  function load(name) {
    const spec = FILES[name];
    if (!spec) return Promise.reject(new Error(`Unknown QT dictionary: ${name}`));
    if (!cache.has(name)) {
      const pending = fetch(BASE + spec.file)
        .then((resp) => {
          if (!resp.ok) throw new Error(`Could not load ${spec.file} (HTTP ${resp.status})`);
          return resp.text();
        })
        .then((text) => (spec.kind === 'list' ? parseList(text) : parseDictionary(text)))
        .catch((err) => {
          cache.delete(name);
          throw err;
        });
      cache.set(name, pending);
    }
    return cache.get(name);
  }

  const QtDictionaries = { parseDictionary, parseList, load, FILES };

  if (typeof window !== 'undefined') window.QtDictionaries = QtDictionaries;
  if (typeof self !== 'undefined') self.QtDictionaries = QtDictionaries;
  if (typeof global !== 'undefined') global.QtDictionaries = QtDictionaries;
  if (typeof globalThis !== 'undefined') globalThis.QtDictionaries = QtDictionaries;
  if (typeof module !== 'undefined' && module.exports) module.exports = QtDictionaries;
})(typeof globalThis !== 'undefined' ? globalThis : this);
