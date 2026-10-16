(function (global) {
  'use strict';

  const DEFAULT_URL = '../dict/ChinesePhienAmWords.txt';
  let loading = null;

  function parse(text) {
    const map = new Map();
    String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line) => {
      const parts = line.split('=');
      if (parts.length !== 2) return;
      const key = parts[0].trim();
      const reading = parts[1].split('/')[0].trim();
      if (!key || !reading || map.has(key)) return;
      map.set(key, reading);
    });
    return map;
  }

  function load(url) {
    if (!loading) {
      loading = fetch(url || DEFAULT_URL)
        .then((resp) => {
          if (!resp.ok) throw new Error(`Could not load the Hán Việt list (HTTP ${resp.status})`);
          return resp.text();
        })
        .then(parse)
        .catch((err) => {
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  const HanViet = { parse, load };

  if (typeof window !== 'undefined') window.HanViet = HanViet;
  if (typeof self !== 'undefined') self.HanViet = HanViet;
  if (typeof global !== 'undefined') global.HanViet = HanViet;
  if (typeof globalThis !== 'undefined') globalThis.HanViet = HanViet;
  if (typeof module !== 'undefined' && module.exports) module.exports = HanViet;
})(typeof globalThis !== 'undefined' ? globalThis : this);
