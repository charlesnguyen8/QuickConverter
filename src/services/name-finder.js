(function (global) {
  'use strict';

  const MIN_LENGTH = 2;
  const MAX_LENGTH = 8;
  const HIGH_FREQUENCY_OCCURRENCES = 5;
  const BOOK_TITLE_SCORE = 0.9;
  const PERSON_SUFFIXES = ['先生', '小姐', '姑娘', '公子', '少爷', '夫人', '长老', '师父', '师傅', '师兄', '师姐', '师弟', '师妹', '大人', '真人', '道长', '掌门', '宗主', '教主', '老祖', '陛下', '殿下', '王爷', '将军', '队长', '院长', '主任', '老师', '同学'];
  const LOCATION_SUFFIXES = ['国', '州', '郡', '省', '市', '县', '镇', '乡', '村', '城', '山', '峰', '谷', '岛', '海', '湖', '河', '江', '域', '界', '宫', '殿', '楼', '阁', '宗', '门', '派', '寺', '观', '院', '府', '庄', '寨', '森林', '沙漠', '大陆', '广场', '学院'];
  const ORGANIZATION_SUFFIXES = ['宗', '门', '派', '教', '帮', '盟', '会', '阁', '殿', '宫', '院', '学院', '公司', '集团', '协会', '军', '队', '局', '部', '家族', '一族', '王朝', '帝国'];
  const NAME_TRIGGERS = ['名为', '名字叫', '叫做', '叫', '姓', '名叫', '自称', '号称', '称为', '乃是'];
  const STOPWORDS = ['她', '着', '的', '你', '我', '了', '他', '什么', '也', '什', '们', '在', '您', '那', '这', '这个', '不过', '尔', '啊', '吧', '一边', '没', '哪个', '就是', '有些', '很', '非常', '还是', '再有', '发现', '数', '十几'];
  const NUMBER_CHARS = '零一二三四五六七八九十百千万亿两〇';

  const isMap = (m) => !!m && typeof m.get === 'function' && typeof m.has === 'function';
  const isNumberChar = (ch) => NUMBER_CHARS.includes(ch);
  const containsStopword = (text) => STOPWORDS.some((word) => text.includes(word));
  const isNumberSequence = (text) => Array.from(text).length >= 3 && Array.from(text).every(isNumberChar);
  const firstMeaning = (value) => String(value || '').split(/[/|]/)[0];

  function hasNumberRun(text) {
    let run = 0;
    for (const ch of text) {
      run = isNumberChar(ch) ? run + 1 : 0;
      if (run >= 2) return true;
    }
    return false;
  }

  function prefixes(value) {
    const chars = Array.from(value);
    const out = [];
    for (let length = Math.min(2, chars.length - 1); length >= 1; length--) out.push(chars.slice(0, length).join(''));
    return out;
  }

  function suffixes(value) {
    const chars = Array.from(value);
    const out = [];
    for (let length = Math.min(3, chars.length); length >= 1; length--) out.push(chars.slice(chars.length - length).join(''));
    return out;
  }

  function titleWords(value) {
    return String(value || '').split(/\s+/).filter(Boolean).map((word) => {
      const chars = Array.from(word);
      return chars[0].toUpperCase() + chars.slice(1).join('');
    }).join(' ');
  }

  function isTitleCase(value) {
    if (!String(value || '').trim()) return false;
    return String(value).split(/\s+/).filter(Boolean).every((word) => {
      const first = Array.from(word).find((ch) => /\p{L}/u.test(ch));
      return !first || first === first.toUpperCase();
    });
  }

  function titleCaseHanViet(text, hanViet) {
    return Array.from(text)
      .map((ch) => (hanViet.has(ch) ? titleWords(hanViet.get(ch)) : ch))
      .join(' ')
      .split(/\s+/)
      .filter(Boolean)
      .join(' ');
  }

  function endsWithAnyKey(text, keys) {
    for (const key of keys.keys()) if (key !== text && text.endsWith(key)) return true;
    return false;
  }

  function titleCaseWithDanhTu(candidate, danhTu, vietPhrase, hanViet) {
    if (danhTu.has(candidate)) return String(danhTu.get(candidate)).replace('{0}', '').trim();
    const keys = [...danhTu.keys()].sort((a, b) => (Array.from(b).length - Array.from(a).length) || (a < b ? -1 : (a > b ? 1 : 0)));
    for (const key of keys) {
      if (!key || !candidate.endsWith(key)) continue;
      const template = String(danhTu.get(key));
      const prefix = candidate.slice(0, candidate.length - key.length).trim();
      let translated;
      if (Array.from(prefix).length <= 2) translated = titleCaseHanViet(prefix, hanViet);
      else if (vietPhrase.has(prefix)) {
        const value = firstMeaning(vietPhrase.get(prefix));
        translated = isTitleCase(value) ? value : titleWords(value);
      } else translated = titleCaseHanViet(prefix, hanViet);
      return template.includes('{0}') ? template.replace('{0}', translated).trim() : `${translated} ${template}`.trim();
    }
    return titleWords(candidate);
  }

  function suggestedName(text, deps, preferHanViet) {
    const { vietPhrase, hanViet, danhTu } = deps;
    if (Array.from(text).length > 2 && endsWithAnyKey(text, danhTu)) return titleCaseWithDanhTu(text, danhTu, vietPhrase, hanViet);
    if (!preferHanViet && vietPhrase.has(text)) return titleWords(firstMeaning(vietPhrase.get(text)));
    return titleCaseHanViet(text, hanViet);
  }

  function formattedTitleValue(text, deps) {
    const { vietPhrase, hanViet, danhTu } = deps;
    if (Array.from(text).length > 2 && endsWithAnyKey(text, danhTu)) return titleCaseWithDanhTu(text, danhTu, vietPhrase, hanViet);
    if (vietPhrase.has(text)) {
      const value = firstMeaning(vietPhrase.get(text)).trim();
      if (value) return value;
    }
    return titleCaseHanViet(text, hanViet);
  }

  function surnameProperRemainder(candidate, hoNguoi, vietPhrase) {
    return prefixes(candidate).some((prefix) => {
      if (!hoNguoi.has(prefix)) return false;
      const remainder = candidate.slice(prefix.length);
      return !!remainder && vietPhrase.has(remainder) && isTitleCase(firstMeaning(vietPhrase.get(remainder)));
    });
  }

  function candidateFacts(text, candidate, starts, deps) {
    const ranges = starts.map((start) => ({ start, length: candidate.length }));
    const hasSurname = prefixes(candidate).some((prefix) => deps.hoNguoi.has(prefix));
    const hasTrigger = starts.some((start) => {
      const before = Array.from(text.slice(0, start)).slice(-5).join('');
      return NAME_TRIGGERS.some((trigger) => before.endsWith(trigger));
    });
    const personSuffix = PERSON_SUFFIXES.some((suffix) => candidate.endsWith(suffix));
    const locationSuffix = LOCATION_SUFFIXES.some((suffix) => candidate.endsWith(suffix));
    const organizationSuffix = ORGANIZATION_SUFFIXES.some((suffix) => candidate.endsWith(suffix));
    const dictionarySuffix = suffixes(candidate).some((suffix) => deps.danhTu.has(suffix) || deps.hauTu.has(suffix));
    let entityType = 'unknown';
    if (personSuffix || hasSurname) entityType = 'person';
    else if (organizationSuffix) entityType = 'organization';
    else if (locationSuffix) entityType = 'location';
    else if (dictionarySuffix) entityType = 'title';
    return {
      ranges,
      hasTrigger,
      hasSurname,
      entityType,
      hasSuffix: personSuffix || locationSuffix || organizationSuffix || dictionarySuffix
    };
  }

  function hybridScore(occurrences, fromJieba, facts, known, jiebaCommon, properRemainder) {
    if (known) return 1;
    let score = 0.18 + Math.min(occurrences, 4) * 0.07;
    if (fromJieba) score += 0.12;
    if (facts.hasTrigger) score += 0.3;
    if (facts.hasSurname) score += 0.3;
    if (facts.hasSuffix) score += 0.2;
    if (properRemainder) score += 0.25;
    if (jiebaCommon) score -= 0.12;
    else if (fromJieba) score += 0.1;
    return Math.max(0, Math.min(0.99, score));
  }

  function pruneWeakerNested(candidates) {
    const strengths = new Map(candidates.map((c) => [c.text, c]));
    return candidates.filter((candidate) => {
      const chars = Array.from(candidate.text);
      for (let length = 2; length < chars.length; length++) {
        const nested = [chars.slice(0, length).join(''), chars.slice(chars.length - length).join('')];
        if (nested.some((part) => {
          const other = strengths.get(part);
          return other && other.occurrences >= candidate.occurrences && other.score >= candidate.score + 0.15;
        })) return false;
      }
      return true;
    });
  }

  function dropFragmentsInsideStrongerNames(candidates, text, known) {
    const spans = [];
    for (const name of known.keys()) occurrencesOf(text, name).forEach((start) => spans.push({ text: name, start, end: start + name.length, score: 1 }));
    candidates.forEach((c) => c.ranges.forEach((r) => spans.push({ text: c.text, start: r.start, end: r.start + r.length, score: c.score })));
    return candidates.filter((candidate) => !candidate.ranges.every((range) => spans.some((span) => span.text !== candidate.text
      && span.score >= candidate.score
      && span.start < range.start
      && range.start < span.end)));
  }

  function bookTitles(text) {
    const titles = [];
    const re = /《([^《》]*?)》/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (/[\r\n]/.test(match[1])) continue;
      if (!titles.includes(match[0])) titles.push(match[0]);
    }
    return titles;
  }

  function occurrencesOf(text, needle) {
    const starts = [];
    if (!needle) return starts;
    let from = 0;
    let at;
    while ((at = text.indexOf(needle, from)) !== -1) {
      starts.push(at);
      from = at + needle.length;
    }
    return starts;
  }

  function find(input, dependencies, options) {
    const text = String(input || '');
    const opts = {
      minOccurrences: 2,
      minScore: 0.6,
      maxCandidates: 200,
      maxNameLength: MAX_LENGTH,
      includeKnown: true,
      ...(options || {})
    };
    const deps = {
      jieba: dependencies.jieba,
      hanViet: isMap(dependencies.hanViet) ? dependencies.hanViet : new Map(),
      vietPhrase: isMap(dependencies.vietPhrase) ? dependencies.vietPhrase : new Map(),
      names: dependencies.names && typeof dependencies.names.has === 'function' ? dependencies.names : new Set(),
      hoNguoi: isMap(dependencies.hoNguoi) ? dependencies.hoNguoi : new Map(),
      hauTu: isMap(dependencies.hauTu) ? dependencies.hauTu : new Map(),
      danhTu: isMap(dependencies.danhTu) ? dependencies.danhTu : new Map(),
      known: isMap(dependencies.known) ? dependencies.known : new Map(),
      rejected: dependencies.rejected && typeof dependencies.rejected.has === 'function' ? dependencies.rejected : new Set()
    };
    const maxLength = Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, opts.maxNameLength));
    const isChinese = (ch) => deps.hanViet.has(ch);
    const seeds = new Map();
    const seed = (word) => {
      if (!seeds.has(word)) seeds.set(word, { fromJieba: false, fromNgram: false, starts: [] });
      return seeds.get(word);
    };

    if (deps.jieba) {
      deps.jieba.cut(text).forEach((token) => {
        const chars = Array.from(token.word);
        if (chars.length >= MIN_LENGTH && chars.length <= maxLength && chars.every(isChinese)) {
          const s = seed(token.word);
          s.fromJieba = true;
          s.starts.push(token.start);
        }
      });
    }

    const chars = [];
    let offset = 0;
    for (const ch of text) {
      chars.push({ ch, start: offset });
      offset += ch.length;
    }
    let runStart = 0;
    while (runStart < chars.length) {
      if (!isChinese(chars[runStart].ch)) { runStart++; continue; }
      let runEnd = runStart + 1;
      while (runEnd < chars.length && isChinese(chars[runEnd].ch)) runEnd++;
      for (let start = runStart; start < runEnd; start++) {
        for (let length = MIN_LENGTH; length <= Math.min(maxLength, runEnd - start); length++) {
          const end = start + length;
          const byteEnd = end < chars.length ? chars[end].start : text.length;
          const s = seed(text.slice(chars[start].start, byteEnd));
          s.fromNgram = true;
          s.starts.push(chars[start].start);
        }
      }
      runStart = runEnd;
    }
    for (const knownName of deps.known.keys()) occurrencesOf(text, knownName).forEach((start) => seed(knownName).starts.push(start));

    let candidates = [];
    for (const [candidate, s] of seeds) {
      const knownValue = deps.known.get(candidate);
      const isKnown = knownValue !== undefined;
      if (deps.rejected.has(candidate) || (!isKnown && deps.names.has(candidate))) continue;
      const starts = [...new Set(s.starts)].sort((a, b) => a - b);
      const facts = candidateFacts(text, candidate, starts, deps);
      const occurrences = facts.ranges.length;
      if (occurrences === 0) continue;
      if (isKnown && !opts.includeKnown) continue;
      const exactVietPhrase = deps.vietPhrase.has(candidate);
      const jiebaCommon = !!(deps.jieba && deps.jieba.hasWord(candidate));
      const properRemainder = facts.hasSurname && surnameProperRemainder(candidate, deps.hoNguoi, deps.vietPhrase);
      if (!isKnown) {
        if (containsStopword(candidate) || isNumberSequence(candidate) || hasNumberRun(candidate)) continue;
        if (exactVietPhrase && !facts.hasTrigger && !(facts.hasSurname && (!jiebaCommon || occurrences >= HIGH_FREQUENCY_OCCURRENCES))) continue;
        if (!facts.hasTrigger && !facts.hasSuffix && !s.fromJieba) {
          const compoundSurname = Array.from(candidate).length > 2 && deps.hoNguoi.has(Array.from(candidate).slice(0, 2).join(''));
          if (!compoundSurname && !properRemainder && occurrences < 3) continue;
        }
      }
      const reasons = [];
      if (s.fromJieba) reasons.push('jieba');
      if (facts.hasTrigger) reasons.push('trigger');
      if (facts.hasSurname) reasons.push('surname');
      if (facts.hasSuffix) reasons.push('suffix');
      if (isKnown) reasons.push('known');
      const score = hybridScore(occurrences, s.fromJieba, facts, isKnown, jiebaCommon, properRemainder);
      const passes = isKnown || (score >= opts.minScore && (occurrences >= opts.minOccurrences || facts.hasTrigger || facts.hasSurname || facts.hasSuffix));
      if (!passes) continue;
      const suggested = isKnown ? knownValue : suggestedName(candidate, deps, facts.hasSurname || facts.hasTrigger);
      if (!isKnown && !suggested.includes(' ')) continue;
      candidates.push({ text: candidate, suggested, entityType: facts.entityType, score, occurrences, ranges: facts.ranges, reasons, known: isKnown });
    }

    candidates = dropFragmentsInsideStrongerNames(pruneWeakerNested(candidates), text, deps.known);
    for (const title of bookTitles(text)) {
      if (candidates.some((c) => c.text === title) || deps.rejected.has(title)) continue;
      const starts = occurrencesOf(text, title);
      if (starts.length === 0) continue;
      const knownValue = deps.known.get(title);
      const isKnown = knownValue !== undefined;
      if (isKnown && !opts.includeKnown) continue;
      candidates.push({
        text: title,
        suggested: isKnown ? knownValue : formattedTitleValue(title, deps),
        entityType: 'title',
        score: isKnown ? 1 : BOOK_TITLE_SCORE,
        occurrences: starts.length,
        ranges: starts.map((start) => ({ start, length: title.length })),
        reasons: ['book-title'],
        known: isKnown
      });
    }
    candidates.sort((a, b) => (Number(b.known) - Number(a.known))
      || (b.score - a.score)
      || (b.occurrences - a.occurrences)
      || ((a.ranges[0] ? a.ranges[0].start : 0) - (b.ranges[0] ? b.ranges[0].start : 0)));
    return candidates.slice(0, Math.max(1, Math.min(1000, opts.maxCandidates)));
  }

  const NameFinder = { find };

  if (typeof window !== 'undefined') window.NameFinder = NameFinder;
  if (typeof self !== 'undefined') self.NameFinder = NameFinder;
  if (typeof global !== 'undefined') global.NameFinder = NameFinder;
  if (typeof globalThis !== 'undefined') globalThis.NameFinder = NameFinder;
  if (typeof module !== 'undefined' && module.exports) module.exports = NameFinder;
})(typeof globalThis !== 'undefined' ? globalThis : this);
