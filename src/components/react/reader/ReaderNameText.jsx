import React from 'react';

const NAME_CLASS = 'rounded-sm bg-indigo-500/15 px-0.5 -mx-0.5 border-b border-dotted border-indigo-400/70 hover:bg-indigo-500/25 hover:border-solid cursor-pointer transition';

export default function ReaderNameText({ segments = [], highlight = true, onOpenName }) {
  return (
    <>
      {segments.map((seg, i) => (highlight && seg.nameId ? (
        <span
          key={i}
          role="button"
          tabIndex={0}
          title={`View "${seg.original}" in the Name List`}
          onClick={(e) => onOpenName && onOpenName(seg.nameId, e)}
          onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onOpenName) { e.preventDefault(); onOpenName(seg.nameId, e); } }}
          className={NAME_CLASS}
        >
          {seg.text}
        </span>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      )))}
    </>
  );
}
