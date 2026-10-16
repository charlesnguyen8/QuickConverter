(function (global) {
  'use strict';

  const NUMBER_GROUP = '((?:\\d+\\s*[万亿])|(?:\\d+)|(?:[零一二三四五六七八九十百千万亿两〇]+))';
  const NUMBER_SEQUENCE_GROUP = '((?:(?:\\d+(?:[.,]\\d+)?|[零一二三四五六七八九十百千万亿两〇]+)\\s*)+)';

  function numbers() {
    const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    if (!scope || !scope.QtNumbers) throw new Error('QtNumbers module is not loaded.');
    return scope.QtNumbers;
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\\-]/g, '\\$&');
  }

  function replaceAll(text, search, replacement) {
    return text.split(search).join(replacement);
  }

  function parseRules(text) {
    const seen = new Set();
    const rules = [];
    String(text || '').replace(/^﻿/, '').split(/\r?\n/).forEach((line) => {
      if (!line.trim() || line.startsWith('#')) return;
      const parts = line.split('=');
      if (parts.length !== 2 || !parts[0] || seen.has(parts[0])) return;
      seen.add(parts[0]);
      rules.push([parts[0], parts[1]]);
    });
    return rules;
  }

  function flexibleWhitespace(pattern) {
    return pattern.trim().replace(/\s+/g, '\\s*');
  }

  function compileSPattern(key) {
    const flexible = flexibleWhitespace(replaceAll(replaceAll(key, '(', '(?:'), '{s}', ' {s} '));
    if (key === '百分[之]?{s}') return replaceAll(flexible, '{s}', '([零一二三四五六七八九十百千万亿两〇点\\d]+)');
    let pattern = replaceAll(flexible, '{s}', NUMBER_GROUP);
    if (key === '{s}两') pattern += '(?!(?:[零一二三四五六七八九十百千万亿两〇\\d]+){1,2})';
    return pattern;
  }

  function compileNPattern(key) {
    const pattern = replaceAll(key, '(', '(?:');
    const index = pattern.indexOf('{n}');
    if (index === -1) return pattern;
    if (index + 3 < pattern.length) {
      const prefix = pattern.slice(0, index);
      const suffix = pattern.slice(index + 3);
      return `${prefix}((?:(?!${escapeRegExp(suffix)})[^,\\. ?]){1,10}?)${suffix}`;
    }
    return replaceAll(pattern, '{n}', '([^,\\. ?]{1,10})');
  }

  function normalizedLength(key) {
    let normalized = key;
    const alternatives = /\(([^()]*)\)/;
    let found;
    while ((found = alternatives.exec(normalized)) !== null) {
      const shortest = Math.min(...found[1].split('|').map((choice) => Array.from(choice).length));
      normalized = normalized.slice(0, found.index) + 'c'.repeat(shortest) + normalized.slice(found.index + found[0].length);
    }
    normalized = normalized.replace(/\[[^\]]*\]/g, 'c');
    return Array.from(normalized).filter((ch) => ch !== '?').length;
  }

  function ruleLiterals(key) {
    const chars = Array.from(key);
    const literals = [];
    let i = 0;
    while (i < chars.length) {
      const ch = chars[i];
      if (ch === '{' || ch === '[' || ch === '(') {
        const close = ch === '{' ? '}' : (ch === '[' ? ']' : ')');
        while (i < chars.length && chars[i] !== close) i++;
        i++;
        if (ch === '[' && chars[i] === '?') i++;
      } else if (/\s/.test(ch) || '?|)]}'.includes(ch)) {
        i++;
      } else if (chars[i + 1] === '?') {
        i += 2;
      } else {
        if (!literals.includes(ch)) literals.push(ch);
        i++;
      }
    }
    return literals;
  }

  function byLengthThenKey(a, b) {
    const diff = Array.from(b[0]).length - Array.from(a[0]).length;
    if (diff !== 0) return diff;
    return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0);
  }

  function compile(key, value, pattern) {
    try {
      return { key, value, regex: new RegExp(pattern, 'g'), literals: ruleLiterals(key) };
    } catch (e) {
      console.warn('[LuatNhan] Skipping a rule that does not compile:', key, e.message);
      return null;
    }
  }

  function resolveN(rule, match, dictionaryN) {
    const captured = match[1];
    if (captured === undefined) return null;
    const matchIndex = match.index;
    const matchLength = match[0].length;
    if (rule.key.endsWith('{n}')) {
      for (let length = captured.length; length >= 1; length--) {
        const value = dictionaryN.get(captured.slice(0, length));
        if (value !== undefined) return { index: matchIndex, length: matchLength - (captured.length - length), key: rule.key, valueN: String(value) };
      }
      return null;
    }
    if (rule.key.startsWith('{n}')) {
      for (let offset = 0; offset < captured.length; offset++) {
        const value = dictionaryN.get(captured.slice(offset));
        if (value !== undefined) return { index: matchIndex + offset, length: matchLength - offset, key: rule.key, valueN: String(value) };
      }
      return null;
    }
    const value = dictionaryN.get(captured);
    return value === undefined ? null : { index: matchIndex, length: matchLength, key: rule.key, valueN: String(value) };
  }

  function convertDecimal(number) {
    const N = numbers();
    const text = number.trim();
    if (!text) return null;
    const point = text.indexOf('点');
    if (point !== -1) {
      const integer = N.convertChineseNumber(text.slice(0, point));
      if (integer === null) return null;
      const fractional = Array.from(text.slice(point + 1)).map((ch) => (N.chineseDigit(ch) !== null ? String(N.chineseDigit(ch)) : ch)).join('');
      return `${integer}.${fractional}`;
    }
    const chars = Array.from(text);
    if (chars.length >= 2 && chars.every((ch) => N.chineseDigit(ch) !== null)) return chars.map((ch) => String(N.chineseDigit(ch))).join('');
    if (chars.length === 3 && chars[2] === '十' && N.chineseDigit(chars[0]) !== null && N.chineseDigit(chars[1]) !== null) {
      return `${N.chineseDigit(chars[0]) * 10}-${N.chineseDigit(chars[1]) * 10}`;
    }
    const value = N.convertChineseNumber(text);
    return value === null ? null : String(value);
  }

  function templateHasContext(template, placeholder) {
    return new RegExp(`(năm|chương)\\s*${escapeRegExp(placeholder)}`, 'i').test(template);
  }

  function translatePlainNumber(number, keepNumeric) {
    const N = numbers();
    const value = N.convertChineseNumber(number);
    if (value === null) return null;
    return keepNumeric ? String(value) : N.numberToVietnameseText(value);
  }

  function translateSingleNumber(number, template, placeholder) {
    const N = numbers();
    const chars = Array.from(number);
    if (number.includes('.') || number.includes(',') || (chars.length > 1 && chars[0] === '0')) return number;
    const range = N.translateRangeNumber(number);
    if (range) return range;
    if (chars.length === 2 && N.chineseDigit(chars[0]) !== null && N.chineseDigit(chars[1]) !== null) {
      return `${N.chineseDigit(chars[0])}-${N.chineseDigit(chars[1])}`;
    }
    return translatePlainNumber(number, templateHasContext(template, placeholder));
  }

  function translateSRule(chinese, ruleKey, template) {
    const count = ruleKey.split('{s}').length - 1;
    if (count === 0) return null;
    const rule = replaceAll(ruleKey, '(', '(?:');
    const pattern = /[0-9]/.test(chinese)
      ? replaceAll(flexibleWhitespace(replaceAll(rule, '{s}', ' {s} ')), '{s}', NUMBER_SEQUENCE_GROUP)
      : replaceAll(rule, '{s}', NUMBER_SEQUENCE_GROUP);
    let captures;
    try {
      captures = new RegExp(`^${pattern}$`).exec(chinese.trim());
    } catch (e) {
      return null;
    }
    if (!captures || captures.length - 1 < count) return null;

    let translated = template;
    if (count === 1) {
      const number = (captures[1] || '').trim();
      if (!number) return null;
      const converted = translateSingleNumber(number, template, '{s}');
      if (converted === null) return null;
      translated = replaceAll(translated, '{s}', converted);
    } else {
      for (let index = 1; index <= count; index++) {
        const number = (captures[index] || '').trim();
        if (!number) return null;
        const placeholder = `{${index}}`;
        const converted = translatePlainNumber(number, templateHasContext(template, placeholder));
        if (converted === null) return null;
        translated = replaceAll(translated, placeholder, converted);
      }
    }

    const day = /^ngày (\d+)/.exec(translated.toLowerCase());
    if (day && Number(day[1]) >= 1 && Number(day[1]) < 10) translated = 'mùng' + translated.slice('ngày'.length);
    return translated;
  }

  function createRules(rules, options) {
    const opts = options || {};
    const dictionaryN = opts.dictionaryN && typeof opts.dictionaryN.get === 'function' ? opts.dictionaryN : new Map();
    const vietPhraseHas = typeof opts.vietPhraseHas === 'function' ? opts.vietPhraseHas : () => false;
    const fullVietPhraseHas = typeof opts.fullVietPhraseHas === 'function' ? opts.fullVietPhraseHas : vietPhraseHas;
    const isMap = (m) => !!m && typeof m.get === 'function' && typeof m.has === 'function';
    const hoNguoi = isMap(opts.hoNguoi) ? opts.hoNguoi : null;
    const hauTu = isMap(opts.hauTu) ? opts.hauTu : null;
    const ordered = (Array.isArray(rules) ? rules : []).filter((rule) => Array.isArray(rule) && rule[0]).slice().sort(byLengthThenKey);

    const nRules = ordered
      .filter(([key]) => key.includes('{n}') && !key.includes('{s}'))
      .map((rule, order) => ({ rule, order, length: normalizedLength(rule[0]) }))
      .sort((a, b) => (b.length - a.length) || (a.order - b.order))
      .map(({ rule: [key, value] }) => compile(key, value, compileNPattern(key)))
      .filter(Boolean);
    const sRules = ordered
      .filter(([key]) => key !== '{s}' && key.includes('{s}') && !key.includes('{n}'))
      .map(([key, value]) => compile(key, value, compileSPattern(key)))
      .filter(Boolean);

    const hasLiterals = (rule, present) => rule.literals.every((literal) => present.has(literal));

    function matchN(text, present) {
      for (const rule of nRules) {
        if (!hasLiterals(rule, present)) continue;
        rule.regex.lastIndex = 0;
        let match;
        while ((match = rule.regex.exec(text)) !== null) {
          const found = resolveN(rule, match, dictionaryN);
          if (found) return found;
          rule.regex.lastIndex = match.index + Math.max(match[0].length, 1);
        }
      }
      return null;
    }

    function matchS(text, present) {
      for (const rule of sRules) {
        if (!hasLiterals(rule, present)) continue;
        rule.regex.lastIndex = 0;
        const match = rule.regex.exec(text);
        if (!match || match[1] === undefined) continue;
        if (vietPhraseHas(match[0]) || !match[1].trim()) continue;
        return { index: match.index, length: match[0].length, key: rule.key, valueN: match[1] };
      }
      return null;
    }

    function isHoHau(phrase) {
      for (let split = 1; split < phrase.length; split++) {
        if (hoNguoi.has(phrase.slice(0, split)) && hauTu.has(phrase.slice(split))) return true;
      }
      return false;
    }

    function findHoHauPhrase(window, start) {
      const windowLength = Math.min(20, window.length - start);
      if (windowLength < 2) return 0;
      for (let length = Math.min(6, windowLength); length >= 2; length--) {
        const phrase = window.slice(start, start + length);
        if (!isHoHau(phrase) || fullVietPhraseHas(phrase)) continue;
        let covered = false;
        for (let longer = length + 1; longer <= windowLength && !covered; longer++) {
          covered = fullVietPhraseHas(window.slice(start, start + longer));
        }
        if (!covered) return length;
      }
      return 0;
    }

    function contains(text) {
      const window = String(text || '');
      const present = new Set(Array.from(window));
      let best = matchN(window, present);
      let bestIndex = best ? best.index : Infinity;
      if (hoNguoi && hauTu) {
        for (let index = 0; index < Math.min(window.length, bestIndex); index++) {
          const length = findHoHauPhrase(window, index);
          if (length > 0) {
            best = { index, length, key: '{h}{t}', valueN: '' };
            bestIndex = index;
            break;
          }
        }
      }
      if (bestIndex > 0 && Array.from(window).some((ch) => numbers().isNumberStart(ch))) {
        const sMatch = matchS(window, present);
        if (sMatch && sMatch.index < bestIndex) best = sMatch;
      }
      return best;
    }

    function translate(chinese, ruleKey, valueN) {
      const N = numbers();
      if (ruleKey.includes('{n}')) {
        if (!String(valueN || '').trim()) return null;
        const rule = nRules.find((r) => r.key === ruleKey);
        return rule ? replaceAll(rule.value, '{n}', String(valueN).trim()) : null;
      }
      if (ruleKey === '{s}两') {
        if (!chinese.endsWith('两')) return null;
        const value = N.convertChineseNumber(chinese.slice(0, -1));
        return value === null ? null : `${N.numberToVietnameseText(value)} lượng`;
      }
      const rule = sRules.find((r) => r.key === ruleKey);
      const template = rule ? rule.value : null;
      if (ruleKey === '百分[之]?{s}') {
        const value = String(valueN || '').trim();
        if (!value || template === null) return null;
        const decimal = convertDecimal(value);
        return decimal === null ? null : replaceAll(template, '{s}', decimal);
      }
      if (ruleKey === '{h}{t}') {
        if (!hoNguoi || !hauTu) return null;
        for (let split = 1; split < chinese.length; split++) {
          const ho = chinese.slice(0, split);
          const hau = chinese.slice(split);
          if (hoNguoi.has(ho) && hauTu.has(hau)) return `${String(hoNguoi.get(ho)).trim()} ${String(hauTu.get(hau)).trim()}`;
        }
        return null;
      }
      if (ruleKey.includes('{s}')) {
        if (template === null) return null;
        if (ruleKey.includes('余') || ruleKey.includes('多')) {
          const at = chinese.search(/[余多]/);
          if (at !== -1) {
            const numberText = (chinese.slice(0, at) + chinese.slice(at + 1)).trim();
            const value = N.convertChineseNumber(numberText);
            if (value !== null && (value !== 0 || numberText === '0')) return replaceAll(template, '{s}', N.numberToVietnameseText(value));
          }
        }
        return translateSRule(chinese, ruleKey, template);
      }
      return null;
    }

    return { contains, translate, ruleCount: nRules.length + sRules.length };
  }

  const LuatNhan = { parseRules, createRules, normalizedLength };

  if (typeof window !== 'undefined') window.LuatNhan = LuatNhan;
  if (typeof self !== 'undefined') self.LuatNhan = LuatNhan;
  if (typeof global !== 'undefined') global.LuatNhan = LuatNhan;
  if (typeof globalThis !== 'undefined') globalThis.LuatNhan = LuatNhan;
  if (typeof module !== 'undefined' && module.exports) module.exports = LuatNhan;
})(typeof globalThis !== 'undefined' ? globalThis : this);
