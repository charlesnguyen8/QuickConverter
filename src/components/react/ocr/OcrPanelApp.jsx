import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReaderDeepseekCard from '../reader/ReaderDeepseekCard.jsx';
import { isOcrImageMessage } from './ocrText.js';
import { saveImageChapter } from './ocrSave.js';

const STATUS_TEXT = {
  waiting: 'Waiting for the chapter image...',
  recognizing: 'Reading the chapter image (first run loads the OCR model)...',
  recognized: 'Text recognized. Translate it with your configured translator.',
  translating: 'Translating...',
  saving: 'Saving the chapter to your library...',
  saved: 'Saved to your library.',
  done: 'Translation complete.',
  error: 'Something went wrong.'
};

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

function getSaveTarget() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const novelId = params.get('id');
  const chapterNumber = Number(params.get('ch'));
  if (params.get('save') !== '1' || !novelId || !Number.isFinite(chapterNumber)) return null;
  return { novelId, chapterNumber, url: params.get('url') || '' };
}

function recognizeWithEngine(bytes, mimeType) {
  return import('./ocrEngine.js').then(({ recognizeChapterImage }) => recognizeChapterImage(bytes, mimeType));
}

function Paragraphs({ id, text, className }) {
  const parts = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div id={id} className={className}>
      {parts.map((part, i) => <p key={i}>{part}</p>)}
    </div>
  );
}

export function OcrPanelView({
  status = 'waiting',
  sourceText = '',
  translatedText = '',
  error = '',
  imageSize = null,
  showSource = true,
  saveMode = false,
  progressText = '',
  onRetry,
  onToggleSource,
  onTranslate,
  onClose,
  deepseekRef
}) {
  const busy = status === 'waiting' || status === 'recognizing' || status === 'translating' || status === 'saving';
  const statusText = status === 'translating' && progressText ? progressText : (STATUS_TEXT[status] || '');
  const canTranslate = !!sourceText && !busy;

  return (
    <div id="ocr-panel" className="min-h-screen bg-slate-900 text-slate-200 flex flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 bg-slate-900/95 border-b border-slate-800">
        <h1 className="text-sm font-semibold text-slate-100">QuickConverter · Image chapter</h1>
        <button
          id="ocr-close-btn"
          type="button"
          onClick={onClose}
          className="min-w-10 min-h-10 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Close panel"
          aria-label="Close panel"
        >
          ✕
        </button>
      </header>

      <main className="flex-1 flex flex-col gap-4 p-4">
        <p className="text-[11px] text-slate-400">
          {saveMode
            ? 'The chapter image is read on your device and the recognized text is saved to your library, translated first if your translator is turned on.'
            : 'Read-only: the chapter image is read on your device and only the recognized text is sent to your translator. Nothing from this page is saved.'}
        </p>

        <div id="ocr-status" className="text-xs font-medium text-indigo-300" role="status">{statusText}</div>
        {imageSize ? (
          <div id="ocr-image-info" className="text-[11px] text-slate-500">Chapter image: {imageSize.width} × {imageSize.height} px</div>
        ) : null}

        {status === 'error' && error ? (
          <div id="ocr-error" className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">{error}</div>
        ) : null}

        {status === 'error' && onRetry ? (
          <button
            id="ocr-retry-btn"
            type="button"
            onClick={onRetry}
            className="min-h-10 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition"
          >
            Retry
          </button>
        ) : null}

        <ReaderDeepseekCard
          ref={deepseekRef}
          idPrefix="ocr"
          variant="compact"
          description="Your translator settings. The recognized text is translated with this provider, model and prompt."
          className="w-full text-left rounded-xl bg-slate-800/80 border border-slate-700/80 p-4 shadow-sm flex flex-col gap-3"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="ocr-translate-btn"
            type="button"
            disabled={!canTranslate}
            onClick={onTranslate}
            className={`min-h-10 px-4 rounded-lg text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition${canTranslate ? '' : ' opacity-50 pointer-events-none'}`}
          >
            {status === 'translating' ? 'Translating...' : translatedText ? 'Translate again' : 'Translate'}
          </button>
          {sourceText ? (
            <button
              id="ocr-toggle-source-btn"
              type="button"
              onClick={onToggleSource}
              className="min-h-10 px-3 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition"
            >
              {showSource ? 'Hide Chinese' : 'Show Chinese'}
            </button>
          ) : null}
        </div>

        {translatedText ? (
          <Paragraphs id="ocr-translated-text" text={translatedText} className="flex flex-col gap-3 text-[15px] leading-relaxed text-slate-100" />
        ) : null}

        {sourceText && showSource ? (
          <Paragraphs id="ocr-source-text" text={sourceText} className="flex flex-col gap-2 text-sm leading-relaxed text-slate-400 border-t border-slate-800 pt-3" />
        ) : null}
      </main>
    </div>
  );
}

export default function OcrPanelApp() {
  const [novelId] = useState(getNovelId);
  const [saveTarget] = useState(getSaveTarget);
  const [progressText, setProgressText] = useState('');
  const recognizedRef = useRef('');
  const [status, setStatus] = useState('waiting');
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState('');
  const [showSource, setShowSource] = useState(true);
  const [imageSize, setImageSize] = useState(null);
  const deepseekRef = useRef(null);

  const fail = useCallback((message) => {
    setError(message);
    setStatus('error');
  }, []);

  const getTranslation = useCallback(() => {
    const panel = deepseekRef.current;
    if (!panel) return undefined;
    const options = panel.getDownloadOptions();
    return options ? options.translation : null;
  }, []);

  const runSave = useCallback(async (image) => {
    setError('');
    setProgressText('');
    setTranslatedText('');
    const result = await saveImageChapter({
      image,
      target: saveTarget,
      storage: window.StorageService,
      recognize: recognizeWithEngine,
      getTranslation,
      sourceText: recognizedRef.current,
      onSaved: () => {
        if (window.parent && window.parent !== window) window.parent.postMessage({ type: 'QC_OCR_SAVED' }, '*');
      },
      onStatus: (update) => {
        if (update.sourceText) {
          setSourceText(update.sourceText);
          setShowSource(true);
        }
        if (typeof update.translatedText === 'string') setTranslatedText(update.translatedText);
        setProgressText(update.progressText || '');
        if (update.status === 'error') {
          fail(update.error);
        } else {
          setStatus(update.status);
        }
      }
    });
    recognizedRef.current = result.ok ? '' : (result.sourceText || '');
    if (result.ok && result.translatedText) setShowSource(false);
  }, [saveTarget, getTranslation, fail]);

  const handleRetry = useCallback(() => {
    if (recognizedRef.current) {
      runSave(null);
      return;
    }
    setError('');
    setStatus('waiting');
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'QC_OCR_RETRY' }, '*');
    }
  }, [runSave]);

  useEffect(() => {
    const onMessage = async (event) => {
      if (event.source === window.parent && event.data && event.data.type === 'QC_OCR_ERROR') {
        fail(String(event.data.message || 'The chapter image could not be loaded.'));
        return;
      }
      if (!isOcrImageMessage(event, window.parent)) return;
      if (saveTarget) {
        setImageSize(event.data.width && event.data.height ? { width: event.data.width, height: event.data.height } : null);
        runSave({ bytes: event.data.bytes, mimeType: event.data.mimeType });
        return;
      }
      setStatus('recognizing');
      setError('');
      setTranslatedText('');
      setImageSize(event.data.width && event.data.height ? { width: event.data.width, height: event.data.height } : null);
      try {
        const { recognizeChapterImage } = await import('./ocrEngine.js');
        const text = await recognizeChapterImage(event.data.bytes, event.data.mimeType);
        if (!text) {
          fail('No text was found in the chapter image.');
          return;
        }
        setSourceText(text);
        setShowSource(true);
        setStatus('recognized');
      } catch (err) {
        console.error('[QuickConverter OCR] Recognition failed:', err);
        fail(`Could not read the chapter image: ${err && err.message ? err.message : err}`);
      }
    };
    window.addEventListener('message', onMessage);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'QC_OCR_READY' }, '*');
    }
    return () => window.removeEventListener('message', onMessage);
  }, [fail, saveTarget, runSave]);

  const handleTranslate = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || typeof storage.translateText !== 'function' || !sourceText) return;
    const options = deepseekRef.current ? deepseekRef.current.getDownloadOptions() : null;
    const translation = { ...((options && options.translation) || {}), enabled: true };
    setStatus('translating');
    setError('');
    setTranslatedText('');
    try {
      const result = await storage.translateText(novelId, sourceText, translation, {
        ocrSource: true,
        onChunk: (chunk) => {
          if (chunk && chunk.type === 'content' && typeof chunk.fullText === 'string') setTranslatedText(chunk.fullText);
        }
      });
      setTranslatedText(result.text);
      setShowSource(false);
      setStatus('done');
    } catch (err) {
      console.error('[QuickConverter OCR] Translation failed:', err);
      fail(`Translation failed: ${err && err.message ? err.message : err}`);
    }
  }, [novelId, sourceText, fail]);

  const handleClose = useCallback(() => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'QC_OCR_CLOSE' }, '*');
    }
  }, []);

  return (
    <OcrPanelView
      status={status}
      sourceText={sourceText}
      translatedText={translatedText}
      error={error}
      imageSize={imageSize}
      showSource={showSource}
      saveMode={!!saveTarget}
      progressText={progressText}
      onRetry={saveTarget ? handleRetry : undefined}
      onToggleSource={() => setShowSource((v) => !v)}
      onTranslate={handleTranslate}
      onClose={handleClose}
      deepseekRef={deepseekRef}
    />
  );
}
