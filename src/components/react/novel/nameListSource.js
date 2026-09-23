import '../../../services/name-matcher.js';

export function findMatches(text, term) {
  const matches = [];
  if (typeof text !== 'string' || !text || !term) return matches;
  const haystack = text.toLowerCase();
  const needle = String(term).toLowerCase();
  if (!needle) return matches;
  let from = 0;
  while (from <= haystack.length) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) break;
    matches.push({ index, length: needle.length });
    from = index + needle.length;
  }
  return matches;
}

function collapse(str) {
  return str.replace(/\s+/g, ' ');
}

export function buildSnippets(text, term, { context = 120, max = 100 } = {}) {
  const source = typeof text === 'string' ? text : '';
  const matches = findMatches(source, term);
  const snippets = [];
  for (let i = 0; i < matches.length && snippets.length < max; i += 1) {
    const m = matches[i];
    const start = Math.max(0, m.index - context);
    const end = Math.min(source.length, m.index + m.length + context);
    snippets.push({
      index: m.index,
      before: (start > 0 ? '…' : '') + collapse(source.slice(start, m.index)),
      match: source.slice(m.index, m.index + m.length),
      after: collapse(source.slice(m.index + m.length, end)) + (end < source.length ? '…' : '')
    });
  }
  return { count: matches.length, snippets };
}

export function createNameMatcher(entries) {
  const api = typeof globalThis !== 'undefined' ? globalThis.NameMatcher : null;
  const list = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.translation === 'string' && entry.translation.trim())
    .map((entry) => ({ id: entry.id, original: entry.original || '', translation: entry.translation.trim() }));
  const matcher = api && list.length > 0 ? api.createMatcher(list, { field: 'translation', caseSensitive: false }) : null;

  return {
    split(text) {
      const source = typeof text === 'string' ? text : '';
      if (!matcher || !source) return [{ text: source }];
      const matches = matcher.findAll(source);
      if (matches.length === 0) return [{ text: source }];
      const segments = [];
      let last = 0;
      matches.forEach((match) => {
        if (match.index > last) segments.push({ text: source.slice(last, match.index) });
        segments.push({ text: source.slice(match.index, match.index + match.length), nameId: match.id, original: match.original || null });
        last = match.index + match.length;
      });
      if (last < source.length) segments.push({ text: source.slice(last) });
      return segments;
    }
  };
}

export function splitByNames(text, entries) {
  return createNameMatcher(entries).split(text);
}
