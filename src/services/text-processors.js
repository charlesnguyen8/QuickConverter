(function (global) {
  'use strict';

  // Rewrites occurrences of the novel's source names in `text` to stable @n@ tokens
  // (base36, numbered by first appearance) so translation models leave proper nouns
  // alone. Returns the tokenized text plus the ordered mapping.
  function resolveNameMatcher() {
    if (typeof NameMatcher !== 'undefined' && NameMatcher && typeof NameMatcher.createMatcher === 'function') return NameMatcher;
    if (typeof globalThis !== 'undefined' && globalThis.NameMatcher && typeof globalThis.NameMatcher.createMatcher === 'function') return globalThis.NameMatcher;
    if (typeof window !== 'undefined' && window.NameMatcher && typeof window.NameMatcher.createMatcher === 'function') return window.NameMatcher;
    return null;
  }

  function tokenizeSource(text, names) {
    const source = typeof text === 'string' ? text : '';
    const result = { text: source, mapping: [] };
    if (!source || !Array.isArray(names) || names.length === 0) return result;

    const unique = [];
    const seen = new Set();
    names.forEach((entry, i) => {
      const original = entry && entry.original ? String(entry.original).trim() : '';
      const translation = entry && entry.translation ? String(entry.translation).trim() : '';
      if (!original || !translation || seen.has(original)) return;
      seen.add(original);
      unique.push({ id: (entry && entry.id) || 'idx_' + i, original, translation });
    });
    if (unique.length === 0) return result;

    const api = resolveNameMatcher();
    if (!api) {
      console.warn('[StorageService] NameMatcher module not loaded; skipping source tokenization.');
      return result;
    }

    const matcher = api.createMatcher(unique, { field: 'original', caseSensitive: true });
    const matches = matcher.findAll(source);
    if (matches.length === 0) return result;

    const firstIndex = new Map();
    matches.forEach((match) => {
      if (!firstIndex.has(match.id)) firstIndex.set(match.id, match.index);
    });
    const orderedIds = [...firstIndex.keys()].sort((a, b) => firstIndex.get(a) - firstIndex.get(b));

    const infoById = new Map(unique.map((item) => [item.id, item]));
    const tokenById = new Map();
    const mapping = orderedIds.map((id, i) => {
      const item = infoById.get(id) || { original: '', translation: '' };
      const token = `@${(i + 1).toString(36)}@`;
      tokenById.set(id, token);
      return { token, original: item.original, translation: item.translation };
    });

    const tokenized = matcher.replaceAll(source, (match) => tokenById.get(match.id) || match.value);
    return { text: tokenized, mapping };
  }

  // Swaps @n@ tokens back to their translated names. Case-insensitive and tolerant of
  // spaces inside the token; unknown tokens are left untouched.
  function restoreTokens(text, mapping) {
    const source = typeof text === 'string' ? text : '';
    if (!source || !Array.isArray(mapping) || mapping.length === 0) return source;

    const byCode = {};
    mapping.forEach(({ token, translation }) => {
      const code = String(token || '').replace(/@/g, '').toLowerCase();
      if (code && translation) byCode[code] = translation;
    });
    if (Object.keys(byCode).length === 0) return source;

    return source.replace(/@\s*([0-9a-z]+)\s*@/gi, (match, code) => {
      const found = byCode[String(code).toLowerCase()];
      return found !== undefined ? found : match;
    });
  }

  // Replaces whole-word locked glossary terms in the source text with their canonical
  // translation wrapped in `§...§`. Case-insensitive; longest term wins; text already
  // inside `§...§` (and therefore `@n@` placeholders) is left untouched.
  function applyLockedGlossary(text, entries) {
    const source = typeof text === 'string' ? text : '';
    if (!source || !Array.isArray(entries) || entries.length === 0) return source;

    const unique = [];
    const seen = new Set();
    entries.forEach((entry, i) => {
      const original = entry && entry.original ? String(entry.original).trim() : '';
      const translation = entry && entry.translation ? String(entry.translation).trim() : '';
      if (!original || !translation) return;
      const key = original.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      unique.push({ id: 'lock_' + i, original, translation });
    });
    if (unique.length === 0) return source;

    const api = resolveNameMatcher();
    if (!api) {
      console.warn('[StorageService] NameMatcher module not loaded; skipping locked glossary.');
      return source;
    }

    const matches = api.createMatcher(unique, { field: 'original', caseSensitive: false }).findAll(source);
    if (matches.length === 0) return source;

    const lockedSpans = [];
    const spanRe = /§[^§]*§/g;
    let span;
    while ((span = spanRe.exec(source)) !== null) lockedSpans.push([span.index, span.index + span[0].length]);
    const insideLocked = (index) => lockedSpans.some(([start, end]) => index >= start && index < end);

    let out = '';
    let last = 0;
    matches.forEach((match) => {
      if (insideLocked(match.index)) return;
      out += source.slice(last, match.index);
      out += `§${match.translation}§`;
      last = match.index + match.length;
    });
    out += source.slice(last);
    return out;
  }

  // Removes the `§` markers the locked glossary added before translation, leaving the
  // already-translated Vietnamese content in place.
  function stripLockedMarkers(text) {
    const source = typeof text === 'string' ? text : '';
    return source.indexOf('§') === -1 ? source : source.replace(/§/g, '');
  }

  function prepareForAi(text, lists) {
    const names = (lists && lists.names) || [];
    const locked = (lists && lists.locked) || [];
    const tokenized = tokenizeSource(text, names);
    return { text: applyLockedGlossary(tokenized.text, locked), mapping: tokenized.mapping };
  }

  function restoreFromAi(text, mapping) {
    return stripLockedMarkers(restoreTokens(text, mapping));
  }

  const TextProcessors = {
    tokenizeSource,
    restoreTokens,
    applyLockedGlossary,
    stripLockedMarkers,
    prepareForAi,
    restoreFromAi
  };

  if (typeof window !== 'undefined') window.TextProcessors = TextProcessors;
  if (typeof self !== 'undefined') self.TextProcessors = TextProcessors;
  if (typeof global !== 'undefined') global.TextProcessors = TextProcessors;
  if (typeof globalThis !== 'undefined') globalThis.TextProcessors = TextProcessors;
  if (typeof module !== 'undefined' && module.exports) module.exports = TextProcessors;
})(typeof globalThis !== 'undefined' ? globalThis : this);
