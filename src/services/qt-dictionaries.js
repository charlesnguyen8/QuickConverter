(function (global) {
  'use strict';

  const BASE = '../dict/';
  const FILES = {
    vietPhrase: { file: 'VietPhrase.txt', kind: 'dictionary' },
    qtNames: { file: 'Names.txt', kind: 'dictionary' },
    pronouns: { file: 'Pronouns.txt', kind: 'dictionary' },
    ignoredPhrases: { file: 'IgnoredChinesePhrases.txt', kind: 'list' },
    luatNhan: { file: 'LuatNhan.txt', kind: 'rules' },
    hoNguoi: { file: 'HoNguoi.txt', kind: 'dictionary' },
    hauTu: { file: 'HauTu.txt', kind: 'dictionary' },
    danhTu: { file: 'DanhTu.txt', kind: 'dictionary' },
    traditional: { file: 'TraditionalToSimplified.txt', kind: 'charmap' },
    lacViet: { file: 'LacViet.txt', kind: 'definitions' }
  };
  const cache = new Map();

  function lines(text) {
    return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  }

  function splitMeanings(raw) {
    const out = [];
    String(raw || '').split(/[/|]/).forEach((part) => {
      const meaning = part.trim();
      if (meaning && !out.includes(meaning)) out.push(meaning);
    });
    return out;
  }

  class MeaningMap extends Map {
    get(key) {
      const raw = super.get(key);
      return raw === undefined ? undefined : String(raw).split(/[/|]/)[0].trim();
    }

    meanings(key) {
      return this.has(key) ? splitMeanings(super.get(key)) : [];
    }
  }

  function parseDictionary(text) {
    const map = new MeaningMap();
    lines(text).forEach((line) => {
      const parts = line.split('=');
      if (parts.length !== 2) return;
      const key = parts[0];
      const meaning = parts[1].split(/[/|]/)[0].trim();
      if (!key || !meaning || map.has(key)) return;
      map.set(key, parts[1]);
    });
    return map;
  }

  function parseCharMap(text) {
    const map = new Map();
    lines(text).forEach((line) => {
      const match = /^([0-9A-Fa-f]{1,6})=([0-9A-Fa-f]{1,6})$/.exec(line.trim());
      if (!match) return;
      map.set(String.fromCodePoint(parseInt(match[1], 16)), String.fromCodePoint(parseInt(match[2], 16)));
    });
    return map;
  }

  function parseDefinitions(text) {
    const map = new Map();
    lines(text).forEach((line) => {
      const parts = line.split('=');
      if (parts.length !== 2 || !parts[0] || !parts[1] || map.has(parts[0])) return;
      map.set(parts[0], parts[1]);
    });
    return map;
  }

  function parseList(text) {
    return lines(text).map((line) => line.trim()).filter(Boolean);
  }

  function parseByKind(kind, text) {
    if (kind === 'list') return parseList(text);
    if (kind === 'charmap') return parseCharMap(text);
    if (kind === 'definitions') return parseDefinitions(text);
    if (kind === 'rules') {
      const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
      if (!scope || !scope.LuatNhan) throw new Error('LuatNhan module is not loaded.');
      return scope.LuatNhan.parseRules(text);
    }
    return parseDictionary(text);
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
        .then((text) => parseByKind(spec.kind, text))
        .catch((err) => {
          cache.delete(name);
          throw err;
        });
      cache.set(name, pending);
    }
    return cache.get(name);
  }

  const QtDictionaries = { parseDictionary, parseList, parseCharMap, parseDefinitions, load, FILES };

  if (typeof window !== 'undefined') window.QtDictionaries = QtDictionaries;
  if (typeof self !== 'undefined') self.QtDictionaries = QtDictionaries;
  if (typeof global !== 'undefined') global.QtDictionaries = QtDictionaries;
  if (typeof globalThis !== 'undefined') globalThis.QtDictionaries = QtDictionaries;
  if (typeof module !== 'undefined' && module.exports) module.exports = QtDictionaries;
})(typeof globalThis !== 'undefined' ? globalThis : this);
