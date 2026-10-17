function errorText(err) {
  return err && err.message ? err.message : String(err);
}

export async function saveImageChapter({ image, target, storage, recognize, getTranslation, sourceText = '', onStatus }) {
  let lastStatus = null;
  const report = (update) => {
    lastStatus = update.status;
    if (typeof onStatus === 'function') onStatus(update);
  };
  const fail = (error, text = '') => {
    report({ status: 'error', error, sourceText: text });
    return { ok: false, error, sourceText: text };
  };

  let text = typeof sourceText === 'string' ? sourceText.trim() : '';
  if (!text) {
    if (!image || !image.bytes) {
      return fail('The chapter image was not found on this page. The chapter was not saved.');
    }
    report({ status: 'recognizing' });
    try {
      text = String((await recognize(image.bytes, image.mimeType)) || '').trim();
    } catch (err) {
      console.error('[QuickConverter OCR] Recognition failed:', err);
      return fail(`Could not read the chapter image: ${errorText(err)}. The chapter was not saved.`);
    }
    if (!text) {
      return fail('No text was found in the chapter image. The chapter was not saved.');
    }
  }

  let translation;
  try {
    translation = getTranslation ? getTranslation() : undefined;
  } catch (err) {
    return fail(`Translation settings could not be read: ${errorText(err)}. The chapter was not saved.`, text);
  }
  if (translation === null) {
    return fail('Translation is on but its settings are incomplete. Fix them, then retry. The chapter was not saved.', text);
  }
  const translating = !!(translation && translation.enabled);

  let translatedText = '';
  report({ status: translating ? 'translating' : 'saving', sourceText: text });
  try {
    const saved = await storage.saveRecognizedChapter(target.novelId, target.chapterNumber, {
      text,
      url: target.url,
      title: target.title,
      translation,
      onProgress: (p) => {
        if (!p) return;
        if (p.phase === 'saving') {
          if (lastStatus !== 'saving') report({ status: 'saving', sourceText: text, translatedText });
        } else if (translating && p.phase !== 'completed') {
          report({ status: 'translating', sourceText: text, translatedText, progressText: p.text });
        }
      },
      onChunk: (chunk) => {
        if (chunk && chunk.type === 'content' && typeof chunk.fullText === 'string') {
          translatedText = chunk.fullText;
          report({ status: 'translating', sourceText: text, translatedText });
        }
      }
    });
    translatedText = saved && saved.isTranslated ? saved.rawText : '';
    report({ status: 'saved', sourceText: text, translatedText });
    return { ok: true, sourceText: text, translatedText, chapter: saved };
  } catch (err) {
    console.error('[QuickConverter OCR] Saving the chapter failed:', err);
    return fail(`Could not save the chapter: ${errorText(err)}. The chapter was not saved.`, text);
  }
}
