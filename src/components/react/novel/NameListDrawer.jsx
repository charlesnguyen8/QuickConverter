import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSnippets } from './nameListSource.js';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

function parseChapterNumber(val) {
  if (val === null || val === undefined || val === '') return Infinity;
  if (typeof val === 'number') return val;
  const match = String(val).match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : Infinity;
}

function cleanChapter(val) {
  if (val === null || val === undefined || val === '') return '';
  return String(val).replace(/^ch(?:apter)?\.?\s*/i, '');
}

function formatAddedTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function sortAndFilter(entries, search, sort) {
  let list = [...entries];
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((e) =>
      (e.original && e.original.toLowerCase().includes(q)) ||
      (e.translation && e.translation.toLowerCase().includes(q)) ||
      (e.chapterFirstSeen && String(e.chapterFirstSeen).toLowerCase().includes(q))
    );
  }
  switch (sort) {
    case 'time_asc': return list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    case 'orig_asc': return list.sort((a, b) => (a.original || '').localeCompare(b.original || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'orig_desc': return list.sort((a, b) => (b.original || '').localeCompare(a.original || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'trans_asc': return list.sort((a, b) => (a.translation || '').localeCompare(b.translation || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'trans_desc': return list.sort((a, b) => (b.translation || '').localeCompare(a.translation || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'ch_asc': return list.sort((a, b) => {
      const ca = parseChapterNumber(a.chapterFirstSeen);
      const cb = parseChapterNumber(b.chapterFirstSeen);
      if (ca !== cb) return ca - cb;
      return (a.addedAt || 0) - (b.addedAt || 0);
    });
    case 'ch_desc': return list.sort((a, b) => {
      const ca = parseChapterNumber(a.chapterFirstSeen);
      const cb = parseChapterNumber(b.chapterFirstSeen);
      if (ca !== cb) {
        if (ca === Infinity) return 1;
        if (cb === Infinity) return -1;
        return cb - ca;
      }
      return (b.addedAt || 0) - (a.addedAt || 0);
    });
    default: return list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
}

function parseBulkLines(text) {
  if (!text) return [];
  const parsed = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith(';')) continue;
    let chapter = null;
    const commentMatch = line.match(/(?:#|\/\/)\s*(?:ch(?:apter)?\.?\s*)?(\d+(?:\.\d+)?)/i);
    if (commentMatch) {
      chapter = commentMatch[1];
      line = line.substring(0, commentMatch.index).trim();
    }
    let orig = '';
    let trans = '';
    if (line.includes('=')) {
      const parts = line.split('=');
      orig = parts[0].trim();
      trans = parts.slice(1).join('=').trim();
    } else if (line.includes('\t')) {
      const parts = line.split('\t');
      orig = parts[0].trim();
      trans = parts.slice(1).join('\t').trim();
    } else if (line.includes(' - ')) {
      const parts = line.split(' - ');
      orig = parts[0].trim();
      trans = parts.slice(1).join(' - ').trim();
    }
    if (orig && trans) parsed.push({ original: orig, translation: trans, chapterFirstSeen: chapter || null });
  }
  return parsed;
}

function exportToBulkText(entries) {
  if (entries.length === 0) return '';
  return entries.map((e) => {
    const ch = e.chapterFirstSeen ? ` # Ch. ${cleanChapter(e.chapterFirstSeen)}` : '';
    return `${e.original} = ${e.translation}${ch}`;
  }).join('\n');
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon({ size = 13 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

const inputCls = 'px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

function SourceSnippet({ snippet }) {
  return (
    <p className="text-xs text-slate-300 leading-relaxed break-words">
      <span className="text-slate-500">{snippet.before}</span>
      <mark className="bg-amber-500/30 text-amber-100 rounded px-0.5">{snippet.match}</mark>
      <span className="text-slate-500">{snippet.after}</span>
    </p>
  );
}

export default function NameListDrawer() {
  const [novelId] = useState(getNovelId);
  const [open, setOpen] = useState(false);
  const [entries, setEntriesState] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('time_desc');
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('Add New Name');
  const [formId, setFormId] = useState('');
  const [formOriginal, setFormOriginal] = useState('');
  const [formTranslation, setFormTranslation] = useState('');
  const [formChapter, setFormChapter] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkStatus, setBulkStatus] = useState(null);
  const searchInputRef = useRef(null);
  const [sourceEntry, setSourceEntry] = useState(null);
  const [sourceChapter, setSourceChapter] = useState(null);
  const [scanAll, setScanAll] = useState(null);

  const setEntries = useCallback((next) => {
    setEntriesState(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novel-name-list-updated', { detail: { count: next.length } }));
    }
  }, []);

  const reload = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    try {
      const list = await storage.getNameList(novelId);
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Error loading name list:', e);
    }
  }, [novelId, setEntries]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener('novel-open-name-list', onOpen);
    return () => window.removeEventListener('novel-open-name-list', onOpen);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open && searchInputRef.current) searchInputRef.current.focus();
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setSourceEntry((current) => {
        if (current) return null;
        if (open) setOpen(false);
        return current;
      });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    setEditingId(null);
    setFormOpen(false);
    setBulkOpen(false);
    setSourceEntry(null);
    setSourceChapter(null);
    setScanAll(null);
  }, []);

  const openSource = useCallback(async (entry) => {
    setSourceEntry(entry);
    setScanAll(null);
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    const chNum = parseChapterNumber(entry.chapterFirstSeen);
    if (!storage || !novelId || !Number.isFinite(chNum)) {
      setSourceChapter({ loading: false, missing: true });
      return;
    }
    setSourceChapter({ loading: true, chapterNumber: chNum });
    try {
      const record = await storage.getChapter(novelId, chNum);
      if (!record) {
        setSourceChapter({ loading: false, chapterNumber: chNum, missing: true });
      } else {
        setSourceChapter({ loading: false, chapterNumber: chNum, title: record.title, text: record.originalRawText || '' });
      }
    } catch (e) {
      setSourceChapter({ loading: false, chapterNumber: chNum, error: e.message });
    }
  }, [novelId]);

  const scanAllChapters = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId || !sourceEntry) return;
    setScanAll({ loading: true, results: [] });
    try {
      const chapters = await storage.getNovelChapters(novelId);
      const term = sourceEntry.original;
      const results = [];
      for (const chapter of chapters) {
        const { count, snippets } = buildSnippets(chapter.originalRawText || '', term);
        if (count > 0) {
          results.push({ chapterNumber: chapter.chapterNumber, title: chapter.title, count, snippets });
        }
      }
      setScanAll({ loading: false, results });
    } catch (e) {
      setScanAll({ loading: false, results: [], error: e.message });
    }
  }, [novelId, sourceEntry]);

  const closeSource = useCallback(() => setSourceEntry(null), []);

  const filtered = useMemo(() => sortAndFilter(entries, search.trim(), sort), [entries, search, sort]);

  const resetForm = () => {
    setFormId('');
    setFormOriginal('');
    setFormTranslation('');
    setFormChapter('');
    setFormTitle('Add New Name');
  };

  const openAddForm = () => {
    resetForm();
    setBulkOpen(false);
    setFormOpen(true);
  };

  const checkNameForm = () => {
    if (formOpen) { setFormOpen(false); resetForm(); } else { openAddForm(); }
  };

  const submitForm = async (e) => {
    e.preventDefault();
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    const orig = formOriginal.trim();
    const trans = formTranslation.trim();
    const ch = formChapter.trim();
    if (!orig || !trans) return;

    if (formId) {
      if (typeof storage.updateNameEntry === 'function') {
        await storage.updateNameEntry(novelId, formId, { original: orig, translation: trans, chapterFirstSeen: ch || null });
      }
    } else if (typeof storage.addNameEntry === 'function') {
      await storage.addNameEntry(novelId, { original: orig, translation: trans, chapterFirstSeen: ch || null });
    }
    setFormOpen(false);
    resetForm();
    await reload();
  };

  const startEdit = (entry) => {
    setFormOpen(false);
    setBulkOpen(false);
    setEditingId(entry.id);
  };

  const saveInline = async (id, fields) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    const orig = fields.original.trim();
    const trans = fields.translation.trim();
    if (!orig || !trans) return;
    if (typeof storage.updateNameEntry === 'function') {
      await storage.updateNameEntry(novelId, id, { original: orig, translation: trans, chapterFirstSeen: fields.chapter.trim() || null });
    }
    setEditingId(null);
    await reload();
  };

  const deleteEntry = async (id) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    if (typeof storage.deleteNameEntry === 'function') await storage.deleteNameEntry(novelId, id);
    if (editingId === id) setEditingId(null);
    await reload();
  };

  const toggleBulk = () => {
    if (bulkOpen) { setBulkOpen(false); return; }
    setFormOpen(false);
    setBulkOpen(true);
    setBulkStatus(null);
    if (!bulkText.trim() || bulkText === exportToBulkText(entries)) {
      setBulkText(exportToBulkText(entries));
    }
  };

  const exportBulk = async () => {
    const text = exportToBulkText(entries);
    setBulkText(text);
    if (!text) {
      setBulkStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 block', msg: 'Name list is currently empty.' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setBulkStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block', msg: `Copied ${entries.length} names to clipboard! ✓` });
    } catch (e) {
      setBulkStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 block', msg: 'Generated names above. Copy with Ctrl+C' });
    }
  };

  const importBulk = async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    const parsed = parseBulkLines(bulkText);
    if (parsed.length === 0) {
      setBulkStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 block', msg: 'No valid "Original = Translation" lines found.' });
      return;
    }
    let addedCount = 0;
    let updatedCount = 0;
    const next = [...entries];
    for (const item of parsed) {
      const idx = next.findIndex((e) => e.original.toLowerCase() === item.original.toLowerCase());
      if (idx !== -1) {
        next[idx] = { ...next[idx], translation: item.translation, chapterFirstSeen: item.chapterFirstSeen || next[idx].chapterFirstSeen };
        updatedCount++;
      } else {
        next.unshift({
          id: 'name_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          original: item.original,
          translation: item.translation,
          chapterFirstSeen: item.chapterFirstSeen,
          addedAt: Date.now()
        });
        addedCount++;
      }
    }
    if (typeof storage.saveNameList === 'function') await storage.saveNameList(novelId, next);
    setEntries(next);
    setBulkStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block', msg: `Import complete: ${addedCount} added, ${updatedCount} updated! ✓` });
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!open}
      onClick={closeDrawer}
    >
      <div className="fixed inset-0 flex justify-end overflow-hidden">
        {sourceEntry ? (
          <div
            id="name-list-source-panel"
            className="w-full md:max-w-md h-full bg-slate-950 border-l border-slate-700/80 shadow-2xl flex flex-col text-slate-100"
            role="dialog"
            aria-modal="true"
            aria-label="Source occurrences"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-10 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button type="button" onClick={closeSource} className="md:hidden p-1.5 -ml-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0" title="Back to names">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-100 font-mono truncate">{sourceEntry.original}</span>
                    <span className="text-xs text-slate-500 font-bold flex-shrink-0">=</span>
                    <span className="text-sm font-bold text-emerald-400 truncate">{sourceEntry.translation}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Occurrences in the source text</p>
                </div>
              </div>
              <button type="button" onClick={closeSource} className="hidden md:inline-flex p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0" title="Close source panel">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {sourceChapter && sourceChapter.loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
                  <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Loading source chapter...</span>
                </div>
              ) : sourceChapter && sourceChapter.error ? (
                <p className="text-xs text-rose-300">{sourceChapter.error}</p>
              ) : sourceChapter && sourceChapter.missing ? (
                <p className="text-xs text-slate-400">No chapter first seen recorded for this name, or its source text isn't downloaded yet.</p>
              ) : sourceChapter && !sourceChapter.text ? (
                <p className="text-xs text-slate-400">No source text saved for Chapter {cleanChapter(sourceChapter.chapterNumber)}.</p>
              ) : sourceChapter ? (
                (() => {
                  const { count, snippets } = buildSnippets(sourceChapter.text, sourceEntry.original);
                  return (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-slate-300 truncate">{sourceChapter.title || `Chapter ${sourceChapter.chapterNumber}`}</span>
                        <span className="text-[11px] text-slate-400 flex-shrink-0">{count} match{count === 1 ? '' : 'es'}</span>
                      </div>
                      {snippets.length === 0 ? (
                        <p className="text-xs text-slate-400">Not found in this chapter. Try scanning all downloaded chapters below.</p>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {snippets.map((snippet, i) => <SourceSnippet key={i} snippet={snippet} />)}
                        </div>
                      )}
                    </>
                  );
                })()
              ) : null}

              <button
                type="button"
                onClick={scanAllChapters}
                disabled={scanAll && scanAll.loading}
                className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scanAll && scanAll.loading ? 'Scanning...' : 'Scan all downloaded chapters'}
              </button>

              {scanAll && !scanAll.loading ? (
                scanAll.error ? (
                  <p className="text-xs text-rose-300">{scanAll.error}</p>
                ) : scanAll.results.length === 0 ? (
                  <p className="text-xs text-slate-400">Not found in any downloaded chapter.</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {scanAll.results.map((result) => (
                      <div key={result.chapterNumber} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-300 truncate">{result.title || `Chapter ${result.chapterNumber}`}</span>
                          <span className="text-[11px] text-slate-400 flex-shrink-0">{result.count} match{result.count === 1 ? '' : 'es'}</span>
                        </div>
                        <div className="flex flex-col gap-3 border-l-2 border-slate-800 pl-3">
                          {result.snippets.map((snippet, i) => <SourceSnippet key={i} snippet={snippet} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </div>
        ) : null}
        <div
          id="name-list-drawer-panel"
          className={`${sourceEntry ? 'hidden md:flex' : 'flex'} w-full max-w-xl bg-slate-900 border-l border-slate-700/80 shadow-2xl flex-col h-full transform transition-transform duration-300 ease-out text-slate-100 ${open ? 'translate-x-0' : 'translate-x-full'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="name-list-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-10 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📖</span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="name-list-title" className="text-base font-bold text-slate-100">Name List &amp; Glossary</h2>
                  <span id="name-list-badge" className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{entries.length}</span>
                </div>
                <p className="text-xs text-slate-400 truncate max-w-xs" id="name-list-novel-title">Character &amp; place name glossary</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleBulk} className="inline-flex items-center justify-center gap-1 h-8 whitespace-nowrap text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2.5 rounded-md transition cursor-pointer" title="Bulk Import / Export lines (Original = Translation)">
                <span>📥 Bulk</span>
              </button>
              <button type="button" onClick={checkNameForm} className="inline-flex items-center justify-center gap-1 h-8 whitespace-nowrap text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 px-2.5 rounded-md transition cursor-pointer shadow-sm">
                <span>+ Add Name</span>
              </button>
              <button type="button" onClick={closeDrawer} className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer ml-1" title="Close Name List (Esc)">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {formOpen ? (
            <div id="name-list-form-card" className="border-b border-slate-800 bg-slate-800/60 p-5 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-300">{formTitle}</h3>
                <button type="button" onClick={() => { setFormOpen(false); resetForm(); }} className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer">Cancel</button>
              </div>
              <form onSubmit={submitForm} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-300">Original Name <span className="text-rose-400">*</span></label>
                    <input type="text" required value={formOriginal} onChange={(e) => setFormOriginal(e.target.value)} placeholder="e.g. Yanguo" className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-300">Translated Name <span className="text-rose-400">*</span></label>
                    <input type="text" required value={formTranslation} onChange={(e) => setFormTranslation(e.target.value)} placeholder="e.g. Yên quốc" className={inputCls} />
                  </div>
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex flex-col gap-1 w-44">
                    <label className="text-[11px] font-semibold text-slate-300">Chapter First Seen</label>
                    <input type="text" value={formChapter} onChange={(e) => setFormChapter(e.target.value)} placeholder="e.g. 1 or Ch. 1" className={inputCls} />
                  </div>
                  <button type="submit" className="flex-1 py-1.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer text-center">Save Entry</button>
                </div>
              </form>
            </div>
          ) : null}

          {bulkOpen ? (
            <div id="name-list-bulk-card" className="border-b border-slate-800 bg-slate-800/80 p-5 flex-shrink-0 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">Bulk Import / Export</h3>
                <button type="button" onClick={() => setBulkOpen(false)} className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer">Close</button>
              </div>
              <p className="text-xs text-slate-400">
                Paste names with <code className="text-purple-300">Original = Translation</code> (one per line). Optionally add <code className="text-slate-300"># Ch. X</code> at the end.
              </p>
              <textarea rows="6" value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'Yanguo = Yên quốc\nLi Qiye = Lý Thất Dạ # Ch. 1\nWang Lin = Vương Lâm'} className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500" />
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={exportBulk} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5">
                  <span>📋 Copy All to Clipboard</span>
                </button>
                <button type="button" onClick={importBulk} className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer">Import Lines</button>
              </div>
              {bulkStatus ? <div className={bulkStatus.cls}>{bulkStatus.msg}</div> : null}
            </div>
          ) : null}

          <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
            <div className="relative flex-1">
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or translation..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {search ? (
                <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs cursor-pointer">✕</button>
              ) : null}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] font-semibold text-slate-400">Sort:</span>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="time_desc">Time Added (Newest)</option>
                <option value="time_asc">Time Added (Oldest)</option>
                <option value="orig_asc">Name (A → Z)</option>
                <option value="orig_desc">Name (Z → A)</option>
                <option value="trans_asc">Translation (A → Z)</option>
                <option value="trans_desc">Translation (Z → A)</option>
                <option value="ch_asc">Chapter First Seen (Low → High)</option>
                <option value="ch_desc">Chapter First Seen (High → Low)</option>
              </select>
            </div>
          </div>

          <div id="name-list-items" className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl text-slate-400 mb-3">📖</div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">No names added yet</h4>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  Add character, sect, and location names (e.g. <span className="text-slate-200 font-mono">Yanguo = Yên quốc</span>) to keep a handy reading glossary.
                </p>
                <button type="button" onClick={openAddForm} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer">+ Add First Name</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <p className="text-xs text-slate-400 mb-2">No names matching "<span className="text-slate-200 font-semibold">{search}</span>"</p>
                <button type="button" onClick={() => setSearch('')} className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer">Clear search filter</button>
              </div>
            ) : (
              filtered.map((entry) => (
                editingId === entry.id ? (
                  <InlineEditRow
                    key={entry.id}
                    entry={entry}
                    onCancel={() => setEditingId(null)}
                    onSave={(fields) => saveInline(entry.id, fields)}
                  />
                ) : (
                  <div
                    key={entry.id}
                    onClick={() => openSource(entry)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSource(entry); } }}
                    title="View this name in the source text"
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60 hover:border-indigo-500/60 hover:bg-slate-800 transition group cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                  >
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-100 font-mono tracking-tight">{entry.original}</span>
                        <span className="text-xs text-slate-500 font-bold">=</span>
                        <span className="font-bold text-sm text-emerald-400">{entry.translation}</span>
                        {cleanChapter(entry.chapterFirstSeen) ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">Ch. {cleanChapter(entry.chapterFirstSeen)}</span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                        <span>Added: {formatAddedTime(entry.addedAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition flex-shrink-0">
                      <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(entry); }} className="p-1.5 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 transition cursor-pointer" title="Edit entry">
                        <EditIcon />
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }} className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition cursor-pointer" title="Delete entry">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                )
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineEditRow({ entry, onCancel, onSave }) {
  const [original, setOriginal] = useState(entry.original || '');
  const [translation, setTranslation] = useState(entry.translation || '');
  const [chapter, setChapter] = useState(cleanChapter(entry.chapterFirstSeen));
  const originalRef = useRef(null);

  useEffect(() => {
    if (originalRef.current) {
      originalRef.current.focus();
      originalRef.current.select();
    }
  }, []);

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave({ original, translation, chapter });
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-slate-800/90 border border-indigo-500/60 ring-1 ring-indigo-500/25 transition">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input ref={originalRef} type="text" value={original} onChange={(e) => setOriginal(e.target.value)} onKeyDown={handleKey} placeholder="Original Name" className="w-full min-w-0 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        <input type="text" value={translation} onChange={(e) => setTranslation(e.target.value)} onKeyDown={handleKey} placeholder="Translated Name" className="w-full min-w-0 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
      </div>
      <div className="flex items-center gap-2">
        <input type="text" value={chapter} onChange={(e) => setChapter(e.target.value)} onKeyDown={handleKey} placeholder="Chapter First Seen (e.g. 1)" className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        <button type="button" onClick={() => onSave({ original, translation, chapter })} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer" title="Save changes (Enter)">Save</button>
        <button type="button" onClick={onCancel} className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition cursor-pointer" title="Cancel (Esc)">Cancel</button>
      </div>
    </div>
  );
}
