export function chapterSourceText(chapter) {
  if (!chapter) return '';
  return chapter.originalRawText || chapter.rawText || '';
}

export function chapterDisplayText(chapter, { conversionMode = false, convert = null } = {}) {
  if (!chapter) return '';
  if (conversionMode && typeof convert === 'function') return convert(chapterSourceText(chapter));
  return chapter.convertedText || chapter.rawText || '';
}
