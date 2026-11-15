import React, { useState } from 'react';

export const KIND_LABELS = { namelist: 'Name List', locked: 'Locked', soft: 'Soft' };

export function kindLabel(kind) {
  return KIND_LABELS[kind] || KIND_LABELS.namelist;
}

export function commonSummary({ added = 0, unchanged = 0, replaced = 0, kept = 0 } = {}) {
  const parts = [added > 0 ? `Added ${added}` : 'Nothing new'];
  if (unchanged > 0) parts.push(`${unchanged} already there`);
  if (replaced > 0) parts.push(`${replaced} replaced`);
  if (kept > 0) parts.push(`${kept} kept`);
  return parts.join(' · ');
}

export function walkClashes(step, decision, sameForRest) {
  const { clashes, index } = step;
  const replace = [...step.replace];
  const settle = (clash) => { if (decision === 'replace') replace.push(clash.entry.original); };
  settle(clashes[index]);
  if (sameForRest) {
    clashes.slice(index + 1).forEach(settle);
    return { clashes, index: clashes.length, replace, done: true };
  }
  const next = index + 1;
  return { clashes, index: next, replace, done: next >= clashes.length };
}

function DialogFrame({ id, title, children, onCancel }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget && onCancel) onCancel(); }}>
      <div id={id} role="dialog" aria-modal="true" className="w-full max-w-sm max-h-full overflow-y-auto rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 flex flex-col gap-3 text-slate-100">
        <h3 className="text-sm font-bold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function CommonListPicker({ lists, count, onPick, onCreate, onCancel }) {
  const [name, setName] = useState('');
  const clean = name.trim();
  return (
    <DialogFrame id="common-list-picker" title={`Add ${count} ${count === 1 ? 'entry' : 'entries'} to a common list`} onCancel={onCancel}>
      {lists.length === 0 ? (
        <p className="text-xs text-slate-400">No common lists yet. Name your first one below.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              id={`common-list-pick-${list.id}`}
              onClick={() => onPick(list.id)}
              className="flex items-center justify-between gap-3 min-h-10 px-3 rounded-lg text-left text-sm bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
            >
              <span className="font-semibold truncate">{list.name}</span>
              <span className="text-[11px] text-slate-400 flex-shrink-0">{(list.entries || []).length} {(list.entries || []).length === 1 ? 'entry' : 'entries'}</span>
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (clean) onCreate(clean); }}
      >
        <input
          id="common-list-new-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New list name"
          className="flex-1 min-w-0 min-h-10 px-3 rounded-lg text-sm bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          id="common-list-create-btn"
          type="submit"
          disabled={!clean}
          className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer whitespace-nowrap"
        >
          + New list
        </button>
      </form>
      <div className="flex justify-end">
        <button id="common-list-picker-cancel" type="button" onClick={onCancel} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition cursor-pointer">
          Cancel
        </button>
      </div>
    </DialogFrame>
  );
}

function TermVersion({ label, translation, kind, tone }) {
  return (
    <div className={`flex flex-col gap-0.5 p-2.5 rounded-lg border ${tone}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-emerald-300 break-words">{translation}</span>
      <span className="text-[11px] text-slate-400">{kindLabel(kind)}</span>
    </div>
  );
}

export function ClashDialog({ clash, remaining, existingLabel, incomingLabel, sameForRest, onSameForRest, onKeep, onReplace, onCancel }) {
  const existingKind = clash.existingKind || clash.existing.kind;
  return (
    <DialogFrame id="clash-dialog" title="Already there with a different translation" onCancel={onCancel}>
      <p className="text-base font-bold font-mono text-slate-100 break-words">{clash.entry.original}</p>
      <div className="grid grid-cols-2 gap-2">
        <TermVersion label={existingLabel} translation={clash.existing.translation} kind={existingKind} tone="border-slate-700 bg-slate-800/60" />
        <TermVersion label={incomingLabel} translation={clash.entry.translation} kind={clash.entry.kind} tone="border-amber-500/40 bg-amber-500/10" />
      </div>
      {remaining > 0 ? (
        <label htmlFor="clash-same-for-rest" className="flex items-center gap-2 min-h-10 text-xs text-slate-300 cursor-pointer">
          <input id="clash-same-for-rest" type="checkbox" checked={sameForRest} onChange={(e) => onSameForRest(e.target.checked)} className="w-4 h-4 accent-indigo-500" />
          <span>Same for the {remaining} more</span>
        </label>
      ) : null}
      <div className="flex justify-end gap-2">
        <button id="clash-keep-btn" type="button" onClick={onKeep} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition cursor-pointer">
          Keep existing
        </button>
        <button id="clash-replace-btn" type="button" onClick={onReplace} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 transition cursor-pointer">
          Replace
        </button>
      </div>
    </DialogFrame>
  );
}
