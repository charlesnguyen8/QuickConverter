import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClashDialog, KIND_LABELS, commonSummary, kindLabel, walkClashes } from './CommonListDialogs.jsx';

const KIND_FILTERS = [['all', 'All'], ['namelist', 'Name List'], ['locked', 'Locked'], ['soft', 'Soft']];
const KIND_TONES = {
  namelist: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
  locked: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  soft: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30'
};

const BUTTON = 'inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-lg text-xs font-semibold transition cursor-pointer';
const PLAIN_BUTTON = `${BUTTON} text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700`;

function entriesLabel(count) {
  return `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function storage() {
  return typeof window !== 'undefined' ? window.StorageService : null;
}

export function filterCommonEntries(entries, kind, search) {
  const needle = String(search || '').trim().toLowerCase();
  return (entries || []).filter((entry) => {
    if (kind && kind !== 'all' && (entry.kind || 'namelist') !== kind) return false;
    if (!needle) return true;
    return String(entry.original || '').toLowerCase().includes(needle) || String(entry.translation || '').toLowerCase().includes(needle);
  });
}

function Overlay({ id, title, children, onCancel }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}>
      <div id={id} role="dialog" aria-modal="true" className="w-full max-w-sm max-h-full overflow-y-auto rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 flex flex-col gap-3 text-slate-100">
        <h3 className="text-sm font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function NameForm({ inputId, buttonId, placeholder, label, onSubmit, initial = '', onCancel }) {
  const [name, setName] = useState(initial);
  const clean = name.trim();
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (clean) onSubmit(clean); }}>
      <input
        id={inputId}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 min-h-10 px-3 rounded-lg text-sm bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
      <button id={buttonId} type="submit" disabled={!clean} className={`${BUTTON} text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap`}>
        {label}
      </button>
      {onCancel ? <button type="button" onClick={onCancel} className={PLAIN_BUTTON}>Cancel</button> : null}
    </form>
  );
}

export function CommonListsIndex({ lists, onOpen, onCreate }) {
  return (
    <div id="common-lists-index" className="flex flex-col gap-3">
      <p className="text-xs text-slate-400">Lists of names and terms you reuse across novels. Open one to edit it or apply it to this novel.</p>
      <NameForm inputId="common-lists-new-name" buttonId="common-lists-create-btn" placeholder="New list name" label="+ New list" onSubmit={onCreate} />
      {lists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-1">
          <span className="text-2xl" aria-hidden="true">📚</span>
          <span className="text-sm font-semibold text-slate-300">No common lists yet</span>
          <span className="text-xs text-slate-400 max-w-xs">Make one above, or select entries on another tab and choose Add to common list.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              id={`common-list-open-${list.id}`}
              onClick={() => onOpen(list.id)}
              className="flex items-center justify-between gap-3 min-h-10 px-3 py-2.5 rounded-lg text-left bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 hover:border-indigo-500/60 transition cursor-pointer"
            >
              <span className="text-sm font-semibold text-slate-100 truncate">{list.name}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{entriesLabel((list.entries || []).length)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CommonEntryForm({ initial, onSave, onCancel, submitLabel = 'Save' }) {
  const [original, setOriginal] = useState((initial && initial.original) || '');
  const [translation, setTranslation] = useState((initial && initial.translation) || '');
  const [kind, setKind] = useState((initial && initial.kind) || 'namelist');
  const ready = original.trim() && translation.trim();
  const field = 'min-h-10 px-3 rounded-lg text-sm bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500';
  return (
    <form
      className="flex flex-col gap-2 p-3 rounded-lg bg-slate-800/60 border border-slate-700"
      onSubmit={(e) => { e.preventDefault(); if (ready) onSave({ original: original.trim(), translation: translation.trim(), kind }); }}
    >
      <div className="grid grid-cols-2 gap-2">
        <input id="common-entry-original" type="text" value={original} onChange={(e) => setOriginal(e.target.value)} placeholder="Chinese" aria-label="Chinese" className={`${field} min-w-0 font-mono`} />
        <input id="common-entry-translation" type="text" value={translation} onChange={(e) => setTranslation(e.target.value)} placeholder="Translation" aria-label="Translation" className={`${field} min-w-0`} />
      </div>
      <div className="flex items-center gap-2">
        <select id="common-entry-kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type" className={`${field} flex-1 min-w-0`}>
          {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" onClick={onCancel} className={PLAIN_BUTTON}>Cancel</button>
        <button id="common-entry-save-btn" type="submit" disabled={!ready} className={`${BUTTON} text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed`}>{submitLabel}</button>
      </div>
    </form>
  );
}

function CommonEntryRow({ entry, onEdit, onRemove }) {
  const kind = entry.kind || 'namelist';
  return (
    <div id={`common-entry-${entry.id}`} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-800/70 border border-slate-700/60">
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="text-sm leading-snug break-words">
          <span className="font-bold text-slate-100 font-mono">{entry.original}</span>
          <span className="text-xs text-slate-500 font-bold mx-1">=</span>
          <span className="font-bold text-emerald-400">{entry.translation}</span>
        </div>
        <span className={`self-start px-1.5 py-0.5 rounded border text-[10px] font-semibold ${KIND_TONES[kind] || KIND_TONES.namelist}`}>{kindLabel(kind)}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button type="button" id={`common-entry-edit-${entry.id}`} onClick={onEdit} aria-label={`Edit ${entry.original}`} title="Edit" className="inline-flex items-center justify-center min-h-10 min-w-10 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-700/60 transition cursor-pointer">✎</button>
        <button type="button" id={`common-entry-remove-${entry.id}`} onClick={onRemove} aria-label={`Remove ${entry.original}`} title="Remove" className="inline-flex items-center justify-center min-h-10 min-w-10 rounded text-slate-400 hover:text-rose-300 hover:bg-slate-700/60 transition cursor-pointer">🗑</button>
      </div>
    </div>
  );
}

export function CommonListView({ list, onBack, onRename, onDelete, onApply, onAdd, onUpdate, onRemove, applying = false }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const entries = list.entries || [];
  const shown = useMemo(() => filterCommonEntries(entries, filter, search), [entries, filter, search]);
  const counts = useMemo(() => {
    const out = { all: entries.length, namelist: 0, locked: 0, soft: 0 };
    entries.forEach((e) => { out[e.kind || 'namelist'] = (out[e.kind || 'namelist'] || 0) + 1; });
    return out;
  }, [entries]);

  return (
    <div id="common-list-view" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" id="common-list-back-btn" onClick={onBack} className={PLAIN_BUTTON}>← Lists</button>
        {renaming ? null : <h3 id="common-list-name" className="text-sm font-bold text-slate-100 truncate flex-1 min-w-0">{list.name}</h3>}
      </div>
      {renaming ? (
        <NameForm inputId="common-list-rename-input" buttonId="common-list-rename-save" placeholder="List name" label="Save" initial={list.name} onSubmit={(name) => { setRenaming(false); onRename(name); }} onCancel={() => setRenaming(false)} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" id="common-list-apply-btn" onClick={onApply} disabled={applying || entries.length === 0} className={`${BUTTON} text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed`}>
          ⤵ Apply to this novel
        </button>
        <button type="button" id="common-list-add-entry-btn" onClick={() => { setAdding(true); setEditingId(null); }} className={`${BUTTON} text-white bg-indigo-600 hover:bg-indigo-500`}>+ Add</button>
        <button type="button" id="common-list-rename-btn" onClick={() => setRenaming(true)} className={PLAIN_BUTTON}>Rename</button>
        <button type="button" id="common-list-delete-btn" onClick={onDelete} className={`${BUTTON} text-rose-300 hover:text-white bg-slate-800 hover:bg-rose-600 border border-rose-500/30`}>Delete list</button>
      </div>
      {adding ? (
        <CommonEntryForm submitLabel="Add" onCancel={() => setAdding(false)} onSave={(entry) => { setAdding(false); onAdd(entry); }} />
      ) : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
        {KIND_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            id={`common-kind-filter-${value}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`inline-flex items-center gap-1 min-h-10 sm:min-h-8 px-2.5 rounded-full text-[11px] font-semibold border transition cursor-pointer ${filter === value ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}`}
          >
            {label}
            <span className="opacity-70">{counts[value] || 0}</span>
          </button>
        ))}
      </div>
      <input
        id="common-list-search"
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search Chinese or translation..."
        className="w-full min-h-10 px-3 rounded-lg text-sm bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
      />
      {entries.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">This list is empty. Tap + Add, or select entries on another tab and choose Add to common list.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">Nothing matches.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {shown.map((entry) => (editingId === entry.id ? (
            <CommonEntryForm key={entry.id} initial={entry} onCancel={() => setEditingId(null)} onSave={(fields) => { setEditingId(null); onUpdate(entry, fields); }} />
          ) : (
            <CommonEntryRow key={entry.id} entry={entry} onEdit={() => { setEditingId(entry.id); setAdding(false); }} onRemove={() => onRemove(entry)} />
          )))}
        </div>
      )}
    </div>
  );
}

export function ApplyPreviewDialog({ listName, fresh, same, clashes, onContinue, onCancel }) {
  const nothing = fresh.length === 0 && clashes.length === 0;
  const parts = [`${fresh.length} new`];
  if (same.length > 0) parts.push(`${same.length} already the same`);
  if (clashes.length > 0) parts.push(`${clashes.length} ${clashes.length === 1 ? 'clash' : 'clashes'}`);
  return (
    <Overlay id="common-apply-preview" title={`Apply ${listName} to this novel?`} onCancel={onCancel}>
      <p className="text-sm font-semibold text-slate-200">{parts.join(' · ')}</p>
      <p className="text-xs text-slate-400">
        {nothing
          ? 'This novel already has everything in this list.'
          : `New entries are copied into the novel's Name List, Locked or Soft tab by their type.${clashes.length > 0 ? ' You will be asked about each clash.' : ''} Later edits to the list don't change the novel.`}
      </p>
      <div className="flex justify-end gap-2">
        <button id="common-apply-cancel-btn" type="button" onClick={onCancel} className={PLAIN_BUTTON}>Cancel</button>
        <button id="common-apply-continue-btn" type="button" onClick={onContinue} disabled={nothing} className={`${BUTTON} text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed`}>
          {clashes.length > 0 ? 'Continue' : 'Apply'}
        </button>
      </div>
    </Overlay>
  );
}

export function DeleteListDialog({ list, onConfirm, onCancel }) {
  return (
    <Overlay id="common-list-delete-dialog" title="Delete this common list?" onCancel={onCancel}>
      <p className="text-xs text-slate-400">
        <strong className="text-slate-200">{list.name}</strong> and its {entriesLabel((list.entries || []).length)} will be deleted on every device. Novels keep what was already applied to them.
      </p>
      <div className="flex justify-end gap-2">
        <button id="common-list-delete-cancel" type="button" onClick={onCancel} className={PLAIN_BUTTON}>Cancel</button>
        <button id="common-list-delete-confirm" type="button" onClick={onConfirm} className={`${BUTTON} text-white bg-rose-600 hover:bg-rose-500`}>Delete list</button>
      </div>
    </Overlay>
  );
}

export default function CommonListsPanel({ novelId, onApplied }) {
  const [lists, setLists] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    const S = storage();
    if (!S || typeof S.getCommonLists !== 'function') return;
    try {
      setLists(await S.getCommonLists());
    } catch (e) {
      console.error('Error loading common lists:', e);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const run = useCallback(async (work) => {
    try {
      await work(storage());
    } catch (e) {
      console.error('Common list change failed:', e);
      setNotice(`Something went wrong: ${e.message}`);
    }
    await load();
  }, [load]);

  const list = lists.find((l) => l.id === openId) || null;

  const finishApply = useCallback(async (flow, replace) => {
    setDialog(null);
    await run(async (S) => {
      const result = await S.applyCommonList(flow.listId, novelId, { replace });
      setNotice(`${flow.listName} applied: ${commonSummary(result || {})}`);
      if (onApplied) onApplied();
    });
  }, [run, novelId, onApplied]);

  const startApply = useCallback(async () => {
    if (!list || !novelId) return;
    try {
      const compared = await storage().compareCommonListWithNovel(list.id, novelId);
      setDialog({ type: 'preview', listId: list.id, listName: list.name, ...compared });
    } catch (e) {
      console.error('Error comparing the common list with the novel:', e);
    }
  }, [list, novelId]);

  const continueApply = useCallback(() => {
    if (!dialog) return;
    if (dialog.clashes.length === 0) {
      finishApply(dialog, []);
      return;
    }
    setDialog({ type: 'clash', listId: dialog.listId, listName: dialog.listName, walk: { clashes: dialog.clashes, index: 0, replace: [] }, sameForRest: false });
  }, [dialog, finishApply]);

  const decide = useCallback((decision) => {
    if (!dialog || dialog.type !== 'clash') return;
    const next = walkClashes(dialog.walk, decision, dialog.sameForRest);
    if (next.done) {
      finishApply(dialog, next.replace);
      return;
    }
    setDialog({ ...dialog, walk: next, sameForRest: false });
  }, [dialog, finishApply]);

  let overlay = null;
  if (dialog && dialog.type === 'preview') {
    overlay = <ApplyPreviewDialog listName={dialog.listName} fresh={dialog.fresh} same={dialog.same} clashes={dialog.clashes} onContinue={continueApply} onCancel={() => setDialog(null)} />;
  } else if (dialog && dialog.type === 'clash') {
    overlay = (
      <ClashDialog
        clash={dialog.walk.clashes[dialog.walk.index]}
        remaining={dialog.walk.clashes.length - dialog.walk.index - 1}
        existingLabel="In this novel"
        incomingLabel={`In ${dialog.listName}`}
        sameForRest={dialog.sameForRest}
        onSameForRest={(checked) => setDialog({ ...dialog, sameForRest: checked })}
        onKeep={() => decide('keep')}
        onReplace={() => decide('replace')}
        onCancel={() => setDialog(null)}
      />
    );
  } else if (dialog && dialog.type === 'delete' && list) {
    overlay = (
      <DeleteListDialog
        list={list}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          setOpenId(null);
          run((S) => S.deleteCommonList(list.id));
        }}
      />
    );
  }

  return (
    <div id="common-lists-panel" className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
      {notice ? (
        <div id="common-lists-notice" role="status" className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-xs font-semibold text-indigo-100">
          <span className="min-w-0 break-words">📚 {notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="min-h-10 min-w-10 text-indigo-300 hover:text-white cursor-pointer" aria-label="Dismiss">✕</button>
        </div>
      ) : null}
      {list ? (
        <CommonListView
          key={list.id}
          list={list}
          onBack={() => setOpenId(null)}
          onRename={(name) => run((S) => S.renameCommonList(list.id, name))}
          onDelete={() => setDialog({ type: 'delete' })}
          onApply={startApply}
          onAdd={(entry) => run((S) => S.addCommonEntry(list.id, entry))}
          onUpdate={(entry, fields) => run((S) => S.updateCommonEntry(list.id, entry.id, fields))}
          onRemove={(entry) => run((S) => S.removeCommonEntry(list.id, entry.id))}
        />
      ) : (
        <CommonListsIndex
          lists={lists}
          onOpen={setOpenId}
          onCreate={(name) => run(async (S) => {
            const created = await S.createCommonList(name);
            if (created) setOpenId(created.id);
          })}
        />
      )}
      {overlay && typeof document !== 'undefined' ? createPortal(overlay, document.body) : null}
    </div>
  );
}
