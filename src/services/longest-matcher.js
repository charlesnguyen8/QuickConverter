(function (global) {
  'use strict';

  const TIERS = Object.freeze({ namelist: 6, locked: 5, soft: 4, qtNames: 3, vietPhrase: 1 });
  const DEFAULT_SOURCE_MAX_LENGTH = 30;
  const WORD_CHAR = /[\p{L}\p{N}-]/u;
  const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

  function isWordChar(ch) {
    return !!ch && WORD_CHAR.test(ch);
  }

  function isCjkChar(ch) {
    return !!ch && CJK_CHAR.test(ch);
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

  function lastCharOf(text, end) {
    return charBefore(text, end);
  }

  function joinsWord(outside, inside) {
    if (!isWordChar(outside) || !isWordChar(inside)) return false;
    return !isCjkChar(outside) && !isCjkChar(inside);
  }

  function hasBoundaries(text, start, end) {
    if (joinsWord(charBefore(text, start), charAt(text, start))) return false;
    if (joinsWord(charAt(text, end), lastCharOf(text, end))) return false;
    return true;
  }

  function createMatcher(entries, options) {
    const opts = options || {};
    const field = opts.field || 'original';
    const caseSensitive = !!opts.caseSensitive;
    const strictOverlap = opts.overlap === 'strict';
    const sources = (Array.isArray(opts.sources) ? opts.sources : [])
      .filter((src) => src && src.map && typeof src.map.get === 'function' && typeof src.map.has === 'function')
      .map((src) => ({
        id: src.id || 'source',
        map: src.map,
        tier: typeof src.tier === 'number' ? src.tier : TIERS.vietPhrase,
        maxLength: src.maxLength || DEFAULT_SOURCE_MAX_LENGTH
      }));
    const list = Array.isArray(entries) ? entries : [];

    const root = { children: new Map(), terminals: null };
    const entryCase = (entry) => (typeof entry.caseSensitive === 'boolean' ? entry.caseSensitive : caseSensitive);
    const foldKeys = list.some((entry) => entry && !entryCase(entry));
    const fold = (ch) => (foldKeys ? ch.toLowerCase() : ch);
    let tiersVary = false;
    let firstTier = null;
    sources.forEach((src) => {
      if (firstTier === null) firstTier = src.tier;
      else if (src.tier !== firstTier) tiersVary = true;
    });

    list.forEach((entry, i) => {
      if (!entry) return;
      const value = entry[field];
      if (typeof value !== 'string' || !value) return;
      const tier = typeof entry.tier === 'number' ? entry.tier : TIERS.namelist;
      const sensitive = entryCase(entry);
      if (firstTier === null) firstTier = tier;
      else if (tier !== firstTier) tiersVary = true;

      let node = root;
      for (const ch of value) {
        const key = fold(ch);
        let next = node.children.get(key);
        if (!next) {
          next = { children: new Map(), terminals: null };
          node.children.set(key, next);
        }
        node = next;
      }
      const meta = {
        id: entry.id !== undefined ? entry.id : 'idx_' + i,
        value,
        original: entry.original || '',
        translation: entry.translation || '',
        tier,
        sensitive
      };
      if (!node.terminals) node.terminals = [];
      const same = node.terminals.findIndex((t) => t.sensitive === sensitive && (!sensitive || t.value === value));
      if (same === -1) node.terminals.push(meta);
      else if (node.terminals[same].tier < tier) node.terminals[same] = meta;
    });

    function bestTerminal(terminals, source, start, end) {
      let best = null;
      for (const meta of terminals) {
        if (meta.sensitive && foldKeys && source.slice(start, end) !== meta.value) continue;
        if (!best || meta.tier > best.tier) best = meta;
      }
      return best;
    }

    function terminalsAt(source, start) {
      const found = [];
      let node = root;
      let j = start;
      while (j < source.length) {
        const ch = charAt(source, j);
        const next = node.children.get(fold(ch));
        if (!next) break;
        node = next;
        j += ch.length;
        if (node.terminals) {
          const meta = bestTerminal(node.terminals, source, start, j);
          if (meta) found.push({ end: j, meta, bounded: hasBoundaries(source, start, j) });
        }
      }
      if (sources.length === 0) return found;
      const byEnd = new Map(found.map((t) => [t.end, t]));
      for (const src of sources) {
        const limit = Math.min(source.length, start + src.maxLength);
        for (let end = start + 1; end <= limit; end++) {
          const key = source.slice(start, end);
          if (!src.map.has(key)) continue;
          const existing = byEnd.get(end);
          if (existing && existing.meta.tier >= src.tier) continue;
          byEnd.set(end, {
            end,
            meta: { id: src.id + ':' + key, value: key, original: key, translation: String(src.map.get(key)), tier: src.tier, sensitive: true },
            bounded: hasBoundaries(source, start, end)
          });
        }
      }
      return [...byEnd.values()].sort((a, b) => a.end - b.end);
    }

    function candidatesAt(source, start) {
      const terminals = terminalsAt(source, start);
      if (terminals.length === 0 || !terminals[terminals.length - 1].bounded) return [];
      return terminals.filter((t) => t.bounded);
    }

    function toMatch(start, candidate) {
      return {
        index: start,
        length: candidate.end - start,
        id: candidate.meta.id,
        value: candidate.meta.value,
        original: candidate.meta.original,
        translation: candidate.meta.translation,
        tier: candidate.meta.tier
      };
    }

    function blockedInside(source, start, candidate, sameStart) {
      if (!tiersVary && !strictOverlap) return false;
      if (tiersVary && sameStart.some((other) => other.meta.tier > candidate.meta.tier)) return true;
      const length = candidate.end - start;
      let k = start + (charAt(source, start).length || 1);
      while (k < candidate.end) {
        const inner = candidatesAt(source, k);
        for (const other of inner) {
          if (tiersVary && other.meta.tier > candidate.meta.tier) return true;
          if (strictOverlap && other.end > candidate.end && other.end - k > length) return true;
        }
        k += charAt(source, k).length || 1;
      }
      return false;
    }

    function findAll(text, findOptions) {
      const all = !!(findOptions && findOptions.all);
      const source = typeof text === 'string' ? text : '';
      const matches = [];
      let i = 0;
      while (i < source.length) {
        const step = charAt(source, i).length || 1;
        if (all) {
          terminalsAt(source, i).forEach((terminal) => {
            if (terminal.bounded) matches.push(toMatch(i, terminal));
          });
          i += step;
          continue;
        }

        const candidates = candidatesAt(source, i);

        let chosen = null;
        for (let c = candidates.length - 1; c >= 0; c--) {
          if (!blockedInside(source, i, candidates[c], candidates)) {
            chosen = candidates[c];
            break;
          }
        }
        if (chosen) {
          matches.push(toMatch(i, chosen));
          i = chosen.end;
        } else {
          i += step;
        }
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

  const LongestMatcher = { createMatcher, isWordChar, isCjkChar, TIERS };

  if (typeof window !== 'undefined') window.LongestMatcher = LongestMatcher;
  if (typeof self !== 'undefined') self.LongestMatcher = LongestMatcher;
  if (typeof global !== 'undefined') global.LongestMatcher = LongestMatcher;
  if (typeof globalThis !== 'undefined') globalThis.LongestMatcher = LongestMatcher;
  if (typeof module !== 'undefined' && module.exports) module.exports = LongestMatcher;
})(typeof globalThis !== 'undefined' ? globalThis : this);
