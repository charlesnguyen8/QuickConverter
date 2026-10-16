(function (global) {
  'use strict';

  function resolveMatcher() {
    const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    return scope && scope.LongestMatcher && typeof scope.LongestMatcher.createMatcher === 'function' ? scope.LongestMatcher : null;
  }

  function cleanPair(entry) {
    const original = entry && entry.original ? String(entry.original).trim() : '';
    const translation = entry && entry.translation ? String(entry.translation).trim() : '';
    return original && translation ? { original, translation } : null;
  }

  function nameEntries(names, tier) {
    const out = [];
    const seen = new Set();
    (Array.isArray(names) ? names : []).forEach((entry, i) => {
      const pair = cleanPair(entry);
      if (!pair || seen.has(pair.original)) return;
      seen.add(pair.original);
      out.push({ id: 'name:' + ((entry && entry.id) || 'idx_' + i), ...pair, kind: 'name', tier, caseSensitive: true });
    });
    return out;
  }

  function lockedEntries(entries, tier, kind = 'locked') {
    const out = [];
    const seen = new Set();
    (Array.isArray(entries) ? entries : []).forEach((entry, i) => {
      const pair = cleanPair(entry);
      if (!pair) return;
      const key = pair.original.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: kind + ':' + i, ...pair, kind, tier, caseSensitive: false });
    });
    return out;
  }

  // One left-to-right pass over the source: names become stable @n@ tokens (base36,
  // numbered by first appearance) and locked glossary terms become their canonical
  // translation in `§...§`. Names outrank locked terms; text already inside `§...§`
  // is never re-wrapped.
  function rewrite(text, names, locked) {
    const source = typeof text === 'string' ? text : '';
    const result = { text: source, mapping: [] };
    const api = resolveMatcher();
    const tiers = api ? api.TIERS : { namelist: 3, locked: 2 };
    const entries = [...nameEntries(names, tiers.namelist), ...lockedEntries(locked, tiers.locked)];
    if (!source || entries.length === 0) return result;
    if (!api) {
      console.warn('[TextProcessors] LongestMatcher module not loaded; skipping name and glossary processing.');
      return result;
    }

    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const lockedSpans = [];
    const spanRe = /§[^§]*§/g;
    let span;
    while ((span = spanRe.exec(source)) !== null) lockedSpans.push([span.index, span.index + span[0].length]);
    const insideLocked = (index) => lockedSpans.some(([start, end]) => index >= start && index < end);

    const matches = api.createMatcher(entries, { field: 'original' }).findAll(source)
      .filter((match) => !(byId.get(match.id).kind === 'locked' && insideLocked(match.index)));
    if (matches.length === 0) return result;

    const tokenById = new Map();
    matches.forEach((match) => {
      const entry = byId.get(match.id);
      if (entry.kind !== 'name' || tokenById.has(match.id)) return;
      const token = `@${(tokenById.size + 1).toString(36)}@`;
      tokenById.set(match.id, token);
      result.mapping.push({ token, original: entry.original, translation: entry.translation });
    });

    let out = '';
    let last = 0;
    matches.forEach((match) => {
      const entry = byId.get(match.id);
      out += source.slice(last, match.index);
      out += entry.kind === 'name' ? tokenById.get(match.id) : `§${entry.translation}§`;
      last = match.index + match.length;
    });
    result.text = out + source.slice(last);
    return result;
  }

  function tokenizeSource(text, names) {
    return rewrite(text, names, []);
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

  function applyLockedGlossary(text, entries) {
    return rewrite(text, [], entries).text;
  }

  // Removes the `§` markers the locked glossary added before translation, leaving the
  // already-translated Vietnamese content in place.
  function stripLockedMarkers(text) {
    const source = typeof text === 'string' ? text : '';
    return source.indexOf('§') === -1 ? source : source.replace(/§/g, '');
  }

  function prepareForAi(text, lists) {
    return rewrite(text, (lists && lists.names) || [], (lists && lists.locked) || []);
  }

  function restoreFromAi(text, mapping) {
    return stripLockedMarkers(restoreTokens(text, mapping));
  }

  const PUNCTUATION = {
    '，': ', ', '。': '.', '．': '.', '：': ': ', '“': '"', '「': '"', '”': '" ', '」': '" ',
    '‘': "'", '’': "' ", '？': '?', '！': '!', '、': ', ', '\u3000': ' ', '…': '...'
  };
  const SENTENCE_ENDERS = ['\n', '\t', '. ', '"', "'", '? ', '! ', '." ', '?" ', '!" ', ': '];

  function standardizeLine(line) {
    let out = '';
    for (const ch of line) {
      if (PUNCTUATION[ch] !== undefined) {
        out += PUNCTUATION[ch];
        continue;
      }
      const code = ch.codePointAt(0);
      out += code >= 0xFF01 && code <= 0xFF5E ? String.fromCodePoint(code - 0xFEE0) : ch;
    }
    return out.replace(/[ \t]+/g, ' ').trim();
  }

  function capitalize(text) {
    const chars = Array.from(text);
    if (chars.length === 0) return text;
    if (chars[0] === '[' && chars.length > 1) return '[' + chars[1].toUpperCase() + chars.slice(2).join('');
    return chars[0].toUpperCase() + chars.slice(1).join('');
  }

  // QT2025's TranslateAll output assembly: matched phrases and per-character Hán Việt
  // readings are joined with QT's spacing, punctuation and capitalization rules.
  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function ignoredPatterns(phrases) {
    return (Array.isArray(phrases) ? phrases : [])
      .map((phrase) => Array.from(standardizeLine(String(phrase || ''))).filter((ch) => !/\s/.test(ch)))
      .filter((chars) => chars.length > 0)
      .map((chars) => new RegExp(chars.map(escapeRegExp).join('\\s*'), 'g'));
  }

  function originOf(id) {
    const text = String(id || '');
    const cut = text.indexOf(':');
    return cut === -1 ? text : text.slice(0, cut);
  }

  function convertLine(line, matcher, hanViet, ignored, segments) {
    let source = standardizeLine(line);
    if (ignored.length > 0) {
      ignored.forEach((pattern) => { source = source.replace(pattern, ''); });
      source = source.replace(/ {2,}/g, ' ').trim();
    }
    if (!source) return '';
    const record = Array.isArray(segments) ? segments : null;
    const matchAt = new Map();
    if (matcher) matcher.findAll(source).forEach((match) => matchAt.set(match.index, match));

    const isChinese = (ch) => !!ch && hanViet.has(ch);
    const charAt = (index) => {
      const code = source.codePointAt(index);
      return code === undefined ? '' : String.fromCodePoint(code);
    };
    let result = '';
    let last = '\n';

    const appendWord = (text, detail) => {
      let word;
      if (SENTENCE_ENDERS.some((ender) => last.endsWith(ender))) last = word = capitalize(text);
      else if (last.endsWith(' ') || last.endsWith('(')) last = word = text;
      else { word = text; last = ' ' + text; }
      if ((!text || /^[,.?!]/.test(text)) && result.endsWith(' ')) result = result.slice(0, -1);
      result += last;
      if (record && detail && word) record.push({ start: result.length - word.length, end: result.length, ...detail });
    };
    const readingOf = (text) => Array.from(text).map((ch) => (hanViet.has(ch) ? hanViet.get(ch) : ch)).join(' ');
    const appendChar = (ch) => {
      result += ch;
      last += ch;
    };

    let i = 0;
    while (i < source.length) {
      const match = matchAt.get(i);
      if (match) {
        const matched = source.slice(i, i + match.length);
        const origin = originOf(match.id);
        appendWord(match.translation, record ? {
          source: matched,
          sourceStart: i,
          sourceEnd: i + match.length,
          reading: readingOf(matched),
          translation: match.translation,
          origin,
          ...(origin === 'name' ? { entryId: String(match.id).slice(5) } : {})
        } : null);
        i += match.length;
        if (isChinese(charAt(i))) appendChar(' ');
        continue;
      }
      const ch = charAt(i);
      const next = charAt(i + ch.length);
      if (isChinese(ch)) {
        appendWord(hanViet.get(ch), record ? { source: ch, sourceStart: i, sourceEnd: i + ch.length, reading: hanViet.get(ch), translation: hanViet.get(ch), origin: 'hanViet' } : null);
        if (isChinese(next)) appendChar(' ');
      } else if ((ch === '"' || ch === "'") && !/[ .?!\t]$/.test(last) && next && next !== ' ' && next !== ',') {
        appendChar(' ');
        appendChar(ch);
      } else {
        appendChar(ch);
        const prev = i > 0 ? source[i - 1] : '';
        const decimal = ch === '.' && /[0-9]/.test(prev) && /[0-9]/.test(next);
        if (/[.?!]/.test(ch) && next && !/[ "']/.test(next) && !decimal) appendChar(' ');
      }
      i += ch.length;
    }
    const trimmed = result.trim();
    if (record) {
      const lead = result.length - result.trimStart().length;
      record.forEach((seg) => {
        seg.start = Math.max(0, seg.start - lead);
        seg.end = Math.min(trimmed.length, seg.end - lead);
      });
    }
    return trimmed;
  }

  function createConverter(lists) {
    const options = lists || {};
    const hanViet = options.hanViet && typeof options.hanViet.get === 'function' && typeof options.hanViet.has === 'function' ? options.hanViet : new Map();
    const api = resolveMatcher();
    const tiers = api ? api.TIERS : { namelist: 6, locked: 5, soft: 4, qtNames: 3, vietPhrase: 1 };
    const entries = [
      ...nameEntries(options.names, tiers.namelist),
      ...lockedEntries(options.locked, tiers.locked, 'locked'),
      ...lockedEntries(options.soft, tiers.soft, 'soft')
    ];
    const dicts = options.dictionaries || {};
    const isMap = (m) => !!m && typeof m.get === 'function' && typeof m.has === 'function';
    const sources = [];
    if (isMap(dicts.qtNames)) sources.push({ id: 'qtNames', map: dicts.qtNames, tier: tiers.qtNames });
    if (isMap(dicts.vietPhrase) || isMap(dicts.pronouns)) {
      const vietPhrase = isMap(dicts.vietPhrase) ? dicts.vietPhrase : new Map();
      const pronouns = isMap(dicts.pronouns) ? dicts.pronouns : new Map();
      sources.push({
        id: 'vietPhrase',
        tier: tiers.vietPhrase,
        map: {
          has: (key) => pronouns.has(key) || vietPhrase.has(key),
          get: (key) => (pronouns.has(key) ? pronouns.get(key) : vietPhrase.get(key))
        }
      });
    }
    const matcher = api && (entries.length > 0 || sources.length > 0)
      ? api.createMatcher(entries, { field: 'original', sources })
      : null;
    const ignored = ignoredPatterns(options.ignoredPhrases);
    return {
      convert(text) {
        return String(text || '').split('\n').map((line) => convertLine(line, matcher, hanViet, ignored)).join('\n');
      },
      convertDetailed(text) {
        return String(text || '').split('\n').map((line) => {
          const segments = [];
          const converted = convertLine(line, matcher, hanViet, ignored, segments);
          return { text: converted, segments: segments.filter((seg) => seg.end > seg.start) };
        });
      }
    };
  }

  const TextProcessors = {
    tokenizeSource,
    restoreTokens,
    applyLockedGlossary,
    stripLockedMarkers,
    prepareForAi,
    restoreFromAi,
    createConverter
  };

  if (typeof window !== 'undefined') window.TextProcessors = TextProcessors;
  if (typeof self !== 'undefined') self.TextProcessors = TextProcessors;
  if (typeof global !== 'undefined') global.TextProcessors = TextProcessors;
  if (typeof globalThis !== 'undefined') globalThis.TextProcessors = TextProcessors;
  if (typeof module !== 'undefined' && module.exports) module.exports = TextProcessors;
})(typeof globalThis !== 'undefined' ? globalThis : this);
