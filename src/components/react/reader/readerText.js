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
  return processors.createConverter({
    hanViet: hanVietMap || new Map(),
    names: Array.isArray(novel.nameList) ? novel.nameList : [],
    locked: locked || [],
    soft: soft || [],
    dictionaries: loaded,
    ignoredPhrases: ignoredPhrases || []
  });
}
