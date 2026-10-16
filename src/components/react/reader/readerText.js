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
  const [hanVietMap, locked, soft, vietPhrase, qtNames, pronouns, ignoredPhrases] = await Promise.all([
    safe(hanViet.load()),
    safe(storage.getNameList(novel.id, 'locked')),
    safe(storage.getNameList(novel.id, 'soft')),
    safe(dictionaries.load('vietPhrase')),
    safe(dictionaries.load('qtNames')),
    safe(dictionaries.load('pronouns')),
    safe(dictionaries.load('ignoredPhrases'))
  ]);
  const loaded = {};
  if (vietPhrase) loaded.vietPhrase = vietPhrase;
  if (qtNames) loaded.qtNames = qtNames;
  if (pronouns) loaded.pronouns = pronouns;
  const converter = processors.createConverter({
    hanViet: hanVietMap || new Map(),
    names: Array.isArray(novel.nameList) ? novel.nameList : [],
    locked: locked || [],
    soft: soft || [],
    dictionaries: loaded,
    ignoredPhrases: ignoredPhrases || []
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
  return { ...converter, meaningsOf };
}

export function paragraphsFromLines(lines) {
  const paragraphs = [];
  let current = null;
  (Array.isArray(lines) ? lines : []).forEach((line) => {
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
      current.segments.push({ ...seg, start: seg.start + offset, end: seg.end + offset });
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
  return out;
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
  if (!storage || !novelId || !key || !value) return null;
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
  hanViet: 'Hán Việt'
};

export const PHRASE_KIND_LABELS = {
  namelist: 'Name List',
  locked: 'Locked Glossary',
  soft: 'Soft Glossary'
};
