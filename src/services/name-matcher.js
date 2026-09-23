(function (global) {
  'use strict';

  const WORD_CHAR = /[\p{L}\p{N}]/u;

  function isWordChar(ch) {
    return !!ch && WORD_CHAR.test(ch);
  }

  function createMatcher(entries, options) {
    const opts = options || {};
    const field = opts.field || 'original';
    const caseSensitive = !!opts.caseSensitive;
    const list = Array.isArray(entries) ? entries : [];

    const root = { children: new Map(), terminal: null };
    const seen = new Set();

    list.forEach((entry, i) => {
      if (!entry) return;
      const raw = entry[field];
      if (typeof raw !== 'string') return;
      const value = raw;
      const key = caseSensitive ? value : value.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      const meta = {
        id: entry.id !== undefined ? entry.id : 'idx_' + i,
        value,
        length: key.length,
        original: entry.original || '',
        translation: entry.translation || ''
      };
      let node = root;
      for (const ch of key) {
        let next = node.children.get(ch);
        if (!next) {
          next = { children: new Map(), terminal: null };
          node.children.set(ch, next);
        }
        node = next;
      }
      node.terminal = meta;
    });

    const fold = (ch) => (caseSensitive ? ch : ch.toLowerCase());

    function findAll(text) {
      const source = typeof text === 'string' ? text : '';
      const matches = [];
      let i = 0;
      while (i < source.length) {
        let node = root;
        let j = i;
        let last = null;
        while (j < source.length) {
          const next = node.children.get(fold(source[j]));
          if (!next) break;
          node = next;
          j += 1;
          if (node.terminal) last = { end: j, meta: node.terminal };
        }

        if (last) {
          const before = i > 0 ? source[i - 1] : '';
          const after = last.end < source.length ? source[last.end] : '';
          if (!isWordChar(before) && !isWordChar(after)) {
            matches.push({
              index: i,
              length: last.end - i,
              id: last.meta.id,
              value: last.meta.value,
              original: last.meta.original,
              translation: last.meta.translation
            });
            i = last.end;
            continue;
          }
        }
        i += 1;
      }
      return matches;
    }

    function replaceAll(text, replacer) {
      const source = typeof text === 'string' ? text : '';
      const matches = findAll(source);
      if (matches.length === 0) return source;
      let out = '';
      let last = 0;
      matches.forEach((match) => {
        out += source.slice(last, match.index);
        out += String(typeof replacer === 'function' ? replacer(match) : replacer);
        last = match.index + match.length;
      });
      out += source.slice(last);
      return out;
    }

    return { findAll, replaceAll };
  }

  const NameMatcher = { createMatcher, isWordChar };

  if (typeof window !== 'undefined') window.NameMatcher = NameMatcher;
  if (typeof self !== 'undefined') self.NameMatcher = NameMatcher;
  if (typeof global !== 'undefined') global.NameMatcher = NameMatcher;
  if (typeof globalThis !== 'undefined') globalThis.NameMatcher = NameMatcher;
  if (typeof module !== 'undefined' && module.exports) module.exports = NameMatcher;
})(typeof globalThis !== 'undefined' ? globalThis : this);
