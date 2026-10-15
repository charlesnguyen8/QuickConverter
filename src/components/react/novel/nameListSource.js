import '../../../services/name-matcher.js';

const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function findMatches(text, term) {
  const source = typeof text === 'string' ? text : '';
  const needle = String(term == null ? '' : term).trim();
  if (!source || !needle) return [];

  const api = typeof globalThis !== 'undefined' ? globalThis.NameMatcher : null;
  if (api && typeof api.createMatcher === 'function') {
    const matcher = api.createMatcher([{ id: 'term', original: needle }], { field: 'original', caseSensitive: false });
    return matcher.findAll(source).map((match) => ({ index: match.index, length: match.length }));
  }

  const regex = new RegExp(`(?<![\\p{L}\\p{N}-])${escapeRegExp(needle)}(?![\\p{L}\\p{N}-])`, 'giu');
  const matches = [];
  let match;
  while ((match = regex.exec(source)) !== null) {
    matches.push({ index: match.index, length: match[0].length });
    if (match[0].length === 0) regex.lastIndex += 1;
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

const MAX_HIGHLIGHTS_PER_PARAGRAPH = 200;

export function createNameMatcher(entries, options = {}) {
  const api = typeof globalThis !== 'undefined' ? globalThis.NameMatcher : null;
  const maxMatches = Number.isFinite(options.maxMatches) ? options.maxMatches : MAX_HIGHLIGHTS_PER_PARAGRAPH;
  const caseSensitive = !!options.caseSensitive;
  const list = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.translation === 'string' && entry.translation.trim())
    .map((entry) => ({ id: entry.id, original: entry.original || '', translation: entry.translation.trim() }));
  const matcher = api && list.length > 0 ? api.createMatcher(list, { field: 'translation', caseSensitive }) : null;

  return {
    split(text) {
      const source = typeof text === 'string' ? text : '';
      if (!matcher || !source) return [{ text: source }];
      const matches = matcher.findAll(source);
      if (matches.length === 0) return [{ text: source }];
      const limited = matches.length > maxMatches ? matches.slice(0, maxMatches) : matches;
      const segments = [];
      let last = 0;
      limited.forEach((match) => {
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

function foldForCompare(value, strict) {
  const str = String(value == null ? '' : value);
  return strict ? str : str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function findNameConflicts(entries, options = {}) {
  const strict = !!options.strict;
  const list = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.original && entry.translation);
  if (list.length < 2) return [];
  const api = typeof globalThis !== 'undefined' ? globalThis.NameMatcher : null;
  if (!api || typeof api.createMatcher !== 'function') return [];

  const matcher = api.createMatcher(
    list.map((entry) => ({ id: entry.id, original: entry.original })),
    { field: 'original', caseSensitive: true }
  );
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const seen = new Set();
  const conflicts = [];

  list.forEach((longer) => {
    matcher.findAll(longer.original, { all: true }).forEach((match) => {
      if (!match.id || match.id === longer.id) return;
      if (match.length >= longer.original.length) return;
      const atSuffix = match.index + match.length === longer.original.length;
      if (!atSuffix) return;
      const shorter = byId.get(match.id);
      if (!shorter) return;
      if (foldForCompare(longer.translation, strict).includes(foldForCompare(shorter.translation, strict))) return;
      const key = `${longer.id}>${shorter.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      conflicts.push({
        longerId: longer.id,
        shorterId: shorter.id,
        longerOriginal: longer.original,
        shorterOriginal: shorter.original,
        longerTranslation: longer.translation,
        shorterTranslation: shorter.translation
      });
    });
  });

  return conflicts;
}

export function computeVirtualWindow(total, scrollTop, viewportHeight, rowHeight, overscan = 6) {
  const count = Math.max(0, Math.floor(total) || 0);
  const height = Math.max(1, rowHeight);
  if (count === 0) return { start: 0, end: 0 };
  const first = Math.max(0, Math.floor((scrollTop || 0) / height) - overscan);
  const start = Math.min(first, count - 1);
  const visible = Math.ceil((Math.max(0, viewportHeight) || 0) / height) + overscan * 2 + 1;
  const end = Math.min(count, start + visible);
  return { start, end };
}
