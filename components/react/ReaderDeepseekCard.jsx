import React, { useEffect, useRef, useState } from 'react';

function getParams() {
  if (typeof window === 'undefined') return { id: null };
  const params = new URLSearchParams(window.location.search);
  return { id: params.get('id') };
}

const PANEL_IDS = {
  toggle: 'reader-deepseek-toggle',
  toggleBadge: 'reader-deepseek-toggle-badge',
  providerBadge: 'reader-provider-badge',
  providerBtnOfficial: 'reader-provider-btn-official',
  providerBtnCustom: 'reader-provider-btn-custom',
  customRow: 'reader-custom-api-row',
  customUrl: 'reader-custom-base-url',
  presetBtn: 'reader-bridge-preset-btn',
  testCustomBtn: 'reader-test-custom-btn',
  apiKeyLabel: 'reader-api-key-label',
  apiKey: 'reader-deepseek-api-key',
  rememberKey: 'reader-remember-deepseek-key',
  clearKeyBtn: 'reader-clear-deepseek-btn',
  prompt: 'reader-deepseek-prompt',
  visibilityBtn: 'reader-toggle-key-visibility',
  fields: 'reader-deepseek-config-fields',
  editPromptBtn: 'reader-edit-prompt-btn',
  modelSelect: 'reader-deepseek-model-select',
  testBtn: 'reader-test-deepseek-btn',
  testStatus: 'reader-deepseek-test-status',
  balanceBadge: 'reader-deepseek-balance-badge',
  balanceText: 'reader-deepseek-balance-text',
  refreshBalanceBtn: 'reader-deepseek-refresh-balance-btn',
  refreshBalanceIcon: 'reader-deepseek-refresh-balance-icon',
  pricingBadge: 'reader-deepseek-pricing-badge'
};

export default function ReaderDeepseekCard() {
  const [{ id }] = useState(getParams);
  const novelRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storage = typeof window !== 'undefined' ? window.StorageService : null;
      if (storage && id) {
        try {
          novelRef.current = (await storage.getNovelById(id)) || null;
        } catch (e) {
          console.error('[ReaderDeepseekCard] Failed to load novel:', e);
        }
      }
      if (cancelled) return;

      if (typeof window === 'undefined' || !window.AiConfigPanel || typeof window.AiConfigPanel.create !== 'function') {
        console.warn('[ReaderDeepseekCard] AiConfigPanel module not loaded; DeepSeek panel disabled.');
        return;
      }

      panelRef.current = window.AiConfigPanel.create({
        variant: 'full',
        capabilities: { cooldown: false },
        options: { readerPromptStyle: true },
        ids: PANEL_IDS,
        hooks: {
          getPrompt: () => (novelRef.current && novelRef.current.translationPrompt) || null,
          savePrompt: async (text) => {
            const novel = novelRef.current;
            if (!novel) return;
            novel.translationPrompt = text;
            const service = typeof window !== 'undefined' ? window.StorageService : null;
            if (service && typeof service.updateNovel === 'function') {
              await service.updateNovel(novel.id, { translationPrompt: text });
            }
          },
          onPromptSaved: () => {
            window.dispatchEvent(new CustomEvent('reader-show-toast', { detail: 'Translation prompt saved ✓' }));
          }
        }
      });

      if (panelRef.current) await panelRef.current.refresh();
    })();

    const onRefreshBalance = () => {
      if (panelRef.current && typeof panelRef.current.refreshBalance === 'function') {
        panelRef.current.refreshBalance(true);
      }
    };
    window.addEventListener('reader-refresh-balance', onRefreshBalance);

    return () => {
      cancelled = true;
      window.removeEventListener('reader-refresh-balance', onRefreshBalance);
    };
  }, [id]);

  return (
    <div className="w-full text-left rounded-xl bg-slate-800/80 border border-slate-700/80 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-base">
            🌐
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">DeepSeek Translation on Download</h3>
              <span id="reader-deepseek-toggle-badge" className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                Off (Save Raw Chapter)
              </span>
              <span id="reader-provider-badge" className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Official API
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              When enabled, this chapter will be automatically translated via DeepSeek API before saving.
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" id="reader-deepseek-toggle" className="sr-only peer" />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500"></div>
        </label>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">AI Provider:</span>
          <span id="reader-provider-badge" className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Official API
          </span>
        </div>
        <div className="inline-flex rounded-lg bg-slate-900/90 p-1 border border-slate-700/70 gap-1 text-xs">
          <button
            type="button"
            id="reader-provider-btn-official"
            className="px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-indigo-600 text-white shadow-sm"
          >
            Official DeepSeek API
          </button>
          <button
            type="button"
            id="reader-provider-btn-custom"
            className="px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200"
          >
            Custom API
          </button>
        </div>
      </div>

      <div id="reader-custom-api-row" className="hidden flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg bg-slate-900/60 border border-purple-500/30">
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="reader-custom-base-url" className="text-xs font-semibold text-purple-300">
              Custom Base URL
            </label>
            <button
              type="button"
              id="reader-bridge-preset-btn"
              className="text-[11px] font-mono text-purple-400 hover:text-purple-200 transition underline cursor-pointer"
              title="Click to fill local web bridge default URL"
            >
              Use Local Bridge (127.0.0.1:8000/v1)
            </button>
          </div>
          <input
            type="text"
            id="reader-custom-base-url"
            placeholder="http://127.0.0.1:8000/v1"
            className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition font-mono"
          />
        </div>
        <button
          type="button"
          id="reader-test-custom-btn"
          className="self-end sm:self-auto mt-2 sm:mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 transition cursor-pointer"
        >
          Test Connection
        </button>
      </div>

      <div id="reader-deepseek-config-fields" className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="reader-deepseek-model-select" className="text-xs font-semibold text-slate-300">
              Model
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span id="reader-deepseek-pricing-badge" className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400" title="Live DeepSeek UTC Pricing Schedule">
                Off-Peak (50% Off)
              </span>
              <div id="reader-deepseek-balance-badge" className="hidden items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none" title="DeepSeek Account Balance">
                <span className="opacity-80">💳</span>
                <span id="reader-deepseek-balance-text">...</span>
                <button type="button" id="reader-deepseek-refresh-balance-btn" className="hover:text-white transition ml-0.5 cursor-pointer" title="Refresh balance">
                  <svg id="reader-deepseek-refresh-balance-icon" className="w-2.5 h-2.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </button>
              </div>
              <span className="text-[11px] text-slate-500">DeepSeek V4.1</span>
            </div>
          </div>
          <select
            id="reader-deepseek-model-select"
            defaultValue="deepseek-flash"
            className="w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer"
          >
            <option value="deepseek-flash">deepseek-flash (V4.1-Flash • Fast)</option>
            <option value="deepseek-chat">deepseek-chat (V3 • Standard)</option>
            <option value="deepseek-reasoner">deepseek-reasoner (R1 • DeepThink)</option>
          </select>
          <div id="reader-deepseek-test-status" className="hidden text-[11px] px-2.5 py-1.5 rounded-md border mt-1"></div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="reader-deepseek-api-key" id="reader-api-key-label" className="text-xs font-semibold text-slate-300">
              1. DeepSeek API Key
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="reader-test-deepseek-btn"
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60"
                title="Test connection and check balance"
              >
                Test Key
              </button>
              <button
                type="button"
                id="reader-toggle-key-visibility"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
              >
                Show Key
              </button>
            </div>
          </div>
          <input
            type="password"
            id="reader-deepseek-api-key"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            placeholder="sk-..."
            className="w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition font-mono"
          />
          <div className="flex items-center justify-between pt-0.5 text-[11px] text-slate-400">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Keep key saved across browser restarts">
              <input
                type="checkbox"
                id="reader-remember-deepseek-key"
                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer"
              />
              <span>Remember on this device</span>
            </label>
            <button
              type="button"
              id="reader-clear-deepseek-btn"
              className="hidden text-rose-400 hover:text-rose-300 transition text-[11px] underline cursor-pointer"
              title="Clear API key from memory and storage"
            >
              Clear Key
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="reader-deepseek-prompt" className="text-xs font-semibold text-slate-300">
              2. Translation Prompt (Saved with Novel)
            </label>
            <button
              type="button"
              id="reader-edit-prompt-btn"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60"
            >
              Edit
            </button>
          </div>
          <textarea
            id="reader-deepseek-prompt"
            rows={3}
            readOnly
            placeholder="Enter translation instructions/prompt for DeepSeek..."
            className="w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none transition resize-none leading-relaxed cursor-default"
          ></textarea>
        </div>
      </div>
    </div>
  );
}
