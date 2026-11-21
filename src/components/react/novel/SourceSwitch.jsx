import React, { useEffect, useMemo, useRef, useState } from 'react';

const BUTTON = 'inline-flex items-center justify-center gap-1 min-h-10 px-3 rounded-lg text-xs font-semibold transition cursor-pointer';
const PLAIN_BUTTON = `${BUTTON} text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700`;
const PRIMARY_BUTTON = `${BUTTON} text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed`;
const FIELD = 'w-full min-h-10 px-3 rounded-lg text-sm bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500';
const PAGE_SIZE = 50;

export function savedFromOldSource(saved, chapter) {
  if (!saved || !chapter) return false;
  return (saved.source || null) !== (chapter.source || null);
}

export function SourceBadge({ chapter, saved }) {
  if (!chapter) return null;
  if (saved && savedFromOldSource(saved, chapter)) {
    return <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Saved from the source this chapter came from before the switch">Old source</span>;
  }
  if (chapter.source) {
    return <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30" title="This chapter comes from the source you switched to">New source</span>;
  }
  return null;
}

function Overlay({ id, title, children, onCancel }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}>
      <div id={id} role="dialog" aria-modal="true" className="w-full max-w-md max-h-full overflow-hidden rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 flex flex-col gap-3 text-slate-100">
        <h3 className="text-sm font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function SwitchSourceForm({ fromChapter, url, maxChapter, loading, error, onChange, onLoad, onCancel }) {
  const ready = String(fromChapter).trim() !== '' && String(url).trim() !== '' && !loading;
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (ready) onLoad(); }}>
      <p className="text-xs text-slate-400">Chapters from this one on will come from another copy of the same book on this site. Chapters before it stay as they are.</p>
      <label htmlFor="switch-from-chapter" className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
        <span>From chapter <span className="font-normal text-slate-500">(1–{maxChapter})</span></span>
        <input id="switch-from-chapter" type="number" inputMode="numeric" min="1" max={maxChapter} value={fromChapter} onChange={(e) => onChange({ fromChapter: e.target.value })} placeholder="e.g. 2553" className={FIELD} />
      </label>
      <label htmlFor="switch-source-url" className="flex flex-col gap-1 text-xs font-semibold text-slate-300">
        <span>Link to the other source</span>
        <input id="switch-source-url" type="url" value={url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://sangtacviet.com/truyen/…" className={FIELD} />
      </label>
      {error ? <p id="switch-error" role="alert" className="text-xs text-rose-300">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button id="switch-cancel-btn" type="button" onClick={onCancel} className={PLAIN_BUTTON}>Cancel</button>
        <button id="switch-load-btn" type="submit" disabled={!ready} className={PRIMARY_BUTTON}>{loading ? 'Loading…' : 'Load its chapters'}</button>
      </div>
    </form>
  );
}

export function PickStartChapter({ fromChapter, chapters, selected, previousTitle, onSelect, onConfirm, onBack, saving = false }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(() => Math.floor(Math.max(selected, 0) / PAGE_SIZE));
  const selectedRef = useRef(null);
  const listRef = useRef(null);
  const firstRender = useRef(true);
  const needle = search.trim().toLowerCase();
  const matches = useMemo(() => {
    const indexed = chapters.map((chapter, index) => ({ chapter, index }));
    return needle ? indexed.filter(({ chapter }) => String(chapter.title || '').toLowerCase().includes(needle)) : indexed;
  }, [chapters, needle]);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const shown = matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const goTo = (next) => setPage(Math.min(Math.max(next, 0), pageCount - 1));

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      if (selectedRef.current && typeof selectedRef.current.scrollIntoView === 'function') selectedRef.current.scrollIntoView({ block: 'center' });
      return;
    }
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [current, needle]);

  return (
    <div className="flex flex-col gap-3 min-h-0">
      <p className="text-xs text-slate-400">
        {previousTitle ? <>Your chapter {fromChapter - 1} is <strong className="text-slate-200">{previousTitle}</strong>. </> : null}
        Tap the chapter of the new source that should be chapter {fromChapter}.
      </p>
      <input id="switch-pick-search" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Search titles…" className={FIELD} />
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-1">
          <button id="switch-page-first" type="button" onClick={() => goTo(0)} disabled={current === 0} aria-label="First page" className={`${PLAIN_BUTTON} min-w-10 px-2 disabled:opacity-40 disabled:cursor-not-allowed`}>«</button>
          <button id="switch-page-prev" type="button" onClick={() => goTo(current - 1)} disabled={current === 0} aria-label="Previous page" className={`${PLAIN_BUTTON} min-w-10 px-2 disabled:opacity-40 disabled:cursor-not-allowed`}>‹</button>
          <span id="switch-page-label" className="flex-1 text-center text-xs font-semibold text-slate-300">Page {current + 1} of {pageCount}</span>
          <button id="switch-page-next" type="button" onClick={() => goTo(current + 1)} disabled={current >= pageCount - 1} aria-label="Next page" className={`${PLAIN_BUTTON} min-w-10 px-2 disabled:opacity-40 disabled:cursor-not-allowed`}>›</button>
          <button id="switch-page-last" type="button" onClick={() => goTo(pageCount - 1)} disabled={current >= pageCount - 1} aria-label="Last page" className={`${PLAIN_BUTTON} min-w-10 px-2 disabled:opacity-40 disabled:cursor-not-allowed`}>»</button>
        </div>
      ) : null}
      <div ref={listRef} className="flex flex-col gap-1 overflow-y-auto max-h-[45vh] pr-1">
        {shown.map(({ chapter, index }) => {
          const picked = index === selected;
          return (
            <button
              key={`${chapter.slug}-${index}`}
              ref={picked ? selectedRef : null}
              type="button"
              id={`switch-pick-${index}`}
              aria-pressed={picked}
              onClick={() => onSelect(index)}
              className={`flex-shrink-0 flex flex-col items-start gap-0.5 min-h-10 px-3 py-2 rounded-lg text-left text-sm border transition cursor-pointer ${picked ? 'bg-indigo-600/25 border-indigo-400 text-white' : 'bg-slate-800/70 border-slate-700/60 text-slate-200 hover:border-indigo-500/60'}`}
            >
              <span className="break-words">{chapter.title || `#${index + 1}`}</span>
              {picked ? <span className="text-[11px] font-semibold text-indigo-200">becomes chapter {fromChapter}</span> : null}
            </button>
          );
        })}
        {shown.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">Nothing matches.</p> : null}
      </div>
      <div className="flex justify-end gap-2">
        <button id="switch-back-btn" type="button" onClick={onBack} className={PLAIN_BUTTON}>Back</button>
        <button id="switch-confirm-btn" type="button" onClick={onConfirm} disabled={selected < 0 || saving} className={PRIMARY_BUTTON}>{saving ? 'Switching…' : `Use from chapter ${fromChapter}`}</button>
      </div>
    </div>
  );
}

export function SourceSwitchList({ switches, onRemove }) {
  const [confirming, setConfirming] = useState(null);
  if (!switches || switches.length === 0) return null;
  return (
    <div id="source-switch-list" className="flex flex-col gap-2 p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
      <span className="text-[11px] font-bold uppercase tracking-wider text-sky-300">Switched sources</span>
      {switches.map((sw) => (
        <div key={sw.id} id={`source-switch-${sw.id}`} className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-xs text-slate-300">
            <span className="font-semibold text-slate-100">From chapter {sw.fromChapter}</span>
            <span className="text-slate-500"> → </span>
            <span className="font-mono">{sw.slug}</span>
            {sw.startTitle ? <span className="block text-[11px] text-slate-400 break-words">starts at {sw.startTitle}</span> : null}
          </div>
          <button
            type="button"
            id={`source-switch-remove-${sw.id}`}
            onClick={() => { if (confirming === sw.id) { setConfirming(null); onRemove(sw); } else setConfirming(sw.id); }}
            className={`${BUTTON} ${confirming === sw.id ? 'text-white bg-rose-600 hover:bg-rose-500' : 'text-rose-300 bg-slate-800 border border-rose-500/30 hover:bg-rose-600 hover:text-white'}`}
          >
            {confirming === sw.id ? 'Tap again to remove' : 'Remove'}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function SourceSwitchDialog({ novel, onDone, onCancel }) {
  const list = novel.chapterList || [];
  const maxChapter = list.reduce((max, c) => Math.max(max, Number(c && c.chapterNumber) || 0), 0) + 1;
  const [form, setForm] = useState({ fromChapter: '', url: '' });
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const from = Number(form.fromChapter);
  const previous = list.find((c) => Number(c.chapterNumber) === from - 1);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.StorageService.previewSourceSwitch(novel.id, form.url.trim(), from);
      setPreview(result);
      setSelected(result.guess);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!preview || selected < 0) return;
    const start = preview.chapters[selected];
    setSaving(true);
    try {
      await window.StorageService.addSourceSwitch(novel.id, { fromChapter: from, url: preview.url, slug: preview.slug, startSlug: start.slug, startTitle: start.title || '' });
      onDone();
    } catch (e) {
      setError(e.message || String(e));
      setPreview(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay id="source-switch-dialog" title={preview ? `Which chapter is ${from}?` : 'Switch source from a chapter'} onCancel={onCancel}>
      {preview ? (
        <PickStartChapter
          fromChapter={from}
          chapters={preview.chapters}
          selected={selected}
          previousTitle={previous ? previous.title : ''}
          onSelect={setSelected}
          onConfirm={confirm}
          onBack={() => setPreview(null)}
          saving={saving}
        />
      ) : (
        <SwitchSourceForm
          fromChapter={form.fromChapter}
          url={form.url}
          maxChapter={maxChapter}
          loading={loading}
          error={error}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onLoad={load}
          onCancel={onCancel}
        />
      )}
    </Overlay>
  );
}
