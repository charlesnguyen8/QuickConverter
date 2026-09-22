import React from 'react';
import ReaderDeepseekCard from './ReaderDeepseekCard.jsx';

export default function ReaderNotSaved({ downloading = false, failed = false, translating = false, model = 'deepseek-flash', onDownload }) {
  let label = 'Download Chapter';
  if (failed) label = 'Failed. Click to Retry';
  else if (downloading) label = translating ? `Translating (${model})...` : 'Downloading Chapter...';

  return (
    <div id="reader-not-saved" className="flex flex-col items-center justify-center py-10 px-4 sm:px-8 text-center gap-6 bg-slate-800/40 border border-slate-700/60 rounded-xl shadow-sm">
      <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl text-indigo-400">
        📥
      </div>
      <div className="flex flex-col gap-1 items-center">
        <h2 className="text-lg font-bold text-slate-100">Chapter Not Downloaded Yet</h2>
        <p className="text-sm text-slate-400 max-w-md">
          This chapter hasn't been saved to your local storage yet. Configure your translation options below and download directly.
        </p>
      </div>

      <ReaderDeepseekCard />

      <button
        type="button"
        id="reader-download-btn"
        disabled={downloading}
        onClick={onDownload}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition shadow-sm cursor-pointer active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      >
        {downloading ? (
          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        )}
        <span id="reader-download-text">{label}</span>
      </button>
    </div>
  );
}
