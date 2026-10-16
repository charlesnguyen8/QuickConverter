import React, { useEffect, useState } from 'react';
import { PHRASE_KIND_LABELS, PHRASE_ORIGIN_LABELS, phraseSaveKind } from './readerText.js';

const BTN = 'min-h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-40 disabled:pointer-events-none';

export default function ReaderPhrasePopover({ phrase, options = [], saving = false, onPick, onSaveName, onOpenName, onClose }) {
  const [custom, setCustom] = useState(phrase ? phrase.translation : '');

  useEffect(() => { setCustom(phrase ? phrase.translation : ''); }, [phrase]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!phrase) return null;
  const origin = PHRASE_ORIGIN_LABELS[phrase.origin] || phrase.origin;
  const saveTo = PHRASE_KIND_LABELS[phraseSaveKind(phrase)];
  const value = custom.trim();

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        id="reader-phrase-popover"
        role="dialog"
        aria-label={`Phrase ${phrase.source}`}
        className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-6 w-full sm:w-[28rem] max-h-[80vh] overflow-y-auto bg-slate-900 border-t sm:border border-slate-700 sm:rounded-xl rounded-t-xl shadow-2xl p-4 flex flex-col gap-3 text-slate-100"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span lang="zh" className="text-2xl font-bold break-all">{phrase.source}</span>
            <span className="text-sm text-slate-400">{phrase.reading}</span>
          </div>
          <button type="button" onClick={onClose} className={`${BTN} w-10 px-0 text-slate-400 hover:text-white hover:bg-slate-800`} title="Close (Esc)" aria-label="Close">✕</button>
        </div>

        <div className="text-xs text-slate-400">
          Shown as <span className="font-semibold text-slate-200">{phrase.translation}</span>
          <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-300">{origin}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Meanings · saved to {saveTo}</span>
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => {
              const current = option === phrase.translation;
              return (
                <button
                  key={option}
                  type="button"
                  data-phrase-option={option}
                  aria-current={current ? 'true' : undefined}
                  disabled={saving}
                  onClick={() => { if (!current && onPick) onPick(option); }}
                  className={`${BTN} font-medium ${current ? 'bg-indigo-600 text-white border border-indigo-500' : 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'}`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            id="reader-phrase-custom"
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && value && onPick) { e.preventDefault(); onPick(value); } }}
            className="flex-1 min-w-0 min-h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Your own meaning"
          />
          <button id="reader-phrase-use-btn" type="button" disabled={saving || !value} onClick={() => onPick && onPick(value)} className={`${BTN} text-white bg-indigo-500 hover:bg-indigo-600`}>
            Use
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button id="reader-phrase-name-btn" type="button" disabled={saving || !value} onClick={() => onSaveName && onSaveName(value)} className={`${BTN} text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700`}>
            Save as name
          </button>
          {phrase.entryId ? (
            <button id="reader-phrase-open-name" type="button" onClick={() => onOpenName && onOpenName(phrase.entryId)} className={`${BTN} text-indigo-300 hover:text-indigo-200 hover:bg-slate-800`}>
              Open in Name List
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
