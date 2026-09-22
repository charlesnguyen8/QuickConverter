import React, { useEffect, useRef, useState } from 'react';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

const PANEL_IDS = {
  toggle: 'deepseek-toggle',
  toggleBadge: 'deepseek-toggle-badge',
  providerBadge: 'novel-provider-badge',
  providerBtnOfficial: 'novel-provider-btn-official',
  providerBtnCustom: 'novel-provider-btn-custom',
  customRow: 'novel-custom-api-row',
  customUrl: 'novel-custom-base-url',
  presetBtn: 'novel-bridge-preset-btn',
  testCustomBtn: 'novel-test-custom-btn',
  apiKeyLabel: 'novel-api-key-label',
  apiKey: 'deepseek-api-key',
  rememberKey: 'remember-deepseek-key',
  clearKeyBtn: 'clear-deepseek-btn',
  prompt: 'deepseek-prompt',
  visibilityBtn: 'toggle-key-visibility',
  fields: 'deepseek-config-fields',
  editPromptBtn: 'edit-prompt-btn',
  modelSelect: 'deepseek-model-select',
  testBtn: 'test-deepseek-btn',
  testStatus: 'deepseek-test-status',
  balanceBadge: 'deepseek-balance-badge',
  balanceText: 'deepseek-balance-text',
  refreshBalanceBtn: 'deepseek-refresh-balance-btn',
  refreshBalanceIcon: 'deepseek-refresh-balance-icon',
  pricingBadge: 'deepseek-pricing-badge',
  cooldownToggle: 'novel-cooldown-toggle',
  cooldownToggleLabel: 'novel-cooldown-toggle-label',
  cooldownMin: 'novel-cooldown-min',
  cooldownMax: 'novel-cooldown-max',
  cooldownMinLabel: 'novel-cooldown-min-label',
  cooldownMaxLabel: 'novel-cooldown-max-label',
  cooldownBadge: 'novel-cooldown-badge',
  cooldownInputs: 'novel-cooldown-inputs-container'
};

export default function NovelDeepseekCard() {
  const [novelId] = useState(getNovelId);
  const novelRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storage = typeof window !== 'undefined' ? window.StorageService : null;
      if (storage && novelId) {
        try {
          novelRef.current = (await storage.getNovelById(novelId)) || null;
        } catch (e) {
          console.error('[NovelDeepseekCard] Failed to load novel:', e);
        }
      }
      if (cancelled) return;

      if (typeof window === 'undefined' || !window.AiConfigPanel || typeof window.AiConfigPanel.create !== 'function') {
        console.warn('[NovelDeepseekCard] AiConfigPanel module not loaded; DeepSeek panel disabled.');
        return;
      }

      panelRef.current = window.AiConfigPanel.create({
        variant: 'full',
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
    window.addEventListener('novel-refresh-balance', onRefreshBalance);

    return () => {
      cancelled = true;
      window.removeEventListener('novel-refresh-balance', onRefreshBalance);
    };
  }, [novelId]);

  return (
    <div className="rounded-xl bg-slate-800/70 border border-slate-700/70 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-base">
            🌐
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">DeepSeek Translation on Download</h3>
              <span id="deepseek-toggle-badge" className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                Off (Save Raw Chapter)
              </span>
              <span id="novel-provider-badge" className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Official API
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              When enabled, chapters are automatically translated via DeepSeek API before saving to library.
            </p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" id="deepseek-toggle" className="sr-only peer" />
          <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500"></div>
        </label>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-700/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">AI Provider:</span>
          <span id="novel-provider-badge" className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            Official API
          </span>
        </div>
        <div className="inline-flex rounded-lg bg-slate-900/90 p-1 border border-slate-700/70 gap-1 text-xs">
          <button
            type="button"
            id="novel-provider-btn-official"
            className="px-3 py-1 rounded-md font-semibold text-xs transition cursor-pointer bg-indigo-600 text-white shadow-sm"
          >
            Official DeepSeek API
          </button>
          <button
            type="button"
            id="novel-provider-btn-custom"
            className="px-3 py-1 rounded-md font-medium text-xs transition cursor-pointer text-slate-400 hover:text-slate-200"
          >
            Custom API
          </button>
        </div>
      </div>

      <div id="novel-custom-api-row" className="hidden flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg bg-slate-900/60 border border-purple-500/30">
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="novel-custom-base-url" className="text-xs font-semibold text-purple-300">
              Custom Base URL
            </label>
            <button
              type="button"
              id="novel-bridge-preset-btn"
              className="text-[11px] font-mono text-purple-400 hover:text-purple-200 transition underline cursor-pointer"
              title="Click to fill local web bridge default URL"
            >
              Use Local Bridge (127.0.0.1:8000/v1)
            </button>
          </div>
          <input
            type="text"
            id="novel-custom-base-url"
            placeholder="http://127.0.0.1:8000/v1"
            className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition font-mono"
          />
        </div>
        <button
          type="button"
          id="novel-test-custom-btn"
          className="self-end sm:self-auto mt-2 sm:mt-4 px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-300 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 transition cursor-pointer"
        >
          Test Connection
        </button>
      </div>

      <div id="deepseek-config-fields" className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="deepseek-model-select" className="text-xs font-semibold text-slate-300">
              Model
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span id="deepseek-pricing-badge" className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400" title="Live DeepSeek UTC Pricing Schedule">
                Off-Peak (50% Off)
              </span>
              <div id="deepseek-balance-badge" className="hidden items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none" title="DeepSeek Account Balance">
                <span className="opacity-80">💳</span>
                <span id="deepseek-balance-text">...</span>
                <button type="button" id="deepseek-refresh-balance-btn" className="hover:text-white transition ml-0.5 cursor-pointer" title="Refresh balance">
                  <svg id="deepseek-refresh-balance-icon" className="w-2.5 h-2.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </button>
              </div>
              <span className="text-[11px] text-slate-500">DeepSeek V4.1</span>
            </div>
          </div>
          <select
            id="deepseek-model-select"
            defaultValue="deepseek-flash"
            className="w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer"
          >
            <option value="deepseek-flash">deepseek-flash (V4.1-Flash • Fast)</option>
            <option value="deepseek-chat">deepseek-chat (V3 • Standard)</option>
            <option value="deepseek-reasoner">deepseek-reasoner (R1 • DeepThink)</option>
          </select>
          <div id="deepseek-test-status" className="hidden text-[11px] px-2.5 py-1.5 rounded-md border mt-1"></div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="deepseek-api-key" id="novel-api-key-label" className="text-xs font-semibold text-slate-300">
              1. DeepSeek API Key
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="test-deepseek-btn"
                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60"
                title="Test connection and check balance"
              >
                Test Key
              </button>
              <button
                type="button"
                id="toggle-key-visibility"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
              >
                Show Key
              </button>
            </div>
          </div>
          <input
            type="password"
            id="deepseek-api-key"
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
                id="remember-deepseek-key"
                className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer"
              />
              <span>Remember on this device</span>
            </label>
            <button
              type="button"
              id="clear-deepseek-btn"
              className="hidden text-rose-400 hover:text-rose-300 transition text-[11px] underline cursor-pointer"
              title="Clear API key from memory and storage"
            >
              Clear Key
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="deepseek-prompt" className="text-xs font-semibold text-slate-300">
              2. Translation Prompt (Saved with Novel)
            </label>
            <button
              type="button"
              id="edit-prompt-btn"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-2 py-0.5 rounded hover:bg-slate-700/60"
            >
              Edit
            </button>
          </div>
          <textarea
            id="deepseek-prompt"
            rows={3}
            readOnly
            placeholder="Enter translation instructions/prompt for DeepSeek..."
            className="w-full px-3 py-2 text-xs bg-slate-900/90 border border-slate-700 rounded-lg text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition resize-none leading-relaxed cursor-default"
          ></textarea>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900/90 border border-slate-700/80 p-4 flex flex-col gap-3.5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 text-sm">
              ⏳
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-100">Rate Limit Cooldown</span>
                <span id="novel-cooldown-badge" className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Active (3m – 5m)
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Pause a randomized duration between queued chapters to avoid API rate limits.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span id="novel-cooldown-toggle-label" className="text-xs font-bold text-amber-400 font-mono">ON</span>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" title="Enable or disable rate limit cooldown between chapters">
              <input type="checkbox" id="novel-cooldown-toggle" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 cooldown-slider-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
        </div>

        <div id="novel-cooldown-inputs-container" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300">Minimum Wait</span>
              <span id="novel-cooldown-min-label" className="text-slate-400 font-mono font-medium">3 min</span>
            </div>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40 transition">
              <input
                type="number"
                id="novel-cooldown-min"
                min="10"
                max="600"
                step="5"
                defaultValue={180}
                className="cooldown-number-input flex-1 min-w-0 px-3 py-1.5 text-xs font-mono font-bold"
              />
              <span className="px-2.5 py-1.5 text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border-l border-slate-700/80 select-none flex-shrink-0">
                seconds
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300">Maximum Wait</span>
              <span id="novel-cooldown-max-label" className="text-slate-400 font-mono font-medium">5 min</span>
            </div>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40 transition">
              <input
                type="number"
                id="novel-cooldown-max"
                min="10"
                max="1200"
                step="5"
                defaultValue={300}
                className="cooldown-number-input flex-1 min-w-0 px-3 py-1.5 text-xs font-mono font-bold"
              />
              <span className="px-2.5 py-1.5 text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border-l border-slate-700/80 select-none flex-shrink-0">
                seconds
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
