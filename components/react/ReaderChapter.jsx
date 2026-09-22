import React, { useCallback, useEffect, useRef, useState } from 'react';

function getParams() {
  if (typeof window === 'undefined') return { id: null, ch: 0 };
  const params = new URLSearchParams(window.location.search);
  return { id: params.get('id'), ch: parseInt(params.get('ch'), 10) || 0 };
}

function resolveFontFamilyCss(fontKey) {
  switch (fontKey) {
    case 'serif':
    case 'georgia': return 'Georgia, Cambria, "Times New Roman", Times, serif';
    case 'garamond': return 'Garamond, "EB Garamond", "Baskerville", "Times New Roman", serif';
    case 'palatino': return '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif';
    case 'charter': return 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif';
    case 'baskerville': return 'Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, serif';
    case 'times': return '"Times New Roman", Times, Georgia, serif';
    case 'verdana': return 'Verdana, Geneva, "DejaVu Sans", sans-serif';
    case 'trebuchet': return '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif';
    case 'unkempt': return "'Unkempt', cursive, sans-serif";
    case 'patrick-hand': return "'Patrick Hand', cursive, sans-serif";
    case 'merienda': return "'Merienda', cursive, serif";
    case 'pangolin': return "'Pangolin', cursive, sans-serif";
    case 'playwrite-vn': return "'Playwrite VN', cursive, sans-serif";
    case 'sedgwick-ave': return "'Sedgwick Ave Display', cursive, sans-serif";
    case 'mynerve': return "'Mynerve', cursive, sans-serif";
    case 'fuzzy-bubbles': return "'Fuzzy Bubbles', cursive, sans-serif";
    case 'mono': return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Code", "Courier New", monospace';
    case 'sans':
    default: return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  }
}

function themeContentColor(theme) {
  if (theme === 'sepia') return '#2d231b';
  if (theme === 'oled') return '#f4f4f5';
  if (theme === 'forest') return '#e2f2e9';
  return '#e2e8f0';
}

function themeTitleColor(theme) {
  if (theme === 'sepia') return '#2d231b';
  if (theme === 'oled') return '#f4f4f5';
  if (theme === 'forest') return '#e2f2e9';
  return '#f8fafc';
}

function readPrefs() {
  if (typeof localStorage === 'undefined') {
    return { fontSize: 18, fontFamilyCss: resolveFontFamilyCss('sans'), lineHeight: '1.75', contentColor: '#e2e8f0', titleColor: '#f8fafc' };
  }
  const fontSize = parseInt(localStorage.getItem('quickconverter_reader_font_size'), 10) || 18;
  const fontFamily = localStorage.getItem('quickconverter_reader_font_family') || 'sans';
  const lhKey = localStorage.getItem('quickconverter_reader_line_height') || 'relaxed';
  const theme = localStorage.getItem('quickconverter_reader_theme') || 'slate';
  const lineHeight = lhKey === 'compact' ? '1.5' : (lhKey === 'spacious' ? '2.0' : '1.75');
  return {
    fontSize,
    fontFamilyCss: resolveFontFamilyCss(fontFamily),
    lineHeight,
    contentColor: themeContentColor(theme),
    titleColor: themeTitleColor(theme)
  };
}

export default function ReaderChapter() {
  const [params] = useState(getParams);
  const [novel, setNovel] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loadDone, setLoadDone] = useState(false);
  const [prefs, setPrefs] = useState(readPrefs);
  const titleRef = useRef(null);
  const paragraphRefs = useRef([]);

  const load = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !params.id) return;
    try {
      const [novelRecord, chapterRecord] = await Promise.all([
        storage.getNovelById(params.id),
        storage.getChapter(params.id, params.ch)
      ]);
      setNovel(novelRecord || null);
      setChapter(chapterRecord || null);
    } catch (e) {
      console.error('Error loading reader content:', e);
    } finally {
      setLoadDone(true);
    }
  }, [params.id, params.ch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('reader-chapter-refresh', onRefresh);
    return () => window.removeEventListener('reader-chapter-refresh', onRefresh);
  }, [load]);

  useEffect(() => {
    const onPrefs = () => setPrefs(readPrefs());
    window.addEventListener('reader-prefs-updated', onPrefs);
    return () => window.removeEventListener('reader-prefs-updated', onPrefs);
  }, []);

  const text = chapter ? (chapter.convertedText || chapter.rawText || '') : '';
  const paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '&nbsp;');

  const charCount = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const mins = Math.max(1, Math.round(words / 220));

  const catalogItem = novel && Array.isArray(novel.chapterList)
    ? novel.chapterList.find((c) => Number(c.chapterNumber) === params.ch)
    : null;
  const fallbackTitle = (chapter && chapter.title) || (catalogItem && catalogItem.title) || `Chapter ${params.ch}`;
  const novelTitle = (novel && novel.title) || 'Novel';

  const persistParagraphs = async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !params.id) return;
    const all = paragraphRefs.current
      .filter(Boolean)
      .map((el) => (el.innerText || '').trim())
      .filter((t) => t.length > 0);
    const fullText = all.join('\n\n');
    try {
      await storage.updateChapter(params.id, params.ch, { rawText: fullText, isUserEdited: true, editedAt: Date.now() });
      setChapter((prev) => (prev ? { ...prev, rawText: fullText, isUserEdited: true } : prev));
    } catch (e) {
      console.error('Error saving paragraph:', e);
    }
  };

  const makeEditable = (el, onDone) => {
    if (!el) return;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('ring-1', 'ring-indigo-500/60', 'bg-slate-800/90', 'px-2', 'py-0.5');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    const finish = async (save) => {
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      el.setAttribute('contenteditable', 'false');
      el.classList.remove('ring-1', 'ring-indigo-500/60', 'bg-slate-800/90', 'px-2', 'py-0.5');
      if (save) await onDone();
    };
    const onBlur = () => finish(true);
    const onKey = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  };

  const editParagraph = (idx) => {
    makeEditable(paragraphRefs.current[idx], persistParagraphs);
  };

  const persistTitle = async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !params.id || !titleRef.current) return;
    const newTitle = (titleRef.current.innerText || '').trim();
    try {
      await storage.updateChapter(params.id, params.ch, { title: newTitle });
      setChapter((prev) => (prev ? { ...prev, title: newTitle } : prev));
    } catch (e) {
      console.error('Error saving title:', e);
    }
  };

  const editTitle = () => makeEditable(titleRef.current, persistTitle);

  const showTranslated = !!(chapter && (chapter.isTranslated || chapter.modelUsed));
  const showEdited = !!(chapter && chapter.isUserEdited);
  const transLabel = chapter ? `Translated (${chapter.modelUsed || 'deepseek-flash'}${chapter.translationCost && chapter.translationCost.formattedCost ? ` • ${chapter.translationCost.formattedCost}` : ''})` : '';

  if (!loadDone) return null;

  return (
    <>
      <header className="flex flex-col gap-2 pb-6 border-b border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span id="novel-badge" className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 truncate max-w-xs">
            {novelTitle}
          </span>
          <span id="chapter-badge" className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            Ch. {params.ch}
          </span>
          {showTranslated ? (
            <span id="chapter-trans-badge" className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
              {transLabel}
            </span>
          ) : null}
          {showEdited ? (
            <span id="chapter-edited-badge" className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              Edited
            </span>
          ) : null}
          <span className="ml-auto text-[11px] text-slate-500 italic hidden sm:inline">Double-click text to edit</span>
        </div>
        <div className="group/title flex items-center gap-2 pt-1">
          <h1
            ref={titleRef}
            id="chapter-main-title"
            className="text-2xl sm:text-3xl font-extrabold leading-tight outline-none rounded transition-all hover:opacity-90 focus:ring-1 focus:ring-indigo-500/50 focus:px-2 cursor-pointer select-text"
            style={{ color: prefs.titleColor }}
            title="Double-click to edit chapter title"
            tabIndex={0}
            onDoubleClick={editTitle}
          >
            {fallbackTitle}
          </h1>
          <button
            type="button"
            id="edit-title-btn"
            onClick={editTitle}
            className="opacity-0 group-hover/title:opacity-100 focus:opacity-100 p-1 text-slate-500 hover:text-indigo-300 transition rounded cursor-pointer"
            title="Edit Chapter Title"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 pt-1">
          <span id="chapter-char-count">{charCount.toLocaleString()} characters</span>
          <span>&bull;</span>
          <span id="chapter-reading-time">~{mins} min read</span>
        </div>
      </header>

      <div
        id="chapter-body"
        className="leading-relaxed tracking-normal font-normal space-y-6"
        style={{ fontSize: `${prefs.fontSize}px`, fontFamily: prefs.fontFamilyCss, lineHeight: prefs.lineHeight, color: prefs.contentColor }}
      >
        {paragraphs.length === 0 ? (
          <p className="text-slate-400">No chapter text found.</p>
        ) : paragraphs.map((p, idx) => (
          <div key={idx} className="paragraph-block relative group rounded-md transition-all -mx-2 px-2 py-0.5 hover:bg-slate-800/30" data-idx={idx}>
            <p
              ref={(el) => { paragraphRefs.current[idx] = el; }}
              className="paragraph-text leading-relaxed outline-none rounded transition-all cursor-text select-text"
              tabIndex={0}
              title="Double-click to edit this paragraph"
              onDoubleClick={() => editParagraph(idx)}
            >
              {p}
            </p>
            <div className="paragraph-actions absolute right-2 -top-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
              <button
                type="button"
                onClick={() => editParagraph(idx)}
                className="edit-p-btn pointer-events-auto p-1 text-slate-500 hover:text-indigo-300 hover:bg-slate-800 transition rounded cursor-pointer"
                title="Edit paragraph"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
