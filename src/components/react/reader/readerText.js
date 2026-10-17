export function chapterSourceText(chapter) {
  if (!chapter) return '';
  return chapter.originalRawText || chapter.rawText || '';
}

export function chapterDisplayText(chapter, { conversionMode = false, convert = null } = {}) {
  if (!chapter) return '';
  if (conversionMode && typeof convert === 'function') return convert(chapterSourceText(chapter));
  return chapter.convertedText || chapter.rawText || '';
}

export async function buildReaderConverter(novel, services, { onError } = {}) {
  const { storage, hanViet, dictionaries, processors } = services;
  const report = (err) => {
    if (typeof onError === 'function') onError(err);
    return undefined;
  };
  const safe = (promise) => Promise.resolve(promise).catch(report);
  const [hanVietMap, locked, soft, vietPhrase, qtNames, pronouns, ignoredPhrases, luatNhan, hoNguoi, hauTu, traditional] = await Promise.all([
    safe(hanViet.load()),
    safe(storage.getNameList(novel.id, 'locked')),
    safe(storage.getNameList(novel.id, 'soft')),
    safe(dictionaries.load('vietPhrase')),
    safe(dictionaries.load('qtNames')),
    safe(dictionaries.load('pronouns')),
    safe(dictionaries.load('ignoredPhrases')),
    safe(dictionaries.load('luatNhan')),
    safe(dictionaries.load('hoNguoi')),
    safe(dictionaries.load('hauTu')),
    safe(dictionaries.load('traditional'))
  ]);
  const loaded = {};
  if (vietPhrase) loaded.vietPhrase = vietPhrase;
  if (qtNames) loaded.qtNames = qtNames;
  if (pronouns) loaded.pronouns = pronouns;
  if (hoNguoi) loaded.hoNguoi = hoNguoi;
  if (hauTu) loaded.hauTu = hauTu;
  if (traditional) loaded.traditional = traditional;
  const converter = processors.createConverter({
    hanViet: hanVietMap || new Map(),
    names: Array.isArray(novel.nameList) ? novel.nameList : [],
    locked: locked || [],
    soft: soft || [],
    dictionaries: loaded,
    ignoredPhrases: ignoredPhrases || [],
    luatNhan: Array.isArray(luatNhan) ? luatNhan : []
  });
  const meaningsOf = (key) => {
    const out = [];
    [pronouns, vietPhrase, qtNames].forEach((map) => {
      if (!map || typeof map.has !== 'function' || !map.has(key)) return;
      const found = typeof map.meanings === 'function' ? map.meanings(key) : [map.get(key)];
      found.forEach((meaning) => { if (meaning && !out.includes(meaning)) out.push(meaning); });
    });
    return out;
  };
  const readingOf = (text) => Array.from(String(text || '')).map((ch) => (hanVietMap && hanVietMap.has(ch) ? hanVietMap.get(ch) : ch)).join(' ');
  return { ...converter, meaningsOf, readingOf };
}

export function paragraphsFromLines(lines) {
  const paragraphs = [];
  let current = null;
  (Array.isArray(lines) ? lines : []).forEach((line, lineIndex) => {
    const text = line && line.text ? line.text : '';
    if (!text.trim()) {
      current = null;
      return;
    }
    if (!current) {
      current = { text: '', segments: [] };
      paragraphs.push(current);
    } else {
      current.text += '\n';
    }
    const offset = current.text.length;
    current.text += text;
    (line.segments || []).forEach((seg) => {
      current.segments.push({ ...seg, start: seg.start + offset, end: seg.end + offset, line: lineIndex });
    });
  });
  return paragraphs.filter((p) => p.text.trim() !== '&nbsp;');
}

export function phraseOptions(segment, meaningsOf) {
  const out = [];
  const add = (value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text && !out.includes(text)) out.push(text);
  };
  if (!segment) return out;
  add(segment.translation);
  if (typeof meaningsOf === 'function') (meaningsOf(segment.source) || []).forEach(add);
  add(segment.reading);
  if (segment.origin === 'selection') {
    add(String(segment.reading || '').split(' ').map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' '));
  }
  return out;
}

function touching(a, b) {
  return !!a && !!b && a.line === b.line && typeof a.sourceEnd === 'number' && a.sourceEnd === b.sourceStart;
}

export function canExtendPhrase(paragraph, from, to, direction) {
  const segments = paragraph && Array.isArray(paragraph.segments) ? paragraph.segments : [];
  if (direction === 'left') return from > 0 && touching(segments[from - 1], segments[from]);
  return to < segments.length - 1 && touching(segments[to], segments[to + 1]);
}

export function phraseRange(paragraph, from, to) {
  const segments = paragraph && Array.isArray(paragraph.segments) ? paragraph.segments : [];
  if (from < 0 || to >= segments.length || from > to) return null;
  if (from === to) return segments[from];
  const chunk = segments.slice(from, to + 1);
  for (let k = 1; k < chunk.length; k++) if (!touching(chunk[k - 1], chunk[k])) return null;
  return {
    source: chunk.map((seg) => seg.source).join(''),
    reading: chunk.map((seg) => seg.reading).join(' '),
    translation: paragraph.text.slice(chunk[0].start, chunk[chunk.length - 1].end),
    origin: 'selection'
  };
}

export function editedPhrase(phrase, text, { readingOf, meaningsOf } = {}) {
  const source = String(text || '').trim();
  if (!source) return { source: '', reading: '', options: [] };
  if (phrase && source === phrase.source) return { source, reading: phrase.reading, options: phraseOptions(phrase, meaningsOf) };
  const reading = typeof readingOf === 'function' ? readingOf(source) : '';
  return { source, reading, options: phraseOptions({ source, reading, translation: '' }, meaningsOf) };
}

export function phraseSaveKind(segment) {
  const origin = segment && segment.origin;
  if (origin === 'name') return 'namelist';
  if (origin === 'locked') return 'locked';
  return 'soft';
}

export async function savePhraseEntry(storage, novelId, kind, { original, translation }) {
  const key = String(original || '').trim();
  const value = String(translation || '').trim();
  if (!storage || !novelId || !key) return null;
  const list = (await storage.getNameList(novelId, kind)) || [];
  const existing = list.find((entry) => entry && String(entry.original || '').trim().toLowerCase() === key.toLowerCase());
  if (existing) return storage.updateNameEntry(novelId, existing.id, { translation: value }, kind);
  return storage.addNameEntry(novelId, { original: key, translation: value }, kind);
}

export const PHRASE_ORIGIN_LABELS = {
  name: 'Name List',
  locked: 'Locked Glossary',
  soft: 'Soft Glossary',
  qtNames: 'QT Names',
  vietPhrase: 'VietPhrase',
  hanViet: 'Hán Việt',
  luatNhan: 'LuatNhan rule',
  number: 'Number',
  selection: 'Selection'
};

export const PHRASE_KIND_LABELS = {
  namelist: 'Name List',
  locked: 'Locked Glossary',
  soft: 'Soft Glossary'
};

export function suggestionsForPhrase(candidates, phrase, limit = 4) {
  const source = phrase && typeof phrase.source === 'string' ? phrase.source : '';
  if (!source || !Array.isArray(candidates)) return [];
  return candidates
    .filter((candidate) => candidate && candidate.text && (candidate.text.includes(source) || source.includes(candidate.text)))
    .slice(0, limit);
}

export async function buildNameSuggestions(novel, text, services) {
  const { storage, hanViet, dictionaries, jieba, finder } = services;
  const [jiebaInstance, hanVietMap, vietPhrase, qtNames, hoNguoi, hauTu, danhTu, rejected] = await Promise.all([
    jieba.load(),
    hanViet.load(),
    dictionaries.load('vietPhrase'),
    dictionaries.load('qtNames'),
    dictionaries.load('hoNguoi'),
    dictionaries.load('hauTu'),
    dictionaries.load('danhTu'),
    storage.getNameList(novel.id, 'rejectedNames')
  ]);
  const known = new Map();
  (Array.isArray(novel.nameList) ? novel.nameList : []).forEach((entry) => {
    const original = entry && entry.original ? String(entry.original).trim() : '';
    if (original && !known.has(original)) known.set(original, String(entry.translation || '').trim());
  });
  return finder.find(text, {
    jieba: jiebaInstance,
    hanViet: hanVietMap,
    vietPhrase,
    names: qtNames,
    hoNguoi,
    hauTu,
    danhTu,
    known,
    rejected: new Set((rejected || []).map((entry) => String(entry.original || '').trim()).filter(Boolean))
  }, { includeKnown: false });
}
