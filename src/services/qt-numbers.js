(function (global) {
  'use strict';

  const DIGITS = { '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const UNITS = { '十': 10, '百': 100, '千': 1000, '万': 10000, '亿': 100000000 };
  const LATIN_TO_CHINESE = { 0: '零', 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九' };

  const chineseDigit = (ch) => (Object.prototype.hasOwnProperty.call(DIGITS, ch) ? DIGITS[ch] : null);
  const chineseUnit = (ch) => (Object.prototype.hasOwnProperty.call(UNITS, ch) ? UNITS[ch] : null);
  const isAsciiDigit = (ch) => ch >= '0' && ch <= '9' && ch.length === 1;
  const isChineseNumberChar = (ch) => chineseDigit(ch) !== null || chineseUnit(ch) !== null;
  const isNumberStart = (ch) => isAsciiDigit(ch) || isChineseNumberChar(ch);

  function safe(value) {
    return Number.isSafeInteger(value) ? value : null;
  }

  function findLongestNumber(text, start) {
    const chars = text;
    if (start >= chars.length) return null;
    let cursor = start;
    let matched = false;
    for (;;) {
      if (cursor < chars.length && isAsciiDigit(chars[cursor])) {
        matched = true;
        while (cursor < chars.length && isAsciiDigit(chars[cursor])) cursor++;
        if (cursor + 1 < chars.length && (chars[cursor] === '.' || chars[cursor] === ',') && isAsciiDigit(chars[cursor + 1])) {
          cursor++;
          while (cursor < chars.length && isAsciiDigit(chars[cursor])) cursor++;
        }
      } else if (cursor < chars.length && isChineseNumberChar(chars[cursor])) {
        matched = true;
        while (cursor < chars.length && isChineseNumberChar(chars[cursor])) cursor++;
      } else {
        break;
      }
      while (cursor < chars.length && (chars[cursor] === ' ' || chars[cursor] === '\t')) cursor++;
    }
    if (!matched) return null;

    let end = cursor;
    while (end > start && (chars[end - 1] === ' ' || chars[end - 1] === '\t')) end--;
    const matchedText = chars.slice(start, end);
    if (matchedText.length === 1 && '百千万亿'.includes(matchedText)) return null;

    const list = Array.from(matchedText);
    const hasLatin = list.some(isAsciiDigit);
    const hasChinese = list.some(isChineseNumberChar);
    const hasChineseValue = list.some((ch) => chineseDigit(ch) !== null);
    const normalized = hasLatin && hasChinese && hasChineseValue
      ? list.map((ch) => (isAsciiDigit(ch) ? LATIN_TO_CHINESE[ch] : (isChineseNumberChar(ch) ? ch : ''))).join('')
      : matchedText;
    return { start, length: end - start, text: normalized };
  }

  function prescanNumbers(text, isVietPhraseKey) {
    const has = typeof isVietPhraseKey === 'function' ? isVietPhraseKey : () => false;
    const numbers = new Map();
    let cursor = 0;
    while (cursor < text.length) {
      if (isNumberStart(text[cursor])) {
        const info = findLongestNumber(text, cursor);
        if (info && !has(info.text)) {
          numbers.set(info.start, info);
          cursor += info.length;
          continue;
        }
      }
      cursor++;
    }
    return numbers;
  }

  function numberModifier(text) {
    let out = '';
    let cursor = 0;
    while (cursor < text.length) {
      const ch = text[cursor];
      if ((ch === '余' || ch === '多') && cursor + 1 < text.length && '百千万亿'.includes(text[cursor + 1])) {
        out += text[cursor + 1] + ch;
        cursor += 2;
      } else {
        out += ch;
        cursor++;
      }
    }
    return out;
  }

  function convertUnderTenThousand(chars) {
    if (chars.length === 0) return 0;
    if (chars.length === 1 && chars[0] === '十') return 10;
    if (chars[0] === '十') {
      const rest = convertUnderTenThousand(chars.slice(1));
      return rest === null ? null : safe(10 + rest);
    }
    let total = 0;
    let digit = 0;
    for (const ch of chars) {
      const value = chineseDigit(ch);
      if (value !== null) {
        digit = value;
        continue;
      }
      const unit = chineseUnit(ch);
      if (unit !== null) {
        total = safe(total + (digit === 0 ? unit : digit * unit));
        if (total === null) return null;
        digit = 0;
      }
    }
    return safe(total + digit);
  }

  function parseMixedUnit(chars) {
    let cursor = 0;
    while (cursor < chars.length && isAsciiDigit(chars[cursor])) cursor++;
    if (cursor === 0) return null;
    const left = chars.slice(0, cursor).join('');
    while (cursor < chars.length && /\s/.test(chars[cursor])) cursor++;
    let unit;
    if (chars[cursor] === '万') unit = 10000;
    else if (chars[cursor] === '亿') unit = 100000000;
    else return null;
    cursor++;
    while (cursor < chars.length && /\s/.test(chars[cursor])) cursor++;
    if (cursor + 1 !== chars.length || !isAsciiDigit(chars[cursor])) return null;
    return safe(Number(left) * unit + Number(chars[cursor]) * (unit / 10));
  }

  function convertChineseNumber(input) {
    const text = String(input || '').trim();
    if (!text) return 0;
    if (/^[+-]?\d+$/.test(text)) return safe(Number(text));
    const chars = Array.from(text);
    const mixed = parseMixedUnit(chars);
    if (mixed !== null) return mixed;

    for (const [unitChar, unitValue, nextScale] of [['亿', 100000000, 10000000], ['万', 10000, 1000]]) {
      const index = chars.lastIndexOf(unitChar);
      if (index === -1) continue;
      const leading = index === 0 ? 1 : convertChineseNumber(chars.slice(0, index).join(''));
      if (leading === null) return null;
      const base = safe(leading * unitValue);
      if (base === null) return null;
      const trailing = chars.slice(index + 1);
      if (trailing.length === 1 && chineseDigit(trailing[0]) !== null) return safe(base + chineseDigit(trailing[0]) * nextScale);
      const rest = convertChineseNumber(trailing.join(''));
      return rest === null ? null : safe(base + rest);
    }

    if (chars.length >= 3 && !chars.some((ch) => chineseUnit(ch) !== null) && chars.every((ch) => chineseDigit(ch) !== null)) {
      return safe(Number(chars.map(chineseDigit).join('')));
    }
    return convertUnderTenThousand(chars);
  }

  function formatGrouped(number) {
    const raw = String(number);
    const sign = raw.startsWith('-') ? '-' : '';
    const digits = sign ? raw.slice(1) : raw;
    let out = sign;
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
      out += digits[i];
    }
    return out;
  }

  function numberToVietnameseText(value) {
    let number = value;
    if (number === 0) return '0';
    if (number >= -9999 && number <= 9999) return formatGrouped(number);
    const parts = [];
    const hundredMillions = Math.trunc(number / 100000000);
    if (hundredMillions > 0) {
      parts.push(`${numberToVietnameseText(hundredMillions)} ức`);
      number %= 100000000;
    }
    const tenThousands = Math.trunc(number / 10000);
    if (tenThousands > 0) {
      parts.push(`${formatGrouped(tenThousands)} vạn`);
      number %= 10000;
    }
    if (number > 0) parts.push(formatGrouped(number));
    return parts.join(' ');
  }

  function positiveChineseDigit(ch, allowLiang) {
    if (ch === '两' && allowLiang) return 2;
    return '一二三四五六七八九'.includes(ch) ? chineseDigit(ch) : null;
  }

  function tryConvertPostfixedRange(chars) {
    if (chars.length < 3) return null;
    const first = chineseDigit(chars[chars.length - 2]);
    const second = chineseDigit(chars[chars.length - 1]);
    if (first === null || second === null || first === 0) return null;
    const base = convertChineseNumber(chars.slice(0, -2).join(''));
    return base !== null && base > 0 && base % 10 === 0 ? `${base + first}-${base + second}` : null;
  }

  function tryConvertRange(chars) {
    const n = chars.length;
    if (n >= 4 && chars.slice(0, n - 3).every((ch) => '十百千'.includes(ch)) && '万亿'.includes(chars[n - 1])) {
      const first = positiveChineseDigit(chars[n - 3], false);
      const second = positiveChineseDigit(chars[n - 2], false);
      if (first === null || second === null || first >= second) return null;
      const base = convertChineseNumber(chars.slice(0, n - 3).join(''));
      if (base === null) return null;
      const multiplier = chars[n - 4] === '千' ? 100 : (chars[n - 4] === '百' ? 10 : 1);
      const unit = chineseUnit(chars[n - 1]);
      return `${numberToVietnameseText((base + first * multiplier) * unit)}-${numberToVietnameseText((base + second * multiplier) * unit)}`;
    }
    if (n === 4 && '十百千'.includes(chars[2]) && '万亿'.includes(chars[3])) {
      const first = positiveChineseDigit(chars[0], true);
      const second = positiveChineseDigit(chars[1], false);
      if (first === null || second === null || first >= second) return null;
      const smallUnit = chineseUnit(chars[2]);
      return `${first * smallUnit}-${second * smallUnit} ${chars[3] === '万' ? 'vạn' : 'ức'}`;
    }
    if (n === 3 && '十百千万亿'.includes(chars[2])) {
      const first = positiveChineseDigit(chars[0], true);
      const second = positiveChineseDigit(chars[1], false);
      if (first === null || second === null || first >= second) return null;
      if (chars[2] === '亿') return `${first}-${second} ức`;
      if (chars[2] === '万') return `${first}-${second} vạn`;
      if (chars[2] === '千') return `${first}-${second} ngàn`;
      const unit = chineseUnit(chars[2]);
      return `${first * unit}-${second * unit}`;
    }
    if (n >= 3 && '万亿'.includes(chars[n - 3])) {
      const first = positiveChineseDigit(chars[n - 2], false);
      const second = positiveChineseDigit(chars[n - 1], false);
      if (first === null || second === null || first >= second) return null;
      const base = convertChineseNumber(chars.slice(0, n - 2).join(''));
      if (base === null) return null;
      const multiplier = chars[n - 3] === '亿' ? 10000000 : 1000;
      return `${numberToVietnameseText(base + first * multiplier)}-${numberToVietnameseText(base + second * multiplier)}`;
    }
    return null;
  }

  function translateRangeNumber(text) {
    const chars = Array.from(text);
    return tryConvertRange(chars) || tryConvertPostfixedRange(chars);
  }

  function translateNumber(text) {
    const chars = Array.from(text);
    if (text.includes('.') || text.includes(',') || (chars.length > 1 && chars[0] === '0')) return text;
    const range = tryConvertRange(chars) || tryConvertPostfixedRange(chars);
    if (range) return range;
    if (chars.length === 2 && chineseDigit(chars[0]) !== null && chineseDigit(chars[1]) !== null) {
      return `${chineseDigit(chars[0])}-${chineseDigit(chars[1])}`;
    }
    const value = convertChineseNumber(text);
    return value === null ? null : numberToVietnameseText(value);
  }

  const QtNumbers = {
    chineseDigit,
    isNumberStart,
    findLongestNumber,
    prescanNumbers,
    numberModifier,
    convertChineseNumber,
    numberToVietnameseText,
    translateRangeNumber,
    translateNumber
  };

  if (typeof window !== 'undefined') window.QtNumbers = QtNumbers;
  if (typeof self !== 'undefined') self.QtNumbers = QtNumbers;
  if (typeof global !== 'undefined') global.QtNumbers = QtNumbers;
  if (typeof globalThis !== 'undefined') globalThis.QtNumbers = QtNumbers;
  if (typeof module !== 'undefined' && module.exports) module.exports = QtNumbers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
