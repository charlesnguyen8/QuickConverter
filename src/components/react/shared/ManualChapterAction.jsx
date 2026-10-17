import React from 'react';

export function canBulkDownload(novel) {
  const registry = typeof window !== 'undefined' ? window.ProviderRegistry : null;
  if (!registry || typeof registry.canBulkDownload !== 'function') return true;
  return registry.canBulkDownload(novel);
}

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

export default function ManualChapterAction({ chapter, compact = false }) {
  const size = compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';
  const title = chapter && chapter.locked
    ? 'Paid chapter. Unlock it on the site, then open the chapter page and it is read with OCR and saved automatically.'
    : "This site can't be downloaded in the background. Open the chapter page and it is saved automatically.";

  return (
    <a
      href={(chapter && chapter.url) || '#'}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 ${size} rounded-md font-semibold text-indigo-200 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 transition`}
      title={title}
    >
      <span>Open to save</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
