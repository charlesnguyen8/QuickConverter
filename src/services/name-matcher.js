(function (global) {
  'use strict';

  const WORD_CHAR = /[\p{L}\p{N}]/u;

  function isWordChar(ch) {
    return !!ch && WORD_CHAR.test(ch);
  }

  function charAt(text, index) {
    const code = text.codePointAt(index);
    return code === undefined ? '' : String.fromCodePoint(code);
  }

  function charBefore(text, index) {
    if (index <= 0) return '';
    const low = text.charCodeAt(index - 1);
    if (low >= 0xDC00 && low <= 0xDFFF && index >= 2) {
      const high = text.charCodeAt(index - 2);
      if (high >= 0xD800 && high <= 0xDBFF) return text.slice(index - 2, index);
    }
    return text[index - 1];
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
          const ch = charAt(source, j);
          const next = node.children.get(fold(ch));
          if (!next) break;
          node = next;
          j += ch.length;
          if (node.terminal) last = { end: j, meta: node.terminal };
        }

        if (last) {
          const before = charBefore(source, i);
          const after = charAt(source, last.end);
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
        i += (charAt(source, i) || '').length || 1;
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
