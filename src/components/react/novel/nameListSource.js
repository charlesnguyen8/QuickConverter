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

const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function splitByNames(text, entries) {
  const source = typeof text === 'string' ? text : '';
  const list = (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.translation === 'string' && entry.translation.trim())
    .map((entry) => ({ id: entry.id, original: entry.original || '', translation: entry.translation.trim() }));
  if (!source || list.length === 0) return [{ text: source }];

  const byLength = [...list].sort((a, b) => b.translation.length - a.translation.length).slice(0, 500);
  const byLower = new Map(byLength.map((entry) => [entry.translation.toLowerCase(), entry]));
  const pattern = byLength.map((entry) => escapeRegExp(entry.translation)).join('|');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`, 'giu');

  const segments = [];
  let last = 0;
  let match;
  while ((match = regex.exec(source)) !== null) {
    if (match.index > last) segments.push({ text: source.slice(last, match.index) });
    const entry = byLower.get(match[0].toLowerCase());
    segments.push({ text: match[0], nameId: entry ? entry.id : null, original: entry ? entry.original : null });
    last = match.index + match[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last) });
  return segments;
}
