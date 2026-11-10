import React, { useCallback, useEffect, useState } from 'react';
import { coverSrc, showDefaultCover } from '../shared/novelCover.js';

export function DeleteForeverDialog({ novel, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-4 flex flex-col gap-3 text-slate-100" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-bold">Delete forever?</span>
        <span className="text-xs text-slate-400">
          <strong className="text-slate-200">{novel.title}</strong> and all its saved chapters will be deleted. This cannot be undone.
        </span>
        <div className="flex justify-end gap-2">
          <button type="button" id="cancel-forever-btn" onClick={onCancel} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition cursor-pointer">
            Cancel
          </button>
          <button type="button" id="confirm-forever-btn" onClick={onConfirm} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition cursor-pointer">
            Delete forever
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecycleBinView({ items, onRestore, onDeleteForever, onBack }) {
  return (
    <div id="recycle-bin" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            id="bin-back-btn"
            onClick={onBack}
            className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
          >
            ← Library
          </button>
          <h2 className="text-lg font-bold text-slate-100">Recycle Bin</h2>
        </div>
        <span className="text-xs text-slate-400">Books here are deleted for good after 60 days.</span>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl mb-3">🗑️</div>
          <span className="text-sm font-semibold text-slate-300">Recycle Bin is empty</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((novel) => (
            <li key={novel.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-800/80 border border-slate-700">
              <img src={coverSrc(novel.thumbnail)} alt="" onError={showDefaultCover} className="w-10 h-14 rounded object-cover bg-slate-900 flex-shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-semibold text-slate-100 truncate">{novel.title}</span>
                <span className="text-[11px] text-slate-400">{novel.daysLeft} {novel.daysLeft === 1 ? 'day' : 'days'} left</span>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  id={`bin-restore-${novel.id}`}
                  onClick={() => onRestore(novel)}
                  className="min-h-10 px-3 rounded-lg text-xs font-semibold text-emerald-200 bg-emerald-900/40 border border-emerald-500/40 hover:bg-emerald-900/70 transition cursor-pointer"
                >
                  Restore
                </button>
                <button
                  type="button"
                  id={`bin-delete-${novel.id}`}
                  onClick={() => onDeleteForever(novel)}
                  className="min-h-10 px-3 rounded-lg text-xs font-semibold text-rose-200 bg-rose-900/30 border border-rose-500/40 hover:bg-rose-900/60 transition cursor-pointer"
                >
                  Delete forever
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RecycleBinPage({ onBack, onChanged }) {
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(null);
  const storage = typeof window !== 'undefined' ? window.StorageService : null;

  const load = useCallback(async () => {
    if (!storage || typeof storage.getRecycleBin !== 'function') return;
    try {
      if (typeof storage.purgeRecycleBin === 'function') await storage.purgeRecycleBin();
      setItems(await storage.getRecycleBin());
    } catch (e) {
      console.error('Error loading the recycle bin:', e);
    }
  }, [storage]);

  useEffect(() => { load(); }, [load]);

  const restore = useCallback(async (novel) => {
    await storage.restoreNovel(novel.id);
    await load();
    if (onChanged) onChanged();
  }, [storage, load, onChanged]);

  const deleteForever = useCallback(async () => {
    const novel = pending;
    setPending(null);
    if (!novel) return;
    await storage.deleteNovelForever(novel.id);
    await load();
    if (onChanged) onChanged();
  }, [storage, pending, load, onChanged]);

  return (
    <>
      <RecycleBinView items={items} onRestore={restore} onDeleteForever={setPending} onBack={onBack} />
      {pending ? <DeleteForeverDialog novel={pending} onConfirm={deleteForever} onCancel={() => setPending(null)} /> : null}
    </>
  );
}
