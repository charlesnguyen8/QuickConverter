import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNameMatcher } from '../novel/nameListSource.js';
import {
  PHRASE_KIND_LABELS,
  buildReaderConverter,
  chapterDisplayText,
  chapterSourceText,
  paragraphsFromLines,
  canExtendPhrase,
  phraseOptions,
  phraseRange,
  phraseSaveKind,
  savePhraseEntry,
  lookupDefinitions,
  suggestionsForPhrase,
  buildNameSuggestions
} from './readerText.js';
import ReaderPhraseText from './ReaderPhraseText.jsx';
import ReaderPhrasePopover from './ReaderPhrasePopover.jsx';
import ReaderNameText from './ReaderNameText.jsx';
import { useReaderSearch } from './readerLocation.js';
import { recordChapterOpened, restoreParagraph, topParagraphIndex } from '../shared/lastRead.jsx';

const HEADER_OFFSET = 80;
const SAVE_POSITION_DELAY_MS = 800;

function getParams(search) {
  const params = new URLSearchParams(search || '');
  return { id: params.get('id'), ch: parseInt(params.get('ch'), 10) || 0, p: Math.max(0, parseInt(params.get('p'), 10) || 0) };
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
    return { fontSize: 18, fontFamilyCss: resolveFontFamilyCss('sans'), lineHeight: '1.75', contentColor: '#e2e8f0', titleColor: '#f8fafc', highlightNames: true };
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
    titleColor: themeTitleColor(theme),
    highlightNames: localStorage.getItem('quickconverter_reader_highlight_names') !== 'false'
  };
}

export default function ReaderChapter() {
  const search = useReaderSearch();
  const params = useMemo(() => getParams(search), [search]);
  const [novel, setNovel] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [loadDone, setLoadDone] = useState(false);
  const [prefs, setPrefs] = useState(readPrefs);
  const titleRef = useRef(null);
  const paragraphRefs = useRef([]);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !params.id) return;
    try {
      const [novelRecord, chapterRecord] = await Promise.all([
        storage.getNovelById(params.id),
        storage.getChapter(params.id, params.ch)
      ]);
      if (seq !== loadSeq.current) return;
      setNovel(novelRecord || null);
      setChapter(chapterRecord || null);
    } catch (e) {
      console.error('Error loading reader content:', e);
    } finally {
      if (seq === loadSeq.current) setLoadDone(true);
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

  const conversionMode = !!(novel && novel.conversionMode);
  const [converter, setConverter] = useState(null);

  useEffect(() => {
    if (!conversionMode || !novel) {
      setConverter(null);
      return undefined;
    }
    let cancelled = false;
    const services = typeof window !== 'undefined' ? {
      storage: window.StorageService,
      hanViet: window.HanViet,
      dictionaries: window.QtDictionaries,
      processors: window.TextProcessors
    } : {};
    if (!services.storage || !services.hanViet || !services.dictionaries || !services.processors) return undefined;
    buildReaderConverter(novel, services, { onError: (e) => console.warn('[Reader] Dictionary unavailable for conversion:', e) })
      .then((next) => { if (!cancelled) setConverter(next); })
      .catch((e) => console.error('Error preparing dictionary conversion:', e));
    return () => { cancelled = true; };
  }, [conversionMode, novel]);

  const convert = converter ? converter.convert : null;
  const detailed = useMemo(() => (
    conversionMode && converter && typeof converter.convertDetailed === 'function' && chapter
      ? paragraphsFromLines(converter.convertDetailed(chapterSourceText(chapter)))
      : null
  ), [conversionMode, converter, chapter]);
  const text = useMemo(() => (
    detailed ? detailed.map((p) => p.text).join('\n\n') : chapterDisplayText(chapter, { conversionMode, convert })
  ), [detailed, chapter, conversionMode, convert]);
  const [selected, setSelected] = useState(null);
  const [savingPhrase, setSavingPhrase] = useState(false);

  useEffect(() => { setSelected(null); }, [params.id, params.ch]);

  const selectedParagraph = selected && detailed ? detailed[selected.p] || null : null;
  const selectedPhrase = selectedParagraph ? phraseRange(selectedParagraph, selected.from, selected.to) : null;
  const [lacViet, setLacViet] = useState({ status: 'idle', dict: null });
  const phraseOpen = !!selectedPhrase;
  useEffect(() => {
    if (!phraseOpen) {
      if (lacViet.status === 'error') setLacViet({ status: 'idle', dict: null });
      return;
    }
    if (lacViet.status !== 'idle') return;
    const dictionaries = typeof window !== 'undefined' ? window.QtDictionaries : null;
    if (!dictionaries || typeof dictionaries.load !== 'function') return;
    setLacViet({ status: 'loading', dict: null });
    dictionaries.load('lacViet')
      .then((dict) => setLacViet({ status: 'ready', dict }))
      .catch((e) => {
        console.warn('[Reader] Lạc Việt dictionary unavailable:', e);
        setLacViet({ status: 'error', dict: null });
      });
  }, [phraseOpen, lacViet.status]);
  const definitionsOf = useMemo(
    () => (lacViet.status === 'ready' ? (source) => lookupDefinitions(lacViet.dict, source) : undefined),
    [lacViet]
  );
  const canExtendLeft = !!selectedParagraph && canExtendPhrase(selectedParagraph, selected.from, selected.to, 'left');
  const canExtendRight = !!selectedParagraph && canExtendPhrase(selectedParagraph, selected.from, selected.to, 'right');
  const extendSelection = (direction) => {
    if (direction === 'left' ? !canExtendLeft : !canExtendRight) return;
    setSelected((prev) => (prev ? {
      ...prev,
      from: direction === 'left' ? prev.from - 1 : prev.from,
      to: direction === 'right' ? prev.to + 1 : prev.to
    } : prev));
  };
  const selectedOptions = useMemo(
    () => phraseOptions(selectedPhrase, converter && converter.meaningsOf),
    [selectedPhrase, converter]
  );

  const savePhrase = async (kind, translation, source) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novel || !selectedPhrase) return;
    setSavingPhrase(true);
    try {
      const original = String(source || selectedPhrase.source).trim();
      await savePhraseEntry(storage, novel.id, kind, { original, translation });
      setSelected(null);
      window.dispatchEvent(new CustomEvent('reader-show-toast', { detail: `${original} → ${translation || '(hidden)'} saved to ${PHRASE_KIND_LABELS[kind]}` }));
      window.dispatchEvent(new Event('reader-chapter-refresh'));
    } catch (e) {
      console.error('Error saving phrase:', e);
      window.dispatchEvent(new CustomEvent('reader-show-toast', { detail: 'Could not save the phrase' }));
    } finally {
      setSavingPhrase(false);
    }
  };

  const [nameCandidates, setNameCandidates] = useState({ key: null, list: null, loading: false });
  const suggestionKey = novel && chapter ? `${novel.id}:${params.ch}:${(novel.nameList || []).length}` : null;

  const requestedSuggestions = useRef(null);
  useEffect(() => {
    if (!selectedPhrase || !conversionMode || !novel || !chapter || !suggestionKey) return;
    if (requestedSuggestions.current === suggestionKey) return;
    const services = typeof window !== 'undefined' ? {
      storage: window.StorageService,
      hanViet: window.HanViet,
      dictionaries: window.QtDictionaries,
      jieba: window.Jieba,
      finder: window.NameFinder
    } : {};
    if (!services.storage || !services.hanViet || !services.dictionaries || !services.jieba || !services.finder) return;
    requestedSuggestions.current = suggestionKey;
    setNameCandidates({ key: suggestionKey, list: null, loading: true });
    buildNameSuggestions(novel, chapterSourceText(chapter), services)
      .then((list) => { if (requestedSuggestions.current === suggestionKey) setNameCandidates({ key: suggestionKey, list, loading: false }); })
      .catch((e) => {
        console.warn('[Reader] Name suggestions unavailable:', e);
        if (requestedSuggestions.current === suggestionKey) setNameCandidates({ key: suggestionKey, list: [], loading: false });
      });
  }, [selectedPhrase, conversionMode, novel, chapter, suggestionKey]);

  const phraseSuggestions = nameCandidates.key === suggestionKey && nameCandidates.list
    ? suggestionsForPhrase(nameCandidates.list, selectedPhrase)
    : [];
  const suggestionsLoading = nameCandidates.key === suggestionKey && nameCandidates.loading;

  const acceptSuggestion = async (candidate) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novel) return;
    setSavingPhrase(true);
    try {
      await savePhraseEntry(storage, novel.id, 'namelist', { original: candidate.text, translation: candidate.suggested });
      setSelected(null);
      window.dispatchEvent(new CustomEvent('reader-show-toast', { detail: `${candidate.text} → ${candidate.suggested} added to the Name List` }));
      window.dispatchEvent(new Event('reader-chapter-refresh'));
    } catch (e) {
      console.error('Error adding a suggested name:', e);
      window.dispatchEvent(new CustomEvent('reader-show-toast', { detail: 'Could not add the name' }));
    } finally {
      setSavingPhrase(false);
    }
  };

  const rejectSuggestion = async (candidate) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novel) return;
    try {
      await savePhraseEntry(storage, novel.id, 'rejectedNames', { original: candidate.text, translation: candidate.suggested });
      setNameCandidates((prev) => ({ ...prev, list: (prev.list || []).filter((c) => c.text !== candidate.text) }));
    } catch (e) {
      console.error('Error rejecting a suggested name:', e);
    }
  };

  const openPhraseName = (nameId) => {
    setSelected(null);
    window.dispatchEvent(new CustomEvent('novel-open-name-list', { detail: { nameId } }));
  };
  const paragraphs = useMemo(() => text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '&nbsp;'), [text]);

  const restoredKey = useRef(null);
  const savedParagraph = useRef(-1);
  const chapterKey = `${params.id}:${params.ch}`;
  const contentReady = !!chapter && paragraphs.length > 0 && (!conversionMode || !!detailed);

  useEffect(() => {
    if (!contentReady || restoredKey.current === chapterKey) return;
    restoredKey.current = chapterKey;
    const lastRead = novel && novel.lastRead && Number(novel.lastRead.chapterNumber) === params.ch ? novel.lastRead : null;
    const savedCount = lastRead && Number(lastRead.paragraph) === params.p ? lastRead.count : 0;
    const target = params.p > 0 ? restoreParagraph({ paragraph: params.p, count: savedCount }, paragraphs.length) : 0;
    savedParagraph.current = target;
    const el = target > 0 ? paragraphRefs.current[target] : null;
    if (el && typeof window !== 'undefined') {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET });
    }
    recordChapterOpened(typeof window !== 'undefined' ? window.StorageService : null, params.id, chapter, params.ch, target, paragraphs.length);
  }, [contentReady, chapterKey, novel, chapter, params.id, params.ch, params.p, paragraphs.length]);

  useEffect(() => {
    if (!contentReady || restoredKey.current !== chapterKey || typeof window === 'undefined') return undefined;
    const storage = window.StorageService;
    if (!storage || typeof storage.setLastRead !== 'function') return undefined;
    let timer = null;
    const save = () => {
      timer = null;
      const rects = paragraphRefs.current.slice(0, paragraphs.length)
        .map((el) => (el ? el.getBoundingClientRect() : { top: Infinity, bottom: Infinity }));
      const index = topParagraphIndex(rects, HEADER_OFFSET);
      if (index === savedParagraph.current) return;
      savedParagraph.current = index;
      storage.setLastRead(params.id, { chapterNumber: params.ch, paragraph: index, count: paragraphs.length, title: chapter.title || '' })
        .catch((e) => console.warn('[Reader] Could not save the reading position:', e));
    };
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, SAVE_POSITION_DELAY_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [contentReady, chapterKey, chapter, params.id, params.ch, paragraphs.length]);

  const charCount = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const mins = Math.max(1, Math.round(words / 220));

  const catalogItem = novel && Array.isArray(novel.chapterList)
    ? novel.chapterList.find((c) => Number(c.chapterNumber) === params.ch)
    : null;
  const savedTitle = (chapter && chapter.title) || (catalogItem && catalogItem.title) || `Chapter ${params.ch}`;
  const fallbackTitle = conversionMode && convert ? convert(savedTitle) : savedTitle;
  const editable = !conversionMode;
  const novelTitle = (novel && novel.title) || 'Novel';
  const nameList = novel && Array.isArray(novel.nameList) ? novel.nameList : [];
  const nameMatcher = useMemo(() => createNameMatcher(nameList, { caseSensitive: true }), [nameList]);
  const highlightedParagraphs = useMemo(
    () => paragraphs.map((paragraph) => nameMatcher.split(paragraph)),
    [paragraphs, nameMatcher]
  );

  const openNameEntry = (nameId, e) => {
    const el = e && e.currentTarget;
    if (el && el.closest && el.closest('[contenteditable="true"]')) return;
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novel-open-name-list', { detail: { nameId } }));
    }
  };

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
    if (!editable) return;
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

  const editTitle = () => {
    if (!editable) return;
    makeEditable(titleRef.current, persistTitle);
  };

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
          {conversionMode ? (
            <span id="chapter-converted-badge" className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" title="Converted from the original Chinese with your name list, glossaries and Hán Việt readings. Turn it off in the novel view.">
              {convert ? 'Dictionary conversion' : 'Loading dictionaries…'}
            </span>
          ) : (
            <span className="ml-auto text-[11px] text-slate-500 italic hidden sm:inline">Double-click text to edit</span>
          )}
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
        ) : paragraphs.map((_, idx) => (
          <div key={idx} className="paragraph-block relative group rounded-md transition-all -mx-2 px-2 py-0.5 hover:bg-slate-800/30" data-idx={idx}>
            <p
              ref={(el) => { paragraphRefs.current[idx] = el; }}
              className="paragraph-text outline-none rounded transition-all cursor-text select-text"
              tabIndex={0}
              title="Double-click to edit this paragraph"
              onDoubleClick={() => editParagraph(idx)}
            >
              {detailed && detailed[idx] ? (
                <ReaderPhraseText
                  paragraph={detailed[idx]}
                  activeIndex={selected && selected.p === idx ? selected.from : -1}
                  activeEnd={selected && selected.p === idx ? selected.to : -1}
                  onSelect={(_seg, s) => setSelected({ p: idx, from: s, to: s })}
                  highlightNames={prefs.highlightNames}
                />
              ) : (
                <ReaderNameText segments={highlightedParagraphs[idx]} highlight={prefs.highlightNames} onOpenName={openNameEntry} />
              )}
            </p>
            {editable ? <div className="paragraph-actions absolute right-2 -top-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none select-none">
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
            </div> : null}
          </div>
        ))}
      </div>

      {selectedPhrase ? (
        <ReaderPhrasePopover
          phrase={selectedPhrase}
          options={selectedOptions}
          saving={savingPhrase}
          canExtendLeft={canExtendLeft}
          canExtendRight={canExtendRight}
          onExtendLeft={() => extendSelection('left')}
          onExtendRight={() => extendSelection('right')}
          onPick={(translation, source) => savePhrase(phraseSaveKind(selectedPhrase), translation, source)}
          onSaveName={(translation, source) => savePhrase('namelist', translation, source)}
          onSaveLocked={(translation, source) => savePhrase('locked', translation, source)}
          readingOf={converter && converter.readingOf}
          meaningsOf={converter && converter.meaningsOf}
          definitionsOf={definitionsOf}
          definitionsLoading={lacViet.status === 'loading'}
          definitionsError={lacViet.status === 'error'}
          onOpenName={openPhraseName}
          suggestions={phraseSuggestions}
          suggestionsLoading={suggestionsLoading}
          onAcceptSuggestion={acceptSuggestion}
          onRejectSuggestion={rejectSuggestion}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
