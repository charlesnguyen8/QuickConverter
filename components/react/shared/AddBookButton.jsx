import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SUPPORTED_DOMAINS = ['wetriedtls.com'];
const FALLBACK_THUMB = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';

function providerFor(url) {
  if (typeof window === 'undefined') return null;
  if (window.ProviderRegistry && typeof window.ProviderRegistry.getProviderForUrl === 'function') {
    return window.ProviderRegistry.getProviderForUrl(url);
  }
  if (window.WetriedtlsProvider && window.WetriedtlsProvider.matches && window.WetriedtlsProvider.matches(url)) {
    return window.WetriedtlsProvider;
  }
  return null;
}

export default function AddBookButton({ compact = false, buttonClass = '' }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [state, setState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [submitState, setSubmitState] = useState('idle');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const closeTimerRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setUrl('');
    setPreview(null);
    setState(null);
    setSubmitState('idle');
    setInspecting(false);
  }, []);

  const openModal = () => {
    setUrl('');
    setPreview(null);
    setState(null);
    setSubmitState('idle');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const focusTimer = setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 80);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [open, close]);

  const handleInspect = useCallback(async (rawInput) => {
    let rawUrl = (rawInput !== undefined ? rawInput : url).trim();
    if (!rawUrl) {
      setState({ type: 'error', message: 'Please paste or type a valid novel link.' });
      return;
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      rawUrl = 'https://' + rawUrl;
      setUrl(rawUrl);
    }

    let parsedUrlObj;
    try {
      parsedUrlObj = new URL(rawUrl);
    } catch (e) {
      setState({ type: 'error', message: 'Invalid URL format. Example: https://wetriedtls.com/series/my-novel' });
      return;
    }

    const provider = providerFor(rawUrl);
    if (!provider) {
      setState({
        type: 'unsupported',
        domain: parsedUrlObj.hostname,
        message: `The website "${parsedUrlObj.hostname}" is not currently supported.`
      });
      return;
    }

    const parsedInfo = typeof provider.parseUrl === 'function' ? provider.parseUrl(rawUrl) : null;
    if (!parsedInfo || !parsedInfo.slug) {
      setState({ type: 'error', message: 'Could not identify a novel series from this link. Please provide a series or chapter page.' });
      return;
    }

    const slug = parsedInfo.slug;
    const seriesUrl = parsedInfo.seriesUrl || rawUrl;

    if (window.StorageService && typeof window.StorageService.getNovelBySlug === 'function') {
      const existing = await window.StorageService.getNovelBySlug(slug);
      if (existing) {
        setState({ type: 'already_managed', novel: existing });
        return;
      }
    }

    setState({ type: 'loading', slug });
    setInspecting(true);
    try {
      let metadata = null;
      if (typeof provider.fetchSeriesMetadata === 'function') {
        metadata = await provider.fetchSeriesMetadata(slug, seriesUrl);
      }

      let totalChapters = metadata && metadata.totalChapters ? metadata.totalChapters : null;
      if ((!totalChapters || totalChapters <= 0) && typeof provider.fetchChapterList === 'function') {
        const chapters = await provider.fetchChapterList(slug, seriesUrl);
        if (Array.isArray(chapters) && chapters.length > 0) totalChapters = chapters.length;
      }

      const title = (metadata && metadata.title) || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const thumbnail = (metadata && metadata.thumbnail) || FALLBACK_THUMB;
      const status = (metadata && metadata.status) || 'Active';

      const data = {
        title,
        slug,
        seriesUrl,
        domain: provider.domains ? provider.domains[0] : 'wetriedtls.com',
        thumbnail,
        totalChapters: totalChapters || 100,
        status,
        icon: '📖'
      };
      setPreview(data);
      setState({ type: 'success', preview: data });
    } catch (err) {
      console.warn('[AddBook] Failed to inspect series:', err);
      setState({ type: 'error', message: 'Failed to retrieve novel details from the website. Check your internet connection.' });
    } finally {
      setInspecting(false);
    }
  }, [url]);

  const handleInputChange = (value) => {
    setUrl(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const v = value.trim();
    if (v.length > 8 && (v.includes('wetriedtls.com') || v.includes('http'))) {
      debounceRef.current = setTimeout(() => handleInspect(value), 350);
    }
  };

  const handleSubmit = async () => {
    if (!preview || !window.StorageService) return;
    setSubmitState('adding');
    try {
      const newNovel = {
        title: preview.title,
        slug: preview.slug,
        url: preview.seriesUrl,
        domain: preview.domain,
        thumbnail: preview.thumbnail,
        totalChapters: preview.totalChapters,
        status: preview.status,
        icon: preview.icon || '📖'
      };
      await window.StorageService.addNovel(newNovel);
      window.dispatchEvent(new CustomEvent('novel-added', { detail: { novel: newNovel, slug: preview.slug } }));
      setSubmitState('added');
      closeTimerRef.current = setTimeout(close, 500);
    } catch (err) {
      console.error('[AddBook] Error adding novel:', err);
      setSubmitState('retry');
    }
  };

  const onInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (preview) handleSubmit();
      else handleInspect();
    }
  };

  const canSubmit = state && state.type === 'success';
  const submitLabel = submitState === 'added' ? 'Added!' : (submitState === 'adding' ? 'Adding...' : (submitState === 'retry' ? 'Retry Add' : 'Add to Library'));
  const submitClass = submitState === 'added'
    ? 'px-4 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white flex items-center gap-1.5 shadow-sm shadow-emerald-500/20'
    : 'px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-indigo-500/20';

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Add novel from web link"
        className={compact
          ? `inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition cursor-pointer active:scale-[0.98] ${buttonClass}`
          : `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm shadow-indigo-500/20 transition cursor-pointer active:scale-[0.98] ${buttonClass}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={compact ? 11 : 13} height={compact ? 11 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Add Book</span>
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div
          id="quickconverter-add-book-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-opacity duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden flex flex-col p-5 gap-4 text-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-sm">📖</div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100 leading-tight">Add Book by Link</h3>
                  <p className="text-[11px] text-slate-400">Inspect and add a novel to your managed library</p>
                </div>
              </div>
              <button type="button" id="add-book-close-btn" onClick={close} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition cursor-pointer" title="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Novel Web Link</span>
                <div className="flex items-center gap-1">
                  <span>Supported:</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono text-[10px] border border-indigo-500/25">wetriedtls.com</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="url"
                    id="add-book-url-input"
                    value={url}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={onInputKeyDown}
                    placeholder="https://wetriedtls.com/series/..."
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <button type="button" id="add-book-inspect-btn" onClick={() => handleInspect()} disabled={inspecting} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
                  <span>Inspect</span>
                </button>
              </div>
            </div>

            <div id="add-book-preview-container" className="min-h-[90px] flex flex-col justify-center">
              {(!state) ? (
                <div className="p-4 rounded-lg bg-slate-800/40 border border-slate-700/40 text-center text-xs text-slate-400 flex flex-col items-center gap-1">
                  <span className="text-base">💡</span>
                  <span>Paste a series or chapter link to preview cover, title, and chapters.</span>
                </div>
              ) : null}

              {state && state.type === 'loading' ? (
                <div className="flex items-center gap-3 p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <div className="w-12 h-16 rounded bg-slate-700/50 animate-pulse flex-shrink-0"></div>
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="h-3.5 w-3/4 bg-slate-700/60 rounded animate-pulse"></div>
                    <div className="h-2.5 w-1/2 bg-slate-700/40 rounded animate-pulse"></div>
                    <div className="text-[11px] text-indigo-400 flex items-center gap-1.5 pt-0.5">
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Fetching series metadata & chapter count...</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {state && state.type === 'unsupported' ? (
                <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex flex-col gap-1.5">
                  <div className="font-semibold flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Website Not Supported</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">
                    The link belongs to <span className="font-mono text-amber-200">{state.domain || 'an unsupported domain'}</span>. Currently supported platforms:
                    <strong className="text-white">{SUPPORTED_DOMAINS.join(', ')}</strong>.
                  </p>
                </div>
              ) : null}

              {state && state.type === 'already_managed' ? (
                <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/25 text-blue-300 text-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img src={state.novel.thumbnail || ''} alt={state.novel.title} className="w-10 h-14 object-cover rounded border border-blue-500/30 flex-shrink-0 bg-slate-800" />
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-slate-100 truncate">{state.novel.title}</span>
                      <span className="text-[11px] text-blue-300/80">Already in your library ({state.novel.totalChapters || 0} chapters)</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    id="add-book-open-existing-btn"
                    onClick={() => { close(); window.location.href = `novel.html?id=${encodeURIComponent(state.novel.id)}`; }}
                    className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition cursor-pointer flex-shrink-0"
                  >
                    Open
                  </button>
                </div>
              ) : null}

              {state && state.type === 'error' ? (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-start gap-2">
                  <span className="text-sm">❌</span>
                  <span>{state.message || 'An error occurred.'}</span>
                </div>
              ) : null}

              {state && state.type === 'success' && state.preview ? (
                <div className="flex gap-3.5 p-3 rounded-lg bg-slate-800/80 border border-slate-700/80 items-center">
                  <div className="w-14 h-20 rounded-md overflow-hidden bg-slate-900 border border-slate-700 flex-shrink-0">
                    <img
                      src={state.preview.thumbnail}
                      alt={state.preview.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { e.currentTarget.src = FALLBACK_THUMB; }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="font-bold text-slate-100 text-xs sm:text-sm line-clamp-2 leading-snug">{state.preview.title}</span>
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-700/60 border border-slate-600/50 text-slate-300">{state.preview.domain}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">{state.preview.totalChapters} Chs</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">{state.preview.status}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
              <button type="button" id="add-book-cancel-btn" onClick={close} className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                id="add-book-submit-btn"
                onClick={handleSubmit}
                disabled={!canSubmit || submitState === 'adding'}
                className={submitClass}
              >
                {submitState === 'adding' ? (
                  <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
                <span>{submitLabel}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
