import React from 'react';

export function ConversionModeToggle({ checked = false, disabled = false, onChange }) {
  return (
    <button
      id="conversion-mode-toggle"
      type="button"
      role="switch"
      aria-checked={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => { if (!disabled && onChange) onChange(!checked); }}
      title="Reader shows chapters converted from the original Chinese with your name list, glossaries and Hán Việt readings"
      className={`inline-flex items-center gap-2 min-h-10 px-3 rounded-md text-xs font-medium border transition ${checked ? 'text-emerald-200 bg-emerald-500/15 border-emerald-500/30' : 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700'}${disabled ? ' opacity-50 cursor-not-allowed' : ' cursor-pointer'}`}
    >
      <span className={`relative inline-block w-8 h-4 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${checked ? 'left-4' : 'left-0.5'}`} />
      </span>
      <span>Dictionary conversion</span>
    </button>
  );
}

export default ConversionModeToggle;
