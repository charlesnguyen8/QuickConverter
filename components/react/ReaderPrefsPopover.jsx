import React, { useEffect, useRef, useState } from 'react';

const READER_PREF_KEYS = {
  fontSize: 'quickconverter_reader_font_size',
  fontFamily: 'quickconverter_reader_font_family',
  lineHeight: 'quickconverter_reader_line_height',
  columnWidth: 'quickconverter_reader_column_width',
  theme: 'quickconverter_reader_theme'
};

const FONTS = [
  ['sans', 'System Sans (Modern UI)', 'ui-sans-serif, system-ui, sans-serif'],
  ['serif', 'Georgia (Classic Literary)', 'Georgia, serif'],
  ['garamond', 'Garamond (Book Publisher)', 'Garamond, serif'],
  ['palatino', 'Palatino (Warm Editorial)', "'Palatino Linotype', Palatino, serif"],
  ['charter', 'Charter (Clean Novel Print)', 'Charter, Cambria, serif'],
  ['baskerville', 'Baskerville (Refined Serif)', 'Baskerville, Georgia, serif'],
  ['times', 'Times New Roman (Traditional)', "'Times New Roman', Times, serif"],
  ['verdana', 'Verdana (Spacious Legibility)', 'Verdana, sans-serif'],
  ['trebuchet', 'Trebuchet MS (Humanist Sans)', "'Trebuchet MS', sans-serif"],
  ['unkempt', 'Unkempt (Playful & Casual)', "'Unkempt', cursive, sans-serif"],
  ['patrick-hand', 'Patrick Hand (Warm Handwriting)', "'Patrick Hand', cursive, sans-serif"],
  ['merienda', 'Merienda (Soft Script)', "'Merienda', cursive, serif"],
  ['pangolin', 'Pangolin (Playful Handwriting)', "'Pangolin', cursive, sans-serif"],
  ['playwrite-vn', 'Playwrite Việt Nam (Cursive)', "'Playwrite VN', cursive, sans-serif"],
  ['sedgwick-ave', 'Sedgwick Ave Display (Urban Style)', "'Sedgwick Ave Display', cursive, sans-serif"],
  ['mynerve', 'Mynerve (Casual Sketch)', "'Mynerve', cursive, sans-serif"],
  ['fuzzy-bubbles', 'Fuzzy Bubbles (Soft Rounded)', "'Fuzzy Bubbles', cursive, sans-serif"],
  ['mono', 'Monospace (Clean Tech)', 'ui-monospace, Consolas, monospace']
];

const THEMES = [
  ['slate', 'Slate', 'Dark Slate Theme', 'bg-slate-950', 'bg-slate-800 border-slate-600', 'text-slate-200', 'text-slate-300', 'hover:border-slate-600'],
  ['oled', 'OLED', 'OLED Midnight Theme', 'bg-black', 'bg-black border-zinc-700', 'text-zinc-100', 'text-zinc-300', 'hover:border-zinc-700'],
  ['sepia', 'Sepia', 'Warm Sepia Theme', 'bg-[#fbf0d9]', 'bg-[#ede0cb] border-[#d8c4ab]', 'text-[#2d231b]', 'text-[#2d231b]', 'hover:border-amber-500/60'],
  ['forest', 'Forest', 'Forest Night Theme', 'bg-[#0d1712]', 'bg-[#14241c] border-[#1f3d2c]', 'text-emerald-300', 'text-emerald-200', 'hover:border-emerald-700']
];

export function readPrefs() {
  if (typeof localStorage === 'undefined') {
    return { fontSize: 18, fontFamily: 'sans', lineHeight: 'relaxed', columnWidth: 'standard', theme: 'slate' };
  }
  return {
    fontSize: parseInt(localStorage.getItem(READER_PREF_KEYS.fontSize), 10) || 18,
    fontFamily: localStorage.getItem(READER_PREF_KEYS.fontFamily) || 'sans',
    lineHeight: localStorage.getItem(READER_PREF_KEYS.lineHeight) || 'relaxed',
    columnWidth: localStorage.getItem(READER_PREF_KEYS.columnWidth) || 'standard',
    theme: localStorage.getItem(READER_PREF_KEYS.theme) || 'slate'
  };
}

export function writePrefs(prefs) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(READER_PREF_KEYS.fontSize, String(prefs.fontSize));
  localStorage.setItem(READER_PREF_KEYS.fontFamily, prefs.fontFamily);
  localStorage.setItem(READER_PREF_KEYS.lineHeight, prefs.lineHeight);
  localStorage.setItem(READER_PREF_KEYS.columnWidth, prefs.columnWidth);
  localStorage.setItem(READER_PREF_KEYS.theme, prefs.theme);
}

export function applyReaderPreferences(prefs) {
  if (typeof document === 'undefined') return;
  const main = document.querySelector('main');
  if (main) {
    main.classList.remove('max-w-2xl', 'max-w-3xl', 'max-w-4xl', 'max-w-5xl');
    if (prefs.columnWidth === 'compact') main.classList.add('max-w-2xl');
    else if (prefs.columnWidth === 'wide') main.classList.add('max-w-4xl');
    else if (prefs.columnWidth === 'full') main.classList.add('max-w-5xl');
    else main.classList.add('max-w-3xl');
  }
  document.body.setAttribute('data-theme', prefs.theme);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('reader-prefs-updated'));
  }
}

function readerSettingsHref() {
  if (typeof window === 'undefined' || !window.location) return 'settings.html?from=reader';
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const ch = params.get('ch');
  if (id && ch) {
    return `settings.html?from=reader&id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`;
  }
  return 'settings.html?from=reader';
}

function clampSize(value) {
  return Math.max(14, Math.min(28, value));
}

function useReaderPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);

  const update = (patch) => {
    const next = { ...readPrefs(), ...patch };
    setPrefs(next);
    writePrefs(next);
    applyReaderPreferences(next);
  };

  useEffect(() => {
    applyReaderPreferences(prefs);
  }, []);

  return [prefs, update];
}

export default function ReaderPrefsPopover() {
  const [prefs, update] = useReaderPrefs();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const close = () => setOpen(false);
    window.addEventListener('reader-toggle-typography', toggle);
    window.addEventListener('reader-close-typography', close);
    return () => {
      window.removeEventListener('reader-toggle-typography', toggle);
      window.removeEventListener('reader-close-typography', close);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const settingsHref = readerSettingsHref();

  return (
    <>
      <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 rounded-md p-0.5">
        <button
          type="button"
          id="font-dec-btn"
          onClick={() => update({ fontSize: clampSize(prefs.fontSize - 2) })}
          className="px-2 py-1 rounded text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition focus:outline-none cursor-pointer"
          title="Decrease Font Size"
        >
          A-
        </button>
        <span id="font-size-label" className="text-[11px] font-mono font-medium text-indigo-300 px-1 select-none">
          {prefs.fontSize}px
        </span>
        <button
          type="button"
          id="font-inc-btn"
          onClick={() => update({ fontSize: clampSize(prefs.fontSize + 2) })}
          className="px-2 py-1 rounded text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition focus:outline-none cursor-pointer"
          title="Increase Font Size"
        >
          A+
        </button>
      </div>

      <div className="relative" id="reader-typography-wrapper" ref={wrapperRef}>
        <button
          type="button"
          id="toggle-typography-popover-btn"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          title="Typography & Appearance (T)"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <span className="font-serif font-bold text-sm leading-none text-indigo-400">Aa</span>
          <span className="hidden md:inline">Theme</span>
        </button>

        <div
          id="reader-typography-popover"
          className={`${open ? '' : 'hidden '}absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-4 flex flex-col gap-4 z-50`}
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-base leading-none text-indigo-400">Aa</span>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Typography &amp; Appearance</span>
            </div>
            <button
              type="button"
              id="close-typography-popover-btn"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
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
              {THEMES.map(([value, label, title, bg, dot, dotText, labelText, hover]) => {
                const active = prefs.theme === value;
                return (
                  <button
                    key={value}
                    type="button"
                    data-theme-choice={value}
                    onClick={() => update({ theme: value })}
                    className={`in-reader-theme-btn ${active ? 'active ' : ''}p-2 rounded-lg border-2 border-transparent ${bg} flex flex-col items-center gap-1 text-center transition cursor-pointer ${hover}`}
                    title={title}
                  >
                    <span
                      className={`w-5 h-5 rounded-full border ${dot} flex items-center justify-center text-[10px] ${dotText} theme-check`}
                      style={{ opacity: active ? 1 : 0 }}
                    >
                      ✓
                    </span>
                    <span className={`text-[10px] font-semibold ${labelText}`}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Font Size</span>
              <span id="in-reader-font-val" className="text-xs font-mono font-bold text-indigo-400">{prefs.fontSize}px</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="in-reader-font-dec"
                onClick={() => update({ fontSize: clampSize(prefs.fontSize - 1) })}
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
                value={prefs.fontSize}
                step="1"
                onChange={(e) => update({ fontSize: clampSize(parseInt(e.target.value, 10) || 18) })}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <button
                type="button"
                id="in-reader-font-inc"
                onClick={() => update({ fontSize: clampSize(prefs.fontSize + 1) })}
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
              value={prefs.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs font-medium text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer transition"
            >
              {FONTS.map(([value, label, css]) => (
                <option key={value} value={value} style={{ fontFamily: css }}>{label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Line Spacing</span>
              <div className="popover-btn-group flex rounded-lg bg-slate-950/60 p-1 border border-slate-800 gap-1">
                {[['compact', '1.5x', '1.5x Compact Spacing'], ['relaxed', '1.75x', '1.75x Relaxed Spacing'], ['spacious', '2.0x', '2.0x Spacious Spacing']].map(([value, label, title]) => (
                  <button
                    key={value}
                    type="button"
                    data-line-choice={value}
                    onClick={() => update({ lineHeight: value })}
                    className={`in-reader-line-btn popover-segment-btn ${prefs.lineHeight === value ? 'active ' : ''}flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer`}
                    title={title}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider popover-subtext text-slate-400">Width</span>
              <div className="popover-btn-group flex rounded-lg bg-slate-950/60 p-1 border border-slate-800 gap-1">
                {[['compact', 'S', 'Compact (672px)'], ['standard', 'M', 'Standard (768px)'], ['wide', 'L', 'Wide (896px)'], ['full', 'XL', 'Full Width (1024px)']].map(([value, label, title]) => (
                  <button
                    key={value}
                    type="button"
                    data-width-choice={value}
                    onClick={() => update({ columnWidth: value })}
                    className={`in-reader-width-btn popover-segment-btn ${prefs.columnWidth === value ? 'active ' : ''}flex-1 py-1.5 px-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center cursor-pointer`}
                    title={title}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] popover-subtext text-slate-400">
            <span>Toggle: <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">T</kbd></span>
            <a
              id="popover-full-settings-link"
              href={settingsHref}
              className="font-medium text-indigo-400 hover:text-indigo-300 transition"
            >
              All Settings →
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
