import React, { useCallback, useEffect, useRef, useState } from 'react';

const NOTES_KEY = 'quickconverter_notes';
const MAX_NOTES = 200;

function storage() {
  return typeof window !== 'undefined' ? window.StorageService : null;
}

function makeNote() {
  return {
    id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    title: '',
    body: '',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
}

function normalize(note) {
  return {
    id: note && note.id ? note.id : makeNote().id,
    title: note && typeof note.title === 'string' ? note.title : '',
    body: note && typeof note.body === 'string' ? note.body : '',
    createdAt: (note && note.createdAt) || Date.now(),
    updatedAt: (note && note.updatedAt) || (note && note.createdAt) || Date.now()
  };
}

function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SettingsNotesTab({ onSaved }) {
  const [notes, setNotes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    const S = storage();
    let list = [];
    try {
      const raw = S && typeof S.getPreference === 'function'
        ? S.getPreference(NOTES_KEY, '[]')
        : (typeof localStorage !== 'undefined' ? localStorage.getItem(NOTES_KEY) : null);
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
      if (Array.isArray(parsed)) list = parsed.map(normalize);
    } catch (e) {
      console.error('Failed to load notes:', e);
    }
    setNotes(list);
    setActiveId(list.length > 0 ? list[0].id : null);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  const persist = useCallback((next) => {
    setNotes(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const S = storage();
      try {
        if (S && typeof S.setPreference === 'function') S.setPreference(NOTES_KEY, JSON.stringify(next));
        else if (typeof localStorage !== 'undefined') localStorage.setItem(NOTES_KEY, JSON.stringify(next));
        if (typeof onSaved === 'function') onSaved('Notes saved');
      } catch (e) {
        console.error('Failed to save notes:', e);
      }
    }, 600);
  }, [onSaved]);

  const addNote = () => {
    const note = makeNote();
    const next = [note, ...notes].slice(0, MAX_NOTES);
    persist(next);
    setActiveId(note.id);
  };

  const removeNote = (id) => {
    const next = notes.filter((n) => n.id !== id);
    persist(next);
    if (activeId === id) setActiveId(next.length > 0 ? next[0].id : null);
  };

  const updateActive = (patch) => {
    const next = notes.map((n) => (n.id === activeId ? { ...n, ...patch, updatedAt: Date.now() } : n));
    persist(next);
  };

  const active = notes.find((n) => n.id === activeId) || null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <span>📝</span>
            <span>Notes</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">{notes.length}</span>
          </h2>
          <p className="text-xs text-slate-400">A global scratchpad saved on this device (and included in cloud backups).</p>
        </div>
        <button
          type="button"
          id="notes-new-btn"
          onClick={addNote}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm transition cursor-pointer flex-shrink-0"
        >
          <span>+ New Note</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <aside className="md:w-64 md:flex-shrink-0 flex flex-col gap-2 md:max-h-[60vh] md:overflow-y-auto">
          {notes.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center text-xs text-slate-400">
              No notes yet. Create one to get started.
            </div>
          ) : notes.map((note) => (
            <div
              key={note.id}
              onClick={() => setActiveId(note.id)}
              className={`group flex items-start justify-between gap-2 p-3 rounded-lg border cursor-pointer transition ${note.id === activeId ? 'bg-indigo-600/15 border-indigo-500/50' : 'bg-slate-800/60 border-slate-700/60 hover:border-slate-600'}`}
            >
              <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                <span className={`text-xs font-semibold truncate ${note.id === activeId ? 'text-indigo-200' : 'text-slate-200'}`}>
                  {note.title.trim() || 'Untitled note'}
                </span>
                <span className="text-[10px] text-slate-500 truncate">{formatWhen(note.updatedAt)}</span>
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeNote(note.id); }}
                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700/60 transition cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                title="Delete note"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </aside>

        <section className="flex-1 min-w-0 flex flex-col gap-3 bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 shadow-sm backdrop-blur">
          {active ? (
            <>
              <input
                type="text"
                id="note-title-input"
                value={active.title}
                onChange={(e) => updateActive({ title: e.target.value })}
                placeholder="Note title..."
                className="w-full px-3 py-2 text-sm font-bold bg-transparent border-b border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              <textarea
                id="note-body-input"
                value={active.body}
                onChange={(e) => updateActive({ body: e.target.value })}
                placeholder="Write your note here..."
                rows={14}
                className="w-full min-h-[240px] flex-1 px-3 py-2 text-sm bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition leading-relaxed resize-y"
              ></textarea>
              <span className="text-[10px] text-slate-500">Last updated: {formatWhen(active.updatedAt)}</span>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xl text-slate-400">📝</div>
              <p className="text-sm text-slate-300">No note selected</p>
              <p className="text-xs text-slate-500">Create a note with “+ New Note”.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
