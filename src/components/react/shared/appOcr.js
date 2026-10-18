export function installAppOcr(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return;
  win.QCOcr = {
    recognize(bytes, mimeType) {
      return import('../ocr/ocrEngine.js').then(({ recognizeChapterImage }) => recognizeChapterImage(bytes, mimeType));
    }
  };
}
