import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildSnippets, computeVirtualWindow, findNameConflicts } from './nameListSource.js';

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

function nameKey(val) {
  return (val || '').trim().toLowerCase();
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

function CheckIcon({ size = 13 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function LockIcon({ size = 13 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

const inputCls = 'px-3 py-2.5 sm:py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';

const ROW_HEIGHT = 96;
const VIRTUAL_OVERSCAN = 6;
const VIRTUALIZE_AT = 80;

const LIST_TABS = [
  { id: 'namelist', label: 'Name List', title: 'Name List', subtitle: 'Character & place name glossary' },
  { id: 'locked', label: 'Locked Glossary', title: 'Locked Glossary', subtitle: 'Terms pinned to an exact translation' },
  { id: 'soft', label: 'Soft Glossary', title: 'Soft Glossary', subtitle: 'Preferred terms kept as suggestions' }
];

const FORMAT_PROMPT = 'For each source term below, output its translation. Return ONLY one block in this exact format, with no extra text or explanation:\n<<<TRANSLATION_START>>>\nname=translation|name=translation|...\n<<<TRANSLATION_END>>>';

const PROMPT_SELECTABLE_TABS = ['namelist', 'locked'];

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
  const [activeTab, setActiveTab] = useState('namelist');
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
  const listRef = useRef(null);
  const scrollRaf = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [listViewport, setListViewport] = useState(600);
  const [sourceEntry, setSourceEntry] = useState(null);
  const sourceEntryRef = useRef(null);
  sourceEntryRef.current = sourceEntry;
  const [sourceChapter, setSourceChapter] = useState(null);
  const [scanAll, setScanAll] = useState(null);
  const [renamePrompt, setRenamePrompt] = useState(null);
  const renamePromptRef = useRef(null);
  renamePromptRef.current = renamePrompt;
  const [deleteAllPrompt, setDeleteAllPrompt] = useState(false);
  const deleteAllPromptRef = useRef(false);
  deleteAllPromptRef.current = deleteAllPrompt;
  const [duplicatePrompt, setDuplicatePrompt] = useState(null);
  const duplicatePromptRef = useRef(null);
  duplicatePromptRef.current = duplicatePrompt;
  const [focusedNameId, setFocusedNameId] = useState(null);
  const [nameConflicts, setNameConflicts] = useState([]);
  const [dismissedConflicts, setDismissedConflicts] = useState(() => new Set());
  const [conflictPrompt, setConflictPrompt] = useState(null);
  const conflictPromptRef = useRef(null);
  conflictPromptRef.current = conflictPrompt;
  const [conflictsOpen, setConflictsOpen] = useState(true);
  const [promptPanelOpen, setPromptPanelOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [resultText, setResultText] = useState('');
  const [promptStatus, setPromptStatus] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [promptLists, setPromptLists] = useState({ namelist: [], locked: [] });
  const promptPanelRef = useRef(false);
  promptPanelRef.current = promptPanelOpen;
  const [strictConflicts, setStrictConflicts] = useState(() => {
    const S = typeof window !== 'undefined' ? window.StorageService : null;
    try {
      return S && typeof S.getPreference === 'function'
        ? S.getPreference('quickconverter_namelist_strict_conflicts', 'false') === 'true'
        : false;
    } catch (e) {
      return false;
    }
  });

  const setEntries = useCallback((next) => {
    setEntriesState(next);
    if (typeof window !== 'undefined' && activeTabRef.current === 'namelist') {
      window.dispatchEvent(new CustomEvent('novel-name-list-updated', { detail: { count: next.length } }));
    }
  }, []);

  const activeTabRef = useRef('namelist');
  activeTabRef.current = activeTab;

  const reload = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    try {
      const list = await storage.getNameList(novelId, activeTab);
      setEntries(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Error loading name list:', e);
    }
  }, [novelId, activeTab, setEntries]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const onOpen = (e) => {
      setOpen(true);
      const nameId = e && e.detail && e.detail.nameId;
      if (nameId) {
        setSearch('');
        setFocusedNameId(nameId);
      }
    };
    window.addEventListener('novel-open-name-list', onOpen);
    return () => window.removeEventListener('novel-open-name-list', onOpen);
  }, []);

  useEffect(() => {
    if (!open || !focusedNameId) return undefined;
    const list = filteredRef.current || [];
    const index = list.findIndex((e) => e.id === focusedNameId);
    const container = listRef.current;
    const virtual = list.length > VIRTUALIZE_AT && !editingId;
    if (container && virtual && index >= 0) {
      const top = Math.max(0, index * ROW_HEIGHT - (container.clientHeight - ROW_HEIGHT) / 2);
      container.scrollTop = top;
      setScrollTop(top);
    } else {
      const el = typeof document !== 'undefined' ? document.getElementById(`name-list-item-${focusedNameId}`) : null;
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const timer = setTimeout(() => setFocusedNameId(null), 1600);
    return () => clearTimeout(timer);
  }, [open, focusedNameId, editingId]);

  useEffect(() => {
    if (!open) return undefined;
    const container = listRef.current;
    if (!container) return undefined;
    const measure = () => setListViewport(container.clientHeight || 600);
    measure();
    window.addEventListener('resize', measure);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(container);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (observer) observer.disconnect();
    };
  }, [open]);

  useEffect(() => {
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [search, sort]);

  useEffect(() => {
    setDismissedConflicts(new Set());
  }, [entries, strictConflicts]);

  useEffect(() => {
    if (!open) return undefined;
    const compute = () => {
      try {
        setNameConflicts(findNameConflicts(entries, { strict: strictConflicts }));
      } catch (e) {
        console.error('Name conflict check failed:', e);
      }
    };
    if (typeof requestAnimationFrame === 'undefined') { compute(); return undefined; }
    const id = requestAnimationFrame(compute);
    return () => cancelAnimationFrame(id);
  }, [open, entries, strictConflicts]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open && searchInputRef.current) searchInputRef.current.focus();
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (conflictPromptRef.current) { e.preventDefault(); setConflictPrompt(null); return; }
      if (renamePromptRef.current) { e.preventDefault(); setRenamePrompt(null); return; }
      if (duplicatePromptRef.current) { e.preventDefault(); setDuplicatePrompt(null); return; }
      if (deleteAllPromptRef.current) { e.preventDefault(); setDeleteAllPrompt(false); return; }
      if (promptPanelRef.current) { e.preventDefault(); setPromptPanelOpen(false); return; }
      if (sourceEntryRef.current || open) e.preventDefault();
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
    setRenamePrompt(null);
    setDeleteAllPrompt(false);
    setDuplicatePrompt(null);
    setConflictPrompt(null);
    setPromptPanelOpen(false);
  }, []);

  const selectTab = useCallback((id) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setSearch('');
    setSort('time_desc');
    setEditingId(null);
    setFormOpen(false);
    setBulkOpen(false);
    setBulkStatus(null);
    setSourceEntry(null);
    setSourceChapter(null);
    setScanAll(null);
    setFocusedNameId(null);
    setDismissedConflicts(new Set());
  }, [activeTab]);

  const openSource = useCallback(async (entry) => {
    setPromptPanelOpen(false);
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

  const markNameSeen = useCallback((id) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    const next = entries.map((entry) => (entry.id === id ? { ...entry, isNew: false } : entry));
    setEntries(next);
    if (typeof storage.saveNameList === 'function') {
      Promise.resolve(storage.saveNameList(novelId, next, activeTab)).catch((e) => console.error('Failed to mark name seen:', e));
    }
  }, [entries, novelId, activeTab, setEntries]);

  const applyTranslationRename = useCallback(async (oldName, newName) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId || !oldName || !newName || oldName === newName) return;
    if (typeof storage.replaceInChapters !== 'function') return;
    try {
      const preview = await storage.replaceInChapters(novelId, oldName, newName, { dryRun: true });
      if (!preview.count) return;
      setRenamePrompt({
        changes: [{ oldName, newName, count: preview.count, chaptersChanged: preview.chaptersChanged }],
        count: preview.count,
        chaptersChanged: preview.chaptersChanged
      });
    } catch (e) {
      console.error('Error counting name occurrences:', e);
    }
  }, [novelId]);

  const confirmRename = useCallback(async () => {
    const prompt = renamePrompt;
    setRenamePrompt(null);
    if (!prompt) return;
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || typeof storage.replaceInChapters !== 'function') return;
    const changes = Array.isArray(prompt.changes) && prompt.changes.length > 0
      ? prompt.changes
      : [{ oldName: prompt.oldName, newName: prompt.newName }];
    try {
      for (const change of changes) {
        if (change.oldName && change.newName) await storage.replaceInChapters(novelId, change.oldName, change.newName);
      }
      window.dispatchEvent(new Event('reader-chapter-refresh'));
    } catch (e) {
      console.error('Error replacing name across chapters:', e);
    }
  }, [novelId, renamePrompt]);

  const loadPromptLists = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId || typeof storage.getNameList !== 'function') return;
    try {
      const [names, locked] = await Promise.all([
        storage.getNameList(novelId, 'namelist'),
        storage.getNameList(novelId, 'locked')
      ]);
      setPromptLists({ namelist: Array.isArray(names) ? names : [], locked: Array.isArray(locked) ? locked : [] });
    } catch (e) {
      console.error('Error loading prompt lists:', e);
    }
  }, [novelId]);

  useEffect(() => {
    if (!promptPanelOpen) return;
    loadPromptLists();
  }, [promptPanelOpen, loadPromptLists, entries]);

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!promptPanelOpen || !storage || !novelId || typeof storage.getPreference !== 'function') return;
    try {
      setCustomPrompt(storage.getPreference(`quickconverter_glossary_prompt::${novelId}`, '') || '');
    } catch (e) {}
  }, [promptPanelOpen, novelId]);

  const updateCustomPrompt = useCallback((value) => {
    setCustomPrompt(value);
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    try {
      if (storage && typeof storage.setPreference === 'function') {
        storage.setPreference(`quickconverter_glossary_prompt::${novelId}`, value);
      }
    } catch (e) {}
  }, [novelId]);

  const toggleSelected = useCallback((kind, id) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const key = `${kind}::${id}`;
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const clearSelected = useCallback(() => setSelectedKeys(new Set()), []);

  const selectedTerms = useMemo(() => {
    const terms = [];
    PROMPT_SELECTABLE_TABS.forEach((kind) => {
      (promptLists[kind] || []).forEach((entry) => {
        if (selectedKeys.has(`${kind}::${entry.id}`)) terms.push(entry.original);
      });
    });
    return terms;
  }, [promptLists, selectedKeys]);

  const finalPrompt = useMemo(() => {
    const parts = [];
    const custom = customPrompt.trim();
    if (custom) parts.push(custom);
    parts.push(FORMAT_PROMPT);
    if (selectedTerms.length > 0) parts.push(`Source terms:\n${selectedTerms.join('\n')}`);
    return parts.join('\n\n');
  }, [customPrompt, selectedTerms]);

  const openPromptPanel = useCallback(() => {
    setSourceEntry(null);
    setSourceChapter(null);
    setScanAll(null);
    setPromptStatus(null);
    setPromptPanelOpen(true);
  }, []);

  const closePromptPanel = useCallback(() => setPromptPanelOpen(false), []);

  const copyFinalPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setPromptStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block', msg: 'Copied full prompt to clipboard! ✓' });
    } catch (e) {
      setPromptStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 block', msg: 'Select the text above and copy with Ctrl+C.' });
    }
  }, [finalPrompt]);

  const processTranslationResult = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    const pairs = typeof storage.parseTranslationBlock === 'function' ? storage.parseTranslationBlock(resultText) : [];
    if (pairs.length === 0) {
      setPromptStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 block', msg: 'No "name=translation" pairs found. Paste the block the model returned.' });
      return;
    }
    try {
      const names = await storage.getNameList(novelId, 'namelist');
      const locked = await storage.getNameList(novelId, 'locked');
      const kindLists = [['namelist', Array.isArray(names) ? names : []], ['locked', Array.isArray(locked) ? locked : []]];
      let updated = 0;
      const changed = new Map();
      for (const pair of pairs) {
        const key = nameKey(pair.original);
        for (const [kind, list] of kindLists) {
          const entry = list.find((e) => nameKey(e.original) === key);
          if (!entry) continue;
          const oldTranslation = entry.translation || '';
          if (oldTranslation === pair.translation) continue;
          if (typeof storage.updateNameEntry === 'function') {
            await storage.updateNameEntry(novelId, entry.id, { translation: pair.translation }, kind);
            updated++;
            if (oldTranslation) changed.set(`${oldTranslation}\u0000${pair.translation}`, { oldName: oldTranslation, newName: pair.translation });
          }
        }
      }
      await reload();
      await loadPromptLists();
      if (updated === 0) {
        setPromptStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 block', msg: 'No matching Name List / Locked entries were updated (unknown sources are ignored).' });
        return;
      }
      setPromptStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block', msg: `Updated ${updated} entr${updated === 1 ? 'y' : 'ies'}. ✓` });

      const previews = [];
      if (typeof storage.replaceInChapters === 'function') {
        for (const change of changed.values()) {
          const preview = await storage.replaceInChapters(novelId, change.oldName, change.newName, { dryRun: true });
          if (preview && preview.count > 0) previews.push({ ...change, count: preview.count, chaptersChanged: preview.chaptersChanged });
        }
      }
      if (previews.length > 0) {
        setRenamePrompt({
          changes: previews,
          count: previews.reduce((sum, c) => sum + c.count, 0),
          chaptersChanged: previews.reduce((sum, c) => sum + (c.chaptersChanged || 0), 0)
        });
      }
    } catch (e) {
      console.error('Error processing translation result:', e);
      setPromptStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 block', msg: `Processing failed: ${e.message}` });
    }
  }, [novelId, resultText, reload, loadPromptLists]);

  const confirmDeleteAll = useCallback(async () => {
    setDeleteAllPrompt(false);
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    try {
      if (typeof storage.saveNameList === 'function') await storage.saveNameList(novelId, [], activeTab);
      setSourceEntry(null);
      setEditingId(null);
      await reload();
    } catch (e) {
      console.error('Error clearing name list:', e);
    }
  }, [novelId, reload, activeTab]);

  const confirmDuplicate = useCallback(async () => {
    const prompt = duplicatePrompt;
    setDuplicatePrompt(null);
    if (!prompt) return;
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    try {
      const existing = entries.find((entry) => entry.id === prompt.existingId);
      if (typeof storage.updateNameEntry === 'function') {
        await storage.updateNameEntry(novelId, prompt.existingId, {
          original: prompt.original,
          translation: prompt.translation,
          chapterFirstSeen: prompt.chapter || (existing ? existing.chapterFirstSeen : null)
        }, activeTab);
      }
      if (prompt.removeId && prompt.removeId !== prompt.existingId && typeof storage.deleteNameEntry === 'function') {
        await storage.deleteNameEntry(novelId, prompt.removeId, activeTab);
      }
      if (prompt.existingTranslation && prompt.existingTranslation !== prompt.translation) {
        await applyTranslationRename(prompt.existingTranslation, prompt.translation);
      }
      await reload();
    } catch (e) {
      console.error('Error resolving duplicate name:', e);
    }
  }, [duplicatePrompt, entries, novelId, reload, applyTranslationRename, activeTab]);

  const activeMeta = LIST_TABS.find((tab) => tab.id === activeTab) || LIST_TABS[0];
  const filtered = useMemo(() => sortAndFilter(entries, search.trim(), sort), [entries, search, sort]);
  const filteredRef = useRef([]);
  filteredRef.current = filtered;
  const virtualize = !editingId && filtered.length > VIRTUALIZE_AT;
  const windowRange = virtualize
    ? computeVirtualWindow(filtered.length, scrollTop, listViewport, ROW_HEIGHT, VIRTUAL_OVERSCAN)
    : { start: 0, end: filtered.length };
  const visibleEntries = virtualize ? filtered.slice(windowRange.start, windowRange.end) : filtered;

  const conflictById = useMemo(() => {
    const map = new Map();
    nameConflicts.forEach((conflict) => { if (!map.has(conflict.longerId)) map.set(conflict.longerId, conflict); });
    return map;
  }, [nameConflicts]);
  const activeConflictIds = useMemo(() => {
    const ids = new Set();
    conflictById.forEach((conflict, id) => { if (!dismissedConflicts.has(id)) ids.add(id); });
    return ids;
  }, [conflictById, dismissedConflicts]);
  const activeConflicts = useMemo(
    () => nameConflicts
      .filter((conflict) => !dismissedConflicts.has(conflict.longerId))
      .sort((a, b) => a.longerOriginal.localeCompare(b.longerOriginal)),
    [nameConflicts, dismissedConflicts]
  );

  const toggleStrictConflicts = () => {
    setStrictConflicts((prev) => {
      const next = !prev;
      const storage = typeof window !== 'undefined' ? window.StorageService : null;
      try {
        if (storage && typeof storage.setPreference === 'function') storage.setPreference('quickconverter_namelist_strict_conflicts', next ? 'true' : 'false');
      } catch (e) {}
      return next;
    });
  };

  const dismissConflict = () => {
    const conflict = conflictPrompt;
    setConflictPrompt(null);
    if (conflict) setDismissedConflicts((prev) => new Set(prev).add(conflict.longerId));
  };

  const editConflict = () => {
    const conflict = conflictPrompt;
    setConflictPrompt(null);
    if (!conflict) return;
    const entry = entries.find((e) => e.id === conflict.longerId);
    if (entry) {
      startEdit(entry);
      setFocusedNameId(conflict.longerId);
    }
  };

  const onListScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    if (typeof requestAnimationFrame === 'undefined') { setScrollTop(top); return; }
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => { scrollRaf.current = 0; setScrollTop(top); });
  };

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

    const duplicate = entries.find((entry) => nameKey(entry.original) === nameKey(orig) && entry.id !== formId);
    if (duplicate) {
      setDuplicatePrompt({
        existingId: duplicate.id,
        existingOriginal: duplicate.original,
        existingTranslation: duplicate.translation,
        original: duplicate.original,
        translation: trans,
        chapter: ch,
        removeId: formId || null
      });
      setFormOpen(false);
      resetForm();
      return;
    }

    if (formId) {
      const existing = entries.find((entry) => entry.id === formId);
      const oldTranslation = existing ? existing.translation : '';
      if (typeof storage.updateNameEntry === 'function') {
        await storage.updateNameEntry(novelId, formId, { original: orig, translation: trans, chapterFirstSeen: ch || null }, activeTab);
      }
      if (oldTranslation && oldTranslation !== trans) await applyTranslationRename(oldTranslation, trans);
    } else if (typeof storage.addNameEntry === 'function') {
      await storage.addNameEntry(novelId, { original: orig, translation: trans, chapterFirstSeen: ch || null }, activeTab);
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

    const duplicate = entries.find((entry) => nameKey(entry.original) === nameKey(orig) && entry.id !== id);
    if (duplicate) {
      setDuplicatePrompt({
        existingId: duplicate.id,
        existingOriginal: duplicate.original,
        existingTranslation: duplicate.translation,
        original: duplicate.original,
        translation: trans,
        chapter: fields.chapter.trim(),
        removeId: id
      });
      setEditingId(null);
      return;
    }

    const existing = entries.find((entry) => entry.id === id);
    const oldTranslation = existing ? existing.translation : '';
    if (typeof storage.updateNameEntry === 'function') {
      await storage.updateNameEntry(novelId, id, { original: orig, translation: trans, chapterFirstSeen: fields.chapter.trim() || null }, activeTab);
    }
    if (oldTranslation && oldTranslation !== trans) await applyTranslationRename(oldTranslation, trans);
    setEditingId(null);
    await reload();
  };

  const deleteEntry = async (id) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId) return;
    if (typeof storage.deleteNameEntry === 'function') await storage.deleteNameEntry(novelId, id, activeTab);
    if (editingId === id) setEditingId(null);
    await reload();
  };

  const moveToLocked = async (entry) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !novelId || !entry) return;
    try {
      if (typeof storage.moveNameEntry === 'function') {
        await storage.moveNameEntry(novelId, entry.id, 'soft', 'locked');
      }
      if (editingId === entry.id) setEditingId(null);
      await reload();
    } catch (e) {
      console.error('Error moving term to locked glossary:', e);
    }
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
    if (typeof storage.saveNameList === 'function') await storage.saveNameList(novelId, next, activeTab);
    setEntries(next);
    setBulkStatus({ cls: 'text-xs font-semibold py-1 px-2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 block', msg: `Import complete: ${addedCount} added, ${updatedCount} updated! ✓` });
  };

  return (
    <>
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
                <button type="button" onClick={closeSource} className="md:hidden inline-flex items-center justify-center min-h-10 min-w-10 p-2.5 -ml-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0" title="Back to names">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-sm font-bold text-slate-100 font-mono break-words">{sourceEntry.original}</span>
                    <span className="text-xs text-slate-500 font-bold flex-shrink-0">=</span>
                    <span className="text-sm font-bold text-emerald-400 break-words">{sourceEntry.translation}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Occurrences in the source text</p>
                </div>
              </div>
              <button type="button" onClick={closeSource} className="hidden md:inline-flex p-2.5 sm:p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0" title="Close source panel">
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
                className="self-start inline-flex items-center gap-1.5 px-3 py-2.5 sm:py-1.5 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        {!sourceEntry && promptPanelOpen ? (
          <div
            id="name-list-prompt-panel"
            className="w-full md:max-w-md h-full bg-slate-950 border-l border-slate-700/80 shadow-2xl flex flex-col text-slate-100"
            role="dialog"
            aria-modal="true"
            aria-label="Generate translation prompt"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-10 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button type="button" onClick={closePromptPanel} className="md:hidden inline-flex items-center justify-center min-h-10 min-w-10 p-2.5 -ml-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0" title="Back to lists">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold text-slate-100">Generate Translation Prompt</span>
                    <span id="name-list-prompt-count" className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">{selectedTerms.length}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Mark terms, copy the prompt, paste the reply back</p>
                </div>
              </div>
              <button type="button" onClick={closePromptPanel} className="hidden md:inline-flex p-2.5 sm:p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer flex-shrink-0" title="Close prompt panel">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="name-list-custom-prompt" className="text-xs font-bold uppercase tracking-wider text-indigo-300">Your Custom Prompt</label>
                  <button type="button" onClick={clearSelected} className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer">Clear {selectedTerms.length} selected</button>
                </div>
                <textarea
                  id="name-list-custom-prompt"
                  rows="3"
                  value={customPrompt}
                  onChange={(e) => updateCustomPrompt(e.target.value)}
                  placeholder="Optional: instructions to prepend, e.g. target language, tone, extra context..."
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300">Final Prompt</span>
                  <button
                    type="button"
                    id="name-list-copy-prompt-btn"
                    onClick={copyFinalPrompt}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <span>📋 Copy Prompt</span>
                  </button>
                </div>
                <textarea
                  id="name-list-final-prompt"
                  readOnly
                  value={finalPrompt}
                  rows="10"
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-300 font-mono focus:outline-none cursor-default select-all"
                />
                <p className="text-[11px] text-slate-500">Read-only. Mark Name List / Locked items to include their source terms.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">Paste LLM Result</span>
                <textarea
                  id="name-list-result-input"
                  rows="6"
                  value={resultText}
                  onChange={(e) => { setResultText(e.target.value); setPromptStatus(null); }}
                  placeholder={'<<<TRANSLATION_START>>>\nYanguo=Yên quốc|Li Qiye=Lý Thất Dạ\n<<<TRANSLATION_END>>>'}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    id="name-list-process-btn"
                    onClick={processTranslationResult}
                    className="px-4 py-2.5 sm:py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    Process Result
                  </button>
                  <span className="text-[11px] text-slate-500 text-right">Updates Name List &amp; Locked entries that already exist.</span>
                </div>
                {promptStatus ? <div id="name-list-prompt-status" className={promptStatus.cls}>{promptStatus.msg}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
        <div
          id="name-list-drawer-panel"
          className={`${sourceEntry || promptPanelOpen ? 'hidden md:flex' : 'flex'} w-full max-w-xl bg-slate-900 border-l border-slate-700/80 shadow-2xl flex-col h-full transform transition-transform duration-300 ease-out text-slate-100 ${open ? 'translate-x-0' : 'translate-x-full'}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="name-list-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-10 flex-shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl">📖</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 id="name-list-title" className="text-base font-bold text-slate-100">{activeMeta.title}</h2>
                  <span id="name-list-badge" className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">{entries.length}</span>
                </div>
                <p className="text-xs text-slate-400 truncate max-w-xs" id="name-list-novel-title">{activeMeta.subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={toggleBulk} className="inline-flex items-center justify-center gap-1 h-10 sm:h-8 whitespace-nowrap text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 sm:px-2.5 rounded-md transition cursor-pointer" title="Bulk Import / Export lines (Original = Translation)">
                <span>📥 Bulk</span>
              </button>
              <button type="button" id="name-list-generate-prompt-btn" onClick={openPromptPanel} className="inline-flex items-center justify-center gap-1 h-10 sm:h-8 whitespace-nowrap text-xs font-semibold text-amber-200 hover:text-white bg-amber-500/15 hover:bg-amber-600 border border-amber-500/40 hover:border-amber-500 px-3 sm:px-2.5 rounded-md transition cursor-pointer" title="Generate a translation prompt from selected terms">
                <span>✨ Prompt</span>
              </button>
              {entries.length > 0 ? (
                <button type="button" id="name-list-delete-all-btn" onClick={() => setDeleteAllPrompt(true)} className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-8 min-w-10 sm:min-w-0 whitespace-nowrap text-xs font-semibold text-rose-300 hover:text-white bg-slate-800 hover:bg-rose-600 border border-rose-500/30 hover:border-rose-500 px-3 sm:px-2.5 rounded-md transition cursor-pointer" title="Delete all names from the glossary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span className="hidden sm:inline">Delete All</span>
                </button>
              ) : null}
              <button type="button" onClick={checkNameForm} className="inline-flex items-center justify-center gap-1 h-10 sm:h-8 whitespace-nowrap text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 px-3 sm:px-2.5 rounded-md transition cursor-pointer shadow-sm">
                <span>+ Add Name</span>
              </button>
              <button type="button" onClick={closeDrawer} className="inline-flex items-center justify-center min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer sm:ml-1" title="Close Name List (Esc)">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div id="name-list-tabs" role="tablist" aria-label="Glossary tabs" className="flex items-stretch gap-1 px-2 sm:px-4 border-b border-slate-800 bg-slate-900/60 flex-shrink-0 overflow-x-auto">
            {LIST_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`name-list-tab-${tab.id}`}
                  aria-selected={active}
                  onClick={() => selectTab(tab.id)}
                  className={`inline-flex items-center justify-center whitespace-nowrap min-h-10 sm:min-h-0 px-3 py-2.5 sm:py-2 text-xs font-semibold border-b-2 transition cursor-pointer focus:outline-none ${active ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                >
                  {tab.label}
                </button>
              );
            })}
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
                  <button type="submit" className="flex-1 py-2.5 sm:py-1.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer text-center">Save Entry</button>
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
                <button type="button" onClick={exportBulk} className="px-3 py-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer inline-flex items-center gap-1.5">
                  <span>📋 Copy All to Clipboard</span>
                </button>
                <button type="button" onClick={importBulk} className="px-4 py-2.5 sm:py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer">Import Lines</button>
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
                className="w-full pl-8 pr-7 py-2.5 sm:py-1.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-2.5 py-2.5 sm:py-1.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer">
                <option value="time_desc">Time Added (Newest)</option>
                <option value="time_asc">Time Added (Oldest)</option>
                <option value="orig_asc">Name (A → Z)</option>
                <option value="orig_desc">Name (Z → A)</option>
                <option value="trans_asc">Translation (A → Z)</option>
                <option value="trans_desc">Translation (Z → A)</option>
                <option value="ch_asc">Chapter First Seen (Low → High)</option>
                <option value="ch_desc">Chapter First Seen (High → Low)</option>
              </select>
              <button
                type="button"
                id="name-list-conflict-strict-toggle"
                onClick={toggleStrictConflicts}
                className="px-2.5 py-2.5 sm:py-1.5 text-xs rounded-lg border border-slate-700/80 bg-slate-950 text-slate-300 hover:text-white hover:border-slate-600 transition cursor-pointer flex-shrink-0"
                title="Consistency check: how exact the translation match must be (Strict = case/accent sensitive)"
              >
                Match: {strictConflicts ? 'Strict' : 'Forgiving'}
              </button>
            </div>
          </div>

          {activeConflicts.length > 0 ? (
            <div id="name-list-conflicts" className="border-b border-rose-900/60 bg-rose-950/30 flex-shrink-0">
              <button
                type="button"
                onClick={() => setConflictsOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-4 py-2 text-left cursor-pointer hover:bg-rose-950/40 transition"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-rose-200">
                  <span>⚠</span>
                  <span>{activeConflicts.length} inconsistent name{activeConflicts.length === 1 ? '' : 's'}</span>
                </span>
                <span className="text-rose-300/80 text-xs">{conflictsOpen ? '▾' : '▸'}</span>
              </button>
              {conflictsOpen ? (
                <div className="max-h-32 overflow-y-auto px-4 pb-3 flex flex-col gap-1.5">
                  {activeConflicts.map((conflict) => (
                    <button
                      key={`${conflict.longerId}>${conflict.shorterId}`}
                      type="button"
                      onClick={() => setConflictPrompt(conflictById.get(conflict.longerId) || conflict)}
                      className="text-left text-[11px] leading-relaxed rounded-md px-2 py-2.5 sm:py-1.5 bg-slate-900/60 border border-rose-500/25 hover:border-rose-500/50 hover:bg-slate-900 transition cursor-pointer"
                      title="Review and fix"
                    >
                      <span className="font-mono text-slate-100">{conflict.longerOriginal}</span>
                      <span className="text-slate-500"> = </span>
                      <span className="text-emerald-300">{conflict.longerTranslation}</span>
                      <span className="text-slate-400"> · part </span>
                      <span className="font-mono text-slate-200">{conflict.shorterOriginal}</span>
                      <span className="text-slate-500"> = </span>
                      <span className="text-emerald-300">{conflict.shorterTranslation}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div id="name-list-items" ref={listRef} onScroll={onListScroll} className="flex-1 overflow-y-auto p-4">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl text-slate-400 mb-3">📖</div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">No names added yet</h4>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  Add character, sect, and location names (e.g. <span className="text-slate-200 font-mono">Yanguo = Yên quốc</span>) to keep a handy reading glossary.
                </p>
                <button type="button" onClick={openAddForm} className="px-3 py-2.5 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer">+ Add First Name</button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <p className="text-xs text-slate-400 mb-2">No names matching "<span className="text-slate-200 font-semibold">{search}</span>"</p>
                <button type="button" onClick={() => setSearch('')} className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer">Clear search filter</button>
              </div>
            ) : (
              <>
                {virtualize && windowRange.start > 0 ? <div style={{ height: windowRange.start * ROW_HEIGHT }} aria-hidden="true" /> : null}
                {visibleEntries.map((entry) => {
                  const isSelectable = PROMPT_SELECTABLE_TABS.includes(activeTab);
                  const isSelected = isSelectable && selectedKeys.has(`${activeTab}::${entry.id}`);
                  return editingId === entry.id ? (
                    <div key={entry.id} className="pb-2">
                      <InlineEditRow
                        entry={entry}
                        onCancel={() => setEditingId(null)}
                        onSave={(fields) => saveInline(entry.id, fields)}
                      />
                    </div>
                  ) : (
                    <div key={entry.id} style={virtualize ? { height: ROW_HEIGHT } : undefined} className="pb-2">
                      <div
                        id={`name-list-item-${entry.id}`}
                        onClick={() => { if (entry.isNew) markNameSeen(entry.id); openSource(entry); }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (entry.isNew) markNameSeen(entry.id); openSource(entry); } }}
                        title={`${entry.original} = ${entry.translation} — click to view in source`}
                        className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition group cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/50${virtualize ? ' h-full overflow-hidden' : ''} ${entry.isNew ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/15' : 'bg-slate-800/70 border-slate-700/60 hover:border-indigo-500/60 hover:bg-slate-800'}${focusedNameId === entry.id ? ' ring-2 ring-indigo-400 border-indigo-400' : ''}${isSelected ? ' ring-2 ring-amber-500/60 border-amber-500/50' : ''}`}
                      >
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="min-w-0 line-clamp-2 text-sm leading-snug">
                            <span className="font-bold text-slate-100 font-mono tracking-tight break-words">{entry.original}</span>
                            <span className="text-xs text-slate-500 font-bold mx-1">=</span>
                            <span className="font-bold text-emerald-400 break-words">{entry.translation}</span>
                            {entry.isNew ? (
                              <span className="ml-1 align-middle text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">New</span>
                            ) : null}
                            {cleanChapter(entry.chapterFirstSeen) ? (
                              <span className="ml-1 align-middle text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">Ch. {cleanChapter(entry.chapterFirstSeen)}</span>
                            ) : null}
                            {activeConflictIds.has(entry.id) ? (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setConflictPrompt(conflictById.get(entry.id)); }}
                                className="ml-1 align-middle text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-500/40 cursor-pointer hover:bg-rose-500/30"
                                title="Inconsistent translation with a part of this name"
                              >
                                ⚠ Inconsistent
                              </button>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                            <span>Added: {formatAddedTime(entry.addedAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition flex-shrink-0">
                          {isSelectable ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleSelected(activeTab, entry.id); }} className={`inline-flex items-center justify-center min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded transition cursor-pointer ${isSelected ? 'text-amber-300 bg-amber-500/20' : 'text-slate-400 hover:text-amber-300 hover:bg-slate-700/60'}`} title={isSelected ? 'Remove from translation prompt' : 'Include in translation prompt'} aria-pressed={isSelected}>
                              <CheckIcon />
                            </button>
                          ) : null}
                          {activeTab === 'soft' ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveToLocked(entry); }} className="inline-flex items-center justify-center min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-700/60 transition cursor-pointer" title="Move to Locked Glossary">
                              <LockIcon />
                            </button>
                          ) : null}
                          <button type="button" onClick={(e) => { e.stopPropagation(); startEdit(entry); }} className="inline-flex items-center justify-center min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 transition cursor-pointer" title="Edit entry">
                            <EditIcon />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }} className="inline-flex items-center justify-center min-h-10 min-w-10 sm:min-h-0 sm:min-w-0 p-2.5 sm:p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 transition cursor-pointer" title="Delete entry">
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {virtualize && windowRange.end < filtered.length ? <div style={{ height: (filtered.length - windowRange.end) * ROW_HEIGHT }} aria-hidden="true" /> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
      {conflictPrompt ? createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setConflictPrompt(null); }}
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-5 flex flex-col gap-4 text-slate-100" role="dialog" aria-modal="true">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">⚠</div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Inconsistent translation</h3>
                <p className="text-[11px] text-slate-400">A name and its part disagree.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="font-mono text-slate-100">"{conflictPrompt.longerOriginal}"</span> is{' '}
              <span className="font-mono text-emerald-300">"{conflictPrompt.longerTranslation}"</span>, but its part{' '}
              <span className="font-mono text-slate-100">"{conflictPrompt.shorterOriginal}"</span> is{' '}
              <span className="font-mono text-emerald-300">"{conflictPrompt.shorterTranslation}"</span>.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={dismissConflict} className="px-3.5 py-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer">Keep as-is</button>
              <button type="button" onClick={editConflict} className="px-4 py-2.5 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition cursor-pointer">Edit entry</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {renamePrompt ? createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setRenamePrompt(null); }}
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-5 flex flex-col gap-4 text-slate-100" role="dialog" aria-modal="true">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">✏️</div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Rename in downloaded chapters?</h3>
                <p className="text-[11px] text-slate-400">Updates the translated text and saves it to storage.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {Array.isArray(renamePrompt.changes) && renamePrompt.changes.length > 1 ? (
                <>
                  Replace translations for <span className="font-semibold text-amber-200">{renamePrompt.changes.length}</span> names
                  {' '}(<span className="font-semibold text-amber-200">{renamePrompt.count}</span> occurrence{renamePrompt.count === 1 ? '' : 's'}) in{' '}
                  {renamePrompt.chaptersChanged} downloaded chapter{renamePrompt.chaptersChanged === 1 ? '' : 's'}?
                  <span className="mt-1.5 block max-h-32 overflow-y-auto font-mono text-[11px] text-slate-400">
                    {renamePrompt.changes.map((c, i) => (
                      <span key={i} className="block truncate">"{c.oldName}" → "{c.newName}"</span>
                    ))}
                  </span>
                </>
              ) : (
                <>
                  Replace <span className="font-semibold text-amber-200">{renamePrompt.count}</span> occurrence{renamePrompt.count === 1 ? '' : 's'} of{' '}
                  <span className="font-mono text-slate-100">"{renamePrompt.changes ? renamePrompt.changes[0].oldName : renamePrompt.oldName}"</span> with{' '}
                  <span className="font-mono text-emerald-300">"{renamePrompt.changes ? renamePrompt.changes[0].newName : renamePrompt.newName}"</span>{' '}
                  in {renamePrompt.chaptersChanged} downloaded chapter{renamePrompt.chaptersChanged === 1 ? '' : 's'}?
                </>
              )}
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setRenamePrompt(null)} className="px-3.5 py-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer">Cancel</button>
              <button type="button" onClick={confirmRename} className="px-4 py-2.5 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition cursor-pointer">Replace chapters</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {duplicatePrompt ? createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDuplicatePrompt(null); }}
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-5 flex flex-col gap-4 text-slate-100" role="dialog" aria-modal="true">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">⚠️</div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Name already in the list</h3>
                <p className="text-[11px] text-slate-400">Replace updates the existing entry and downloaded chapters.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="font-mono text-slate-100">"{duplicatePrompt.original}"</span> is currently translated as{' '}
              <span className="font-mono text-slate-200">"{duplicatePrompt.existingTranslation}"</span>. Replace it with{' '}
              <span className="font-mono text-emerald-300">"{duplicatePrompt.translation}"</span>?
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setDuplicatePrompt(null)} className="px-3.5 py-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer">Keep existing</button>
              <button type="button" onClick={confirmDuplicate} className="px-4 py-2.5 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition cursor-pointer">Replace</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
      {deleteAllPrompt ? createPortal(
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteAllPrompt(false); }}
        >
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-5 flex flex-col gap-4 text-slate-100" role="dialog" aria-modal="true">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0">🗑</div>
              <div>
                <h3 className="text-sm font-bold text-slate-100">Delete all names?</h3>
                <p className="text-[11px] text-slate-400">This cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Remove <span className="font-semibold text-rose-300">{entries.length}</span> name{entries.length === 1 ? '' : 's'} from this novel's glossary? Downloaded chapters are not changed.
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setDeleteAllPrompt(false)} className="px-3.5 py-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 hover:text-white transition cursor-pointer">Cancel</button>
              <button type="button" onClick={confirmDeleteAll} className="px-4 py-2.5 sm:py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-sm transition cursor-pointer">Delete all</button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
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
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-slate-800/90 border border-indigo-500/60 ring-1 ring-indigo-500/25 transition">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input ref={originalRef} type="text" value={original} onChange={(e) => setOriginal(e.target.value)} onKeyDown={handleKey} placeholder="Original Name" className="w-full min-w-0 px-3 py-2.5 sm:py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        <input type="text" value={translation} onChange={(e) => setTranslation(e.target.value)} onKeyDown={handleKey} placeholder="Translated Name" className="w-full min-w-0 px-3 py-2.5 sm:py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
      </div>
      <div className="flex items-center gap-2">
        <input type="text" value={chapter} onChange={(e) => setChapter(e.target.value)} onKeyDown={handleKey} placeholder="Chapter First Seen (e.g. 1)" className="flex-1 min-w-0 px-3 py-2.5 sm:py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        <button type="button" onClick={() => onSave({ original, translation, chapter })} className="flex-shrink-0 px-3 py-2.5 sm:py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer" title="Save changes (Enter)">Save</button>
        <button type="button" onClick={onCancel} className="flex-shrink-0 px-3 py-2.5 sm:py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition cursor-pointer" title="Cancel (Esc)">Cancel</button>
      </div>
    </div>
  );
}
