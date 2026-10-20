import React from 'react';

export function ChapterAccessBadge({ chapter, compact = false }) {
  if (!chapter || typeof chapter.locked !== 'boolean') return null;
  const size = compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  if (chapter.locked) {
    return (
      <span
        data-chapter-access="paid"
        className={`inline-flex items-center gap-1 flex-shrink-0 ${size} rounded font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30`}
        title="Paid chapter: it must be unlocked with coins on the site."
      >
        <span aria-hidden="true">🔒</span>
        <span>Paid</span>
      </span>
    );
  }
  return (
    <span
      data-chapter-access="free"
      className={`inline-flex items-center flex-shrink-0 ${size} rounded font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30`}
      title="Free chapter"
    >
      Free
    </span>
  );
}
