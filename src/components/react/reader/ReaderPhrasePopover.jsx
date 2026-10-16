import React, { useEffect, useState } from 'react';
import { PHRASE_KIND_LABELS, PHRASE_ORIGIN_LABELS, editedPhrase, phraseSaveKind } from './readerText.js';

const BTN = 'min-h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-40 disabled:pointer-events-none';

export default function ReaderPhrasePopover({ phrase, options = [], saving = false, canExtendLeft = false, canExtendRight = false, onExtendLeft, onExtendRight, onPick, onSaveName, onOpenName, onClose, suggestions = [], suggestionsLoading = false, onAcceptSuggestion, onRejectSuggestion, readingOf, meaningsOf }) {
  const [custom, setCustom] = useState(phrase ? phrase.translation : '');
  const [sourceText, setSourceText] = useState(phrase ? phrase.source : '');

  useEffect(() => { setCustom(phrase ? phrase.translation : ''); setSourceText(phrase ? phrase.source : ''); }, [phrase]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!phrase) return null;
  const origin = PHRASE_ORIGIN_LABELS[phrase.origin] || phrase.origin;
  const saveTo = PHRASE_KIND_LABELS[phraseSaveKind(phrase)];
  const value = custom.trim();
  const edited = editedPhrase(phrase, sourceText, { readingOf, meaningsOf });
  const unedited = edited.source === phrase.source;
  const shownOptions = unedited && options.length > 0 ? options : edited.options;
  const canSave = !saving && !!edited.source;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        id="reader-phrase-popover"
        role="dialog"
        aria-label={`Phrase ${phrase.source}`}
        className="fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-6 w-full sm:w-[28rem] max-h-[80vh] overflow-y-auto bg-slate-900 border-t sm:border border-slate-700 sm:rounded-xl rounded-t-xl shadow-2xl p-4 flex flex-col gap-3 text-slate-100"
      >
        <div className="flex items-start gap-2">
          <button
            id="reader-phrase-extend-left"
            type="button"
            disabled={!canExtendLeft}
            onClick={onExtendLeft}
            aria-label="Extend selection to the previous chunk"
            title="Extend selection to the previous chunk"
            className={`${BTN} w-10 px-0 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-center">
            <input
              id="reader-phrase-source"
              type="text"
              lang="zh"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              aria-label="Chinese text to save (edit to save only part of it)"
              title="Edit to save only part of the chunk"
              className="w-full min-w-0 min-h-10 px-2 rounded-lg bg-slate-950 border border-slate-700 text-center text-2xl font-bold text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <span className="text-sm text-slate-400">{edited.reading}</span>
          </div>
          <button
            id="reader-phrase-extend-right"
            type="button"
            disabled={!canExtendRight}
            onClick={onExtendRight}
            aria-label="Extend selection to the next chunk"
            title="Extend selection to the next chunk"
            className={`${BTN} w-10 px-0 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
          <button type="button" onClick={onClose} className={`${BTN} w-10 px-0 text-slate-400 hover:text-white hover:bg-slate-800`} title="Close (Esc)" aria-label="Close">✕</button>
        </div>

        <div className="text-xs text-slate-400">
          Shown as <span className="font-semibold text-slate-200">{phrase.translation}</span>
          <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-300">{origin}</span>
        </div>

        {suggestionsLoading ? (
          <div className="text-xs text-slate-400">Looking for names in this chapter…</div>
        ) : null}
        {!suggestionsLoading && suggestions.length > 0 ? (
          <div id="reader-phrase-suggestions" className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
            <span className="text-[11px] uppercase tracking-wide text-emerald-300">Possible names</span>
            {suggestions.map((candidate) => (
              <div key={candidate.text} className="flex flex-wrap items-center gap-2">
                <span lang="zh" className="text-base font-semibold">{candidate.text}</span>
                <span className="text-sm text-slate-300 flex-1 min-w-0">{candidate.suggested}</span>
                <button
                  type="button"
                  data-suggestion-add={candidate.text}
                  disabled={saving}
                  onClick={() => onAcceptSuggestion && onAcceptSuggestion(candidate)}
                  className={`${BTN} text-white bg-emerald-600 hover:bg-emerald-500`}
                  title={`Add ${candidate.text} = ${candidate.suggested} to the Name List`}
                >
                  Add
                </button>
                <button
                  type="button"
                  data-suggestion-reject={candidate.text}
                  disabled={saving}
                  onClick={() => onRejectSuggestion && onRejectSuggestion(candidate)}
                  className={`${BTN} text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700`}
                  title="Not a name: stop suggesting it for this novel"
                >
                  Not a name
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Meanings · saved to {saveTo}</span>
          <div className="flex flex-wrap gap-1.5">
            {shownOptions.map((option) => {
              const current = unedited && option === phrase.translation;
              return (
                <button
                  key={option}
                  type="button"
                  data-phrase-option={option}
                  aria-current={current ? 'true' : undefined}
                  disabled={saving}
                  onClick={() => { if (!current && onPick && edited.source) onPick(option, edited.source); }}
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
            onKeyDown={(e) => { if (e.key === 'Enter' && onPick && edited.source) { e.preventDefault(); onPick(value, edited.source); } }}
            className="flex-1 min-w-0 min-h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Your own meaning"
          />
          <button id="reader-phrase-use-btn" type="button" disabled={!canSave} onClick={() => onPick && onPick(value, edited.source)} className={`${BTN} text-white bg-indigo-500 hover:bg-indigo-600`}>
            Use
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button id="reader-phrase-name-btn" type="button" disabled={!canSave} onClick={() => onSaveName && onSaveName(value, edited.source)} className={`${BTN} text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700`}>
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
