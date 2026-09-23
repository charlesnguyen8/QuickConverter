import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReaderHeader from './ReaderHeader.jsx';
import ReaderChapter from './ReaderChapter.jsx';
import ReaderNav from './ReaderNav.jsx';
import ReaderSourceDrawer from './ReaderSourceDrawer.jsx';
import ReaderNotSaved from './ReaderNotSaved.jsx';
import ReaderToast from './ReaderToast.jsx';

function getParams() {
  if (typeof window === 'undefined') return { id: null, ch: NaN };
  const params = new URLSearchParams(window.location.search);
  return { id: params.get('id'), ch: parseFloat(params.get('ch')) };
}

export default function ReaderApp() {
  const [{ id, ch }] = useState(getParams);
  const [novel, setNovel] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [model, setModel] = useState('deepseek-flash');
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!id || !Number.isFinite(ch) || !storage) {
      setStatus('invalid');
      return;
    }
    try {
      const novelRecord = await storage.getNovelById(id);
      if (!novelRecord) {
        setErrorMsg('Novel not found in your library.');
        setStatus('error');
        return;
      }
      setNovel(novelRecord);
      const chapterRecord = await storage.getChapter(novelRecord.id, ch);
      setChapter(chapterRecord || null);
      setStatus('ready');
    } catch (err) {
      console.error('Error rendering reader:', err);
      setErrorMsg(err.message);
      setStatus('error');
    }
  }, [id, ch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('reader-chapter-refresh', onRefresh);
    return () => window.removeEventListener('reader-chapter-refresh', onRefresh);
  }, [load]);

  useEffect(() => {
    if (novel) document.title = `${novel.title} - Ch. ${ch}`;
  }, [novel, ch]);

  const goToChapter = useCallback((target) => {
    window.location.href = `reader.html?id=${encodeURIComponent(id)}&ch=${encodeURIComponent(target)}`;
  }, [id]);

  useEffect(() => {
    const onKey = (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        window.dispatchEvent(new Event('reader-toggle-typography'));
        return;
      }

      const typographyPopoverEl = document.getElementById('reader-typography-popover');
      if (e.key === 'Escape' && typographyPopoverEl && !typographyPopoverEl.classList.contains('hidden')) {
        e.preventDefault();
        window.dispatchEvent(new Event('reader-close-typography'));
        return;
      }

      if ((e.key === 's' || e.key === 'S') && chapter && chapter.originalRawText) {
        e.preventDefault();
        window.dispatchEvent(new Event('reader-open-source'));
        return;
      }

      const sourceDrawer = document.getElementById('source-drawer');
      if (e.key === 'Escape' && sourceDrawer && !sourceDrawer.classList.contains('translate-x-full')) {
        e.preventDefault();
        window.dispatchEvent(new Event('reader-close-source'));
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === '[' || e.key === ']') {
        if (!novel) return;
        const catalog = (novel.chapterList || []).slice().sort((a, b) => a.chapterNumber - b.chapterNumber);
        const idx = catalog.findIndex((c) => Number(c.chapterNumber) === ch);
        let target = null;
        if (e.key === 'ArrowLeft' || e.key === '[') {
          if (idx > 0) target = catalog[idx - 1].chapterNumber;
          else if (ch > 1) target = ch - 1;
        } else if (idx >= 0 && idx < catalog.length - 1) {
          target = catalog[idx + 1].chapterNumber;
        } else if (idx < 0 && (!novel.totalChapters || ch < novel.totalChapters)) {
          target = ch + 1;
        }
        if (target !== null) {
          e.preventDefault();
          goToChapter(target);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [novel, chapter, ch, goToChapter]);

  const handleDownload = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novel) return;

    const options = panelRef.current ? panelRef.current.getDownloadOptions() : null;
    if (!options) return;

    setFailed(false);
    setTranslating(options.translation.enabled);
    setModel(options.translation.model);
    setDownloading(true);

    try {
      await storage.downloadChapter(novel.id, ch, options);
      if (options.translation.enabled && options.translation.provider === 'official' && panelRef.current) {
        panelRef.current.refreshBalance(true);
      }
      setDownloading(false);
      window.dispatchEvent(new Event('reader-chapter-refresh'));
    } catch (err) {
      console.error('Download failed:', err);
      setDownloading(false);
      setFailed(true);
    }
  }, [novel, ch]);

  const text = chapter ? (chapter.convertedText || chapter.rawText || '') : '';
  const hasContent = !!text;
  const hasSource = !!(chapter && (
    (chapter.originalRawText && chapter.originalRawText.trim() !== text.trim()) ||
    chapter.translationCost ||
    chapter.reasoningText
  ));
  const catalogItem = novel ? (novel.chapterList || []).find((c) => Number(c.chapterNumber) === ch) : null;
  const fallbackTitle = (chapter && chapter.title) || (catalogItem && catalogItem.title) || `Chapter ${ch}`;
  const settingsHref = id && Number.isFinite(ch)
    ? `settings.html?from=reader&id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`
    : 'settings.html?from=reader';
  const backHref = novel ? `novel.html?id=${encodeURIComponent(novel.id)}` : 'library.html';

  return (
    <>
      <ReaderHeader
        novelTitle={novel ? novel.title : 'QuickConverter Reader'}
        chapterTitle={status === 'ready' ? fallbackTitle : 'Loading chapter...'}
        backHref={backHref}
        settingsHref={settingsHref}
        hasSource={hasSource}
      />

      <main className="max-w-3xl mx-auto w-full px-5 sm:px-8 py-8 sm:py-12 flex-1 flex flex-col gap-8">
        {status === 'loading' ? (
          <div id="reader-loading" className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span className="text-sm text-slate-400 font-medium">Loading chapter text...</span>
          </div>
        ) : null}

        {status === 'invalid' ? (
          <div id="reader-loading" className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-red-400">Invalid novel or chapter specified.</p>
          </div>
        ) : null}

        {status === 'error' ? (
          <div id="reader-loading" className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-red-400">{errorMsg || 'Error loading chapter.'}</p>
          </div>
        ) : null}

        {status === 'ready' && hasContent ? (
          <article id="reader-content-view" className="flex flex-col gap-8">
            <ReaderChapter />
            <ReaderNav />
          </article>
        ) : null}

        {status === 'ready' && !hasContent ? (
          <ReaderNotSaved
            downloading={downloading}
            failed={failed}
            translating={translating}
            model={model}
            onDownload={handleDownload}
            deepseekRef={panelRef}
          />
        ) : null}
      </main>

      <ReaderSourceDrawer />
      <ReaderToast />
    </>
  );
}
