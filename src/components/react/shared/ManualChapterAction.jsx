import React from 'react';

export function canBulkDownload(novel) {
  const registry = typeof window !== 'undefined' ? window.ProviderRegistry : null;
  if (!registry || typeof registry.canBulkDownload !== 'function') return true;
  return registry.canBulkDownload(novel);
}

export default function ManualChapterAction({ chapter, compact = false }) {
  const size = compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';

  if (chapter && chapter.locked) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${size} rounded-md font-semibold text-slate-400 bg-slate-900 border border-slate-700/80`}
        title="Locked (paid) chapter. It cannot be saved."
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden="true">🔒</span>
        <span>Locked</span>
      </span>
    );
  }

  return (
    <a
      href={(chapter && chapter.url) || '#'}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 ${size} rounded-md font-semibold text-indigo-200 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 transition`}
      title="This site can't be downloaded in the background. Open the chapter page and it is saved automatically."
    >
      <span>Open to save</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
