import React from 'react';

// Markup-only card: popup.js still calls AiConfigPanel.create() against these
// element IDs at DOMContentLoaded. Port its logic next.
export default function PopupDeepseekCard() {
  return (
    <div className="rounded-lg bg-slate-800/90 border border-slate-700/80 p-3 shadow-sm flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 text-xs">
            🌐
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-slate-100">DeepSeek Translation</span>
              <span id="deepseek-toggle-badge" className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600">
                Off (Save Raw)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">Translate chapter via API before saving</p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input type="checkbox" id="deepseek-toggle" className="sr-only peer" />
          <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-500 peer-checked:to-purple-500"></div>
        </label>
      </div>

      <div id="deepseek-config-fields" className="flex flex-col gap-2 pt-2 border-t border-slate-700/60">
        <div className="flex flex-col gap-1.5 p-2 rounded-md bg-slate-900/60 border border-slate-700/70">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
            <span>AI Provider</span>
            <span id="popup-provider-badge" className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Official Cloud</span>
          </div>
          <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-md border border-slate-700/80">
            <button type="button" id="popup-provider-btn-official" className="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer bg-indigo-600 text-white shadow-sm">
              Official DeepSeek
            </button>
            <button type="button" id="popup-provider-btn-custom" className="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer text-slate-400 hover:text-slate-200">
              Custom API / Bridge
            </button>
          </div>
          <div id="popup-custom-api-row" className="hidden flex-col gap-1 pt-1 border-t border-slate-700/50">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <label htmlFor="popup-custom-base-url" className="font-mono">Base URL:</label>
              <div className="flex items-center gap-1.5">
                <button type="button" id="popup-bridge-preset-btn" className="text-[9px] text-purple-400 hover:text-purple-300 underline font-mono cursor-pointer" title="Use local bridge default (port 8000)">Preset (8000)</button>
                <button type="button" id="popup-test-custom-btn" className="text-[9px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer">Ping</button>
              </div>
            </div>
            <input
              type="text"
              id="popup-custom-base-url"
              defaultValue="http://127.0.0.1:8000/v1"
              placeholder="http://127.0.0.1:8000/v1"
              className="w-full px-2 py-1 text-[11px] font-mono bg-slate-950/80 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition"
            />
            <div id="popup-custom-test-status" className="hidden text-[10px] px-1.5 py-0.5 rounded border"></div>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="deepseek-model-select" className="text-[11px] font-semibold text-slate-300">Model</label>
            <div className="flex items-center gap-1 flex-wrap">
              <span id="deepseek-pricing-badge" className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-400" title="Live DeepSeek UTC Pricing Schedule">
                Off-Peak (50% Off)
              </span>
              <div id="deepseek-balance-badge" className="hidden items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 select-none" title="DeepSeek Account Balance">
                <span>💳</span>
                <span id="deepseek-balance-text">...</span>
                <button type="button" id="deepseek-refresh-balance-btn" className="hover:text-white transition ml-0.5 cursor-pointer" title="Refresh balance">
                  <svg id="deepseek-refresh-balance-icon" className="w-2.5 h-2.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </button>
              </div>
              <span className="text-[10px] text-slate-400">DeepSeek V4.1</span>
            </div>
          </div>
          <select
            id="deepseek-model-select"
            defaultValue="deepseek-flash"
            className="w-full px-2 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition cursor-pointer"
          >
            <option value="deepseek-flash">deepseek-flash (V4.1-Flash • Fast)</option>
            <option value="deepseek-chat">deepseek-chat (V3 • Standard)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="deepseek-api-key" id="popup-api-key-label" className="text-[11px] font-semibold text-slate-300">
              1. DeepSeek API Key
            </label>
            <div className="flex items-center gap-1.5">
              <button type="button" id="test-deepseek-btn" className="text-[10px] font-medium text-emerald-400 hover:text-emerald-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60" title="Test key and fetch live models">
                Test Key
              </button>
              <button type="button" id="toggle-key-visibility" className="text-[10px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer">
                Show
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
            className="w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition font-mono"
          />
          <div id="deepseek-test-status" className="hidden text-[10px] px-2 py-1 rounded border"></div>
          <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none" title="Keep key saved across browser restarts">
              <input type="checkbox" id="remember-deepseek-key" className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer" />
              <span>Remember key</span>
            </label>
            <button type="button" id="clear-deepseek-btn" className="hidden text-rose-400 hover:text-rose-300 transition text-[10px] underline cursor-pointer" title="Clear API key from memory and storage">
              Clear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="deepseek-prompt" className="text-[11px] font-semibold text-slate-300">
              2. Translation Prompt
            </label>
            <button type="button" id="edit-prompt-btn" className="text-[10px] font-medium text-indigo-400 hover:text-indigo-300 transition cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-700/60">
              Edit
            </button>
          </div>
          <textarea
            id="deepseek-prompt"
            rows={2}
            readOnly
            placeholder="Enter translation instructions/prompt for DeepSeek..."
            className="w-full px-2.5 py-1.5 text-xs bg-slate-900/90 border border-slate-700 rounded-md text-slate-300 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition resize-none leading-relaxed cursor-default"
          ></textarea>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs">⏳</span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-200">Rate Limit Cooldown</span>
                <span id="popup-cooldown-badge" className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  3–5m
                </span>
              </div>
              <p className="text-[10px] text-slate-400 truncate">Wait 3–5m between queued translations</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span id="popup-cooldown-toggle-label" className="text-[10px] font-mono font-bold text-amber-400">ON</span>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0" title="Toggle 3-5m randomized cooldown between translated chapters">
              <input type="checkbox" id="popup-cooldown-toggle" className="sr-only peer" defaultChecked />
              <div className="w-8 h-4.5 cooldown-popup-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
