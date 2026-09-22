import React, { useCallback, useEffect, useState } from 'react';

function getParams() {
  if (typeof window === 'undefined') return { id: null, ch: 0 };
  const params = new URLSearchParams(window.location.search);
  return { id: params.get('id'), ch: parseInt(params.get('ch'), 10) || 0 };
}

export default function ReaderSourceDrawer() {
  const [params] = useState(getParams);
  const [chapter, setChapter] = useState(null);
  const [open, setOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(true);

  const load = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !params.id) return;
    try {
      const record = await storage.getChapter(params.id, params.ch);
      setChapter(record || null);
    } catch (e) {
      console.error('Error loading source drawer:', e);
    }
  }, [params.id, params.ch]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onClose = () => setOpen(false);
    const onRefresh = () => load();
    window.addEventListener('reader-open-source', onOpen);
    window.addEventListener('reader-close-source', onClose);
    window.addEventListener('reader-chapter-refresh', onRefresh);
    return () => {
      window.removeEventListener('reader-open-source', onOpen);
      window.removeEventListener('reader-close-source', onClose);
      window.removeEventListener('reader-chapter-refresh', onRefresh);
    };
  }, [load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const cost = chapter && chapter.translationCost;
  const reasoning = chapter && chapter.reasoningText;
  const originalText = chapter ? (chapter.originalRawText || '') : '';
  const displayText = originalText || (chapter ? (chapter.rawText || '') : '');

  const copySource = async () => {
    if (!originalText) return;
    try { await navigator.clipboard.writeText(originalText); } catch (e) {}
  };

  return (
    <aside
      id="source-drawer"
      className={`fixed top-0 right-0 h-full w-full sm:w-96 md:w-[460px] bg-slate-950/95 backdrop-blur-md border-l border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}
      aria-label="Original Source Reference"
      aria-hidden={!open}
    >
      <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h2 className="text-sm font-bold text-slate-100">Original Source Reference</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={copySource} className="px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition cursor-pointer" title="Copy original source text">
            Copy
          </button>
          <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer" title="Close drawer (Esc)">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2" strokeLinecap="round" />
              <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 text-slate-300 font-sans text-sm whitespace-pre-wrap leading-relaxed select-text space-y-4">
        {cost ? (
          <div id="source-drawer-cost-card" className="p-3.5 rounded-lg bg-slate-800/90 border border-slate-700/80 text-xs flex flex-col gap-2.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <span>💰</span>
                <span>Translation Request Accounting</span>
              </span>
              <span
                id="drawer-cost-rate-badge"
                className={cost.isPeak
                  ? 'text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/15 text-amber-400'
                  : 'text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400'}
              >
                {cost.ratePeriod || 'Off-Peak'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-[11px] text-slate-400">
              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Input (Prompt + Source):</span>
                <span className="font-mono text-slate-200 font-semibold block text-xs">{(cost.promptTokens || 0).toLocaleString()} tokens</span>
                <span className="text-[10px] text-emerald-400 block mt-0.5">{(cost.cacheHitTokens || 0).toLocaleString()} cached (90% off)</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                <span className="text-slate-400 block text-[10px]">Output (Translation):</span>
                <span className="font-mono text-slate-200 font-semibold block text-xs">{(cost.completionTokens || 0).toLocaleString()} tokens</span>
                <span className="text-[10px] text-slate-400 block mt-0.5">{(cost.totalTokens || 0).toLocaleString()} total tokens</span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
              <span className="text-slate-400 text-xs">Total Chapter Cost:</span>
              <span className="font-mono font-bold text-sm text-indigo-300">{cost.formattedCost} USD</span>
            </div>
          </div>
        ) : null}

        {reasoning ? (
          <div id="source-reasoning-container" className="p-3.5 rounded-lg bg-purple-950/30 border border-purple-800/50 text-xs flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setReasoningOpen((v) => !v)}>
              <span className="font-bold text-purple-300 flex items-center gap-1.5">
                <span>🧠</span>
                <span>DeepThink Reasoning Process (R1)</span>
              </span>
              <span className="text-xs text-purple-400 font-mono">{reasoningOpen ? '▼' : '►'}</span>
            </div>
            {reasoningOpen ? (
              <div className="text-purple-200/90 text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto bg-slate-950/60 p-2.5 rounded border border-purple-900/40">
                {reasoning}
              </div>
            ) : null}
          </div>
        ) : null}

        <div id="source-drawer-text">{displayText || 'No separate raw source text stored.'}</div>
      </div>

      <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-900/40 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Read-only source chapter</span>
        <span>Hotkey: <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">S</kbd></span>
      </div>
    </aside>
  );
}
