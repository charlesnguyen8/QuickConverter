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
