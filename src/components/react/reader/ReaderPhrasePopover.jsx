import React, { useEffect, useState } from 'react';
import { PHRASE_KIND_LABELS, PHRASE_ORIGIN_LABELS, editedPhrase, meaningPickKind } from './readerText.js';

const BTN = 'min-h-10 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg text-sm font-semibold transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-40 disabled:pointer-events-none';

export default function ReaderPhrasePopover({ phrase, options = [], saving = false, canExtendLeft = false, canExtendRight = false, onExtendLeft, onExtendRight, onPick, onSaveName, onSaveLocked, onOpenName, onUse, onDeleteName, storeNamesOf, storeNamesLoading = false, bookNameOf, onClose, suggestions = [], suggestionsLoading = false, onAcceptSuggestion, onRejectSuggestion, readingOf, meaningsOf, definitionsOf, definitionsLoading = false, definitionsError = false }) {
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
  const saveTo = PHRASE_KIND_LABELS[meaningPickKind(phrase)];
  const value = custom.trim();
  const edited = editedPhrase(phrase, sourceText, { readingOf, meaningsOf });
  const unedited = edited.source === phrase.source;
  const shownOptions = unedited && options.length > 0 ? options : edited.options;
  const canSave = !saving && !!edited.source;
  const showDictionary = definitionsLoading || definitionsError || typeof definitionsOf === 'function';
  const useCustom = onUse || onPick;
  const storeNames = typeof storeNamesOf === 'function' && edited.source ? storeNamesOf(edited.source) || [] : [];
  const bookName = typeof bookNameOf === 'function' && edited.source ? bookNameOf(edited.source) : null;
  const definitions = !definitionsLoading && !definitionsError && typeof definitionsOf === 'function' && edited.source ? definitionsOf(edited.source) : [];

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
          <span className="text-[11px] uppercase tracking-wide text-slate-500">VietPhrase · tap to save to {saveTo}</span>
          <p data-section-sources="vietphrase" className="text-[11px] leading-snug text-slate-500">From the Locked Glossaries of your other books, the bundled QuickTranslator dictionaries VietPhrase.txt, Pronouns.txt and Names.txt, the meaning shown now and the Hán Việt reading.</p>
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

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Name store · tap to save to {PHRASE_KIND_LABELS.namelist}</span>
          <p data-section-sources="store" className="text-[11px] leading-snug text-slate-500">From the Name Lists of your other books, plus the bundled QuickTranslator Names.txt (QT Names).</p>
          {storeNames.length === 0 ? (
            <div className="text-xs text-slate-400">{storeNamesLoading ? 'Loading names from your other books…' : 'No saved names for this phrase.'}</div>
          ) : (
            <div id="reader-phrase-store" className="flex flex-wrap gap-1.5">
              {storeNames.map((name) => (
                <button
                  key={name.translation}
                  type="button"
                  data-store-name={name.translation}
                  disabled={!canSave}
                  onClick={() => onSaveName && onSaveName(name.translation, edited.source)}
                  title={`Save ${edited.source} = ${name.translation} to this book's Name List`}
                  className={`${BTN} font-medium bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700`}
                >
                  <span>{name.translation}</span>
                  <span className="text-[11px] font-normal text-slate-400">{name.from}</span>
                </button>
              ))}
            </div>
          )}
          {bookName ? (
            <div>
              <button id="reader-phrase-delete-name" type="button" disabled={saving} onClick={() => onDeleteName && onDeleteName(bookName)} title={`Remove ${bookName.original} from this book's Name List`} className={`${BTN} text-rose-300 bg-slate-800 border border-slate-700 hover:bg-rose-500/20`}>
                Delete name
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <input
            id="reader-phrase-custom"
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && useCustom && edited.source) { e.preventDefault(); useCustom(value, edited.source); } }}
            className="flex-1 min-w-0 min-h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="Your own meaning"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button id="reader-phrase-name-btn" type="button" disabled={!canSave} onClick={() => onSaveName && onSaveName(value, edited.source)} className={`${BTN} text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700`}>
            Save as name
          </button>
          <button id="reader-phrase-locked-btn" type="button" disabled={!canSave} onClick={() => onSaveLocked && onSaveLocked(value, edited.source)} title="Save this meaning to the Locked Glossary" className={`${BTN} text-slate-200 bg-slate-800 border border-slate-700 hover:bg-slate-700`}>
            Save as locked
          </button>
          {phrase.entryId ? (
            <button id="reader-phrase-open-name" type="button" onClick={() => onOpenName && onOpenName(phrase.entryId)} className={`${BTN} text-indigo-300 hover:text-indigo-200 hover:bg-slate-800`}>
              Open in Name List
            </button>
          ) : null}
        </div>

        {showDictionary ? (
          <section id="reader-phrase-dictionary" className="flex flex-col gap-2.5 rounded-lg border border-slate-700 bg-slate-950/60 p-2.5">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Dictionary · Lạc Việt</span>
            {definitionsLoading ? (
              <div className="text-xs text-slate-400">Loading the Lạc Việt dictionary…</div>
            ) : definitionsError ? (
              <div className="text-xs text-rose-300">The Lạc Việt dictionary could not be loaded.</div>
            ) : definitions.length === 0 ? (
              <div className="text-xs text-slate-400">No Lạc Việt entry for this phrase.</div>
            ) : definitions.map((definition) => (
              <div key={definition.source} data-definition={definition.source} className="flex flex-col gap-1.5">
                {definition.entries.map((entry, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      {i === 0 ? <span lang="zh" className="text-base font-semibold text-slate-100">{definition.source}</span> : null}
                      {entry.pinyin ? <span className="text-sm text-indigo-300">{entry.pinyin}</span> : null}
                      {entry.hanViet ? <span className="text-xs font-semibold text-slate-400">{entry.hanViet}</span> : null}
                    </div>
                    {entry.senses.map((sense, j) => (
                      <p key={j} className="text-sm leading-snug text-slate-300 pl-2">{sense}</p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
