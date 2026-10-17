(function (global) {
  'use strict';

  function resolveMatcher() {
    const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    return scope && scope.LongestMatcher && typeof scope.LongestMatcher.createMatcher === 'function' ? scope.LongestMatcher : null;
  }

  function cleanPair(entry, allowEmpty = false) {
    const original = entry && entry.original ? String(entry.original).trim() : '';
    const translation = entry && entry.translation ? String(entry.translation).trim() : '';
    return original && (translation || allowEmpty) ? { original, translation } : null;
  }

  function nameEntries(names, tier, allowEmpty = false) {
    const out = [];
    const seen = new Set();
    (Array.isArray(names) ? names : []).forEach((entry, i) => {
      const pair = cleanPair(entry, allowEmpty);
      if (!pair || seen.has(pair.original)) return;
      seen.add(pair.original);
      out.push({ id: 'name:' + ((entry && entry.id) || 'idx_' + i), ...pair, kind: 'name', tier, caseSensitive: true });
    });
    return out;
  }

  function lockedEntries(entries, tier, kind = 'locked', allowEmpty = false) {
    const out = [];
    const seen = new Set();
    (Array.isArray(entries) ? entries : []).forEach((entry, i) => {
      const pair = cleanPair(entry, allowEmpty);
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
    '‘': "'", '’': "' ", '？': '?', '！': '!', '、': ', ', '\u3000': ' ', '…': '...', '\0': '', ' ': ' '
  };
  const SENTENCE_ENDERS = ['\n', '\t', '. ', '"', "'", '? ', '! ', '." ', '?" ', '!" ', ': '];
  const HTML_ENTITIES = new Map((
    'nbsp=A0 iexcl=A1 cent=A2 pound=A3 curren=A4 yen=A5 brvbar=A6 sect=A7 uml=A8 copy=A9 ordf=AA ' +
    'laquo=AB not=AC shy=AD reg=AE macr=AF deg=B0 plusmn=B1 sup2=B2 sup3=B3 acute=B4 micro=B5 para=B6 ' +
    'middot=B7 cedil=B8 sup1=B9 ordm=BA raquo=BB frac14=BC frac12=BD frac34=BE iquest=BF Agrave=C0 ' +
    'Aacute=C1 Acirc=C2 Atilde=C3 Auml=C4 Aring=C5 AElig=C6 Ccedil=C7 Egrave=C8 Eacute=C9 Ecirc=CA ' +
    'Euml=CB Igrave=CC Iacute=CD Icirc=CE Iuml=CF ETH=D0 Ntilde=D1 Ograve=D2 Oacute=D3 Ocirc=D4 ' +
    'Otilde=D5 Ouml=D6 times=D7 Oslash=D8 Ugrave=D9 Uacute=DA Ucirc=DB Uuml=DC Yacute=DD THORN=DE ' +
    'szlig=DF agrave=E0 aacute=E1 acirc=E2 atilde=E3 auml=E4 aring=E5 aelig=E6 ccedil=E7 egrave=E8 ' +
    'eacute=E9 ecirc=EA euml=EB igrave=EC iacute=ED icirc=EE iuml=EF eth=F0 ntilde=F1 ograve=F2 ' +
    'oacute=F3 ocirc=F4 otilde=F5 ouml=F6 divide=F7 oslash=F8 ugrave=F9 uacute=FA ucirc=FB uuml=FC ' +
    'yacute=FD thorn=FE yuml=FF Alpha=391 Beta=392 Gamma=393 Delta=394 Epsilon=395 Zeta=396 Eta=397 ' +
    'Theta=398 Iota=399 Kappa=39A Lambda=39B Mu=39C Nu=39D Xi=39E Omicron=39F Pi=3A0 Rho=3A1 ' +
    'Sigma=3A3 Tau=3A4 Upsilon=3A5 Phi=3A6 Chi=3A7 Psi=3A8 Omega=3A9 alpha=3B1 beta=3B2 gamma=3B3 ' +
    'delta=3B4 epsilon=3B5 zeta=3B6 eta=3B7 theta=3B8 iota=3B9 kappa=3BA lambda=3BB mu=3BC nu=3BD ' +
    'xi=3BE omicron=3BF pi=3C0 rho=3C1 sigmaf=3C2 sigma=3C3 tau=3C4 upsilon=3C5 phi=3C6 chi=3C7 ' +
    'psi=3C8 omega=3C9 quot=22 amp=26 apos=27 lt=3C gt=3E OElig=152 oelig=153 Scaron=160 scaron=161 ' +
    'Yuml=178 fnof=192 circ=2C6 tilde=2DC thetasym=3D1 upsih=3D2 piv=3D6 ensp=2002 emsp=2003 ' +
    'thinsp=2009 zwnj=200C zwj=200D lrm=200E rlm=200F ndash=2013 mdash=2014 lsquo=2018 rsquo=2019 ' +
    'sbquo=201A ldquo=201C rdquo=201D bdquo=201E dagger=2020 Dagger=2021 bull=2022 hellip=2026 ' +
    'permil=2030 prime=2032 Prime=2033 lsaquo=2039 rsaquo=203A oline=203E frasl=2044 euro=20AC ' +
    'image=2111 weierp=2118 real=211C trade=2122 alefsym=2135 larr=2190 uarr=2191 rarr=2192 darr=2193 ' +
    'harr=2194 crarr=21B5 lArr=21D0 uArr=21D1 rArr=21D2 dArr=21D3 hArr=21D4 forall=2200 part=2202 ' +
    'exist=2203 empty=2205 nabla=2207 isin=2208 notin=2209 ni=220B prod=220F sum=2211 minus=2212 ' +
    'lowast=2217 radic=221A prop=221D infin=221E ang=2220 and=2227 or=2228 cap=2229 cup=222A int=222B ' +
    'there4=2234 sim=223C cong=2245 asymp=2248 ne=2260 equiv=2261 le=2264 ge=2265 sub=2282 sup=2283 ' +
    'nsub=2284 sube=2286 supe=2287 oplus=2295 otimes=2297 perp=22A5 sdot=22C5 lceil=2308 rceil=2309 ' +
    'lfloor=230A rfloor=230B lang=2329 rang=232A loz=25CA spades=2660 clubs=2663 hearts=2665 ' +
    'diams=2666'
  ).split(' ').map((pair) => {
    const cut = pair.indexOf('=');
    return [pair.slice(0, cut), String.fromCodePoint(parseInt(pair.slice(cut + 1), 16))];
  }));
  const NO_SPACE_AFTER_CHINESE = new Set([',', '.', ':', ';', '"', "'", '?', ' ', '!', ')', '\n']);

  function codePointChar(value) {
    return Number.isInteger(value) && value <= 0x10FFFF && (value < 0xD800 || value > 0xDFFF) ? String.fromCodePoint(value) : null;
  }

  // .NET WebUtility.HtmlDecode, which QT2025 calls: numeric references and the HTML 4
  // named entities (plus &apos;); anything else between & and ; is left untouched.
  function decodeEntities(text) {
    if (text.indexOf('&') === -1) return text;
    return text.replace(/&([^;&]*);/g, (match, body) => {
      let decoded = null;
      if (/^#[xX][0-9A-Fa-f]+$/.test(body)) decoded = codePointChar(parseInt(body.slice(2), 16));
      else if (/^#[0-9]+$/.test(body)) decoded = codePointChar(parseInt(body.slice(1), 10));
      else if (HTML_ENTITIES.has(body)) decoded = HTML_ENTITIES.get(body);
      return decoded === null ? match : decoded;
    });
  }

  // QT2025's StandardizeInput spacing: Chinese is set apart from the Latin text, digits
  // and brackets around it, control characters are dropped and sentence marks get a
  // following space. The last character is kept as is, like QT.
  function insertQtSpacing(text, isChinese) {
    const chars = Array.from(text);
    if (chars.length <= 1) return text;
    const digit = (ch) => /\p{Nd}/u.test(ch);
    let out = '';
    for (let i = 0; i < chars.length - 1; i++) {
      const ch = chars[i];
      const next = chars[i + 1];
      if (/\p{Cc}/u.test(ch) && ch !== '\t' && ch !== '\n' && ch !== '\r') continue;
      if (digit(ch) && next === '》') {
        out += ch + ' ';
      } else if (ch === '.' && i > 0 && digit(chars[i - 1]) && digit(next)) {
        out += ch;
      } else if (isChinese(ch)) {
        out += ch;
        if (!isChinese(next) && !NO_SPACE_AFTER_CHINESE.has(next)) out += ' ';
      } else if ('\t\n "\'('.includes(ch)) {
        out += ch;
      } else if (ch === '!' || ch === '.' || ch === '?') {
        out += ch;
        if (next !== '"' && next !== ' ' && next !== "'") out += ' ';
      } else {
        out += ch;
        if (isChinese(next)) out += ' ';
      }
    }
    return (out + chars[chars.length - 1]).split('. . . . . .').join('...');
  }

  function createStandardizer(hanViet, simplified) {
    const isChinese = (ch) => !!ch && hanViet.has(ch);
    const simplify = simplified
      ? (text) => Array.from(text).map((ch) => (simplified.has(ch) ? simplified.get(ch) : ch)).join('')
      : (text) => text;
    const standardize = (line) => {
      let out = '';
      for (const ch of decodeEntities(simplify(line))) {
        if (PUNCTUATION[ch] !== undefined) {
          out += PUNCTUATION[ch];
          continue;
        }
        const code = ch.codePointAt(0);
        out += code >= 0xFF01 && code <= 0xFF5E ? String.fromCodePoint(code - 0xFEE0) : ch;
      }
      return insertQtSpacing(out.replace(/[ \t]+/g, ' ').replace(/ ,/g, ','), isChinese).replace(/ {2,}/g, ' ').trim();
    };
    return { standardize, simplify };
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

  function ignoredPatterns(phrases, standardize) {
    return (Array.isArray(phrases) ? phrases : [])
      .map((phrase) => Array.from(standardize(String(phrase || ''))).filter((ch) => !/\s/.test(ch)))
      .filter((chars) => chars.length > 0)
      .map((chars) => new RegExp(chars.map(escapeRegExp).join('\\s*'), 'g'));
  }

  function originOf(id) {
    const text = String(id || '');
    const cut = text.indexOf(':');
    return cut === -1 ? text : text.slice(0, cut);
  }

  function resolveGlobal(name) {
    const scope = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self);
    return scope && scope[name] ? scope[name] : null;
  }

  const RULE_WINDOW = 30;

  function convertLine(line, context, segments, layout) {
    const { matcher, hanViet, ignored, rules, numbers, vietPhraseHas, minUserTier, nameTier, standardize } = context;
    let source = standardize(line);
    if (ignored.length > 0) {
      ignored.forEach((pattern) => { source = source.replace(pattern, ''); });
      source = source.replace(/ {2,}/g, ' ').trim();
    }
    if (!source) return '';
    const record = Array.isArray(segments) ? segments : null;
    const numberAt = numbers ? numbers.prescanNumbers(source, vietPhraseHas) : new Map();
    if (numbers) source = numbers.numberModifier(source);
    if (layout) {
      layout.source = source;
      layout.hidden = [];
    }
    let pendingRule = null;
    let ruleScannedUntil = -1;

    const ruleAt = (i) => {
      if (!rules) return null;
      if (pendingRule && pendingRule.index < i) pendingRule = null;
      if (!pendingRule && i > ruleScannedUntil) {
        const window = source.slice(i, i + RULE_WINDOW);
        const found = window.length > 2 ? rules.contains(window) : null;
        if (found) pendingRule = { ...found, index: i + found.index };
        else ruleScannedUntil = i + window.length - 1;
      }
      if (!pendingRule || pendingRule.index !== i) return null;
      const rule = pendingRule;
      pendingRule = null;
      if (!rule.key.includes('{n}') && matcher && matcher.hasTierInside(source, i, i + rule.length, nameTier)) return null;
      const chinese = source.slice(i, i + rule.length);
      const translation = rules.translate(chinese, rule.key, rule.valueN);
      return translation ? { length: rule.length, chinese, translation: translation.trim() } : null;
    };

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

    const appendPhrase = (i, length, translation, origin) => {
      const matched = source.slice(i, i + length);
      appendWord(translation, record ? { source: matched, sourceStart: i, sourceEnd: i + length, reading: readingOf(matched), translation, origin } : null);
      if (isChinese(charAt(i + length))) appendChar(' ');
      return i + length;
    };

    let i = 0;
    while (i < source.length) {
      const number = numberAt.get(i);
      let match = matcher ? matcher.matchAt(source, i) : null;
      if (match && number && match.length < number.length) match = null;
      const userMatch = match && match.tier >= minUserTier;
      const rule = userMatch ? null : ruleAt(i);
      if (rule) {
        i = appendPhrase(i, rule.length, rule.translation, 'luatNhan');
        continue;
      }
      if (!match && number) {
        const translated = numbers.translateNumber(number.text);
        if (translated) {
          i = appendPhrase(i, number.length, translated, 'number');
          continue;
        }
      }
      if (match && !String(match.translation || '').trim()) {
        if (layout) layout.hidden.push([i, i + match.length]);
        i += match.length;
        continue;
      }
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
    const dicts = options.dictionaries || {};
    const isMap = (m) => !!m && typeof m.get === 'function' && typeof m.has === 'function';
    const { standardize, simplify } = createStandardizer(hanViet, isMap(dicts.traditional) ? dicts.traditional : null);
    const simplified = (list) => (Array.isArray(list)
      ? list.map((entry) => (entry && entry.original ? { ...entry, original: simplify(String(entry.original)) } : entry))
      : list);
    const names = simplified(options.names);
    const entries = [
      ...nameEntries(names, tiers.namelist, true),
      ...lockedEntries(simplified(options.locked), tiers.locked, 'locked', true),
      ...lockedEntries(simplified(options.soft), tiers.soft, 'soft', true)
    ];
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
    const ignored = ignoredPatterns(options.ignoredPhrases, standardize);
    const numbers = resolveGlobal('QtNumbers');
    const ruleEngine = resolveGlobal('LuatNhan');
    const vietPhraseHas = (key) => isMap(dicts.vietPhrase) && dicts.vietPhrase.has(key);
    let rules = null;
    const hoHau = isMap(dicts.hoNguoi) && isMap(dicts.hauTu);
    if (ruleEngine && ((Array.isArray(options.luatNhan) && options.luatNhan.length > 0) || hoHau)) {
      const pronouns = isMap(dicts.pronouns) ? dicts.pronouns : new Map();
      const userNames = new Map(nameEntries(names, tiers.namelist).map((entry) => [entry.original, entry.translation]));
      const qtNames = isMap(dicts.qtNames) ? dicts.qtNames : new Map();
      const dictionaryN = {
        get: (key) => {
          if (pronouns.has(key)) return pronouns.get(key);
          if (userNames.has(key)) return userNames.get(key);
          if (qtNames.has(key)) return qtNames.get(key);
          return undefined;
        }
      };
      const fullVietPhraseHas = (key) => vietPhraseHas(key) || qtNames.has(key) || userNames.has(key);
      rules = ruleEngine.createRules(Array.isArray(options.luatNhan) ? options.luatNhan : [], {
        dictionaryN,
        vietPhraseHas,
        fullVietPhraseHas,
        hoNguoi: hoHau ? dicts.hoNguoi : null,
        hauTu: hoHau ? dicts.hauTu : null
      });
    }
    const context = { matcher, hanViet, ignored, rules, numbers, vietPhraseHas, minUserTier: tiers.soft, nameTier: tiers.qtNames, standardize };
    return {
      convert(text) {
        return String(text || '').split('\n').map((line) => convertLine(line, context)).join('\n');
      },
      convertDetailed(text) {
        return String(text || '').split('\n').map((line) => {
          const segments = [];
          const layout = { source: '', hidden: [] };
          const converted = convertLine(line, context, segments, layout);
          return { text: converted, segments: segments.filter((seg) => seg.end > seg.start), source: layout.source, hidden: layout.hidden };
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
