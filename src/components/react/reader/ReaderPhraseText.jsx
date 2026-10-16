import React from 'react';

const NAME_CLASS = 'rounded-sm bg-indigo-500/15 px-0.5 -mx-0.5 border-b border-dotted border-indigo-400/70 hover:bg-indigo-500/25 hover:border-solid cursor-pointer transition';
const WORD_CLASS = 'rounded-sm cursor-pointer transition hover:bg-slate-500/20 hover:underline decoration-dotted underline-offset-4';
const ACTIVE_CLASS = 'bg-amber-400/25 ring-1 ring-amber-400/60';

export default function ReaderPhraseText({ paragraph, activeIndex = -1, activeEnd, onSelect }) {
  const lastActive = typeof activeEnd === 'number' ? activeEnd : activeIndex;
  const text = paragraph ? paragraph.text : '';
  const segments = paragraph && Array.isArray(paragraph.segments) ? paragraph.segments : [];
  const parts = [];
  let last = 0;
  segments.forEach((seg, idx) => {
    if (seg.start > last) parts.push(<React.Fragment key={`t${idx}`}>{text.slice(last, seg.start)}</React.Fragment>);
    const select = (e) => {
      const el = e && e.currentTarget;
      if (el && el.closest && el.closest('[contenteditable="true"]')) return;
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (onSelect) onSelect(seg, idx);
    };
    const active = activeIndex >= 0 && idx >= activeIndex && idx <= lastActive;
    parts.push(
      <span
        key={`p${idx}`}
        role="button"
        tabIndex={0}
        aria-pressed={active ? 'true' : 'false'}
        data-phrase={idx}
        data-source={seg.source}
        title={`${seg.source} · ${seg.reading}`}
        onClick={select}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') select(e); }}
        className={`${seg.origin === 'name' ? NAME_CLASS : WORD_CLASS}${active ? ` ${ACTIVE_CLASS}` : ''}`}
      >
        {text.slice(seg.start, seg.end)}
      </span>
    );
    last = seg.end;
  });
  if (last < text.length) parts.push(<React.Fragment key="tail">{text.slice(last)}</React.Fragment>);
  return <>{parts}</>;
}
