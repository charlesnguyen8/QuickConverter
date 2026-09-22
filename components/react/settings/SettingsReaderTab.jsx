import React, { useState } from 'react';

const FONT_KEY = 'quickconverter_reader_font_family';
const WIDTH_KEY = 'quickconverter_reader_column_width';
const SIZE_KEY = 'quickconverter_reader_font_size';
const LINE_KEY = 'quickconverter_reader_line_height';
const THEME_KEY = 'quickconverter_reader_theme';

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
  ['slate', 'Dark Slate', 'Default theme', 'bg-slate-700 border-slate-600', 'text-slate-100', 'bg-slate-900', 'text-slate-100', 'border-indigo-500 border-2'],
  ['oled', 'OLED Black', 'Pure black battery saver', 'bg-black border-zinc-700', 'text-zinc-100', 'bg-black', 'text-zinc-100', 'border-slate-500'],
  ['sepia', 'Warm Sepia', 'Soft novel book feel', 'bg-[#fbf0d9] border-amber-600', 'text-[#e6d5be]', 'bg-[#241e17]', 'text-[#e6d5be]', 'border-amber-700/60'],
  ['forest', 'Forest Night', 'Calm green hue', 'bg-[#132e20] border-emerald-600', 'text-emerald-100', 'bg-[#0d1712]', 'text-emerald-100', 'border-emerald-700/60']
];

function resolveFontFamilyCss(fontKey) {
  switch (fontKey) {
    case 'serif':
    case 'georgia': return 'Georgia, Cambria, "Times New Roman", Times, serif';
    case 'garamond': return 'Garamond, "EB Garamond", "Baskerville", "Times New Roman", serif';
    case 'palatino': return '"Palatino Linotype", Palatino, "Book Antiqua", "URW Palladio L", Georgia, serif';
    case 'charter': return 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif';
    case 'baskerville': return 'Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, serif';
    case 'times': return '"Times New Roman", Times, Georgia, serif';
    case 'verdana': return 'Verdana, Geneva, "DejaVu Sans", sans-serif';
    case 'trebuchet': return '"Trebuchet MS", "Lucida Grande", "Lucida Sans Unicode", sans-serif';
    case 'unkempt': return "'Unkempt', cursive, sans-serif";
    case 'patrick-hand': return "'Patrick Hand', cursive, sans-serif";
    case 'merienda': return "'Merienda', cursive, serif";
    case 'pangolin': return "'Pangolin', cursive, sans-serif";
    case 'playwrite-vn': return "'Playwrite VN', cursive, sans-serif";
    case 'sedgwick-ave': return "'Sedgwick Ave Display', cursive, sans-serif";
    case 'mynerve': return "'Mynerve', cursive, sans-serif";
    case 'fuzzy-bubbles': return "'Fuzzy Bubbles', cursive, sans-serif";
    case 'mono': return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Cascadia Code", "Courier New", monospace';
    case 'sans':
    default: return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  }
}

function readPrefs() {
  if (typeof localStorage === 'undefined') return { fontFamily: 'sans', columnWidth: 'standard', fontSize: 18, lineHeight: 'relaxed', theme: 'slate' };
  return {
    fontFamily: localStorage.getItem(FONT_KEY) || 'sans',
    columnWidth: localStorage.getItem(WIDTH_KEY) || 'standard',
    fontSize: parseInt(localStorage.getItem(SIZE_KEY), 10) || 18,
    lineHeight: localStorage.getItem(LINE_KEY) || 'relaxed',
    theme: localStorage.getItem(THEME_KEY) || 'slate'
  };
}

export default function SettingsReaderTab() {
  const [prefs, setPrefs] = useState(readPrefs);

  const update = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FONT_KEY, next.fontFamily);
      localStorage.setItem(WIDTH_KEY, next.columnWidth);
      localStorage.setItem(SIZE_KEY, String(next.fontSize));
      localStorage.setItem(LINE_KEY, next.lineHeight);
      localStorage.setItem(THEME_KEY, next.theme);
    }
  };

  const reset = () => update({ fontFamily: 'sans', columnWidth: 'standard', fontSize: 18, lineHeight: 'relaxed', theme: 'slate' });
  const setSize = (v) => update({ fontSize: Math.max(14, Math.min(28, v)) });

  const themeDef = THEMES.find((t) => t[0] === prefs.theme) || THEMES[0];
  const previewContainerClass = `w-full rounded-xl p-6 sm:p-8 border border-slate-700/60 transition-all duration-150 shadow-md ${themeDef[5]} ${themeDef[6]}`;
  const lh = prefs.lineHeight === 'compact' ? 1.5 : (prefs.lineHeight === 'spacious' ? 2.0 : 1.75);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>📖</span>
          <span>Reader Typography &amp; Appearance</span>
        </h2>
        <p className="text-xs text-slate-400">
          Customize your default reading environment. Changes reflect instantly below in the live preview.
        </p>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300">Font</label>
          <select
            id="reader-font-family"
            value={prefs.fontFamily}
            onChange={(e) => update({ fontFamily: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          >
            {FONTS.map(([value, label, css]) => (
              <option key={value} value={value} style={{ fontFamily: css }}>{label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300">Column Width</label>
          <select
            id="reader-column-width"
            value={prefs.columnWidth}
            onChange={(e) => update({ columnWidth: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          >
            <option value="compact">Compact (672px)</option>
            <option value="standard">Standard (768px)</option>
            <option value="wide">Wide (896px)</option>
            <option value="full">Full Width (1024px)</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-300">Font Size</label>
            <span id="font-size-val" className="text-xs font-mono font-bold text-indigo-400">{prefs.fontSize}px</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" id="font-size-dec" onClick={() => setSize(prefs.fontSize - 1)} className="px-2.5 py-1 rounded bg-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-600 transition cursor-pointer">-</button>
            <input
              type="range"
              id="reader-font-size"
              min="14"
              max="28"
              step="1"
              value={prefs.fontSize}
              onChange={(e) => setSize(parseInt(e.target.value, 10) || 18)}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <button type="button" id="font-size-inc" onClick={() => setSize(prefs.fontSize + 1)} className="px-2.5 py-1 rounded bg-slate-700 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-600 transition cursor-pointer">+</button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300">Line Spacing</label>
          <select
            id="reader-line-height"
            value={prefs.lineHeight}
            onChange={(e) => update({ lineHeight: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          >
            <option value="compact">Compact (1.5x)</option>
            <option value="relaxed">Relaxed (1.75x)</option>
            <option value="spacious">Spacious (2.0x)</option>
          </select>
        </div>

        <div className="sm:col-span-2 flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300">Reading Theme Preset</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {THEMES.map(([value, label, sub, dot, textCls, , , activeBorder]) => {
              const active = prefs.theme === value;
              const border = active ? activeBorder : 'border-slate-700 hover:border-slate-500';
              const bg = value === 'slate' ? 'bg-slate-900' : (value === 'oled' ? 'bg-black' : (value === 'sepia' ? 'bg-[#241e17]' : 'bg-[#0d1712]'));
              return (
                <button
                  key={value}
                  type="button"
                  data-theme={value}
                  onClick={() => update({ theme: value })}
                  className={`theme-picker-btn p-3 rounded-xl border ${border} ${bg} flex flex-col gap-1 text-left transition cursor-pointer`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${textCls}`}>{label}</span>
                    <span className={`w-3 h-3 rounded-full border ${dot}`} />
                  </div>
                  <span className="text-[11px] text-slate-400">{sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Interactive Preview</span>
          <button type="button" id="reset-reader-defaults-btn" onClick={reset} className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition cursor-pointer">Reset Reader Defaults</button>
        </div>

        <div id="typography-preview-container" className={previewContainerClass}>
          <div className="max-w-xl mx-auto flex flex-col gap-4">
            <span className="text-xs font-bold tracking-wider uppercase text-indigo-400">Chapter 1: The Transmigrator's Journey</span>
            <div
              id="typography-preview-text"
              className="flex flex-col gap-3"
              style={{ fontFamily: resolveFontFamilyCss(prefs.fontFamily), fontSize: `${prefs.fontSize}px`, lineHeight: lh }}
            >
              <p>When Lin Chen opened his eyes, the morning sun poured through the paper lattice window, illuminating dusty specks that danced lazily in the autumn draft.</p>
              <p>He took a steady breath, sensing the faint resonance of spiritual qi circulating through his meridians. A translucent system interface blinked quietly into view: <em>[QuickConverter Active — DeepSeek Translation Engaged]</em>.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
