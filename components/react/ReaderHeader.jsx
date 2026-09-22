import React from 'react';

export default function ReaderHeader() {
  return (
    <>
    
    <div
      id="reading-progress-bar"
      className="fixed top-0 left-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500 z-50 transition-all duration-75"
      style={{ width: '0%' }}
    ></div>

    
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-8 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        
        <a
          id="back-to-novel-btn"
          href="library.html"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex-shrink-0"
          title="Return to Novel Chapters"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span className="hidden sm:inline">Back to Novel</span>
        </a>

        
        <div className="flex flex-col items-center text-center overflow-hidden min-w-0 flex-1 px-2">
          <span id="header-novel-title" className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-sm">
            QuickConverter Reader
          </span>
          <span id="header-chapter-title" className="text-xs sm:text-sm font-bold text-slate-200 truncate max-w-[240px] sm:max-w-md">
            Loading chapter...
          </span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          
          <button
            type="button"
            id="toggle-source-drawer-btn"
            className="hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
            title="View Original Raw Source text (S)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
            <span className="hidden sm:inline">Source</span>
          </button>

          
          <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 rounded-md p-0.5">
            <button
              type="button"
              id="font-dec-btn"
              className="px-2 py-1 rounded text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition focus:outline-none cursor-pointer"
              title="Decrease Font Size"
            >
              A-
            </button>
            <span id="font-size-label" className="text-[11px] font-mono font-medium text-indigo-300 px-1 select-none">
              18px
            </span>
            <button
              type="button"
              id="font-inc-btn"
              className="px-2 py-1 rounded text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition focus:outline-none cursor-pointer"
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          
          <div className="relative" id="reader-typography-wrapper">
            <button
              type="button"
              id="toggle-typography-popover-btn"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
              title="Typography & Appearance (T)"
              aria-expanded="false"
              aria-haspopup="true"
            >
              <span className="font-serif font-bold text-sm leading-none text-indigo-400">Aa</span>
              <span className="hidden md:inline">Theme</span>
            </button>

            
            <div
              id="reader-typography-popover"
              className="hidden absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-4 flex flex-col gap-4 z-50"
            >
              
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-bold text-base leading-none text-indigo-400">Aa</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Typography & Appearance</span>
                </div>
                <button
                  type="button"
                  id="close-typography-popover-btn"
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                  title="Close (Esc)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2" strokeLinecap="round"></line>
                    <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" strokeLinecap="round"></line>
                  </svg>
                </button>
              </div>

              
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Theme Preset</span>
                <div className="grid grid-cols-4 gap-2">
                  
                  <button
                    type="button"
                    data-theme-choice="slate"
                    className="in-reader-theme-btn p-2 rounded-lg border-2 border-transparent bg-slate-950 flex flex-col items-center gap-1 text-center transition cursor-pointer hover:border-slate-600"
                    title="Dark Slate Theme"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-[10px] text-slate-200 theme-check">✓</span>
                    <span className="text-[10px] font-semibold text-slate-300">Slate</span>
                  </button>

                  
                  <button
                    type="button"
                    data-theme-choice="oled"
                    className="in-reader-theme-btn p-2 rounded-lg border-2 border-transparent bg-black flex flex-col items-center gap-1 text-center transition cursor-pointer hover:border-zinc-700"
                    title="OLED Midnight Theme"
                  >
                    <span className="w-5 h-5 rounded-full bg-black border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-100 theme-check">✓</span>
                    <span className="text-[10px] font-semibold text-zinc-300">OLED</span>
                  </button>

                  
                  <button
                    type="button"
                    data-theme-choice="sepia"
                    className="in-reader-theme-btn p-2 rounded-lg border-2 border-transparent bg-[#fbf0d9] flex flex-col items-center gap-1 text-center transition cursor-pointer hover:border-amber-500/60"
                    title="Warm Sepia Theme"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#ede0cb] border border-[#d8c4ab] flex items-center justify-center text-[10px] text-[#2d231b] theme-check">✓</span>
                    <span className="text-[10px] font-semibold text-[#2d231b]">Sepia</span>
                  </button>

                  
                  <button
                    type="button"
                    data-theme-choice="forest"
                    className="in-reader-theme-btn p-2 rounded-lg border-2 border-transparent bg-[#0d1712] flex flex-col items-center gap-1 text-center transition cursor-pointer hover:border-emerald-700"
                    title="Forest Night Theme"
                  >
                    <span className="w-5 h-5 rounded-full bg-[#14241c] border border-[#1f3d2c] flex items-center justify-center text-[10px] text-emerald-300 theme-check">✓</span>
                    <span className="text-[10px] font-semibold text-emerald-200">Forest</span>
                  </button>
                </div>
              </div>

              
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Font Size</span>
                  <span id="in-reader-font-val" className="text-xs font-mono font-bold text-indigo-400">18px</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    id="in-reader-font-dec"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer select-none"
                    title="Decrease Font Size"
                  >
                    A-
                  </button>
                  <input
                    type="range"
                    id="in-reader-font-slider"
                    min="14"
                    max="28"
                    defaultValue="18"
                    step="1"
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                  <button
                    type="button"
                    id="in-reader-font-inc"
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer select-none"
                    title="Increase Font Size"
                  >
                    A+
                  </button>
                </div>
              </div>

              
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Font</span>
                <select
                  id="in-reader-font-family"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer transition"
                >
                  <option value="sans" style={{ fontFamily: `ui-sans-serif, system-ui, sans-serif` }}>System Sans (Modern UI)</option>
                  <option value="serif" style={{ fontFamily: `Georgia, serif` }}>Georgia (Classic Literary)</option>
                  <option value="garamond" style={{ fontFamily: `Garamond, serif` }}>Garamond (Book Publisher)</option>
                  <option value="palatino" style={{ fontFamily: `'Palatino Linotype', Palatino, serif` }}>Palatino (Warm Editorial)</option>
                  <option value="charter" style={{ fontFamily: `Charter, Cambria, serif` }}>Charter (Clean Novel Print)</option>
                  <option value="baskerville" style={{ fontFamily: `Baskerville, Georgia, serif` }}>Baskerville (Refined Serif)</option>
                  <option value="times" style={{ fontFamily: `'Times New Roman', Times, serif` }}>Times New Roman (Traditional)</option>
                  <option value="verdana" style={{ fontFamily: `Verdana, sans-serif` }}>Verdana (Spacious Legibility)</option>
                  <option value="trebuchet" style={{ fontFamily: `'Trebuchet MS', sans-serif` }}>Trebuchet MS (Humanist Sans)</option>
                  <option value="unkempt" style={{ fontFamily: `'Unkempt', cursive, sans-serif` }}>Unkempt (Playful & Casual)</option>
                  <option value="patrick-hand" style={{ fontFamily: `'Patrick Hand', cursive, sans-serif` }}>Patrick Hand (Warm Handwriting)</option>
                  <option value="merienda" style={{ fontFamily: `'Merienda', cursive, serif` }}>Merienda (Soft Script)</option>
                  <option value="pangolin" style={{ fontFamily: `'Pangolin', cursive, sans-serif` }}>Pangolin (Playful Handwriting)</option>
                  <option value="playwrite-vn" style={{ fontFamily: `'Playwrite VN', cursive, sans-serif` }}>Playwrite Việt Nam (Cursive)</option>
                  <option value="sedgwick-ave" style={{ fontFamily: `'Sedgwick Ave Display', cursive, sans-serif` }}>Sedgwick Ave Display (Urban Style)</option>
                  <option value="mynerve" style={{ fontFamily: `'Mynerve', cursive, sans-serif` }}>Mynerve (Casual Sketch)</option>
                  <option value="fuzzy-bubbles" style={{ fontFamily: `'Fuzzy Bubbles', cursive, sans-serif` }}>Fuzzy Bubbles (Soft Rounded)</option>
                  <option value="mono" style={{ fontFamily: `ui-monospace, Consolas, monospace` }}>Monospace (Clean Tech)</option>
                </select>
              </div>

              
              <div className="grid grid-cols-2 gap-3">
                
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Line Spacing</span>
                  <div className="popover-btn-group flex rounded-lg bg-slate-950/60 p-1 border border-slate-800 gap-1">
                    <button
                      type="button"
                      data-line-choice="compact"
                      className="in-reader-line-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="1.5x Compact Spacing"
                    >
                      1.5x
                    </button>
                    <button
                      type="button"
                      data-line-choice="relaxed"
                      className="in-reader-line-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="1.75x Relaxed Spacing"
                    >
                      1.75x
                    </button>
                    <button
                      type="button"
                      data-line-choice="spacious"
                      className="in-reader-line-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="2.0x Spacious Spacing"
                    >
                      2.0x
                    </button>
                  </div>
                </div>

                
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Width</span>
                  <div className="popover-btn-group flex rounded-lg bg-slate-950/60 p-1 border border-slate-800 gap-1">
                    <button
                      type="button"
                      data-width-choice="compact"
                      className="in-reader-width-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="Compact (672px)"
                    >
                      S
                    </button>
                    <button
                      type="button"
                      data-width-choice="standard"
                      className="in-reader-width-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="Standard (768px)"
                    >
                      M
                    </button>
                    <button
                      type="button"
                      data-width-choice="wide"
                      className="in-reader-width-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="Wide (896px)"
                    >
                      L
                    </button>
                    <button
                      type="button"
                      data-width-choice="full"
                      className="in-reader-width-btn popover-segment-btn flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer"
                      title="Full Width (1024px)"
                    >
                      XL
                    </button>
                  </div>
                </div>
              </div>

              
              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] popover-subtext text-slate-400">
                <span>Toggle: <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">T</kbd></span>
                <a
                  id="popover-full-settings-link"
                  href="settings.html?from=reader"
                  className="font-medium text-indigo-400 hover:text-indigo-300 transition"
                >
                  All Settings →
                </a>
              </div>
            </div>
          </div>

          
          <a
            id="reader-settings-btn"
            href="settings.html?from=reader"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
            title="Open Reader & AI Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span className="hidden sm:inline">Settings</span>
          </a>
        </div>
      </div>
    </header>
    </>
  );
}
