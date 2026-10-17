import React from 'react';

export function canBulkDownload(novel) {
  const registry = typeof window !== 'undefined' ? window.ProviderRegistry : null;
  if (!registry || typeof registry.canBulkDownload !== 'function') return true;
  return registry.canBulkDownload(novel);
}

export function handleOpenToSave(event, url, storage = typeof window !== 'undefined' ? window.StorageService : null) {
  event.stopPropagation();
  const modified = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button === 1;
  if (!url || modified || !storage || typeof storage.openChapterInBackground !== 'function') return;
  if (storage.openChapterInBackground(url)) event.preventDefault();
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
    ? 'Paid chapter. Unlock it on the site first. Opens in a background tab, read with OCR and saved, then the tab closes.'
    : "Opens the chapter page in a background tab; it is saved automatically and the tab closes.";

  return (
    <a
      href={(chapter && chapter.url) || '#'}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => handleOpenToSave(e, chapter && chapter.url)}
      className={`inline-flex items-center gap-1 ${size} rounded-md font-semibold text-indigo-200 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 transition`}
      title={title}
    >
      <span>Open to save</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
